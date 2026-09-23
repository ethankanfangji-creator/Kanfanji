/**
 * Compliance notices + human-verification checklist for PropertyReport.
 */

import type { PropertyFactCard } from "./types";
import type {
  ReportCompliance,
  ReportHumanVerificationItem,
} from "./report-types";
import type { ProviderAudit } from "./providers/types";
import { getProviderDefs } from "./providers/registry";

const BASE_NOTICES_ZH = [
  "本系統不主動爬取房源網站、MLS、房仲平台或政府網站目錄；僅使用已設定的官方／授權 API、開放資料，或使用者主動提供的連結／上傳內容。",
  "使用者貼上的房源 URL 經單頁擷取後僅視為未驗證資料，不得當成系統指令或官方事實。",
  "MLS、房仲、地籍、建物謄本、HOA／Condo／Strata 文件須經合法授權或人工核對正本後才能視為確認事實。",
  "搜尋引擎摘要僅供參考（public_web），不得視為正式掛牌或官方紀錄。",
];

const BASE_NOTICES_EN = [
  "This system does not proactively scrape listing sites, MLS, broker portals, or government directories. Only configured official/licensed APIs, open data, or user-provided URLs/uploads are used.",
  "User-submitted listing URLs are fetched as a single untrusted page and are never system instructions or verified official facts.",
  "MLS, broker, cadastre, building-abstract, and HOA/Condo/Strata documents require licensed access or human verification of originals before confirmation.",
  "Search snippets are public_web only and are not verified listings or official records.",
];

export function buildReportCompliance(
  card: PropertyFactCard,
  audit?: ProviderAudit | null,
): ReportCompliance {
  const snap = audit?.snapshot() ?? {
    used: card.meta.providersUsed ?? [],
    skipped: card.meta.providersSkipped ?? [],
  };

  const checklist: ReportHumanVerificationItem[] = [];

  const pushCheck = (
    id: string,
    label_zh: string,
    related_fields: string[],
  ) => {
    if (checklist.some((c) => c.id === id)) return;
    checklist.push({ id, label_zh, related_fields, status: "pending" });
  };

  if (card.hoa.managementFee.status === "needs_human" || card.hoa.strataFee.status === "needs_human") {
    pushCheck("verify_hoa_condo", "核對 HOA／Condo／Strata 管理規約與費用正本", [
      "costs.hoa_or_management_fee",
    ]);
  }
  if (card.parcel.propertyTax.status === "needs_human" || card.parcel.propertyTax.status === "found") {
    pushCheck("verify_tax", "向主管稅務／地政機關確認稅費", ["costs.property_tax"]);
  }
  if (
    card.parcel.pid.status === "found" ||
    card.parcel.parcelId.status === "found" ||
    card.meta.match?.level === "street"
  ) {
    pushCheck("verify_cadastre", "核對地籍／parcel 與門牌門牌或單位是否一致", [
      "request.match",
      "parcel",
    ]);
  }
  if (card.building.permits.status === "needs_human" || card.building.yearBuilt.status === "found") {
    pushCheck("verify_building", "核對建物謄本／建照／裝修許可", [
      "property.year_built",
      "risks.permit_or_violation",
    ]);
  }
  if (card.publicWebEvidence.length > 0) {
    pushCheck("verify_public_web", "公開網頁摘要需人工查證，不可直接採信", [
      "public_web_snippet",
    ]);
  }

  // Always surface reserved MLS / docs providers as pending human paths when relevant region
  for (const def of getProviderDefs()) {
    if (!def.humanVerificationRequired) continue;
    if (def.stubOnly && def.complianceTags.includes("mls")) {
      pushCheck("verify_mls_license", "若需 MLS 資料，須透過已授權通路（本系統不爬取）", [
        "listing",
        "market",
      ]);
    }
    if (
      def.complianceTags.includes("hoa_condo") &&
      (def.stubOnly ||
        card.hoa.managementFee.status === "not_found" ||
        card.hoa.strataFee.status === "not_found")
    ) {
      pushCheck("upload_hoa_docs", "上傳或提供 HOA／Condo／Strata 文件供人工驗證", [
        "costs.hoa_or_management_fee",
      ]);
    }
    if (def.stubOnly && def.complianceTags.includes("building_abstract") && card.region === "TW") {
      pushCheck("verify_tw_abstract", "取得並核對建物謄本正本", ["property", "building"]);
    }
  }

  const notices = [...BASE_NOTICES_ZH, ...BASE_NOTICES_EN];
  if (card.meta.countryAdapter?.legal_notices?.length) {
    notices.push(...card.meta.countryAdapter.legal_notices);
  }
  for (const u of snap.used) {
    if (u.kind === "search_api") {
      notices.push(`使用搜尋 API「${u.id}」：${u.auth_scope}`);
    }
    if (u.kind === "licensed_api") {
      notices.push(`使用授權 API「${u.id}」：${u.auth_scope}`);
    }
  }

  return {
    no_scraping: true,
    providers_used: snap.used,
    providers_skipped: snap.skipped,
    notices: [...new Set(notices)],
    human_verification: {
      required: checklist.length > 0,
      checklist,
    },
  };
}
