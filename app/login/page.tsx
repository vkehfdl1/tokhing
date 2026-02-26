"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearUserSession,
  clearPendingPasswordChangeSession,
  getPendingPasswordChangeSession,
  getUserSession,
  setPendingPasswordChangeSession,
  setUserSession,
} from "@/lib/auth";
import Image from "next/image";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [studentNumber, setStudentNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (getUserSession()) {
      router.replace("/");
      return;
    }

    if (getPendingPasswordChangeSession()) {
      router.replace("/change-password");
    }
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!studentNumber.trim() || !password.trim()) {
      setError("학번과 비밀번호를 모두 입력해주세요");
      return;
    }

    if (!/^\d+$/.test(studentNumber.trim())) {
      setError("학번은 숫자만 입력해주세요");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(studentNumber.trim(), password);

      if (!result.success || !result.user_id || !result.username) {
        setError(result.error || "학번 또는 비밀번호가 올바르지 않습니다");
        setIsLoading(false);
        return;
      }

      const session = {
        user_id: result.user_id,
        username: result.username,
        student_number: studentNumber.trim(),
      };

      if (result.password_changed) {
        clearPendingPasswordChangeSession();
        setUserSession(session);
        router.replace("/");
      } else {
        clearUserSession();
        setPendingPasswordChangeSession(session);
        router.replace("/change-password");
      }
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "로그인 중 오류가 발생했습니다"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col justify-center pb-10">
      <div className="flex justify-center mb-6">
        <Image
          src="/toKHin.svg"
          alt="ToKHin' Logo"
          width={160}
          height={80}
          priority
          className="h-auto"
        />
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="username"
            placeholder="학번 입력"
            value={studentNumber}
            onChange={(event) => setStudentNumber(event.target.value)}
            disabled={isLoading}
            className="text-center text-black"
          />

          <Input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
            {isLoading ? "로그인 중..." : "로 그 인"}
          </Button>
        </form>
      </div>
    </div>
  );
}
