/**
 * User-facing messages for property-source extract errors.
 * Explicitly distinguish listing-site walls from Kanfangji login.
 */

export function sourceExtractErrorMessage(
  code: string,
  locale = "zh-Hant",
): string {
  const en = locale.startsWith("en");
  const hans = locale.includes("Hans");
  switch (code) {
    case "login_required":
      if (en) {
        return "Link saved, but that listing site won’t let us read the page (login/bot wall — not a Kanfangji login). Paste listing text or upload a screenshot.";
      }
      if (hans) {
        return "链接已记下，但该房源网站不开放直接读取（可能需登录或防机器人——不是要你登录本 App）。请改贴文字或上传截图。";
      }
      return "連結已記下，但該房源網站不開放直接讀取（可能需登入或防機器人——不是要你登入本 App）。請改貼文字或上傳截圖。";
    case "empty_or_dynamic":
      if (en) {
        return "Link saved, but we couldn’t extract page text (likely a dynamic page). Paste listing text or upload a screenshot.";
      }
      if (hans) {
        return "链接已记下，但无法抽取页面文字（可能是动态加载）。请改贴文字或上传截图。";
      }
      return "連結已記下，但無法擷取頁面文字（可能是動態載入）。請改貼文字或上傳截圖。";
    case "fetch_failed":
    case "timeout":
      if (en) {
        return "Link saved, but we couldn’t open the page. Paste listing text or upload a screenshot.";
      }
      if (hans) {
        return "链接已记下，但无法开启此页面。请改贴文字或上传截图。";
      }
      return "連結已記下，但無法開啟此頁面。請改貼文字或上傳截圖。";
    case "body_too_large":
      if (en) {
        return "Link saved, but the page is too large to fetch. Paste key text or upload a screenshot.";
      }
      return "連結已記下，但頁面過大無法擷取。請改貼重點文字或上傳截圖。";
    case "pdf_no_text":
    case "pdf_extract_failed":
    case "pdf_empty":
    case "pdf_too_large":
    case "pdf_text_unavailable":
      if (en) {
        return "PDF saved, but we couldn’t extract text (scan/image PDF or extract failed). Paste key text or upload a screenshot.";
      }
      if (hans) {
        return "PDF 已记下，但无法抽取文字（可能是扫描件）。请改贴重点文字或上传截图。";
      }
      return "PDF 已記下，但無法抽取文字（可能是掃描件）。請改貼重點文字或上傳截圖。";
    case "vision_key_missing":
      if (en) {
        return "Image saved, but AI vision isn’t configured (missing API key). Paste listing text instead.";
      }
      if (hans) {
        return "图片已记下，但 AI 影像分析未设定金钥。请改贴房源文字。";
      }
      return "圖片已記下，但 AI 影像分析未設定金鑰。請改貼房源文字。";
    case "vision_no_text":
      if (en) {
        return "Image saved, but little readable text was found. Use a clearer listing screenshot, or paste the listing text.";
      }
      if (hans) {
        return "图片已记下，但几乎读不到文字。请换更清楚的房源截图，或改贴文字。";
      }
      return "圖片已記下，但幾乎讀不到文字。請換更清楚的房源截圖，或改貼文字。";
    case "vision_unavailable":
    case "vision_not_configured":
      if (en) {
        return "Image saved, but photo analysis isn’t available right now. Paste listing text or try again later.";
      }
      if (hans) {
        return "图片已记下，但影像分析暂时不可用。请改贴文字或稍后再试。";
      }
      return "圖片已記下，但影像分析暫時不可用。請改貼文字或稍後再試。";
    case "invalid_image_mime":
      if (en) {
        return "Only JPG, PNG, or WEBP images are supported (not HEIC). Convert the photo or paste listing text.";
      }
      return "僅支援 JPG／PNG／WEBP（不含 HEIC）。請轉檔後再傳，或改貼房源文字。";
    default:
      if (en) {
        return "Link or file was recorded, but extraction was incomplete. Paste text or upload a screenshot to improve the analysis.";
      }
      return "資料已記錄，但擷取未完成。請改貼文字或上傳截圖，分析會更準。";
  }
}

export function isUrlSoftFailCode(code: string): boolean {
  return (
    code === "login_required" ||
    code === "empty_or_dynamic" ||
    code === "fetch_failed" ||
    code === "timeout" ||
    code === "body_too_large"
  );
}

/** Soft-fail codes that keep the source but need paste/screenshot CTAs. */
export function isSourceSoftFailCode(code: string): boolean {
  return (
    isUrlSoftFailCode(code) ||
    code === "pdf_no_text" ||
    code === "pdf_extract_failed" ||
    code === "pdf_empty" ||
    code === "pdf_too_large" ||
    code === "pdf_text_unavailable" ||
    code === "vision_key_missing" ||
    code === "vision_unavailable" ||
    code === "vision_not_configured" ||
    code === "vision_no_text" ||
    code === "invalid_image_mime"
  );
}
