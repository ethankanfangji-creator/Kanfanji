export function safeInternalNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://kanfangji.invalid");
    if (parsed.origin !== "https://kanfangji.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
