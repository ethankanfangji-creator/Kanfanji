/** Fixed report heading — address is shown separately on session / share UI. */
export const DEFAULT_CHAT_REPORT_TITLE = "看房評估報告";

/**
 * Drop "address — …報告" prefixes so the title does not repeat the page address.
 * Empty / unknown titles fall back to {@link DEFAULT_CHAT_REPORT_TITLE}.
 */
export function resolveChatReportTitle(title?: string | null): string {
  const raw = title?.trim() || "";
  if (!raw) return DEFAULT_CHAT_REPORT_TITLE;
  const afterDash = raw.replace(/^.+?\s*[—–-]\s*/, "").trim();
  if (
    afterDash &&
    afterDash !== raw &&
    /評估報告|评估报告|viewing report|รายงาน/i.test(afterDash)
  ) {
    return DEFAULT_CHAT_REPORT_TITLE;
  }
  if (/^(看房評估報告|看房评估报告)$/.test(raw)) {
    return DEFAULT_CHAT_REPORT_TITLE;
  }
  return raw;
}
