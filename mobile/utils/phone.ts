/**
 * Mobile phone helpers — logic lives in phoneHelpersCore.js (Node-testable).
 * Do not modify public/phone-helpers.js.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./phoneHelpersCore.js");

export const NAME_ALIASES = core.NAME_ALIASES as readonly string[];
export const PHONE_ALIASES = core.PHONE_ALIASES as readonly string[];
export const EMAIL_ALIASES = core.EMAIL_ALIASES as readonly string[];

export const normalizeHeader = core.normalizeHeader as (value: unknown) => string;
export const findColumnByAliases = core.findColumnByAliases as (
  columns: string[] | null | undefined,
  aliases: readonly string[]
) => string | null;
export const findNameColumn = core.findNameColumn as (
  columns: string[] | null | undefined
) => string | null;
export const findPhoneColumn = core.findPhoneColumn as (
  columns: string[] | null | undefined
) => string | null;
export const findEmailColumn = core.findEmailColumn as (
  columns: string[] | null | undefined
) => string | null;
export const digitsOnly = core.digitsOnly as (value: unknown) => string;

export interface NormalizedPhone {
  display: string;
  e164Digits: string;
  telHref: string;
  waHref: string;
}

export const normalizePhoneForLinks = core.normalizePhoneForLinks as (
  raw: unknown
) => NormalizedPhone | null;
export const phoneSearchDigits = core.phoneSearchDigits as (raw: unknown) => string[];
export const phonesMatchForSearch = core.phonesMatchForSearch as (
  query: unknown,
  cellValue: unknown
) => boolean;
export const buildTelHref = core.buildTelHref as (raw: unknown) => string | null;
export const buildWhatsAppHref = core.buildWhatsAppHref as (raw: unknown) => string | null;
