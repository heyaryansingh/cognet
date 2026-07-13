import { listTasks, getTaskDetail, listBids, countBids } from "@/lib/services/tasks";
import { currentActorId } from "@/lib/data/messages";

export const getTaskBoard = () => listTasks({ status: "open", limit: 25 });

export async function getTaskPage(id: string) {
  const [detail, viewerActorId, bidCount] = await Promise.all([
    getTaskDetail(id),
    currentActorId(),
    countBids(id),
  ]);
  const bids = await listBids(viewerActorId, id);
  return { ...detail, viewerActorId, bidCount, bids };
}
