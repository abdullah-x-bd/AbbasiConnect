import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const server = readFileSync(path.join(repo, "apps/api/src/server-v2.ts"), "utf8");
const gateway = readFileSync(path.join(repo, "apps/api/src/gateway.ts"), "utf8");
const media = readFileSync(path.join(repo, "apps/api/src/media.ts"), "utf8");
const pkg = JSON.parse(readFileSync(path.join(repo, "apps/mobile/package.json"), "utf8"));
const endpoints = [
  ["post","/auth/request-otp-dev"],["post","/auth/register"],["post","/auth/sign-in"],
  ["get","/auth/session"],["get","/auth/me"],["patch","/auth/me"],["get","/directory"],
  ["get","/family/me"],["get","/family/search"],["get","/family/tree/:userId"],
  ["post","/family/members"],["post","/family/claim"],["post","/family/access/:targetId"],["patch","/family/access/:id"],
  ["get","/rishte"],["get","/rishte/me"],["put","/rishte/me"],["delete","/rishte/me"],
  ["post","/rishte/:userId/interest"],["get","/rishte/interests"],["patch","/rishte/interests/:id"],
  ["get","/community/feed"],["post","/community/posts"],["delete","/community/posts/:id"],
  ["post","/community/posts/:id/like"],["post","/community/posts/:id/comments"],["delete","/community/comments/:id"],
  ["get","/crypto/me"],["put","/crypto/me"],["post","/messages-secure/threads/:userId"],
  ["get","/messages-secure/threads"],["get","/messages-secure/threads/:id"],["post","/messages-secure/threads/:id/messages"],
  ["get","/admin/overview"],["get","/admin/users"],["patch","/admin/users/:id"],
  ["get","/admin/reports"],["patch","/admin/reports/:id"]
];
test("mobile endpoints exist in the backend API", () => {
  for (const [verb, route] of endpoints) assert.ok(server.includes('app.' + verb + '("' + route + '"'), verb.toUpperCase() + " " + route);
});
test("gateway handles bootstrap and native media requests", () => {
  assert.ok(gateway.includes('"/performance/bootstrap"'));
  assert.ok(gateway.includes('"/media/"'));
  assert.ok(media.includes('"/media/profile"'));
  assert.ok(media.includes('"/media/posts"'));
});
test("Expo workspace is correctly named", () => {
  assert.equal(pkg.name, "@abbasiconnect/mobile");
  assert.ok(pkg.dependencies.expo.startsWith("~58."));
});
