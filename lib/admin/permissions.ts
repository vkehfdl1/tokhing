import type { AdminRole } from "@/lib/admin/types";

export type AdminPermission =
  | "password:change"
  | "operators:read"
  | "operators:manage"
  | "audit:read"
  | "admin:mutate";

const ROLE_PERMISSIONS: Readonly<
  Record<AdminRole, ReadonlySet<AdminPermission>>
> = {
  OWNER: new Set([
    "password:change",
    "operators:read",
    "operators:manage",
    "audit:read",
    "admin:mutate",
  ]),
  OPERATOR: new Set([
    "password:change",
    "operators:read",
    "audit:read",
    "admin:mutate",
  ]),
  VIEWER: new Set(["password:change", "operators:read"]),
};

export function canUseAdminPermission(
  role: AdminRole,
  mustChangePassword: boolean,
  permission: AdminPermission,
): boolean {
  if (mustChangePassword && permission !== "password:change") {
    return false;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}
