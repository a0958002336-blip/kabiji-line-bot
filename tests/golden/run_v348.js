'use strict';
/* v3.4.8 回歸測試：#備份狀態
 *  背景：每日備份不會自己開，且完全沒有查詢管道——只能貼腳本進 GAS 或人工翻 Drive，
 *        導致「以為有在跑其實沒跑」很久沒被發現（自 v3.4.5 起連三次封版都掛著「待啟用」）。
 *  ① dailyBackup 成功時記錄 BACKUP_LAST_OK（時間|檔名|fileId），失敗時記 BACKUP_LAST_ERR。
 *  ② backupStatus() 讀觸發器與 Script Property 組出狀態，唯讀。
 *  ③ 路由 #備份狀態 限老闆（內容含備份檔連結）。
 *  ④ 不回歸：既有 dailyBackup 行為（複製/提醒/失敗通知/零 DriveApp）不得改變。
 * 跑法：node tests/golden/run_v348.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', OTHER = 'U_OTHER', G = 'G_ADMIN';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, uid) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}

/* ========== ① dailyBackup 留下可查的紀錄 ========== */
(function () {
  const env = mkEnv();
  const r = env.fns.dailyBackup();
  const ok = env.scriptProps.getProperty('BACKUP_LAST_OK');
  check('①1 備份成功仍回報 ok（不回歸）', r && r.ok === true, JSON.stringify(r));
  check('①2 成功後寫入 BACKUP_LAST_OK', !!ok, String(ok));
  check('①3 BACKUP_LAST_OK 為 時間|檔名|fileId 三段', ok && String(ok).split('|').length === 3, String(ok));
  check('①4 含正確檔名', ok && /卡比集總管_backup_\d{4}-\d{2}-\d{2}/.test(String(ok).split('|')[1]), String(ok));
  check('①5 含 fileId（來自 copy() 回傳物件，非 DriveApp）', ok && !!String(ok).split('|')[2], String(ok));
  check('①6 未寫入 BACKUP_LAST_ERR', !env.scriptProps.getProperty('BACKUP_LAST_ERR'), String(env.scriptProps.getProperty('BACKUP_LAST_ERR')));
  check('①7 仍然零 DriveApp（不回歸）', env.driveState.folders.length === 0, 'folders=' + env.driveState.folders.length);
})();
(function () {
  const env = mkEnv();
  env.ssState.failCopy = true;
  const r = env.fns.dailyBackup();
  const err = env.scriptProps.getProperty('BACKUP_LAST_ERR');
  check('①8 備份失敗仍回報 ok:false（不回歸）', r && r.ok === false, JSON.stringify(r));
  check('①9 失敗後寫入 BACKUP_LAST_ERR', !!err, String(err));
  check('①10 BACKUP_LAST_ERR 含錯誤訊息', err && /copy 失敗/.test(String(err)), String(err));
  check('①11 失敗時不寫 BACKUP_LAST_OK', !env.scriptProps.getProperty('BACKUP_LAST_OK'), String(env.scriptProps.getProperty('BACKUP_LAST_OK')));
})();

/* ========== ② backupStatus() 內容 ========== */
(function () {
  const env = mkEnv();
  const s = env.fns.backupStatus();
  check('②1 觸發器未建 → ❌ 並附啟用方式', /❌ 未建立/.test(s) && /setupBackupTrigger/.test(s), s);
  check('②2 無成功紀錄 → 明說可能從未執行過', /可能從未成功執行過/.test(s), s);
  check('②3 有老闆 → 顯示失敗會通知', /✅ 已設定老闆/.test(s), s);
})();
(function () {
  const env = mkEnv();
  env.fns.setupBackupTrigger();
  env.fns.dailyBackup();
  const s = env.fns.backupStatus();
  check('②4 觸發器已建 → ✅', /✅ 已建立/.test(s), s);
  check('②5 顯示最後成功時間與檔名', /最後成功/.test(s) && /卡比集總管_backup_/.test(s), s);
  check('②6 附上試算表連結（可點開驗證檔案還在不在）', /docs\.google\.com\/spreadsheets\/d\//.test(s), s);
  check('②7 無失敗紀錄時顯示（無）', /最後失敗：（無）/.test(s), s);
})();
(function () {
  const env = mkEnv();
  env.fns.setupBackupTrigger(); env.fns.setupBackupTrigger();   // 冪等：不應變成 2 個
  const s = env.fns.backupStatus();
  check('②8 重複執行 setupBackupTrigger 仍只有 1 個（冪等，不回歸）', /✅ 已建立/.test(s) && !/重複建立/.test(s), s);
})();
(function () {
  const env = createEnv();   // 刻意不設 OWNER_USER_ID
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  const s = env.fns.backupStatus();
  check('②9 未設老闆 → 明確警告收不到失敗通知＋給補救指令', /❌ 未設定老闆/.test(s) && /#註冊老闆/.test(s), s);
})();

/* ========== ③ 路由與權限 ========== */
(function () {
  const env = mkEnv();
  const rep = send(env, '#備份狀態');
  check('③1 老闆打 #備份狀態 → 回狀態', /備份狀態/.test(rep) && /觸發器 dailyBackup/.test(rep), rep);
})();
(function () {
  const env = mkEnv();
  const rep = send(env, '#備份狀態', OTHER);
  check('③2 非老闆 → 🔒 拒絕', /🔒/.test(rep) && !/觸發器 dailyBackup/.test(rep), rep);
})();
(function () {
  const env = mkEnv();
  const before = env.ssState.copies.length;
  send(env, '#備份狀態');
  check('③3 查詢為唯讀：不會觸發備份、不新增觸發器', env.ssState.copies.length === before && env.triggers.length === 0,
    'copies=' + env.ssState.copies.length + ' triggers=' + env.triggers.length);
})();

/* ========== 輸出 ========== */
console.log('\n========== v3.4.8（#備份狀態）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
if (fails) { console.log(' ✗ 有 ' + fails + ' 項 FAIL'); process.exit(1); }
console.log(' ✓ 全部 PASS（' + out.length + ' 項）');
