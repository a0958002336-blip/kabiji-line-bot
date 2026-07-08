'use strict';
/* 每日試算表備份 dailyBackup 回歸測試（零新增權限版）
 * ---------------------------------------------------------------------------
 * 驗證：
 *   - 命名規則 backupFileName / isBackupFileName
 *   - 每週清理提醒判斷 shouldRemindCleanup（純函式）
 *   - dailyBackup 端到端（用 SpreadsheetApp.copy mock）：複製一份、檔名正確、**完全不碰 DriveApp**、
 *     每週提醒老闆一次、同日不重複提醒、失敗通知老闆、提醒失敗不影響備份
 *   - setupBackupTrigger：建立每日觸發器、重複執行不重覆建立
 * 跑法：node tests/golden/run_backup.js（任一 FAIL → exit 1）
 * 註：真實「試算表複製」需部署後在 GAS 手動執行 dailyBackup 驗證（僅需既有試算表權限，無新授權）。
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function pushes(env, re) { return env.urlFetchCalls.filter(function (c) { return /\/message\/push/.test(c.url) && (!re || re.test(c.opts.payload)); }).length; }

/* ---------- A. 命名規則 ---------- */
(function () {
  const env = createEnv();
  const bfn = env.fns.backupFileName, isb = env.fns.isBackupFileName;
  check('A1 backupFileName 前綴＋日期', bfn(new Date(2026, 6, 7)) === '卡比集總管_backup_2026-07-07', bfn(new Date(2026, 6, 7)));
  check('A2 isBackupFileName 認得自己的檔', isb('卡比集總管_backup_2026-07-07') === true, '');
  check('A3 isBackupFileName 拒絕格式不符', isb('卡比集總管_backup_2026-7-7') === false && isb('營運試算表') === false && isb('') === false, '');
})();

/* ---------- B. 每週清理提醒判斷（純函式）---------- */
(function () {
  const s = createEnv().fns.shouldRemindCleanup;
  check('B1 從未提醒過 → 要提醒', s('', '2026-07-07') === true, '');
  check('B2 同一天 → 不提醒', s('2026-07-07', '2026-07-07') === false, '');
  check('B3 距 7 天 → 要提醒', s('2026-06-30', '2026-07-07') === true, '');
  check('B4 距 6 天 → 不提醒', s('2026-07-01', '2026-07-07') === false, '');
  check('B5 日期無法解析 → 要提醒（保守）', s('壞資料', '2026-07-07') === true, '');
})();

/* ---------- C. dailyBackup 端到端（SpreadsheetApp.copy mock）---------- */
(function () {
  // C-1 基本成功：複製一份、檔名正確、不碰 DriveApp
  const env = createEnv();
  const r = env.fns.dailyBackup();
  check('C1 dailyBackup 回報成功', r && r.ok === true, JSON.stringify(r));
  check('C2 複製整份試算表 1 份', env.ssState.copies.length === 1, JSON.stringify(env.ssState.copies));
  check('C3 複本檔名符合規則', /^卡比集總管_backup_\d{4}-\d{2}-\d{2}$/.test(env.ssState.copies[0]), env.ssState.copies[0]);
  check('C4 完全不使用 DriveApp（零新增權限）', env.driveState.folders.length === 0, 'folders=' + env.driveState.folders.length);
  check('C5 Logger 有成功記錄', env.loggerCalls.some(function (m) { return /dailyBackup 完成/.test(m); }), '');
})();

(function () {
  // C-6/7 每週提醒：首次提醒老闆，同日再跑不重複
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  const r1 = env.fns.dailyBackup();
  check('C6 首次備份 → 提醒老闆整理', r1.reminded === true && pushes(env, /每週備份提醒/) === 1, 'reminded=' + r1.reminded + ' push=' + pushes(env, /每週備份提醒/));
  check('C6b 已記錄提醒日期', !!env.scriptProps.getProperty('BACKUP_CLEAN_REMINDER'), String(env.scriptProps.getProperty('BACKUP_CLEAN_REMINDER')));
  const r2 = env.fns.dailyBackup();
  check('C7 同日再備份 → 不重複提醒', r2.reminded === false && pushes(env, /每週備份提醒/) === 1, 'reminded=' + r2.reminded + ' push=' + pushes(env, /每週備份提醒/));
  check('C7b 仍照常備份（第二份）', env.ssState.copies.length === 2 && r2.ok === true, JSON.stringify(env.ssState.copies));
})();

(function () {
  // C-8 失敗 → notifyOwner「備份失敗」、ok:false、未產生複本
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.ssState.failCopy = true;
  const r = env.fns.dailyBackup();
  check('C8 失敗回報 ok:false', r && r.ok === false, JSON.stringify(r));
  check('C9 失敗時通知老闆（備份失敗）', pushes(env, /備份失敗/) === 1, 'push=' + pushes(env, /備份失敗/));
  check('C10 失敗時無複本產生', env.ssState.copies.length === 0, JSON.stringify(env.ssState.copies));
})();

(function () {
  // C-11 無老闆（notifyOwner 靜默）→ 備份仍成功（提醒絕不影響備份）
  const env = createEnv();
  const r = env.fns.dailyBackup();
  check('C11 無老闆時備份仍成功', r && r.ok === true && env.ssState.copies.length === 1, JSON.stringify(r));
})();

/* ---------- D. setupBackupTrigger ---------- */
(function () {
  const env = createEnv();
  const r1 = env.fns.setupBackupTrigger();
  check('D1 首次建立觸發器', r1 && r1.created === true && env.triggers.length === 1, JSON.stringify(r1) + ' n=' + env.triggers.length);
  check('D2 觸發器指向 dailyBackup', env.triggers[0] && env.triggers[0].getHandlerFunction() === 'dailyBackup', '');
  check('D3 時間約 23:30、每日', env.triggers[0] && env.triggers[0].__spec.hour === 23 && env.triggers[0].__spec.minute === 30 && env.triggers[0].__spec.days === 1, JSON.stringify(env.triggers[0] && env.triggers[0].__spec));
  const r2 = env.fns.setupBackupTrigger();
  check('D4 重複執行不重覆建立', r2 && r2.created === false && env.triggers.length === 1, JSON.stringify(r2) + ' n=' + env.triggers.length);
})();

/* ---------- 報告 ---------- */
console.log('\n========== 每日試算表備份 dailyBackup 回歸測試（零新增權限版）==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
