"use strict";

function displayRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "project_user") return "Project User";
  return "User";
}

function displayAccountStatus(isActive) {
  if (isActive == null) return null;
  return isActive ? "Active" : "Inactive";
}

function mapAccountInfo(user) {
  if (!user || typeof user !== "object") {
    return {
      name: "—",
      loginId: "—",
      roleLabel: "User",
      statusLabel: null
    };
  }
  const name = String(user.name || "").trim();
  const loginId = String(user.loginId || "").trim();
  return {
    name: name || loginId || "—",
    loginId: loginId || "—",
    roleLabel: displayRoleLabel(user.role),
    statusLabel: displayAccountStatus(
      typeof user.isActive === "boolean" ? user.isActive : null
    )
  };
}

function mapAppInfo({ version, buildNumber, platform } = {}) {
  const appVersion = String(version || "").trim() || "—";
  const build = String(buildNumber || "").trim() || null;
  const platformLabel = String(platform || "").trim() || null;
  return {
    productName: "Website CRM",
    tagline: "Lead Management CRM",
    version: appVersion,
    buildNumber: build,
    platform: platformLabel
  };
}

function configuredLegalLinks(config = {}) {
  const links = [];
  const privacy = String(config.privacyPolicyUrl || "").trim();
  const terms = String(config.termsUrl || "").trim();
  const support = String(config.supportUrl || "").trim();
  if (privacy) links.push({ label: "Privacy Policy", url: privacy });
  if (terms) links.push({ label: "Terms of Service", url: terms });
  if (support) links.push({ label: "Support", url: support });
  return links;
}

function accountViewContainsSensitiveFields(viewModel) {
  const text = JSON.stringify(viewModel || {});
  return /password|sessionToken|bearer|refresh_token|access_token|SESSION_SECRET|TOKEN_ENCRYPTION|password_hash/i.test(
    text
  );
}

function logoutConfirmationCopy() {
  return {
    title: "Logout",
    message: "You will be signed out of Website CRM on this device.",
    cancel: "Cancel",
    confirm: "Logout"
  };
}

module.exports = {
  displayRoleLabel,
  displayAccountStatus,
  mapAccountInfo,
  mapAppInfo,
  configuredLegalLinks,
  accountViewContainsSensitiveFields,
  logoutConfirmationCopy
};
