"use server";

import { revalidatePath } from "next/cache";
import { currentActorId } from "@/lib/data/messages";
import {
  registerAgent,
  updateAgentProfile,
  createAgentKey,
  rotateAgentKey,
  revokeAgentKey,
  ServiceError,
} from "@/lib/services/agents";
import { isValidScope } from "@/lib/auth/agent-keys";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Settings console server actions (S5). Actions call services only; the
// show-once key travels exclusively in the action return value — never
// persisted client-side, never logged, never in a URL.

export type ActionState = {
  error?: string;
  ok?: boolean;
  // present exactly once, on the response that minted it
  apiKey?: string;
  keyScopes?: string[];
  agentHandle?: string;
  oldKeyExpiresAt?: string;
};

async function requireActor(): Promise<string> {
  const actorId = await currentActorId();
  if (!actorId) throw new ServiceError(401, "Sign in first");
  return actorId;
}

function toState(e: unknown): ActionState {
  if (e instanceof ServiceError) return { error: e.message };
  throw e;
}

export async function updateHumanProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actorId = await requireActor();
    const displayName = String(formData.get("display_name") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    if (!displayName || displayName.length > 80) {
      return { error: "Display name required (max 80 chars)" };
    }
    // own-row writes via RLS client — column-limited grants enforce the rest
    const supabase = await createClient();
    const { error: aErr } = await supabase
      .from("actors")
      .update({ display_name: displayName })
      .eq("id", actorId);
    if (aErr) return { error: aErr.message };
    const { error: hErr } = await supabase
      .from("humans")
      .update({ bio: bio || null })
      .eq("actor_id", actorId);
    if (hErr) return { error: hErr.message };
    revalidatePath("/settings/profile");
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function registerAgentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actorId = await requireActor();
    const { profile, apiKey } = await registerAgent(actorId, {
      handle: String(formData.get("handle") ?? ""),
      displayName: String(formData.get("display_name") ?? ""),
      tagline: String(formData.get("tagline") ?? "").trim() || undefined,
    });
    // NO revalidatePath here: it re-renders the page and can unmount the form
    // (empty state -> list) before the show-once key ever displays. The form
    // triggers router.refresh() when the user dismisses the key.
    return { ok: true, apiKey, agentHandle: profile.handle, keyScopes: ["profile:read", "profile:write"] };
  } catch (e) {
    return toState(e);
  }
}

export async function createKeyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actorId = await requireActor();
    const handle = String(formData.get("handle") ?? "");
    const name = String(formData.get("name") ?? "").trim() || "default";
    const scopes = formData.getAll("scopes").map(String).filter(isValidScope);
    if (scopes.length === 0) return { error: "Pick at least one scope" };
    const result = await createAgentKey(actorId, handle, { name, scopes });
    revalidatePath(`/settings/agents/${handle}`);
    return { ok: true, apiKey: result.key, keyScopes: result.scopes, agentHandle: handle };
  } catch (e) {
    return toState(e);
  }
}

export async function rotateKeyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actorId = await requireActor();
    const handle = String(formData.get("handle") ?? "");
    const keyId = String(formData.get("key_id") ?? "");
    const result = await rotateAgentKey(actorId, handle, keyId);
    revalidatePath(`/settings/agents/${handle}`);
    return {
      ok: true,
      apiKey: result.key,
      keyScopes: result.scopes,
      agentHandle: handle,
      oldKeyExpiresAt: result.oldKeyExpiresAt,
    };
  } catch (e) {
    return toState(e);
  }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const actorId = await requireActor();
  const handle = String(formData.get("handle") ?? "");
  const keyId = String(formData.get("key_id") ?? "");
  await revokeAgentKey(actorId, handle, keyId);
  revalidatePath(`/settings/agents/${handle}`);
}

export async function updateAgentOverviewAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actorId = await requireActor();
    const handle = String(formData.get("handle") ?? "");
    await updateAgentProfile(actorId, handle, {
      tagline: String(formData.get("tagline") ?? "").trim() || undefined,
      description: String(formData.get("description") ?? "").trim() || undefined,
    });
    revalidatePath(`/settings/agents/${handle}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function getMyHumanProfile(): Promise<{
  displayName: string;
  handle: string;
  bio: string;
} | null> {
  const actorId = await currentActorId();
  if (!actorId) return null;
  const admin = createAdminClient();
  const [{ data: actor }, { data: human }] = await Promise.all([
    admin.from("actors").select("display_name, handle").eq("id", actorId).maybeSingle(),
    admin.from("humans").select("bio").eq("actor_id", actorId).maybeSingle(),
  ]);
  if (!actor) return null;
  return {
    displayName: actor.display_name,
    handle: actor.handle,
    bio: human?.bio ?? "",
  };
}
