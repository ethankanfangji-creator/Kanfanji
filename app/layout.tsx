import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "看房記 KanFangJi",
  description: "錄下重點、拍關鍵照、影片筆記，一鍵生成給家人看的卡片",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${notoSansTc.className} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
