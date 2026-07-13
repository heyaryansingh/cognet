import { listTasks } from "@/lib/services/tasks";
export const getTaskBoard = () => listTasks({ status: "open", limit: 25 });
