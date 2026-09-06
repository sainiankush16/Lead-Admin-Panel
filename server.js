require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const db = require("./db");
const SQLiteSessionStore = require("./session-store");
const { getKey, encrypt, decrypt } = require("./crypto");
const { csrfTokensMatch, shouldBypassBrowserCsrf } = require("./api-guards");
const {
  ROLES,
  sanitizeAppUser,
  resolveAuthenticatedUser,
  resolveAdminRole,
  canAccessProject
} = require("./authz");
const {
  bootstrapAdminUser,
  findAppUserById,
  authenticateAppUser,
  listAppUsers,
  createProjectUser,
  setUserActive,
  resetUserPassword,
  replaceUserProjects,
  userHasProjectAssignment
} = require("./app-users");
const {
  shouldTrustProxy,
  requiresHttpsBaseUrl,
  buildSessionOptions,
  buildSessionCookieOptions,
  isValidOauthCallback,
  oauthStatesMatch,
  SESSION_COOKIE_MAX_AGE_MS
} = require("./session-config");
const {
  buildOauthStartDiagnostics,
  buildOauthCallbackDiagnostics,
  logOauthDiagnostic,
  lookupSessionStore,
  onResponseHeaders
} = require("./oauth-diagnostics");
const { findLeadStatusColumn, findLeadStatusColumnIndex } = require("./sheet-data");
const {
  planLeadStatusUpdate,
  planLeadStatusColumnCreate,
  decideLeadStatusWrite
} = require("./lead-status-ops");
const { buildSyncSnapshot, compareSheetToSnapshot, syncInProgressGuard } = require("./sync-snapshot");
const { searchAcrossAuthorizedProjects } = require("./lead-search");
const {
  extractBearerToken,
  ensureMobileSessionTokenSchema,
  issueMobileSessionToken,
  lookupMobileSessionToken,
  deleteMobileSessionToken,
  deleteMobileSessionTokensForSid,
  defaultMobileTokenExpiry,
  sessionStoreGet,
  sessionStoreDestroy
} = require("./mobile-auth");
const {
  deleteAuthenticatedAccount,
  accountDeletionResponseBody
} = require("./account-deletion");
const {
  TIMELINE_EVENT_TYPES,
  leadIdFromRowNumber,
  recordLeadGeneratedForRows,
  recordStatusChangedEvent,
  listTimelineEvents,
  getTimelineEvent,
  adminEditTimelineEvent,
  adminSoftDeleteTimelineEvent,
  rejectProjectUserTimelineMutation
} = require("./lead-timeline");
const {
  listRemarks,
  createRemark,
  editRemark,
  softDeleteRemark,
  getRemark
} = require("./lead-remarks");
const {
  getAuthUrl, exchangeCode, clientFromRefreshToken, getGoogleProfile,
  listSpreadsheets, getTabs, readSheet, writeLeadStatus, createLeadStatusColumn
} = require("./google");
const {
  disconnectGoogleAuthorization,
  googleDisconnectResponseBody
} = require("./google-disconnect");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === "production";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_LOGIN_ID = String(process.env.ADMIN_LOGIN_ID || "").trim();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
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
requireEnvironment("ADMIN_LOGIN_ID");
requireEnvironment("ADMIN_PASSWORD_HASH");
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
app.use("/api", (req, res, next) => {
  resolveMobileBearerAuth(req, res, next);
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

async function currentAppUser(req) {
  if (!req.session.userId || !req.session.role) return null;
  const user = await findAppUserById(db, req.session.userId);
  if (!user || !user.is_active) return null;
  if (user.role !== req.session.role) return null;
  const sessionVersion = Number(req.session.sessionVersion || 0);
  if (sessionVersion !== Number(user.session_version || 0)) return null;
  return user;
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentAppUser(req);
    const access = resolveAuthenticatedUser(user);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await currentAppUser(req);
    const access = resolveAdminRole(user);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Additive mobile bearer auth. Cookie sessions remain the web path.
 * If Authorization: Bearer is present, it must resolve or the request is 401.
 * mobileBearerAuth is set ONLY after token + session + currentAppUser succeed.
 */
async function resolveMobileBearerAuth(req, res, next) {
  try {
    const rawToken = extractBearerToken(req.get("authorization"));
    if (!rawToken) return next();

    const found = await lookupMobileSessionToken(db, rawToken, process.env.SESSION_SECRET);
    if (found.status === "expired") {
      await deleteMobileSessionToken(db, found.tokenHash);
      return res.status(401).json({ error: "Not authenticated." });
    }
    if (found.status !== "ok") {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const sess = await sessionStoreGet(sessionStore, found.row.sid);
    if (!sess || !sess.userId) {
      await deleteMobileSessionToken(db, found.tokenHash);
      return res.status(401).json({ error: "Not authenticated." });
    }

    req.session.userId = Number(sess.userId);
    req.session.role = sess.role;
    req.session.sessionVersion = Number(sess.sessionVersion || 0);
    if (sess.csrfToken) req.session.csrfToken = sess.csrfToken;

    const user = await currentAppUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    req.user = user;
    req.mobileBearerAuth = true;
    req.mobileTokenHash = found.tokenHash;
    req.mobileBoundSid = String(found.row.sid);

    // Do not persist bearer-hydrated credentials onto a new anonymous cookie session.
    if (req.sessionID !== req.mobileBoundSid) {
      req.session.save = callback => {
        if (typeof callback === "function") process.nextTick(callback);
      };
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = (name, value) => {
        if (String(name).toLowerCase() === "set-cookie") return res;
        return originalSetHeader(name, value);
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}

function csrfProtection(req, res, next) {
  // Browser cookie requests keep CSRF. Valid mobile bearer auth is CSRF-exempt.
  if (shouldBypassBrowserCsrf(req)) {
    return next();
  }
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

async function establishAppSession(req, user) {
  await regenerateSession(req);
  req.session.userId = Number(user.id);
  req.session.role = user.role;
  req.session.sessionVersion = Number(user.session_version || 1);
  await saveSession(req);
}

async function getGoogleConnection() {
  return await db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(ADMIN_EMAIL) || null;
}

function googleClientForConnection(connection) {
  if (!connection?.refresh_token_enc) {
    const error = new Error("Google authorization is missing.");
    error.code = "GOOGLE_RECONNECT_REQUIRED";
    throw error;
  }
  return clientFromRefreshToken(decrypt(connection.refresh_token_enc));
}

async function requireGoogleConnection(req, res) {
  const connection = await getGoogleConnection();
  if (!connection?.refresh_token_enc) {
    res.status(401).json({ error: "Google authorization has expired. Please reconnect Google." });
    return null;
  }
  req.googleConnection = connection;
  return connection;
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

async function loadProjectById(projectId) {
  return await db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) || null;
}

async function loadAuthorizedProject(appUser, projectId) {
  const project = await loadProjectById(projectId);
  if (!project) {
    if (appUser.role === ROLES.ADMIN) return { error: "Project not found.", statusCode: 404 };
    return { error: "Not authorized.", statusCode: 403 };
  }
  if (appUser.role === ROLES.ADMIN) return { value: project };
  const assigned = await userHasProjectAssignment(db, appUser.id, projectId);
  const access = canAccessProject(appUser, assigned);
  if (!access.ok) return { error: access.error, statusCode: access.status };
  return { value: project };
}

async function listAuthorizedProjects(appUser) {
  if (appUser.role === ROLES.ADMIN) {
    return db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all();
  }
  return db.prepare(`
    SELECT p.* FROM projects p
    INNER JOIN project_user_assignments a ON a.project_id = p.id
    WHERE a.user_id = ?
    ORDER BY p.name COLLATE NOCASE
  `).all(appUser.id);
}

async function refreshProjectLeads(connection, project, { touchLastSync = false } = {}) {
  const data = await readSheet(googleClientForConnection(connection), project.spreadsheet_id, project.sheet_title);
  if (touchLastSync) {
    await db.prepare("UPDATE projects SET columns_json = ?, last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(JSON.stringify(data.columns), project.id);
  } else {
    await db.prepare("UPDATE projects SET columns_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(JSON.stringify(data.columns), project.id);
  }
  const fresh = await loadProjectById(project.id);
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

async function syncProject(connection, project) {
  const client = googleClientForConnection(connection);
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
    WHERE id = ?`)
    .run(JSON.stringify(data.columns), JSON.stringify(comparison.snapshot), project.id);

  if (Array.isArray(comparison.newRowNumbers) && comparison.newRowNumbers.length) {
    const indexes = comparison.newRowNumbers.map(rowNumber => data.rowNumbers.indexOf(rowNumber));
    const newLeads = indexes.map((index, i) => (index >= 0 ? data.leads[index] : {}));
    await recordLeadGeneratedForRows(db, {
      projectId: project.id,
      rowNumbers: comparison.newRowNumbers,
      leads: newLeads,
      columns: data.columns,
      projectName: project.name
    });
  }

  const fresh = await loadProjectById(project.id);
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

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const result = await authenticateAppUser(db, req.body?.loginId, req.body?.password);
    if (!result.ok) return res.status(401).json({ error: result.error });
    await establishAppSession(req, result.user);
    res.json({ user: sanitizeAppUser(result.user) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/auth/google", requireAdmin, async (req, res, next) => {
  try {
    const state = randomValue();
    req.session.oauthState = state;
    req.session.oauthReturnTo = safeReturnTo(req.query.returnTo || "/");
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

  const admin = await currentAppUser(req);
  if (!admin || admin.role !== ROLES.ADMIN) {
    delete req.session.oauthState;
    delete req.session.oauthReturnTo;
    return res.status(401).send("Admin login required before connecting Google Sheets.");
  }

  const returnTo = safeReturnTo(req.session.oauthReturnTo || "/");
  delete req.session.oauthState;
  delete req.session.oauthReturnTo;

  try {
    const { client, tokens } = await exchangeCode(String(req.query.code));
    const profile = await getGoogleProfile(client);
    if (!profile.email || profile.email.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).send("This Google account is not authorized for Sheets access.");
    }

    const existing = await db.prepare("SELECT * FROM users WHERE google_sub = ?").get(profile.id);
    if (existing) {
      if (tokens.refresh_token) {
        await db.prepare("UPDATE users SET email = ?, name = ?, picture = ?, refresh_token_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(profile.email, profile.name || "", profile.picture || "", encrypt(tokens.refresh_token), existing.id);
      } else {
        await db.prepare("UPDATE users SET email = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(profile.email, profile.name || "", profile.picture || "", existing.id);
      }
    } else {
      if (!tokens.refresh_token) {
        return res.status(400).send("Google did not provide long-term access. Reconnect the application and try again.");
      }
      await db.prepare("INSERT INTO users (google_sub, email, name, picture, refresh_token_enc) VALUES (?, ?, ?, ?, ?)")
        .run(profile.id, profile.email, profile.name || "", profile.picture || "", encrypt(tokens.refresh_token));
    }

    await saveSession(req);
    res.redirect(returnTo);
  } catch (err) {
    logError("OAuth callback failed", err);
    res.status(500).send("Google authorization failed. Please try again.");
  }
});

app.get("/api/auth/me", async (req, res, next) => {
  try {
    const user = await currentAppUser(req);
    if (!user) return res.json({ authenticated: false });
    const google = await getGoogleConnection();
    res.json({
      authenticated: true,
      user: sanitizeAppUser(user),
      googleConnected: Boolean(google?.refresh_token_enc),
      googleEmail: google?.email || null
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/csrf", requireAuth, (req, res) => {
  res.json({ csrfToken: csrfToken(req) });
});

app.post("/api/auth/logout", requireAuth, csrfProtection, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("lead_admin_sid");
    res.json({ ok: true });
  });
});

/* -------------------- MOBILE AUTH (additive; web cookie auth unchanged) -------------------- */

app.post("/api/mobile/auth/login", async (req, res, next) => {
  try {
    const result = await authenticateAppUser(db, req.body?.loginId, req.body?.password);
    if (!result.ok) return res.status(401).json({ error: result.error });

    await establishAppSession(req, result.user);
    const expiresAt = defaultMobileTokenExpiry();
    const issued = await issueMobileSessionToken(db, {
      sid: req.sessionID,
      userId: result.user.id,
      secret: process.env.SESSION_SECRET,
      expiresAt
    });

    res.json({
      user: sanitizeAppUser(result.user),
      sessionToken: issued.rawToken,
      expiresAt: new Date(expiresAt).toISOString()
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/mobile/auth/me", requireAuth, async (req, res, next) => {
  try {
    if (req.mobileBearerAuth !== true) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    res.json({
      authenticated: true,
      user: sanitizeAppUser(req.user)
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/mobile/auth/logout", requireAuth, async (req, res, next) => {
  try {
    if (req.mobileBearerAuth !== true) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const tokenHash = req.mobileTokenHash;
    const sid = req.mobileBoundSid || req.sessionID;

    await deleteMobileSessionToken(db, tokenHash);
    if (sid) {
      await deleteMobileSessionTokensForSid(db, sid);
      await sessionStoreDestroy(sessionStore, sid);
    }

    req.session.destroy(err => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Authenticated account deletion (mobile bearer or web cookie + CSRF).
 * Server derives the account from the session. Does not delete Google Sheets or lead rows.
 */
app.delete("/api/account", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "DELETE") {
      return res.status(400).json({
        error: 'Confirmation required. Send JSON body { "confirm": "DELETE" }.'
      });
    }

    const currentSid = req.mobileBoundSid || req.sessionID || null;
    const result = await deleteAuthenticatedAccount(db, {
      user: req.user,
      sessionStore,
      currentSid
    });

    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ error: result.error || "Unable to delete account." });
    }

    const finish = () => {
      res.clearCookie("lead_admin_sid");
      res.json(accountDeletionResponseBody());
    };

    if (typeof req.session?.destroy === "function") {
      req.session.destroy(err => {
        if (err) return next(err);
        finish();
      });
      return;
    }

    finish();
  } catch (err) {
    next(err);
  }
});

/* -------------------- GOOGLE SHEETS (admin) -------------------- */

app.get("/api/sheets", requireAdmin, async (req, res) => {
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    res.json({ spreadsheets: await listSpreadsheets(googleClientForConnection(connection)) });
  } catch (err) {
    sendGoogleError(res, "Unable to list spreadsheets", err);
  }
});

app.get("/api/sheets/:spreadsheetId/tabs", requireAdmin, async (req, res) => {
  if (!isSpreadsheetId(req.params.spreadsheetId)) return res.status(400).json({ error: "Invalid spreadsheet selection." });
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    res.json({ tabs: await getTabs(googleClientForConnection(connection), req.params.spreadsheetId) });
  } catch (err) {
    sendGoogleError(res, "Unable to list sheet tabs", err);
  }
});

app.get("/api/google/status", requireAdmin, async (req, res, next) => {
  try {
    const connection = await getGoogleConnection();
    res.json({
      connected: Boolean(connection?.refresh_token_enc),
      email: connection?.email || null,
      name: connection?.name || null
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin-only Google Sheets disconnect.
 * Clears stored encrypted refresh tokens. Does not delete projects, sheets, or CRM accounts.
 */
app.post("/api/google/disconnect", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const connection = await getGoogleConnection();
    const result = await disconnectGoogleAuthorization(db, {
      connection,
      decryptFn: decrypt
    });
    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ error: result.error || "Unable to disconnect Google." });
    }
    res.json(googleDisconnectResponseBody(result.value));
  } catch (err) {
    next(err);
  }
});

/* -------------------- USERS (admin) -------------------- */

app.get("/api/users", requireAdmin, async (req, res, next) => {
  try {
    res.json({ users: await listAppUsers(db) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/users", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const created = await createProjectUser(db, {
      name: req.body?.name,
      loginId: req.body?.loginId,
      password: req.body?.password,
      projectIds: req.body?.projectIds
    });
    if (created.error) return res.status(created.statusCode).json({ error: created.error });
    const users = await listAppUsers(db);
    res.status(201).json({ user: users.find(item => item.id === created.value.id) || created.value });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/users/:id/status", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });
    const isActive = Boolean(req.body?.isActive);
    const result = await setUserActive(db, id, isActive);
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.json({ ok: true, users: await listAppUsers(db) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/users/:id/reset-password", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });
    const result = await resetUserPassword(db, id, req.body?.password);
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.put("/api/users/:id/projects", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });
    const result = await replaceUserProjects(db, id, req.body?.projectIds);
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.json({ ok: true, users: await listAppUsers(db) });
  } catch (err) {
    next(err);
  }
});

/* -------------------- GLOBAL LEAD SEARCH -------------------- */

app.get("/api/leads/search", requireAuth, async (req, res) => {
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;

    const projects = await listAuthorizedProjects(req.user);
    const outcome = await searchAcrossAuthorizedProjects({
      projects,
      query: req.query.q,
      loadSheet: async project => readSheet(
        googleClientForConnection(connection),
        project.spreadsheet_id,
        project.sheet_title
      )
    });

    if (outcome.error) {
      return res.status(outcome.statusCode || 400).json({
        error: outcome.error,
        sheetErrors: outcome.sheetErrors || undefined
      });
    }

    res.json({
      query: outcome.query,
      count: outcome.count,
      results: outcome.results,
      sheetErrors: outcome.sheetErrors.length ? outcome.sheetErrors : undefined
    });
  } catch (err) {
    sendGoogleError(res, "Unable to search leads", err);
  }
});

/* -------------------- PROJECTS -------------------- */

app.get("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const rows = await listAuthorizedProjects(req.user);
    res.json({ projects: rows.map(sanitizeProject) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects", requireAdmin, csrfProtection, async (req, res) => {
  const validated = validateProjectInput(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    const { name, spreadsheetId, sheetId, sheetTitle } = validated.value;
    const client = googleClientForConnection(connection);
    const tabs = await getTabs(client, spreadsheetId);
    const tab = tabs.find(item => String(item.sheetId) === String(sheetId) && item.title === sheetTitle);
    if (!tab) return res.status(400).json({ error: "Selected sheet was not found." });
    const existing = await db.prepare("SELECT id FROM projects WHERE user_id = ? AND spreadsheet_id = ? AND sheet_id = ?")
      .get(connection.id, spreadsheetId, tab.sheetId);
    if (existing) return res.status(409).json({ error: "This spreadsheet tab is already connected as a project." });
    const spreadsheet = (await listSpreadsheets(client)).find(item => item.id === spreadsheetId);
    const data = await readSheet(client, spreadsheetId, tab.title);
    const snapshot = buildSyncSnapshot(data.columns, data.leads, data.rowNumbers);
    await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, spreadsheet_name, sheet_id, sheet_title, columns_json, sync_snapshot_json, last_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .run(
        connection.id,
        name,
        spreadsheetId,
        spreadsheet ? spreadsheet.name : "",
        tab.sheetId,
        tab.title,
        JSON.stringify(data.columns),
        JSON.stringify(snapshot)
      );
    const project = await db.prepare("SELECT * FROM projects WHERE user_id = ? AND spreadsheet_id = ? AND sheet_id = ?")
      .get(connection.id, spreadsheetId, tab.sheetId);
    await recordLeadGeneratedForRows(db, {
      projectId: project.id,
      rowNumbers: data.rowNumbers,
      leads: data.leads,
      columns: data.columns,
      projectName: project.name
    });
    res.status(201).json({ project: sanitizeProject(project) });
  } catch (err) {
    sendGoogleError(res, "Unable to create project", err);
  }
});

app.delete("/api/projects/:id", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid project id." });
    await db.prepare("DELETE FROM project_user_assignments WHERE project_id = ?").run(id);
    const result = await db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    if (!result.changes) return res.status(404).json({ error: "Project not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/projects/:id/leads", requireAuth, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const authorized = await loadAuthorizedProject(req.user, id);
  if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    res.json(await refreshProjectLeads(connection, authorized.value));
  } catch (err) {
    sendGoogleError(res, "Unable to fetch leads", err);
  }
});

app.patch("/api/projects/:id/leads/:rowNumber/status", requireAuth, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const authorized = await loadAuthorizedProject(req.user, id);
  if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });

  // Only Lead Status is accepted; reject attempts to supply other column payloads.
  if (req.body && Object.keys(req.body).some(key => key !== "status")) {
    return res.status(403).json({ error: "Not authorized." });
  }

  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    const client = googleClientForConnection(connection);
    const project = authorized.value;
    const sheetData = await readSheet(client, project.spreadsheet_id, project.sheet_title);
    const planned = planLeadStatusUpdate({
      project,
      sheetData,
      rowNumber: req.params.rowNumber,
      status: req.body?.status
    });
    if (planned.error) return res.status(planned.statusCode).json({ error: planned.error });

    const decision = decideLeadStatusWrite({ sheetData, plannedValue: planned.value });
    const { rowNumber, status } = decision;

    // Same status: no Google Sheets write and no STATUS_CHANGED timeline event.
    if (decision.unchanged) {
      return res.json({
        ok: true,
        unchanged: true,
        rowNumber,
        status,
        project: await refreshProjectLeads(connection, project)
      });
    }

    const { spreadsheetId, sheetTitle, columnIndex } = decision.write;
    const previousStatus = decision.previousStatus;

    // Write to Google Sheets first. Timeline only after a successful write.
    await writeLeadStatus(client, spreadsheetId, sheetTitle, columnIndex, rowNumber, status);

    const leadId = leadIdFromRowNumber(rowNumber);
    if (leadId) {
      try {
        await recordStatusChangedEvent(db, {
          projectId: project.id,
          leadId,
          fromStatus: previousStatus,
          toStatus: status,
          actor: req.user
        });
      } catch (timelineErr) {
        // Sheets already updated — do not invent a false event or roll back Sheets.
        console.error("STATUS_CHANGED timeline insert failed after Sheets write:", timelineErr?.message || timelineErr);
        return res.status(500).json({
          error: "Unable to record status change history.",
          rowNumber,
          status
        });
      }
    }

    res.json({
      ok: true,
      success: true,
      rowNumber,
      status,
      project: await refreshProjectLeads(connection, project)
    });
  } catch (err) {
    // Google write failed (or earlier) — no STATUS_CHANGED event was created.
    sendGoogleError(res, "Unable to update lead status", err);
  }
});

/* -------------------- LEAD REMARKS + TIMELINE -------------------- */

function parseLeadParam(value) {
  return leadIdFromRowNumber(value) || (String(value || "").trim() || null);
}

app.get("/api/projects/:id/leads/:leadId/timeline", requireAuth, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const leadId = parseLeadParam(req.params.leadId);
    if (!projectId || !leadId) return res.status(400).json({ error: "Invalid project or lead id." });
    const authorized = await loadAuthorizedProject(req.user, projectId);
    if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
    const includeDeleted = req.user.role === ROLES.ADMIN && req.query.includeDeleted === "1";
    const events = await listTimelineEvents(db, { projectId, leadId, includeDeleted });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/projects/:id/timeline/:eventId", requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const eventId = positiveId(req.params.eventId);
    if (!projectId || !eventId) return res.status(400).json({ error: "Invalid project or event id." });
    // Reject spoofed actor/timestamp fields from clients.
    if (req.body && ["createdAt", "created_at", "actorUserId", "userId", "role", "actor_user_id"].some(key => key in req.body)) {
      return res.status(403).json({ error: "Not authorized." });
    }
    const result = await adminEditTimelineEvent(db, {
      eventId,
      projectId,
      newEventData: req.body?.eventData,
      reason: req.body?.reason,
      adminUser: req.user
    });
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    const existing = await getTimelineEvent(db, eventId);
    const events = existing
      ? await listTimelineEvents(db, { projectId, leadId: existing.lead_id })
      : [];
    res.json({ ok: true, events });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/projects/:id/timeline/:eventId", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      const denied = rejectProjectUserTimelineMutation();
      return res.status(denied.statusCode).json({ error: denied.error });
    }
    const projectId = positiveId(req.params.id);
    const eventId = positiveId(req.params.eventId);
    if (!projectId || !eventId) return res.status(400).json({ error: "Invalid project or event id." });
    const result = await adminSoftDeleteTimelineEvent(db, {
      eventId,
      projectId,
      adminUser: req.user
    });
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Project users cannot mutate timeline via generic create.
app.post("/api/projects/:id/leads/:leadId/timeline", requireAuth, csrfProtection, async (req, res) => {
  const denied = rejectProjectUserTimelineMutation();
  return res.status(denied.statusCode).json({ error: denied.error });
});

app.get("/api/projects/:id/leads/:leadId/remarks", requireAuth, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const leadId = parseLeadParam(req.params.leadId);
    if (!projectId || !leadId) return res.status(400).json({ error: "Invalid project or lead id." });
    const authorized = await loadAuthorizedProject(req.user, projectId);
    if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
    res.json({ remarks: await listRemarks(db, { projectId, leadId }) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects/:id/leads/:leadId/remarks", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const leadId = parseLeadParam(req.params.leadId);
    if (!projectId || !leadId) return res.status(400).json({ error: "Invalid project or lead id." });
    const authorized = await loadAuthorizedProject(req.user, projectId);
    if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
    if (req.body && ["createdAt", "created_at", "actorUserId", "userId", "authorUserId"].some(key => key in req.body)) {
      return res.status(403).json({ error: "Not authorized." });
    }
    const result = await createRemark(db, {
      projectId,
      leadId,
      body: req.body?.body,
      actor: req.user
    });
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.status(201).json({
      remark: result.value,
      remarks: await listRemarks(db, { projectId, leadId }),
      events: await listTimelineEvents(db, { projectId, leadId })
    });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/projects/:id/remarks/:remarkId", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const remarkId = positiveId(req.params.remarkId);
    if (!projectId || !remarkId) return res.status(400).json({ error: "Invalid project or remark id." });
    const authorized = await loadAuthorizedProject(req.user, projectId);
    if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
    if (req.body && ["createdAt", "created_at", "actorUserId", "userId"].some(key => key in req.body)) {
      return res.status(403).json({ error: "Not authorized." });
    }
    const result = await editRemark(db, {
      remarkId,
      projectId,
      body: req.body?.body,
      actor: req.user,
      isAdmin: req.user.role === ROLES.ADMIN
    });
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    res.json({
      remark: result.value,
      remarks: await listRemarks(db, { projectId, leadId: result.value.leadId }),
      events: await listTimelineEvents(db, { projectId, leadId: result.value.leadId })
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/projects/:id/remarks/:remarkId", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const projectId = positiveId(req.params.id);
    const remarkId = positiveId(req.params.remarkId);
    if (!projectId || !remarkId) return res.status(400).json({ error: "Invalid project or remark id." });
    const authorized = await loadAuthorizedProject(req.user, projectId);
    if (authorized.error) return res.status(authorized.statusCode).json({ error: authorized.error });
    const existing = await getRemark(db, remarkId);
    const result = await softDeleteRemark(db, {
      remarkId,
      projectId,
      actor: req.user,
      isAdmin: req.user.role === ROLES.ADMIN
    });
    if (result.error) return res.status(result.statusCode).json({ error: result.error });
    const leadId = existing?.lead_id;
    res.json({
      ok: true,
      remarks: leadId ? await listRemarks(db, { projectId, leadId }) : [],
      events: leadId ? await listTimelineEvents(db, { projectId, leadId }) : []
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/projects/:id/lead-status-column", requireAdmin, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found." });

  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    const client = googleClientForConnection(connection);
    const sheetData = await readSheet(client, project.spreadsheet_id, project.sheet_title);
    const planned = planLeadStatusColumnCreate({ project, sheetData });
    if (planned.error) return res.status(planned.statusCode).json({ error: planned.error });

    const { spreadsheetId, sheetTitle, columnIndex, rowNumbers, defaultStatus } = planned.value;
    await createLeadStatusColumn(client, spreadsheetId, sheetTitle, columnIndex, rowNumbers, defaultStatus);
    res.status(201).json({
      ok: true,
      project: await refreshProjectLeads(connection, project)
    });
  } catch (err) {
    sendGoogleError(res, "Unable to add Lead Status column", err);
  }
});

/* -------------------- SYNC (admin) -------------------- */

app.post("/api/projects/:id/sync", requireAdmin, csrfProtection, async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const project = await loadProjectById(id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  if (!projectSyncGuard.tryBegin(id)) {
    return res.status(409).json({ error: "Sync already in progress for this project." });
  }
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    const result = await syncProject(connection, project);
    res.json({ ok: true, ...result });
  } catch (err) {
    sendSyncError(res, "Unable to sync project", err);
  } finally {
    projectSyncGuard.end(id);
  }
});

app.post("/api/sync", requireAdmin, csrfProtection, async (req, res) => {
  try {
    const connection = await requireGoogleConnection(req, res);
    if (!connection) return;
    const projects = await db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all();
    const updated = [];
    for (const project of projects) {
      if (!projectSyncGuard.tryBegin(project.id)) {
        updated.push({ id: project.id, name: project.name, error: "Sync already in progress for this project." });
        continue;
      }
      try {
        const result = await syncProject(connection, project);
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

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

app.get("/terms", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

app.get("/delete-account", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "delete-account.html"));
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
  await ensureMobileSessionTokenSchema(db);
  await bootstrapAdminUser(db, {
    loginId: ADMIN_LOGIN_ID,
    passwordHash: ADMIN_PASSWORD_HASH
  });
  if (require.main === module) {
    app.listen(PORT, () => console.log(`Lead Admin running at ${BASE_URL}`));
  }
}

start().catch(err => {
  console.error("Failed to start Lead Admin", { name: err?.name || "Error", code: err?.code || "unknown" });
  if (require.main === module) process.exit(1);
});

module.exports = app;
