const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/40 focus-visible:ring-offset-2";

/** Text links and text buttons on the auth pages. One hover treatment. */
export const authTextLink =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md text-[12px] font-medium text-[#6B7280] " +
  "underline decoration-transparent underline-offset-4 transition-colors duration-150 " +
  "hover:text-[#1A1A1A] hover:decoration-current " +
  focusRing +
  " " +
  "aria-disabled:cursor-not-allowed aria-disabled:text-[#9CA3AF] aria-disabled:hover:decoration-transparent";

export const authPrimaryButton =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-black text-[14px] font-bold text-white transition-colors " +
  "hover:bg-[#1A1A1A]/85 " +
  focusRing +
  " " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const authSecondaryButton =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full border border-black/10 text-[14px] font-bold text-[#1A1A1A] transition-colors " +
  "hover:bg-black/5 " +
  focusRing +
  " " +
  "disabled:cursor-not-allowed disabled:opacity-60";
