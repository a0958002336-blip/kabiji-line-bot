# Golden 回歸測試護欄（B2 / QA）

可執行的回歸測試，把 `docs/business_rules.md` 的**目標行為**寫成斷言，用來擋 merge。
測試對象是正式營運程式 `../../卡比集機器人.gs`（**唯讀參考，測試絕不修改它**）。

## 怎麼跑

```bash
node tests/golden/run.js
```

- 只需要 node，不需連任何 Google 服務。
- **任一測試 FAIL → `process.exit(1)`**，可掛在 pre-push / merge gate 擋合併。

## RED / GREEN 慣例

| 標記 | 意義 |
|---|---|
| `[GREEN]` PASS | 程式已符合 business rule 的目標行為。 |
| `[RED]` FAIL | 目標行為**尚未達成**（bug 還在）。RED 是**刻意的** —— 它是「這個 bug 還沒修」的可執行證據。修好 `.gs` 後同一測試會自動轉 GREEN。 |

> 因此**在 bug 修好前，本 runner 現在就是 exit 1**，這是預期狀態（護欄正在擋）。

## 目前狀態表（實測 2026-07-02）

| 測試 | 對應規則 | 斷言（目標行為） | 現況 | 說明 |
|---|---|---|---|---|
| **G001** 一般交易不建寄運 | R1.1 | `parseShipping("1828⏎翠峰文科高山228 中15件")` 不得產生 customer 為純數字的寄運記錄 | 🔴 **RED** | 現況：`1828` 被行890當客戶，產生 `{customer:"1828", name:"翠峰文科高山228", qty:"15"}`。待修。 |
| **G004** 玉美加工廠寄旭陽 | R1.3 | `parseShipping("玉美加工廠 毛路87台 寄旭陽")`（**單行**）→ 1 筆 record，customer=玉美加工廠、qty=87、包裝含台子、物流=旭陽 | 🔴 **RED** | 現況：**單行、空白分隔**時解析出 **0 筆**。原因見下方「關鍵發現」。 |
| **G004n**（診斷） | R1.3 | 同上但**換行分隔** `玉美加工廠⏎毛路87台⏎寄旭陽` | 🟢 **GREEN** | parser 本身有能力：解析出 `{customer:玉美加工廠, qty:87, pack:台子, logistics:旭陽}`。 |
| **G005** 錯誤打卡不入正式 | R4.1 / R4.2 | 走 `handleEvent` 真實打卡路徑：非白名單亂碼「XXX下班」不得寫入「出勤打卡」分頁 | 🔴 **RED** | 現況：無白名單驗證（行481–507 只擋少數語助詞），亂碼被 `appendAttendance` 當員工寫入。待修。 |
| **G007** 市場群組不得改寄運 | R5.1 | `getPerm(marketChatId).canWrite === false` | 🟢 **GREEN** | 符合。市場群組 canWrite/canShipping/canInventory 皆 false。 |

實測輸出：`GREEN 2 / RED 3`，exit 1。（RED = 3：G001 / G004 / G005。）

## ⚠ 關鍵發現（G004）

任務指定的輸入字串 `"玉美加工廠 毛路87台 寄旭陽"` 是**單行、以空白分隔**。
`parseShipping`（行835）的設計是：**客戶名只在「非品項行」被賦值**（行890），
而品項行（含 `87台`）只有在 `customer` 已存在時才 push 記錄（行872）。
單行輸入時整行被當品項行處理，`customer` 從未被賦值 → **0 筆記錄**。

- **不是 parser 沒能力**：改成換行分隔（G004n）即正確產生 1 筆、欄位全對 → GREEN。
- **這是一個真實的輸入格式耦合限制**，已用 G004(RED) + G004n(GREEN) 兩個測試把它釘住當證據。
  修法方向（供開發者）：若首行即為品項行且無先前客戶，需有 fallback 認客戶（例如比對
  `getCarrierMap()` 的貨主/客戶名單），或明確規定寄運必須多行。**本測試不改 .gs。**

> runner 會把 G004 標為「非預期」黃字提醒，因為 business_rules R1.3 期望它成立；
> 這正是要人工裁決的點（是修 parser、還是規定輸入格式）。

## 架構 / 手法

`harness.js`：
1. 讀 `../../卡比集機器人.gs` 原始碼字串。
2. 建立不連線、可記錄呼叫的 GAS 全域 mock：
   `SpreadsheetApp` / `PropertiesService` / `LockService` / `UrlFetchApp` /
   `ContentService` / `CacheService` / `Logger` / `Utilities`。
   - Sheet mock 用 Proxy：`appendRow` / `getDataRange().getValues()` 有真行為，
     其餘格式化方法（setColumnWidth…）自動 no-op。
   - `PropertiesService` 是真的 key-value store，可用 `scriptProps.setProperty` 設定
     `ADMIN_GROUP_IDS` / `MARKET_GROUP_IDS` 來測權限與打卡路徑。
3. 用 `new Function(...把 mock 當參數注入...)`，在 mock scope 下 eval `.gs`，
   **並在原始碼字串尾端「附加」一段 `return {...}` 匯出要測的函式**。
   附加 return 只作用在載入時的字串副本，**原始 `.gs` 檔完全沒被改動**。
4. `createEnv()` 每次產生全新、互相隔離的 mock 狀態（避免測試互污染）。

匯出可測函式：`parseShipping`、`getPerm`、`appendAttendance`、`handleEvent`、
`parseCommand`、`getVendors`、`getCarrierMap`、`isGrade`、`nextHasItem`、
`addGroupId`、`listProp`、`getSheet`、`isAdmin`、`looksLikeWrite`、`looksLikeChat`。

## 因相依 I/O 而**跳過純測**的函式

| 函式 | 為何跳過 |
|---|---|
| `replyToLine` / `notifyOwner` | 走 `UrlFetchApp` 打 LINE API。已 stub 成「記錄呼叫、不連線」，可驗「有沒有嘗試回覆」，但無法驗 LINE 端實際結果，故不對其做斷言。 |
| `doPost` | 需真實 HTTP `e.postData`；只是 `handleEvent` 的外殼，測 `handleEvent` 即可。 |
| 各種 `setColumnWidth` / `setFrozenRows` / 字型格式化 | GAS 試算表 UI 專用，node 無意義，全 stub 成 no-op。 |
| 需真實資料的統計/查詢（`controlOverview`、`attendanceStats`…） | 依賴多分頁既有資料；可測但需先鋪 mock 資料，**不在本批 001/004/005/007 範圍**，列為後續（見 MANIFEST 010 回歸）。 |

> 全程未修改 `卡比集機器人.gs`。若未來 mock 有不足，請在 `harness.js` 補 mock，
> **不要改動正式程式**。
