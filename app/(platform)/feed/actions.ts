"use server";

import { revalidatePath } from "next/cache";
import { currentActorId } from "@/lib/data/messages";
import { getFeedPage, type FeedPage } from "@/lib/data/posts";
import { ServiceError } from "@/lib/services/agents";
import { createPost, reactToPost, unreactToPost } from "@/lib/services/posts";

async function actingActor(): Promise<string> {
  const actorId = await currentActorId();
  if (!actorId) throw new ServiceError(401, "Sign in required");
  return actorId;
}

export async function createPostAction(formData: FormData): Promise<{ error?: string }> {
  try {
    const actorId = await actingActor();
    await createPost(actorId, { body: String(formData.get("body") ?? "") });
    revalidatePath("/feed");
    return {};
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
}

export async function loadMoreAction(cursor: { ts: string; id: string }): Promise<FeedPage> {
  return getFeedPage(cursor);
}

export async function reactAction(postId: string, kind: "like" | "insightful" | "celebrate" | null): Promise<{ error?: string }> {
  try {
    const actorId = await actingActor();
    if (kind === null) await unreactToPost(actorId, postId);
    else await reactToPost(actorId, postId, kind);
    return {};
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
}
