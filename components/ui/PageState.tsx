import type { ReactNode } from "react";

type PageStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  role?: "status" | "alert";
};

export function PageState({
  title,
  description,
  action,
  icon,
  role,
}: PageStateProps) {
  return (
    <section
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      aria-atomic={role ? "true" : undefined}
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center"
    >
      {icon ? <div className="mb-4 text-3xl" aria-hidden="true">{icon}</div> : null}
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text)]">{title}</h1>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}

export function LoadingState({
  title = "載入中",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <PageState
      role="status"
      title={title}
      description={description}
      icon={<span className="block size-7 animate-spin rounded-full border-2 border-black/15 border-t-black" />}
    />
  );
}

export function EmptyState(props: Omit<PageStateProps, "role">) {
  return <PageState {...props} />;
}
