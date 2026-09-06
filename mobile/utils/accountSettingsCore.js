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

function normalizeLegalBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\/$/, "");
}

function configuredLegalLinks(config = {}) {
  const base = normalizeLegalBaseUrl(config.legalBaseUrl);
  const privacy =
    String(config.privacyPolicyUrl || "").trim() || (base ? `${base}/privacy` : "");
  const terms = String(config.termsUrl || "").trim() || (base ? `${base}/terms` : "");
  const deleteAccount =
    String(config.deleteAccountUrl || "").trim() ||
    (base ? `${base}/delete-account` : "");
  const support = String(config.supportUrl || "").trim();

  const links = [];
  if (privacy) links.push({ label: "Privacy Policy", url: privacy });
  if (terms) links.push({ label: "Terms of Use", url: terms });
  if (deleteAccount) {
    links.push({ label: "Account Deletion (Web)", url: deleteAccount });
  }
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

function deleteAccountConfirmationCopy() {
  return {
    title: "Delete Account",
    message:
      "This permanently deletes your Website CRM account and signs you out on all devices. Lead data in Google Sheets and shared projects is not deleted. This cannot be undone.",
    cancel: "Cancel",
    confirm: "Delete Account",
    confirmToken: "DELETE"
  };
}

function mapDeleteAccountError(status, fallbackMessage) {
  const code = Number(status);
  if (code === 401) return "Your session has expired. Please login again.";
  if (code === 403) {
    return (
      fallbackMessage ||
      "This account cannot be deleted right now. If you are the only administrator, create another admin first."
    );
  }
  if (code === 400) return fallbackMessage || "Deletion was not confirmed.";
  if (!Number.isFinite(code) || code === 0) {
    return "Please check your internet connection and try again.";
  }
  return "Unable to delete account. Please try again.";
}

module.exports = {
  displayRoleLabel,
  displayAccountStatus,
  mapAccountInfo,
  mapAppInfo,
  normalizeLegalBaseUrl,
  configuredLegalLinks,
  accountViewContainsSensitiveFields,
  logoutConfirmationCopy,
  deleteAccountConfirmationCopy,
  mapDeleteAccountError
};
