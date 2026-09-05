require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const db = require("./db");
const SQLiteSessionStore = require("./session-store");
const { getKey, encrypt, decrypt } = require("./crypto");
const { resolveAdminUser, csrfTokensMatch } = require("./api-guards");
const {
  shouldTrustProxy,
  requiresHttpsBaseUrl,
  buildSessionOptions,
  buildSessionCookieOptions,
  isValidOauthCallback,
  oauthStatesMatch
} = require("./session-config");
const {
  buildOauthStartDiagnostics,
  buildOauthCallbackDiagnostics,
  logOauthDiagnostic,
  lookupSessionStore,
  onResponseHeaders
} = require("./oauth-diagnostics");
const { findLeadStatusColumn, findLeadStatusColumnIndex } = require("./sheet-data");
const { planLeadStatusUpdate, planLeadStatusColumnCreate } = require("./lead-status-ops");
const { buildSyncSnapshot, compareSheetToSnapshot, syncInProgressGuard } = require("./sync-snapshot");
const {
  getAuthUrl, exchangeCode, clientFromRefreshToken, getGoogleProfile,
  listSpreadsheets, getTabs, readSheet, writeLeadStatus, createLeadStatusColumn
} = require("./google");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === "production";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const projectSyncGuard = syncInProgressGuard();

function requireEnvironment(name) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

requireEnvironment("SESSION_SECRET");
requireEnvironment("GOOGLE_CLIENT_ID");
requireEnvironment("GOOGLE_CLIENT_SECRET");
requireEnvironment("GOOGLE_REDIRECT_URI");
requireEnvironment("TOKEN_ENCRYPTION_KEY");
requireEnvironment("ADMIN_EMAIL");
getKey();

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(BASE_URL);
} catch {
  throw new Error("BASE_URL must be an absolute URL.");
}
if (requiresHttpsBaseUrl() && parsedBaseUrl.protocol !== "https:") {
  throw new Error("BASE_URL must use HTTPS in production.");
}

app.disable("x-powered-by");
const trustProxy = shouldTrustProxy();
app.set("trust proxy", trustProxy ? 1 : false);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(async (req, res, next) => {
  try {
    await db.ready;
    next();
  } catch (err) {
    next(err);
  }
});
const sessionStore = new SQLiteSessionStore(db);
app.use(session(buildSessionOptions({
  isProduction,
  secret: process.env.SESSION_SECRET,
  store: sessionStore
})));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function randomValue() {
  return crypto.randomBytes(32).toString("base64url");
}

function safeReturnTo(value) {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return "/";
  try {
    const destination = new URL(value, BASE_URL);
    const decodedPath = decodeURIComponent(destination.pathname);
    if (destination.origin !== parsedBaseUrl.origin || decodedPath.startsWith("//") || decodedPath.includes("\\")) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

function currentUser(req) {
  if (!req.session.userId) return Promise.resolve(null);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId).then(user => user || null);
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    const access = resolveAdminUser(user, ADMIN_EMAIL);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function csrfProtection(req, res, next) {
  if (!csrfTokensMatch(req.session.csrfToken, req.get("x-csrf-token"))) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }
  next();
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = randomValue();
  return req.session.csrfToken;
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
}

function googleClientForUser(user) {
  if (!user.refresh_token_enc) {
    const error = new Error("Google authorization is missing.");
    error.code = "GOOGLE_RECONNECT_REQUIRED";
    throw error;
  }
  return clientFromRefreshToken(decrypt(user.refresh_token_enc));
}

function parseColumns(columnsJson) {
  try {
    const columns = JSON.parse(columnsJson || "[]");
    return Array.isArray(columns) ? columns : [];
  } catch {
    return [];
  }
}

function sanitizeProject(row) {
  return {
    id: row.id, name: row.name, sheetName: row.sheet_title, spreadsheetId: row.spreadsheet_id,
    spreadsheetName: row.spreadsheet_name, sheetId: row.sheet_id, columns: parseColumns(row.columns_json),
    lastSync: row.last_sync || null
  };
}

function projectWithLeads(row, data) {
  const columns = data.columns || [];
  return {
    ...sanitizeProject(row),
    leads: data.leads || [],
    rowNumbers: data.rowNumbers || [],
    leadStatusColumn: findLeadStatusColumn(columns),
    leadStatusColumnIndex: findLeadStatusColumnIndex(columns)
  };
}

async function loadUserProject(projectId, userId) {
  return await db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId) || null;
}

async function refreshProjectLeads(user, project, { touchLastSync = false } = {}) {
  const data = await readSheet(googleClientForUser(user), project.spreadsheet_id, project.sheet_title);
  if (touchLastSync) {
    await db.prepare("UPDATE projects SET columns_json = ?, last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(data.columns), project.id, user.id);
  } else {
    await db.prepare("UPDATE projects SET columns_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(data.columns), project.id, user.id);
  }
  const fresh = await loadUserProject(project.id, user.id);
  return projectWithLeads(fresh, data);
}

async function assertProjectTabExists(client, project) {
  if (!project.spreadsheet_id || !project.sheet_title) {
    const error = new Error("Project spreadsheet configuration is invalid.");
    error.code = "INVALID_PROJECT_CONFIG";
    throw error;
  }
  const tabs = await getTabs(client, project.spreadsheet_id);
  const tab = tabs.find(item =>
    String(item.sheetId) === String(project.sheet_id) && item.title === project.sheet_title
  );
  if (!tab) {
    const error = new Error("Configured sheet tab was not found.");
    error.code = "SHEET_TAB_MISSING";
    throw error;
  }
  return tab;
}

async function syncUserProject(user, project) {
  const client = googleClientForUser(user);
  await assertProjectTabExists(client, project);
  const data = await readSheet(client, project.spreadsheet_id, project.sheet_title);
  const comparison = compareSheetToSnapshot(
    project.sync_snapshot_json,
    data.columns,
    data.leads,
    data.rowNumbers
  );
  await db.prepare(`UPDATE projects
    SET columns_json = ?, sync_snapshot_json = ?, last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?`)
    .run(JSON.stringify(data.columns), JSON.stringify(comparison.snapshot), project.id, user.id);
  const fresh = await loadUserProject(project.id, user.id);
  return {
    project: projectWithLeads(fresh, data),
    sync: {
      newLeads: comparison.newLeads,
      changedLeads: comparison.changedLeads,
      totalLeads: comparison.totalLeads,
      newRowNumbers: comparison.newRowNumbers,
      changedRowNumbers: comparison.changedRowNumbers,
      message: comparison.message,
      lastSync: fresh.last_sync
    }
  };
}

function sendSyncError(res, context, err) {
  logError(context, err);
  if (err?.code === "INVALID_PROJECT_CONFIG") {
    return res.status(400).json({ error: "Project spreadsheet configuration is invalid." });
  }
  if (err?.code === "SHEET_TAB_MISSING") {
    return res.status(400).json({ error: "Configured sheet tab was not found. Reconnect the spreadsheet tab." });
  }
  return sendGoogleError(res, context, err);
}

function isSpreadsheetId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateProjectInput(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : "";
  const sheetTitle = typeof body.sheetTitle === "string" ? body.sheetTitle.trim() : "";
  const sheetId = Number(body.sheetId);
  if (!name || name.length > 120) return { error: "Project name must be between 1 and 120 characters." };
  if (!isSpreadsheetId(spreadsheetId)) return { error: "Invalid spreadsheet selection." };
  if (!sheetTitle || sheetTitle.length > 200 || !Number.isSafeInteger(sheetId) || sheetId < 0) {
    return { error: "Invalid sheet selection." };
  }
  return { value: { name, spreadsheetId, sheetId, sheetTitle } };
}

function logError(context, err) {
  console.error(context, { code: err?.code || err?.response?.status || "unknown", name: err?.name || "Error" });
}

function sendGoogleError(res, context, err) {
  logError(context, err);
  const status = err?.code === "GOOGLE_RECONNECT_REQUIRED" || err?.code === 401 || err?.response?.status === 401 ? 401 : 502;
  return res.status(status).json({ error: status === 401
    ? "Google authorization has expired. Please reconnect Google."
    : "Google service is temporarily unavailable. Please try again." });
}

/* -------------------- AUTH -------------------- */

app.get("/api/auth/google", async (req, res, next) => {
  try {
    const state = randomValue();
    req.session.oauthState = state;
    req.session.oauthReturnTo = safeReturnTo(req.query.returnTo);
    let saveSucceeded = false;
    try {
      await saveSession(req);
      saveSucceeded = true;
    } catch (saveErr) {
      logOauthDiagnostic(buildOauthStartDiagnostics({
        req,
        res,
        isProduction,
        expectedHost: parsedBaseUrl.host,
        saveSucceeded: false,
        oauthStateGenerated: true,
        sessionId: req.sessionID,
        oauthState: state,
        cookieIntended: buildSessionCookieOptions(isProduction)
      }));
      throw saveErr;
    }

    // express-session writes Set-Cookie when headers are sent; inspect then.
    onResponseHeaders(res, () => {
      logOauthDiagnostic(buildOauthStartDiagnostics({
        req,
        res,
        isProduction,
        expectedHost: parsedBaseUrl.host,
        saveSucceeded,
        oauthStateGenerated: true,
        sessionId: req.sessionID,
        oauthState: state,
        cookieIntended: buildSessionCookieOptions(isProduction)
      }));
    });
    res.redirect(getAuthUrl(state));
  } catch (err) {
    next(err);
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const requestState = req.query.state;
  const sessionState = req.session.oauthState;
  const statesMatch = oauthStatesMatch(requestState, sessionState);
  const storeLookupSucceeded = await lookupSessionStore(sessionStore, req.sessionID);
  logOauthDiagnostic(buildOauthCallbackDiagnostics({
    req,
    isProduction,
    expectedHost: parsedBaseUrl.host,
    requestState,
    sessionState,
    statesMatch,
    storeLookupSucceeded
  }));

  if (!isValidOauthCallback({
    code: req.query.code,
    requestState,
    sessionState
  })) {
    delete req.session.oauthState;
    return res.status(400).send("Invalid OAuth request. Please try again.");
  }
  const returnTo = safeReturnTo(req.session.oauthReturnTo);
  delete req.session.oauthState;
  delete req.session.oauthReturnTo;

  try {
    const { client, tokens } = await exchangeCode(String(req.query.code));
    const profile = await getGoogleProfile(client);
    if (!profile.email || profile.email.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).send("This Google account is not authorized.");
    }

    const existing = await db.prepare("SELECT * FROM users WHERE google_sub = ?").get(profile.id);
    let userId;
    if (existing) {
      userId = existing.id;
      if (tokens.refresh_token) {
        await db.prepare("UPDATE users SET email = ?, name = ?, picture = ?, refresh_token_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(profile.email, profile.name || "", profile.picture || "", encrypt(tokens.refresh_token), userId);
      } else {
        await db.prepare("UPDATE users SET email = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(profile.email, profile.name || "", profile.picture || "", userId);
      }
    } else {
      if (!tokens.refresh_token) return res.status(400).send("Google did not provide long-term access. Reconnect the application and try again.");
      const result = await db.prepare("INSERT INTO users (google_sub, email, name, picture, refresh_token_enc) VALUES (?, ?, ?, ?, ?)")
        .run(profile.id, profile.email, profile.name || "", profile.picture || "", encrypt(tokens.refresh_token));
      userId = result.lastInsertRowid;
    }

    await regenerateSession(req);
    req.session.userId = Number(userId);
    await saveSession(req);
    res.redirect(returnTo);
  } catch (err) {
    logError("OAuth callback failed", err);
    res.status(500).send("Google authorization failed. Please try again.");
  }
});

app.get("/api/auth/me", async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: { id: user.id, name: user.name, email: user.email, picture: user.picture } });
  } catch (err) {
    next(err);
  }
});

app.get("/api/csrf", requireAuth, (req, res) => {
  res.json({ csrfToken: csrfToken(req) });
});

app.post("/api/auth/logout", csrfProtection, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("lead_admin_sid");
    res.json({ ok: true });
  });
});

/* -------------------- GOOGLE SHEETS -------------------- */

app.get("/api/sheets", requireAuth, async (req, res) => {
  try {
    res.json({ spreadsheets: await listSpreadsheets(googleClientForUser(req.user)) });
  } catch (err) {
    sendGoogleError(res, "Unable to list spreadsheets", err);
  }
});

app.get("/api/sheets/:spreadsheetId/tabs", requireAuth, async (req, res) => {
  if (!isSpreadsheetId(req.params.spreadsheetId)) return res.status(400).json({ error: "Invalid spreadsheet selection." });
  try {
    res.json({ tabs: await getTabs(googleClientForUser(req.user), req.params.spreadsheetId) });
  } catch (err) {
    sendGoogleError(res, "Unable to list sheet tabs", err);
  }
});

/* -------------------- PROJECTS -------------------- */

app.get("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const rows = await db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(req.user.id);
    res.json({ projects: rows.map(sanitizeProject) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects", requireAuth, csrfProtection, async (req, res) => {
  const validated = validateProjectInput(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });
  try {
    const { name, spreadsheetId, sheetId, sheetTitle } = validated.value;
    const client = googleClientForUser(req.user);
    const tabs = await getTabs(client, spreadsheetId);
    const tab = tabs.find(item => String(item.sheetId) === String(sheetId) && item.title === sheetTitle);
    if (!tab) return res.status(400).json({ error: "Selected sheet was not found." });
    const existing = await db.prepare("SELECT id FROM projects WHERE user_id = ? AND spreadsheet_id = ? AND sheet_id = ?")
      .get(req.user.id, spreadsheetId, tab.sheetId);
    if (existing) return res.status(409).json({ error: "This spreadsheet tab is already connected as a project." });
    const spreadsheet = (await listSpreadsheets(client)).find(item => item.id === spreadsheetId);
    const data = await readSheet(client, spreadsheetId, tab.title);
    const snapshot = buildSyncSnapshot(data.columns, data.leads, data.rowNumbers);
    await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, spreadsheet_name, sheet_id, sheet_title, columns_json, sync_snapshot_json, last_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .run(
        req.user.id,
        name,
        spreadsheetId,
        spreadsheet ? spreadsheet.name : "",
        tab.sheetId,
        tab.title,
        JSON.stringify(data.columns),
        JSON.stringify(snapshot)
      );
    const project = await db.prepare("SELECT * FROM projects WHERE user_id = ? AND spreadsheet_id = ? AND sheet_id = ?")
      .get(req.user.id, spreadsheetId, tab.sheetId);
    // Lead values remain in Google Sheets. The creation response only returns configuration.
    res.status(201).json({ project: sanitizeProject(project) });
  } catch (err) {
    sendGoogleError(res, "Unable to create project", err);
  }
});

app.delete("/api/projects/:id", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid project id." });
    const result = await db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: "Project not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/projects/:id/leads", requireAuth, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadUserProject(id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  try {
    res.json(await refreshProjectLeads(req.user, project));
  } catch (err) {
    sendGoogleError(res, "Unable to fetch leads", err);
  }
});

app.patch("/api/projects/:id/leads/:rowNumber/status", requireAuth, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadUserProject(id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });

  try {
    const client = googleClientForUser(req.user);
    const sheetData = await readSheet(client, project.spreadsheet_id, project.sheet_title);
    const planned = planLeadStatusUpdate({
      project,
      sheetData,
      rowNumber: req.params.rowNumber,
      status: req.body?.status
    });
    if (planned.error) return res.status(planned.statusCode).json({ error: planned.error });

    const { spreadsheetId, sheetTitle, columnIndex, rowNumber, status } = planned.value;
    await writeLeadStatus(client, spreadsheetId, sheetTitle, columnIndex, rowNumber, status);
    res.json({
      ok: true,
      rowNumber,
      status,
      project: await refreshProjectLeads(req.user, project)
    });
  } catch (err) {
    sendGoogleError(res, "Unable to update lead status", err);
  }
});

app.post("/api/projects/:id/lead-status-column", requireAuth, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadUserProject(id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });

  try {
    const client = googleClientForUser(req.user);
    const sheetData = await readSheet(client, project.spreadsheet_id, project.sheet_title);
    const planned = planLeadStatusColumnCreate({ project, sheetData });
    if (planned.error) return res.status(planned.statusCode).json({ error: planned.error });

    const { spreadsheetId, sheetTitle, columnIndex, rowNumbers, defaultStatus } = planned.value;
    await createLeadStatusColumn(client, spreadsheetId, sheetTitle, columnIndex, rowNumbers, defaultStatus);
    res.status(201).json({
      ok: true,
      project: await refreshProjectLeads(req.user, project)
    });
  } catch (err) {
    sendGoogleError(res, "Unable to add Lead Status column", err);
  }
});

/* -------------------- SYNC -------------------- */

app.post("/api/projects/:id/sync", requireAuth, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadUserProject(id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  if (!projectSyncGuard.tryBegin(id)) {
    return res.status(409).json({ error: "Sync already in progress for this project." });
  }
  try {
    const result = await syncUserProject(req.user, project);
    res.json({ ok: true, ...result });
  } catch (err) {
    sendSyncError(res, "Unable to sync project", err);
  } finally {
    projectSyncGuard.end(id);
  }
});

app.post("/api/sync", requireAuth, csrfProtection, async (req, res) => {
  try {
    const projects = await db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(req.user.id);
    const updated = [];
    for (const project of projects) {
      if (!projectSyncGuard.tryBegin(project.id)) {
        updated.push({ id: project.id, name: project.name, error: "Sync already in progress for this project." });
        continue;
      }
      try {
        const result = await syncUserProject(req.user, project);
        updated.push({
          id: project.id,
          name: project.name,
          leads: result.sync.totalLeads,
          columns: result.project.columns,
          lastSync: result.sync.lastSync,
          newLeads: result.sync.newLeads,
          changedLeads: result.sync.changedLeads,
          message: result.sync.message
        });
      } catch (err) {
        logError(`Unable to sync project ${project.id}`, err);
        updated.push({ id: project.id, name: project.name, error: "Unable to sync this project." });
      } finally {
        projectSyncGuard.end(project.id);
      }
    }
    res.json({ ok: true, projects: updated });
  } catch (err) {
    sendGoogleError(res, "Unable to sync projects", err);
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "lead-admin-backend", time: new Date().toISOString() });
});

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logError("Unhandled request error", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

async function start() {
  await db.ready;
  if (require.main === module) {
    app.listen(PORT, () => console.log(`Lead Admin running at ${BASE_URL}`));
  }
}

start().catch(err => {
  console.error("Failed to start Lead Admin", { name: err?.name || "Error", code: err?.code || "unknown" });
  if (require.main === module) process.exit(1);
});

module.exports = app;
