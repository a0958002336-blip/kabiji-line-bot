'use strict';
/* Bug 5 寄運誤判（真實員工訊息）+ 補測項 回歸測試
 * 跑法：node tests/golden/run_bug5.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', GM = 'G_MARKET', OWNER = 'U_OWNER', OTHER = 'U_OTHER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function rows(env, s) { return env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); env.scriptProps.setProperty('MARKET_GROUP_IDS', GM); return env; }
function send(env, text, grp, uid) { env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: grp || G, userId: uid || OWNER } }); const rs = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }); return rs[rs.length - 1] || ''; }

const REAL = '文聰 上車鐵架上去\n磚志(聯)高山初秋 特 15件\n-------------------\n旭陽\n黃銘宗進口山東 中(紙箱) 6件 (送碼頭)\n-------------------';

/* ---------- Bug5：真實訊息不得誤寫 ---------- */
(function () {
  const env = mkEnv(); const r = send(env, REAL);
  check('5-1 不誤寫任何寄運', rows(env, '寄運資料').length === 0, JSON.stringify(rows(env, '寄運資料')));
  check('5-2 不誤寫鐵架', rows(env, '鐵架庫存').length === 0, JSON.stringify(rows(env, '鐵架庫存')));
  check('5-3 回無法判斷指令(fail-closed)', /無法判斷指令/.test(r), r);
})();

/* ---------- Bug5 單元：客戶行防呆 ---------- */
(function () {
  const env = mkEnv();
  const r1 = env.fns.parseShipping('文聰 上車鐵架上去\n高山初秋 特 15件');
  check('5-4 指示句不當客戶(0筆)', r1.count === 0 && r1.unresolved >= 1, JSON.stringify(r1));
  const r2 = env.fns.parseShipping('旭陽\n黃銘宗進口山東 中 6件');
  check('5-5 物流商不當客戶(0筆)', r2.count === 0, JSON.stringify(r2.records));
})();

/* ---------- 回歸：正常寄運單照常 ---------- */
(function () {
  const env = mkEnv(); send(env, '王老闆\n高麗菜 中 20件 寄旭陽');
  const rw = rows(env, '寄運資料');
  check('5-6 正常寄運單仍寫入', rw.length === 1 && String(rw[0][1]) === '王老闆', JSON.stringify(rw));
})();

/* ---------- 補測 ---------- */
(function () {
  // 1828 單獨一行
  const e1 = mkEnv(); send(e1, '1828');
  check('補-1828單行不寫入', rows(e1, '寄運資料').length === 0, JSON.stringify(rows(e1, '寄運資料')));
  // 市場群貼寄運單
  const e2 = mkEnv(); send(e2, '王老闆\n高麗菜 中 20件 寄旭陽', GM, OTHER);
  check('補-市場群寄運單0筆', rows(e2, '寄運資料').length === 0, JSON.stringify(rows(e2, '寄運資料')));
  // 員工帳號 #註冊老闆搶注
  const e3 = mkEnv(); send(e3, '#註冊老闆', G, OTHER);
  check('補-員工#註冊老闆搶注被拒', e3.scriptProps.getProperty('OWNER_USER_ID') === OWNER, e3.scriptProps.getProperty('OWNER_USER_ID'));
  // 冰庫設定校正歸0
  const e4 = mkEnv(); e4.fns.handleFreezerCmd('寄冰 客Z 高麗菜 50'); e4.fns.handleFreezerCmd('寄冰 客Z 高麗菜 取消');
  check('補-冰庫取消校正歸0', e4.fns.freezerBalanceOf('客Z', '高麗菜') === 0, String(e4.fns.freezerBalanceOf('客Z', '高麗菜')));
})();

console.log('\n========== Bug 5 + 補測 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
