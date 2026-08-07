'use strict';

/* ============================================================
   定数
   ============================================================ */

const DENSITY = 0.8;              // エタノールの比重
const SW = 1.3;                   // 顔の線の太さ（24 単位の viewBox 基準）
const LEVEL_NAMES = ['休肝日', '適量', 'やや飲み過ぎ', '飲み過ぎ', 'ダメ！'];
const HANGOVER_NAMES = { none: '普通', mild: 'やや二日酔い', severe: '二日酔い' };

const DEFAULT_SETTINGS = {
  key: 'settings',
  levels: { moderate: 24, slightlyOver: 40, over: 60 },
  targetRestDays: 15,
  monthlyTarget: null,              // null なら月の日数から自動計算する
  schemaVersion: 1,
};

const SEED = [
  ['wine', '🍷', 'ワイン', [['グラス', 125, 13], ['ハーフボトル', 375, 13], ['フルボトル', 750, 13]]],
  ['beer', '🍺', 'ビール', [['中ジョッキ', 400, 5], ['350ml缶', 350, 5], ['500ml缶', 500, 5], ['小瓶', 334, 5], ['中瓶', 500, 5]]],
  ['highball', '🥃', 'ハイボール', [['中ジョッキ', 400, 7], ['350ml缶', 350, 7], ['500ml缶', 500, 7]]],
  ['sake', '🍶', '日本酒', [['グラス', 90, 15], ['1合', 180, 15], ['四合瓶', 720, 15]]],
  ['shochu', '🍠', '焼酎', [['ロック 1杯', 60, 25], ['1合', 180, 25], ['ボトル', 720, 25]]],
  ['chuhai', '🍋', 'チューハイ / サワー', [['350ml缶', 350, 5], ['500ml缶', 500, 5], ['350ml缶 ストロング', 350, 9], ['500ml缶 ストロング', 500, 9], ['中ジョッキ', 400, 7]]],
  ['cocktail', '🍸', 'カクテル', [['カシスオレンジ', 200, 5], ['ジントニック', 250, 8], ['モスコミュール', 250, 8], ['マティーニ', 90, 30]]],
  ['whisky', '🥂', 'ウイスキー', [['シングル', 30, 40], ['ダブル', 60, 40], ['水割り 1杯', 45, 40], ['ボトル', 700, 40]]],
  ['custom', '⭐', 'オリジナル', [['グラスワイン 0.8杯', 90, 13], ['低アルビール', 350, 3.5], ['微アルビール', 350, 1]]],
];

/* ============================================================
   ユーティリティ
   ============================================================ */

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const r1 = (n) => Math.round(n * 10) / 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 外部から読み込んだ値は信用せず、型と範囲を強制してから使う */
const str = (v, max) => String(v ?? '').slice(0, max);
const posNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const safeId = (v) => (/^[A-Za-z0-9_-]{1,40}$/.test(String(v ?? '')) ? String(v) : uid());

const grams = (ml, abv) => (ml * abv) / 100 * DENSITY;
const presetGrams = (p) => (p.gramsOverride != null ? p.gramsOverride : grams(p.volumeMl, p.abv));

function num(v, fallback = 0) {
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function levelOf(g) {
  const L = state.settings.levels;
  if (g <= 0) return 0;
  if (g <= L.moderate) return 1;
  if (g <= L.slightlyOver) return 2;
  if (g <= L.over) return 3;
  return 4;
}

const levelColor = (lv) => (lv === 0 ? 'var(--rest)' : lv === 4 ? 'var(--bad)' : `var(--lv${lv})`);

let toastTimer;
function toast(msg, onTap) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.onclick = onTap || null;
  el.style.cursor = onTap ? 'pointer' : '';
  clearTimeout(toastTimer);
  if (!onTap) toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ============================================================
   アイコン（SVG）
   ============================================================ */

const EYES_OPEN = (c) => {
  const r = (SW * 1.05).toFixed(2);
  return `<circle cx="9.4" cy="10.6" r="${r}" fill="${c}"/><circle cx="14.6" cy="10.6" r="${r}" fill="${c}"/>`;
};
const EYES_SHUT = (c) => `<path d="M8.1 11q1.3-1.7 2.6 0M13.3 11q1.3-1.7 2.6 0" fill="none"
  stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`;

const MOUTH = {
  calm: (c) => `<path d="M9.6 14.2q2.4 2.2 4.8 0" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
  smile: (c) => `<path d="M9.2 13.8q2.8 2.7 5.6 0" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
  wave: (c) => `<path d="M9.3 14.6q1.35-1.2 2.7 0 1.35 1.2 2.7 0" fill="none" stroke="${c}"
    stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>`,
  frown: (c) => `<path d="M9.2 15.5q2.8-2.7 5.6 0" fill="none" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`,
};

const MOUTH_BY_LEVEL = [null, 'smile', 'wave', 'frown'];

function ringSvg(size, pct, color, inner) {
  const r = 9.4;
  const C = 2 * Math.PI * r;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="${r}" fill="none" stroke="var(--track)" stroke-width="2.5"/>
    ${pct > 0 ? `<circle cx="12" cy="12" r="${r}" fill="none" stroke="${color}" stroke-width="2.5"
      stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}"
      stroke-dashoffset="${(C * (1 - pct)).toFixed(2)}" transform="rotate(-90 12 12)"/>` : ''}
    ${inner}</svg>`;
}

// 「ダメ！」は赤い塗り丸に白抜きの >_<
function badSvg(size) {
  const st = `fill="none" stroke="#fff" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="10.4" fill="var(--bad)"/>
    <path d="M8.3 10.2 10.4 11.9 8.3 13.6M15.7 10.2 13.6 11.9 15.7 13.6" ${st}/>
    <path d="M10.1 16.9H13.9" ${st}/></svg>`;
}

// 休肝日は淡い塗りの丸に寝顔。ゲージ表示のレベル 1〜3 と一目で区別する
function restSvg(size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="10.4" fill="var(--rest)" opacity=".16"/>
    ${EYES_SHUT('var(--rest)')}${MOUTH.calm('var(--rest)')}</svg>`;
}

function levelIcon(lv, g, size = 20) {
  if (lv === 4) return badSvg(size);
  if (lv === 0) return restSvg(size);
  const c = `var(--lv${lv})`;
  const pct = Math.min(1, g / state.settings.levels.over);
  return ringSvg(size, pct, c, EYES_OPEN(c) + MOUTH[MOUTH_BY_LEVEL[lv]](c));
}

// 連続休肝日の目印。休肝日と同じティールで揃える
const STREAK_ICON = (size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
  <path d="M12.7 2.1c3.5 3.7 5.7 6.8 5.7 10.1a6.4 6.4 0 0 1-12.8 0c0-1.8.6-3.4 1.7-5
    .4 1.1 1.1 1.8 2.1 2.2-.5-2.8.5-5.6 3.3-7.3Z" fill="var(--rest)"/></svg>`;

const MEMO_ICON = `<span class="memo" aria-label="メモあり">
  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
    <path d="M3.4 2.4h17.2v12.2L14.2 21H3.4Z" fill="none" stroke="currentColor"
      stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M20.6 14.6h-4.6a1.8 1.8 0 0 0-1.8 1.8V21Z" fill="currentColor"/>
    <path d="M7 7.4h10M7 11.4h10M7 15.4h5.6" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round"/></svg></span>`;

/* ============================================================
   IndexedDB
   ============================================================ */

const DB_NAME = 'nomilog';
const DB_VER = 1;
const STORES = { meta: 'key', categories: 'id', presets: 'id', days: 'date' };
const DAY_COUNT_KEY = 'nomilog:dayCount';
let db = null;

// IndexedDB とは別の場所に件数だけ控え、読み込み失敗を空データと区別する
function rememberDayCount() {
  try { localStorage.setItem(DAY_COUNT_KEY, String(state.days.size)); } catch { /* 使えなくても支障はない */ }
}

function expectedDayCount() {
  try { return Number(localStorage.getItem(DAY_COUNT_KEY)) || 0; } catch { return 0; }
}

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function idb(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    let out;
    const req = fn(t.objectStore(store));
    if (req && typeof req === 'object' && 'onsuccess' in req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

function idbBulk(store, items) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const o = t.objectStore(store);
    items.forEach((i) => o.put(i));
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });
}

/* ============================================================
   状態
   ============================================================ */

const state = {
  settings: null,
  cats: [],
  presets: [],
  days: new Map(),
  cursor: new Date(),
  activeCat: null,
};

const presetById = (id) => state.presets.find((p) => p.id === id);
const activePresets = (catId) => state.presets
  .filter((p) => p.categoryId === catId && !p.archived)
  .sort((a, b) => a.order - b.order);

async function seedInitial() {
  const cats = [];
  const presets = [];
  SEED.forEach(([id, icon, name, list], ci) => {
    cats.push({ id, name, icon, order: ci, builtin: true });
    list.forEach(([nm, ml, abv], pi) => {
      presets.push({
        id: `${id}-${pi}`, categoryId: id, name: nm, volumeMl: ml, abv,
        gramsOverride: null, order: pi, archived: false,
      });
    });
  });
  await idbBulk('categories', cats);
  await idbBulk('presets', presets);
  await idb('meta', 'readwrite', (o) => o.put({ ...DEFAULT_SETTINGS }));
}

async function loadAll() {
  state.settings = await idb('meta', 'readonly', (o) => o.get('settings'));
  if (!state.settings) {
    await seedInitial();
    state.settings = await idb('meta', 'readonly', (o) => o.get('settings'));
  }
  // 保存済みの値も信用せず数値に強制する
  state.settings = cleanSettings(state.settings);

  state.cats = (await idb('categories', 'readonly', (o) => o.getAll())).sort((a, b) => a.order - b.order);
  state.presets = await idb('presets', 'readonly', (o) => o.getAll());

  let days = await idb('days', 'readonly', (o) => o.getAll());
  // iOS ではアプリ更新直後の再読み込みで IndexedDB が一時的に空を返すことがある。
  // 前回の件数と食い違ったら、DB を開き直して読み直す。
  if (!days.length && expectedDayCount() > 0) {
    db.close();
    db = await openDB();
    days = await idb('days', 'readonly', (o) => o.getAll());
  }
  if (!days.length && expectedDayCount() > 0) {
    const err = new Error('STORAGE_STALE');
    err.expected = expectedDayCount();
    throw err;
  }

  state.days = new Map(days.map((d) => [d.date, d]));
  state.activeCat = state.cats[0]?.id ?? null;
  rememberDayCount();
}

const saveSettings = () => idb('meta', 'readwrite', (o) => o.put(state.settings));

/* ============================================================
   カレンダー
   ============================================================ */

function autoMonthTarget(y, m) {
  const dim = new Date(y, m + 1, 0).getDate();
  return Math.max(0, Math.round(state.settings.levels.moderate * (dim - state.settings.targetRestDays)));
}

// 今月は今日まで、過去の月は月末まで、先の月は 0 日として数える
function elapsedInMonth(y, m) {
  const now = new Date();
  const diff = (y - now.getFullYear()) * 12 + (m - now.getMonth());
  return diff > 0 ? 0 : (diff === 0 ? now.getDate() : new Date(y, m + 1, 0).getDate());
}

const isRestDay = (key) => {
  const r = state.days.get(key);
  return !!r && r.totalGrams === 0;
};

/* その月にかかる休肝日の連続のうち、最長のものを数える。
   前月から続いていれば実際の開始日まで遡り、その月の時点（今月は今日）で打ち切る。
   未記録の日は連続を切る。 */
function restStreak(y, m) {
  const last = elapsedInMonth(y, m);
  if (!last) return 0;

  // 月初の前日から遡って、持ち越している日数を数える
  let carry = 0;
  const d = new Date(y, m, 0);
  while (carry < 400 && isRestDay(ymd(d))) {
    carry += 1;
    d.setDate(d.getDate() - 1);
  }

  let run = carry;
  let best = 0;
  for (let i = 1; i <= last; i++) {
    if (isRestDay(`${y}-${pad(m + 1)}-${pad(i)}`)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;      // 持ち越し分もここで捨てる（その連続はこの月に届いていない）
    }
  }
  return best;
}

function monthTarget(y, m) {
  const fixed = state.settings.monthlyTarget;
  return fixed > 0 ? fixed : autoMonthTarget(y, m);
}

function renderCalendar() {
  const y = state.cursor.getFullYear();
  const m = state.cursor.getMonth();
  $('#monthTitle').textContent = `${y}年${m + 1}月`;

  const offset = (new Date(y, m, 1).getDay() + 6) % 7;   // 月曜始まり
  const dim = new Date(y, m + 1, 0).getDate();
  const today = ymd(new Date());
  const cells = [];

  for (let i = 0; i < offset; i++) cells.push('<div class="cell"></div>');

  for (let d = 1; d <= dim; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const rec = state.days.get(key);
    const cls = ['cell', 'tappable'];
    if (key === today) cls.push('today');
    if (rec?.hangover === 'mild') cls.push('hangA');
    if (rec?.hangover === 'severe') cls.push('hangB');

    let body = `<div class="d">${d}</div>`;
    if (rec && rec.status) {
      const g = rec.totalGrams;
      const lv = levelOf(g);
      body += `<div class="ic">${levelIcon(lv, g)}</div>
        <div class="g" style="color:${levelColor(lv)}">${Math.round(g)}g</div>
        ${rec.memo ? MEMO_ICON : ''}`;
    }
    cells.push(`<div class="${cls.join(' ')}" data-date="${key}">${body}</div>`);
  }

  while (cells.length % 7) cells.push('<div class="cell"></div>');
  $('#grid').innerHTML = cells.join('');
  renderSummary(y, m, dim);
}

function renderSummary(y, m, dim) {
  const prefix = `${y}-${pad(m + 1)}-`;
  const recs = [...state.days.values()].filter((r) => r.date.startsWith(prefix) && r.status);
  const total = recs.reduce((s, r) => s + r.totalGrams, 0);
  const target = monthTarget(y, m);
  const count = (lv) => recs.filter((r) => levelOf(r.totalGrams) === lv).length;
  const over = total > target;
  const diff = r1(Math.abs(target - total));
  const L = state.settings.levels;

  // アイコンを添えてカレンダーの凡例も兼ねる
  const legend = [[0, 0], [1, L.moderate], [2, L.slightlyOver], [3, L.over], [4, 0]]
    .map(([lv, g]) => `<div><em><i>${levelIcon(lv, g, 18)}</i>${LEVEL_NAMES[lv]}</em><b>${count(lv)}日</b></div>`)
    .join('')
    + `<div><em><i>${STREAK_ICON(18)}</i>連続休肝日</em><b>${restStreak(y, m)}日</b></div>`;

  const drinkDays = recs.filter((r) => r.totalGrams > 0).length;
  const elapsed = elapsedInMonth(y, m);

  $('#summary').innerHTML = `
    <section class="card">
      <h2>今月のまとめ</h2>
      <div class="big"><b>${r1(total)}</b><span>g　/　目標 ${target}g 以内</span></div>
      <div class="bar"><i style="width:${Math.min(100, target > 0 ? (total / target) * 100 : 0)}%;
        background:${over ? 'var(--lv3)' : 'var(--lv1)'}"></i></div>
      <div class="goal" style="color:${over ? 'var(--lv3)' : 'var(--text2)'}">
        ${over ? `目標を ${diff}g 超えています` : `目標まで あと ${diff}g`}</div>
      <div class="stats">${legend}</div>
      <div class="stats avgs">
        <div><em>平均（月）</em><b>${elapsed ? r1(total / elapsed) : 0}g</b></div>
        <div><em>平均（飲酒日）</em><b>${drinkDays ? r1(total / drinkDays) : 0}g</b></div>
      </div>
    </section>`;
}

let sliding = false;
let dragX = 0;

// 月やグラフの期間を切り替えるときの横スライド。出ていく向きと入ってくる向きをそろえる
function slideSwap(el, delta, swap, fromDrag) {
  if (sliding) return;
  if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.style.transform = '';
    el.style.opacity = '';
    swap();
    return;
  }
  const shift = Math.min(window.innerWidth, 520) * 0.3;
  const from = { transform: `translateX(${fromDrag ? dragX : 0}px)`, opacity: el.style.opacity || '1' };
  sliding = true;
  el.animate([from, { transform: `translateX(${-delta * shift}px)`, opacity: '0' }],
    { duration: 130, easing: 'ease-in' }).onfinish = () => {
    el.style.transform = `translateX(${delta * shift}px)`;
    el.style.opacity = '0';
    swap();
    el.animate([{ transform: `translateX(${delta * shift}px)`, opacity: '0' },
      { transform: 'translateX(0)', opacity: '1' }],
    { duration: 230, easing: 'cubic-bezier(.32,.72,0,1)' }).onfinish = () => {
      el.style.transform = '';
      el.style.opacity = '';
      sliding = false;
    };
  };
}

function moveMonth(delta, fromDrag = false) {
  slideSwap($('#calSlide'), delta, () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
    renderCalendar();
  }, fromDrag);
}

function goMonth(y, m) {
  state.cursor = new Date(y, m, 1);
  renderCalendar();
}

/* ---- 月ピッカー ---- */

let pickerYear = null;

function renderMonthPicker() {
  $('#yearLabel').textContent = `${pickerYear}年`;

  const filled = new Set();
  state.days.forEach((r, k) => { if (r.status) filled.add(k.slice(0, 7)); });

  const now = new Date();
  const cy = state.cursor.getFullYear();
  const cm = state.cursor.getMonth();

  $('#monthGrid').innerHTML = Array.from({ length: 12 }, (_, m) => {
    const cls = [];
    if (pickerYear === cy && m === cm) cls.push('is-sel');
    if (pickerYear === now.getFullYear() && m === now.getMonth()) cls.push('is-cur');
    const has = filled.has(`${pickerYear}-${pad(m + 1)}`);
    return `<button class="${cls.join(' ')}" data-m="${m}">${m + 1}月
      <span class="dot ${has ? '' : 'empty'}"></span></button>`;
  }).join('');
}

function openMonthPicker() {
  pickerYear = state.cursor.getFullYear();
  renderMonthPicker();
  openSheet($('#monthSheet'));
}

/* ============================================================
   グラフ
   ============================================================ */

const stats = { range: 'month', metric: 'grams', cursor: new Date(), sel: null };

const CH_W = 320;
const CH_H = 150;
const CH_PAD = 34;              // 右端の目盛りラベル用
const RANGE_STEP = { month: 1, half: 6, year: 12 };

/* 期間を「棒1本ぶん」の単位に割る。prefix で state.days を引き当てる */
function statsBuckets() {
  const y = stats.cursor.getFullYear();
  const m = stats.cursor.getMonth();

  if (stats.range === 'month') {
    const dim = new Date(y, m + 1, 0).getDate();
    return {
      title: `${y}年${m + 1}月`,
      sub: `${y}年${m + 1}月1日〜${m + 1}月${dim}日`,
      elapsed: elapsedInMonth(y, m),
      items: Array.from({ length: dim }, (_, i) => ({
        prefix: `${y}-${pad(m + 1)}-${pad(i + 1)}`,
        name: `${m + 1}月${i + 1}日`,
        label: i % 7 === 0 ? String(i + 1) : '',
      })),
    };
  }

  const n = RANGE_STEP[stats.range];
  const items = [];
  let elapsed = 0;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const yy = d.getFullYear();
    const mm = d.getMonth();
    elapsed += elapsedInMonth(yy, mm);
    items.push({
      prefix: `${yy}-${pad(mm + 1)}`,
      name: `${yy}年${mm + 1}月`,
      label: n === 6 || i % 2 === 1 ? `${mm + 1}月` : '',
    });
  }
  const first = new Date(y, m - n + 1, 1);
  return {
    title: `${y}年${m + 1}月まで`,
    sub: `${first.getFullYear()}年${first.getMonth() + 1}月〜${y}年${m + 1}月`,
    elapsed,
    items,
  };
}

/* 記録を1回だけ走査して各棒に集計する */
function statsTally(items) {
  const idx = new Map(items.map((b, i) => [b.prefix, i]));
  const len = items[0].prefix.length;
  const out = items.map(() => ({ grams: 0, rest: 0, drink: 0, lv: [0, 0, 0, 0, 0] }));
  for (const r of state.days.values()) {
    if (!r.status) continue;
    const i = idx.get(r.date.slice(0, len));
    if (i === undefined) continue;
    const o = out[i];
    o.grams += r.totalGrams;
    if (r.totalGrams > 0) o.drink += 1; else o.rest += 1;
    o.lv[levelOf(r.totalGrams)] += 1;
  }
  return out;
}

function niceMax(v, unit) {
  if (v <= 0) return 1;
  if (unit === '日') return Math.max(2, Math.ceil(v / 2) * 2);   // 半分の目盛りも整数になるように
  const e = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / e * 2) / 2 * e;
}

function chartFrame(max, unit) {
  return [0, 0.5, 1].map((f) => {
    const yy = CH_H - f * CH_H;
    return `<line x1="0" y1="${yy}" x2="${CH_W - CH_PAD}" y2="${yy}" stroke="var(--grid)"
        stroke-width="1" ${f ? 'stroke-dasharray="2 3"' : ''}/>
      <text x="${CH_W - CH_PAD + 5}" y="${yy + 4}" font-size="10"
        fill="var(--text2)">${r1(max * f)}${f === 1 ? unit : ''}</text>`;
  }).join('');
}

function chartBars(items, tally, max, valueOf, colorOf) {
  const n = items.length;
  const gap = (CH_W - CH_PAD) / n;
  const bw = Math.max(2, gap * (n > 20 ? 0.5 : 0.62));
  return items.map((b, i) => {
    const v = valueOf(tally[i]);
    const h = max ? (v / max) * CH_H : 0;
    const x = i * gap + (gap - bw) / 2;
    const dim = stats.sel != null && stats.sel !== i;
    return `<rect class="chbar" x="${x.toFixed(1)}" y="${(CH_H - h).toFixed(1)}" width="${bw.toFixed(1)}"
        height="${(v > 0 ? Math.max(h, 1.5) : 0).toFixed(1)}" rx="${Math.min(bw / 2, 2.5).toFixed(1)}"
        fill="${colorOf(tally[i], i)}" opacity="${dim ? 0.3 : 1}"/>
      ${b.label ? `<text x="${(x + bw / 2).toFixed(1)}" y="${CH_H + 14}" font-size="10"
        fill="var(--text2)" text-anchor="middle">${b.label}</text>` : ''}
      <rect class="hit" data-bar="${i}" x="${(i * gap).toFixed(1)}" y="-6"
        width="${gap.toFixed(1)}" height="${CH_H + 20}"/>`;
  }).join('');
}

function chartStack(items, tally, max) {
  const n = items.length;
  const gap = (CH_W - CH_PAD) / n;
  const bw = Math.max(2, gap * (n > 20 ? 0.5 : 0.62));
  return items.map((b, i) => {
    const dim = stats.sel != null && stats.sel !== i;
    let acc = 0;
    const segs = tally[i].lv.map((cnt, lv) => {
      if (!cnt) return '';
      const h = (cnt / max) * CH_H;
      acc += h;
      return `<rect class="chbar" x="${(i * gap + (gap - bw) / 2).toFixed(1)}" y="${(CH_H - acc).toFixed(1)}"
        width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${levelColor(lv)}"
        opacity="${dim ? 0.3 : 1}"/>`;
    }).join('');
    return `${segs}
      ${b.label ? `<text x="${(i * gap + gap / 2).toFixed(1)}" y="${CH_H + 14}" font-size="10"
        fill="var(--text2)" text-anchor="middle">${b.label}</text>` : ''}
      <rect class="hit" data-bar="${i}" x="${(i * gap).toFixed(1)}" y="-6"
        width="${gap.toFixed(1)}" height="${CH_H + 20}"/>`;
  }).join('');
}

function renderStats() {
  // 月表示は棒1本が1日なので、レベル別の内訳は意味を持たない
  const isMonth = stats.range === 'month';
  if (isMonth && stats.metric === 'mix') stats.metric = 'grams';
  $('#segMetric').querySelector('[data-metric="mix"]').hidden = isMonth;

  const { title, sub, elapsed, items } = statsBuckets();
  const tally = statsTally(items);

  $('#rangeTitle').textContent = title;
  document.querySelectorAll('#segRange button').forEach((b) => b.classList.toggle('is-on', b.dataset.range === stats.range));
  document.querySelectorAll('#segMetric button').forEach((b) => b.classList.toggle('is-on', b.dataset.metric === stats.metric));

  const total = tally.reduce((s, t) => s + t.grams, 0);
  const drink = tally.reduce((s, t) => s + t.drink, 0);
  const rest = tally.reduce((s, t) => s + t.rest, 0);
  const has = tally.some((t) => t.drink || t.rest);

  // 棒を選んでいるあいだは、その日・その月の値を見出しに出す
  const t = stats.sel != null ? tally[stats.sel] : null;
  const head = t
    ? `<div class="shead"><div>
        <div class="lbl">${esc(items[stats.sel].name)}</div>
        <div class="val">${stats.metric === 'grams' ? r1(t.grams) : stats.metric === 'rest' ? t.rest
          : t.drink + t.rest}<span>${stats.metric === 'grams' ? 'g' : '日'}</span></div>
        ${stats.metric === 'mix' ? `<div class="srange">${t.lv.map((c, lv) => (c ? `${LEVEL_NAMES[lv]} ${c}日` : '')).filter(Boolean).join('　')}</div>` : ''}
      </div></div>`
    : `<div class="shead">
        <div><div class="lbl">平均（経過日数）</div>
          <div class="val">${elapsed ? r1(total / elapsed) : 0}<span>g</span></div></div>
        <div><div class="lbl">平均（飲酒日）</div>
          <div class="val">${drink ? r1(total / drink) : 0}<span>g</span></div></div>
      </div>
      <div class="srange">${esc(sub)}</div>`;
  $('#statsHead').innerHTML = head;

  if (!has) {
    $('#chartWrap').innerHTML = '<div class="empty">この期間の記録はありません</div>';
    $('#chartLegend').innerHTML = '';
    return;
  }

  let body;
  let max;
  let unit;
  if (stats.metric === 'grams') {
    max = niceMax(Math.max(...tally.map((x) => x.grams)), 'g');
    unit = 'g';
    body = chartBars(items, tally, max, (x) => x.grams, (x) => levelColor(levelOf(
      stats.range === 'month' ? x.grams : x.grams / Math.max(1, x.drink + x.rest))));
  } else if (stats.metric === 'rest') {
    max = niceMax(Math.max(...tally.map((x) => x.rest)), '日');
    unit = '日';
    body = chartBars(items, tally, max, (x) => x.rest, () => 'var(--rest)');
  } else {
    max = niceMax(Math.max(...tally.map((x) => x.drink + x.rest)), '日');
    unit = '日';
    body = chartStack(items, tally, max);
  }

  $('#chartWrap').innerHTML = `<svg class="chart" viewBox="0 0 ${CH_W} ${CH_H + 20}">
    ${chartFrame(max, unit)}${body}</svg>`;

  $('#chartLegend').innerHTML = stats.metric === 'rest'
    ? `<span><i style="background:var(--rest)"></i>休肝日 合計 ${rest}日</span>`
    : `<div class="legend">${LEVEL_NAMES.map((nm, lv) =>
      `<span><i style="background:${levelColor(lv)}"></i>${nm}</span>`).join('')}</div>`;
}

function moveRange(delta, fromDrag = false) {
  slideSwap($('#statsSlide'), delta, () => {
    stats.cursor = new Date(stats.cursor.getFullYear(),
      stats.cursor.getMonth() + delta * RANGE_STEP[stats.range], 1);
    stats.sel = null;
    renderStats();
  }, fromDrag);
}

/* ============================================================
   日別入力シート
   ============================================================ */

let draft = null;

const SHEET_IDS = ['#monthSheet', '#catSheet', '#presetSheet', '#daySheet'];

function openSheet(el) {
  $('#backdrop').hidden = false;
  el.hidden = false;
}

function closeSheet(el) {
  el.hidden = true;
  if (SHEET_IDS.every((id) => $(id).hidden)) $('#backdrop').hidden = true;
}

function openDay(dateStr) {
  const rec = state.days.get(dateStr);
  draft = {
    date: dateStr,
    status: rec?.status ?? 'drank',
    hangover: rec?.hangover ?? 'none',
    memo: rec?.memo ?? '',
    counts: new Map((rec?.items ?? []).map((i) => [i.presetId, i.count])),
    // 内訳のない記録（CSV インポートなど）の合計を保持する
    manualGrams: rec?.manualGrams ?? (rec && !rec.items?.length && rec.totalGrams > 0 ? rec.totalGrams : null),
    existed: !!rec,
    dirty: false,
  };

  const [y, m, d] = dateStr.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  $('#daySheetTitle').textContent = `${m}月${d}日 (${w})`;
  $('#dayMemo').value = draft.memo;
  $('#dayManual').value = draft.manualGrams ?? '';
  $('#dayDelete').hidden = !draft.existed;
  if (!state.cats.some((c) => c.id === state.activeCat)) state.activeCat = state.cats[0]?.id ?? null;

  syncSeg('#segHangover', draft.hangover);
  syncSeg('#segStatus', draft.status);
  renderChips();
  renderPresetRows();
  renderDayTotal();
  openSheet($('#daySheet'));
}

function syncSeg(sel, value) {
  $(sel).querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === value));
}

function draftTotal() {
  if (draft.status === 'none') return 0;
  let t = 0;
  draft.counts.forEach((n, pid) => {
    const p = presetById(pid);
    if (p) t += presetGrams(p) * n;
  });
  return t > 0 ? t : (draft.manualGrams || 0);
}

function renderDayTotal() {
  const g = draftTotal();
  const lv = levelOf(g);
  $('#dayTotal').innerHTML = `${levelIcon(lv, g, 26)}
    <b style="color:${levelColor(lv)}">${r1(g)}</b><span>g　${LEVEL_NAMES[lv]}</span>`;
  $('#drinkArea').style.display = draft.status === 'none' ? 'none' : '';
}

function renderChips() {
  $('#catChips').innerHTML = state.cats.map((c) => {
    const n = activePresets(c.id).reduce((s, p) => s + (draft.counts.get(p.id) || 0), 0);
    return `<button class="chip ${c.id === state.activeCat ? 'is-on' : ''}" data-cat="${c.id}">
      <span>${esc(c.icon)}</span><span>${esc(c.name)}</span>${n > 0 ? `<span>· ${r1(n)}</span>` : ''}</button>`;
  }).join('');
}

function presetRowHtml(p, extra = '') {
  const n = draft.counts.get(p.id) || 0;
  const g = presetGrams(p);
  return `<li class="presetrow ${n > 0 ? 'has' : ''}" data-preset="${esc(p.id)}">
    <div class="rowmain">
      <div class="t">${esc(p.name)}${extra}</div>
      <div class="s">${r1(p.volumeMl)}ml (Alc ${r1(p.abv)}%) · ${r1(g)}g</div>
    </div>
    <div class="stepper">
      <button data-step="-1" aria-label="減らす">−</button>
      <input type="text" inputmode="decimal" value="${n ? r1(n) : 0}" class="${n ? '' : 'zero'}" aria-label="杯数">
      <button data-step="1" aria-label="増やす">＋</button>
    </div></li>`;
}

function renderPresetRows() {
  const rows = activePresets(state.activeCat).map((p) => presetRowHtml(p));

  // 削除済みでも記録が残っているものは編集できるように出す
  state.presets
    .filter((p) => p.archived && (draft.counts.get(p.id) || 0) > 0)
    .forEach((p) => rows.push(presetRowHtml(p, ' <span style="color:var(--text2);font-size:12px">（削除済み）</span>')));

  $('#presetList').innerHTML = rows.join('') || '<li><span style="color:var(--text2)">お酒が登録されていません</span></li>';
}

function setCount(pid, value) {
  const v = Math.max(0, Math.round(num(value, 0) * 100) / 100);
  if (v > 0) draft.counts.set(pid, v); else draft.counts.delete(pid);
  draft.dirty = true;
}

async function saveDay() {
  const items = [];
  draft.counts.forEach((n, pid) => {
    const p = presetById(pid);
    if (p && n > 0) {
      items.push({
        presetId: pid, name: p.name, volumeMl: p.volumeMl, abv: p.abv,
        gramsPerUnit: r1(presetGrams(p)), count: n,
      });
    }
  });

  const total = r1(draftTotal());
  const rec = {
    date: draft.date,
    // お酒も合計も入力されていなければ休肝日として扱う
    status: draft.status === 'drank' && total > 0 ? 'drank' : 'none',
    hangover: draft.hangover,
    memo: $('#dayMemo').value.trim(),
    items: draft.status === 'none' ? [] : items,
    manualGrams: items.length ? null : draft.manualGrams,
    totalGrams: total,
    updatedAt: new Date().toISOString(),
  };

  await idb('days', 'readwrite', (o) => o.put(rec));
  state.days.set(rec.date, rec);
  rememberDayCount();
  closeSheet($('#daySheet'));
  renderCalendar();
  toast('保存しました');
}

async function deleteDay() {
  if (!confirm('この日の記録を削除します。よろしいですか？')) return;
  await idb('days', 'readwrite', (o) => o.delete(draft.date));
  state.days.delete(draft.date);
  rememberDayCount();
  closeSheet($('#daySheet'));
  renderCalendar();
  toast('削除しました');
}

/* ============================================================
   設定画面
   ============================================================ */

function renderSettings() {
  const L = state.settings.levels;
  const bytes = state.usage != null ? `${(state.usage / 1024).toFixed(0)} KB` : '—';

  const catBlocks = state.cats.map((c, i) => {
    const cid = esc(c.id);
    const rows = activePresets(c.id).map((p) => `
      <li data-editpreset="${esc(p.id)}" class="presetrow">
        <div class="rowmain">
          <div class="t">${esc(p.name)}</div>
          <div class="s">${r1(p.volumeMl)}ml (Alc ${r1(p.abv)}%) · ${r1(presetGrams(p))}g</div>
        </div>
        <span style="color:var(--text2)">›</span>
      </li>`).join('');

    return `
      <h2 class="sechead">${esc(c.icon)} ${esc(c.name)}</h2>
      <ul class="list">
        <li>
          <div class="rowmain"><div class="t" style="font-size:14px;color:var(--text2)">順番・名前</div></div>
          <button class="iconbtn" data-catup="${cid}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">▲</button>
          <button class="iconbtn" data-catdown="${cid}" ${i === state.cats.length - 1 ? 'disabled' : ''} aria-label="下へ">▼</button>
          <button class="iconbtn" data-editcat="${cid}" aria-label="編集">✎</button>
        </li>
        ${rows}
        <li data-addpreset="${cid}" class="presetrow">
          <div class="rowmain"><div class="t" style="color:var(--accent)">＋ お酒を追加</div></div>
        </li>
      </ul>`;
  }).join('');

  $('#settingsBody').innerHTML = `
    <h2 class="sechead">基準値</h2>
    <ul class="list form">
      <li><label for="sMod">適量の上限 (g)</label><input id="sMod" type="text" inputmode="decimal" value="${esc(L.moderate)}"></li>
      <li><label for="sSlight">やや飲み過ぎ (g)</label><input id="sSlight" type="text" inputmode="decimal" value="${esc(L.slightlyOver)}"></li>
      <li><label for="sOver">飲み過ぎ (g)</label><input id="sOver" type="text" inputmode="decimal" value="${esc(L.over)}"></li>
      <li><label for="sRest">目標休肝日 (日/月)</label><input id="sRest" type="text" inputmode="numeric" value="${esc(state.settings.targetRestDays)}"></li>
      <li><label for="sTarget">月間目標 (g/月)</label><input id="sTarget" type="text" inputmode="decimal"
        value="${esc(state.settings.monthlyTarget ?? '')}"
        placeholder="自動 (${esc(autoMonthTarget(state.cursor.getFullYear(), state.cursor.getMonth()))}g)"></li>
    </ul>
    <p class="hint">上限を超えると次のレベルになります。<br>
      月間目標を空欄にすると「適量の上限 ×（月の日数 − 目標休肝日）」で自動計算します。<br>
      参考：厚生労働省は生活習慣病のリスクを高める量を、1日あたり男性40g・女性20g以上としています。</p>
    <button class="ghost" id="resetLevels">既定値に戻す</button>

    ${catBlocks}
    <button class="ghost" id="addCat">＋ カテゴリを追加</button>

    <h2 class="sechead">データ</h2>
    <ul class="list">
      <li data-act="exportJson" class="presetrow"><div class="rowmain"><div class="t">バックアップを書き出す</div>
        <div class="s">JSON形式。復元にはこちらを使います</div></div><span style="color:var(--text2)">›</span></li>
      <li data-act="exportCsv" class="presetrow"><div class="rowmain"><div class="t">CSVで書き出す</div>
        <div class="s">Excel などで見るとき用</div></div><span style="color:var(--text2)">›</span></li>
      <li data-act="import" class="presetrow"><div class="rowmain"><div class="t">読み込む</div>
        <div class="s">JSON / CSV</div></div><span style="color:var(--text2)">›</span></li>
    </ul>
    <p class="hint">データはこの iPhone の中だけに保存されます。機種変更の前に必ず書き出してください。</p>

    <h2 class="sechead">このアプリについて</h2>
    <ul class="list">
      <li><div class="rowmain"><div class="t">記録した日数</div></div><span style="color:var(--text2)">${state.days.size} 日</span></li>
      <li><div class="rowmain"><div class="t">使用容量</div></div><span style="color:var(--text2)">${bytes}</span></li>
      <li><div class="rowmain"><div class="t">バージョン</div></div><span style="color:var(--text2)">1.0</span></li>
    </ul>
    <button class="danger" id="wipe">すべてのデータを削除</button>`;
}

async function applyLevelSettings() {
  const mod = num($('#sMod').value, 24);
  const slight = num($('#sSlight').value, 40);
  const over = num($('#sOver').value, 60);
  const rest = Math.round(num($('#sRest').value, 15));
  const targetRaw = $('#sTarget').value.trim();

  if (!(mod > 0 && slight > mod && over > slight)) {
    toast('適量 < やや飲み過ぎ < 飲み過ぎ の順になるように入力してください');
    renderSettings();
    return;
  }
  state.settings.levels = { moderate: mod, slightlyOver: slight, over };
  state.settings.targetRestDays = Math.min(31, Math.max(0, rest));
  state.settings.monthlyTarget = targetRaw === '' ? null : Math.max(0, num(targetRaw, 0)) || null;
  await saveSettings();
  renderSettings();
  renderCalendar();
  toast('基準値を保存しました');
}

/* ============================================================
   プリセット / カテゴリの編集
   ============================================================ */

let editingPreset = null;
let editingCat = null;

function openPresetEditor(presetId, categoryId) {
  const p = presetId ? presetById(presetId) : null;
  editingPreset = p ? { ...p } : {
    id: uid(), categoryId, name: '', volumeMl: '', abv: '',
    gramsOverride: null, order: activePresets(categoryId).length, archived: false,
  };

  $('#presetTitle').textContent = p ? 'お酒を編集' : 'お酒を追加';
  $('#pName').value = editingPreset.name;
  $('#pVol').value = editingPreset.volumeMl;
  $('#pAbv').value = editingPreset.abv;
  $('#pOverride').value = editingPreset.gramsOverride ?? '';
  $('#pCat').innerHTML = state.cats.map((c) =>
    `<option value="${esc(c.id)}" ${c.id === editingPreset.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('#presetDelete').hidden = !p;
  updatePresetCalc();
  openSheet($('#presetSheet'));
}

function updatePresetCalc() {
  const ml = num($('#pVol').value);
  const abv = num($('#pAbv').value);
  const ov = $('#pOverride').value.trim();
  const g = ov !== '' ? num(ov) : grams(ml, abv);
  $('#pCalc').innerHTML = `<b>${r1(g)} g</b>純アルコール量${ov !== '' ? '（手入力）' : ''}`;
}

async function savePreset() {
  const name = $('#pName').value.trim();
  const ml = num($('#pVol').value);
  const abv = num($('#pAbv').value);
  const ov = $('#pOverride').value.trim();

  if (!name) return toast('名前を入力してください');
  if (!(ml > 0)) return toast('量を入力してください');
  if (!(abv >= 0)) return toast('度数を入力してください');

  const rec = {
    ...editingPreset,
    name, volumeMl: ml, abv,
    gramsOverride: ov === '' ? null : num(ov),
    categoryId: $('#pCat').value,
  };
  await idb('presets', 'readwrite', (o) => o.put(rec));

  const i = state.presets.findIndex((p) => p.id === rec.id);
  if (i >= 0) state.presets[i] = rec; else state.presets.push(rec);

  closeSheet($('#presetSheet'));
  if (!$('#daySheet').hidden) { renderPresetRows(); renderChips(); renderDayTotal(); }
  renderSettings();
  toast('保存しました');
}

async function deletePreset() {
  if (!confirm('このお酒を一覧から削除します。過去の記録は残ります。')) return;
  const rec = { ...editingPreset, archived: true };
  await idb('presets', 'readwrite', (o) => o.put(rec));
  const i = state.presets.findIndex((p) => p.id === rec.id);
  if (i >= 0) state.presets[i] = rec;
  closeSheet($('#presetSheet'));
  if (!$('#daySheet').hidden) renderPresetRows();
  renderSettings();
  toast('削除しました');
}

function openCatEditor(catId) {
  const c = catId ? state.cats.find((x) => x.id === catId) : null;
  editingCat = c ? { ...c } : { id: uid(), name: '', icon: '🥤', order: state.cats.length, builtin: false };
  $('#catTitle').textContent = c ? 'カテゴリを編集' : 'カテゴリを追加';
  $('#cName').value = editingCat.name;
  $('#cIcon').value = editingCat.icon;
  $('#catDelete').hidden = !c;
  openSheet($('#catSheet'));
}

async function saveCat() {
  const name = $('#cName').value.trim();
  if (!name) return toast('名前を入力してください');
  const rec = { ...editingCat, name, icon: $('#cIcon').value.trim() || '🥤' };
  await idb('categories', 'readwrite', (o) => o.put(rec));
  const i = state.cats.findIndex((c) => c.id === rec.id);
  if (i >= 0) state.cats[i] = rec; else state.cats.push(rec);
  closeSheet($('#catSheet'));
  renderSettings();
  if (!$('#daySheet').hidden) renderChips();
  toast('保存しました');
}

async function deleteCat() {
  const n = activePresets(editingCat.id).length;
  if (!confirm(`「${editingCat.name}」と、その中の ${n} 件のお酒を削除します。過去の記録は残ります。`)) return;

  const updated = state.presets
    .filter((p) => p.categoryId === editingCat.id && !p.archived)
    .map((p) => ({ ...p, archived: true }));
  if (updated.length) await idbBulk('presets', updated);
  updated.forEach((u) => { state.presets[state.presets.findIndex((p) => p.id === u.id)] = u; });

  await idb('categories', 'readwrite', (o) => o.delete(editingCat.id));
  state.cats = state.cats.filter((c) => c.id !== editingCat.id);
  if (state.activeCat === editingCat.id) state.activeCat = state.cats[0]?.id ?? null;

  closeSheet($('#catSheet'));
  renderSettings();
  if (!$('#daySheet').hidden) { renderChips(); renderPresetRows(); }
  toast('削除しました');
}

async function moveCat(catId, delta) {
  const i = state.cats.findIndex((c) => c.id === catId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.cats.length) return;
  [state.cats[i], state.cats[j]] = [state.cats[j], state.cats[i]];
  state.cats.forEach((c, k) => { c.order = k; });
  await idbBulk('categories', state.cats);
  renderSettings();
}

/* ============================================================
   書き出し / 読み込み
   ============================================================ */

async function saveFile(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const file = new File([blob], filename, { type: mime });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const sortedDays = () => [...state.days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

function exportJson() {
  const data = {
    app: 'nomilog',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    categories: state.cats,
    presets: state.presets,
    days: sortedDays(),
  };
  saveFile(`のみログ_${ymd(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function exportCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['日付,状態,二日酔い,純アルコール量(g),内訳,メモ'];
  sortedDays().forEach((d) => {
    const detail = (d.items || []).map((i) => `${i.name}×${r1(i.count)}`).join(' / ');
    lines.push([
      d.date,
      d.status === 'none' ? '休肝日' : '飲酒',
      HANGOVER_NAMES[d.hangover] || '普通',
      r1(d.totalGrams),
      q(detail),
      q(d.memo),
    ].join(','));
  });
  saveFile(`のみログ_${ymd(new Date())}.csv`, `\uFEFF${lines.join('\r\n')}`, 'text/csv');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** 日付と純アルコール量があれば取り込める。二日酔い・メモ・状態は任意。 */
function daysFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return [];

  const head = rows[0].map((h) => h.trim());
  const find = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = find('日付', 'date');
  const iGram = find('純アルコール', 'アルコール量', 'gram', 'grams');
  const iHang = find('二日酔');
  const iMemo = find('メモ', 'memo');
  const iStat = find('状態', 'status');
  if (iDate < 0 || iGram < 0) throw new Error('「日付」と「純アルコール量(g)」の列が必要です');

  const hangKey = (v) => (v.includes('やや') ? 'mild' : v.includes('二日酔') ? 'severe' : 'none');

  return rows.slice(1).map((r) => {
    const raw = (r[iDate] || '').trim().replace(/[/.]/g, '-');
    const mt = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!mt) return null;
    const date = `${mt[1]}-${pad(+mt[2])}-${pad(+mt[3])}`;
    const g = r1(num(r[iGram], 0));
    const statusRaw = iStat >= 0 ? (r[iStat] || '') : '';
    const status = statusRaw.includes('休肝') || (statusRaw === '' && g === 0) ? 'none' : 'drank';
    return {
      date,
      status,
      hangover: iHang >= 0 ? hangKey(r[iHang] || '') : 'none',
      memo: iMemo >= 0 ? (r[iMemo] || '').trim() : '',
      items: [],
      manualGrams: status === 'none' ? null : g,
      totalGrams: status === 'none' ? 0 : g,
      updatedAt: new Date().toISOString(),
    };
  }).filter(Boolean);
}

/* ---- 読み込んだデータの正規化 ---- */

function cleanSettings(s) {
  const D = DEFAULT_SETTINGS.levels;
  const L = s?.levels || {};
  const moderate = posNum(L.moderate, D.moderate) || D.moderate;
  const slight = posNum(L.slightlyOver, D.slightlyOver);
  const over = posNum(L.over, D.over);
  return {
    key: 'settings',
    levels: {
      moderate,
      slightlyOver: slight > moderate ? slight : moderate * 2,
      over: over > Math.max(slight, moderate) ? over : moderate * 3,
    },
    targetRestDays: Math.min(31, Math.round(posNum(s?.targetRestDays, DEFAULT_SETTINGS.targetRestDays))),
    monthlyTarget: posNum(s?.monthlyTarget, 0) > 0 ? posNum(s.monthlyTarget, 0) : null,
    schemaVersion: 1,
  };
}

const cleanCategory = (c, i) => ({
  id: safeId(c?.id),
  name: str(c?.name, 40) || 'カテゴリ',
  icon: str(c?.icon, 8) || '🥤',
  order: posNum(c?.order, i),
  builtin: !!c?.builtin,
});

const cleanPreset = (p, i) => ({
  id: safeId(p?.id),
  categoryId: safeId(p?.categoryId),
  name: str(p?.name, 60) || 'お酒',
  volumeMl: posNum(p?.volumeMl),
  abv: posNum(p?.abv),
  gramsOverride: p?.gramsOverride == null ? null : posNum(p.gramsOverride),
  order: posNum(p?.order, i),
  archived: !!p?.archived,
});

function cleanDay(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date ?? ''))) return null;
  const status = d?.status === 'drank' ? 'drank' : 'none';
  return {
    date: d.date,
    status,
    hangover: ['none', 'mild', 'severe'].includes(d?.hangover) ? d.hangover : 'none',
    memo: str(d?.memo, 2000),
    items: (Array.isArray(d?.items) ? d.items : []).slice(0, 200).map((i) => ({
      presetId: safeId(i?.presetId),
      name: str(i?.name, 60),
      volumeMl: posNum(i?.volumeMl),
      abv: posNum(i?.abv),
      gramsPerUnit: posNum(i?.gramsPerUnit),
      count: posNum(i?.count),
    })),
    manualGrams: d?.manualGrams == null ? null : posNum(d.manualGrams),
    totalGrams: r1(posNum(d?.totalGrams)),
    updatedAt: str(d?.updatedAt, 40),
  };
}

async function importFile(file) {
  if (file.size > 20 * 1024 * 1024) return alert('ファイルが大きすぎます');

  const text = await file.text();
  const isCsv = /\.csv$/i.test(file.name) || !text.trim().startsWith('{');

  let days;
  let payload = null;

  try {
    if (isCsv) {
      days = daysFromCsv(text);
    } else {
      payload = JSON.parse(text);
      if (payload.app !== 'nomilog' || !Array.isArray(payload.days)) throw new Error('のみログのバックアップではありません');
      days = payload.days.map(cleanDay).filter(Boolean);
    }
  } catch (e) {
    alert(`読み込めませんでした\n${e.message}`);
    return;
  }

  if (!days.length) return alert('取り込める行がありませんでした');

  const replace = confirm(
    `${days.length} 日分のデータを読み込みます。\n\n`
    + '［OK］すべて置き換える（今のデータは消えます）\n'
    + '［キャンセル］今のデータに追加する（同じ日付は上書き）',
  );

  if (replace) {
    await idb('days', 'readwrite', (o) => o.clear());
    state.days.clear();
    if (payload) {
      if (payload.settings) { state.settings = cleanSettings(payload.settings); await saveSettings(); }
      if (Array.isArray(payload.categories) && payload.categories.length) {
        const cats = payload.categories.slice(0, 100).map(cleanCategory);
        await idb('categories', 'readwrite', (o) => o.clear());
        await idbBulk('categories', cats);
        state.cats = cats.sort((a, b) => a.order - b.order);
      }
      if (Array.isArray(payload.presets) && payload.presets.length) {
        const presets = payload.presets.slice(0, 2000).map(cleanPreset);
        await idb('presets', 'readwrite', (o) => o.clear());
        await idbBulk('presets', presets);
        state.presets = presets;
      }
      state.activeCat = state.cats[0]?.id ?? null;
    }
  }

  await idbBulk('days', days);
  days.forEach((d) => state.days.set(d.date, d));
  rememberDayCount();

  renderCalendar();
  renderSettings();
  toast(`${days.length} 日分を読み込みました`);
}

async function wipeAll() {
  if (!confirm('すべての記録・設定・お酒の登録を削除します。元に戻せません。')) return;
  if (!confirm('本当によろしいですか？\n先にバックアップを書き出すことをおすすめします。')) return;
  for (const s of Object.keys(STORES)) await idb(s, 'readwrite', (o) => o.clear());
  await loadAll();
  renderCalendar();
  renderSettings();
  toast('削除しました');
}

/* ============================================================
   イベント
   ============================================================ */

function switchTab(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  if (name === 'Settings') renderSettings();
  if (name === 'Stats') renderStats();
}

function bind() {
  $('#prevMonth').onclick = () => moveMonth(-1);
  $('#nextMonth').onclick = () => moveMonth(1);
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });

  /* --- 月ピッカー --- */
  $('#monthTitleBtn').onclick = openMonthPicker;
  $('#monthCancel').onclick = () => closeSheet($('#monthSheet'));
  $('#prevYear').onclick = () => { pickerYear--; renderMonthPicker(); };
  $('#nextYear').onclick = () => { pickerYear++; renderMonthPicker(); };
  $('#monthToday').onclick = () => {
    const now = new Date();
    goMonth(now.getFullYear(), now.getMonth());
    closeSheet($('#monthSheet'));
  };
  $('#monthGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    goMonth(pickerYear, Number(b.dataset.m));
    closeSheet($('#monthSheet'));
  });

  $('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-date]');
    if (cell) openDay(cell.dataset.date);
  });

  // 左右スワイプで移動。対象だけを指の動きに追従させる
  const bindDrag = (el, move) => {
    let sx = 0;
    let sy = 0;
    let axis = null;

    el.addEventListener('touchstart', (e) => {
      if (sliding || e.touches.length > 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      axis = null;
      dragX = 0;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (sliding || e.touches.length > 1) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
      }
      if (axis !== 'x') return;
      e.preventDefault();                     // 横に振ったときは縦スクロールさせない
      dragX = dx * 0.55;                      // 引きずる手応えを残すため減衰させる
      el.style.transform = `translateX(${dragX}px)`;
      el.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / window.innerWidth));
    }, { passive: false });

    el.addEventListener('touchend', () => {
      if (sliding || axis !== 'x') return;
      if (Math.abs(dragX) > 34) {
        move(dragX < 0 ? 1 : -1, true);
      } else if (el.animate) {
        el.animate([{ transform: `translateX(${dragX}px)`, opacity: el.style.opacity || '1' },
          { transform: 'translateX(0)', opacity: '1' }],
        { duration: 220, easing: 'cubic-bezier(.32,.72,0,1)' }).onfinish = () => {
          el.style.transform = '';
          el.style.opacity = '';
        };
      } else {
        el.style.transform = '';
        el.style.opacity = '';
      }
      axis = null;
    }, { passive: true });
  };

  bindDrag($('#calSlide'), moveMonth);
  bindDrag($('#statsSlide'), moveRange);

  /* --- グラフ --- */
  $('#prevRange').onclick = () => moveRange(-1);
  $('#nextRange').onclick = () => moveRange(1);

  $('#segRange').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    stats.range = b.dataset.range;
    stats.sel = null;
    renderStats();
  });

  $('#segMetric').addEventListener('click', (e) => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    stats.metric = b.dataset.metric;
    renderStats();
  });

  $('#chartWrap').addEventListener('click', (e) => {
    const hit = e.target.closest('[data-bar]');
    const i = hit ? Number(hit.dataset.bar) : null;
    stats.sel = stats.sel === i ? null : i;
    renderStats();
  });

  /* --- 日別シート --- */
  $('#daySheetClose').onclick = () => {
    if (draft.dirty && !confirm('編集内容を破棄しますか？')) return;
    closeSheet($('#daySheet'));
  };
  $('#daySheetSave').onclick = saveDay;
  $('#dayDelete').onclick = deleteDay;
  $('#dayMemo').oninput = () => { draft.dirty = true; };
  $('#dayManual').oninput = () => {
    const v = num($('#dayManual').value, 0);
    draft.manualGrams = v > 0 ? v : null;
    draft.dirty = true;
    renderDayTotal();
  };

  $('#segHangover').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.hangover = b.dataset.v;
    draft.dirty = true;
    syncSeg('#segHangover', draft.hangover);
  });

  $('#segStatus').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.status = b.dataset.v;
    draft.dirty = true;
    syncSeg('#segStatus', draft.status);
    renderDayTotal();
  });

  $('#catChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.activeCat = b.dataset.cat;
    renderChips();
    renderPresetRows();
  });

  $('#addPresetHere').onclick = () => openPresetEditor(null, state.activeCat);

  $('#presetList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-preset]');
    if (!row) return;
    const pid = row.dataset.preset;
    const step = e.target.closest('[data-step]');
    if (e.target.tagName === 'INPUT') return;

    const cur = draft.counts.get(pid) || 0;
    setCount(pid, step ? cur + Number(step.dataset.step) : cur + 1);
    renderPresetRows();
    renderChips();
    renderDayTotal();
  });

  $('#presetList').addEventListener('change', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    const row = e.target.closest('[data-preset]');
    setCount(row.dataset.preset, e.target.value);
    renderPresetRows();
    renderChips();
    renderDayTotal();
  });

  /* --- プリセット編集 --- */
  $('#presetCancel').onclick = () => closeSheet($('#presetSheet'));
  $('#presetSave').onclick = savePreset;
  $('#presetDelete').onclick = deletePreset;
  ['#pVol', '#pAbv', '#pOverride'].forEach((s) => { $(s).oninput = updatePresetCalc; });

  /* --- カテゴリ編集 --- */
  $('#catCancel').onclick = () => closeSheet($('#catSheet'));
  $('#catSave').onclick = saveCat;
  $('#catDelete').onclick = deleteCat;

  /* --- 設定 --- */
  $('#settingsBody').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#resetLevels')) {
      state.settings.levels = { ...DEFAULT_SETTINGS.levels };
      state.settings.targetRestDays = DEFAULT_SETTINGS.targetRestDays;
      state.settings.monthlyTarget = DEFAULT_SETTINGS.monthlyTarget;
      saveSettings().then(() => { renderSettings(); renderCalendar(); toast('既定値に戻しました'); });
      return;
    }
    if (t.closest('#addCat')) return openCatEditor(null);
    if (t.closest('#wipe')) return wipeAll();

    const up = t.closest('[data-catup]');
    if (up) return moveCat(up.dataset.catup, -1);
    const down = t.closest('[data-catdown]');
    if (down) return moveCat(down.dataset.catdown, 1);
    const ec = t.closest('[data-editcat]');
    if (ec) return openCatEditor(ec.dataset.editcat);
    const ep = t.closest('[data-editpreset]');
    if (ep) return openPresetEditor(ep.dataset.editpreset);
    const ap = t.closest('[data-addpreset]');
    if (ap) return openPresetEditor(null, ap.dataset.addpreset);

    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'exportJson') exportJson();
    if (act === 'exportCsv') exportCsv();
    if (act === 'import') $('#importFile').click();
  });

  $('#settingsBody').addEventListener('change', (e) => {
    if (['sMod', 'sSlight', 'sOver', 'sRest', 'sTarget'].includes(e.target.id)) applyLevelSettings();
  });

  $('#importFile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) importFile(f);
    e.target.value = '';
  };

  $('#backdrop').onclick = () => {
    if (!$('#monthSheet').hidden) return closeSheet($('#monthSheet'));
    if (!$('#catSheet').hidden) return closeSheet($('#catSheet'));
    if (!$('#presetSheet').hidden) return closeSheet($('#presetSheet'));
    if (!$('#daySheet').hidden) $('#daySheetClose').click();
  };
}

/* ============================================================
   起動
   ============================================================ */

async function start() {
  db = await openDB();
  await loadAll();

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if (navigator.storage?.estimate) navigator.storage.estimate().then((e) => { state.usage = e.usage; });

  bind();
  renderCalendar();

  if ('serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      // 接続を残したまま再読み込みすると iOS がデータを開けなくなることがある
      try { db?.close(); } catch { /* 閉じられなくても再読み込みは行う */ }
      location.reload();
    });

    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しいバージョンがあります。タップで更新', () => sw.postMessage('skipWaiting'));
          }
        });
      });
    }).catch(() => {});
  }
}

start().catch((e) => {
  const stale = e.message === 'STORAGE_STALE';
  document.body.innerHTML = `<div class="fatal">
    <b>${stale ? '記録を読み込めませんでした' : '起動できませんでした'}</b>
    ${stale ? `
      <p><b>データは消えていません。</b>${esc(e.expected)} 日分の記録は iPhone の中に残っています。</p>
      <p>アプリを更新した直後に、iPhone がデータをうまく開けなくなることがあります。
        下から上にスワイプしてアプリを一度終了し、開き直してください。</p>
      <p class="warn">この画面が出ているあいだは、記録の追加や読み込みをしないでください。</p>`
    : `<p>${esc(e.message)}</p>`}
    <button id="retry">もう一度試す</button>
  </div>`;
  $('#retry').onclick = () => location.reload();
});
