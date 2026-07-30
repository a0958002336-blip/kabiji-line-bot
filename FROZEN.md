# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.4.6 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `72b1b52`；`#版本` 顯示 `888a515`；`v3.4.6`）
- 封版日期：2026/07/30（v3.4.6 效能：請求內快取＋鐵架未寫「鐵架」不再靜默）
- 回歸測試：`node tests/golden/run_all.js` → 509/509 全綠
- 🚫 **本次封版後「不」部署**（老闆 2026/07/29 指示，兩個前置條件未解）：
  1. LINE 平台 7/28 起後台 500/505、webhook 未把訊息送進 GAS，機器人停擺。已確認與程式無關
     （doPost 執行紀錄全「已完成」1~4 秒、部署設定/網址/額度皆正常）。**須先確認舊版恢復正常**，
     否則新版一上，出事會分不清是 LINE 殘留狀況還是新程式 bug。
  2. **主車行名稱待確認：`旭曘` 還是 `旭陽`**。影響 `getMainCarrier()` 預設值與
     `isShippingRecord()`（非主車行整筆不記，v3.4.4 規則）。確認前不上新版。
- ⏸️ 桌面部署副本**尚未更新**（仍為 `卡比集機器人-v3.4.5.gs`），依指示等候通知
- 📦 暫存中（未併入本版，待另開一輪 review）：`stash@{0}` ＝ 寄運多行單「行內 #備註」改動
  （`parseShipping()` 9 行）＋ `tests/golden/run_v346.js`（7 案）。來源：2026/07/24 17:19 有人修改，
  動手前留有 `卡比集機器人.gs.bak_20260724_inlineNote`（內容＝當時 HEAD），但未 commit、作者待確認。
  因與變更 7 同動 `parseShipping()`，刻意不一起上，避免出事無法歸因。
- ⚠️ **部署後手動一次**：GAS 執行 `setupMeterTriggers` 啟用電錶排程（每月1號08:00早報／每日20:00追未抄），`#電錶提醒` 確認觸發器✅。電錶兩張新表(電錶設定/電費紀錄)首次用到時自動建立含 header，免手動。
- ⚠️ 部署後（沿用 v3.4.4）：寄運資料 **L1 手動填「單件重量」**（既有表不自動補 header，資料照樣寫 L 欄）；`#非旭陽寄運` 檢視舊誤存
- ⚠️ 去貨主名舊髒列仍靠顯示層遮（v3.4.3），不回溯改資料
- 桌面部署檔：`C:\Users\sqluser\Desktop\卡比集機器人-v3.4.5.gs`（**舊版，尚未更新為 v3.4.6**；
  其 sha256 `1da17aa…` 對齊的是 v3.4.5 的 HEAD，非本次）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- ⚠️ `BOT_BUILD` 規則（v3.4.6 起寫進 .gs 註解）：填**版本 commit**短 hash，非 HEAD；
  回填另開 `chore(版本)` commit，故 BOT_BUILD 恆等於 HEAD 的父/祖 commit。**禁止用 `--amend` 回填**。
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、**前一版 deploy `a8d08f1`(v3.4.5)**、
  前前版 `00d5220`(v3.1)、封版前 `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
