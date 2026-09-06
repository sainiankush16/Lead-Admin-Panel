"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  displayFieldValue,
  buildMailtoHref,
  findLeadIndexByRowNumber,
  buildLeadDetail
} = require("./mobile/utils/leadDetailCore");

function sampleProject() {
  return {
    id: 7,
    name: "Advitya Techno Park",
    columns: ["Full Name", "Phone", "Email", "Location", "Budget", "Lead Status", "Notes"],
    leadStatusColumn: "Lead Status",
    leads: [
      {
        "Full Name": "Satya Thakur",
        Phone: "9876543210",
        Email: "satya@example.com",
        Location: "Gurugram",
        Budget: "₹50 Lakh",
        "Lead Status": "Contacted",
        Notes: "Follow up next week"
      },
      {
        "Full Name": "",
        Phone: "",
        Email: "",
        Location: "",
        Budget: null,
        "Lead Status": "",
        Notes: undefined
      }
    ],
    rowNumbers: [2, 5]
  };
}

test("displayFieldValue and mailto helpers", () => {
  assert.equal(displayFieldValue(null), "—");
  assert.equal(displayFieldValue(""), "—");
  assert.equal(displayFieldValue("  Hello  "), "Hello");
  assert.equal(buildMailtoHref("satya@example.com"), "mailto:satya@example.com");
  assert.equal(buildMailtoHref("not-an-email"), null);
});

test("lead lookup uses row number not array index", () => {
  const project = sampleProject();
  assert.equal(findLeadIndexByRowNumber(project, 5), 1);
  assert.equal(findLeadIndexByRowNumber(project, 2), 0);
  assert.equal(findLeadIndexByRowNumber(project, 99), -1);
  assert.equal(findLeadIndexByRowNumber(project, 1), -1);
});

test("buildLeadDetail extracts primary and dynamic fields", () => {
  const detail = buildLeadDetail(sampleProject(), 2);
  assert.equal(detail.found, true);
  assert.equal(detail.projectName, "Advitya Techno Park");
  assert.equal(detail.name, "Satya Thakur");
  assert.equal(detail.phone, "9876543210");
  assert.equal(detail.email, "satya@example.com");
  assert.equal(detail.status, "Contacted");
  assert.equal(detail.telHref, "tel:+919876543210");
  assert.equal(detail.waHref, "https://wa.me/919876543210");
  assert.equal(detail.mailtoHref, "mailto:satya@example.com");
  assert.equal(detail.rowNumber, 2);
  assert.equal(detail.leadId, "2");

  const headers = detail.fields.map(f => f.header);
  assert.deepEqual(headers, ["Location", "Budget", "Notes"]);
  assert.equal(detail.fields.find(f => f.header === "Location").value, "Gurugram");
  assert.equal(headers.includes("Full Name"), false);
  assert.equal(headers.includes("Lead Status"), false);
});

test("blank lead fields and unknown status are safe", () => {
  const detail = buildLeadDetail(sampleProject(), 5);
  assert.equal(detail.found, true);
  assert.equal(detail.name, "Unnamed Lead");
  assert.equal(detail.phone, "");
  assert.equal(detail.telHref, null);
  assert.equal(detail.waHref, null);
  assert.equal(detail.mailtoHref, null);
  assert.equal(detail.status, "Unknown");
  assert.equal(detail.fields.find(f => f.header === "Location").value, "—");
  assert.equal(detail.fields.find(f => f.header === "Budget").value, "—");
});

test("missing lead returns not_found", () => {
  const missing = buildLeadDetail(sampleProject(), 99);
  assert.equal(missing.found, false);
  assert.equal(missing.error, "not_found");
});
