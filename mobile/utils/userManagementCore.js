"use strict";

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;

function displayRole(role) {
  if (role === "admin") return "Admin";
  if (role === "project_user") return "Project User";
  return "User";
}

function displayActive(isActive) {
  return isActive ? "Active" : "Inactive";
}

function formatProjectCount(projects) {
  const n = Array.isArray(projects) ? projects.length : 0;
  if (n === 1) return "1 Project";
  return `${n} Projects`;
}

function mapManagedUsers(payload) {
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return users.map(user => ({
    id: Number(user.id),
    name: String(user.name || "").trim() || "User",
    loginId: String(user.loginId || "").trim(),
    role: user.role === "admin" ? "admin" : "project_user",
    roleLabel: displayRole(user.role),
    isActive: Boolean(user.isActive),
    statusLabel: displayActive(Boolean(user.isActive)),
    projects: Array.isArray(user.projects)
      ? user.projects.map(p => ({ id: Number(p.id), name: String(p.name || "").trim() || "Project" }))
      : [],
    projectCountLabel: formatProjectCount(user.projects)
  })).filter(user => Number.isSafeInteger(user.id) && user.id > 0 && user.loginId);
}

function validateDisplayName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) {
    return { ok: false, error: "Name must be between 1 and 120 characters." };
  }
  return { ok: true, value: name };
}

function validateLoginId(value) {
  const loginId = typeof value === "string" ? value.trim() : "";
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return { ok: false, error: "Login ID must be 3–64 characters (letters, numbers, ., _, -)." };
  }
  return { ok: true, value: loginId.toLowerCase() };
}

function validatePassword(value) {
  if (typeof value !== "string" || !value) {
    return { ok: false, error: "Password is required." };
  }
  if (value.length < 8 || value.length > 128) {
    return { ok: false, error: "Password must be between 8 and 128 characters." };
  }
  return { ok: true, value };
}

function validateCreateUserForm({ name, loginId, password, confirmPassword }) {
  const display = validateDisplayName(name);
  if (!display.ok) return display;
  const login = validateLoginId(loginId);
  if (!login.ok) return login;
  const pass = validatePassword(password);
  if (!pass.ok) return pass;
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  return {
    ok: true,
    value: {
      name: display.value,
      loginId: login.value,
      password: pass.value
    }
  };
}

function validatePasswordChangeForm({ password, confirmPassword }) {
  const pass = validatePassword(password);
  if (!pass.ok) return pass;
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, value: pass.value };
}

function nextProjectIdsAfterAssign(currentIds, projectId) {
  const ids = Array.isArray(currentIds) ? currentIds.map(Number) : [];
  const next = Number(projectId);
  if (!Number.isSafeInteger(next) || next <= 0) {
    return { ok: false, error: "Project not found." };
  }
  if (ids.includes(next)) {
    return { ok: false, error: "That user or assignment already exists.", status: 409 };
  }
  return { ok: true, value: [...ids, next] };
}

function nextProjectIdsAfterRemove(currentIds, projectId) {
  const ids = Array.isArray(currentIds) ? currentIds.map(Number) : [];
  const target = Number(projectId);
  return { ok: true, value: ids.filter(id => id !== target) };
}

function mapUserManagementError(err) {
  if (!err) return { message: "Unable to complete the request.", clearAuth: false };
  if (err.name === "TypeError") {
    return { message: "Unable to complete the request.", clearAuth: false };
  }
  const status = Number(err.status);
  if (status === 401) {
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "You don't have permission to manage users.", clearAuth: false };
  }
  if (status === 404) {
    return { message: "User or project not found.", clearAuth: false };
  }
  if (status === 409) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    if (serverMessage && serverMessage !== "Request failed.") {
      return { message: serverMessage, clearAuth: false };
    }
    return { message: "That user or assignment already exists.", clearAuth: false };
  }
  if (status === 400) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    if (serverMessage && serverMessage !== "Request failed.") {
      return { message: serverMessage, clearAuth: false };
    }
    return { message: "Unable to complete the request.", clearAuth: false };
  }
  return { message: "Unable to complete the request.", clearAuth: false };
}

function userListContainsPasswordLeak(users) {
  const text = JSON.stringify(users || []);
  return /password_hash|passwordHash|"password"\s*:/.test(text);
}

module.exports = {
  LOGIN_ID_PATTERN,
  displayRole,
  displayActive,
  formatProjectCount,
  mapManagedUsers,
  validateDisplayName,
  validateLoginId,
  validatePassword,
  validateCreateUserForm,
  validatePasswordChangeForm,
  nextProjectIdsAfterAssign,
  nextProjectIdsAfterRemove,
  mapUserManagementError,
  userListContainsPasswordLeak
};
