# 專案總路線圖（唯一真理來源）— v1.0

> 依董事長「總指揮令」6 階段。CTO 維護。品質優先於速度，但速度也要加快。
> 兩個 repo、兩個 runtime，天然隔離：**LINE bot(GAS) 與 APP(ERP前端) 可平行推進、互不影響。**
> 日期：2026-07-02

## 核心紀律（每項修改都適用）
1. 不為趕進度破壞既有功能。2. Core 改動未測不得 Merge。3. 每項修改過 Golden Test。
4. 每完成一功能立即部署測試，不累積大批。5. 穩定版打 Git Tag + 可回復。

---

## 階段與狀態

### P1 — LINE 機器人核心穩定化（最高優先，進行中）
先修完所有已知 Bug，再進穩定版。
| Bug | 內容 | 主責 | 狀態 |
|---|---|---|---|
| Bug1 | 一般交易/1828 誤判寄運（分類） | A | 診斷完成，待修 |
| Bug2 | 收款→#未收款 對帳（**新建**，需先定資料模型） | B | 診斷完成，**待董事長定 schema** |
| Bug3 | 取消（回覆/客戶代號/流水號） | A | 診斷完成，待修 |
| Bug4 | 打卡異常污染 + abnormal_logs + 驗證 | B | 診斷完成，待修 |
| Bug5 | 清除/取消權限缺口 | A | 診斷完成，待修 |
| — | 場外寄運(玉美寄旭陽)、修改、查詢、冰庫出入庫、庫存、ERP寫入log | A/B | 納入 Router 重整 |
| Golden | 可執行回歸護欄（先 RED 後 GREEN） | B2 | **建置中** |
> 完成定義：全 Bug 修復 + Golden 全 GREEN + 你 LINE 實測 → 打 `v2.58-stable`。

### P2 — 效能最佳化
- P0：出貨迴圈內掃冰庫→map化(行546-551, A)；記憶化 knownRetailers/knownFreezerCustomers(B)。
- P1：webhook 去重、限縮掃描範圍、空 catch 補 log。
- 目標：一般指令 1–3 秒。（見 `PERFORMANCE_AUDIT.md`）

### P3 — APP 全力開發（可與 P1 平行）
- Phase 1：登入/首頁/選單/深色/RWD（C）→ 詳 `../xuyang-line-erp/APP_DISPATCH.md`
- 必完成頁：登入·首頁·查詢·庫存·冰庫·寄運·未收款·收款·出貨·通知·設定；Android/iPhone/平板。
- ⚠️ Phase 2/3(查詢/操作/登入) **封鎖於 ERP P0 安全**：ISSUE-02(.db/.env 可下載)/03(REQUIRE_AUTH=0)/04(弱帳密) 未解不得對外。

### P4 — UI/UX 全面改版（Prototype 先，你確認後才實作）
- 方向：文藝·自然·舒服·高級·簡單·一眼會操作，非傳統 ERP。
- 設計系統已定：`../xuyang-line-erp/DESIGN_SYSTEM.md`（卡比集農業識別 + tokens）。
- 交付：先 Prototype → 你確認 → 正式套用。

### P5 — APP 初始化（清測試資料）
1. 完整 Backup → 2. 區分正式/測試資料 → 3. 只清測試 → 4. 保留正式 → 5. 初始化上線狀態 → 6. 建 Reset Script。
> 鐵律：**不得直接刪正式營運資料**；先備份、先確認清單、經你核可才清。

### P6 — 正式上線準備
Release / Deployment / Rollback / Backup Checklist + Golden Test；確認 LINE Bot·ERP·APP·API·Database 全正常。

---

## A/B/C/A2/B2 派工矩陣（避免撞模組）

| 角色 | Repo / 範圍 | 擁有檔案 | 禁區 |
|---|---|---|---|
| **CTO** | 全域 | 架構/Review/Merge/Golden gate/Tag/每日回報 | 不寫功能(除 P0 hotfix) |
| **A** | LINE bot | handleEvent 分類重整、**出貨/寄運/場外寄運 block(含其庫存迴圈效能)**、取消、修改、查詢、權限(Bug1/3/5) | 冰庫內部、財務、打卡、ERP、UI |
| **B** | LINE bot | **收款對帳(Bug2)、打卡+abnormal(Bug4)、冰庫子系統、knownRetailers記憶化、ERP寫入log** | handleEvent 分類、parseShipping、UI |
| **C** | ERP 前端 | `index_v2.html`、`mobile.css`（APP 全部 Phase） | **core/server_v2.js/services/database/Business Rules 全禁** |
| **A2** | ERP/Plugin | Plugin Manager 接入、OCR/AI plugin（**只 plugin，不改 Router/Core**） | LINE bot Core、Router 內部 |
| **B2** | QA | Golden 護欄、APP 實機測試、雙邊回歸 | **不改任何核心程式** |

**反撞規則**：①一個 Core 檔同時只一位 owner；②改前在此表登記「進行中」；③A 與 B 在「出貨↔冰庫」交界處序列化（A 先分類、B 後動冰庫內部）；④C 與 A/B 不同 repo，天然不撞。

**平行軌**：Track-1 = A+B 修 LINE bot(P1/P2)；Track-2 = C 做 APP(P3/P4)；B2 兩邊測。→ 同步推進、互不影響。

---

## 每日回報範本（CTO）
1.已完成 2.進行中 3.剩餘 4.預估完成時間 5.風險 6.是否影響 LINE Bot Core 7.是否影響 ERP Core 8.APP 完成% 9.機器人完成%

## 目前實況（2026-07-02）
- ✅ 5 Bug 唯讀診斷、架構保護文件、效能稽核、設計系統、APP 派工、rollback、develop 分支。
- 🔄 B2 建 Golden 護欄中。
- ⏭️ 護欄綠→ A 修 Bug1、B 修 Bug4；C 起 APP Phase 1（平行）。
- ⛔ Bug2 待你定「未收款＝哪張表/欄位」的資料模型才動工。
