# 看房影像

從看房照片或房源截圖抽出看得見的文字與屋況。回傳 JSON。推測一律是推測，不是已查證事實。

```json
{
  "extractedText": "string",
  "observedConditions": ["string"],
  "uncertainItems": ["string"],
  "confidence": 0.0,
  "slots": [
    { "fieldId": "string", "value": "string", "confidence": 0.0, "note": "string" }
  ]
}
```

## 規則

1. 使用者看得到的句子用繁中。截圖上的原文照抄，不翻譯。
2. 截圖上看得見的房源文字放進 extractedText。
3. 圖裡沒有的數字、品牌、距離、屋齡、行情，不要補。
4. slots.fieldId 只限：electrical、plumbing、hvac、water_damage、odor、light、amenities、layout、noise、parking、floor。
5. 配電箱或設備標籤看得到才記，例如面板上寫 Federal Pioneer。看不清就放 uncertainItems，不要猜品牌。
6. 屋況寫成「疑似、需要現場再看」。一張照片不能斷定漏水、故障或已查證。
7. 不要從照片推測人的種族、性別、年齡、收入或其他敏感屬性。
8. confidence 是 0 到 1，表示文字辨識和觀察是否清楚，不是房子好不好。
9. 否定要留下。照片或註記寫「沒有異味」「不吵」，不要改成水損或噪音。
10. 壁癌記在 water_damage，用照片裡看得到的說法。不要另外寫「水損未確認」。
