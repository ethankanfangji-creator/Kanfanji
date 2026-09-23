import Link from "next/link";
import { EmptyState } from "@/components/ui/PageState";

export default function NotFound() {
  return (
    <EmptyState
      title="找不到這個頁面"
      description="網址可能已變更，或內容已不存在。"
      action={
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-bold text-white"
        >
          回到首頁
        </Link>
      }
    />
  );
}
