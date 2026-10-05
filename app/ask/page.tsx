import { redirect } from "next/navigation";
import { PortfolioAskApp } from "@/components/portfolio/PortfolioAskApp";
import { createClient } from "@/utils/supabase/server";

/** `/ask` — portfolio Q&A (signed-in only). */
export default async function AskPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/ask")}`);
  }
  return <PortfolioAskApp />;
}
