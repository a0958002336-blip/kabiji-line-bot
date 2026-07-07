'use strict';
/* 每日試算表備份 dailyBackup 回歸測試
 * ---------------------------------------------------------------------------
 * 驗證「可測邏輯」（不連真 Drive；DriveApp/ScriptApp 以 harness mock 注入）：
 *   - 命名規則 backupFileName / isBackupFileName（safety：只認自己的備份檔名）
 *   - 保留 14 份的刪除判斷 backupsToDelete（只刪備份檔、只刪超量的最舊者）
 *   - dailyBackup 端到端：自動建資料夾、複製、清理超量、絕不碰非備份檔、失敗通知老闆
 *   - setupBackupTrigger：建立每日觸發器、且重複執行不重覆建立
 * 跑法：node tests/golden/run_backup.js（任一 FAIL → exit 1）
 * 註：真實 Drive API（實際複製/刪除檔案、權限）需部署後在 GAS 手動執行驗證。
 */
const { createEnv } = require('./harness');
const FOLDER = '卡比集機器人備份';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

/* ---------- A. 命名規則 ---------- */
(function () {
  const env = createEnv();
  const bfn = env.fns.backupFileName, isb = env.fns.isBackupFileName;
  const name = bfn(new Date(2026, 6, 7));   // 2026-07-07
  check('A1 backupFileName 前綴＋日期', name === '卡比集總管_backup_2026-07-07', name);
  check('A2 isBackupFileName 認得自己的檔', isb('卡比集總管_backup_2026-07-07') === true, '');
  check('A3 isBackupFileName 拒絕日期不完整', isb('卡比集總管_backup_2026-7-7') === false, '');
  check('A4 isBackupFileName 拒絕別的檔（safety）', isb('卡比集資料備份_20260706') === false && isb('營運試算表') === false && isb('') === false, '');
})();

/* ---------- B. 保留 14 份的刪除判斷（純函式）---------- */
(function () {
  const env = createEnv();
  const toDel = env.fns.backupsToDelete;
  // 16 份備份（created 1..16，越大越新）＋ 2 個非備份檔
  const files = [];
  for (let i = 1; i <= 16; i++) files.push({ name: '卡比集總管_backup_2026-06-' + String(i).padStart(2, '0'), created: i });
  files.push({ name: '重要文件_勿刪', created: 999 });
  files.push({ name: '卡比集資料備份_20260601', created: 5 });   // 命名不符本規則 → 不算數
  const del = toDel(files, 14);
  check('B1 16 份備份刪最舊 2 份', del.length === 2, 'del=' + del.length);
  check('B2 刪的是最舊(created 1、2)', del.every(function (d) { return d.created === 1 || d.created === 2; }), JSON.stringify(del.map(function (d) { return d.created; })));
  check('B3 絕不刪非備份檔', del.every(function (d) { return /^卡比集總管_backup_/.test(d.name); }), JSON.stringify(del.map(function (d) { return d.name; })));

  const few = []; for (let i = 1; i <= 14; i++) few.push({ name: '卡比集總管_backup_2026-06-' + String(i).padStart(2, '0'), created: i });
  check('B4 剛好 14 份不刪', toDel(few, 14).length === 0, '');
  check('B5 少於 14 份不刪', toDel(few.slice(0, 5), 14).length === 0, '');
})();

/* ---------- C. dailyBackup 端到端（mock Drive）---------- */
(function () {
  // C-1 資料夾不存在 → 自動建立、複製 1 份
  const env = createEnv();
  const r = env.fns.dailyBackup();
  check('C1 dailyBackup 回報成功', r && r.ok === true, JSON.stringify(r));
  const folder = env.driveState.folders.filter(function (f) { return f.__name === FOLDER; })[0];
  check('C2 自動建立備份資料夾', !!folder, 'folders=' + env.driveState.folders.map(function (f) { return f.__name; }));
  check('C3 資料夾內有 1 份備份', folder && folder.__files.filter(function (x) { return !x.__trashed; }).length === 1, '');
  check('C4 備份檔名符合規則', folder && /^卡比集總管_backup_\d{4}-\d{2}-\d{2}$/.test(folder.__files[0].__name), folder && folder.__files[0].__name);
  check('C5 Logger 有記錄', env.loggerCalls.some(function (m) { return /dailyBackup/.test(m); }), '');
})();

(function () {
  // C-6 已有 14 份 → 再備份成 15 → 清掉最舊 1 份、保留 14；非備份檔不動
  const env = createEnv();
  env.fns.dailyBackup();                                   // 先建資料夾
  const folder = env.driveState.folders.filter(function (f) { return f.__name === FOLDER; })[0];
  // 手動塞到共 14 份（已有 1，補 13）＋ 1 個非備份檔
  function stubFile(nm, created) {
    const o = { __name: nm, __created: created, __trashed: false };
    o.getName = function () { return o.__name; };
    o.getDateCreated = function () { return { getTime: function () { return o.__created; } }; };
    o.setTrashed = function (t) { o.__trashed = !!t; return o; };
    return o;
  }
  folder.__files.push(stubFile('老闆的私人檔_勿刪', 0));
  for (let i = 0; i < 13; i++) {
    folder.__files.push(stubFile('卡比集總管_backup_2026-05-' + String(i + 1).padStart(2, '0'), 100 + i));
  }
  const before = folder.__files.filter(function (x) { return !x.__trashed; }).length;   // 15（14 備份 + 1 私人）
  const r = env.fns.dailyBackup();                          // 新增 1 → 16 → 刪 1 → 15
  const liveBackups = folder.__files.filter(function (x) { return !x.__trashed && /^卡比集總管_backup_/.test(x.__name); });
  const privateAlive = folder.__files.some(function (x) { return x.__name === '老闆的私人檔_勿刪' && !x.__trashed; });
  check('C6 保留恰 14 份備份', liveBackups.length === 14, 'live=' + liveBackups.length + ' before=' + before);
  check('C7 私人檔未被刪（safety）', privateAlive, '');
  check('C8 回報有清理', r && r.removed >= 1, JSON.stringify(r));
})();

(function () {
  // C-9 失敗 → notifyOwner 通知老闆、回報 ok:false
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', 'U_OWNER');
  env.driveState.failCopy = true;
  const r = env.fns.dailyBackup();
  check('C9 失敗回報 ok:false', r && r.ok === false, JSON.stringify(r));
  const pushed = env.urlFetchCalls.some(function (c) { return /\/message\/push/.test(c.url) && /備份失敗/.test(c.opts.payload); });
  check('C10 失敗時 notifyOwner 通知老闆', pushed, 'urlFetchCalls=' + env.urlFetchCalls.length);
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
console.log('\n========== 每日試算表備份 dailyBackup 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
