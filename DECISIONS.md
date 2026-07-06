# 自主開發決策紀錄（DECISIONS）

> 依使用者授權：需要選擇時一律採「風險最低、不破壞現有功能」選項，於此記錄理由後繼續，不停下等待。

## 全域
- **D0 不做整份四層重寫**：spec 架構目標希望把 handleEvent 重排為四層管線，但最高原則 #1「不得破壞現有 27 項行為」與 #2「不做大型重構」優先。3200 行單檔全量重寫風險過高。→ 決定：以**最小侵入的targeted edit**逐一達成各 Task 的驗收條件（加權限閘門、消歧規則、鎖、別名、safeReply），不整段重排 60+ regex 瀑布。已在既有瀑布上補「引用唯讀」「寄運硬攔」「Intent 分類」等前置守衛。
- **D0.1 備份**：建立 git tag `before-refactor`（指向 768caba，含先前 emp-norm/intent-guard/outbound 已推送修正）+ `Code.gs.backup-original`（HEAD 快照）。每個 Task 完成另存 `backups/Code.Task<N>.gs`。
- **D0.2 commit 粒度**：以「每個 Task 一次（必要時 Task 內拆數次）」提交並 push；每 Task 完成存檔快照。

## Task 1 安全修補
- **D1.1 #轉移老闆採「解除為無主」**：spec 允許自選最簡單安全做法。→ 現任老闆打「#轉移老闆 確定」後 `deleteProperty('OWNER_USER_ID')` 進入無主狀態，下一位再 `#註冊老闆` 接手。比「指定下一位 userId」更簡單、更不易誤設，且不會意外清空（需現任老闆＋確定二關）。
- **D1.2 ownerGate 閘門**：新增 `ownerGate(source, replyToken)`，非老闆回「🔒 僅限老闆。」並中止。套用到所有 # 設定/寫入類指令。查詢類（#貨主名單/#冰庫名單/#查客戶/#群組ID/#群組權限/#物流客戶/#我的ID/指令表）**不**上鎖，維持原可用性。
- **D1.3 供應商指令**：spec 列的 `#新增供應商/#設定供應商` 在現行碼不存在（本專案用「貨主」），故僅對既有 `#新增貨主/#移除貨主` 上鎖，不新增指令（避免開新功能）。

## Task 8
- **D8.1 fail-closed 範圍**：spec 要求統一改寫 `!isAdmin && OWNER_set` 模式。全部 12 處（含清除/取消/中控/評比/出勤統計/出勤查詢）改走 `ownerOnly()`——未註冊老闆時一律拒絕。統計/查詢類雖非破壞性，仍照 spec 一併 fail-closed（需先註冊老闆才用老闆功能），風險低。
- **D8.2 去重存放**：以 `CacheService`(6h) 存 message.id；測試 harness 的 CacheService 改為 stateful in-memory（僅測試層，隔離於各 env）以驗證去重。

## Task 11+12
- **D11.1 更新 run_emp_norm 既有斷言（非弱化）**：Task11 依 spec 將 attendanceStats/evaluation 輸出由舊「【姓名】…下班N」改為新簡表「姓名｜出勤｜遲到｜請假｜全勤」。run_emp_norm 原本斷言舊格式字串，格式已合法變更，故將其斷言改對新格式；**合併驗證意圖完全保留**（仍驗證良/阿良、宏欸系列合併為單一正名、數字為合計）。依鐵律 rule 6 於此記錄理由。未刪除任何測試案例，項數不變。

## Task 4 收款/未收款（決策 D1）
- **D4.1 採 kabiji-bot schema、於 _repo 全新實作**：使用者裁示採 kabiji-bot 的欄位/狀態設計但不搬程式碼。新分頁「待收款」18 欄＝kabiji-bot v2 的 15 欄（供應商版，非 orderNo）＋本任務要求的軟刪除稽核 3 欄 deleted_at/deleted_by/reason。
- **D4.2 簡化收款人流程（使用者同意）**：偵測到即建立【未收】(collectedBy 空)，不做 kabiji-bot 的「先問誰收款再建」pending 對話。理由：少一個對話狀態＝更少誤觸、更 fail-closed、更易測。收款人於 #已收 時記發話者。
- **D4.3 器材回收無條件否決收款（P0-1）**：`recvDetect` 一旦命中 收台/台回來/空籃/棧板回收 即 return null，**即使含「需收」等 RECV_KW 字**（「需收台回來」的「需收」會誤命中 RECV_KW）。此為修 [Task4] 首次跑測時 intent_guard D1 轉紅的根因；已加回歸案 2d。
- **D4.4 去重雙軌 + 24h 窗（使用者調整）**：① sourceMessageId 完全去重（不限時間）；② 同客戶+金額+品項且非取消，**僅 24 小時內**視為重複。理由：客戶隔日的真實重複交易不得被誤判去重而漏帳。
- **D4.5 取消＝軟刪除**：#取消收款 不刪列，改 status=取消 並填 deleted_at/deleted_by/reason，稽核可追蹤（呼應 Task8「取消保留 Log」）。

## 開發紀律：#版本 build 識別（DISCIPLINE-VERSION）
- **每次交付部署前，最後一個 commit 必須同步更新 `#版本`**：更新 `BOT_VERSION`、`BOT_BUILD`（最後 commit 短 hash）、`BOT_DATE`（見 `versionMessage()`）。
- `#版本` 第一行固定格式：`📦 卡比集機器人 <版本> (<短hash>) <日期>`，讓部署後打 `#版本` 一眼確認是否新版。
- 必備測試 `tests/golden/run_version.js`：驗證 `#版本` 回覆含當前版本字串（v3.0）＋ build 短 hash 樣式 ＋ 本輪重點 ＋ 不含舊版字串。全量回歸一併跑。
- **build hash 回填慣例**：因 commit 無法在建立前得知自身 hash，採「版本 commit + 回填 commit」兩步：版本 commit 內 `BOT_BUILD` 先放上一交付 hash，再以一個 chore commit 回填為版本 commit 的短 hash。故 `#版本` 顯示的 hash＝版本 commit（回填 commit 的父），交付部署的是回填 commit（兩者僅差該字串）。
