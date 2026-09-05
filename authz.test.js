"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ROLES,
  resolveAuthenticatedUser,
  resolveAdminRole,
  canAccessProject,
  canUpdateLeadStatus,
  canManageProjects,
  canManageUsers,
  canManageGoogle,
  canSyncProjects,
  sanitizeAppUser
} = require("./authz");

test("authentication rejects missing and inactive users", () => {
  assert.equal(resolveAuthenticatedUser(null).status, 401);
  assert.equal(resolveAuthenticatedUser({ is_active: 0, role: ROLES.ADMIN }).status, 401);
  assert.equal(resolveAuthenticatedUser({ is_active: 1, role: "hacker" }).status, 403);
  assert.equal(resolveAuthenticatedUser({ is_active: 1, role: ROLES.PROJECT_USER }).ok, true);
});

test("admin-only capabilities are denied for project users", () => {
  const projectUser = { is_active: 1, role: ROLES.PROJECT_USER };
  const admin = { is_active: 1, role: ROLES.ADMIN };
  assert.equal(resolveAdminRole(projectUser).status, 403);
  assert.equal(canManageProjects(projectUser).status, 403);
  assert.equal(canManageUsers(projectUser).status, 403);
  assert.equal(canManageGoogle(projectUser).status, 403);
  assert.equal(canSyncProjects(projectUser).status, 403);
  assert.equal(resolveAdminRole(admin).ok, true);
});

test("project access allows admin always and project_user only when assigned", () => {
  const admin = { is_active: 1, role: ROLES.ADMIN };
  const member = { is_active: 1, role: ROLES.PROJECT_USER };
  assert.equal(canAccessProject(admin, false).ok, true);
  assert.equal(canAccessProject(member, true).ok, true);
  assert.equal(canAccessProject(member, false).status, 403);
  assert.equal(canUpdateLeadStatus(member, true).ok, true);
  assert.equal(canUpdateLeadStatus(member, false).status, 403);
});

test("sanitizeAppUser never includes password hash", () => {
  const safe = sanitizeAppUser({
    id: 3,
    name: "Rahul",
    login_id: "rahul01",
    role: ROLES.PROJECT_USER,
    is_active: 1,
    password_hash: "$argon2id$should-not-leak"
  });
  assert.deepEqual(safe, {
    id: 3,
    name: "Rahul",
    loginId: "rahul01",
    role: ROLES.PROJECT_USER,
    isActive: true
  });
  assert.equal(JSON.stringify(safe).includes("password"), false);
  assert.equal(JSON.stringify(safe).includes("argon2"), false);
});
