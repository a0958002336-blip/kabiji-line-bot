# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.4.5 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `a8d08f1`；`#版本` 顯示 `95fde8a`；`v3.4.5`）
- 封版日期：2026/07/16（v3.4.5 電錶月結記錄模組＋#備註防呆(裸#不再兜底、非指令回「無此指令」)）
- 回歸測試：`node tests/golden/run_all.js` → 503/503 全綠
- ⚠️ **部署後手動一次**：GAS 執行 `setupMeterTriggers` 啟用電錶排程（每月1號08:00早報／每日20:00追未抄），`#電錶提醒` 確認觸發器✅。電錶兩張新表(電錶設定/電費紀錄)首次用到時自動建立含 header，免手動。
- ⚠️ 部署後（沿用 v3.4.4）：寄運資料 **L1 手動填「單件重量」**（既有表不自動補 header，資料照樣寫 L 欄）；`#非旭陽寄運` 檢視舊誤存
- ⚠️ 去貨主名舊髒列仍靠顯示層遮（v3.4.3），不回溯改資料
- 桌面部署檔：`C:\Users\sqluser\Desktop\卡比集機器人-v3.4.5.gs`（本次；sha256 已對齊 HEAD `1da17aa…`）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、前一版 deploy `00d5220`(v3.1)、封版前 `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
