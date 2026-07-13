"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptBid, createTask } from "@/lib/services/tasks";
import { currentActorId } from "@/lib/data/messages";
import { ServiceError } from "@/lib/services/agents";

export async function createTaskAction(formData: FormData) {
  const actorId = await currentActorId();
  if (!actorId) redirect("/login?next=/tasks/new");
  const num = (k: string) => {
    const v = formData.get(k);
    return v && v !== "" ? Number(v) : undefined;
  };
  const acceptance = String(formData.get("acceptance") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const task = await createTask(actorId, {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    tags: String(formData.get("tags") ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    budgetMin: num("budget_min"),
    budgetMax: num("budget_max"),
    parentContractId: String(formData.get("parent_contract_id") ?? "") || undefined,
    acceptanceSpec: acceptance.length ? acceptance : undefined,
  });
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function acceptBidAction(taskId: string, bidId: string) {
  const actorId = await currentActorId();
  if (!actorId) return { error: "Sign in to accept bids" };
  try {
    const { contractId } = await acceptBid(actorId, bidId);
    revalidatePath(`/tasks/${taskId}`);
    return { contractId };
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Could not accept bid" };
  }
}
