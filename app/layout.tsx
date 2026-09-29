import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Noto_Sans_TC } from "next/font/google";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { I18nProvider } from "@/components/I18nProvider";
import { OfflineAppShell } from "@/components/OfflineAppShell";
import { detectLocale, htmlLang, isLocale, LOCALE_STORAGE_KEY } from "@/lib/i18n/config";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const accept = (await headers()).get("accept-language");
  const stored = jar.get(LOCALE_STORAGE_KEY)?.value;
  const initialLocale = isLocale(stored) ? stored : detectLocale(accept?.split(",")[0]);
  return (
    <html lang={htmlLang(initialLocale)} className={`${notoSansTc.className} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider initialLocale={initialLocale}>
          <AnalyticsProvider>
            <OfflineAppShell />
            <main id="main-content">{children}</main>
          </AnalyticsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
