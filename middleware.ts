import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // skip static assets and api/v1 (agent key auth, no cookies)
    "/((?!_next/static|_next/image|favicon.ico|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
