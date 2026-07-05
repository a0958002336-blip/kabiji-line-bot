# KNOWN ISSUES / 已知未完成項（RC 附帶）

> 原則衝突排序：最高原則「不破壞現有 27 項行為 / 不做大型重構 / 不開新功能」優先於架構目標的「整段重寫」。
> 以下項目為「風險過高或屬新功能」而**刻意延後**，非測試不過。皆已在 DECISIONS.md 記錄。

## 延後項目（附原因）

### Task 2 完整權限層四層重排 — 部分完成
- 現況：權限閘門 `getPerm(chatId)` 已存在且正確（market 唯讀只允許 MARKET_READ 查詢、寫入靜默；驗收「市場群貼寄運單 0 筆」已由既有邏輯滿足）。# 設定指令已於 Task1 加老闆閘門。
- 延後：把 handleEvent 的 60+ regex 瀑布「整段重排」為嚴格四層管線、以及「unknown 群老闆一次性提示」子功能。
- 原因：整段重排 3200 行單檔風險過高，可能破壞 #版本 列的 27 項行為，與最高原則牴觸。採「在既有瀑布上補前置守衛」的低風險路線。

### Task 3 switch(intent) 單一分派整段重寫 — 驗收案例已達成、未整段重寫
- 現況：`classifyIntent()` 已建立並鎖定關鍵不變量；Task3 驗收案例全數通過（「明天要收300件」不寫、「1828」不寫、「他們還沒報件數嗎」靜默、貼回不重複、正常格式照常）——由既有格式判斷 + 新守衛達成。
- 延後：把整個寫入區改寫為 `switch(intent)` 單一分派。
- 原因：等同重寫訊息路由，回歸風險高。既有 handler 互斥性已足以通過驗收。

### Task 4 收款模組 RECV_KW / recvDetect / pending — 模組不存在，屬新功能
- 現況：**全專案 grep 無任何收款/未收款/待收款實作**（僅有匯款/改價/損耗）。`classifyIntent` 已把「收款關鍵字」與「收台/空籃/棧板回收」隔離（收台永不判收款）。
- 延後：整個收款偵測→pending→確認→#已收 流程。
- 原因：從零建收款模組屬「開新功能」，違反最高原則；且需先定資料模型（決策 D1）。待老闆確認後另案處理。

### Task 5 其餘 — 部分完成
- 已完成：出庫/扣庫存回歸鎖定（17 項）、數字客戶白名單（3088 放行 / 1828 擋）。
- 延後：把「所有批次寫入」逐一加 `acquireLock` 的全面稽核（部分 handler 已有鎖）、`handleFreezerShip` 找不到品名的 ⚠️ 清單強化、`handleShippingModify` 統一入口消除 regex 互斥。
- 原因：涉及多個 handler 的行為改動，需逐一寫回歸；時間內優先完成高風險安全項。低風險、可後續補。

### Task 6 其餘 — 核心完成
- 已完成：SSOT `normalizeEmployeeName`、讀寫兩端全面套用、查詢端合併、外勤明細含日期（dutyAllDetail/dutyQuery 已含 ymdStr）。
- 延後：`migrateEmpAlias()` 歷史資料改名工具（手動執行、先 log 預覽、只改名不刪列）。
- 原因：屬一次性維運工具、需在真實 GAS + 試算表執行預覽，node mock 無法驗證其 Drive/Sheet 副作用；低急迫性。

### Task 10 資料正確性與維運 — 大部分延後
- 已完成：`replyToLine` 非 200 記錄狀態碼、safeReply 分則/截斷。
- 延後：`dailyBackup()`+`setupBackupTrigger()`（DriveApp 複製試算表）、NAME_ 快取改 CacheService、`summarizeAmount` 全時段掃描、`parseYMD` 跨年、`stockLatest` key 改 vendor|product、`logGroupMessage` 移到權限後。
- 原因：DriveApp/觸發器/CacheService 遷移屬**基礎設施變更且無法在 node mock 驗證**（需真實 GAS 環境）；`stockLatest` key 變更有**既有資料相容風險**。依 fail-safe 原則，未經真實環境驗證不強改。建議在 GAS 編輯器內另案逐項驗證。

## 既有刻意 RED（非本次造成、非回歸）
- Golden `run.js` 的 G004（單行寄運解析 / 決策 D6）與 G005（錯誤打卡白名單 / 決策 D4）為**修復前即存在、且等董事長決策**的項目，維持 RED 作為待辦證據。
