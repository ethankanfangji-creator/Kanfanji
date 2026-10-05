import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

export type NotificationPreferences = {
  emailEnabled: boolean;
};

const DEFAULTS: NotificationPreferences = {
  emailEnabled: true,
};

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notification_preferences")
      .select("email_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return DEFAULTS;
    return { emailEnabled: data.email_enabled !== false };
  } catch {
    return DEFAULTS;
  }
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return { ...DEFAULTS };
}
