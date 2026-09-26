"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@kanfangji.app";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export default function PrivacyPage() {
  const { locale } = useI18n();
  const english = locale === "en";
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-7 text-[#1F2937]">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7280]">
        {english ? "Draft for legal review" : "法律文字草稿，請自行或請顧問審閱"}
      </p>
      <h1 className="mt-2 text-2xl font-bold">
        {english ? "Privacy notice" : "隱私權說明"}
      </h1>
      <p className="mt-4">
        {english
          ? "KanFangJi records how the product is used so we can see whether address suggestions and viewing flows are working. Analytics store action counts and coarse labels only. They do not include addresses, coordinates, notes, chat or voice text, file names, or email."
          : "看房記蒐集使用方式，用來了解地址建議與看房流程是否順暢。分析只記動作次數與粗粒度分類，不含地址、座標、筆記、聊天或語音文字、檔名或 Email。"}
      </p>
      <h2 className="mt-6 text-lg font-bold">
        {english ? "What we tell you, and why" : "告知事項與目的"}
      </h2>
      <p className="mt-2">
        {english
          ? "This page is the openness notice for the product. Under Taiwan’s Personal Data Protection Act Article 8 we state the purposes, categories, and how to ask for access or deletion. Under Canada’s PIPEDA we state the purpose, ask before analytics are sent, and keep this explanation available. Address search, viewing notes, and AI conversations are stored for the service itself (on your device or, when you sign in, in Supabase). That is separate from product analytics."
          : "本頁說明蒐集目的與類別。依台灣個人資料保護法第 8 條，我們告知目的、資料類別，以及如何請求閱覽或刪除。依加拿大 PIPEDA，我們說明目的、在送出分析前取得同意，並公開這份說明。地址搜尋、看房筆記與 AI 對話是服務本身所需（留在你的裝置，或在你登入後存於 Supabase），與產品分析分開。"}
      </p>
      <h2 className="mt-6 text-lg font-bold">{english ? "Processors" : "處理者"}</h2>
      <ul className="mt-2 list-disc pl-5">
        <li>Supabase — ca-central-1 ({english ? "account, cloud viewings" : "帳號與雲端看房"})</li>
        <li>Vercel ({english ? "application hosting" : "應用程式託管"})</li>
        <li>OpenAI ({english ? "AI turns you consent to" : "你同意後的 AI 處理"})</li>
        <li>Stripe ({english ? "payments" : "付款"})</li>
        <li>Google Maps Platform ({english ? "address suggestions" : "地址建議"})</li>
        <li>
          PostHog — {POSTHOG_HOST} (
          {english ? "action analytics, only after you allow" : "僅在你允許後的操作分析"}
          )
        </li>
      </ul>
      <h2 className="mt-6 text-lg font-bold">
        {english ? "Cross-border transfer" : "跨境傳輸"}
      </h2>
      <p className="mt-2">
        {english
          ? `Supabase stores data in Canada (ca-central-1). Vercel, OpenAI, Stripe, Google, and PostHog may process data in the United States or, for PostHog, the region of ${POSTHOG_HOST}. We send analytics only after you allow them, and we do not put address or conversation content in those events.`
          : `Supabase 的資料在加拿大（ca-central-1）。Vercel、OpenAI、Stripe、Google，以及 PostHog（依 ${POSTHOG_HOST}）可能在美國或該主機所在區域處理資料。分析事件只在你允許後送出，而且不含地址或對話內容。`}
      </p>
      <h2 className="mt-6 text-lg font-bold">
        {english ? "Retention, withdrawal, deletion" : "保存、撤回與刪除"}
      </h2>
      <p className="mt-2">
        {english
          ? `You can turn analytics off in the account menu at any time. Cloud viewing data stays until you ask us to delete the account. Email ${SUPPORT} to withdraw consent or request deletion.`
          : `你可以隨時在帳號選單關閉分析。雲端看房資料會保留到你要求刪除帳號。撤回同意或要求刪除請寄信到 ${SUPPORT}。`}
      </p>
      <p className="mt-6">
        <Link href="/" className="font-semibold underline-offset-2 hover:underline">
          {english ? "Back" : "返回"}
        </Link>
      </p>
    </main>
  );
}
