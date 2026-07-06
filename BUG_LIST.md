# BUG LIST — 卡比集機器人（更新：2026-07-02）

> 狀態：待修 / 已修待驗收 / 待決策（需董事長定 schema/規則/描述，見 `docs/DECISIONS_PENDING.md`）

| # | Bug | 嚴重 | 狀態 | 主責 | Commit / 依據 |
|---|---|---|---|---|---|
| Bug1 | 一般交易/1828 誤判寄運 | 高 | ✅ **已修，待部署驗收** | A | `8719434`（Golden G001 綠） |
| Bug2 | 收款後 #未收款 不消失（其實無此指令，需新建對帳） | 高 | ⛔ **待決策**（未收款＝哪張表/欄位）→ 見 D1 | B | 診斷 DIAGNOSIS_REPORT |
| Bug3 | 取消失效（無回覆上下文；取消+代號/流水號未實作） | 高 | ⛔ **待決策**（流水號 schema）+待修 → D2 | A | 診斷 |
| Bug4 | 錯誤打卡污染正式紀錄（無驗證、無 abnormal_logs） | 高 | ⛔ **待決策**（abnormal_logs schema）+待修 → D4 | B | 診斷 |
| Bug5 | 清除/取消權限缺口（未註冊老闆時任何人可清；外勤清除無 isAdmin） | 中 | 待修（可自主，低風險） | A | 診斷 |
| 效能P0 | 出貨迴圈內掃冰庫（行549）、鐵架重複掃表 | 中 | 🟡 **部分已修**（knownRetailers 記憶化 `aa3efed`）；冰庫 map-hoist 待決策 → D5 | A/B | PERFORMANCE_AUDIT |
| 格式 | 單行「玉美加工廠 毛路87台 寄旭陽」解析 0 筆 | 中 | ⛔ **待決策**（單行/多行格式）→ D6 | A | Golden G004 |

## 已修但等 LINE 實測驗收
- Bug1（v2.58）：桌面 `卡比集機器人_v2.58_Bug1候選.gs` + 實測腳本 `tests/golden/LINE_TEST_Bug1.md`。
