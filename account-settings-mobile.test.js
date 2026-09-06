"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  displayRoleLabel,
  mapAccountInfo,
  mapAppInfo,
  configuredLegalLinks,
  accountViewContainsSensitiveFields,
  logoutConfirmationCopy,
  deleteAccountConfirmationCopy,
  mapDeleteAccountError
} = require("./mobile/utils/accountSettingsCore");

test("account information maps safely for admin and project user", () => {
  const admin = mapAccountInfo({
    id: 1,
    name: "Admin User",
    loginId: "admin01",
    role: "admin",
    isActive: true
  });
  assert.equal(admin.roleLabel, "Admin");
  assert.equal(admin.statusLabel, "Active");
  assert.equal(admin.loginId, "admin01");

  const member = mapAccountInfo({
    id: 2,
    name: "",
    loginId: "sales01",
    role: "project_user",
    isActive: false
  });
  assert.equal(member.roleLabel, "Project User");
  assert.equal(member.name, "sales01");
  assert.equal(member.statusLabel, "Inactive");
  assert.equal(displayRoleLabel("admin"), "Admin");
});

test("missing optional account fields use placeholders", () => {
  const empty = mapAccountInfo(null);
  assert.equal(empty.name, "—");
  assert.equal(empty.loginId, "—");
  assert.equal(empty.statusLabel, null);
});

test("app info and legal links never invent unsupported support URLs", () => {
  const info = mapAppInfo({ version: "1.0.0", buildNumber: "42", platform: "ios" });
  assert.equal(info.productName, "Website CRM");
  assert.equal(info.version, "1.0.0");
  assert.equal(info.buildNumber, "42");
  assert.equal(configuredLegalLinks({}).length, 0);
  assert.equal(
    configuredLegalLinks({ privacyPolicyUrl: "https://example.com/privacy" }).length,
    1
  );
  const fromBase = configuredLegalLinks({ legalBaseUrl: "https://lead-admin-panel.vercel.app" });
  assert.equal(fromBase.length, 3);
  assert.equal(fromBase[0].label, "Privacy Policy");
  assert.equal(fromBase[0].url, "https://lead-admin-panel.vercel.app/privacy");
  assert.equal(fromBase[1].label, "Terms of Use");
  assert.equal(fromBase[1].url, "https://lead-admin-panel.vercel.app/terms");
  assert.equal(fromBase[2].label, "Account Deletion (Web)");
  assert.equal(fromBase[2].url, "https://lead-admin-panel.vercel.app/delete-account");
});

test("logout and delete-account confirmation copy", () => {
  const copy = logoutConfirmationCopy();
  assert.equal(copy.title, "Logout");
  assert.match(copy.message, /signed out/i);
  const del = deleteAccountConfirmationCopy();
  assert.equal(del.title, "Delete Account");
  assert.match(del.message, /permanently/i);
  assert.equal(del.confirmToken, "DELETE");
  assert.equal(mapDeleteAccountError(401), "Your session has expired. Please login again.");
  assert.match(mapDeleteAccountError(403), /administrator|cannot be deleted/i);
  const view = mapAccountInfo({
    id: 1,
    name: "A",
    loginId: "a",
    role: "admin",
    isActive: true
  });
  assert.equal(accountViewContainsSensitiveFields(view), false);
  assert.equal(
    accountViewContainsSensitiveFields({ password: "x", sessionToken: "t" }),
    true
  );
});

test("More screen uses confirmation logout, delete account, and Website CRM branding", () => {
  const source = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/more.tsx"), "utf8");
  assert.match(source, /Alert\.alert/);
  assert.match(source, /logoutConfirmationCopy/);
  assert.match(source, /deleteAccountConfirmationCopy/);
  assert.match(source, /await logout\(/);
  assert.match(source, /api\.deleteAccount/);
  assert.match(source, /BRAND_NAME/);
  assert.match(source, /Website CRM|BRAND_NAME/);
  assert.match(source, /Legal & Privacy/);
  assert.doesNotMatch(source, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(source, /password|sessionToken|Bearer /);
  assert.match(source, /mapAccountInfo/);
  assert.match(source, /mapAppInfo/);
});
