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

export async function recordAdminAudit(
  request: Pick<Request, "headers">,
  input: AuditInput,
): Promise<void> {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;
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
      ip_address: ipAddress,
      user_agent: request.headers.get("user-agent"),
    });

  if (error) {
    throw new Error(`관리자 감사 로그 저장 실패: ${error.message}`);
  }
}
