"use strict";

const NAME_ALIASES = [
  "name",
  "full name",
  "lead name",
  "customer name"
];

const PHONE_ALIASES = [
  "phone",
  "phone number",
  "mobile",
  "mobile number",
  "contact",
  "contact number"
];

const EMAIL_ALIASES = [
  "email",
  "email address",
  "e-mail",
  "e mail"
];

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findColumnByAliases(columns, aliases) {
  const list = Array.isArray(columns) ? columns : [];
  const normalized = list.map(column => ({
    raw: column,
    key: normalizeHeader(column)
  }));

  for (const alias of aliases) {
    const exact = normalized.find(item => item.key === alias);
    if (exact) return exact.raw;
  }

  for (const alias of aliases) {
    const fuzzy = normalized.find(item => item.key.includes(alias));
    if (fuzzy) return fuzzy.raw;
  }

  return null;
}

function findNameColumn(columns) {
  return findColumnByAliases(columns, NAME_ALIASES);
}

function findPhoneColumn(columns) {
  return findColumnByAliases(columns, PHONE_ALIASES);
}

function findEmailColumn(columns) {
  return findColumnByAliases(columns, EMAIL_ALIASES);
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Digit variants used for phone search equality (no mutation of stored values). */
function phoneSearchDigits(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return [];
  const variants = new Set([digits]);
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    variants.add(`91${digits}`);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    variants.add(digits.slice(2));
  }
  const normalized = normalizePhoneForLinks(raw);
  if (normalized?.e164Digits) variants.add(normalized.e164Digits);
  return [...variants];
}

function phonesMatchForSearch(query, cellValue) {
  const queryDigits = phoneSearchDigits(query);
  const cellDigits = phoneSearchDigits(cellValue);
  if (!queryDigits.length || !cellDigits.length) return false;
  for (const q of queryDigits) {
    for (const c of cellDigits) {
      if (q === c) return true;
      if (q.length >= 7 && (c.endsWith(q) || c.includes(q))) return true;
      if (c.length >= 7 && (q.endsWith(c) || q.includes(c))) return true;
    }
  }
  return false;
}

/**
 * Build safe tel: / wa.me targets without mutating the displayed value.
 * Returns null when the number cannot be normalized safely.
 */
function normalizePhoneForLinks(raw) {
  const display = String(raw ?? "").trim();
  if (!display) return null;

  const hasPlus = display.includes("+");
  let digits = digitsOnly(display);
  if (!digits) return null;

  // Already international (+... or long digit strings with country code).
  if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    return {
      display,
      e164Digits: digits,
      telHref: `tel:+${digits}`,
      waHref: `https://wa.me/${digits}`
    };
  }

  // 91XXXXXXXXXX (India with country code, no plus).
  if (digits.length === 12 && digits.startsWith("91")) {
    return {
      display,
      e164Digits: digits,
      telHref: `tel:+${digits}`,
      waHref: `https://wa.me/${digits}`
    };
  }

  // Typical Indian mobile: 10 digits starting 6–9 → prepend 91 once.
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    const intl = `91${digits}`;
    return {
      display,
      e164Digits: intl,
      telHref: `tel:+${intl}`,
      waHref: `https://wa.me/${intl}`
    };
  }

  // Other plausible international numbers already including a country code.
  if (digits.length >= 11 && digits.length <= 15) {
    return {
      display,
      e164Digits: digits,
      telHref: `tel:+${digits}`,
      waHref: `https://wa.me/${digits}`
    };
  }

  return null;
}

function buildTelHref(raw) {
  return normalizePhoneForLinks(raw)?.telHref || null;
}

function buildWhatsAppHref(raw) {
  return normalizePhoneForLinks(raw)?.waHref || null;
}

const api = {
  NAME_ALIASES,
  PHONE_ALIASES,
  EMAIL_ALIASES,
  normalizeHeader,
  findColumnByAliases,
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  digitsOnly,
  phoneSearchDigits,
  phonesMatchForSearch,
  normalizePhoneForLinks,
  buildTelHref,
  buildWhatsAppHref
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
}

if (typeof globalThis !== "undefined") {
  globalThis.LeadPhoneHelpers = api;
}
