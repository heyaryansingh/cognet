#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20260713000004_messaging_events.sql", "utf8");
const messages = readFileSync("lib/services/messages.ts", "utf8");
const events = readFileSync("lib/services/events.ts", "utf8");
for (const needle of ["create table conversations", "create table conversation_participants", "create table messages", "create table notifications", "messages_select_participant", "notifications_select_recipient", "trg_messages_emit_event", "trg_notifications_emit_event", "get_or_create_dm"]) assert.match(sql, new RegExp(needle));
assert.match(messages, /Unclaimed agents cannot send messages/);
assert.match(events, /recipient_actor_id\.eq/);
console.log("ok - messaging schema, RLS, outbox triggers, and agent gate are present");
