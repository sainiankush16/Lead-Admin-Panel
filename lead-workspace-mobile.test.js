"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  getWorkNextLead,
  collectActionCenterItems,
  getActionCenterSummary
} = require("./mobile/utils/actionCenterCore");
const { buildWorkThisLeadSummary } = require("./mobile/utils/leadWorkspaceCore");

function project(partial) {
  return {
    sheetName: "Leads",
    spreadsheetId: "hidden",
    spreadsheetName: "Sheet",
    sheetId: 1,
    columns: ["Name", "Phone", "Email", "Lead Status"],
    lastSync: null,
    rowNumbers: (partial.leads || []).map((_, i) => i + 2),
    leadStatusColumn: "Lead Status",
    ...partial
  };
}

function leadRow(name, status, phone = "9876543210", email = "") {
  return { Name: name, Phone: phone, Email: email, "Lead Status": status };
}

test("Work Next chooses Follow Up over Interested", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("Int", "Interested"), leadRow("Fu", "Follow Up")]
    })
  ]);
  assert.equal(next.status, "Follow Up");
  assert.equal(next.name, "Fu");
});

test("Interested beats Site Visit", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("Sv", "Site Visit"), leadRow("Int", "Interested")]
    })
  ]);
  assert.equal(next.status, "Interested");
});

test("Site Visit beats New", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("New", "New"), leadRow("Sv", "Site Visit")]
    })
  ]);
  assert.equal(next.status, "Site Visit");
});

test("New beats Contacted", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("C", "Contacted"), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
});

test("Contacted is selected when it is the only actionable status", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [
        leadRow("C", "Contacted"),
        leadRow("Done", "Converted"),
        leadRow("Lost", "Lost")
      ]
    })
  ]);
  assert.equal(next.status, "Contacted");
  assert.equal(next.name, "C");
});

test("Converted is excluded", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("X", "Converted"), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
  assert.notEqual(next.status, "Converted");
});

test("Not Interested is excluded", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("X", "Not Interested"), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
});

test("Lost is excluded", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("X", "Lost"), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
});

test("Unknown is excluded", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("X", "Pending Review"), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
});

test("Blank status is excluded", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "A",
      leads: [leadRow("X", ""), leadRow("N", "New")]
    })
  ]);
  assert.equal(next.status, "New");
});

test("Empty input returns no work lead", () => {
  assert.equal(getWorkNextLead([]), null);
  assert.equal(getWorkNextLead(null), null);
  assert.equal(getWorkNextLead(undefined), null);
  assert.equal(getActionCenterSummary([]).workNext, null);
});

test("Multiple projects preserve correct projectId", () => {
  const next = getWorkNextLead([
    project({
      id: 10,
      name: "Beta",
      leads: [leadRow("B", "Interested")]
    }),
    project({
      id: 20,
      name: "Alpha",
      leads: [leadRow("A", "Follow Up")]
    })
  ]);
  assert.equal(next.projectId, 20);
  assert.equal(next.status, "Follow Up");
});

test("Row number is preserved", () => {
  const next = getWorkNextLead([
    project({
      id: 3,
      name: "P",
      leads: [leadRow("Only", "Follow Up")],
      rowNumbers: [42]
    })
  ]);
  assert.equal(next.rowNumber, 42);
  assert.equal(next.detailHref, "/projects/3/lead/42");
});

test("Selection is deterministic", () => {
  const projects = [
    project({
      id: 1,
      name: "P",
      leads: [
        leadRow("B", "Follow Up"),
        leadRow("A", "Follow Up"),
        leadRow("C", "Interested")
      ]
    })
  ];
  const a = getWorkNextLead(projects);
  const b = getWorkNextLead(projects);
  assert.deepEqual(
    { name: a.name, rowNumber: a.rowNumber, status: a.status },
    { name: b.name, rowNumber: b.rowNumber, status: b.status }
  );
});

test("Existing ordering is stable for equal-priority leads", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "Zebra",
      leads: [leadRow("Zed", "Follow Up")]
    }),
    project({
      id: 2,
      name: "Alpha",
      leads: [leadRow("Ann", "Follow Up")]
    })
  ]);
  assert.equal(next.projectName, "Alpha");
  assert.equal(next.name, "Ann");
});

test("Input is not mutated", () => {
  const projects = [
    project({
      id: 1,
      name: "P",
      leads: [leadRow("A", "New"), leadRow("B", "Follow Up")]
    })
  ];
  const snapshot = JSON.stringify(projects);
  getWorkNextLead(projects);
  assert.equal(JSON.stringify(projects), snapshot);

  const items = collectActionCenterItems(projects);
  const itemsSnapshot = JSON.stringify(items);
  getWorkNextLead(items);
  assert.equal(JSON.stringify(items), itemsSnapshot);
});

test("Missing name is safe", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "P",
      leads: [{ Name: "", Phone: "9876543210", Email: "", "Lead Status": "New" }]
    })
  ]);
  assert.equal(next.name, "Unnamed Lead");
});

test("Missing phone is safe", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "P",
      leads: [leadRow("NoPhone", "New", "", "a@b.com")]
    })
  ]);
  assert.equal(next.phoneAvailable, false);
  assert.equal(next.emailAvailable, true);
  assert.equal(next.contactLabel, "Email available");
});

test("Missing email is safe", () => {
  const next = getWorkNextLead([
    project({
      id: 1,
      name: "P",
      leads: [leadRow("NoEmail", "New", "9876543210", "")]
    })
  ]);
  assert.equal(next.phoneAvailable, true);
  assert.equal(next.contactLabel, "Phone available");
});

test("No fake score is generated", () => {
  const next = getWorkNextLead([
    project({ id: 1, name: "P", leads: [leadRow("A", "New")] })
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "leadScore"), false);
  assert.equal(
    getActionCenterSummary([project({ id: 1, name: "P", leads: [leadRow("A", "New")] })]).inventsScore,
    false
  );
});

test("No percentage is generated", () => {
  const next = getWorkNextLead([
    project({ id: 1, name: "P", leads: [leadRow("A", "Interested")] })
  ]);
  const json = JSON.stringify(next);
  assert.equal(/%/.test(json), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "conversionProbability"), false);
});

test("No predictive value is generated", () => {
  const next = getWorkNextLead([
    project({ id: 1, name: "P", leads: [leadRow("A", "Site Visit")] })
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "predicted"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "probability"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next, "hot"), false);
});

test("Work Next does not imply automatic status change", () => {
  const next = getWorkNextLead([
    project({ id: 1, name: "P", leads: [leadRow("A", "Follow Up")] })
  ]);
  assert.equal(next.changesStatus, false);
});

test("Work Next does not imply automatic communication", () => {
  const next = getWorkNextLead([
    project({ id: 1, name: "P", leads: [leadRow("A", "Follow Up")] })
  ]);
  assert.equal(next.sendsCommunication, false);
});

test("Terminal statuses never become Work Next", () => {
  assert.equal(
    getWorkNextLead([
      project({
        id: 1,
        name: "P",
        leads: [
          leadRow("A", "Converted"),
          leadRow("B", "Not Interested"),
          leadRow("C", "Lost"),
          leadRow("D", ""),
          leadRow("E", "Weird")
        ]
      })
    ]),
    null
  );
});

test("Work This Lead summary uses factual data only", () => {
  const summary = buildWorkThisLeadSummary({
    status: "Interested",
    projectName: "Mayur City",
    telHref: "tel:9876543210",
    mailtoHref: null,
    timelineEvents: [{ id: 1 }, { id: 2 }],
    remarks: [{ id: 1 }]
  });
  assert.equal(summary.title, "Work This Lead");
  assert.equal(summary.projectName, "Mayur City");
  assert.equal(summary.currentValue, "Interested");
  assert.equal(summary.nextValue, "Follow Up");
  assert.equal(summary.contactValue, "Phone available");
  assert.match(summary.activityValue, /2 events/);
  assert.match(summary.remarksValue, /1 remark/);
  assert.equal(summary.primaryAction.type, "call");
  assert.equal(summary.primaryAction.label, "Call Lead");
  assert.equal(summary.changesStatus, false);
  assert.equal(summary.sendsCommunication, false);
  assert.equal(summary.inventsScore, false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "score"), false);
  assert.equal(/%/.test(JSON.stringify(summary)), false);
});

test("Work This Lead handles missing contact and empty activity", () => {
  const summary = buildWorkThisLeadSummary({
    status: "New",
    projectName: "",
    telHref: null,
    mailtoHref: null,
    timelineEvents: [],
    remarks: []
  });
  assert.equal(summary.projectName, "Not available");
  assert.equal(summary.contactValue, "Contact unavailable");
  assert.equal(summary.activityValue, "No activity yet");
  assert.equal(summary.remarksValue, "No remarks yet");
  assert.equal(summary.primaryAction.type, "review");
  assert.equal(summary.primaryAction.label, "Review Lead");
});

test("Work This Lead email-only primary action", () => {
  const summary = buildWorkThisLeadSummary({
    status: "Follow Up",
    telHref: null,
    mailtoHref: "mailto:a@b.com",
    timelineEvents: null,
    remarks: null
  });
  assert.equal(summary.contactValue, "Email available");
  assert.equal(summary.primaryAction.type, "email");
  assert.equal(summary.primaryAction.label, "Email Lead");
});

test("mobile workspace files exist and wire Work Next", () => {
  const root = __dirname;
  assert.ok(fs.existsSync(path.join(root, "mobile/utils/leadWorkspaceCore.js")));
  assert.ok(fs.existsSync(path.join(root, "mobile/utils/leadWorkspace.ts")));
  assert.ok(fs.existsSync(path.join(root, "mobile/components/LeadWorkThisLead.tsx")));

  const actionCenterUi = fs.readFileSync(
    path.join(root, "mobile/components/ActionCenterSection.tsx"),
    "utf8"
  );
  assert.match(actionCenterUi, /Work Next Lead/);
  assert.match(actionCenterUi, /onWorkNext/);

  const dashboard = fs.readFileSync(path.join(root, "mobile/app/(app)/index.tsx"), "utf8");
  assert.match(dashboard, /onWorkNext/);
  assert.match(dashboard, /openWorkNextLead/);

  const leadDetail = fs.readFileSync(
    path.join(root, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  assert.match(leadDetail, /LeadWorkThisLead/);
  assert.match(leadDetail, /rememberSection\("workspace"/);
  assert.doesNotMatch(leadDetail, /auto.?advance/i);
});
