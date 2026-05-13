import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, isAccessGateEnabled, isValidAccessToken } from "@/lib/access";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/favicon.ico",
];

export async function middleware(request: NextRequest) {
  if (!isAccessGateEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value;

  if (await isValidAccessToken(token)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/generated/")
  );
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};
