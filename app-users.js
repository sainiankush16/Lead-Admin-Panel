"use strict";

const { ROLES, isRole, sanitizeAppUser } = require("./authz");
const { hashPassword, verifyPassword, validateLoginId, validatePassword, validateDisplayName, isArgon2Hash } = require("./password");

async function ensureAppUserSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_user_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, project_id),
      FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS project_user_assignments_user_idx ON project_user_assignments(user_id);
    CREATE INDEX IF NOT EXISTS project_user_assignments_project_idx ON project_user_assignments(project_id);
  `);
}

async function bootstrapAdminUser(db, { loginId, passwordHash }) {
  const login = validateLoginId(loginId);
  if (login.error) throw new Error(`ADMIN_LOGIN_ID is invalid: ${login.error}`);
  if (!isArgon2Hash(passwordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH must be an Argon2 hash.");
  }

  const existing = await db.prepare("SELECT * FROM app_users WHERE login_id = ?").get(login.value);
  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new Error("ADMIN_LOGIN_ID collides with a non-admin app user.");
    }
    await db.prepare(`UPDATE app_users
      SET password_hash = ?, is_active = 1, role = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(passwordHash, ROLES.ADMIN, existing.id);
    return existing.id;
  }

  const namedAdmin = await db.prepare("SELECT * FROM app_users WHERE role = ? LIMIT 1").get(ROLES.ADMIN);
  if (namedAdmin) {
    await db.prepare(`UPDATE app_users
      SET login_id = ?, password_hash = ?, is_active = 1, name = COALESCE(NULLIF(name, ''), 'Admin'), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(login.value, passwordHash, namedAdmin.id);
    return namedAdmin.id;
  }

  const result = await db.prepare(`INSERT INTO app_users (name, login_id, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, 1)`).run("Admin", login.value, passwordHash, ROLES.ADMIN);
  return Number(result.lastInsertRowid);
}

async function findAppUserByLoginId(db, loginId) {
  return await db.prepare("SELECT * FROM app_users WHERE login_id = ?").get(String(loginId || "").trim().toLowerCase()) || null;
}

async function findAppUserById(db, id) {
  return await db.prepare("SELECT * FROM app_users WHERE id = ?").get(id) || null;
}

async function authenticateAppUser(db, loginId, password) {
  const login = validateLoginId(loginId);
  const pass = validatePassword(password);
  if (login.error || pass.error) {
    return { ok: false, error: "Invalid login ID or password." };
  }

  const user = await findAppUserByLoginId(db, login.value);
  if (!user || !user.is_active) {
    return { ok: false, error: "Invalid login ID or password." };
  }
  const valid = await verifyPassword(user.password_hash, pass.value);
  if (!valid) {
    return { ok: false, error: "Invalid login ID or password." };
  }
  return { ok: true, user };
}

async function listAppUsers(db) {
  const users = await db.prepare("SELECT * FROM app_users WHERE role = ? ORDER BY name COLLATE NOCASE").all(ROLES.PROJECT_USER);
  const assignments = await db.prepare(`
    SELECT a.user_id, a.project_id, p.name AS project_name
    FROM project_user_assignments a
    JOIN projects p ON p.id = a.project_id
    ORDER BY p.name COLLATE NOCASE
  `).all();
  const byUser = new Map();
  for (const row of assignments) {
    const list = byUser.get(row.user_id) || [];
    list.push({ id: row.project_id, name: row.project_name });
    byUser.set(row.user_id, list);
  }
  return users.map(user => ({
    ...sanitizeAppUser(user),
    projects: byUser.get(user.id) || []
  }));
}

async function createProjectUser(db, { name, loginId, password, projectIds = [] }) {
  const display = validateDisplayName(name);
  const login = validateLoginId(loginId);
  const pass = validatePassword(password);
  if (display.error) return { error: display.error, statusCode: 400 };
  if (login.error) return { error: login.error, statusCode: 400 };
  if (pass.error) return { error: pass.error, statusCode: 400 };

  const existing = await findAppUserByLoginId(db, login.value);
  if (existing) return { error: "Login ID is already in use.", statusCode: 409 };

  const passwordHash = await hashPassword(pass.value);
  const result = await db.prepare(`INSERT INTO app_users (name, login_id, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, 1)`).run(display.value, login.value, passwordHash, ROLES.PROJECT_USER);
  const userId = Number(result.lastInsertRowid);

  const uniqueProjectIds = [...new Set((projectIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  for (const projectId of uniqueProjectIds) {
    const project = await db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!project) continue;
    await db.prepare("INSERT OR IGNORE INTO project_user_assignments (user_id, project_id) VALUES (?, ?)")
      .run(userId, projectId);
  }

  const user = await findAppUserById(db, userId);
  return { value: sanitizeAppUser(user) };
}

async function setUserActive(db, userId, isActive) {
  const user = await findAppUserById(db, userId);
  if (!user || user.role !== ROLES.PROJECT_USER) return { error: "User not found.", statusCode: 404 };
  await db.prepare(`UPDATE app_users
    SET is_active = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(isActive ? 1 : 0, userId);
  return { value: true };
}

async function resetUserPassword(db, userId, password) {
  const user = await findAppUserById(db, userId);
  if (!user || user.role !== ROLES.PROJECT_USER) return { error: "User not found.", statusCode: 404 };
  const pass = validatePassword(password);
  if (pass.error) return { error: pass.error, statusCode: 400 };
  const passwordHash = await hashPassword(pass.value);
  await db.prepare(`UPDATE app_users
    SET password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(passwordHash, userId);
  return { value: true };
}

async function replaceUserProjects(db, userId, projectIds) {
  const user = await findAppUserById(db, userId);
  if (!user || user.role !== ROLES.PROJECT_USER) return { error: "User not found.", statusCode: 404 };
  await db.prepare("DELETE FROM project_user_assignments WHERE user_id = ?").run(userId);
  const uniqueProjectIds = [...new Set((projectIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  for (const projectId of uniqueProjectIds) {
    const project = await db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!project) continue;
    await db.prepare("INSERT OR IGNORE INTO project_user_assignments (user_id, project_id) VALUES (?, ?)")
      .run(userId, projectId);
  }
  return { value: true };
}

async function userHasProjectAssignment(db, userId, projectId) {
  const row = await db.prepare("SELECT id FROM project_user_assignments WHERE user_id = ? AND project_id = ?")
    .get(userId, projectId);
  return Boolean(row);
}

async function listAssignedProjectIds(db, userId) {
  const rows = await db.prepare("SELECT project_id FROM project_user_assignments WHERE user_id = ?").all(userId);
  return rows.map(row => row.project_id);
}

module.exports = {
  ensureAppUserSchema,
  bootstrapAdminUser,
  findAppUserByLoginId,
  findAppUserById,
  authenticateAppUser,
  listAppUsers,
  createProjectUser,
  setUserActive,
  resetUserPassword,
  replaceUserProjects,
  userHasProjectAssignment,
  listAssignedProjectIds,
  ROLES,
  isRole,
  sanitizeAppUser
};
