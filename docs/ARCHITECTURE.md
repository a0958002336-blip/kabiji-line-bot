# 架構重整計畫（含 Plugin Manager 與 Router 重設計）

> 版本：v1.0　CTO。**本檔是計畫，不是已完成狀態。** 實作一律走 feature branch + Golden Test + CTO Review。

## 0. 現實校準（務必先讀）

本專案橫跨**兩個執行環境**，「模組間只走 API」的可行性不同：

| | 卡比集 LINE bot | xuyang ERP + APP |
|---|---|---|
| 技術 | Google Apps Script（**單一 3130 行 .gs**） | Node.js |
| 模組邊界能否強制「只走 API」 | **不能**（GAS 全域共享、行程內呼叫）。可做到：clasp 拆多檔 + 「純邏輯 ↔ I/O」分層 + Golden Test 鎖行為。 | **能**（真正的 core/api/mobile 網路邊界在此側） |

→ 目標資料夾樹是**理想終態**；GAS 側以「邏輯分層 + 測試 + Tag」達成等效保護，不假裝變成微服務。

## 1. 目標資料夾結構（終態）

```
core/     # 商業邏輯：Router 分類、各 Parser、寄運/收款/取消/打卡/庫存規則（純函式，可 node 測）
line/     # LINE Webhook 轉接、reply、GAS I/O（getSheet/appendRow…）
api/      # 對外 API（ERP/APP 存取的唯一入口）
erp/      # ERP 後端（→ xuyang-line-erp repo）
mobile/   # 手機 APP（只呼叫 api）
web/      # 網頁 UI（只呼叫 api）
ocr/      # OCR plugin（只走 Plugin Manager）
ai/       # AI plugin（只走 Plugin Manager）
tests/    # 單元/整合/回歸/golden
docs/     # 規則與治理文件
```

**遷移策略：絕不大爆炸搬家。** 先在單檔內把純邏輯（parseShipping/分類判斷/規則）抽成無 I/O 的函式（可被 node mock 測），驗證行為不變後，才逐步 clasp 拆檔。每一步都被 Golden Test 守住。

## 2. Plugin Manager（前置層，讓新功能免動 handleEvent）

```
LINE Message
     │
     ▼
Plugin Manager        ← 依序詢問已註冊 plugin；plugin 回 {handled:true} 就短路
  ├─ OCR Plugin       ← 圖片訊息 → 文字，回填 text
  ├─ AI Plugin        ← 自然語言 → 結構化指令
  ├─ Image Plugin
  └─ Future Plugin
     │ (未被 plugin 消化的，帶著正規化後的 text 往下)
     ▼
Message Router (classifier)
     │
     ▼
一般交易 / 旭陽寄運 / 場外寄運 / 收款 / 取消 / 修改 / 查詢 / 打卡 / 出貨 / ERP
```

**設計原則**
- Plugin 只做「前處理/正規化」（OCR 出文字、AI 出指令），**不得自行判斷所有訊息**、不得直接寫資料表——寫入一律回到 Router → Core Handler。
- 新增功能 = 向 Plugin Manager `register(plugin)`，**不再碰 `handleEvent`**。
- Plugin 介面（草案）：`{ name, match(ctx)->bool, handle(ctx)->{handled, text?, command?} }`。
- A2 只能寫 plugin，不能改 Router/Core。

## 3. Message Router 重設計（classifier，取代 fall-through）

現況：`handleEvent`（行47）是一條由上到下、~40 個 `if…return` 的 fall-through 鏈，最泛用的「寄運出貨」保底條件（行535）把一般交易也吞了 → Bug1 根因。

**新設計：先分類、再分派，各類型獨立 Handler，彼此不交叉。**

```
classify(text, ctx) -> type ∈ {
  一般交易, 旭陽寄運, 場外寄運, 收款, 取消, 修改, 查詢, 打卡, 出貨, AI/OCR, 控制指令(#)
}
dispatch(type) -> 對應獨立 Handler
```

分類優先序（草案，待 Golden Test 驗證）：
1. 控制指令（`#…`）
2. 查詢（含「查」「#未收款」「寄運資料」「統整」等純讀，最先攔截、不上鎖）
3. 取消（明確「取消/清除」語意 + 回覆上下文/客戶代號/流水號）
4. 修改
5. 收款（`客戶 收錢/匯款 金額`）
6. 打卡（上/下班/遲到/請假；**先過員工白名單驗證**，不合法 → abnormal_logs）
7. 寄運（`寄運 …`／`寄旭陽`／`寄車X`／首行為合法客戶+物流）→ 旭陽/場外
8. 出貨/一般交易（有品項+件數，**且首行為合法客戶、非純數字、無物流關鍵字**）
9. 冰庫/台子/鐵架等既有子系統

> **關鍵防呆**：R1.1 首行純數字 → 直接排除寄運；R1.2 無物流關鍵字且非寄運格式 → 不進寄運表。

## 4. 完整 Log 規格（section 六）

每次核心寫入呼叫統一 `logAction(payload)`，記錄 10 欄到 `系統日誌` 分頁：
`時間, 版本號, LINE使用者ID, 群組ID, 原始訊息, 判成的指令類型, 目標資料表, 目標列(流水號/rowIndex), 成功/失敗, 失敗原因`

實作為 Core 變更（B/A 負責），需 CTO Review。
