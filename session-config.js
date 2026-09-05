"use strict";

const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function shouldTrustProxy(env = process.env) {
  return env.TRUST_PROXY === "true" || env.VERCEL === "1";
}

function requiresHttpsBaseUrl(env = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

function buildSessionCookieOptions(isProduction) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(isProduction),
    maxAge: SESSION_COOKIE_MAX_AGE_MS
  };
}

function buildSessionOptions({ isProduction, secret, store }) {
  return {
    name: "lead_admin_sid",
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    // Required behind Vercel/TLS-terminating proxies so secure cookies are emitted.
    proxy: true,
    cookie: buildSessionCookieOptions(isProduction)
  };
}

function oauthStatesMatch(requestState, sessionState) {
  const { safeEqual } = require("./api-guards");
  return safeEqual(String(requestState || ""), String(sessionState || ""));
}

function isValidOauthCallback({ code, requestState, sessionState }) {
  return Boolean(code) && oauthStatesMatch(requestState, sessionState);
}

module.exports = {
  SESSION_COOKIE_MAX_AGE_MS,
  shouldTrustProxy,
  requiresHttpsBaseUrl,
  buildSessionCookieOptions,
  buildSessionOptions,
  oauthStatesMatch,
  isValidOauthCallback
};
