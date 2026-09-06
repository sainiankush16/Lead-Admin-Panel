import type { LeadStatusValue } from "@/constants/leadStatus";

export type UserRole = "admin" | "project_user";

/** Matches sanitizeAppUser from the existing backend. */
export interface User {
  id: number;
  name: string;
  loginId: string;
  role: UserRole;
  isActive: boolean;
}

/** Project assignment summary returned by listAppUsers. */
export interface UserProjectAssignment {
  id: number;
  name: string;
}

/** Matches listAppUsers item (project users only). */
export interface ManagedUser extends User {
  projects: UserProjectAssignment[];
}

export interface UsersListResponse {
  users: ManagedUser[];
}

/** Matches sanitizeProject from the existing backend. */
export interface Project {
  id: number;
  name: string;
  sheetName: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetId: number;
  columns: string[];
  lastSync: string | null;
}

/** Dynamic lead row from Google Sheets (keys = sheet headers). */
export type Lead = Record<string, string | number | null | undefined>;

export type LeadStatus = LeadStatusValue | string;

export interface ProjectLeadsResponse extends Project {
  leads: Lead[];
  rowNumbers: number[];
  leadStatusColumn: string | null;
  leadStatusColumnIndex: number;
}

export interface RemarkAuthor {
  userId: number | null;
  name: string | null;
  loginId: string | null;
  role?: string | null;
}

/** Matches sanitizeRemark from lead-remarks.js */
export interface Remark {
  id: number;
  projectId: number;
  leadId: string;
  body: string;
  author: RemarkAuthor;
  createdAt: string;
  updatedAt?: string | null;
}

/** Matches sanitizeTimelineEvent from lead-timeline.js */
export interface TimelineEventActor {
  userId: number | null;
  role: string | null;
  name: string | null;
  loginId: string | null;
}

export interface TimelineEvent {
  id: number;
  projectId: number;
  leadId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  actor: TimelineEventActor;
  createdAt: string;
  updatedAt?: string | null;
  isDeleted?: boolean;
}

/** Matches sanitizeSearchHit from lead-search.js */
export interface SearchResult {
  projectId: number;
  projectName: string;
  spreadsheetName: string;
  sheetTitle: string;
  rowNumber: number;
  leadId: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus | null;
  matchedOn: string[];
}

export interface GlobalSearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
  sheetErrors?: Array<{
    projectId: number;
    projectName: string;
    message: string;
  }>;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
  name: string | null;
}

export interface SpreadsheetListItem {
  id: string;
  name: string;
  modifiedTime?: string | null;
}

export interface SheetTabListItem {
  sheetId: number;
  title: string;
  index?: number;
}


export type {
  DashboardSummary,
  ProjectLeadSummary,
  StatusCounts
} from "@/utils/dashboardSummary";

export type {
  BulkStatusOutcome,
  BulkStatusSummary,
  BulkStatusProgress,
  BulkResultKind,
  BulkStatusResultView
} from "@/utils/leadList";
