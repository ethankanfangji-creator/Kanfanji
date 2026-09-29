"use client";

import { useEffect, useState } from "react";

export function LocalTime({ iso, locale }: { iso: string | null | undefined; locale: string }) {
  const fallback = iso && !Number.isNaN(Date.parse(iso)) ? iso.slice(0, 10) : "—";
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    if (!iso || Number.isNaN(Date.parse(iso))) {
      setLabel("—");
      return;
    }
    setLabel(new Date(iso).toLocaleString(locale));
  }, [iso, locale]);

  if (!iso) return <>—</>;
  return <time dateTime={iso}>{label}</time>;
}
