"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Human auth server actions (S3). The signup DB side (actors + humans rows)
// is handled by trg_auth_users_create_human in migration 0001.

export type AuthResult = { error: string } | never;

export async function signUpWithEmail(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();

  if (!email || !password) return { error: "Email and password required" };

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(handle ? { handle } : {}),
      },
    },
  });
  if (error) return { error: error.message };
  redirect("/feed");
}

export async function signInWithEmail(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/feed");
}

export async function signInWithGitHub(): Promise<AuthResult> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  redirect(data.url);
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
