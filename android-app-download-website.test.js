"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = __dirname;
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const siteConfig = fs.readFileSync(path.join(root, "public/site-config.js"), "utf8");
const androidDownload = fs.readFileSync(path.join(root, "public/android-download.js"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

test("login and sidebar expose Download Android App controls", () => {
  assert.match(indexHtml, /id="androidAppDownloadLogin"/);
  assert.match(indexHtml, /id="androidAppDownloadNav"/);
  assert.match(indexHtml, /data-android-app-download/);
  assert.match(indexHtml, />\s*Download Android App\s*</);
  assert.match(indexHtml, /Available for Android/);
  assert.match(indexHtml, /Manage your leads on the go with Website CRM\./);
  assert.match(indexHtml, /site-config\.js/);
  assert.match(indexHtml, /android-download\.js/);
  assert.doesNotMatch(indexHtml, /Available on Google Play|Official Google Play|Automatic updates|Latest version/i);
});

test("ANDROID_APP_DOWNLOAD_URL is owner-configured and not a fake production URL", () => {
  assert.match(siteConfig, /ANDROID_APP_DOWNLOAD_URL/);
  assert.match(siteConfig, /OWNER ACTION REQUIRED|official HTTPS/i);
  assert.match(siteConfig, /ANDROID_APP_DOWNLOAD_URL:\s*""/);
  assert.doesNotMatch(siteConfig, /https:\/\/lead-admin-panel\.vercel\.app\/.+\.apk/);
  assert.doesNotMatch(siteConfig, /https?:\/\/localhost/);
  assert.doesNotMatch(siteConfig, /exp\.host|expo\.dev\/artifacts/i);
  assert.doesNotMatch(siteConfig, /SESSION_SECRET|TURSO_AUTH_TOKEN|GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY/);
  assert.match(envExample, /public\/site-config\.js/);
  assert.match(envExample, /ANDROID_APP_DOWNLOAD_URL/);
});

test("android download wiring enables only https URLs and never invents one", () => {
  function runWithUrl(url) {
    const anchors = [
      {
        tagName: "A",
        href: "#",
        classList: {
          _c: new Set(["is-disabled"]),
          add(v) {
            this._c.add(v);
          },
          remove(v) {
            this._c.delete(v);
          },
          contains(v) {
            return this._c.has(v);
          }
        },
        attrs: {},
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        removeAttribute(k) {
          delete this.attrs[k];
        },
        addEventListener() {}
      }
    ];

    const sandbox = {
      window: {
        WEBSITE_CRM_PUBLIC_CONFIG: { ANDROID_APP_DOWNLOAD_URL: url }
      },
      document: {
        querySelectorAll() {
          return anchors;
        }
      }
    };

    vm.runInNewContext(androidDownload, sandbox);
    return anchors[0];
  }

  const empty = runWithUrl("");
  assert.equal(empty.href, "#");
  assert.equal(empty.attrs["aria-disabled"], "true");
  assert.equal(empty.classList.contains("is-disabled"), true);

  const http = runWithUrl("http://example.com/app.apk");
  assert.equal(http.href, "#");
  assert.equal(http.attrs["aria-disabled"], "true");

  const https = runWithUrl("https://downloads.example.com/website-crm.apk");
  assert.equal(https.href, "https://downloads.example.com/website-crm.apk");
  assert.equal(https.target, "_blank");
  assert.equal(https.rel, "noopener noreferrer");
  assert.equal(https.attrs["aria-disabled"], undefined);
  assert.equal(https.classList.contains("is-disabled"), false);
});
