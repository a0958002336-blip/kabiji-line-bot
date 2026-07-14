/**
 * Golden 回歸測試 harness（B2 / QA）
 * ---------------------------------------------------------------------------
 * 目的：在純 node 環境下載入正式營運程式 `卡比集機器人.gs` 的**純函式**來測試，
 *       完全不修改 .gs（唯讀參考）。
 *
 * 手法：
 *   1. 讀取 .gs 原始碼字串。
 *   2. 建立一組「不連線、可記錄呼叫」的 GAS 全域 mock
 *      （SpreadsheetApp / PropertiesService / LockService / UrlFetchApp /
 *        ContentService / CacheService / Logger / Utilities）。
 *   3. 用 `new Function(...)`，把上述 mock 當參數注入，在該 scope 下 eval .gs，
 *      並在原始碼尾端「附加」一段 return，把要測的函式匯出。
 *      （附加 return 不算修改 .gs — 原始檔完全沒動。）
 *   4. 每次 createEnv() 產生一份全新、互相隔離的 mock 狀態，避免測試互相污染。
 *
 * 無法純測 / 已跳過的函式（相依真實 I/O，硬測需連 Google 服務）：
 *   - replyToLine / notifyOwner：走 UrlFetchApp 打 LINE API（已 stub 成記錄呼叫，
 *     不真的連線；可驗「有沒有嘗試回覆」，但無法驗 LINE 端結果）。
 *   - doPost：需真實 HTTP event，且僅是 handleEvent 的外殼，跳過。
 *   - 任何 setColumnWidth / setFrozenRows / 字型格式化：stub 成 no-op（GAS UI 專用，
 *     node 無意義）。
 *   詳見 README.md「跳過清單」。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GS_PATH = path.join(__dirname, '..', '..', '卡比集機器人.gs');

/** 要從 .gs 匯出、供測試取用的頂層函式名。 */
const EXPORT_NAMES = [
  'parseShipping',
  'getPerm',
  'appendAttendance',
  'handleEvent',
  'parseCommand',
  'getVendors',
  'getCarrierMap',
  'isGrade',
  'nextHasItem',
  'addGroupId',
  'listProp',
  'getSheet',
  'isAdmin',
  'looksLikeWrite',
  'looksLikeChat',
  // ---- 員工姓名正規化 SSOT + 各人員統計（供 run_emp_norm.js 回歸測試）----
  'normalizeEmployeeName',
  'stripEmpTime',
  'empAlias',
  'buildAliasIndex',
  'setEmployeeAliases',
  'setEmpAlias',
  'attendanceStats',
  'evaluation',
  'dutyAll',
  'dutyQuery',
  'loanQuery',
  'hireQuery',
  'handleDuty',
  'recordLoan',
  'recordHire',
  'classifyIntent',
  'intentAllowsWrite',
  'handleFreezerCmd',
  'freezerBalanceOf',
  'doPost',
  'isWholeIce',
  'isValidEmpName',
  'splitForLine',
  'safeReply',
  'recvDetect',
  'receivableQuery',
  'receivableDetail',
  'recvCleanup',
  'recvRowId',
  // ---- 每日試算表備份（DriveApp/ScriptApp；純邏輯可測，實際 Drive 操作以 mock 驗證）----
  'dailyBackup',
  'setupBackupTrigger',
  'backupFileName',
  'isBackupFileName',
  'shouldRemindCleanup',
  // ---- v3.1：收款人指定 / 鐵架代號制 ----
  'receivableAssign',
  'nextRackCode',
  'rackNet',
  'handleRackCodeCollect',
  'migrateRackCodes',
  'rackOutstanding',
  // ---- v3.2：計價單日期戳 / 台子誤記掃描 / 代號收回防護 ----
  'dateStampOn',
  'summarizeAmount',
  'scanTaiziAnomalies',
  'codedOutstandingFor',
  'stripVendors',
  'shippingCleanSummary',
];

/* ------------------------------------------------------------------ */
/* GAS 全域 mock 工廠                                                   */
/* ------------------------------------------------------------------ */

// 讓任何未實作的方法都變成「回傳自己」的鏈式 no-op，避免格式化/UI 呼叫爆掉。
function chainable(real) {
  const proxy = new Proxy(real, {
    get(t, p) {
      if (p in t) return t[p];
      return function () { return proxy; };
    },
  });
  return proxy;
}

function makeRange(rows, args) {
  const numericStart = typeof args[0] === 'number';
  const startRow = numericStart ? args[0] : 1;
  const startCol = (numericStart && typeof args[1] === 'number') ? args[1] : 1;
  const numRows = (numericStart && typeof args[2] === 'number') ? args[2] : (rows.length || 1);
  const numCols = (numericStart && typeof args[3] === 'number') ? args[3] : 1;
  const real = {
    getValues() {
      const out = [];
      for (let i = 0; i < numRows; i++) {
        const row = rows[startRow - 1 + i] || [];
        const o = [];
        for (let j = 0; j < numCols; j++) o.push(row[startCol - 1 + j]);
        out.push(o);
      }
      return out;
    },
    getValue() {
      const row = rows[startRow - 1] || [];
      return row[startCol - 1];
    },
    setValues(vals) {
      for (let i = 0; i < vals.length; i++) rows[startRow - 1 + i] = vals[i].slice();
      return rangeProxy;
    },
    setValue(v) {
      if (!rows[startRow - 1]) rows[startRow - 1] = [];
      rows[startRow - 1][startCol - 1] = v;
      return rangeProxy;
    },
  };
  var rangeProxy = chainable(real);
  return rangeProxy;
}

function makeSheet(name) {
  const rows = []; // 含表頭；由 .gs 的 getSheet() 在建立後自行 appendRow(表頭)
  const real = {
    __name: name,
    __rows: rows,
    getName() { return name; },
    appendRow(arr) { rows.push(arr.slice()); return sheetProxy; },
    getLastRow() { return rows.length; },
    getLastColumn() { return rows.length ? rows[0].length : 0; },
    getMaxRows() { return Math.max(rows.length, 1000); },
    getMaxColumns() { return 26; },
    getDataRange() {
      return { getValues() { return rows.map(r => r.slice()); } };
    },
    getRange() { return makeRange(rows, arguments); },
    deleteRow(r) { rows.splice(r - 1, 1); return sheetProxy; },
    deleteRows(start, num) { rows.splice(start - 1, num); return sheetProxy; },
    clear() { rows.length = 0; return sheetProxy; },
  };
  var sheetProxy = chainable(real);
  return sheetProxy;
}

function createEnv() {
  const props = Object.create(null);
  const sheets = Object.create(null);
  const urlFetchCalls = [];
  const loggerCalls = [];
  const consoleErrors = [];

  const scriptProps = {
    getProperty(k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
    setProperty(k, v) { props[k] = String(v); return scriptProps; },
    deleteProperty(k) { delete props[k]; return scriptProps; },
    getProperties() { return Object.assign({}, props); },
    setProperties(obj) { Object.keys(obj || {}).forEach(k => { props[k] = String(obj[k]); }); return scriptProps; },
  };

  const PropertiesService = {
    getScriptProperties() { return scriptProps; },
    getUserProperties() { return scriptProps; },
    getDocumentProperties() { return scriptProps; },
  };

  const ssState = { copies: [], failCopy: false };
  const spreadsheet = chainable({
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) { const s = makeSheet(n); sheets[n] = s; return s; },
    getId() { return 'mock-sheet-id'; },
    getName() { return '卡比集總管'; },
    copy(name) { if (ssState.failCopy) throw new Error('mock 試算表 copy 失敗'); ssState.copies.push(name); return chainable({ getId() { return 'copy-' + ssState.copies.length; }, getName() { return name; } }); },
  });

  const SpreadsheetApp = {
    openById() { return spreadsheet; },
    openByUrl() { return spreadsheet; },
    getActiveSpreadsheet() { return spreadsheet; },
  };

  const LockService = {
    getScriptLock() { return { tryLock: () => true, waitLock: () => true, releaseLock: () => {}, hasLock: () => true }; },
    getUserLock() { return this.getScriptLock(); },
  };

  const UrlFetchApp = {
    fetch(url, opts) {
      urlFetchCalls.push({ url, opts });
      return {
        getContentText: () => '{}',
        getResponseCode: () => 200,
        getResponseHeaders: () => ({}),
        getBlob: () => ({}),
      };
    },
  };

  const ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput(s) {
      const out = { __content: s, setMimeType() { return out; }, getContent() { return s; } };
      return out;
    },
  };

  const _cacheStore = Object.create(null);
  const _cacheObj = {
    get(k) { return (k in _cacheStore) ? _cacheStore[k] : null; },
    put(k, v) { _cacheStore[k] = String(v); },
    remove(k) { delete _cacheStore[k]; },
    getAll() { return Object.assign({}, _cacheStore); },
    putAll(o) { Object.keys(o || {}).forEach(function (k) { _cacheStore[k] = String(o[k]); }); },
  };
  const CacheService = {
    getScriptCache() { return _cacheObj; },
    getUserCache() { return _cacheObj; },
    getDocumentCache() { return _cacheObj; },
  };

  const Logger = {
    log(m) { loggerCalls.push(String(m)); },
    clear() { loggerCalls.length = 0; },
    getLog() { return loggerCalls.join('\n'); },
  };

  /* ---- DriveApp mock（stateful，供 dailyBackup 測試；不連真 Drive）---- */
  let __driveSeq = 0;
  function makeDriveFile(fname) {
    __driveSeq += 1; const created = __driveSeq;
    const f = {
      __name: fname, __created: created, __trashed: false,
      getName() { return f.__name; },
      getId() { return 'file-' + created; },
      getDateCreated() { return { getTime() { return f.__created; } }; },
      setTrashed(t) { f.__trashed = !!t; return f; },
      makeCopy(copyName, targetFolder) { if (driveState.failCopy) throw new Error('mock Drive makeCopy 失敗'); const c = makeDriveFile(copyName); targetFolder.__files.push(c); return c; },
    };
    return f;
  }
  function makeDriveFolder(name) {
    const folder = {
      __name: name, __files: [],
      getName() { return name; },
      getId() { return 'folder-' + name; },
      getFiles() { const live = folder.__files.filter(function (x) { return !x.__trashed; }); let i = 0; return { hasNext() { return i < live.length; }, next() { return live[i++]; } }; },
    };
    return folder;
  }
  const driveState = { folders: [], filesById: Object.create(null) };
  const DriveApp = {
    getFoldersByName(n) { const m = driveState.folders.filter(function (f) { return f.__name === n; }); let i = 0; return { hasNext() { return i < m.length; }, next() { return m[i++]; } }; },
    createFolder(n) { const f = makeDriveFolder(n); driveState.folders.push(f); return f; },
    getFileById(id) { if (!driveState.filesById[id]) driveState.filesById[id] = makeDriveFile('SOURCE_' + id); return driveState.filesById[id]; },
  };

  /* ---- ScriptApp mock（觸發器，供 setupBackupTrigger 測試）---- */
  const triggers = [];
  const ScriptApp = {
    getProjectTriggers() { return triggers.slice(); },
    newTrigger(fn) {
      const spec = { fn: fn, hour: null, minute: null, days: null };
      const builder = {
        timeBased() { return builder; },
        everyDays(n) { spec.days = n; return builder; },
        atHour(h) { spec.hour = h; return builder; },
        nearMinute(m) { spec.minute = m; return builder; },
        create() { const t = { __spec: spec, getHandlerFunction() { return fn; } }; triggers.push(t); return t; },
      };
      return builder;
    },
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  const Utilities = {
    // 極簡日期格式化：足以支撐 nowStr / ymdStr 等（測試不對時間值做斷言）
    formatDate(date, tz, fmt) {
      const d = (date instanceof Date) ? date : new Date();
      return String(fmt)
        .replace(/yyyy/g, d.getFullYear())
        .replace(/MM/g, pad(d.getMonth() + 1))
        .replace(/dd/g, pad(d.getDate()))
        .replace(/HH/g, pad(d.getHours()))
        .replace(/mm/g, pad(d.getMinutes()))
        .replace(/ss/g, pad(d.getSeconds()))
        .replace(/M/g, d.getMonth() + 1)
        .replace(/d/g, d.getDate());
    },
    getUuid() { return 'mock-uuid-' + Math.random().toString(16).slice(2); },
    sleep() {},
    base64Encode(s) { return Buffer.from(String(s)).toString('base64'); },
    base64Decode(s) { return Buffer.from(String(s), 'base64').toString(); },
    jsonParse(s) { return JSON.parse(s); },
    jsonStringify(o) { return JSON.stringify(o); },
  };

  const mockConsole = {
    log() {},
    info() {},
    warn() {},
    error(...a) { consoleErrors.push(a.map(String).join(' ')); },
  };

  // 讀取 .gs，尾端附加 return（不動原始檔）
  const src = fs.readFileSync(GS_PATH, 'utf8');
  const returnStmt =
    '\n;return {' +
    EXPORT_NAMES.map(n => `${n}: (typeof ${n} !== "undefined" ? ${n} : undefined)`).join(',') +
    '};';

  const factory = new Function(
    'SpreadsheetApp', 'PropertiesService', 'LockService', 'UrlFetchApp',
    'ContentService', 'CacheService', 'Logger', 'Utilities', 'console',
    'DriveApp', 'ScriptApp',
    src + returnStmt
  );

  const fns = factory(
    SpreadsheetApp, PropertiesService, LockService, UrlFetchApp,
    ContentService, CacheService, Logger, Utilities, mockConsole,
    DriveApp, ScriptApp
  );

  return { fns, props, sheets, urlFetchCalls, loggerCalls, consoleErrors, scriptProps, driveState, triggers, ssState };
}

module.exports = { createEnv, GS_PATH, EXPORT_NAMES };
