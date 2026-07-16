'use strict';
/* v3.4.4 回歸測試：寄運解析修正（含括號的複合等級「特(修清)」＋單件重量「18K」）
 * Bug：「濱江市場-張紹安 高山228 特(修清) 18K 30台 (寄旭陽)」
 *   ①「修清」被當備註、等級只剩「特」；②「18K」單件重量被整個丟棄。
 * 修法：extractGradeWeight() 先抽複合等級(結構規則：括號緊貼等級token)與重量(NK)，再走既有括號拆解；
 *       寄運資料表尾端 append「單件重量」欄；確認訊息/彙總/查詢都顯示重量。
 * 跑法：node tests/golden/run_v344.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
const SHIP = '寄運資料';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() {
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  env.scriptProps.setProperty('VENDORS', '張紹安,唐繼山');   // 已登記貨主 → 品名須去名、客戶欄原樣存
  return env;
}
function send(env, text) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function rows(env) { return env.sheets[SHIP] ? env.sheets[SHIP].__rows.slice(1) : []; }

const SRC = '濱江市場-張紹安\n高山228 特(修清) 18K 30台 (寄旭陽)';

/* ========== ① parseShipping 純解析：等級/重量/數量/品名/客戶全對 ========== */
(function () {
  const env = mkEnv();
  const r = env.fns.parseShipping(SRC).records[0];
  check('①1 等級=特(修清)（含括號完整等級名）', r && r.grade === '特(修清)', JSON.stringify(r));
  check('①2 單件重量=18K（不再被丟棄）', r && r.weight === '18K', JSON.stringify(r));
  check('①3 數量=30、單位=台', r && r.qty === '30' && r.unit === '台', JSON.stringify(r));
  check('①4 品名=高山228（不含貨主名張紹安）', r && r.name === '高山228', JSON.stringify(r));
  check('①5 客戶=濱江市場-張紹安', r && r.customer === '濱江市場-張紹安', JSON.stringify(r));
  check('①6 修清不在備註（bug 修正）', r && !/修清/.test(r.note || ''), JSON.stringify(r));
  check('①7 物流=旭陽', r && r.logistics === '旭陽', JSON.stringify(r));
})();

/* ========== ② 端到端寫入：寄運資料表欄位（含新「單件重量」欄）＋確認訊息顯示 ========== */
(function () {
  const env = mkEnv();
  const rep = send(env, SRC);
  const row = rows(env)[0];
  check('②1 已寫入一筆', !!row, JSON.stringify(rows(env)));
  check('②2 客戶欄(col1)=濱江市場-張紹安（原樣存）', row && row[1] === '濱江市場-張紹安', JSON.stringify(row));
  check('②3 品名欄(col3)=高山228（去貨主名）', row && row[3] === '高山228', JSON.stringify(row));
  check('②4 等級欄(col4)=特(修清)', row && row[4] === '特(修清)', JSON.stringify(row));
  check('②5 件數欄(col5)=30、單位欄(col10)=台', row && String(row[5]) === '30' && row[10] === '台', JSON.stringify(row));
  check('②6 單件重量欄(col11)=18K', row && row[11] === '18K', JSON.stringify(row));
  check('②7 確認訊息含 特(修清)/18K/高山228', /特\(修清\)/.test(rep) && /18K/.test(rep) && /高山228/.test(rep), rep);
})();

/* ========== ③ 彙總＋查詢顯示重量：格式「高山228 特(修清) 18K 30台」 ========== */
(function () {
  const env = mkEnv();
  const scs = env.fns.shippingCleanSummary(env.fns.parseShipping(SRC).records);
  check('③1 彙總格式含「高山228 特(修清) 18K 30台」', /高山228 特\(修清\) 18K 30台/.test(scs), scs);
  send(env, SRC);
  const pull = env.fns.shippingPull('旭陽', '');
  check('③2 查詢(shippingPull)顯示重量 18K', /特\(修清\)/.test(pull) && /18K/.test(pull), pull);
})();

/* ========== ④ 場外解析 parseShipItem 一致支援複合等級＋重量 ========== */
(function () {
  const env = mkEnv();
  const it = env.fns.parseShipItem('高山228 特(修清) 18K 30台', false, []);
  check('④1 parseShipItem 等級=特(修清)、重量=18K、品名=高山228', it.grade === '特(修清)' && it.weight === '18K' && it.name === '高山228', JSON.stringify(it));
})();

/* ========== ⑤ 不回歸：純等級(無括號無重量)照舊；包裝括號不誤判為等級 ========== */
(function () {
  const env = mkEnv();
  const r1 = env.fns.parseShipping('6986\n高山228 特 100件 寄旭陽').records[0];
  check('⑤1 純等級「特」照舊、無重量', r1 && r1.grade === '特' && !r1.weight && r1.name === '高山228', JSON.stringify(r1));
  // 「大(紙箱)」：等級 base 字緊貼包裝括號 → 不可被當成等級「大(紙箱)」，(紙箱)仍歸包裝
  const r2 = env.fns.parseShipItem('高山大(紙箱) 30件', false, []);
  check('⑤2 大(紙箱) 不誤判為等級、(紙箱)歸包裝', r2.grade === '' && r2.pack === '紙箱', JSON.stringify(r2));
  // 分開的「大」等級 + (紙箱)包裝 仍正確
  const r3 = env.fns.parseShipItem('高山 大 (紙箱) 30件', false, []);
  check('⑤3 「大」等級＋(紙箱)包裝 分開時正確', r3.grade === '大' && r3.pack === '紙箱' && r3.name === '高山', JSON.stringify(r3));
})();

/* ========== ⑥ 業務規則：只記錄旭陽寄運；非旭陽(9916)裝死＋括號原文保留 ========== */
const JI9916 = '042姐姐\n唐繼山高山初秋 特 7件 (要寄車9916 要跟他說042姐姐的)';
const JIXY = '042姐姐\n唐繼山高山初秋 特 7件 (寄旭陽)';
(function () {
  // ⑥1 非旭陽 → 完全不入庫、不回應（裝死）
  const env = mkEnv();
  const rep = send(env, JI9916);
  check('⑥1 寄車9916 → 零寫入', rows(env).length === 0, JSON.stringify(rows(env)));
  check('⑥2 寄車9916 → 裝死(無回應)', rep === '', JSON.stringify(rep));
  // ⑥3 括號原文原樣保留為備註，不被拆爛
  const r = env.fns.parseShipping(JI9916).records[0];
  check('⑥3 非旭陽括號整段原文當備註(不拆爛)', r && r.note === '(要寄車9916 要跟他說042姐姐的)' && !r.logistics, JSON.stringify(r));
  check('⑥4 非旭陽記錄 isShippingRecord=false', r && env.fns.isShippingRecord(r, undefined) === false, JSON.stringify(r));
})();
(function () {
  // ⑥5 對照句 (寄旭陽) → 正常入庫且去貨主名(唐繼山)
  const env = mkEnv();
  const rep = send(env, JIXY);
  const row = rows(env)[0];
  check('⑥5 (寄旭陽) → 正常入庫 1 筆', rows(env).length === 1, JSON.stringify(rows(env)));
  check('⑥6 品名去貨主名=高山初秋(不含唐繼山)', row && row[3] === '高山初秋', JSON.stringify(row));
  check('⑥7 物流=旭陽、確認訊息有回應', row && row[7] === '旭陽' && rep !== '', JSON.stringify(row) + ' rep=' + rep);
})();
(function () {
  // ⑥8 #非旭陽寄運 診斷：只列非旭陽列
  const env = mkEnv();
  const sh = env.fns.getSheet('寄運資料');
  sh.appendRow(['2026/07/16 09:00', '042姐姐', '', '高山初秋', '特', '7', '', '9916', '', '', '件', '']);
  sh.appendRow(['2026/07/16 09:01', '玉美加工廠', '', '高山228', '特', '10', '', '旭陽', '', '', '件', '']);
  const diag = env.fns.nonMainShipping();
  check('⑥8 #非旭陽寄運 列出 9916 那筆、不含旭陽那筆', /9916/.test(diag) && /高山初秋/.test(diag) && !/玉美加工廠/.test(diag), diag);
})();

console.log('\n========== v3.4.4（寄運解析：複合等級＋單件重量＋旭陽Only規則）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
