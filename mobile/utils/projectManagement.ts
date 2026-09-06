import type { Project } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./projectManagementCore.js") as {
  validateProjectName: (value: unknown) => { ok: true; value: string } | { ok: false; error: string };
  isSpreadsheetId: (value: unknown) => boolean;
  validateCreateProjectPayload: (input: {
    name?: string;
    spreadsheetId?: string;
    sheetId?: number;
    sheetTitle?: string;
  }) =>
    | {
        ok: true;
        value: { name: string; spreadsheetId: string; sheetId: number; sheetTitle: string };
      }
    | { ok: false; error: string };
  mapSpreadsheets: (payload: { spreadsheets?: Array<{ id?: string; name?: string; modifiedTime?: string | null }> } | null) => SpreadsheetOption[];
  filterSpreadsheets: (items: SpreadsheetOption[], query: string) => SpreadsheetOption[];
  mapSheetTabs: (payload: { tabs?: Array<{ sheetId?: number; title?: string; index?: number }> } | null) => SheetTabOption[];
  mapProjectConfiguration: (project: Project | null | undefined) => ProjectConfiguration | null;
  canSubmitCreateProject: (args: {
    draft: {
      name?: string;
      spreadsheetId?: string;
      sheetId?: number;
      sheetTitle?: string;
    };
    saving: boolean;
  }) => boolean;
  mapProjectManagementError: (err: { status?: number; name?: string; message?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
    googleAuth?: boolean;
  };
  responseContainsSecrets: (payload: unknown) => boolean;
};

export interface SpreadsheetOption {
  id: string;
  name: string;
  modifiedTime: string | null;
}

export interface SheetTabOption {
  sheetId: number;
  title: string;
  index: number;
}

export interface ProjectConfiguration {
  id: number;
  name: string;
  spreadsheetName: string;
  sheetName: string;
  spreadsheetId: string;
  sheetId: number;
  columns: string[];
  headerCount: number;
  lastSync: string | null;
}

export const validateProjectName = core.validateProjectName;
export const isSpreadsheetId = core.isSpreadsheetId;
export const validateCreateProjectPayload = core.validateCreateProjectPayload;
export const mapSpreadsheets = core.mapSpreadsheets;
export const filterSpreadsheets = core.filterSpreadsheets;
export const mapSheetTabs = core.mapSheetTabs;
export const mapProjectConfiguration = core.mapProjectConfiguration;
export const canSubmitCreateProject = core.canSubmitCreateProject;
export const mapProjectManagementError = core.mapProjectManagementError;
export const responseContainsSecrets = core.responseContainsSecrets;
