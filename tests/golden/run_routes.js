'use strict';
/* 全路由回歸測試（handleEvent 主要路由，每路由至少一正一反）
 * ---------------------------------------------------------------------------
 * 目的：把「訊息 → 正確 handler → 正確資料表」鎖成回歸網，日後任何路由被別的 handler
 *       攔走或誤寫都會轉紅。涵蓋：寄運/冰庫/台子/鐵架/收款/打卡/借支/外勤/退貨/匯款/改價/查詢。
 * 正 = 該路由應寫入其資料表；反 = 形似但不該寫入（guard）。
 * 跑法：node tests/golden/run_routes.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function n(env, sheet) { return env.sheets[sheet] ? env.sheets[sheet].__rows.length - 1 : 0; }

// route: {name, pos:[msgs], neg:[msgs], sheet, replyPos:/re/}
const ROUTES = [
  { name: '寄運', pos: ['陳老闆\n高麗菜 中 20件 寄旭陽'], neg: ['好喔'], sheet: '寄運資料', replyPos: /已記錄寄運資料/ },
  { name: '冰庫', pos: ['寄冰 阿明 高麗菜 5'], neg: ['查冰庫'], sheet: '冰庫寄存', replyPos: /冰庫已更新/ },
  { name: '台子', pos: ['陳記\n南瓜 特 5件（台子）'], neg: ['查台子'], sheet: '台子庫存', replyPos: /台子出庫/ },
  { name: '鐵架', pos: ['陳記 勝山鐵架*2'], neg: ['hello'], sheet: '鐵架庫存', replyPos: /出鐵架/ },
  { name: '收款', pos: ['6986 老人田 高山228 要收款 6800'], neg: ['收台回來'], sheet: '待收款', replyPos: /已建立待收款/ },
  { name: '打卡', pos: ['小明 上班'], neg: ['老闆上班了嗎'], sheet: '出勤打卡', replyPos: /已登記/ },
  { name: '借支', pos: ['小明 上班', '小明 借 500'], neg: ['旭陽 借 500'], sheet: '員工借支', replyPos: /借 500/ },
  { name: '外勤', pos: ['小明 出外勤 台中'], neg: ['小明 出外勤了嗎'], sheet: '外勤補貼', replyPos: /出外勤/ },
  { name: '退貨', pos: ['陳記 高麗菜 退3台'], neg: ['退一步海闊天空'], sheet: '退貨紀錄', replyPos: /已記錄退貨/ },
  { name: '匯款', pos: ['陳記 匯款 5000'], neg: ['我昨天匯款很多喔'], sheet: '財務改價', replyPos: /已收到匯款/ },
  { name: '改價', pos: ['陳記 改價 高麗菜降5元'], neg: ['今天不改價了'], sheet: '財務改價', replyPos: /已收到改價/ },
];

ROUTES.forEach(function (r) {
  // 正
  const ep = mkEnv(); let rep = '';
  r.pos.forEach(function (m) { rep = send(ep, m); });
  check('正 ' + r.name + '：寫入 ' + r.sheet, n(ep, r.sheet) >= 1, 'writes=' + n(ep, r.sheet));
  check('正 ' + r.name + '：回覆符合', r.replyPos.test(rep), JSON.stringify(rep).slice(0, 120));
  // 反
  const en = mkEnv();
  r.neg.forEach(function (m) { send(en, m); });
  check('反 ' + r.name + '：不寫入 ' + r.sheet, n(en, r.sheet) === 0, 'writes=' + n(en, r.sheet));
});

/* ---------- 查詢類：回覆且不寫入任何 ERP ---------- */
const ERP = ['寄運資料', '冰庫寄存', '台子庫存', '鐵架庫存', '待收款', '出勤打卡', '員工借支', '外勤補貼', '退貨紀錄', '財務改價'];
function erpTotal(env) { return ERP.reduce(function (a, s) { return a + n(env, s); }, 0); }
[
  { q: '#待收款', re: /未收款|沒有未收款/ },
  { q: '查鐵架', re: /鐵架/ },
  { q: '查冰庫', re: /冰庫/ },
  { q: '查台子', re: /台子|沒有/ },
  { q: '指令表', re: /指令表/ },
  { q: '#收款明細', re: /收款/ },
].forEach(function (t) {
  const env = mkEnv();
  const rep = send(env, t.q);
  check('查詢 ' + t.q + '：有回覆', t.re.test(rep), JSON.stringify(rep).slice(0, 80));
  check('查詢 ' + t.q + '：零 ERP 寫入', erpTotal(env) === 0, 'erp=' + erpTotal(env));
});

/* ---------- 報告 ---------- */
console.log('\n========== 全路由回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
