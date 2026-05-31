/**
 * Sunny DNS Relay — deploy on Deno Deploy (deno.com/deploy)
 */

const UPSTREAM = "https://dns.quad9.net/dns-query";
const DNS_CONTENT_TYPE = "application/dns-message";

Deno.serve(async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return new Response("ok");
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes(DNS_CONTENT_TYPE)) {
    return new Response("Invalid content-type", { status: 415 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > 65535) {
    return new Response("Bad request size", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": DNS_CONTENT_TYPE,
        Accept: DNS_CONTENT_TYPE,
      },
      body,
    });
  } catch (err) {
    console.error("upstream fetch failed:", err);
    return new Response("Bad gateway", { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": DNS_CONTENT_TYPE },
  });
});
