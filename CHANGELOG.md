# 卡比集機器人 CHANGELOG

## V2.4 — 2026-06-29（緊急合併：鐵架 + 寄運 + 查詢速度）

> 主檔：`卡比集機器人_核心完整版.gs`；部署檔：`Desktop\卡比集機器人_v2.4.gs`
> 回歸測試：28 PASS / 0 FAIL（11 項功能 + 鎖政策）；`node --check` 通過。
> 回滾點：V2.3＝`Desktop\卡比集機器人_v2.3.gs`（僅鐵架修正）；原始＝`卡比集機器人_核心完整版.bak_20260629_135430.gs`（V2.2）。

### A — 鐵架出入庫修正（`rackSlipStrict` / `rackEntryGuard`）
- 根因：`itemRe` 只認 `*＊×xX`，不認空格與 ：/:；「收」只認單獨一行。
- 修正：數量分隔符全支援 `* ＊ × x X ： : 空格`；「客戶名收」同一行＝收回；收回不超收、不扣成負數、超過提示。

### B — 寄運物流解析修正（`parseShipping`，一行區塊）
- 根因：獨立行 `寄旭陽（修清）` 時，`cl[1]` 變成「旭陽（修清）」（貨運名黏括號備註）→ 判斷失敗 → 整行掉進備註，物流遺失。
- 修正：獨立物流行先拆出括號備註，再認 `寄<貨運名>`；物流正確寫入、備註分離。
- 證明：trace Case1「寄旭陽（舊廠）」、Case2「寄旭陽（修清）」→ 物流=旭陽、備註正確。
- 註：Case3「幸福⏎寄旭陽」無品項數量 → 本來就無列可寫（非 parser bug）。

### 速度 — 寫入鎖分流（`acquireLock` + `doPost`）
- 根因：6 處冰庫寫入函式用 `LockService.getScriptLock().waitLock(15000/10000)` 全域鎖，群組一忙就把查詢塞在佇列後面 15–20 秒。
- 修正：新增 `acquireLock(ms=5000)` 用 `tryLock`，搶不到丟 `BUSY_系統忙碌`；6 處寫入鎖點改用 `acquireLock(5000)`；`doPost` 攔截 BUSY → 回「⚠️ 系統忙碌，請稍後再試。」
- 查詢類（freezerOverview / rackOutstanding / loanDetailAll / summarizeAmount / commandSheet）本來就不上鎖，已驗證不含鎖 → 不再卡 waitLock。

### 部署
- GAS 編輯器貼上 v2.4 → 管理部署 → 新版本 → 部署 → 群組打 `#版本` 應顯示 **v2.4**。
- 若 LINE 實測任一失敗 → 回滾 v2.3（鐵架）或 v2.2（原始），不得熱修正式版。
