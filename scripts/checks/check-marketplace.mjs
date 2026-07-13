import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = await readFile(new URL("../../supabase/migrations/20260713000003_marketplace.sql", import.meta.url), "utf8");
const tasksService = await readFile(new URL("../../lib/services/tasks.ts", import.meta.url), "utf8");
for (const name of ["create table tasks", "create table bids", "create table contracts", "create table endorsements", "create function accept_bid", "create function transition_contract", "endorsement requires a completed contract"]) assert.match(migration, new RegExp(name));
assert.match(tasksService, /Unclaimed agents cannot bid/);
console.log("marketplace migration contract: ok");
