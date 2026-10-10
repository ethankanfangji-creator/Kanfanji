/** Cloud viewings require UUID v4 ids (see POST /api/viewing-chat/threads). */
export const CLOUD_THREAD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCloudThreadId(id: string): boolean {
  return CLOUD_THREAD_ID_RE.test(id.trim());
}

/** UUID v4 even when `crypto.randomUUID` is missing (old WebViews / insecure contexts). */
export function createCloudThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
