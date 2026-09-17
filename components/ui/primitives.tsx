import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "danger" }
>(function Button({ className = "", tone = "primary", type = "button", ...props }, ref) {
  const toneClass =
    tone === "primary"
      ? "bg-black text-white"
      : tone === "danger"
        ? "bg-[#991B1B] text-white"
        : "border border-black/10 bg-white text-[var(--color-text)]";
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${toneClass} ${className}`}
    />
  );
});

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={`rounded-[var(--radius-card)] border border-black/[0.05] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] ${className}`}
    />
  );
}

export function Banner({
  className = "",
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "info" | "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
      : tone === "success"
        ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
        : tone === "info"
          ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"
          : "border-black/10 bg-[#F8F4EF] text-[var(--color-text-muted)]";
  return (
    <div
      {...props}
      className={`rounded-[var(--radius-control)] border p-3 text-sm leading-5 ${toneClass} ${className}`}
    />
  );
}

export function Field({
  label,
  className = "",
  inputClassName = "",
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  inputClassName?: string;
}) {
  return (
    <label className={`block text-xs font-bold ${className}`}>
      {label}
      <input
        {...inputProps}
        className={`mt-2 h-12 w-full rounded-full border border-black/5 bg-[#F8F4EF] px-4 text-base outline-none focus:ring-2 focus:ring-black/10 ${inputClassName}`}
      />
    </label>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
