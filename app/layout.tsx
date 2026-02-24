import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import Navigation from "@/components/navigation"; // Import the new component
import AppHeader from "@/components/app-header";
import "./globals.css";
import localFont from "next/font/local";

const defaultUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "ToKHin' 승부 예측",
  icons: {
    icon: "/logo.png",
  },
  description:
    "경희대학교 야구 직관 중앙 동아리 루킹의 승부 예측 활동인 ToKHin'입니다.",
  openGraph: {
    title: "ToKHin' 승부 예측",
    description:
      "경희대학교 야구 직관 중앙 동아리 루킹의 승부 예측 활동인 ToKHin'입니다.",
    url: defaultUrl,
    siteName: "ToKHin' 승부 예측",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: `${defaultUrl}/tokhing-og.png`,
        width: 1536,
        height: 1024,
        alt: "ToKHin' 승부 예측",
      },
    ],
  },
};

const pretendard = localFont({
  src: "../public/fonts/pretendard/PretendardVariable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-pretendard",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable}`}
    >
      <body className={`${pretendard.className} bg-[#111111] antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <main className="min-h-screen bg-[#111111]">
            <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white px-4 pb-28">
              <AppHeader />
              <div className="w-full flex-1">{children}</div>
            </div>
            <Navigation />
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
