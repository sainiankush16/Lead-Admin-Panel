"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ROLES, canAccessProject } = require("./authz");
const {
  validateSearchQuery,
  matchLeadFields,
  searchSheetData,
  searchAcrossAuthorizedProjects,
  resultContainsForbiddenSecrets,
  sanitizeSearchHit
} = require("./lead-search");
const {
  findEmailColumn,
  phonesMatchForSearch,
  phoneSearchDigits
} = require("./public/phone-helpers");

const COLUMNS = ["Full Name", "Mobile Number", "Email Address", "Lead Status", "City"];

function sampleProjects() {
  return [
    {
      id: 1,
      name: "Advitya Techno Park",
      spreadsheet_name: "Advitya techno Park",
      sheet_title: "Advitya Techno Park Leads",
      spreadsheet_id: "SECRET_SHEET_A"
    },
    {
      id: 2,
      name: "Mayur City",
      spreadsheet_name: "Mayur City Sheet",
      sheet_title: "Mayur Leads",
      spreadsheet_id: "SECRET_SHEET_B"
    },
    {
      id: 3,
      name: "Unassigned Tower",
      spreadsheet_name: "Hidden",
      sheet_title: "Hidden Tab",
      spreadsheet_id: "SECRET_SHEET_C"
    }
  ];
}

function sheetFor(projectId) {
  if (projectId === 1) {
    return {
      columns: COLUMNS,
      leads: [
        {
          "Full Name": "Satya Thakur",
          "Mobile Number": "+91 9876543210",
          "Email Address": "satya@example.com",
          "Lead Status": "Contacted",
          City: "Pune"
        },
        {
          "Full Name": "Other Person",
          "Mobile Number": "9000000001",
          "Email Address": "other@example.com",
          "Lead Status": "New",
          City: "Pune"
        }
      ],
      rowNumbers: [2, 3]
    };
  }
  if (projectId === 2) {
    return {
      columns: COLUMNS,
      leads: [
        {
          "Full Name": "Same Phone Lead",
          "Mobile Number": "9876543210",
          "Email Address": "same@mayur.test",
          "Lead Status": "Follow Up",
          City: "Noida"
        }
      ],
      rowNumbers: [2]
    };
  }
  return {
    columns: COLUMNS,
    leads: [
      {
        "Full Name": "Secret Lead",
        "Mobile Number": "9876543210",
        "Email Address": "secret@hidden.test",
        "Lead Status": "New",
        City: "Hidden"
      }
    ],
    rowNumbers: [2]
  };
}

test("search query validation requires a sensible length", () => {
  assert.equal(validateSearchQuery("").error.includes("2"), true);
  assert.equal(validateSearchQuery("a").error.includes("2"), true);
  assert.equal(validateSearchQuery("ab").value, "ab");
  assert.ok(validateSearchQuery("x".repeat(200)).error);
});

test("phone normalization treats common Indian formats as the same number", () => {
  const formats = [
    "9876543210",
    "+91 9876543210",
    "91 9876543210",
    "91-9876543210",
    "+91-9876543210",
    "(987) 654-3210"
  ];
  for (const a of formats) {
    for (const b of formats) {
      assert.equal(phonesMatchForSearch(a, b), true, `${a} vs ${b}`);
    }
  }
  assert.ok(phoneSearchDigits("+91 9876543210").includes("919876543210"));
  assert.equal(phonesMatchForSearch("9876543210", "9000000001"), false);
});

test("email column detection and email field search", () => {
  assert.equal(findEmailColumn(["Name", "E-mail", "Phone"]), "E-mail");
  assert.equal(findEmailColumn(["Email Address"]), "Email Address");
  const reasons = matchLeadFields({
    lead: {
      "Full Name": "Satya Thakur",
      "Mobile Number": "9000000001",
      "Email Address": "satya@example.com",
      "Lead Status": "New"
    },
    columns: COLUMNS,
    query: "satya@example.com"
  });
  assert.deepEqual(reasons, ["email"]);
});

test("name search matches without requiring phone", () => {
  const reasons = matchLeadFields({
    lead: {
      "Full Name": "Satya Thakur",
      "Mobile Number": "9000000001",
      "Email Address": "x@y.z",
      "Lead Status": "New"
    },
    columns: COLUMNS,
    query: "thakur"
  });
  assert.deepEqual(reasons, ["name"]);
});

test("admin search scope returns matches from all projects", async () => {
  const projects = sampleProjects();
  const admin = { is_active: 1, role: ROLES.ADMIN };
  assert.equal(canAccessProject(admin, false).ok, true);

  const outcome = await searchAcrossAuthorizedProjects({
    projects,
    query: "9876543210",
    loadSheet: async project => sheetFor(project.id)
  });

  assert.equal(outcome.error, undefined);
  assert.equal(outcome.count, 3);
  assert.deepEqual(
    outcome.results.map(r => r.projectName).sort(),
    ["Advitya Techno Park", "Mayur City", "Unassigned Tower"].sort()
  );
  assert.equal(resultContainsForbiddenSecrets(outcome), false);
});

test("project user search scope is limited to assigned projects only", async () => {
  const all = sampleProjects();
  const assigned = all.filter(p => p.id === 1 || p.id === 2);
  const member = { is_active: 1, role: ROLES.PROJECT_USER };
  assert.equal(canAccessProject(member, true).ok, true);
  assert.equal(canAccessProject(member, false).status, 403);

  const outcome = await searchAcrossAuthorizedProjects({
    projects: assigned,
    query: "9876543210",
    loadSheet: async project => sheetFor(project.id)
  });

  assert.equal(outcome.count, 2);
  assert.ok(outcome.results.every(r => r.projectId === 1 || r.projectId === 2));
  assert.equal(outcome.results.some(r => r.projectName === "Unassigned Tower"), false);
  assert.equal(outcome.results.some(r => r.name === "Secret Lead"), false);
});

test("multiple matching projects are returned as separate records", async () => {
  const outcome = await searchAcrossAuthorizedProjects({
    projects: sampleProjects().filter(p => p.id === 1 || p.id === 2),
    query: "9876543210",
    loadSheet: async project => sheetFor(project.id)
  });
  assert.equal(outcome.count, 2);
  assert.equal(outcome.results[0].projectId !== outcome.results[1].projectId, true);
  assert.equal(outcome.results.some(r => r.name === "Satya Thakur"), true);
  assert.equal(outcome.results.some(r => r.name === "Same Phone Lead"), true);
});

test("no-result state returns empty authorized list", async () => {
  const outcome = await searchAcrossAuthorizedProjects({
    projects: sampleProjects().slice(0, 2),
    query: "nobody-here",
    loadSheet: async project => sheetFor(project.id)
  });
  assert.equal(outcome.count, 0);
  assert.deepEqual(outcome.results, []);
});

test("Google Sheets errors are handled without leaking other project data incorrectly", async () => {
  const outcome = await searchAcrossAuthorizedProjects({
    projects: sampleProjects().slice(0, 2),
    query: "9876543210",
    loadSheet: async project => {
      if (project.id === 1) throw new Error("Sheets API unavailable");
      return sheetFor(project.id);
    }
  });
  assert.equal(outcome.count, 1);
  assert.equal(outcome.results[0].projectId, 2);
  assert.equal(outcome.sheetErrors.length, 1);
  assert.equal(outcome.sheetErrors[0].projectId, 1);
});

test("total Google failure surfaces a search error", async () => {
  const outcome = await searchAcrossAuthorizedProjects({
    projects: sampleProjects().slice(0, 1),
    query: "9876543210",
    loadSheet: async () => {
      throw new Error("boom");
    }
  });
  assert.equal(outcome.statusCode, 502);
  assert.ok(outcome.error);
});

test("search hits never include spreadsheet ids or tokens", () => {
  const hit = sanitizeSearchHit({
    project: sampleProjects()[0],
    lead: sheetFor(1).leads[0],
    rowNumber: 2,
    columns: COLUMNS,
    matchedOn: ["phone"]
  });
  assert.equal(hit.rowNumber, 2);
  assert.equal(hit.leadId, "2");
  assert.equal(hit.status, "Contacted");
  assert.equal(resultContainsForbiddenSecrets(hit), false);
  assert.equal(Object.prototype.hasOwnProperty.call(hit, "spreadsheetId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(hit, "spreadsheet_id"), false);
});

test("Open Lead payload identifies project and row for existing detail view", () => {
  const hits = searchSheetData({
    project: sampleProjects()[0],
    columns: COLUMNS,
    leads: sheetFor(1).leads,
    rowNumbers: sheetFor(1).rowNumbers,
    query: "Satya"
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].projectId, 1);
  assert.equal(hits[0].rowNumber, 2);
  assert.equal(hits[0].leadId, "2");
});

test("desktop search contract: mobile layout helpers still resolve name/phone", () => {
  const { findNameColumn, findPhoneColumn } = require("./public/phone-helpers");
  assert.equal(findNameColumn(COLUMNS), "Full Name");
  assert.equal(findPhoneColumn(COLUMNS), "Mobile Number");
});

test("search route requires authentication middleware in server", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(source, /app\.get\("\/api\/leads\/search", requireAuth/);
  assert.doesNotMatch(source, /app\.get\("\/api\/leads\/search",\s*async/);
});

test("existing lead status remarks and timeline modules remain intact", () => {
  const { normalizeLeadStatus } = require("./lead-status");
  const timeline = require("./lead-timeline");
  const remarks = require("./lead-remarks");
  assert.equal(normalizeLeadStatus("Contacted"), "Contacted");
  assert.ok(timeline.TIMELINE_EVENT_TYPES);
  assert.equal(typeof remarks.createRemark, "function");
});
