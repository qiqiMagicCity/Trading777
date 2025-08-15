import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Header } from "@/components/layout/Header";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Trading777 v7.80",
  description: "Trading777 Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
      <html lang="zh-CN">
        <body suppressHydrationWarning>
        <Script id="freeze-date" strategy="beforeInteractive">
          {`window.NEXT_PUBLIC_FREEZE_DATE=${JSON.stringify(process.env.NEXT_PUBLIC_FREEZE_DATE || "")};`}
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
