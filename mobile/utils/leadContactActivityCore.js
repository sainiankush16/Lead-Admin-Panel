"use strict";

const { buildTelHref, buildWhatsAppHref } = require("./phoneHelpersCore");
const { buildMailtoHref } = require("./leadDetailCore");
const {
  validateRemarkDraft,
  canSubmitRemarkDraft,
  mapRemarkMutationError
} = require("./leadRemarksCore");

const CONTACT_QUICK_REMARKS = Object.freeze([
  "Called — No Answer",
  "Called — Interested",
  "Called — Callback Requested",
  "WhatsApp Sent",
  "Email Sent"
]);

function resolveContactActionUrls({ phone, email } = {}) {
  return {
    telHref: buildTelHref(phone),
    waHref: buildWhatsAppHref(phone),
    mailtoHref: buildMailtoHref(email)
  };
}

function contactActionAvailability(urls) {
  const telHref = urls?.telHref || null;
  const waHref = urls?.waHref || null;
  const mailtoHref = urls?.mailtoHref || null;
  return {
    canCall: Boolean(telHref),
    canWhatsApp: Boolean(waHref),
    canEmail: Boolean(mailtoHref),
    telHref,
    waHref,
    mailtoHref
  };
}

function contactQuickRemarkSuggestions() {
  return [...CONTACT_QUICK_REMARKS];
}

function applyContactQuickRemark(suggestion, currentDraft) {
  const text = String(suggestion || "").trim();
  if (!text) return String(currentDraft || "");
  return text;
}

function validateContactRemarkDraft(value) {
  return validateRemarkDraft(value);
}

function canSubmitContactRemark({ draft, busy }) {
  return canSubmitRemarkDraft({ draft, busy });
}

function mapContactRemarkError(err) {
  return mapRemarkMutationError(err, "add");
}

function contactRemarkSuccessMessage() {
  return "Contact remark saved.";
}

function contactActionsChangeLeadStatus() {
  return false;
}

function contactActionsCreateTimelineEvents() {
  return false;
}

function hasCommunicationSdk(packageJsonText) {
  if (typeof packageJsonText !== "string") return false;
  return /twilio|vonage|whatsapp-web|sendgrid|nodemailer|expo-notifications|firebase|@react-native-firebase/i.test(
    packageJsonText
  );
}

function hasContactDatabaseModel(source) {
  if (typeof source !== "string") return false;
  return /CREATE TABLE\s+(calls|contact_attempts|communications|call_logs|whatsapp_logs|email_logs)/i.test(
    source
  );
}

function usesExistingRemarkApi(source) {
  return (
    typeof source === "string" &&
    source.includes("addRemark") &&
    /\/api\/projects\/\$\{projectId\}\/leads\/\$\{.*leadId.*\}\/remarks/.test(source)
  );
}

module.exports = {
  CONTACT_QUICK_REMARKS,
  resolveContactActionUrls,
  contactActionAvailability,
  contactQuickRemarkSuggestions,
  applyContactQuickRemark,
  validateContactRemarkDraft,
  canSubmitContactRemark,
  mapContactRemarkError,
  contactRemarkSuccessMessage,
  contactActionsChangeLeadStatus,
  contactActionsCreateTimelineEvents,
  hasCommunicationSdk,
  hasContactDatabaseModel,
  usesExistingRemarkApi,
  buildTelHref,
  buildWhatsAppHref,
  buildMailtoHref
};
