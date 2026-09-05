"use strict";

/**
 * Ensures a Google OAuth start navigation happens at most once per page life.
 * Used by the frontend once-guard and covered by unit tests.
 */
function createGoogleLoginStarter(assignLocation, oauthPath = "/api/auth/google?returnTo=/") {
  if (typeof assignLocation !== "function") {
    throw new Error("assignLocation function is required.");
  }
  let started = false;
  return function googleLogin() {
    if (started) return { navigated: false, duplicate: true };
    started = true;
    assignLocation(oauthPath);
    return { navigated: true, duplicate: false };
  };
}

module.exports = { createGoogleLoginStarter };
