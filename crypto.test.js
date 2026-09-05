const assert = require("node:assert/strict");
const test = require("node:test");

process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { encrypt, decrypt } = require("./crypto");

test("refresh token encryption round-trips and is randomized", () => {
  const token = "refresh-token-value";
  const first = encrypt(token);
  const second = encrypt(token);

  assert.notEqual(first, second);
  assert.equal(decrypt(first), token);
});

test("invalid encrypted token is rejected", () => {
  assert.throws(() => decrypt("not-a-valid-payload"));
});
