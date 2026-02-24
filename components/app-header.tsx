"use client";

import Image from "next/image";
import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getWalletBalance } from "@/lib/api";
import { clearAllAuthState } from "@/lib/auth";
import { WALLET_BALANCE_REFRESH_EVENT } from "@/lib/events";
import { useUserSession } from "@/lib/hooks/useUserSession";

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useUserSession();
  const [balance, setBalance] = useState<number | null>(null);

  const shouldHideHeader = pathname?.startsWith("/admin");
  const hasUserSession = Boolean(session?.user_id);
  const canShowBalance =
    hasUserSession &&
    pathname !== "/login" &&
    pathname !== "/change-password" &&
    !shouldHideHeader;

  const refreshBalance = useCallback(async () => {
    if (!session?.user_id) {
      setBalance(null);
      return;
    }

    try {
      const currentBalance = await getWalletBalance(session.user_id);
      setBalance(currentBalance);
    } catch (error) {
      console.error("Failed to refresh wallet balance:", error);
    }
  }, [session?.user_id]);

  const handleLogout = useCallback(() => {
    clearAllAuthState();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!canShowBalance) {
      setBalance(null);
      return;
    }

    void refreshBalance();

    const intervalId = window.setInterval(() => {
      void refreshBalance();
    }, 30000);

    const handleFocus = () => {
      void refreshBalance();
    };

    const handleWalletRefresh = () => {
      void refreshBalance();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener(WALLET_BALANCE_REFRESH_EVENT, handleWalletRefresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        WALLET_BALANCE_REFRESH_EVENT,
        handleWalletRefresh
      );
    };
  }, [canShowBalance, refreshBalance]);

  if (shouldHideHeader) {
    return null;
  }

  return (
    <div className="flex w-full items-center justify-between py-4">
      <Image
        src="/toKHin.svg"
        alt="ToKHin' Logo"
        width={120}
        height={60}
        priority
        className="h-auto"
      />

      {canShowBalance ? (
        <div className="flex items-center gap-2">
          <div className="flex h-10 items-center rounded-lg bg-zinc-100 px-3 shadow-[0px_2px_10px_0px_rgba(0,0,0,0.10)]">
            <span className="mr-1.5 text-base leading-none">🪙</span>
            <span className="text-sm font-semibold tabular-nums text-black">
              {numberFormatter.format(Math.max(0, balance ?? 0))}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 shadow-[0px_2px_10px_0px_rgba(0,0,0,0.10)] transition-colors duration-200 hover:bg-zinc-200"
            aria-label="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
