'use strict';
/* v3.4.3 回歸測試：顯示層去貨主名（所有品名輸出模板一律過 stripVendors）
 * 核心紅燈準則：**已登記貨主字串出現在任何 user-facing 輸出訊息 = 測試失敗**（冰庫總量 formatStockGrouped 豁免）。
 * 背景 bug：#新增貨主 劉偉民 後，「旭陽寄運資料」彙總表仍顯示「劉偉民進口高麗」——彙總直讀已存(登記前存的髒)品名欄且不去名。
 * 修法：寫入分欄乾淨(保留)＋顯示層 outClean 去名(新增，救舊髒列不動資料)；冰庫總量刻意以貨主分組故豁免。
 * 跑法：node tests/golden/run_v343.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
const SHIP = '寄運資料', FREEZER = '冰庫寄存', RETURN = '退貨紀錄', STOCK = '冰庫總量';
const V = '劉偉民';   // 已登記貨主，任何輸出都不該出現（豁免表除外）
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() {
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  env.scriptProps.setProperty('VENDORS', '劉偉民,葉瑋宸');
  return env;
}
function send(env, text) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function shRows(env) { return env.sheets[SHIP] ? env.sheets[SHIP].__rows : []; }

/* ========== ① 彙總表（reported bug）：登記前存的髒品名列，查詢時顯示層去名 ========== */
(function () {
  const env = mkEnv();
  // 先正常寫一筆乾淨寄運（劉偉民未出現在文字，寫入即乾淨）
  send(env, '6986\n進口高麗 特 180包 寄旭陽');
  const rows = shRows(env);
  check('①0 寄運已寫入一筆', rows.length >= 2, JSON.stringify(rows));
  // 模擬「貨主登記前就存進去」的髒舊列：品名欄被污染成含貨主名、貨主欄空（此為舊列特徵）
  const last = rows[rows.length - 1];
  last[3] = V + '進口高麗';   // 品名欄污染
  last[2] = '';               // 貨主欄空
  // 再查彙總（走 shippingPull）：顯示層必須把貨主名遮掉、但品名主體保留
  const rep = send(env, '旭陽寄運資料');
  check('①1 彙總表不外洩已登記貨主（紅燈準則）', rep.indexOf(V) === -1, rep);
  check('①2 彙總表仍保留品名主體(進口高麗)', /進口高麗/.test(rep), rep);
})();

/* ========== ② shippingPull 直接單元：多筆髒列彙總 ========== */
(function () {
  const env = mkEnv();
  send(env, '6986\n高山228 特 150件 寄旭陽');
  const rows = shRows(env);
  rows[rows.length - 1][3] = '葉瑋宸高山228';   // 另一個已登記貨主污染
  rows[rows.length - 1][2] = '';
  const rep = env.fns.shippingPull('旭陽', '');
  check('②1 shippingPull 去名(葉瑋宸不外洩)', rep.indexOf('葉瑋宸') === -1 && /高山228/.test(rep), rep);
})();

/* ========== ③ 冰庫寄存查詢：品名內嵌貨主 → 顯示層去名 ========== */
(function () {
  const env = mkEnv();
  const fz = env.fns.getSheet(FREEZER);
  fz.appendRow(['2026/07/15 09:00:00', '6986', V + '進口高麗', '入庫', 180, 180]);
  const rep = env.fns.freezerOverview('');
  check('③1 查冰庫不外洩已登記貨主', rep.indexOf(V) === -1, rep);
  check('③2 查冰庫仍保留品名主體', /進口高麗/.test(rep), rep);
})();

/* ========== ④ 退貨查詢：品名內嵌貨主 → 顯示層去名 ========== */
(function () {
  const env = mkEnv();
  const rt = env.fns.getSheet(RETURN);
  rt.appendRow(['2026/07/15 09:00:00', '6986', V + '高麗菜', 5, '台']);
  const rep = env.fns.returnQuery('');
  check('④1 查退貨不外洩已登記貨主', rep.indexOf(V) === -1 && /高麗菜/.test(rep), rep);
})();

/* ========== ⑤ 冰庫總量 formatStockGrouped 豁免：貨主是刻意分組維度，必須「保留」 ========== */
(function () {
  const env = mkEnv();
  const st = env.fns.getSheet(STOCK);
  st.appendRow(['2026/07/15 09:00:00', '大冰庫', V, '進口高麗', 180, '倉管']);
  const rep = env.fns.formatStockGrouped(env.fns.stockLatest('大冰庫'));
  check('⑤1 冰庫總量【豁免】仍顯示貨主分組(劉偉民保留)', rep.indexOf(V) !== -1 && /進口高麗/.test(rep), rep);
})();

/* ========== ⑥ outClean 行為：多行安全＋冪等＋不誤刪未登記 ========== */
(function () {
  const env = mkEnv();
  const oc = env.fns.outClean;
  const multi = '【6986】\n' + V + '進口高麗：180\n葉瑋宸高山228：150';
  const cleaned = oc(multi);
  check('⑥1 多行安全：換行保留(行數不變)', cleaned.split('\n').length === 3, JSON.stringify(cleaned));
  check('⑥2 多行去名：兩個已登記貨主皆移除', cleaned.indexOf(V) === -1 && cleaned.indexOf('葉瑋宸') === -1 && /進口高麗/.test(cleaned) && /高山228/.test(cleaned), JSON.stringify(cleaned));
  check('⑥3 冪等：乾淨字串再過一次不變', oc(cleaned) === cleaned, JSON.stringify(oc(cleaned)));
  check('⑥4 不誤刪未登記字（客戶/品名照舊）', oc('王小明高山228：150') === '王小明高山228：150', JSON.stringify(oc('王小明高山228：150')));
  // VENDORS 空 → 原樣返回（不動）
  env.scriptProps.setProperty('VENDORS', '');
  check('⑥5 無登記貨主時原樣返回', oc('劉偉民進口高麗') === '劉偉民進口高麗', '');
})();

console.log('\n========== v3.4.3（顯示層去貨主名・全模板紅燈）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
