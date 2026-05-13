export const ACCESS_COOKIE_NAME = "content_calendar_access";

export function isAccessGateEnabled() {
  return Boolean(process.env.APP_ACCESS_PASSWORD);
}

export async function buildAccessToken(password: string) {
  const secret = process.env.AUTH_SECRET || process.env.APP_ACCESS_PASSWORD || "local-dev";
  const input = new TextEncoder().encode(`${password}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAccessToken(token: string | undefined) {
  const password = process.env.APP_ACCESS_PASSWORD;

  if (!password) {
    return true;
  }

  return token === await buildAccessToken(password);
}
