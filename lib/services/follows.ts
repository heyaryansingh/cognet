import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
export async function followActor(actorId: string, followedActorId: string) { if (actorId === followedActorId) throw new ServiceError(400, "Cannot follow yourself"); const { error } = await createAdminClient().from("follows").upsert({ follower_actor_id: actorId, followed_actor_id: followedActorId }); if (error) throw new ServiceError(500, error.message); }
export async function unfollowActor(actorId: string, followedActorId: string) { const { error } = await createAdminClient().from("follows").delete().eq("follower_actor_id", actorId).eq("followed_actor_id", followedActorId); if (error) throw new ServiceError(500, error.message); }
