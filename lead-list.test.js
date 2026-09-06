"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  buildTelHref,
  buildWhatsAppHref,
  phonesMatchForSearch,
  normalizePhoneForLinks
} = require("./mobile/utils/phoneHelpersCore");
const { buildLeadListItems, filterLeadListItems } = require("./mobile/utils/leadListCore");

test("name phone email column detection", () => {
  assert.equal(findNameColumn(["Email", "Full Name", "Phone"]), "Full Name");
  assert.equal(findPhoneColumn(["Name", "Mobile Number"]), "Mobile Number");
  assert.equal(findEmailColumn(["E-mail"]), "E-mail");
});

test("call and WhatsApp URL generation", () => {
  assert.equal(buildTelHref("9876543210"), "tel:+919876543210");
  assert.equal(buildWhatsAppHref("9876543210"), "https://wa.me/919876543210");
  assert.equal(buildWhatsAppHref("+919876543210"), "https://wa.me/919876543210");
  assert.equal(normalizePhoneForLinks(""), null);
});

test("buildLeadListItems maps rows and unknown status", () => {
  const items = buildLeadListItems({
    id: 1,
    name: "Alpha",
    columns: ["Full Name", "Phone", "Email", "Lead Status"],
    leadStatusColumn: "Lead Status",
    leads: [
      {
        "Full Name": "Satya Thakur",
        Phone: "9876543210",
        Email: "satya@gmail.com",
        "Lead Status": "Contacted"
      },
      {
        "Full Name": "",
        Phone: "",
        Email: "",
        "Lead Status": ""
      }
    ],
    rowNumbers: [2, 3]
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Satya Thakur");
  assert.equal(items[0].status, "Contacted");
  assert.equal(items[0].telHref, "tel:+919876543210");
  assert.equal(items[1].name, "Unnamed Lead");
  assert.equal(items[1].status, "Unknown");
  assert.equal(items[1].telHref, null);
});

test("search and status filter work together", () => {
  const items = buildLeadListItems({
    id: 1,
    name: "Alpha",
    columns: ["Name", "Phone", "Email", "Lead Status"],
    leadStatusColumn: "Lead Status",
    leads: [
      { Name: "Satya Thakur", Phone: "9876543210", Email: "a@gmail.com", "Lead Status": "Contacted" },
      { Name: "Satya Other", Phone: "9000000001", Email: "b@x.com", "Lead Status": "New" },
      { Name: "Rahul", Phone: "9111111111", Email: "c@gmail.com", "Lead Status": "Contacted" }
    ],
    rowNumbers: [2, 3, 4]
  });

  const byName = filterLeadListItems(items, { query: "satya", status: "All" });
  assert.equal(byName.length, 2);

  const byPhone = filterLeadListItems(items, { query: "9876543210", status: "All" });
  assert.equal(byPhone.length, 1);
  assert.equal(byPhone[0].name, "Satya Thakur");

  const byEmail = filterLeadListItems(items, { query: "gmail.com", status: "All" });
  assert.equal(byEmail.length, 2);

  const combined = filterLeadListItems(items, { query: "Satya", status: "Contacted" });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].name, "Satya Thakur");

  assert.equal(phonesMatchForSearch("9876543210", "+91 9876543210"), true);
});

test("empty leads list stays empty", () => {
  const items = buildLeadListItems({
    id: 9,
    name: "Empty",
    columns: ["Name"],
    leadStatusColumn: null,
    leads: [],
    rowNumbers: []
  });
  assert.deepEqual(items, []);
  assert.deepEqual(filterLeadListItems(items, { query: "x" }), []);
});
