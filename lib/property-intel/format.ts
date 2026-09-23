import type { PropertyIntel } from "./types";

/** Chat bubble copy after intel fetch (locale-aware light). Safe for client import. */
export function formatIntelMessage(intel: PropertyIntel, locale: string): string {
  const year = intel.basic.year != null ? `${intel.basic.year}年` : "年份未知";
  const type = intel.basic.type || "房型待確認";
  const beds =
    intel.basic.beds != null
      ? locale.startsWith("en")
        ? `${intel.basic.beds} bed`
        : `${intel.basic.beds}房`
      : locale.startsWith("en")
        ? "beds unknown"
        : "房數待確認";
  const sold = intel.history.last_sold || (locale.startsWith("en") ? "sale n/a" : "成交未知");
  const strata = intel.history.strata || (locale.startsWith("en") ? "n/a" : "未知");
  const r0 = intel.risks[0] || (locale.startsWith("en") ? "general inspection" : "基礎屋況");
  const r1 = intel.risks[1] || "";
  const riskLine = r1 ? `${r0}, ${r1}` : r0;
  const sky =
    intel.location.skytrain ||
    intel.location.bus ||
    (locale.startsWith("en") ? "transit n/a" : "捷運待查");
  const schools =
    intel.location.schools.length > 0
      ? intel.location.schools.join("、")
      : locale.startsWith("en")
        ? "n/a"
        : "待查";
  const market =
    intel.market.avgUnitPrice ||
    intel.market.priceRange ||
    intel.history.assessed ||
    "";

  if (locale.startsWith("en")) {
    return `Found it! ${year.replace("年", "")} ${type}, ${beds}, last ${sold}, Strata ${strata}. Watch for ${riskLine}. Nearby: ${sky}; schools ${schools}.${market ? ` Market: ${market}.` : ""} Shall we start with the electrical panel?`;
  }
  if (locale.startsWith("th")) {
    return `เจอแล้ว! ${year} ${type}, ${beds}, ขายล่าสุด ${sold}, Strata ${strata}. ปีนี้ควรระวัง ${riskLine}. ใกล้เคียง: ${sky}, เขตโรงเรียน ${schools}.${market ? ` ตลาด: ${market}.` : ""} เริ่มดูตู้ไฟก่อนไหม?`;
  }
  if (locale.includes("Hans")) {
    return `查到了！${year} ${type}，${beds}，上次 ${sold}，Strata ${strata}。这年份要特别注意 ${riskLine}。周边：${sky}，学区 ${schools}。${market ? `行情：${market}。` : ""}我们先看电箱？`;
  }
  return `查到了！${year} ${type}，${beds}，上次 ${sold}，Strata ${strata}。這年份要特別注意 ${riskLine}。周邊：${sky}，學區 ${schools}。${market ? `行情：${market}。` : ""}我們先看電箱？`;
}
