"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAdminOperator,
  listAdminOperators,
  updateAdminOperator,
} from "@/lib/admin/client";
import type { AdminOperator, AdminRole } from "@/lib/admin/types";

type Props = Readonly<{
  currentOperator: AdminOperator;
  onBack: () => void;
  onReauthenticate: () => Promise<boolean>;
}>;

const ROLES: readonly AdminRole[] = ["OWNER", "OPERATOR", "VIEWER"];

export default function OperatorManagement({
  currentOperator,
  onBack,
  onReauthenticate,
}: Props) {
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("VIEWER");
  const [message, setMessage] = useState("");

  const loadOperators = useCallback(async () => {
    try {
      setOperators(await listAdminOperators());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadOperators();
    });
  }, [loadOperators]);

  async function handleCreate() {
    if (!(await onReauthenticate())) return;
    try {
      await createAdminOperator({
        username,
        displayName,
        role,
        temporaryPassword,
      });
      setUsername("");
      setDisplayName("");
      setTemporaryPassword("");
      setRole("VIEWER");
      setMessage("운영자를 추가했습니다.");
      await loadOperators();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "추가에 실패했습니다.");
    }
  }

  async function handleUpdate(
    operator: AdminOperator,
    input: {
      role?: AdminRole;
      isActive?: boolean;
      temporaryPassword?: string;
    },
  ) {
    if (!(await onReauthenticate())) return;
    try {
      await updateAdminOperator(operator.id, input);
      setMessage("운영자 정보를 변경했습니다.");
      await loadOperators();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "변경에 실패했습니다.");
    }
  }

  async function handlePasswordReset(operator: AdminOperator) {
    const temporaryPassword = window.prompt(
      "새 임시 비밀번호를 입력해주세요. (12자 이상)",
    );
    if (!temporaryPassword) return;
    await handleUpdate(operator, { temporaryPassword });
  }

  return (
    <main className="mx-auto min-h-screen max-w-[430px] bg-gray-50 px-5 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-tokhin-green">ADMIN OPS</p>
          <h1 className="text-2xl font-bold">운영자 관리</h1>
        </div>
        <Button variant="outline" onClick={onBack}>
          돌아가기
        </Button>
      </div>

      {currentOperator.role === "OWNER" && (
        <Card className="mb-5 space-y-3 rounded-2xl p-5 shadow-lg">
          <h2 className="font-bold">운영자 추가</h2>
          <Input
            placeholder="운영자 아이디"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            placeholder="표시 이름"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Input
            type="password"
            placeholder="임시 비밀번호 (12자 이상)"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
          />
          <select
            aria-label="운영자 역할"
            className="h-12 w-full rounded-lg border bg-white px-3"
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
          >
            {ROLES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <Button className="h-12 w-full" onClick={handleCreate}>
            운영자 추가
          </Button>
        </Card>
      )}

      {message && <p className="mb-4 text-sm font-semibold">{message}</p>}

      <div className="space-y-3">
        {operators.map((operator) => (
          <Card key={operator.id} className="rounded-2xl p-4 shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{operator.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {operator.username} · {operator.role}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  operator.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {operator.isActive ? "활성" : "비활성"}
              </span>
            </div>
            {currentOperator.role === "OWNER" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <select
                  aria-label={`${operator.username} 역할`}
                  className="h-10 flex-1 rounded-lg border bg-white px-2 text-sm"
                  value={operator.role}
                  onChange={(event) =>
                    void handleUpdate(operator, {
                      role: event.target.value as AdminRole,
                    })
                  }
                >
                  {ROLES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={() =>
                    void handleUpdate(operator, {
                      isActive: !operator.isActive,
                    })
                  }
                >
                  {operator.isActive ? "비활성화" : "활성화"}
                </Button>
                <Button
                  variant="outline"
                  className="col-span-2"
                  onClick={() => void handlePasswordReset(operator)}
                >
                  임시 비밀번호 재설정
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
