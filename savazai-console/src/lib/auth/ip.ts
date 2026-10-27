import { NextRequest } from "next/server";

/**
 * Extracts and sanitizes the true client IP address, prioritizing Cloudflare's
 * unforgeable CF-Connecting-IP header, followed by standard reverse proxy headers.
 */
export function getClientIp(target: Request | NextRequest | Headers | null | undefined): string {
  if (!target) return "127.0.0.1";

  let headers: Headers;
  if ("headers" in target && typeof target.headers.get === "function") {
    headers = target.headers;
  } else if (typeof (target as Headers).get === "function") {
    headers = target as Headers;
  } else {
    return "127.0.0.1";
  }

  // 1. Cloudflare True Client IP (set directly by Cloudflare edge; cannot be spoofed by client)
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  // 2. Standard single reverse-proxy header (nginx / Caddy / Traefik / Coolify)
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  // 3. X-Forwarded-For: Take the first (client) IP in the chain and sanitize
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim()) {
    const ips = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  return "127.0.0.1";
}
