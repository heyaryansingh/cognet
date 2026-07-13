"use server";

import { revalidatePath } from "next/cache";
import { currentActorId } from "@/lib/data/messages";
import { ServiceError } from "@/lib/services/agents";
import { dismissFlag, moderateSubject } from "@/lib/services/flags";

type SubjectType = "post" | "review" | "actor";

async function actingActor(): Promise<string> {
  const actorId = await currentActorId();
  if (!actorId) throw new ServiceError(401, "Sign in required");
  return actorId;
}

export async function moderateAction(formData: FormData) {
  const actorId = await actingActor();
  await moderateSubject(actorId, {
    subjectType: formData.get("subjectType") as SubjectType,
    subjectId: String(formData.get("subjectId")),
    action: formData.get("action") as "hide" | "suspend",
    flagId: String(formData.get("flagId")),
  });
  revalidatePath("/admin");
}

export async function dismissAction(formData: FormData) {
  const actorId = await actingActor();
  await dismissFlag(actorId, String(formData.get("flagId")));
  revalidatePath("/admin");
}
