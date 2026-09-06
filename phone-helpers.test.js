"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  normalizePhoneForLinks,
  phonesMatchForSearch,
  buildTelHref,
  buildWhatsAppHref
} = require("./public/phone-helpers");

test("name column detection accepts common header variations", () => {
  assert.equal(findNameColumn(["Email", "Full Name", "Phone"]), "Full Name");
  assert.equal(findNameColumn(["Lead Name", "Mobile"]), "Lead Name");
  assert.equal(findNameColumn(["Customer Name"]), "Customer Name");
  assert.equal(findNameColumn(["Email", "City"]), null);
});

test("phone column detection accepts common header variations", () => {
  assert.equal(findPhoneColumn(["Name", "Phone Number", "Email"]), "Phone Number");
  assert.equal(findPhoneColumn(["Mobile", "Name"]), "Mobile");
  assert.equal(findPhoneColumn(["Contact Number"]), "Contact Number");
  assert.equal(findPhoneColumn(["Name", "Email"]), null);
});

test("Indian 10-digit numbers normalize for tel and WhatsApp", () => {
  const result = normalizePhoneForLinks("9876543210");
  assert.equal(result.display, "9876543210");
  assert.equal(result.telHref, "tel:+919876543210");
  assert.equal(result.waHref, "https://wa.me/919876543210");
  assert.equal(buildTelHref("98765 43210"), "tel:+919876543210");
  assert.equal(buildWhatsAppHref("(987) 654-3210"), "https://wa.me/919876543210");
});

test("international numbers are not incorrectly prefixed with 91", () => {
  assert.equal(buildTelHref("+919876543210"), "tel:+919876543210");
  assert.equal(buildWhatsAppHref("+919876543210"), "https://wa.me/919876543210");
  assert.equal(buildWhatsAppHref("919876543210"), "https://wa.me/919876543210");
  assert.equal(buildTelHref("+14155552671"), "tel:+14155552671");
  assert.equal(buildWhatsAppHref("+14155552671"), "https://wa.me/14155552671");
});

test("missing or invalid phones disable link generation", () => {
  assert.equal(normalizePhoneForLinks(""), null);
  assert.equal(normalizePhoneForLinks("   "), null);
  assert.equal(normalizePhoneForLinks("not-a-phone"), null);
  assert.equal(normalizePhoneForLinks("12345"), null);
  assert.equal(buildTelHref(null), null);
  assert.equal(buildWhatsAppHref(undefined), null);
});

test("email column detection accepts common header variations", () => {
  assert.equal(findEmailColumn(["Name", "Email", "Phone"]), "Email");
  assert.equal(findEmailColumn(["E-mail"]), "E-mail");
  assert.equal(findEmailColumn(["Email Address"]), "Email Address");
  assert.equal(findEmailColumn(["Name", "City"]), null);
});

test("phone search matching normalizes formatting without rewriting stored values", () => {
  assert.equal(phonesMatchForSearch("9876543210", "+91-9876543210"), true);
  assert.equal(phonesMatchForSearch("91 9876543210", "9876543210"), true);
  assert.equal(phonesMatchForSearch("9876543210", "9111111111"), false);
});

test("mobile card field contract: name phone actions status order helpers", () => {
  const columns = ["Email", "Name", "Phone", "Lead Status", "City"];
  assert.equal(findNameColumn(columns), "Name");
  assert.equal(findPhoneColumn(columns), "Phone");
  const links = normalizePhoneForLinks("9876543210");
  assert.ok(links.telHref.startsWith("tel:"));
  assert.ok(links.waHref.startsWith("https://wa.me/"));
});
