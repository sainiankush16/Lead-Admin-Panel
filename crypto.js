const crypto = require("crypto");

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
  }
  return Buffer.from(hex, "hex");
}

function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

function decrypt(payload) {
  const key = getKey();
  const [ivB64, tagB64, ciphertextB64] = String(payload).split(".");
  if (!ivB64 || !tagB64 || !ciphertextB64) throw new Error("Invalid encrypted token.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

module.exports = { getKey, encrypt, decrypt };
