import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import { OfflineAppShell } from "@/components/OfflineAppShell";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "看房記 KanFangJi",
  description: "錄下重點、拍關鍵照、影片筆記，一鍵生成給家人看的卡片",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/app-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${notoSansTc.className} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>
          <OfflineAppShell />
          <main id="main-content">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
