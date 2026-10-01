"use server";

import { requireUser } from "@/lib/auth";
import { oneEmoji, templateName, type CardTemplate } from "@/lib/viewing-card-templates";

export async function addOwnCardTemplate(input: {
  viewingId: string;
  name: string;
  icon: string;
}): Promise<{ template: CardTemplate } | { error: string }> {
  const name = templateName(input.name);
  const icon = oneEmoji(input.icon);
  if (!name) return { error: "請填卡片名稱。" };
  if (!icon) return { error: "請只加一個 emoji。" };

  const { supabase, user } = await requireUser();
  const { data: latest, error: latestError } = await supabase
    .from("viewing_card_templates")
    .select("sort_order")
    .eq("owner_user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { error: "新增失敗，請再試一次。" };

  const sortOrder = Math.max(12, (latest?.sort_order ?? 11) + 1);
  const { data, error } = await supabase
    .from("viewing_card_templates")
    .insert({
      owner_user_id: user.id,
      name,
      icon,
      sort_order: sortOrder,
      is_system: false,
    })
    .select("id, name, icon, sort_order, is_system")
    .single();
  if (error || !data) return { error: "新增失敗，請再試一次。" };

  return {
    template: {
      id: data.id,
      name: data.name,
      icon: data.icon,
      sortOrder: data.sort_order,
      isSystem: data.is_system,
    },
  };
}
