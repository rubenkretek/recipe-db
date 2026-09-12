import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js and manifest.webmanifest (PWA, added in Phase 8)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     *
     * The two PWA files matter more than they look. A service worker is only
     * accepted if it is served from its own path as JavaScript — run it through
     * the auth proxy and a signed-out request gets a redirect to /login
     * instead, so registration fails silently and nothing about the app appears
     * broken until somebody tries to use it offline. The manifest is fetched
     * without credentials in some browsers, so it would meet the same fate.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
