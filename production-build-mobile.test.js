"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const mobile = path.join(root, "mobile");

test("production identity remains Website CRM with preserved package IDs", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(mobile, "app.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(mobile, "package.json"), "utf8"));
  const eas = JSON.parse(fs.readFileSync(path.join(mobile, "eas.json"), "utf8"));

  assert.equal(appJson.expo.name, "Website CRM");
  assert.equal(appJson.expo.slug, "chaturx");
  assert.equal(appJson.expo.scheme, "chaturx");
  assert.equal(appJson.expo.version, "1.0.0");
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.chaturx.leads");
  assert.equal(appJson.expo.ios.buildNumber, "1");
  assert.equal(appJson.expo.android.package, "com.chaturx.leads");
  assert.equal(appJson.expo.android.versionCode, 1);
  assert.match(pkg.description, /Website CRM/);
  assert.doesNotMatch(pkg.description, /CHATURX|ChaturX|Ankush CRM/);

  assert.ok(eas.build.development);
  assert.ok(eas.build.preview);
  assert.ok(eas.build.production);
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(
    eas.build.production.env.EXPO_PUBLIC_API_BASE_URL,
    "https://lead-admin-panel.vercel.app"
  );
  assert.equal(
    eas.build.production.env.EXPO_PUBLIC_LEGAL_BASE_URL,
    "https://lead-admin-panel.vercel.app"
  );
  assert.equal(Object.prototype.hasOwnProperty.call(eas.build.production.env, "SESSION_SECRET"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(eas.build.production.env, "TOKEN_ENCRYPTION_KEY"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(eas.build.production.env, "TURSO_AUTH_TOKEN"), false);
});

test("icon and splash assets exist at production sizes", () => {
  const icon = path.join(mobile, "assets/images/icon.png");
  const splash = path.join(mobile, "assets/images/splash-icon.png");
  assert.ok(fs.existsSync(icon));
  assert.ok(fs.existsSync(splash));
  assert.ok(fs.statSync(icon).size > 1000);
  assert.ok(fs.statSync(splash).size > 1000);
});

test("mobile config avoids production localhost fallback and secrets", () => {
  const config = fs.readFileSync(path.join(mobile, "lib/config.ts"), "utf8");
  const envExample = fs.readFileSync(path.join(mobile, ".env.example"), "utf8");
  const secure = fs.readFileSync(path.join(mobile, "lib/secureSession.ts"), "utf8");

  assert.match(config, /__DEV__/);
  assert.match(config, /lead-admin-panel\.vercel\.app/);
  assert.match(config, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(config, /EXPO_PUBLIC_LEGAL_BASE_URL/);
  assert.doesNotMatch(config, /SESSION_SECRET|TOKEN_ENCRYPTION_KEY|TURSO_AUTH_TOKEN|GOOGLE_CLIENT_SECRET/);

  assert.match(envExample, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(envExample, /NEVER put server secrets/i);
  assert.doesNotMatch(envExample, /SESSION_SECRET=|TOKEN_ENCRYPTION_KEY=|TURSO_AUTH_TOKEN=/);

  assert.match(secure, /expo-secure-store/);
  assert.match(secure, /website_crm_mobile_session_token/);
  assert.doesNotMatch(secure, /password|refresh_token|AsyncStorage/);
});

test("app.json does not declare unused sensitive permissions", () => {
  const appJson = fs.readFileSync(path.join(mobile, "app.json"), "utf8");
  assert.doesNotMatch(appJson, /NSCamera|NSMicrophone|NSLocation|NSContacts|UIBackgroundModes|PERMISSION_READ_CONTACTS|ACCESS_FINE_LOCATION|RECORD_AUDIO|POST_NOTIFICATIONS/i);
  assert.doesNotMatch(appJson, /expo-notifications|firebase|@react-native-firebase/);
});

test("account deletion and legal routes remain wired for store readiness", () => {
  const more = fs.readFileSync(path.join(mobile, "app/(app)/more.tsx"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "public/privacy.html"), "utf8");
  const terms = fs.readFileSync(path.join(root, "public/terms.html"), "utf8");

  assert.match(more, /Delete Account/);
  assert.match(more, /Legal & Privacy/);
  assert.match(more, /getLegalBaseUrl/);
  assert.match(server, /app\.get\("\/privacy"/);
  assert.match(server, /app\.get\("\/terms"/);
  assert.match(server, /app\.get\("\/delete-account"/);
  assert.match(server, /app\.delete\("\/api\/account"/);
  assert.match(server, /app\.post\("\/api\/google\/disconnect"/);
  assert.match(privacy, /Website CRM/);
  assert.match(privacy, /\/delete-account/);
  assert.match(terms, /Website CRM/);
  assert.match(terms, /\/delete-account/);
  const deleteAccount = fs.readFileSync(path.join(root, "public/delete-account.html"), "utf8");
  assert.match(deleteAccount, /Website CRM/);
});

test("store readiness document exists", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE_30_STORE_READINESS.md"), "utf8");
  assert.match(doc, /Website CRM/);
  assert.match(doc, /com\.chaturx\.leads/);
  assert.match(doc, /OWNER INPUT REQUIRED/);
  assert.match(doc, /App Store/);
  assert.match(doc, /Google Play/);
  assert.doesNotMatch(doc, /guaranteed conversions|AI forecast|push notifications required/i);
});
