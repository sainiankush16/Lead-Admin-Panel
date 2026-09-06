"use strict";

/** Matches lead-remarks.js MAX_REMARK_LENGTH */
const MAX_REMARK_LENGTH = 2000;

function validateRemarkDraft(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Remark text is required." };
  }
  const body = value.trim();
  if (!body) {
    return { ok: false, error: "Remark text is required." };
  }
  if (body.length > MAX_REMARK_LENGTH) {
    return { ok: false, error: `Remark must be at most ${MAX_REMARK_LENGTH} characters.` };
  }
  return { ok: true, value: body };
}

function canMutateRemark(user, remark) {
  if (!user || !remark) return false;
  if (user.role === "admin") return true;
  const authorId = remark.author?.userId;
  return authorId != null && Number(authorId) === Number(user.id);
}

function remarkAuthorLabel(remark) {
  const name = remark?.author?.name;
  const loginId = remark?.author?.loginId;
  const label = String(name || loginId || "").trim();
  return label || "User";
}

function formatRemarkTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return raw;
  }
}

function leadIdFromRowNumber(rowNumber) {
  const n = Number(rowNumber);
  if (!Number.isSafeInteger(n) || n < 2) return null;
  return String(n);
}

function mapRemarksLoadError(err) {
  if (!err) return { message: "Unable to load remarks.", clearAuth: false };
  if (err.name === "TypeError") {
    return { message: "Unable to load remarks.", clearAuth: false };
  }
  const status = Number(err.status);
  if (status === 401) {
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "You don't have access to this project.", clearAuth: false };
  }
  if (status === 404) {
    return { message: "Lead not found.", clearAuth: false };
  }
  return { message: "Unable to load remarks.", clearAuth: false };
}

function mapRemarkMutationError(err, action) {
  const fallback =
    action === "delete"
      ? "Unable to delete remark."
      : action === "edit"
        ? "Unable to save remark."
        : "Unable to save remark.";
  if (!err) return { message: fallback, clearAuth: false };
  if (err.name === "TypeError") {
    return { message: fallback, clearAuth: false };
  }
  const status = Number(err.status);
  if (status === 401) {
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "You don't have access to this project.", clearAuth: false };
  }
  if (status === 404) {
    return { message: "Lead not found.", clearAuth: false };
  }
  if (status === 400) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    if (serverMessage && serverMessage !== "Request failed.") {
      return { message: serverMessage, clearAuth: false };
    }
    return { message: "Remark text is required.", clearAuth: false };
  }
  return { message: fallback, clearAuth: false };
}

function canSubmitRemarkDraft({ draft, busy }) {
  if (busy) return false;
  return validateRemarkDraft(draft).ok;
}

module.exports = {
  MAX_REMARK_LENGTH,
  validateRemarkDraft,
  canMutateRemark,
  remarkAuthorLabel,
  formatRemarkTimestamp,
  leadIdFromRowNumber,
  mapRemarksLoadError,
  mapRemarkMutationError,
  canSubmitRemarkDraft
};
