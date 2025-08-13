"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useResponsive";
import Image from "next/image";

export default function Navigation() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const allLinks = [
    { href: "/", label: "오늘의 예측", icon: "/search-icon.svg" },
    { href: "/history", label: "기록", icon: "/history-icon.svg" },
    { href: "/leaderboard", label: "순위", icon: "/leaderboard-icon.svg" },
    { href: "/tutorial", label: "튜토리얼", icon: "/info-icon.svg" },
    { href: "/admin", label: "프런트", icon: "⚙️" },
  ];

  // Filter out admin link for mobile bottom navigation
  const mobileLinks = allLinks.filter((link) => link.href !== "/admin");

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 px-4 pt-8 h-24 bg-white/80 rounded-tl-[40px] rounded-tr-[40px] shadow-[0px_-2px_24px_0px_rgba(0,0,0,0.12)] backdrop-blur-[1px] z-50">
        <ul className="flex justify-around items-center gap-2">
          {mobileLinks.map((link) => (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className="flex flex-col items-center py-2 px-2 mx-1 transition-all duration-200"
              >
                <Image
                  src={link.icon}
                  alt={link.label}
                  width={22}
                  height={22}
                  className={`transition-all duration-200`}
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
        </ul>
      </nav>
    );
  }

  return (
    <nav className="bg-gray-100 p-4 mb-8 rounded-lg shadow-sm">
      <ul className="flex justify-center gap-8">
        {allLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`text-lg font-semibold pb-1 ${
                pathname === link.href
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-blue-500"
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
