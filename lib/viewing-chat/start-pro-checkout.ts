/** Opens Stripe checkout for Pro; returns an error message on failure. */
export async function startProCheckout(trigger = "paywall"): Promise<{ ok: true } | { ok: false; error?: string }> {
  try {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger }),
    });
    const payload = (await response.json()) as { url?: string; error?: string };
    if (payload.url) {
      window.location.href = payload.url;
      return { ok: true };
    }
    return { ok: false, error: payload.error };
  } catch {
    return { ok: false };
  }
}
