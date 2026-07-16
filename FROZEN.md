# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.4.4 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `249c105`；`#版本` 顯示 `207d277`；`v3.4.4`）
- 封版日期：2026/07/16（v3.4.4 寄運解析：複合等級「特(修清)」＋單件重量「18K」解析顯示；只記錄旭陽寄運、其他車行裝死、非旭陽括號原文原樣留備註；#非旭陽寄運 列既有誤存）
- 回歸測試：`node tests/golden/run_all.js` → 472/472 全綠
- ⚠️ **部署後手動一次**：寄運資料表**已存在**，新增的「單件重量」欄 header 不會自動補（getSheet 只在建表時寫 header）。資料照樣寫入 L 欄，但請在**寄運資料 L1 手動填「單件重量」**，對帳才有欄名。
- ⚠️ 部署後：打 `#非旭陽寄運`（限老闆）檢視舊規則誤存的非旭陽寄運，決定是否清除（新規則起這類一律裝死不記）
- ⚠️ 去貨主名舊髒列仍靠顯示層遮（v3.4.3），不回溯改資料
- 桌面部署檔：`C:\Users\sqluser\Desktop\卡比集機器人-v3.4.4.gs`（本次；sha256 已對齊 HEAD `b7e9c68…`）
- 進行中未部署：電錶月結記錄 v3.4.5（分支 `feature/電錶月結記錄`，設計已定案、尚未實作；部署手冊需加「跑一次 setupMeterTriggers」步驟）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、前一版 deploy `00d5220`(v3.1)、封版前 `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
