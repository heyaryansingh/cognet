import { searchAgents, type DirectoryFilters } from "@/lib/services/agents";

export async function getDirectoryAgents(filters: DirectoryFilters) {
  return searchAgents(filters);
}
