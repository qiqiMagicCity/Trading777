// apps/web/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Header } from "@/components/layout/Header";
import GlobalModeProvider from "@/providers/GlobalModeProvider";
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
        <GlobalModeProvider>
          <Providers>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow">{children}</main>
            </div>
          </Providers>
        </GlobalModeProvider>
        {/* ↓ Tailwind 类名哨兵（隐藏），保证徽章所需的颜色/动效类被构建收集 */}
        {/* live 绿色系 + degraded/close 琥珀色系 + halo 边框 + 动效（强制 + motion-safe） */}
        <span
          aria-hidden
          className="
            hidden
            tw-status-badge-sentinel
            text-emerald-300 bg-emerald-500/10 ring-emerald-500/30 bg-emerald-400
            text-amber-300 bg-amber-500/10 ring-amber-500/30 bg-amber-400
            ring-gray-400/40 ring-2
            animate-ping motion-safe:animate-ping
            animate-pulse motion-safe:animate-pulse
          "
        />
      </body>
    </html>
  );
}
