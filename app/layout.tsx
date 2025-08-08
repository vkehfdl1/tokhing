import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Image from "next/image";
import Navigation from "@/components/navigation"; // Import the new component
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "ToKHin' 승부 예측",
  icons: {
    icon: "/logo.png",
  },
  description:
    "경희대학교 야구 직관 중앙 동아리 루킹의 승부 예측 활동인 ToKHin'입니다.",
  viewport: "width=device-width, initial-scale=1",
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
        url: `${defaultUrl}/og-image.png`,
        width: 1536,
        height: 1024,
        alt: "ToKHin' 승부 예측",
      },
    ],
  },
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
          <main className="min-h-screen flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20 sm:pb-0">
            {/* Logo at the top center */}
            <div className="w-full flex justify-center py-4">
              <Image
                src="/toKHin.svg"
                alt="ToKHin' Logo"
                width={120}
                height={60}
                priority
                className="h-auto"
              />
            </div>
            <Navigation />
            <div className="w-full max-w-4xl mx-auto">{children}</div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
