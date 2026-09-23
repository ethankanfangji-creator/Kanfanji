/**
 * Build InitialPropertyReport from merged PropertyData + sources.
 * Never invents missing facts; partial reports are explicit.
 */

import type { PropertyData, PropertySource } from "./types";
import {
  DEFAULT_DISCLAIMER_ZH,
  type InitialPropertyReport,
} from "./initial-report-schema";
import {
  countFilledCoreFields,
  scoreDataCompleteness,
  type FieldConflict,
} from "./completeness";
import { meetsMinimumReportCriteria } from "@/lib/viewing-chat/stage";

const DEFAULT_CHECKLIST = [
  {
    id: "chk_leak",
    label: "漏水與壁癌",
    category: "屋況",
    why: "照片與描述無法完全確認滲漏與修繕紀錄",
  },
  {
    id: "chk_light",
    label: "採光與通風",
    category: "屋況",
    why: "現場時段與天氣會影響感受",
  },
  {
    id: "chk_windows",
    label: "門窗與隔音",
    category: "屋況",
    why: "需現場開關與聽感確認",
  },
  {
    id: "chk_power",
    label: "電力與插座",
    category: "設備",
    why: "電箱安培與線路需現場查看",
  },
  {
    id: "chk_hvac",
    label: "冷暖氣與熱水設備",
    category: "設備",
    why: "運作狀態與屋齡需現場測試",
  },
  {
    id: "chk_plumbing",
    label: "管線與排水",
    category: "設備",
    why: "無法僅靠照片確認排水暢通",
  },
  {
    id: "chk_common",
    label: "電梯與公共區域",
    category: "管理",
    why: "公共維護影響居住品質與費用",
  },
  {
    id: "chk_parking",
    label: "車位尺寸與進出動線",
    category: "車位",
    why: "圖面與實際淨空常有落差",
  },
  {
    id: "chk_mgmt",
    label: "管理與公共維護",
    category: "管理",
    why: "管理費用途與基金需向管理單位確認",
  },
  {
    id: "chk_noise",
    label: "周邊噪音與異味",
    category: "環境",
    why: "不同時段體感差異大",
  },
  {
    id: "chk_layout",
    label: "實際格局是否與描述一致",
    category: "格局",
    why: "需對照房源描述與現場量測",
  },
];

function fieldNotes(f: { notes?: string; verificationStatus?: string }): string {
  if (f.verificationStatus === "inferred") return "（推測）";
  if (f.verificationStatus === "conflicting") return "（來源衝突）";
  if (f.verificationStatus === "unverified") return "（未確認）";
  return "";
}

/** Prefer specific missing-key / stub messaging from enrich notes when fields are empty. */
function availabilityFallback(
  enrichNotes: string[] | undefined,
  topic: string,
): string {
  const joined = (enrichNotes ?? []).join(" ");
  if (/未設定金鑰/.test(joined)) {
    return `未確認（相關 API 未設定金鑰）`;
  }
  if (/需授權尚未接上|stub|尚未接上/.test(joined)) {
    return `尚未接上授權資料源`;
  }
  if (joined.includes(topic) && /直線距離|通勤/.test(joined)) {
    return "尚未驗證（僅有距離提示時不以通勤時間呈現）";
  }
  return "資料尚未連接或未驗證";
}

export function buildInitialPropertyReport(input: {
  address: string;
  data: PropertyData;
  sources: PropertySource[];
  conflicts?: FieldConflict[];
  enrichNotes?: string[];
  locale?: string;
}): InitialPropertyReport {
  const completeness = scoreDataCompleteness(input.data);
  const coreCount = countFilledCoreFields(input.data);
  const minOk = meetsMinimumReportCriteria({
    hasAddress: Boolean(input.address.trim()),
    sourceCount: input.sources.length,
    coreFieldCount: coreCount,
  });

  const hasConflicts = (input.conflicts?.length ?? 0) > 0;
  const reportStatus = hasConflicts
    ? "needs_confirmation"
    : minOk && completeness.score >= 0.35
      ? "ready"
      : "partial";

  const summary = input.data;
  const priceLine = summary.listing.price.value
    ? `${summary.listing.price.value}${fieldNotes(summary.listing.price)}`
    : "未提供";

  const sections: InitialPropertyReport["sections"] = [
    {
      id: "sec_summary",
      title: "房源摘要",
      kind: "summary",
      body: [
        `地址：${input.address}`,
        `房型：${summary.identity.propertyType.value ?? "未確認"}`,
        `房間／衛浴：${summary.listing.bedrooms.value ?? "?"}／${summary.listing.bathrooms.value ?? "?"}`,
        `面積：${summary.listing.area.value ?? "未確認"}${summary.listing.areaUnit.value ? ` ${summary.listing.areaUnit.value}` : ""}`,
        `屋齡／年建：${summary.identity.yearBuilt.value ?? "未確認"}`,
        `價格：${priceLine} ${summary.listing.currency.value ?? ""}`.trim(),
      ].join("\n"),
      confidence: completeness.score,
    },
    {
      id: "sec_condition",
      title: "屋況分析",
      kind: "condition",
      body: [
        `已知屋況：${summary.condition.knownCondition.value ?? "尚未提供"}`,
        `照片可觀察：${
          summary.condition.photoObservations
            .map((o) => o.value)
            .filter(Boolean)
            .join("；") || "尚無照片分析"
        }`,
        `建議現場檢查：${
          summary.condition.needsInspection
            .map((o) => o.value)
            .filter(Boolean)
            .join("；") || "漏水、電力、門窗、管線"
        }`,
        `無法以照片確認：${
          summary.condition.unverifiableFromPhotos
            .map((o) => o.value)
            .filter(Boolean)
            .join("；") || "結構安全、隱蔽管線、真實漏水原因"
        }`,
        "提醒：圖片觀察僅為推測，需現場確認，不可當作已證實事實。",
      ].join("\n"),
      confidence: summary.condition.conditionConfidence,
    },
    {
      id: "sec_costs",
      title: "費用分析",
      kind: "costs",
      body: [
        `售價／租金：${summary.costs.listPrice.value ?? summary.listing.price.value ?? "未確認"}`,
        `物業費／HOA／管理費：${summary.costs.hoaOrManagementFee.value ?? "未確認"}`,
        `房屋稅：${summary.costs.propertyTax.value ?? "未確認（需向主管機關或仲介確認）"}`,
        `保險／其他：${summary.costs.insuranceEstimate.value ?? "未估算"}`,
        `車位費：${summary.costs.parkingFee.value ?? "未確認"}`,
        `持有成本估算：${summary.costs.holdingCostEstimate.value ?? "資料不足，暫不估算"}`,
        ...(input.enrichNotes ?? []).map((n) => `外部資料：${n}`),
      ].join("\n"),
      confidence: 0.35,
    },
    {
      id: "sec_neighborhood",
      title: "生活機能",
      kind: "neighborhood",
      body: [
        `超市：${summary.neighborhood.grocery.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
        `醫療：${summary.neighborhood.medical.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
        `學校：${summary.neighborhood.schools.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
        `餐飲：${summary.neighborhood.dining.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
        `公園：${summary.neighborhood.parks.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
        `商圈：${summary.neighborhood.commercial.value ?? availabilityFallback(input.enrichNotes, "生活機能")}`,
      ].join("\n"),
      confidence: summary.neighborhood.grocery.value ? 0.4 : 0.2,
    },
    {
      id: "sec_transit",
      title: "交通位置",
      kind: "transportation",
      body: [
        `步行便利：${summary.transportation.walkConvenience.value ?? "未驗證"}`,
        `開車便利：${summary.transportation.driveConvenience.value ?? "未驗證"}`,
        `大眾運輸：${summary.transportation.transitConvenience.value ?? "未驗證"}`,
        `最近交通節點：${summary.transportation.nearestTransit.value ?? availabilityFallback(input.enrichNotes, "交通")}`,
        `通勤：${summary.transportation.commuteNotes.value ?? "無可靠路線資料時不提供通勤時間；直線距離≠通勤時間"}`,
      ].join("\n"),
      confidence: summary.transportation.nearestTransit.value ? 0.4 : 0.2,
    },
  ];

  const risks: InitialPropertyReport["risks"] =
    input.data.risks.length > 0
      ? input.data.risks.map((r) => ({
          id: r.id,
          priority: r.priority,
          description: r.description,
          rationale: r.rationale,
          sourceIds: r.sourceIds,
          confidence: r.confidence,
          howToVerify: r.howToVerify,
          askWhom: r.askWhom,
        }))
      : [
          {
            id: "risk_incomplete",
            priority: "high",
            description: "房源核心資料仍不完整",
            rationale: `完整度 ${(completeness.score * 100).toFixed(0)}%，缺少：${completeness.missingFields.slice(0, 5).join(", ") || "部分欄位"}`,
            sourceIds: input.sources.map((s) => s.sourceId),
            confidence: 0.7,
            howToVerify: "補充賣屋連結、房源文字或截圖後重新分析",
            askWhom: "仲介／屋主",
          },
          ...(hasConflicts
            ? [
                {
                  id: "risk_conflict",
                  priority: "high" as const,
                  description: "不同來源的資料互相衝突",
                  rationale: (input.conflicts ?? [])
                    .map((c) => c.path)
                    .join(", "),
                  sourceIds: input.sources.map((s) => s.sourceId),
                  confidence: 0.8,
                  howToVerify: "請確認要以哪一個來源為準，或上傳官方文件",
                  askWhom: "使用者確認／仲介",
                },
              ]
            : []),
        ];

  const questionsToAsk = [
    {
      id: "q_fee",
      question: "目前的管理費／HOA／Condo fee 金額與是否含公設基金？",
      askWhom: "仲介或管理單位",
      priority: "high" as const,
    },
    {
      id: "q_leak",
      question: "是否有漏水、壁癌或重大修繕紀錄？可提供文件嗎？",
      askWhom: "屋主或仲介",
      priority: "high" as const,
    },
    {
      id: "q_tax",
      question: "最近一期房屋稅／地稅金額是多少？",
      askWhom: "仲介",
      priority: "medium" as const,
    },
    {
      id: "q_parking",
      question: "車位類型、尺寸與月費／產權歸屬？",
      askWhom: "仲介或管理單位",
      priority: "medium" as const,
    },
  ];

  return {
    reportStatus,
    propertySummary: {
      address: {
        value: input.address,
        normalizedValue: summary.location.normalizedAddress.normalizedValue,
        sourceIds: summary.location.normalizedAddress.sourceIds,
        confidence: summary.location.normalizedAddress.confidence || 0.5,
        verificationStatus: "unverified",
        notes: "Original user input preserved",
      },
      propertyType: toReportField(summary.identity.propertyType),
      bedrooms: toReportField(summary.listing.bedrooms),
      bathrooms: toReportField(summary.listing.bathrooms),
      area: toReportField(summary.listing.area),
      yearBuilt: toReportField(summary.identity.yearBuilt),
      floors: toReportField(summary.identity.floors),
      listingType: toReportField(summary.identity.propertyType),
      price: toReportField(summary.listing.price),
      currency: toReportField(summary.listing.currency),
      dataRetrievedAt: new Date().toISOString(),
    },
    dataCompleteness: completeness,
    sections,
    risks,
    questionsToAsk,
    viewingChecklist: DEFAULT_CHECKLIST.map((c) => ({
      ...c,
      status: "pending" as const,
    })),
    nextActions: [
      {
        id: "na_ask",
        label: "幫我整理要問仲介的問題",
        kind: "ask_agent",
      },
      {
        id: "na_verify",
        label: "哪些資料目前還沒有驗證？",
        kind: "verify_field",
      },
      {
        id: "na_upload",
        label: "再補充照片或房源文字",
        kind: "upload_more",
      },
      {
        id: "na_view",
        label: "幫我準備看房清單",
        kind: "viewing_prep",
      },
    ],
    sources: input.sources.map((s) => ({
      sourceId: s.sourceId,
      sourceType: s.sourceType,
      label:
        s.publisher ||
        s.fileName ||
        (s.sourceType === "listing_url" ? s.sourceUrl : null) ||
        s.sourceType,
      url: s.sourceUrl,
      retrievedAt: s.retrievedAt,
    })),
    disclaimer: DEFAULT_DISCLAIMER_ZH,
  };
}

function toReportField(f: {
  value: unknown;
  normalizedValue: string | null;
  sourceIds: string[];
  confidence: number;
  verificationStatus: "verified" | "unverified" | "inferred" | "conflicting";
  notes: string;
}) {
  return {
    value: (f.value as string | number | boolean | null) ?? null,
    normalizedValue: f.normalizedValue,
    sourceIds: f.sourceIds,
    confidence: f.confidence,
    verificationStatus: f.verificationStatus,
    notes: f.notes,
  };
}
