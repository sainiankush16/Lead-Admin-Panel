import type { GlobalSearchResponse, SearchResult } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./globalSearchCore.js") as {
  MIN_QUERY_LENGTH: number;
  MAX_QUERY_LENGTH: number;
  normalizeSearchQuery: (value: unknown) => string;
  validateSearchDraft: (value: unknown) => { ok: true; value: string } | { ok: false; error: string };
  canSubmitSearch: (args: { query: string; searching: boolean }) => boolean;
  formatSearchResultCount: (count: number) => string;
  displayLeadName: (result: Partial<SearchResult> | null | undefined) => string;
  displayFieldOrDash: (value: unknown) => string;
  displayLeadStatus: (status: unknown) => string;
  displayProjectName: (result: Partial<SearchResult> | null | undefined) => string;
  leadDetailHref: (result: Partial<SearchResult> | null | undefined) => string | null;
  mapSearchResults: (payload: Partial<GlobalSearchResponse> | null | undefined) => MappedSearchResult[];
  hasPartialSheetErrors: (payload: Partial<GlobalSearchResponse> | null | undefined) => boolean;
  partialSheetErrorMessage: () => string;
  mapSearchError: (err: { status?: number; name?: string; message?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
  };
  createInitialSearchState: () => SearchUiState;
  applySuccessfulSearch: (
    state: SearchUiState,
    payload: Partial<GlobalSearchResponse> | null | undefined,
    submittedQuery: string
  ) => SearchUiState;
  clearSearchState: () => SearchUiState;
};

export interface MappedSearchResult {
  projectId: number;
  projectName: string;
  rowNumber: number;
  leadId: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  matchedOn: string[];
  href: string;
}

export interface SearchUiState {
  query: string;
  submittedQuery: string | null;
  results: MappedSearchResult[];
  count: number;
  searching: boolean;
  error: string | null;
  partialErrors: boolean;
  hasSearched: boolean;
}

export const MIN_QUERY_LENGTH = core.MIN_QUERY_LENGTH;
export const MAX_QUERY_LENGTH = core.MAX_QUERY_LENGTH;
export const normalizeSearchQuery = core.normalizeSearchQuery;
export const validateSearchDraft = core.validateSearchDraft;
export const canSubmitSearch = core.canSubmitSearch;
export const formatSearchResultCount = core.formatSearchResultCount;
export const displayLeadName = core.displayLeadName;
export const displayFieldOrDash = core.displayFieldOrDash;
export const displayLeadStatus = core.displayLeadStatus;
export const displayProjectName = core.displayProjectName;
export const leadDetailHref = core.leadDetailHref;
export const mapSearchResults = core.mapSearchResults;
export const hasPartialSheetErrors = core.hasPartialSheetErrors;
export const partialSheetErrorMessage = core.partialSheetErrorMessage;
export const mapSearchError = core.mapSearchError;
export const createInitialSearchState = core.createInitialSearchState;
export const applySuccessfulSearch = core.applySuccessfulSearch;
export const clearSearchState = core.clearSearchState;
