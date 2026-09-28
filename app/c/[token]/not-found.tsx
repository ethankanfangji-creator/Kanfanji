import zhHant from "@/lib/i18n/messages/zh-Hant";

export default function CompareShareNotFound() {
  const labels = zhHant.compare;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">{labels.shareInvalidTitle}</h1>
      <p className="mt-3 text-sm leading-6">{labels.shareInvalidBody}</p>
    </main>
  );
}
