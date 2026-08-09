import "server-only";
import { createAdminServiceClient } from "@/lib/admin/service";

type AuditInput = Readonly<{
  operatorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  success: boolean;
  errorMessage?: string;
}>;

export function getAdminRequestContext(
  request: Pick<Request, "headers">,
): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function recordAdminAudit(
  request: Pick<Request, "headers">,
  input: AuditInput,
): Promise<void> {
  const context = getAdminRequestContext(request);
  const { error } = await createAdminServiceClient()
    .from("admin_audit_logs")
    .insert({
      operator_id: input.operatorId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      success: input.success,
      error_message: input.errorMessage ?? null,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    });

  if (error) {
    throw new Error(`관리자 감사 로그 저장 실패: ${error.message}`);
  }
}
