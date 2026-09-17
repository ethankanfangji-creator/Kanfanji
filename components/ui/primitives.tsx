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
      ? "ui-button--primary"
      : tone === "danger"
        ? "ui-button--danger"
        : "ui-button--secondary";
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`ui-button ${toneClass} ${className}`}
    />
  );
});

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`ui-card ${className}`} />;
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
      ? "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
      : tone === "success"
        ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]"
        : tone === "info"
          ? "border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  return (
    <div
      {...props}
      className={`rounded-[var(--radius-control)] border p-[var(--space-3)] text-[var(--font-size-sm)] leading-5 ${toneClass} ${className}`}
    />
  );
}

export function Field({
  label,
  className = "",
  inputClassName = "",
  error,
  id,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  inputClassName?: string;
  error?: string;
}) {
  const invalid = Boolean(error) || inputProps["aria-invalid"] === true;
  const inputId = id ?? (typeof label === "string" ? `field-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="block text-[var(--font-size-xs)] font-bold text-[var(--color-text)]"
      >
        {label}
      </label>
      <input
        {...inputProps}
        id={inputId}
        aria-invalid={invalid || undefined}
        className={`ui-input mt-[var(--space-2)] ${invalid ? "is-error" : ""} ${inputClassName}`}
      />
      {error ? (
        <span role="alert" className="mt-[var(--space-2)] block text-[var(--font-size-xs)] text-[var(--color-danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function PageContainer({
  className = "",
  narrow = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { narrow?: boolean }) {
  return (
    <div
      {...props}
      className={`page-container ${narrow ? "page-container--narrow" : ""} ${className}`}
    />
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
    <header className="flex flex-col gap-[var(--space-4)] sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[var(--font-size-xs)] font-bold tracking-[0.18em] text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-[var(--space-1)] text-[var(--font-size-xl)] font-extrabold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-[var(--space-2)] text-[var(--font-size-sm)] leading-6 text-[var(--color-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-[var(--space-2)]">{actions}</div> : null}
    </header>
  );
}
