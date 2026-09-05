"use strict";

const crypto = require("crypto");

const SESSION_COOKIE_NAME = "lead_admin_sid";

function shortHash(value) {
  if (value == null || value === "") return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function headerHasCookie(cookieHeader, name = SESSION_COOKIE_NAME) {
  if (typeof cookieHeader !== "string" || !cookieHeader) return false;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`) && trimmed.length > name.length + 1) return true;
  }
  return false;
}

function inspectSetCookieHeader(setCookieHeader, name = SESSION_COOKIE_NAME) {
  const headers = setCookieHeader == null
    ? []
    : Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
  const match = headers.map(String).find(value => value.startsWith(`${name}=`));
  if (!match) {
    return {
      setCookiePresent: false,
      secure: false,
      httpOnly: false,
      sameSite: null,
      path: null
    };
  }
  const sameSiteMatch = /;\s*SameSite=([^;]+)/i.exec(match);
  const pathMatch = /;\s*Path=([^;]+)/i.exec(match);
  return {
    setCookiePresent: true,
    secure: /;\s*Secure(?:;|$)/i.test(match) || /;\s*Secure$/i.test(match),
    httpOnly: /;\s*HttpOnly(?:;|$)/i.test(match) || /;\s*HttpOnly$/i.test(match),
    sameSite: sameSiteMatch ? sameSiteMatch[1].trim() : null,
    path: pathMatch ? pathMatch[1].trim() : null
  };
}

function buildOauthStartDiagnostics({
  req,
  res,
  isProduction,
  expectedHost,
  saveSucceeded,
  oauthStateGenerated,
  sessionId,
  oauthState,
  cookieIntended
}) {
  const cookieFlags = inspectSetCookieHeader(res.getHeader("Set-Cookie"), SESSION_COOKIE_NAME);
  const intended = cookieIntended || {};
  return {
    event: "oauth_start",
    sessionExists: Boolean(req.session),
    oauthStateGenerated: Boolean(oauthStateGenerated),
    saveSucceeded: Boolean(saveSucceeded),
    ...cookieFlags,
    cookieSecureIntended: Boolean(intended.secure),
    cookieHttpOnlyIntended: intended.httpOnly !== false,
    cookieSameSiteIntended: intended.sameSite || null,
    host: String(req.get("host") || ""),
    xForwardedProto: String(req.get("x-forwarded-proto") || ""),
    reqSecure: Boolean(req.secure),
    isProduction: Boolean(isProduction),
    sessionIdHash: shortHash(sessionId),
    oauthStateHash: shortHash(oauthState),
    expectedHost: String(expectedHost || ""),
    hostMatchesExpected: String(req.get("host") || "") === String(expectedHost || "")
  };
}

function buildOauthCallbackDiagnostics({
  req,
  isProduction,
  expectedHost,
  requestState,
  sessionState,
  statesMatch,
  storeLookupSucceeded
}) {
  const requestStateHash = shortHash(requestState);
  const sessionStateHash = shortHash(sessionState);
  return {
    event: "oauth_callback",
    sessionExists: Boolean(req.session),
    sidCookieReceived: headerHasCookie(req.headers.cookie, SESSION_COOKIE_NAME),
    oauthStateInSession: Boolean(sessionState),
    requestStatePresent: Boolean(requestState),
    requestStateHash,
    sessionStateHash,
    statesMatch: Boolean(statesMatch),
    storeLookupSucceeded: Boolean(storeLookupSucceeded),
    host: String(req.get("host") || ""),
    xForwardedProto: String(req.get("x-forwarded-proto") || ""),
    reqSecure: Boolean(req.secure),
    isProduction: Boolean(isProduction),
    expectedHost: String(expectedHost || ""),
    hostMatchesExpected: String(req.get("host") || "") === String(expectedHost || ""),
    sessionIdHash: shortHash(req.sessionID),
    codePresent: Boolean(req.query && req.query.code)
  };
}

function assertDiagnosticsAreSafe(payload) {
  const serialized = JSON.stringify(payload);
  const forbidden = [
    /lead_admin_sid=[^;"\s]+/i,
    /"code"\s*:\s*"[^"]+"/i,
    /refresh_token/i,
    /access_token/i,
    /client_secret/i,
    /SESSION_SECRET/i,
    /TOKEN_ENCRYPTION_KEY/i
  ];
  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      throw new Error(`Unsafe OAuth diagnostic field matched ${pattern}`);
    }
  }
  if (payload.oauthState && String(payload.oauthState).length > 0) {
    throw new Error("Unsafe OAuth diagnostic: raw oauthState present");
  }
  if (payload.sessionID && String(payload.sessionID).length > 8) {
    throw new Error("Unsafe OAuth diagnostic: raw sessionID present");
  }
  return true;
}

function logOauthDiagnostic(payload, enabled = process.env.OAUTH_DIAGNOSTICS !== "0") {
  if (!enabled) return;
  assertDiagnosticsAreSafe(payload);
  console.info("[oauth-diag]", JSON.stringify(payload));
}

function lookupSessionStore(store, sessionId) {
  if (!store || typeof store.get !== "function" || !sessionId) {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    store.get(sessionId, (err, sess) => {
      resolve(Boolean(!err && sess));
    });
  });
}

function onResponseHeaders(res, listener) {
  if (!res || typeof res.writeHead !== "function" || typeof listener !== "function") {
    throw new TypeError("onResponseHeaders requires res.writeHead and a listener.");
  }
  const previous = res.writeHead;
  let fired = false;
  res.writeHead = function patchedWriteHead(...args) {
    if (!fired) {
      fired = true;
      res.writeHead = previous;
      listener();
    }
    return previous.apply(this, args);
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  shortHash,
  headerHasCookie,
  inspectSetCookieHeader,
  buildOauthStartDiagnostics,
  buildOauthCallbackDiagnostics,
  assertDiagnosticsAreSafe,
  logOauthDiagnostic,
  lookupSessionStore,
  onResponseHeaders
};
