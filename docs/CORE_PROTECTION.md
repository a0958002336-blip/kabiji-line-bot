# Core Protection — 核心保護清單與變更流程

> 目的：防止「改 A 壞 B」。UI / APP / OCR / AI 的任何修改，都不得直接影響下列 Core。
> 版本：v1.0　CTO 維護。

## 1. Core 清單（15 項，UI/APP/OCR/AI 不得直接修改）

| # | Core 模組 | 目前所在（v2.57 單檔） | 主責 |
|---|---|---|---|
| 1 | LINE Webhook | `doPost` 行28 | A |
| 2 | Message Router | `handleEvent` 行47（待重整為 classifier） | A |
| 3 | Command Parser | `parseCommand` 行674、各 `parseXxx` | A |
| 4 | 寄運 Shipment | `parseShipping` 行835、`handleShippingCmd`/`Modify`、`shippingPull` | A |
| 5 | 收款 Payment | `appendFinanceRecord` 行2827、匯款 行615 | B |
| 6 | 取消 Cancel | `cancelShipping` 行911、`cancelAttendance` 行3013、`cancelFinance` | A |
| 7 | 修改 Modify | `handleShippingModify` 行354 等 | A |
| 8 | 查詢 Query | `shippingPull`/`summarizeAmount`/`attendanceQuery` 等 | A |
| 9 | 打卡 Attendance | `appendAttendance` 行2957、`attendanceQuery` 行3064 | A/B |
| 10 | ERP | xuyang-line-erp（另一 repo） | B |
| 11 | 庫存 Inventory | 台子/寄運明細 | B |
| 12 | 冰庫扣庫存 | `handleFreezerShip` 行2380 | B |
| 13 | 資料庫 Schema | 各 `SHEET_*` 常數、`headerFor` 行3110 | B |
| 14 | 權限 Permission | `getPerm` 行641、`MARKET_READ` 行650 | A/CTO |
| 15 | 商業規則 Business Rules | `docs/business_rules.md` | CTO |

## 2. 變更流程（強制）

```
開 feature branch → 改 → 本地跑 Golden Test（全綠）→ 開 PR
      → CTO Review（對照 business_rules.md）→ 全綠+核准 → merge develop → 打 tag
```

- **任何 Core 修改，必須 CTO Review 後才能 merge。**
- **任一 Golden Test 紅 → 禁止 merge。**
- 非 Core（mobile/web UI、樣式、OCR/AI plugin）可較快，但仍須：不 import/呼叫 core 內部函式、只走 API/plugin 介面、跑該層測試。

## 3. 工程師開工前必答（Pre-Modification Checklist）

每位工程師動手前，在 PR/Issue 留言回答：
1. 我要修改哪些**檔案**？
2. 有沒有人**正在改同一檔案**？（查 BUG_BOARD/派工表的「進行中」）
3. 是否會影響 **Core**（上表 15 項）？
4. 是否應**新增 API** 而非直接改 Core？

→ 若會改 Core：**先取得 CTO 核准**再開工。

## 4. 模組邊界規則

- `mobile` / `web` 只能呼叫 `api`，不得 import `core`。
- `app UI` 不得直接改 `core`。
- `ocr` / `ai` 只能以 **plugin / service** 方式接入（見 ARCHITECTURE.md 的 Plugin Manager）。
- 所有核心商業邏輯只能放 `core`。
- UI 修改不得影響 LINE Bot 指令（由 測試009 守門）。

## 5. 派工矩陣（避免撞模組）

| 角色 | 範圍 | 禁區 |
|---|---|---|
| **CTO** | 架構/Review/Merge/測試/版本保護/Router 設計 | — |
| **A** | LINE Bot / Router / 指令 / 寄運 / 收款觸發 / 取消 | ERP後端、UI |
| **B** | ERP / DB / 庫存 / 冰庫扣庫存 / 收付款一致性(對帳) | Router、UI |
| **C** | mobile APP / UI / RWD / 登入 | **core（唯讀）** |
| **A2** | AI / OCR / 圖片辨識（**只能 plugin 接入**） | core、Router 內部 |
| **B2** | QA / Golden / Regression（**不得直接改核心程式**） | 只加測試，不改邏輯 |

> 衝突避免鐵律：**A 與 B2 不同時改同一檔；任何時刻一個 Core 檔只有一位 owner 在改；改前先在派工表登記「進行中」。**
