import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getConfiguredAdminPasswordHash } from "@/lib/admin/password";
import type { AdminOperator, AdminSession } from "@/lib/admin/types";

export const ADMIN_SESSION_COOKIE = "tokhin_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const SHARED_ADMIN_OPERATOR: AdminOperator = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  displayName: "운영진",
  role: "OWNER",
  isActive: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type CookiePayload = Readonly<{
  exp: number;
  reauth: number;
}>;

function signingKey(): Buffer | null {
  const hash = getConfiguredAdminPasswordHash();
  if (!hash) return null;
  return Buffer.from(`tokhin-admin:${hash}`);
}

function sign(encoded: string, key: Buffer): string {
  return createHmac("sha256", key).update(encoded).digest("base64url");
}

export function createAdminSessionCookie(
  reauthenticated = true,
): Readonly<{ token: string; expiresAt: Date }> {
  const key = signingKey();
  if (!key) {
    throw new Error("NEXT_PUBLIC_ADMIN_PASSWORD_HASH가 설정되지 않았습니다.");
  }
  const now = Date.now();
  const expiresAt = new Date(now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
  const payload: CookiePayload = {
    exp: expiresAt.getTime(),
    reauth: reauthenticated ? now : 0,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded, key)}`, expiresAt };
}

function parseToken(token: string): CookiePayload | null {
  const key = signingKey();
  if (!key) return null;
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  const expected = sign(encoded, key);
  const given = Buffer.from(mac);
  const good = Buffer.from(expected);
  if (given.length !== good.length || !timingSafeEqual(given, good)) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as CookiePayload;
  } catch {
    return null;
  }
}

export async function getAdminSession(
  request: NextRequest,
): Promise<AdminSession | null> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = parseToken(token);
  if (!payload || payload.exp <= Date.now()) return null;
  return {
    id: SHARED_ADMIN_OPERATOR.id,
    operator: SHARED_ADMIN_OPERATOR,
    expiresAt: new Date(payload.exp).toISOString(),
    reauthenticatedAt: new Date(payload.reauth || payload.exp).toISOString(),
  };
}

export async function revokeAdminSession(_sessionId: string): Promise<void> {}

export async function markSessionReauthenticated(
  _sessionId: string,
): Promise<string> {
  return createAdminSessionCookie(true).token;
}
