"use strict";

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

function validateProjectName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) {
    return { ok: false, error: "Project name must be between 1 and 120 characters." };
  }
  return { ok: true, value: name };
}

function isSpreadsheetId(value) {
  return typeof value === "string" && SPREADSHEET_ID_PATTERN.test(value);
}

function validateCreateProjectPayload({ name, spreadsheetId, sheetId, sheetTitle }) {
  const named = validateProjectName(name);
  if (!named.ok) return named;
  if (!isSpreadsheetId(spreadsheetId)) {
    return { ok: false, error: "Invalid spreadsheet selection." };
  }
  const title = typeof sheetTitle === "string" ? sheetTitle.trim() : "";
  const id = Number(sheetId);
  if (!title || title.length > 200 || !Number.isSafeInteger(id) || id < 0) {
    return { ok: false, error: "Invalid sheet selection." };
  }
  return {
    ok: true,
    value: {
      name: named.value,
      spreadsheetId,
      sheetId: id,
      sheetTitle: title
    }
  };
}

function mapSpreadsheets(payload) {
  const list = Array.isArray(payload?.spreadsheets) ? payload.spreadsheets : [];
  return list
    .map(item => ({
      id: String(item.id || ""),
      name: String(item.name || "").trim() || "Untitled spreadsheet",
      modifiedTime: item.modifiedTime || null
    }))
    .filter(item => isSpreadsheetId(item.id));
}

function filterSpreadsheets(items, query) {
  const q = String(query || "").trim().toLowerCase();
  const list = Array.isArray(items) ? items : [];
  if (!q) return list;
  return list.filter(item => String(item.name || "").toLowerCase().includes(q));
}

function mapSheetTabs(payload) {
  const list = Array.isArray(payload?.tabs) ? payload.tabs : [];
  return list
    .map(item => ({
      sheetId: Number(item.sheetId),
      title: String(item.title || "").trim(),
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0
    }))
    .filter(item => item.title && Number.isSafeInteger(item.sheetId) && item.sheetId >= 0)
    .sort((a, b) => a.index - b.index);
}

function mapProjectConfiguration(project) {
  if (!project) return null;
  const columns = Array.isArray(project.columns) ? project.columns.map(c => String(c)) : [];
  return {
    id: Number(project.id),
    name: String(project.name || "").trim() || "Project",
    spreadsheetName: String(project.spreadsheetName || "").trim() || "—",
    sheetName: String(project.sheetName || "").trim() || "—",
    spreadsheetId: String(project.spreadsheetId || ""),
    sheetId: Number(project.sheetId),
    columns,
    headerCount: columns.length,
    lastSync: project.lastSync || null
  };
}

function canSubmitCreateProject({ draft, saving }) {
  if (saving) return false;
  return validateCreateProjectPayload(draft || {}).ok;
}

function mapProjectManagementError(err) {
  if (!err) return { message: "Unable to complete the request.", clearAuth: false };
  if (err.name === "TypeError") {
    return { message: "Unable to complete the request. Check your connection and try again.", clearAuth: false };
  }
  const status = Number(err.status);
  if (status === 401) {
    const msg = typeof err.message === "string" ? err.message.trim() : "";
    if (msg.toLowerCase().includes("google")) {
      return {
        message: "Google authorization has expired. Please reconnect Google from the Website CRM admin on the web.",
        clearAuth: false,
        googleAuth: true
      };
    }
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "You don't have permission to manage projects.", clearAuth: false };
  }
  if (status === 404) {
    return { message: "Project or spreadsheet not found.", clearAuth: false };
  }
  if (status === 409) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    return {
      message: serverMessage && serverMessage !== "Request failed."
        ? serverMessage
        : "This spreadsheet and sheet are already configured as a project.",
      clearAuth: false
    };
  }
  if (status === 400) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    if (serverMessage && serverMessage !== "Request failed.") {
      return { message: serverMessage, clearAuth: false };
    }
    return { message: "Unable to complete the request.", clearAuth: false };
  }
  if (status === 502) {
    return { message: "Google service is temporarily unavailable. Please try again.", clearAuth: false };
  }
  return { message: "Unable to complete the request.", clearAuth: false };
}

function responseContainsSecrets(payload) {
  const text = JSON.stringify(payload || {});
  const needles = [
    "refresh_token",
    "access_token",
    "refresh_token_enc",
    "client_secret",
    "SESSION_SECRET",
    "TOKEN_ENCRYPTION",
    "password_hash"
  ];
  return needles.some(needle => text.includes(needle));
}

module.exports = {
  SPREADSHEET_ID_PATTERN,
  validateProjectName,
  isSpreadsheetId,
  validateCreateProjectPayload,
  mapSpreadsheets,
  filterSpreadsheets,
  mapSheetTabs,
  mapProjectConfiguration,
  canSubmitCreateProject,
  mapProjectManagementError,
  responseContainsSecrets
};
