"use client";

import { usePathname } from "next/navigation";
import AppHeader from "@/components/app-header";
import Navigation from "@/components/navigation";

/** Force light-mode CSS variables so shadcn components render correctly in the admin page */
const lightVars: React.CSSProperties & Record<string, string> = {
  "--background": "0 0% 100%",
  "--foreground": "0 0% 3.9%",
  "--card": "0 0% 100%",
  "--card-foreground": "0 0% 3.9%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "0 0% 3.9%",
  "--primary": "0 0% 9%",
  "--primary-foreground": "0 0% 98%",
  "--secondary": "0 0% 96.1%",
  "--secondary-foreground": "0 0% 9%",
  "--muted": "0 0% 96.1%",
  "--muted-foreground": "0 0% 45.1%",
  "--accent": "0 0% 96.1%",
  "--accent-foreground": "0 0% 9%",
  "--destructive": "0 84.2% 60.2%",
  "--destructive-foreground": "0 0% 98%",
  "--border": "0 0% 89.8%",
  "--input": "0 0% 89.8%",
  "--ring": "0 0% 3.9%",
};

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return (
      <main className="min-h-screen bg-[#111111]">
        <div
          className="mx-auto min-h-screen w-full bg-white text-foreground"
          style={lightVars}
        >
          <div className="w-full">{children}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#111111]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white px-4 pb-28">
        <AppHeader />
        <div className="w-full flex-1">{children}</div>
      </div>
      <Navigation />
    </main>
  );
}
