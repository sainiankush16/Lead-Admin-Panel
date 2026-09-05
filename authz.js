"use strict";

const ROLES = Object.freeze({
  ADMIN: "admin",
  PROJECT_USER: "project_user"
});

function isRole(value) {
  return value === ROLES.ADMIN || value === ROLES.PROJECT_USER;
}

function sanitizeAppUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: user.name || "",
    loginId: user.login_id,
    role: user.role,
    isActive: Boolean(user.is_active)
  };
}

function resolveAuthenticatedUser(user) {
  if (!user) return { ok: false, status: 401, error: "Not authenticated." };
  if (!user.is_active) return { ok: false, status: 401, error: "Not authenticated." };
  if (!isRole(user.role)) return { ok: false, status: 403, error: "Not authorized." };
  return { ok: true };
}

function resolveAdminRole(user) {
  const auth = resolveAuthenticatedUser(user);
  if (!auth.ok) return auth;
  if (user.role !== ROLES.ADMIN) return { ok: false, status: 403, error: "Not authorized." };
  return { ok: true };
}

function canAccessProject(user, assignmentExists) {
  const auth = resolveAuthenticatedUser(user);
  if (!auth.ok) return auth;
  if (user.role === ROLES.ADMIN) return { ok: true };
  if (user.role === ROLES.PROJECT_USER && assignmentExists) return { ok: true };
  return { ok: false, status: 403, error: "Not authorized." };
}

function canUpdateLeadStatus(user, assignmentExists) {
  return canAccessProject(user, assignmentExists);
}

function canManageProjects(user) {
  return resolveAdminRole(user);
}

function canManageUsers(user) {
  return resolveAdminRole(user);
}

function canManageGoogle(user) {
  return resolveAdminRole(user);
}

function canSyncProjects(user) {
  return resolveAdminRole(user);
}

/** @deprecated Use resolveAdminRole / resolveAuthenticatedUser. Kept for older tests during migration. */
function resolveAdminUser(user, adminEmail) {
  if (!user) return { ok: false, status: 401, error: "Not authenticated." };
  if (user.role === ROLES.ADMIN) return { ok: true };
  if (adminEmail && String(user.email || "").toLowerCase() === String(adminEmail || "").trim().toLowerCase()) {
    return { ok: true };
  }
  if (user.email && adminEmail) {
    return String(user.email || "").toLowerCase() === String(adminEmail || "").trim().toLowerCase()
      ? { ok: true }
      : { ok: false, status: 403, error: "Not authorized." };
  }
  return { ok: false, status: 403, error: "Not authorized." };
}

module.exports = {
  ROLES,
  isRole,
  sanitizeAppUser,
  resolveAuthenticatedUser,
  resolveAdminRole,
  canAccessProject,
  canUpdateLeadStatus,
  canManageProjects,
  canManageUsers,
  canManageGoogle,
  canSyncProjects,
  resolveAdminUser
};
