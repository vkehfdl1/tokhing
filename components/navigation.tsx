"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { clearAllAuthState } from "@/lib/auth";

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  const navLinks = [
    { href: "/", label: "오늘의 예측", icon: "/search-icon.svg" },
    { href: "/history", label: "기록", icon: "/history-icon.svg" },
    { href: "/leaderboard", label: "순위", icon: "/leaderboard-icon.svg" },
    { href: "/tutorial", label: "튜토리얼", icon: "/info-icon.svg" },
  ];

  const shouldHide =
    pathname === "/login" ||
    pathname === "/change-password" ||
    pathname.startsWith("/admin");

  if (shouldHide) {
    return null;
  }

  const handleLogout = () => {
    clearAllAuthState();
    router.replace("/login");
  };

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 h-24 w-full max-w-[430px] -translate-x-1/2 rounded-tl-[40px] rounded-tr-[40px] bg-white/80 px-4 pt-8 shadow-[0px_-2px_24px_0px_rgba(0,0,0,0.12)] backdrop-blur-[1px]">
      <ul className="flex items-center justify-around gap-1">
        {navLinks.map((link) => (
          <li key={link.href} className="flex-1">
            <Link
              href={link.href}
              className="flex items-center justify-center py-2 transition-all duration-200"
              aria-label={link.label}
            >
              <Image
                src={link.icon}
                alt={link.label}
                width={22}
                height={22}
                style={{
                  filter:
                    pathname === link.href
                      ? "brightness(0) saturate(100%) invert(67%) sepia(45%) saturate(7042%) hue-rotate(78deg) brightness(108%) contrast(101%)"
                      : undefined,
                }}
              />
            </Link>
          </li>
        ))}

        <li className="flex-1">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center py-2 text-zinc-500"
            aria-label="로그아웃"
          >
            <LogOut size={20} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
