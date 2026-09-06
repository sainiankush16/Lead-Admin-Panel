"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const mobile = path.join(root, "mobile");

test("Android target SDK resolves to API 36 via Expo 57 / RN 0.86", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(mobile, "package.json"), "utf8"));
  assert.match(String(pkg.dependencies.expo), /57/);
  assert.equal(pkg.dependencies["react-native"], "0.86.3");

  const rnVersions = fs.readFileSync(
    path.join(mobile, "node_modules/react-native/gradle/libs.versions.toml"),
    "utf8"
  );
  assert.match(rnVersions, /targetSdk\s*=\s*"36"/);
  assert.match(rnVersions, /compileSdk\s*=\s*"36"/);
  assert.match(rnVersions, /minSdk\s*=\s*"24"/);
  assert.match(rnVersions, /agp\s*=\s*"8\.12\.0"/);
  assert.match(rnVersions, /kotlin\s*=\s*"2\.1\.20"/);

  const expoDefaults = fs.readFileSync(
    path.join(mobile, "node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle"),
    "utf8"
  );
  assert.match(expoDefaults, /compileSdkVersion[\s\S]*36/);
  assert.match(expoDefaults, /targetSdkVersion[\s\S]*36/);
  assert.match(expoDefaults, /minSdkVersion[\s\S]*24/);
});

test("package identity, version codes, and no unused Android permission declarations", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(mobile, "app.json"), "utf8"));
  assert.equal(appJson.expo.name, "Website CRM");
  assert.equal(appJson.expo.android.package, "com.chaturx.leads");
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.chaturx.leads");
  assert.equal(appJson.expo.version, "1.0.0");
  assert.equal(appJson.expo.android.versionCode, 1);
  assert.equal(appJson.expo.ios.buildNumber, "1");

  const raw = JSON.stringify(appJson);
  assert.doesNotMatch(
    raw,
    /CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|READ_CONTACTS|WRITE_CONTACTS|READ_CALENDAR|WRITE_CALENDAR|BLUETOOTH|POST_NOTIFICATIONS|FOREGROUND_SERVICE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|SEND_SMS|READ_SMS|CALL_PHONE/i
  );
});

test("production API and legal URLs are HTTPS public hosts", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(mobile, "eas.json"), "utf8"));
  const api = eas.build.production.env.EXPO_PUBLIC_API_BASE_URL;
  const legal = eas.build.production.env.EXPO_PUBLIC_LEGAL_BASE_URL;
  assert.match(api, /^https:\/\//);
  assert.match(legal, /^https:\/\//);
  assert.doesNotMatch(api, /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./);
  assert.doesNotMatch(legal, /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./);
});

test("public delete-account page is request-only and secret-free", () => {
  const page = fs.readFileSync(path.join(root, "public/delete-account.html"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "public/privacy.html"), "utf8");
  const terms = fs.readFileSync(path.join(root, "public/terms.html"), "utf8");

  assert.match(server, /app\.get\("\/delete-account"/);
  assert.match(page, /Website CRM/);
  assert.match(page, /No login is required/i);
  assert.match(page, /\[PRIVACY CONTACT EMAIL\]/);
  assert.match(page, /\[SUPPORT EMAIL\]/);
  assert.match(page, /Deleted User/);
  assert.match(page, /does not delete Google Sheets/i);
  assert.match(page, /does <strong>not<\/strong> delete accounts/i);
  assert.doesNotMatch(page, /SESSION_SECRET|TOKEN_ENCRYPTION_KEY|TURSO_AUTH_TOKEN|password_hash|refresh_token_enc/);
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|\/api\/account/);

  assert.match(privacy, /\/delete-account/);
  assert.match(privacy, /irreversibly de-identifies/i);
  assert.match(terms, /\/delete-account/);
});

test("compliance document records Play API 36 requirement and deletion classification", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE_30_1_COMPLIANCE.md"), "utf8");
  assert.match(doc, /API level 36|API 36/);
  assert.match(doc, /August 31, 2026/);
  assert.match(doc, /TARGET SDK COMPLIANT/);
  assert.match(doc, /PERSONAL ACCOUNT DATA/);
  assert.match(doc, /\/delete-account/);
  assert.match(doc, /preservedGoogleAuthorization|Google authorization/i);
  assert.match(doc, /com\.chaturx\.leads/);
  assert.doesNotMatch(doc, /BLOCKED — CONTROLLED EXPO\/RN UPGRADE REQUIRED/);
});

test("static secret scan distinguishes placeholders from credential assignments", () => {
  const sensitiveFiles = [
    "mobile/lib/config.ts",
    "mobile/eas.json",
    "mobile/app.json",
    "public/privacy.html",
    "public/terms.html",
    "public/delete-account.html",
    "account-deletion.js"
  ];
  for (const rel of sensitiveFiles) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(text, /SESSION_SECRET\s*=\s*['"][^'"]+['"]/);
    assert.doesNotMatch(text, /TOKEN_ENCRYPTION_KEY\s*=\s*['"][^'"]+['"]/);
    assert.doesNotMatch(text, /TURSO_AUTH_TOKEN\s*=\s*['"][^'"]+['"]/);
    assert.doesNotMatch(text, /client_secret\s*[:=]\s*['"][A-Za-z0-9_-]{8,}['"]/);
    assert.doesNotMatch(text, /refresh_token\s*[:=]\s*['"]1\/[A-Za-z0-9_-]+['"]/);
  }
});
