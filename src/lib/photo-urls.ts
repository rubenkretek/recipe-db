import { unstable_cache } from "next/cache";

import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only. Importing this from a Client Component drags `next/headers` into
 * the browser bundle and fails the build — the shared constants live in
 * `photos.ts` for exactly that reason.
 */

/**
 * How long a signed URL stays valid, and how long we reuse one before minting
 * a replacement.
 *
 * The gap between the two is the safety margin: a URL handed out at the very
 * end of its reuse window still has over an hour of life left. What makes that
 * true is the window in the cache key below — `revalidate` alone does NOT
 * bound the age of what gets served.
 */
const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;
const SIGNED_URL_CACHE_SECONDS = 50 * 60;

/**
 * Signs a batch of storage paths, reusing recent URLs.
 *
 * Signing is memoised because a signed URL carries a fresh token every time it
 * is minted, and a new URL is a new download: regenerating per render would
 * guarantee a browser cache miss and re-fetch every visible photo on every
 * navigation. Caching the URL itself is what makes the browser cache work at
 * all. SPEC.md §8 Phase 3 asks for "signed URLs with a sensible cache"; this is
 * what that means in practice.
 *
 * Returns a map of storage path to URL. A path that cannot be signed — because
 * the object is missing, or RLS denies it — is simply absent from the map, so
 * callers render their placeholder rather than a broken image.
 */
export async function signedUrlsFor(
  storagePaths: string[],
): Promise<Map<string, string>> {
  if (storagePaths.length === 0) {
    return new Map();
  }

  // Sorted so the same set of paths in a different order is one cache entry
  // rather than two.
  const paths = [...new Set(storagePaths)].sort();

  // The client is built HERE, outside the cache scope, and closed over.
  // unstable_cache refuses any dynamic data source inside it, and creating a
  // Supabase client reads cookies() — doing it inside throws at render time
  // rather than at build, so it only surfaces on a page that actually has
  // photos to sign.
  const supabase = await createClient();

  // The hard expiry `revalidate` cannot provide.
  //
  // `unstable_cache` is stale-while-revalidate: once past `revalidate` it still
  // SERVES the stale value and refreshes in the background. For data that
  // merely goes out of date that is ideal; for a credential with an expiry it
  // is a bug. An entry nobody had requested for two days was handed out two
  // days old — a URL that had expired 49 hours earlier, which storage answered
  // with a 400 and the page rendered as a missing image. Refreshing appeared to
  // fix it only because the refresh got what the background revalidation had
  // just written.
  //
  // Bucketing the clock into the key gives a genuine miss at each boundary, so
  // what is served is never older than one window and always has
  // TTL - CACHE seconds of life left. `revalidate` is kept so abandoned buckets
  // do not sit in the cache forever.
  const cacheWindow = Math.floor(
    Date.now() / (SIGNED_URL_CACHE_SECONDS * 1000),
  );

  const load = unstable_cache(
    async () => {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (error || !data) {
        // A signing failure is not worth taking the page down for. The caller
        // falls back to its placeholder.
        return [] as { path: string | null; signedUrl: string }[];
      }

      return data.map((entry) => ({
        path: entry.path,
        signedUrl: entry.signedUrl,
      }));
    },
    // The key is the paths themselves, each of which begins with its kitchen
    // id. A cached URL therefore cannot leak across kitchens: a member of one
    // kitchen never asks to sign a path belonging to another, because the paths
    // come from rows RLS already filtered.
    ["recipe-photo-signed-urls", String(cacheWindow), ...paths],
    { revalidate: SIGNED_URL_CACHE_SECONDS },
  );

  const signed = await load();

  const urls = new Map<string, string>();
  for (const entry of signed) {
    if (entry.path && entry.signedUrl) {
      urls.set(entry.path, entry.signedUrl);
    }
  }
  return urls;
}
