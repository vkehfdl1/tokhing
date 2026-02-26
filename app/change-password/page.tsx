"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearPendingPasswordChangeSession,
  getPendingPasswordChangeSession,
  getUserSession,
  setUserSession,
  type UserSession,
} from "@/lib/auth";
import { changePassword } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pendingSession, setPendingSession] = useState<UserSession | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const currentSession = getUserSession();
    if (currentSession) {
      router.replace("/");
      return;
    }

    const pending = getPendingPasswordChangeSession();
    if (!pending) {
      router.replace("/login");
      return;
    }

    setPendingSession(pending);
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!pendingSession) {
      setError("세션 정보가 없습니다. 다시 로그인해주세요");
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError("새 비밀번호와 확인을 모두 입력해주세요");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }

    setIsLoading(true);

    try {
      await changePassword(pendingSession.user_id, newPassword);
      setUserSession(pendingSession);
      clearPendingPasswordChangeSession();
      router.replace("/");
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "비밀번호 변경 중 오류가 발생했습니다"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!pendingSession) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col justify-center pb-10">
      <div className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
        <h1 className="text-2xl font-bold text-center text-black mb-2">
          비밀번호 변경
        </h1>
        <p className="text-center text-sm text-zinc-500 mb-6">
          최초 로그인입니다. 새 비밀번호를 설정해주세요.
        </p>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={isLoading}
            className="text-center text-black"
          />

          <Input
            type="password"
            autoComplete="new-password"
            placeholder="비밀번호 확인"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isLoading}
            className="text-center text-black"
          />

          {error ? (
            <p className="text-sm text-red-500 text-center pt-1">{error}</p>
          ) : null}

          <Button
            type="submit"
            className="w-full h-12 rounded-lg bg-tokhin-green text-white hover:bg-tokhin-green/90"
            disabled={isLoading}
          >
            {isLoading ? "변경 중..." : "변경 완료"}
          </Button>
        </form>
      </div>
    </div>
  );
}
