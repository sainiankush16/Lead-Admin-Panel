"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  displayRole,
  displayActive,
  formatProjectCount,
  mapManagedUsers,
  validateCreateUserForm,
  validatePasswordChangeForm,
  nextProjectIdsAfterAssign,
  nextProjectIdsAfterRemove,
  mapUserManagementError,
  userListContainsPasswordLeak
} = require("./mobile/utils/userManagementCore");

test("user list mapping and labels", () => {
  const mapped = mapManagedUsers({
    users: [{
      id: 3,
      name: "Anshul",
      loginId: "anshuluser",
      role: "project_user",
      isActive: true,
      projects: [{ id: 1, name: "Advitya" }, { id: 2, name: "Mayur" }, { id: 3, name: "Ozone" }]
    }]
  });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].loginId, "anshuluser");
  assert.equal(mapped[0].roleLabel, "Project User");
  assert.equal(mapped[0].statusLabel, "Active");
  assert.equal(mapped[0].projectCountLabel, "3 Projects");
  assert.equal(displayRole("admin"), "Admin");
  assert.equal(displayActive(false), "Inactive");
  assert.equal(formatProjectCount([{ id: 1 }]), "1 Project");
});

test("create user and password validation", () => {
  assert.equal(validateCreateUserForm({
    name: "",
    loginId: "user1",
    password: "password1",
    confirmPassword: "password1"
  }).ok, false);
  assert.equal(validateCreateUserForm({
    name: "User",
    loginId: "ab",
    password: "password1",
    confirmPassword: "password1"
  }).ok, false);
  assert.equal(validateCreateUserForm({
    name: "User",
    loginId: "user1",
    password: "short",
    confirmPassword: "short"
  }).ok, false);
  assert.equal(validateCreateUserForm({
    name: "User",
    loginId: "user1",
    password: "password1",
    confirmPassword: "password2"
  }).error, "Passwords do not match.");
  const ok = validateCreateUserForm({
    name: " User ",
    loginId: "User.One",
    password: "password1",
    confirmPassword: "password1"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.loginId, "user.one");
  assert.equal(validatePasswordChangeForm({
    password: "password1",
    confirmPassword: "password1"
  }).ok, true);
});

test("assignment add/remove and duplicate handling", () => {
  const dup = nextProjectIdsAfterAssign([1, 2], 2);
  assert.equal(dup.ok, false);
  assert.equal(dup.status, 409);
  const added = nextProjectIdsAfterAssign([1, 2], 3);
  assert.deepEqual(added.value, [1, 2, 3]);
  assert.deepEqual(nextProjectIdsAfterRemove([1, 2, 3], 2).value, [1, 3]);
});

test("error mapping covers auth and conflict codes", () => {
  assert.equal(mapUserManagementError({ status: 401 }).message, "Session expired. Please login again.");
  assert.equal(mapUserManagementError({ status: 403 }).message, "You don't have permission to manage users.");
  assert.equal(mapUserManagementError({ status: 404 }).message, "User or project not found.");
  assert.equal(mapUserManagementError({ status: 409 }).message, "That user or assignment already exists.");
  assert.equal(mapUserManagementError({ status: 409, message: "Login ID is already in use." }).message, "Login ID is already in use.");
  assert.equal(mapUserManagementError({ name: "TypeError" }).message, "Unable to complete the request.");
});

test("password fields are never present in mapped user list", () => {
  const mapped = mapManagedUsers({
    users: [{
      id: 1,
      name: "A",
      loginId: "a",
      role: "project_user",
      isActive: true,
      projects: []
    }]
  });
  assert.equal(userListContainsPasswordLeak(mapped), false);
  assert.equal(JSON.stringify(mapped).includes("password"), false);
});

test("API client exposes existing admin user endpoints", () => {
  const source = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.match(source, /getUsers\(\)/);
  assert.match(source, /createUser\(/);
  assert.match(source, /setUserActive\(/);
  assert.match(source, /resetUserPassword\(/);
  assert.match(source, /replaceUserProjects\(/);
  assert.match(source, /\/api\/users\/\$\{userId\}\/status/);
  assert.match(source, /\/api\/users\/\$\{userId\}\/projects/);
  assert.match(source, /\/api\/users\/\$\{userId\}\/reset-password/);
});

test("users screens enforce admin-only UI gate", () => {
  const list = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/users/index.tsx"), "utf8");
  const detail = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/users/[userId].tsx"), "utf8");
  assert.match(list, /role === "admin"/);
  assert.match(detail, /role === "admin"/);
  assert.match(list, /You don't have permission to manage users/);
  assert.match(detail, /Deactivate User/);
  assert.match(detail, /session will be invalidated|sessions will be invalidated/i);
});
