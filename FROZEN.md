# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.4.3 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `81b5e2b`；`#版本` 顯示 `82250eb`；`v3.4.3`）
- 封版日期：2026/07/15（v3.4.3 去貨主名補顯示層防線：所有品名輸出模板一律過 outClean，修彙總表外洩已登記貨主；冰庫總量按貨主分組刻意設計故豁免）
- 回歸測試：`node tests/golden/run_all.js` → 444/444 全綠
- ⚠️ 部署後：舊髒列(登記前存、品名欄含貨主名)靠顯示層遮，不回溯改資料；如需還原舊列「誰的貨」再評估 B 整理工具（未做）。新貨主去名沒去到時 `#新增貨主 X` 補登
- 桌面部署檔：`C:\Users\sqluser\Desktop\卡比集機器人-v3.4.3.gs`（本次；sha256 已對齊 HEAD `cdeb438…`）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、前一版 deploy `00d5220`(v3.1)、封版前 `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
