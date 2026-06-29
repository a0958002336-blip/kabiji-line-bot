# 卡比集機器人 CHANGELOG

> **版本分流制度（2026-06-29 起）**：正式營運版 = `v2.5-stable`（只修 Bug、不新增功能、改前備份+Gate+實測）；開發版 = `v2.6-dev`（新功能/重構，不影響正式機器人）。詳見 `卡比集機器人_開發規範.md`。

## V2.5 — 2026-06-29（鐵架收回完整修正 + 寄運取消防呆 + 物流/清備註）

> 主檔：`卡比集機器人_核心完整版.gs`；部署檔：`Desktop\卡比集機器人_v2.5.gs`；穩定備份：`GAS_v2.5_stable.gs`。
> 影響模組：**鐵架 / 寄運 / 查詢速度（共 3，符合單次部署 ≤3 模組規則）**。
> Gate：regression 28/0、A 鐵架 24/0、B 取消 8/0、原鐵架 36/0、node --check OK（共 96 斷言）。寄運清備註由平行 session 驗證 23/23。
> 回滾點：`GAS_v2.5_stable.gs`、`GAS_v2.4_stable.gs`、git tag `v2.4-stable`。

### A 工程師（鐵架）
- 根因：防呆硬性要求名稱含「鐵架」二字 → 真實鐵架「右昌藍橘鐵」（結尾「鐵」）被擋。
- 修正：`rackEntryGuard`、`rackSlipStrict` 的 `/鐵架/`→`/鐵/`；`rackFormatWarning` 文案同步。
- 收回容錯：`handleRackReturn` 新增 `matchCust`/`matchRack`（完全相同優先、找不到再唯一包含容錯），解決「查得到、收不到」。
- 測試：rack_awork_test 24/0。

### B 工程師（寄運取消）
- 根因：`cancelShipping` 整筆刪除規則過寬，任何行尾「取消」即刪整個客戶；📍備註行尾「取消」→ 誤刪整筆。
- 修正：整筆刪除只在「該行去掉取消後為空或等於客戶名、且非 📍 行」才執行。
- 測試：test_cancel_B 8/0（含使用者事故案例：📍行尾取消→不刪光）。

### 寄運物流（B/平行）
- `寄旭陽（修清）` 獨立行物流/備註分離（`parseShipping` else 分支）；`寄車`→`寄車?` 讓括號外 `寄旭陽` 也認得物流。
- 「清備註/改備註」指令（`handleShippingModify` + NOTEOP + gate L138/L349）：`客戶：品名 等級 數量 清備註`／`改備註 X`。

### 查詢速度（鎖分流）
- 6 處冰庫寫入鎖 `waitLock(15000/10000)` → `acquireLock(5000)`（`tryLock`，搶不到丟 BUSY）；`doPost` 攔 BUSY → 回「⚠️ 系統忙碌，請稍後再試。」
- 查詢類（freezerOverview/rackOutstanding/loanDetailAll/summarizeAmount/commandSheet）不上鎖，不再卡 15-20 秒。

### 備註（不是 bug）
- `1052`＝試算表 `PLACE_ALIAS` 的地點代號「舊廠 ➜ 新中北路1052號」，由 `expandPlace` 展開；`修清/舊廠`＝備註欄（第10欄）。程式無 1052/辦別 function，屬資料/顯示，非缺陷。

---

## V2.4 — 2026-06-29（鐵架分隔符 + 寄運物流 + 查詢速度，首次三合一）
- 鐵架：itemRe 分隔符全支援（* ＊ × x X ： : 空格）、「客戶名收」、不超收（`rackSlipStrict`/`rackEntryGuard`）。
- 寄運：`寄旭陽（修清）` 物流/備註分離（`parseShipping`）。
- 速度：寫入鎖縮 5 秒 + 忙碌回覆（`acquireLock`/`doPost`），查詢不上鎖。
- git tag `v2.4-stable`（commit af3edcf）。

### 部署與回滾
- GAS 編輯器貼上對應版本 → 管理部署 → 新版本 → 部署 → 群組打 `#版本` 確認版號。
- 異常回滾：還原上一個 `GAS_v2.x_stable.gs` 重新部署，不在正式版熱修。
