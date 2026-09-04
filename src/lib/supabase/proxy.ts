import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes reachable without a session.
 *
 * /join is here so an invite link works for someone who does not have an
 * account yet: it remembers the code and sends them to sign up first.
 */
const PUBLIC_ROUTES = ["/login", "/signup", "/join"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and redirects signed-out
 * visitors to the login page.
 *
 * The refresh has to happen here because Server Components cannot set cookies:
 * without it an expired access token would never be renewed and people would be
 * logged out at random.
 *
 * Note that this only checks whether a session exists. Which kitchen the user is
 * looking at is resolved in the authenticated layout instead, because answering
 * that needs a database query and running one here would add a round trip to
 * every request in the app.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not put any code between createServerClient and getClaims(). Anything
  // that defers this call can leave users randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  if (!isSignedIn && !isPublicRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // The response must be returned as-is so the refreshed cookies reach the
  // browser. Building a new response without copying them over would
  // desynchronise the client and terminate the session early.
  return supabaseResponse;
}
