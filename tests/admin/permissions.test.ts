import { describe, expect, it } from "vitest";
import {
  canUseAdminPermission,
  type AdminPermission,
} from "@/lib/admin/permissions";
import type { AdminRole } from "@/lib/admin/types";

const roles: readonly AdminRole[] = ["OWNER", "OPERATOR", "VIEWER"];

describe("admin permission policy", () => {
  it("limits temporary-password sessions to changing the password", () => {
    for (const role of roles) {
      expect(canUseAdminPermission(role, true, "password:change")).toBe(true);
      expect(canUseAdminPermission(role, true, "operators:read")).toBe(false);
      expect(canUseAdminPermission(role, true, "audit:read")).toBe(false);
      expect(canUseAdminPermission(role, true, "admin:mutate")).toBe(false);
    }
  });

  it("keeps the role permission matrix after password change", () => {
    const expectations: Readonly<
      Record<AdminRole, Readonly<Record<AdminPermission, boolean>>>
    > = {
      OWNER: {
        "password:change": true,
        "operators:read": true,
        "operators:manage": true,
        "audit:read": true,
        "admin:mutate": true,
      },
      OPERATOR: {
        "password:change": true,
        "operators:read": true,
        "operators:manage": false,
        "audit:read": true,
        "admin:mutate": true,
      },
      VIEWER: {
        "password:change": true,
        "operators:read": true,
        "operators:manage": false,
        "audit:read": false,
        "admin:mutate": false,
      },
    };

    for (const role of roles) {
      for (const [permission, allowed] of Object.entries(
        expectations[role],
      )) {
        expect(
          canUseAdminPermission(
            role,
            false,
            permission as AdminPermission,
          ),
        ).toBe(allowed);
      }
    }
  });
});
