import type { ManagedUser, UsersListResponse } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./userManagementCore.js") as {
  displayRole: (role: string | null | undefined) => string;
  displayActive: (isActive: boolean) => string;
  formatProjectCount: (projects: unknown) => string;
  mapManagedUsers: (payload: UsersListResponse | null | undefined) => MappedManagedUser[];
  validateCreateUserForm: (input: {
    name: string;
    loginId: string;
    password: string;
    confirmPassword: string;
  }) => { ok: true; value: { name: string; loginId: string; password: string } } | { ok: false; error: string };
  validatePasswordChangeForm: (input: {
    password: string;
    confirmPassword: string;
  }) => { ok: true; value: string } | { ok: false; error: string };
  nextProjectIdsAfterAssign: (
    currentIds: number[],
    projectId: number
  ) => { ok: true; value: number[] } | { ok: false; error: string; status?: number };
  nextProjectIdsAfterRemove: (
    currentIds: number[],
    projectId: number
  ) => { ok: true; value: number[] };
  mapUserManagementError: (err: { status?: number; name?: string; message?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
  };
  userListContainsPasswordLeak: (users: unknown) => boolean;
};

export interface MappedManagedUser {
  id: number;
  name: string;
  loginId: string;
  role: "admin" | "project_user";
  roleLabel: string;
  isActive: boolean;
  statusLabel: string;
  projects: Array<{ id: number; name: string }>;
  projectCountLabel: string;
}

export const displayRole = core.displayRole;
export const displayActive = core.displayActive;
export const formatProjectCount = core.formatProjectCount;
export const mapManagedUsers = core.mapManagedUsers;
export const validateCreateUserForm = core.validateCreateUserForm;
export const validatePasswordChangeForm = core.validatePasswordChangeForm;
export const nextProjectIdsAfterAssign = core.nextProjectIdsAfterAssign;
export const nextProjectIdsAfterRemove = core.nextProjectIdsAfterRemove;
export const mapUserManagementError = core.mapUserManagementError;
export const userListContainsPasswordLeak = core.userListContainsPasswordLeak;

export type { ManagedUser };
