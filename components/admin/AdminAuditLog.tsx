"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AuditLog = Readonly<{
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
  admin_operators:
    | Readonly<{ username: string; display_name: string }>
    | null;
}>;

type Props = Readonly<{ onBack: () => void }>;

const ACTION_LABELS: Readonly<Record<string, string>> = {
  ADMIN_INITIAL_OWNER_BOOTSTRAPPED: "초기 OWNER 생성",
  ADMIN_LOGIN: "운영자 로그인",
  ADMIN_LOGOUT: "운영자 로그아웃",
  ADMIN_REAUTHENTICATED: "중요 작업 재인증",
  ADMIN_OPERATOR_CREATED: "운영자 추가",
  ADMIN_OPERATOR_UPDATED: "운영자 변경",
  ADMIN_PASSWORD_CHANGED: "운영자 비밀번호 변경",
};

export default function AdminAuditLog({ onBack }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          logs?: AuditLog[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error);
        setLogs(body.logs ?? []);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "감사 로그 조회에 실패했습니다.",
        ),
      );
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-[430px] bg-gray-50 px-5 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-tokhin-green">AUDIT</p>
          <h1 className="text-2xl font-bold">작업 감사 로그</h1>
        </div>
        <Button variant="outline" onClick={onBack}>
          돌아가기
        </Button>
      </div>
      {error && <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>}
      <div className="space-y-3">
        {logs.map((log) => (
          <Card key={log.id} className="rounded-2xl p-4 shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">
                  {ACTION_LABELS[log.action] ?? log.action}
                </p>
                <p className="text-sm text-muted-foreground">
                  {log.admin_operators?.display_name ??
                    log.admin_operators?.username ??
                    "시스템"}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm ${
                  log.success ? "text-green-600" : "text-red-600"
                }`}
              >
                {log.success ? "성공" : "실패"}
              </span>
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              {new Date(log.created_at).toLocaleString("ko-KR")}
              {log.target_type ? ` · ${log.target_type}` : ""}
              {log.target_id ? ` · ${log.target_id}` : ""}
            </p>
            {log.error_message && (
              <p className="mt-2 text-sm text-red-600">{log.error_message}</p>
            )}
          </Card>
        ))}
        {!error && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">감사 로그가 없습니다.</p>
        )}
      </div>
    </main>
  );
}
