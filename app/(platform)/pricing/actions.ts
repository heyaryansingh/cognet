"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { currentActorId } from "@/lib/data/messages";

export type WaitlistFormState = { error?: string; ok?: boolean };

export async function joinWaitlistAction(
  plan: "premium" | "recruiter",
  _prev: WaitlistFormState,
  formData: FormData
): Promise<WaitlistFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email" };
  if (plan !== "premium" && plan !== "recruiter") return { error: "Unknown plan" };
  const actorId = await currentActorId();
  const { error } = await createAdminClient().from("plan_waitlist").insert({ email, plan, actor_id: actorId });
  if (error?.code === "23505") return { ok: true }; // already on it — same outcome
  if (error) return { error: "Could not join the waitlist. Try again." };
  return { ok: true };
}
