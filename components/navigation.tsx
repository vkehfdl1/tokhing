"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

const navLinks = [
  { href: "/", label: "마켓", icon: "/search-icon.svg" },
  { href: "/history", label: "포지션", icon: "/history-icon.svg" },
  { href: "/leaderboard", label: "리더보드", icon: "/leaderboard-icon.svg" },
  { href: "/tutorial", label: "도움말", icon: "/info-icon.svg" },
];

const isActivePath = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function Navigation() {
  const pathname = usePathname();

  const shouldHide =
    pathname === "/login" ||
    pathname === "/change-password" ||
    pathname.startsWith("/admin");

  if (shouldHide) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 h-24 w-full max-w-[430px] -translate-x-1/2 rounded-tl-[40px] rounded-tr-[40px] bg-white/80 px-3 pb-4 pt-3 shadow-[0px_-2px_24px_0px_rgba(0,0,0,0.12)] backdrop-blur-[1px]">
      <ul className="grid h-full grid-cols-4 gap-1">
        {navLinks.map((link) => {
          const isActive = isActivePath(pathname, link.href);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex h-full flex-col items-center justify-center gap-1 rounded-lg py-1 transition-all duration-200"
                aria-label={link.label}
              >
                <Image
                  src={link.icon}
                  alt={link.label}
                  width={20}
                  height={20}
                  style={{
                    filter:
                      isActive
                        ? "brightness(0) saturate(100%) invert(67%) sepia(45%) saturate(7042%) hue-rotate(78deg) brightness(108%) contrast(101%)"
                        : undefined,
                  }}
                />
                <span
                  className={`text-[11px] font-medium leading-none ${
                    isActive ? "text-tokhin-green" : "text-zinc-500"
                  }`}
                >
                  {link.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
