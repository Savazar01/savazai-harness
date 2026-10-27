import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. Block and redirect any legacy / predictable public registration routes
  if (
    pathname === "/signup" ||
    pathname === "/register" ||
    pathname === "/sign-up" ||
    pathname.startsWith("/signup/") ||
    pathname.startsWith("/register/")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    const res = NextResponse.redirect(url);
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return res;
  }

  // 2. Block all unauthenticated public registration API routes immediately with 403 Forbidden
  if (
    pathname.startsWith("/api/auth/sign-up") ||
    pathname.startsWith("/api/auth/signup") ||
    pathname.startsWith("/api/auth/register")
  ) {
    return NextResponse.json(
      { error: "403 Forbidden: Public account registration is permanently disabled." },
      {
        status: 403,
        headers: {
          "X-Frame-Options": "SAMEORIGIN",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    "/signup/:path*",
    "/signup",
    "/register/:path*",
    "/register",
    "/sign-up/:path*",
    "/sign-up",
    "/api/auth/:path*",
  ],
};
