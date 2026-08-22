import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function hashSharedAdminPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function getConfiguredAdminPasswordHash(): string | null {
  const hash = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH?.trim() ?? "";
  return hash.length === 64 ? hash : null;
}

export function verifySharedAdminPassword(password: string): boolean {
  const stored = getConfiguredAdminPasswordHash();
  if (!stored) return false;
  const actual = hashSharedAdminPassword(password);
  const expected = Buffer.from(stored, "utf8");
  const given = Buffer.from(actual, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
