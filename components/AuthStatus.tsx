import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/auth/actions";

export async function AuthStatus({ compact = false }: { compact?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="h-8 px-3 rounded-full bg-black text-white text-[11px] font-bold inline-flex items-center"
      >
        登入
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : ""}`}>
      {!compact && (
        <span className="text-[11px] text-[#6B7280] max-w-[120px] truncate">
          {user.email}
        </span>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className="h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
        >
          登出
        </button>
      </form>
    </div>
  );
}
