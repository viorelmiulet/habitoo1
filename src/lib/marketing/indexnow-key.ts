/** Serves the public IndexNow verification file; any other key-shaped name gets 404. */
export function indexNowKeyResponse(pathname: string, key: string | undefined): Response | null {
  const match = /^\/([A-Za-z0-9-]{8,128})\.txt$/.exec(pathname);
  if (!match || !key) return null;
  if (match[1] === key) return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (match[1].length === key.length) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return null;
}
