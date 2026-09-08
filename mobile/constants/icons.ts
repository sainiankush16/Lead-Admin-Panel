import type { SFSymbol } from "sf-symbols-typescript";

export type AppIconName =
  | "call"
  | "whatsapp"
  | "email"
  | "save"
  | "add"
  | "edit"
  | "delete"
  | "search"
  | "clear"
  | "filter"
  | "folder"
  | "dashboard"
  | "checklist"
  | "pipeline"
  | "productivity"
  | "play"
  | "arrow"
  | "users"
  | "more"
  | "account"
  | "legal"
  | "logout"
  | "check"
  | "checkbox"
  | "checkboxOutline"
  | "note"
  | "status"
  | "statusNew"
  | "statusContacted"
  | "statusInterested"
  | "statusFollowUp"
  | "statusSiteVisit"
  | "statusConverted"
  | "statusNotInterested"
  | "statusLost"
  | "statusUnknown";

export type AppIconSpec = {
  /** SF Symbol name for native iOS SymbolView. */
  ios: SFSymbol;
  /** Material Symbols ligature/codepoints key for Android Text rendering. */
  android: string;
  /** Unicode code point from Material Symbols font (verified against expo-symbols map). */
  codepoint: number;
};

/**
 * Cross-platform icon map for Website CRM.
 * Android uses Material Symbols font glyphs (preloaded). iOS uses SF Symbols.
 */
export const APP_ICONS: Record<AppIconName, AppIconSpec> = {
  call: { ios: "phone.fill", android: "call", codepoint: 0xe0b0 },
  whatsapp: { ios: "message.fill", android: "chat", codepoint: 0xe0b7 },
  email: { ios: "envelope.fill", android: "mail", codepoint: 0xe158 },
  save: { ios: "checkmark.circle.fill", android: "check", codepoint: 0xe5ca },
  add: { ios: "plus", android: "add", codepoint: 0xe145 },
  edit: { ios: "pencil", android: "edit", codepoint: 0xe3c9 },
  delete: { ios: "trash", android: "delete", codepoint: 0xe872 },
  search: { ios: "magnifyingglass", android: "search", codepoint: 0xe8b6 },
  clear: { ios: "xmark", android: "close", codepoint: 0xe5cd },
  filter: { ios: "line.3.horizontal.decrease", android: "filter_list", codepoint: 0xe152 },
  folder: { ios: "folder.fill", android: "folder", codepoint: 0xe2c7 },
  dashboard: { ios: "square.grid.2x2.fill", android: "dashboard", codepoint: 0xe871 },
  checklist: { ios: "checklist", android: "checklist", codepoint: 0xe6b1 },
  pipeline: { ios: "chart.bar.fill", android: "insights", codepoint: 0xf092 },
  productivity: { ios: "chart.line.uptrend.xyaxis", android: "trending_up", codepoint: 0xe8e5 },
  play: { ios: "play.fill", android: "play_arrow", codepoint: 0xe037 },
  arrow: { ios: "chevron.right", android: "arrow_forward", codepoint: 0xe5c8 },
  users: { ios: "person.2.fill", android: "group", codepoint: 0xe7ef },
  more: { ios: "gearshape.fill", android: "settings", codepoint: 0xe8b8 },
  account: { ios: "person.crop.circle.fill", android: "account_circle", codepoint: 0xe853 },
  legal: { ios: "doc.text.fill", android: "description", codepoint: 0xe873 },
  logout: { ios: "rectangle.portrait.and.arrow.right", android: "logout", codepoint: 0xe9ba },
  check: { ios: "checkmark", android: "check", codepoint: 0xe5ca },
  checkbox: { ios: "checkmark.square.fill", android: "check_box", codepoint: 0xe834 },
  checkboxOutline: { ios: "square", android: "check_box_outline_blank", codepoint: 0xe835 },
  note: { ios: "note.text", android: "note_add", codepoint: 0xe89c },
  status: { ios: "flag.fill", android: "flag", codepoint: 0xe153 },
  statusNew: { ios: "person.badge.plus", android: "person_add", codepoint: 0xe7fe },
  statusContacted: { ios: "phone.fill", android: "call", codepoint: 0xe0b0 },
  statusInterested: { ios: "star.fill", android: "star", codepoint: 0xe838 },
  statusFollowUp: { ios: "clock.arrow.circlepath", android: "schedule", codepoint: 0xe8b5 },
  statusSiteVisit: { ios: "mappin.and.ellipse", android: "location_on", codepoint: 0xe0c8 },
  statusConverted: { ios: "checkmark.circle.fill", android: "check", codepoint: 0xe5ca },
  statusNotInterested: { ios: "minus.circle.fill", android: "remove_circle", codepoint: 0xe15c },
  statusLost: { ios: "xmark.circle.fill", android: "cancel", codepoint: 0xe5c9 },
  statusUnknown: { ios: "questionmark.circle", android: "flag", codepoint: 0xe153 }
};

export const MATERIAL_SYMBOLS_FONT = "MaterialSymbols_400Regular";

export function statusIconName(status: string): AppIconName {
  switch (String(status || "").trim()) {
    case "New":
      return "statusNew";
    case "Contacted":
      return "statusContacted";
    case "Interested":
      return "statusInterested";
    case "Follow Up":
      return "statusFollowUp";
    case "Site Visit":
      return "statusSiteVisit";
    case "Converted":
      return "statusConverted";
    case "Not Interested":
      return "statusNotInterested";
    case "Lost":
      return "statusLost";
    default:
      return "statusUnknown";
  }
}
