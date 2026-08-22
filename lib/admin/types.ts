import { z } from "zod";

export const AdminRoleSchema = z.enum(["OWNER", "OPERATOR", "VIEWER"]);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

const AdminOperatorRowSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string(),
  role: AdminRoleSchema,
  is_active: z.boolean(),
  must_change_password: z.boolean(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type AdminOperator = Readonly<{
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export function parseAdminOperator(value: unknown): AdminOperator {
  const row = AdminOperatorRowSchema.parse(value);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const AdminSessionRowSchema = z.object({
  id: z.uuid(),
  operator_id: z.uuid(),
  expires_at: z.string(),
  reauthenticated_at: z.string(),
  revoked_at: z.string().nullable(),
  admin_operators: AdminOperatorRowSchema,
});

export type AdminSession = Readonly<{
  id: string;
  operator: AdminOperator;
  expiresAt: string;
  reauthenticatedAt: string;
}>;

export function parseAdminSession(value: unknown): AdminSession {
  const row = AdminSessionRowSchema.parse(value);
  return {
    id: row.id,
    operator: parseAdminOperator(row.admin_operators),
    expiresAt: row.expires_at,
    reauthenticatedAt: row.reauthenticated_at,
  };
}
