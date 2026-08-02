"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  changeAdminPassword,
  fetchAdminSession,
  loginAdmin,
  logoutAdmin,
  reauthenticateAdmin,
} from "@/lib/admin/client";
import type { AdminOperator } from "@/lib/admin/types";

export type AdminControls = Readonly<{
  logout: () => Promise<void>;
  reauthenticate: () => Promise<boolean>;
  changePassword: () => Promise<void>;
}>;

type Props = Readonly<{
  children: (operator: AdminOperator, controls: AdminControls) => ReactNode;
}>;

export default function AdminAuthGate({ children }: Props) {
  const [operator, setOperator] = useState<AdminOperator | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminSession()
      .then(setOperator)
      .catch((sessionError: unknown) => {
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "운영자 세션 확인에 실패했습니다.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setOperator(await loginAdmin(username, password));
      setPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "운영자 로그인에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const controls: AdminControls = {
    logout: async () => {
      await logoutAdmin();
      setOperator(null);
      setUsername("");
      setPassword("");
    },
    reauthenticate: async () => {
      const input = window.prompt("중요 작업을 위해 비밀번호를 입력해주세요.");
      if (!input) return false;
      try {
        await reauthenticateAdmin(input);
        return true;
      } catch (reauthError) {
        window.alert(
          reauthError instanceof Error
            ? reauthError.message
            : "재인증에 실패했습니다.",
        );
        return false;
      }
    },
    changePassword: async () => {
      const currentPassword = window.prompt("현재 비밀번호를 입력해주세요.");
      if (!currentPassword) return;
      const newPassword = window.prompt("새 비밀번호를 입력해주세요. (12자 이상)");
      if (!newPassword) return;
      try {
        await changeAdminPassword(currentPassword, newPassword);
        window.alert("비밀번호를 변경했습니다.");
      } catch (passwordError) {
        window.alert(
          passwordError instanceof Error
            ? passwordError.message
            : "비밀번호 변경에 실패했습니다.",
        );
      }
    },
  };

  if (loading && !operator) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[430px] items-center justify-center bg-gray-50 px-5">
        <p className="text-sm text-muted-foreground">운영자 세션 확인 중...</p>
      </main>
    );
  }

  if (operator) return children(operator, controls);

  return (
    <main className="mx-auto flex min-h-screen max-w-[430px] items-center bg-gray-50 px-5 py-12">
      <Card className="w-full rounded-2xl p-6 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">ToKHin&apos; 관리</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            서버에서 인증되는 운영자 계정으로 로그인하세요.
          </p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="운영자 아이디"
            autoComplete="username"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="운영자 비밀번호"
            autoComplete="current-password"
            required
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-12 w-full rounded-lg"
            disabled={loading}
          >
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
