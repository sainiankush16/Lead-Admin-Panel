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
  logoutConfirmationCopy
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

test("app info and legal links never invent URLs", () => {
  const info = mapAppInfo({ version: "1.0.0", buildNumber: "42", platform: "ios" });
  assert.equal(info.productName, "Website CRM");
  assert.equal(info.version, "1.0.0");
  assert.equal(info.buildNumber, "42");
  assert.equal(configuredLegalLinks({}).length, 0);
  assert.equal(
    configuredLegalLinks({ privacyPolicyUrl: "https://example.com/privacy" }).length,
    1
  );
});

test("logout confirmation copy and no sensitive fields in account view", () => {
  const copy = logoutConfirmationCopy();
  assert.equal(copy.title, "Logout");
  assert.match(copy.message, /signed out/i);
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

test("More screen uses confirmation logout and Website CRM branding", () => {
  const source = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/more.tsx"), "utf8");
  assert.match(source, /Alert\.alert/);
  assert.match(source, /logoutConfirmationCopy/);
  assert.match(source, /await logout\(/);
  assert.match(source, /BRAND_NAME/);
  assert.match(source, /Website CRM|BRAND_NAME/);
  assert.doesNotMatch(source, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(source, /password|sessionToken|Bearer /);
  assert.match(source, /mapAccountInfo/);
  assert.match(source, /mapAppInfo/);
});
