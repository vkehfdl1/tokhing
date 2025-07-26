"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useResponsive";

export default function Navigation() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const allLinks = [
    { href: "/", label: "오늘의 예측", icon: "🎯" },
    { href: "/history", label: "기록", icon: "📊" },
    { href: "/leaderboard", label: "순위", icon: "🏆" },
    { href: "/tutorial", label: "튜토리얼", icon: "📚" },
    { href: "/admin", label: "프런트", icon: "⚙️" },
  ];

  // Filter out admin link for mobile bottom navigation
  const mobileLinks = allLinks.filter((link) => link.href !== "/admin");

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-1 z-50 shadow-lg">
        <ul className="flex justify-around items-center gap-2">
          {mobileLinks.map((link) => (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center py-2 px-2 mx-1 rounded-xl transition-all duration-200 ${
                  pathname === link.href
                    ? "text-blue-600 bg-blue-50 shadow-md transform scale-105"
                    : "text-gray-600 hover:text-blue-500 hover:bg-gray-50 hover:shadow-sm active:scale-95"
                }`}
              >
                <span className="text-xl mb-1">{link.icon}</span>
                <span className="text-xs font-medium leading-tight text-center">
                  {link.label}
                </span>
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
