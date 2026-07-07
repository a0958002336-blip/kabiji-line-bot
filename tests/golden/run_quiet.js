'use strict';
/* 安靜模式回歸測試（分群獨立 + 全域開關 + unknown 提示尊重安靜）
 * ---------------------------------------------------------------------------
 * 需求（授權解凍任務）：
 *   1. QUIET 由全域單一開關改為 per-群組（QUIET_GROUPS）。#安靜／#取消安靜 只影響當前群組。
 *   2. 老闆專用全域開關：#全部安靜／#全部取消安靜（isAdmin 檢查）。
 *   3. 「⚠️ 無法判斷指令」提示必須尊重安靜模式：該群安靜時 unknown 一律靜默（不寫入不變）。
 *   4. 安靜只壓 unknown 與非必要提示，不壓功能回覆（查冰庫／#待收款／打卡 照常回覆）。
 *   5. 判定/寫入邏輯完全不動 —— 原有誤觸案例維持不寫入。
 * 跑法：node tests/golden/run_quiet.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', NOTBOSS = 'U_STRANGER';
const A = 'G_A', B = 'G_B';
const ERP = ['寄運資料', '出勤打卡', '外勤補貼', '財務改價', '冰庫寄存', '台子庫存', '鐵架庫存', '退貨紀錄', '員工借支', '入職時間', '冰庫總量', '待收款'];
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

function newEnv() {
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', A + ',' + B);   // 兩群皆管理群組（可寫入）
  return env;
}
function erp(env) { let n = 0; ERP.forEach(function (s) { if (env.sheets[s]) n += Math.max(0, env.sheets[s].__rows.length - 1); }); return n; }
function send(env, text, group, uid) {
  const before = env.urlFetchCalls.length;
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: group, userId: uid || OWNER } };
  let err = null; try { env.fns.handleEvent(ev); } catch (e) { err = String(e && e.message || e); }
  const replies = env.urlFetchCalls.slice(before)
    .filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('|'); } catch (e) { return '<?>'; } });
  return { replies: replies, err: err };
}
function replied(r) { return r.replies.length > 0; }
function hasUnknownPrompt(r) { return r.replies.some(function (t) { return /無法判斷指令/.test(t); }); }

const SPEED = '招遠出20件河初秋';   // 員工日常出貨速記 → 判不出指令、不寫入

/* ---------- a. A 群 #安靜 → 速記靜默且不寫入；B 群同句仍回提示 ---------- */
(function () {
  const env = newEnv();
  const on = send(env, '#安靜', A);
  check('a0 #安靜 回覆註明本群組', on.replies.some(function (t) { return /本群組/.test(t) && /安靜/.test(t); }), JSON.stringify(on.replies));

  let before = erp(env);
  const a = send(env, SPEED, A);
  check('a1 A群安靜：速記靜默', !replied(a), JSON.stringify(a.replies));
  check('a1w A群安靜：不寫入', erp(env) - before === 0, 'delta=' + (erp(env) - before));

  before = erp(env);
  const b = send(env, SPEED, B);
  check('a2 B群未安靜：仍回⚠️提示', hasUnknownPrompt(b), JSON.stringify(b.replies));
  check('a2w B群：不寫入（行為不變）', erp(env) - before === 0, 'delta=' + (erp(env) - before));
})();

/* ---------- b. A 群 #取消安靜 → 恢復提示 ---------- */
(function () {
  const env = newEnv();
  send(env, '#安靜', A);
  const off = send(env, '#取消安靜', A);
  check('b0 #取消安靜 回覆註明已取消', off.replies.some(function (t) { return /取消/.test(t); }), JSON.stringify(off.replies));
  const a = send(env, SPEED, A);
  check('b1 A群取消安靜後恢復⚠️提示', hasUnknownPrompt(a), JSON.stringify(a.replies));
})();

/* ---------- c. #全部安靜 全域開關（isAdmin 檢查）---------- */
(function () {
  const env = newEnv();
  const denied = send(env, '#全部安靜', A, NOTBOSS);
  check('c1 非老闆 #全部安靜 → 被拒', denied.replies.some(function (t) { return /僅限老闆/.test(t); }), JSON.stringify(denied.replies));
  check('c1b 非老闆 #全部安靜 → 未開啟全域', env.scriptProps.getProperty('QUIET_ALL') !== '1', String(env.scriptProps.getProperty('QUIET_ALL')));

  const env2 = newEnv();
  send(env2, '#全部安靜', A);                       // 老闆開全域
  const gA = send(env2, SPEED, A);
  const gB = send(env2, SPEED, B);
  check('c2 全域安靜：A 群靜默', !replied(gA), JSON.stringify(gA.replies));
  check('c3 全域安靜：B 群也靜默', !replied(gB), JSON.stringify(gB.replies));
  send(env2, '#全部取消安靜', A);
  const gA2 = send(env2, SPEED, A);
  check('c4 #全部取消安靜後恢復提示', hasUnknownPrompt(gA2), JSON.stringify(gA2.replies));
})();

/* ---------- d. 安靜群內功能回覆照常（查冰庫 / #待收款 / 打卡）---------- */
(function () {
  const env = newEnv();
  send(env, '#安靜', A);
  const q = send(env, '查冰庫', A);
  check('d1 安靜群 查冰庫 照常回覆', replied(q), JSON.stringify(q.replies));
  const rc = send(env, '#待收款', A);
  check('d2 安靜群 #待收款 照常回覆', replied(rc), JSON.stringify(rc.replies));
  const before = erp(env);
  const punch = send(env, '小明 上班', A);
  check('d3 安靜群 打卡 照常回覆', punch.replies.some(function (t) { return /已登記/.test(t); }), JSON.stringify(punch.replies));
  check('d3w 安靜群 打卡 仍寫入出勤', erp(env) - before === 1, 'delta=' + (erp(env) - before));
})();

/* ---------- e. 原有誤觸案例維持不寫入（安靜/非安靜皆然）---------- */
['明天要收300件', '1828\n50件', '老闆上班了嗎'].forEach(function (t, i) {
  const env = newEnv();
  let before = erp(env);
  send(env, t, A);
  check('e' + (i + 1) + ' 非安靜「' + t.replace(/\n/g, '⏎') + '」不寫入', erp(env) - before === 0, 'delta=' + (erp(env) - before));

  const env2 = newEnv();
  send(env2, '#安靜', A);
  before = erp(env2);
  send(env2, t, A);
  check('e' + (i + 1) + 'q 安靜「' + t.replace(/\n/g, '⏎') + '」不寫入', erp(env2) - before === 0, 'delta=' + (erp(env2) - before));
});

/* ---------- 報告 ---------- */
console.log('\n========== 安靜模式回歸測試（分群獨立 + 全域 + unknown）==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
