# Release Candidate 回報 — 卡比集機器人

- 分支：`develop`　最新 commit：**`cbb01a6`**（RC tag：`rc-2`；前一版 `rc-1`=6cd2072）
- 備份/回滾點：tag `before-refactor`(768caba)、`before-all`(42a59ff)、`Code.gs.backup-original`、`backups/Code.Task*.gs`
- runTests()：**162/162 全綠**（`node tests/golden/run_all.js`；另 run.js 既有 D4/D6 待決策 RED，非回歸）
- 部署文件：`docs/部署手冊.md`（非工程師版）+ `docs/RC_回歸測試清單_v2.58.md`（上線後 LINE 快篩 8 項）
- 更新（rc-2）：Task 4 收款/未收款模組完成（26 測試）；#設定外勤補貼 補 isAdmin。
- **#2 Approval Workflow：依決策移出任務清單（未來另案），本輪不做。**

---

## 1. 各 Task 完成狀態

| Task | 狀態 | 說明 |
|---|---|---|
| Task 0 測試防護網 | ✅ 完成 | `tests/golden/run_all.js` 單一 runTests 入口，聚合 8 套件 135 案例 |
| Task 1 安全修補 | ✅ 完成 | 老闆閘門、#註冊老闆防搶注、#轉移老闆 |
| Task 2 權限層重排 | 🟡 部分 | 權限閘門既有且正確；整段四層重排延後（風險）→ KNOWN_ISSUES |
| Task 3 意圖層 | 🟡 部分 | classifyIntent + 驗收案例全過；switch 單一分派整段重寫延後 |
| Task 4 收款隔離 | ✅ 完成(rc-2) | 決策 D1 後於 _repo 全新建收款/未收款模組：偵測建立→已收→取消軟刪除+Audit；26 測試 |
| Task 5 出庫/庫存 | 🟡 部分 | 出庫回歸(17)+數字客戶白名單完成；全面加鎖/統一改單入口延後 |
| Task 6 員工別名統計 | ✅ 核心完成 | SSOT 讀寫全套用+查詢合併+外勤明細含日期；migrateEmpAlias 工具延後 |
| Task 7 回覆防護 | ✅ 完成 | safeReply 分則/截斷、非200記錄、外勤未填地點 |
| Task 8 安全與去重 | ✅ 完成 | 事件去重(isRedelivery+message.id)、12處 fail-closed |
| Task 9 誤判補強 | ✅ 完成 | 疑問語尾/老闆黑名單、借支非員工擋、退貨代名詞擋、isWholeIce 收緊 |
| Task 10 資料/維運 | 🟡 少部分 | 非200記錄+safeReply 完成；DriveApp備份/Cache/summarize 等延後（需真環境） |
| Task 11+12 統計格式 | ✅ 完成 | 出勤統計/綜合評比 簡表+明細版 |

## 2. 修了哪些 Bug／改了哪些函式

**安全（Task1/8）**：`ownerGate`/`ownerOnly`（新增）、`#註冊老闆`/`#轉移老闆`、12 處 fail-closed；`doPost` 事件去重。
**誤判（P0/Task3/9）**：`classifyIntent`/`intentAllowsWrite`/`logIntent`（新增，收台≠收款、聊天≠寄運）、Line Quote 引用唯讀、寄運硬攔；打卡疑問語尾+老闆黑名單、`isValidEmpName`/`knownEmpNames`（借支擋非員工）、退貨代名詞擋、`isWholeIce` 收緊。
**姓名正規化（Task6）**：`normalizeEmployeeName`/`stripEmpTime`/`buildAliasIndex`/`getEmployeeAliases`（新增 SSOT）；套用至 attendanceStats/evaluation/speechCountMonth/controlOverview/duty*/loan*/hireQuery + 寫入端 appendAttendance/handleDuty/recordLoan/recordHire/resigned。
**出庫/寄運（Task5）**：`isKnownShipCustomer`+`SHIP_NUM_WHITELIST`（3088放行/1828擋）。
**回覆（Task7）**：`splitForLine`/`safeReply`、`replyToLine` 非200記錄、`handleDuty` 地點可選。
**統計格式（Task11+12）**：`attendanceStats`/`evaluation` 簡表+明細渲染（邏輯不動）。

## 3. runTests() 最終輸出（`node tests/golden/run_all.js`）
```
✅ run_security.js 18  ✅ run_task8.js 6   ✅ run_emp_norm.js 31
✅ run_intent_guard.js 34  ✅ run_task9.js 11  ✅ run_task7.js 9
✅ run_stats_format.js 10  ✅ run_receivable.js 26  ✅ run_outbound.js 17
總計：162/162 通過。（run.js 既有 D4/D6 RED 非回歸）
```

## 4. 最新 commit hash
`cbb01a6`（tag `rc-2`）

## 5. 是否可部署：YES
已完成項（含收款/未收款模組）全數通過測試、162/162 零回歸、無 runtime/console error。可作為 rc-2 部署上線。
- 收款/未收款模組**已補齊**（Task 4，決策 D1 後）。
- 仍延後：Task 2 權限層整段重排、Task 3 switch 單一分派、Task 5 全面加鎖稽核、Task 10 DriveApp備份/Cache遷移（見 KNOWN_ISSUES.md，皆屬大型重構或需真環境驗證，非阻擋上線）。
- 部署請照 `docs/部署手冊.md`；上線後照 `docs/RC_回歸測試清單_v2.58.md` 快篩 8 項。

## 6. 部署步驟 / 風險 / 回滾（Apps Script）
**部署**：GAS 編輯器貼上 `卡比集機器人.gs` 全文 → 儲存 → 部署→管理部署作業→編輯→新版本→部署 → LINE 打「#版本」確認。
**風險**：
- 中：fail-closed 使「未註冊老闆」時清除/統計等被擋——請確認正式環境 OWNER_USER_ID 已設（打「#群組權限」或先 #註冊老闆）。
- 低：借支僅限已知員工名（出勤表/綁定/別名）——新員工首次借支前需先打卡或 #綁定員工。
- 低：純數字客戶寄運僅白名單放行，若有白名單外數字客戶需 #設定物流客戶 或先出現於歷史寄運。
**回滾**：GAS「管理部署作業」切回前一版本；或還原 `Code.gs.backup-original`/`backups/Code.Task*.gs` 重貼重部署；git 端 `git checkout before-all -- 卡比集機器人.gs`。

## 7. DECISIONS / KNOWN_ISSUES 摘要
- DECISIONS：不做整段四層重寫（風險）、#轉移老闆採解除為無主、fail-closed 全 12 處、Task11 測試斷言改新格式（合併意圖不變）。
- KNOWN_ISSUES：Task2 整段重排、Task3 switch 重寫、Task4 收款模組（新功能+需 D1）、Task5 全面加鎖、Task6 migrate 工具、Task10 DriveApp/Cache/summarize 皆因「大型重構/新功能/需真環境驗證/資料相容風險」延後。
