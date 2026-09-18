/** Allow only same-origin relative paths after auth redirects. */
export function safeInternalNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  if (trimmed.includes("://") || trimmed.includes("\\")) return "/";
  return trimmed;
}
