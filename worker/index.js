/**
 * Cloudflare Worker — proxy + rate-limit + KV cache + security headers
 * Mirrors cicd-auditor pattern: thin, safe, observable.
 */

const RATE_LIMIT_WINDOW = 60;   // seconds
const RATE_LIMIT_MAX    = 5;    // requests per window per IP
const CACHE_TTL         = 3600; // 1 hour — README results
const STREAM_TIMEOUT    = 300;  // 5 min max for streaming

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    // Health check — no auth needed
    if (url.pathname === "/health") {
      return corsResponse(new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      }));
    }

    // Only proxy /generate
    if (url.pathname !== "/generate" || request.method !== "POST") {
      return corsResponse(new Response("Not found", { status: 404 }));
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimitKey = `rate:${ip}`;
    if (env.RATE_LIMIT) {
      const prev = await env.RATE_LIMIT.get(rateLimitKey);
      const count = prev ? parseInt(prev) : 0;
      if (count >= RATE_LIMIT_MAX) {
        return corsResponse(new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait 60s." }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        ));
      }
      ctx.waitUntil(
        env.RATE_LIMIT.put(rateLimitKey, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })
      );
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ));
    }
    const username = (body.username || "").trim().toLowerCase();
    if (!username) {
      return corsResponse(new Response(
        JSON.stringify({ error: "username is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ));
    }

    // ── KV Cache check ───────────────────────────────────────────────────────
    const cacheKey = `readme:${username}`;
    if (env.CACHE) {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "progress", step: "cache", message: "Serving from cache…" })}\n\n`
            ));
            controller.enqueue(new TextEncoder().encode(
              `data: ${cached}\n\n`
            ));
            controller.close();
          },
        });
        return corsResponse(new Response(stream, {
          headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Cache":       "HIT",
          },
        }));
      }
    }

    // ── Proxy to FastAPI backend (streaming) ─────────────────────────────────
    const backendUrl = env.BACKEND_URL;
    if (!backendUrl) {
      return corsResponse(new Response(
        JSON.stringify({ error: "Backend not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ));
    }

    const upstream = await fetch(`${backendUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT * 1000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return corsResponse(new Response(
        JSON.stringify({ error: `Backend error ${upstream.status}: ${errText.slice(0, 200)}` }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      ));
    }

    // Transform: intercept "done" events and cache them
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    ctx.waitUntil((async () => {
      const reader = upstream.body.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          await writer.write(encoder.encode(chunk));

          // Look for done event and cache it
          if (env.CACHE && chunk.includes('"type":"done"')) {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line.includes('"type":"done"')) {
                const payload = line.slice(6);
                ctx.waitUntil(
                  env.CACHE.put(cacheKey, payload, { expirationTtl: CACHE_TTL })
                );
                break;
              }
            }
          }
        }
      } finally {
        await writer.close();
      }
    })());

    return corsResponse(new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Cache":       "MISS",
        "X-Accel-Buffering": "no",
      },
    }));
  },
};

function corsResponse(response) {
  const r = new Response(response.body, response);
  r.headers.set("Access-Control-Allow-Origin",  "*");
  r.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  r.headers.set("X-Content-Type-Options",       "nosniff");
  r.headers.set("X-Frame-Options",              "DENY");
  r.headers.set("Referrer-Policy",              "strict-origin-when-cross-origin");
  return r;
}
