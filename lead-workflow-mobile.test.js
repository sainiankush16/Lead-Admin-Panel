"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  WORKFLOW_SECTIONS,
  NEXT_ACTIONS,
  displayLeadIdentityName,
  displayLeadIdentityPhone,
  displayLeadIdentityEmail,
  displayLeadIdentityStatus,
  shouldCollapseAdditionalFieldsByDefault,
  contactActionsChangeLeadStatus,
  contactRemarkChangesLeadStatus,
  stickyActionBarRecommended,
  workflowUsesProjectIdAndRowNumber,
  timelineRemainsReadOnlyOnLeadDetail
} = require("./mobile/utils/leadWorkflowCore");
const { buildLeadDetail } = require("./mobile/utils/leadDetailCore");

test("lead identity placeholders and status display", () => {
  assert.equal(displayLeadIdentityName(""), "Unnamed Lead");
  assert.equal(displayLeadIdentityName("Satya"), "Satya");
  assert.equal(displayLeadIdentityPhone(""), "—");
  assert.equal(displayLeadIdentityPhone("9876543210"), "9876543210");
  assert.equal(displayLeadIdentityEmail(""), "—");
  assert.equal(displayLeadIdentityEmail("a@x.com"), "a@x.com");
  assert.equal(displayLeadIdentityStatus(""), "Unknown");
  assert.equal(displayLeadIdentityStatus("Unknown"), "Unknown");
  assert.equal(displayLeadIdentityStatus("Follow Up"), "Follow Up");
});

test("workflow section order and next actions are explicit only", () => {
  assert.deepEqual(WORKFLOW_SECTIONS, [
    "header",
    "productivity",
    "contact",
    "status",
    "followUp",
    "contactRemark",
    "remarks",
    "fields",
    "timeline"
  ]);
  assert.equal(NEXT_ACTIONS.length, 4);
  assert.ok(NEXT_ACTIONS.some(item => item.id === "followUp"));
  assert.equal(contactActionsChangeLeadStatus(), false);
  assert.equal(contactRemarkChangesLeadStatus(), false);
  assert.equal(stickyActionBarRecommended(), false);
  assert.equal(shouldCollapseAdditionalFieldsByDefault(0), false);
  assert.equal(shouldCollapseAdditionalFieldsByDefault(3), true);
});

test("promoted fields stay out of additional sheet field list", () => {
  const detail = buildLeadDetail(
    {
      id: 7,
      name: "Advitya Techno Park",
      columns: ["Full Name", "Phone", "Email", "Location", "Lead Status", "Notes"],
      leadStatusColumn: "Lead Status",
      leads: [
        {
          "Full Name": "Satya Thakur",
          Phone: "9876543210",
          Email: "satya@example.com",
          Location: "Gurugram",
          "Lead Status": "Contacted",
          Notes: "Follow up"
        }
      ],
      rowNumbers: [2]
    },
    2
  );
  assert.equal(detail.found, true);
  const headers = detail.fields.map(f => f.header);
  assert.deepEqual(headers, ["Location", "Notes"]);
  assert.equal(headers.includes("Full Name"), false);
  assert.equal(headers.includes("Phone"), false);
  assert.equal(headers.includes("Email"), false);
  assert.equal(headers.includes("Lead Status"), false);
});

test("Lead Detail wires action-first workflow without sticky bar or new APIs", () => {
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");

  assert.match(detail, /LeadDetailHeader/);
  assert.match(detail, /LeadSmartNextAction/);
  assert.match(detail, /LeadNextActions/);
  assert.match(detail, /LeadContactActions/);
  assert.match(detail, /LeadFollowUpSection/);
  assert.match(detail, /LeadContactRemarkSection/);
  assert.match(detail, /LeadRemarksSection/);
  assert.match(detail, /LeadTimelineSection/);
  assert.match(detail, /Additional Sheet Fields/);
  assert.match(detail, /shouldCollapseAdditionalFieldsByDefault/);
  assert.match(detail, /updateLeadStatus/);
  assert.match(detail, /addRemark/);
  assert.match(detail, /getLeadTimeline/);
  assert.equal(timelineRemainsReadOnlyOnLeadDetail(detail), true);
  assert.equal(workflowUsesProjectIdAndRowNumber(detail), true);
  assert.doesNotMatch(detail, /sticky|position:\s*["']absolute["']|CALL_MADE|WHATSAPP_SENT|EMAIL_SENT/);
  assert.doesNotMatch(detail, /expo-notifications|scheduleNotification|follow_up_date/);
  assert.doesNotMatch(detail, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(detail, /openCall[\s\S]*updateLeadStatus|openWhatsApp[\s\S]*updateLeadStatus/);

  assert.doesNotMatch(api, /\/api\/notifications|\/api\/reminders|\/api\/communications/);
  assert.doesNotMatch(server, /app\.(get|post)\("\/api\/(notifications|reminders|communications)/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(notifications|reminders|communications|follow_ups)/i);
  assert.doesNotMatch(pkg, /expo-notifications|firebase|@react-native-firebase/);

  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");
  assert.match(search, /item\.href|\/projects\/\$\{/);
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  assert.match(dashboard, /buildLeadListPath|resolveActionableLeadTarget/);
});
