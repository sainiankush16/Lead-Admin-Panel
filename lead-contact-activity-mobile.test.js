"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveContactActionUrls,
  contactActionAvailability,
  contactQuickRemarkSuggestions,
  applyContactQuickRemark,
  validateContactRemarkDraft,
  canSubmitContactRemark,
  mapContactRemarkError,
  contactActionsChangeLeadStatus,
  contactActionsCreateTimelineEvents,
  hasCommunicationSdk,
  hasContactDatabaseModel,
  usesExistingRemarkApi,
  buildTelHref,
  buildWhatsAppHref,
  buildMailtoHref
} = require("./mobile/utils/leadContactActivityCore");

test("Call WhatsApp and Email generate expected native URLs", () => {
  const urls = resolveContactActionUrls({
    phone: "9876543210",
    email: "lead@example.com"
  });
  assert.equal(urls.telHref, "tel:+919876543210");
  assert.equal(urls.waHref, "https://wa.me/919876543210");
  assert.equal(urls.mailtoHref, "mailto:lead@example.com");
  assert.equal(buildTelHref("9876543210"), urls.telHref);
  assert.equal(buildWhatsAppHref("9876543210"), urls.waHref);
  assert.equal(buildMailtoHref("lead@example.com"), urls.mailtoHref);
});

test("Invalid or missing phone and email disable contact actions safely", () => {
  const empty = contactActionAvailability(
    resolveContactActionUrls({ phone: "", email: "not-an-email" })
  );
  assert.equal(empty.canCall, false);
  assert.equal(empty.canWhatsApp, false);
  assert.equal(empty.canEmail, false);
  assert.equal(empty.telHref, null);
  assert.equal(empty.waHref, null);
  assert.equal(empty.mailtoHref, null);

  const phoneOnly = contactActionAvailability(
    resolveContactActionUrls({ phone: "+91 98765 43210", email: "" })
  );
  assert.equal(phoneOnly.canCall, true);
  assert.equal(phoneOnly.canWhatsApp, true);
  assert.equal(phoneOnly.canEmail, false);
});

test("Contact Remark validation duplicate guard and quick suggestions", () => {
  assert.equal(validateContactRemarkDraft("").ok, false);
  assert.equal(validateContactRemarkDraft("   ").ok, false);
  assert.equal(validateContactRemarkDraft("Customer did not answer.").ok, true);
  assert.equal(canSubmitContactRemark({ draft: "Note", busy: false }), true);
  assert.equal(canSubmitContactRemark({ draft: "Note", busy: true }), false);
  const suggestions = contactQuickRemarkSuggestions();
  assert.ok(suggestions.includes("Called — No Answer"));
  assert.ok(suggestions.includes("WhatsApp Sent"));
  assert.equal(applyContactQuickRemark("Email Sent", "old"), "Email Sent");
  assert.match(mapContactRemarkError({ status: 401 }).message, /session expired/i);
  assert.equal(mapContactRemarkError({ status: 403 }).clearAuth, false);
});

test("Contact actions do not auto-change status or invent timeline events", () => {
  assert.equal(contactActionsChangeLeadStatus(), false);
  assert.equal(contactActionsCreateTimelineEvents(), false);

  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  assert.match(detail, /LeadContactActions/);
  assert.match(detail, /LeadContactRemarkSection/);
  assert.match(detail, /LeadFollowUpSection/);
  assert.match(detail, /onAddContactRemark/);
  assert.match(detail, /api\.addRemark\(projectId, leadId/);
  assert.match(detail, /loadTimeline/);
  assert.doesNotMatch(detail, /CALL_MADE|WHATSAPP_SENT|EMAIL_SENT/);
  assert.doesNotMatch(detail, /updateLeadStatus\(.*Call|openCall[\s\S]*updateLeadStatus/);
  assert.doesNotMatch(detail, /CHATURX|ChaturX|Ankush CRM/);

  const actions = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadContactActions.tsx"),
    "utf8"
  );
  assert.match(actions, /openCall/);
  assert.match(actions, /openWhatsApp/);
  assert.match(actions, /openEmail/);
  assert.doesNotMatch(actions, /updateLeadStatus|addRemark/);

  const remark = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadContactRemarkSection.tsx"),
    "utf8"
  );
  assert.match(remark, /Add Contact Remark/);
  assert.match(remark, /contactQuickRemarkSuggestions/);
  assert.match(remark, /validateContactRemarkDraft/);

  const linking = fs.readFileSync(path.join(__dirname, "mobile/utils/linking.ts"), "utf8");
  assert.match(linking, /Alert\.alert/);
  assert.match(linking, /canOpenURL/);
  assert.match(linking, /openEmail/);
});

test("No contact database API communication SDK or notification system", () => {
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  assert.equal(hasCommunicationSdk(pkg), false);

  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  assert.equal(hasContactDatabaseModel(db), false);

  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.doesNotMatch(server, /\/api\/(calls|contact-attempts|communications|call-logs)/);
  assert.doesNotMatch(server, /CREATE TABLE\s+calls/i);

  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.equal(usesExistingRemarkApi(api), true);
  assert.doesNotMatch(api, /logCall|logWhatsApp|logEmail|contactAttempt/);
});
