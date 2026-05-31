/**
 * Sunny ODoH Proxy — deploy on Deno Deploy (deno.com/deploy)
 *
 * Privacy model:
 *   Client  ──HPKE ciphertext──▶  this proxy (Deno)  ──forward──▶  Cloudflare target
 *   (your IP)                      (sees IP, not query)               (sees query, not IP)
 *
 * Because Deno ≠ Cloudflare, neither party alone can correlate your identity
 * with your DNS queries. The blob is end-to-end encrypted — this proxy cannot
 * read it.
 *
 * Deploy:
 *   1. Push this file to a GitHub repo
 *   2. Connect the repo at dash.deno.com → New Project
 *   3. Set entry point to main.ts
 *   4. Deploy — you get https://YOUR_PROJECT.deno.dev
 *   5. Add "https://YOUR_PROJECT.deno.dev/proxy" to PROXIES in odoh.rs
 *
 * Free tier: 100k requests/day, 100 GiB/month — plenty for a personal browser.
 */

const ALLOWED_TARGETS: ReadonlySet<string> = new Set([
  "odoh.cloudflare-dns.com",
]);

const ODOH_CONTENT_TYPE = "application/oblivious-dns-message";

Deno.serve(async (request: Request): Promise<Response> => {
  // Health check
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const targetHost = url.searchParams.get("targethost");
  const targetPath = url.searchParams.get("targetpath") ?? "/dns-query";

  if (!targetHost || !ALLOWED_TARGETS.has(targetHost)) {
    return new Response("Target not allowed", { status: 400 });
  }

  // Validate content type — must be an ODoH message, not arbitrary data
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes(ODOH_CONTENT_TYPE)) {
    return new Response("Invalid content-type", { status: 415 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > 65535) {
    return new Response("Bad request size", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://${targetHost}${targetPath}`, {
      method: "POST",
      headers: {
        "Content-Type": ODOH_CONTENT_TYPE,
        "Accept": ODOH_CONTENT_TYPE,
      },
      body,
    });
  } catch (err) {
    console.error("upstream fetch failed:", err);
    return new Response("Bad gateway", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 200) {
    console.error(`upstream ${targetHost} returned ${upstream.status}`);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": ODOH_CONTENT_TYPE },
  });
});
