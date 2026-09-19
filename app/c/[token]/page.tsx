"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { ComparisonBoard } from "@/components/comparison/ComparisonBoard";
import { useI18n } from "@/components/I18nProvider";
import {
  getComparisonShare,
  sortComparisonColumns,
  type ComparisonShareSnapshot,
} from "@/lib/comparison";

export default function ComparisonSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { messages } = useI18n();
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<ComparisonShareSnapshot | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const row = await getComparisonShare(token);
      if (!row) {
        setMissing(true);
        return;
      }
      setSnapshot(row.snapshot);
    })();
  }, [token]);

  const labels = messages.compare;

  if (missing) {
    return (
      <div className="min-h-screen flex justify-center bg-[#FDF6F0] px-4 pt-10">
        <div className="w-full max-w-[420px] rounded-[28px] bg-white border border-black/5 p-8 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto text-[#92400E]" />
          <h1 className="mt-3 text-[18px] font-bold">{labels.shareMissingTitle}</h1>
          <p className="mt-2 text-[13px] text-[#6B7280] leading-[1.5]">
            {labels.shareMissingBody}
          </p>
          <Link href="/" className="inline-flex mt-4 text-[13px] font-bold underline">
            {labels.backHome}
          </Link>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF6F0] text-[13px] text-[#6B7280]">
        {labels.loading}
      </div>
    );
  }

  const columns = sortComparisonColumns(
    snapshot.columns,
    snapshot.sort.key,
    snapshot.sort.direction,
  );

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[960px] px-4 pt-6 pb-28">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
            KANFANGJI · COMPARISON
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {labels.backHome}
          </Link>
        </div>
        <h1 className="text-[20px] font-[800] mb-1">{labels.title}</h1>
        <p className="text-[12px] text-[#6B7280] mb-4">
          {labels.readOnlyShare} · {labels.lastUpdated}{" "}
          {new Date(snapshot.updatedAt).toLocaleString()}
        </p>
        <ComparisonBoard
          columns={columns}
          labels={{
            empty: labels.empty,
            price: labels.price,
            layout: labels.layout,
            location: labels.location,
            area: labels.area,
            managementFee: labels.managementFee,
            rating: labels.rating,
            pros: labels.pros,
            risks: labels.risks,
            followUps: labels.followUps,
            notes: labels.notes,
            includeInShare: labels.includeInShare,
          }}
          editing={false}
        />
      </div>
    </div>
  );
}
