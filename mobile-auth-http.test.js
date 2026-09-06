"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

test("mobile auth HTTP route contracts preserve web cookie CSRF logout", () => {
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(source, /app\.post\("\/api\/mobile\/auth\/login"/);
  assert.match(source, /app\.get\("\/api\/mobile\/auth\/me"/);
  assert.match(source, /app\.post\("\/api\/mobile\/auth\/logout"/);
  assert.match(source, /resolveMobileBearerAuth/);
  assert.match(source, /shouldBypassBrowserCsrf/);
  assert.match(source, /app\.post\("\/api\/auth\/logout", requireAuth, csrfProtection/);
  assert.doesNotMatch(source, /sessionToken:\s*req\.sessionID/);
  assert.match(source, /issueMobileSessionToken/);
  assert.match(source, /ensureMobileSessionTokenSchema/);
});
