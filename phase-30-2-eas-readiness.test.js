"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const mobile = path.join(root, "mobile");

const EXPECTED_PROJECT_ID = "371610cf-f7db-4582-a68f-bf5ae57741cd";
const EXPECTED_OWNER = "sainiankush16s-team";

test("EAS production profile is store AAB with HTTPS public env only", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(mobile, "eas.json"), "utf8"));
  assert.ok(eas.build.development);
  assert.ok(eas.build.preview);
  assert.ok(eas.build.production);
  assert.equal(eas.build.production.distribution, "store");
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(
    eas.build.production.env.EXPO_PUBLIC_API_BASE_URL,
    "https://lead-admin-panel.vercel.app"
  );
  assert.equal(
    eas.build.production.env.EXPO_PUBLIC_LEGAL_BASE_URL,
    "https://lead-admin-panel.vercel.app"
  );
  const envJson = JSON.stringify(eas.build.production.env);
  assert.doesNotMatch(envJson, /SESSION_SECRET|TOKEN_ENCRYPTION|TURSO_|GOOGLE_CLIENT_SECRET|ADMIN_PASSWORD/);
  assert.doesNotMatch(envJson, /localhost|127\.0\.0\.1|192\.168\./);
});

test("EAS project is linked with correct owner, projectId, and app identity", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(mobile, "app.json"), "utf8"));
  const config = fs.readFileSync(path.join(mobile, "lib/config.ts"), "utf8");

  assert.equal(appJson.expo.name, "Website CRM");
  assert.equal(appJson.expo.slug, "chaturx");
  assert.equal(appJson.expo.owner, EXPECTED_OWNER);
  assert.equal(appJson.expo.android.package, "com.chaturx.leads");
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.chaturx.leads");
  assert.equal(appJson.expo.version, "1.0.0");
  assert.equal(appJson.expo.android.versionCode, 1);
  assert.equal(appJson.expo.ios.buildNumber, "1");
  assert.equal(appJson.expo.extra?.eas?.projectId, EXPECTED_PROJECT_ID);

  assert.match(config, /__DEV__/);
  assert.match(config, /lead-admin-panel\.vercel\.app/);
  assert.match(config, /EXPO_PUBLIC_API_BASE_URL/);
  assert.match(config, /EXPO_PUBLIC_LEGAL_BASE_URL/);
});

test("screen capture and account deletion remain wired for production readiness", () => {
  const layout = fs.readFileSync(path.join(mobile, "app/(app)/_layout.tsx"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(mobile, "package.json"), "utf8"));
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(layout, /ScreenCaptureProtection/);
  assert.match(String(pkg.dependencies["expo-screen-capture"]), /57/);
  assert.match(server, /app\.delete\("\/api\/account"/);
  assert.match(server, /app\.get\("\/delete-account"/);
});

test("Phase 30.2 readiness document reflects linked EAS project and forbids claiming builds", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE_30_2_EAS_PRODUCTION_READINESS.md"), "utf8");
  assert.match(doc, /Website CRM/);
  assert.match(doc, /@sainiankush16s-team\/chaturx/);
  assert.match(doc, /371610cf-f7db-4582-a68f-bf5ae57741cd/);
  assert.match(doc, /LINKED AND VERIFIED/);
  assert.match(doc, /OWNER ACTION REQUIRED/);
  assert.match(doc, /NOT GENERATED/);
  assert.doesNotMatch(doc, /project \*\*unlinked\*\*|projectId.*\*\*Missing\*\*|login required for `eas project:info`/i);
  assert.doesNotMatch(doc, /IPA generated|AAB generated|submitted to (Apple|Google)/i);
});
