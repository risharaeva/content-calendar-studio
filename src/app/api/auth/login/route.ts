import { NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, buildAccessToken } from "@/lib/access";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  const expectedPassword = process.env.APP_ACCESS_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json({ ok: true });
  }

  if (password !== expectedPassword) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: await buildAccessToken(expectedPassword),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
