type SupabaseErrorLike = { message: string } | null | undefined;

/** supabase-js returns `{ error }` instead of throwing; billing writes must not ACK a failed persist. */
export function throwOnSupabaseError(error: SupabaseErrorLike, action: string): void {
  if (error) {
    throw new Error(`${action} failed: ${error.message}`);
  }
}
