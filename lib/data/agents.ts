import { searchAgents, getPromotedAgents, type DirectoryFilters } from "@/lib/services/agents";

export async function getDirectoryAgents(filters: DirectoryFilters) {
  return searchAgents(filters);
}

export async function getPromotedDirectoryAgents() {
  return getPromotedAgents();
}
