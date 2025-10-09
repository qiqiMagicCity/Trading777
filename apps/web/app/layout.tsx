// apps/web/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Header } from "@/components/layout/Header";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Trading777 琦大爷💹💹💹",
  description: "Trading777 Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Script id="freeze-date" strategy="beforeInteractive">
          {`window.NEXT_PUBLIC_FREEZE_DATE=${JSON.stringify(process.env.NEXT_PUBLIC_FREEZE_DATE || "")};`}
        </Script>
        <Script id="writeback-mode" strategy="beforeInteractive">
          {`window.NEXT_PUBLIC_WRITEBACK_MODE=${JSON.stringify(process.env.NEXT_PUBLIC_WRITEBACK_MODE ?? process.env.WRITEBACK_MODE ?? "")};`}
        </Script>
        <Script id="official-close-flag" strategy="beforeInteractive">
          {`window.OFFICIAL_CLOSE_FIX_ENABLED=${JSON.stringify(process.env.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED ?? process.env.OFFICIAL_CLOSE_FIX_ENABLED ?? "")};`}
        </Script>
        <Providers>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
