# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.4.7 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

## 📌 build hash 定義（寫死，勿再解讀）

> **`#版本` 顯示的 hash ＝ 該版的「版本 commit」短 hash，不是 HEAD、也不是 chore 回填後的 commit。**
>
> 本版即為 **`565b1c4`**（`[v3.4.7] …` 那個 commit），**不是** `c3d2a34`（chore 回填）、
> 也不是封版 commit。流程固定：① 版本 commit（BOT_BUILD 仍是上一版）→ ② 取該 commit 短 hash
> → ③ 回填並另開 `chore(版本)` commit → ④ 封版 commit。故 BOT_BUILD 會比 HEAD 少一到兩格，
> **這是刻意的、不是漏更新**。做 verify_sync 方法 A 時請拿 `565b1c4` 比對，不要拿 `git rev-parse HEAD`。
> ❌ 禁止用 `git commit --amend` 回填（amend 改掉 hash → 填進去的值當場失效）。

---

- 待部署版本：`develop`（deploy commit `c3d2a34`；`#版本` 顯示 `565b1c4`；`v3.4.7`）
- 封版日期：2026/08/05（v3.4.7 查出勤月份篩選＋年/月誤讀報錯＋顯示上限外顯）
- 回歸測試：`node tests/golden/run_all.js` → 529/529 全綠
- 🚫 **v3.4.7 尚未部署**（本輪僅封版；push 與部署待老闆指示）
- ✅ 線上現況：**v3.4.6 已於 2026/08/01 前後由老闆貼上 GAS 部署**，`#版本` 回報 v3.4.6
  （⚠️ 括號內 build hash 應為 `888a515`，老闆尚未逐字確認，部署 v3.4.7 前建議先核對一次）
- ✅ LINE 平台 7/28 的 500/505 已恢復（該次停擺與程式無關：doPost 執行紀錄全「已完成」1~4 秒、
  部署設定/網址/額度皆正常，斷點在 LINE 側）
- ⚠️ **主車行名稱仍待確認：`旭陽` 還是其他字**（老闆先後憑印象打過「旭曘」「旭暘」，皆不可靠；
  已知有 LINE 群組名為「旭陽加工回報群」但不確定等於寄運主車行）。
  影響 `getMainCarrier()` 預設值與 `isShippingRecord()`（非主車行整筆不記，v3.4.4 規則）。
  **程式碼與測試全域搜尋「旭曘」為 0 次**，全部假設 `旭陽`。
  查法（唯讀）：LINE 打 `#物流客戶`（看 CARRIER_CUST 的 key）、`#非旭陽寄運`（看資料實際值），
  或跑桌面 `diag_carrier.gs`（連 Script Property 原始值與使用者原始輸入一起看）。
  ⚠️ 若實際名稱不是旭陽，**修的是 Script Property `MAIN_CARRIER`，不必改程式碼、不必重新部署**。
- 📦 暫存中（未併入本版，待另開一輪 review）：`stash@{0}` ＝ 寄運多行單「行內 #備註」改動
  （`parseShipping()` 9 行）＋ `tests/golden/run_v346.js`（7 案）。來源：2026/07/24 17:19 有人修改，
  動手前留有 `卡比集機器人.gs.bak_20260724_inlineNote`（內容＝當時 HEAD），但未 commit、作者待確認。
  因與變更 7 同動 `parseShipping()`，刻意不一起上，避免出事無法歸因。
- ⚠️ **部署後手動一次**：GAS 執行 `setupMeterTriggers` 啟用電錶排程（每月1號08:00早報／每日20:00追未抄），`#電錶提醒` 確認觸發器✅。電錶兩張新表(電錶設定/電費紀錄)首次用到時自動建立含 header，免手動。
- ⚠️ 部署後（沿用 v3.4.4）：寄運資料 **L1 手動填「單件重量」**（既有表不自動補 header，資料照樣寫 L 欄）；`#非旭陽寄運` 檢視舊誤存
- ⚠️ 去貨主名舊髒列仍靠顯示層遮（v3.4.3），不回溯改資料
- 桌面部署檔（三版並存，舊版保留作回退點，勿刪）：
  - **本次** `0_最新程式_貼這個_v3.4.7.txt` ／ `卡比集機器人-v3.4.7.gs`（sha256 `ffdcadf5…`，對齊 HEAD）
  - v3.4.6（線上現行）`0_最新程式_貼這個_v3.4.6.txt` ／ `卡比集機器人-v3.4.6.gs`（sha256 `fb667cf3…`）
  - v3.4.5（前一版回退點）`0_最新程式_貼這個_v3.4.5.txt` ／ `卡比集機器人-v3.4.5.gs`（sha256 `1da17aa2…`）
  - 另有 `diag_carrier.gs`（主車行核對唯讀診斷，非部署檔；貼 GAS 新檔案跑完即刪）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- ⚠️ `BOT_BUILD` 規則詳見本檔開頭「📌 build hash 定義」區塊（v3.4.6 起亦寫進 .gs 註解）
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、**前一版 deploy `72b1b52`(v3.4.6，線上現行)**、
  前前版 `a8d08f1`(v3.4.5)、`00d5220`(v3.1)、封版前 `2e5c98a`、
  `Code.gs.backup-original`、`backups/Code.Task*.gs`
