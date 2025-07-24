import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Navigation from "@/components/navigation"; // Import the new component
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "toKHing 승부 예측",
  description: "경희대학교 야구 직관 중앙 동아리 루킹의 승부 예측 활동인 toKHing입니다.",
  openGraph: {
    title: "toKHing 승부 예측",
    description: "경희대학교 야구 직관 중앙 동아리 루킹의 승부 예측 활동인 toKHing입니다.",
    url: defaultUrl,
    siteName: "toKHing 승부 예측",
    locale: "ko_KR",
    type: "website",
  }
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} bg-gray-50 antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <main className="min-h-screen flex flex-col items-center">
            <Navigation />
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
