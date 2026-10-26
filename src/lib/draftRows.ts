/**
 * НООРОГ — ЭХ ХУУДАСНЫ БҮТЦЭЭР, НЭГ ХҮСНЭГТЭД (`GU_Selbe_Guitsetgel_Draft` · `Guitsetgel_talbe/191`): ЦЭВЭР КОДЛОГЧ.
 *
 * ⚠️ 2026-10-26 (хэрэглэгчийн ЭЦСИЙН шийдвэр — JSON нүд ба 3 хүснэгтийн загвар хоёулаа ТАТГАЛЗАГДСАН): БҮХ ноорог —
 *    гүйцэтгэлийн ноорог (`n:<багц>`), илгээлт (`sub|…`/`done|…` толгой + `n:sub:<OBJECTID>` мөрүүд), хуваарийн ноорог
 *    (`n:plan:<plan|geree>:<багц>`) — ОДОО БАЙГАА 191-д, ЭХ ХУУДАСНЫ БАГАНЫН НЭРЭЭР: өөрчлөгдсөн АЖИЛ × БЛОК бүрд НЭГ МӨР
 *    (`obyem_sum` · `бодит_гүйцэтгэл` (0–1) · `төлөвлөгөөт_хуваарь__эхлэх/__дуусах` · `geree_*` · `bodit_*` · `hamaaral` ·
 *    `hun_huch` · `mashin_mehanizm` · `шинэчлэгдсэн_огноо`), сарын обьём — АЖИЛ × БЛОК × САР бүрд нэг мөр (`GU_huvaari_20260906`-ийн
 *    нэр: `blok` · `sar_txt` · `obyem`). Ажлыг эх хуудасны `des_dugaar` · `f_` · `ажил`-аар танина. НҮДНИЙ ӨГӨГДӨЛ JSON-д ОГТ ҮГҮЙ.
 * ⚠️ БЛОКИЙН БАГАНЫГ ХУУЛАХГҮЙ: 24 хуудасны блок бүрийн багана (`f5_1_гүйцэтгэл`, `f6_1_блок___12_давхар_эхлэх` …) ~1,000 янзын
 *    нэртэй тул нэг бүтцэд багтахгүй — блок нь МӨР (`blok_idx` + `blok`), утга нь блокгүй хуудасны ИЖИЛ үүрэгтэй баганад.
 * ⚠️ МӨР БҮР НЭГ АГШИНТАЙ (`at`, `usr`) — нүд бүрийн агшны багана БАЙХГҮЙ (хэрэглэгчийн сонголт «per-row stamps»). Бичилт
 *    ЗӨВХӨН өөрчлөгдсөн баганын БҮЛГИЙГ илгээнэ (`diffRows`) — хоёр хүн нэг мөрийн өөр бүлгийг зэрэг засвал хоёулаа буух
 *    ба бүлэг бүрийн агшныг клиент СҮҮЛД УНШСАН ЗУРАГТАЙ ЖИШИЖ өөрөө гаргана (`stampRow`).
 * ⚠️ TOMBSTONE = ТУСДАА ХООСОН МӨР (`mur_turul='ustgal'`, `x:` түлхүүр, `at` = хассан агшин) — нэг мөрөнд олон бүлэг байх тул
 *    «хоосон бүлэг» нь «хасагдсан» эсэхийг ялгахгүй; тусдаа мөр нь агшныг ЯГ хадгална. СУУРЬ (`bv`/`datesB`) — бүлэг бүрд тусдаа
 *    `suuri=1` мөр (`b:` түлхүүр): мөр алга = суурь МЭДЭГДЭХГҮЙ, хоосон мөр = серверийн утга null, утгатай = суурь.
 * ⚠️ null ≠ 0: `null` = тохируулаагүй; `hoosolson` (жагсаасан багана) = ИЛ ХООСОЛСОН ('' огноо, хасагдсан муж); 0 = бодит тэг.
 * ⚠️ Энэ файл React-гүй, ArcGIS-гүй — `draftRows.check.mjs`.
 */
import {
  HD_DEL_TTL, kA, kH, kM, kN, kR, kS, merge as hdMerge, monthsOfVal, monthsVal, parseKey, resOfVal, resVal, sameVal, rowIdentity,
  type HDDraft, type HDEntries, type HDEntry, type HDKind, type HDRowBase, type HDRowKey,
} from './huvaariDraft';
import { packRcpt, unpackRcpt, type Draft, type Rcpt } from '@/modules/sheet/fill/draft';
import { fmtInc, parseInc } from '@/modules/sheet/bagtsSheet';

/* ══════════════ Баганууд — notebook (`notebook_draft191.py`)-ийн нэртэй ЯГ ижил ══════════════ */

/** Баганын нэрс. ⚠️ Кирилл нэр нь 24 эх хуудсанд Enterprise-ийн хадгалсан ЯГ хэлбэр (жижиг үсэг · `__`) */
export const COL = {
  dkey: 'dkey', usr: 'usr', pkg: 'pkg', at: 'at', payload: 'payload',
  turul: 'mur_turul', key: 'mur_key', suuri: 'suuri', nturul: 'noorog_turul', ver: 'huvilbar',
  cleared: 'tseverlesen_at', legacy: 'huuchin_at', jaazOid: 'jaaz_oid', jaazSeen: 'jaaz_harsan',
  oid: 'mur_oid', dav: 'mur_dav', davN: 'mur_dav_n', path: 'etseg_zam', blkIdx: 'blok_idx', blk: 'blok',
  ym: 'sar_txt', too: 'sar_too', empty: 'hoosolson', niit: 'niit', bt: 'barimt_harsan', sentAt: 'ilgeesen_huvilbar',
  st: 'tuluv', stAt: 'tuluv_at', stSeq: 'tuluv_seq', tgtOid: 'zorilt_oid', tgtFill: 'zorilt_fillms',
  des: 'des_dugaar', no: 'f_', work: 'ажил',
  ob: 'obyem_sum', act: 'бодит_гүйцэтгэл', ps: 'төлөвлөгөөт_хуваарь__эхлэх', pe: 'төлөвлөгөөт_хуваарь__дуусах',
  gs: 'geree_ehleh', ge: 'geree_duusah', as: 'bodit_ehleh', ae: 'bodit_duusah', ham: 'hamaaral', hun: 'hun_huch',
  mash: 'mashin_mehanizm', asOf: 'шинэчлэгдсэн_огноо', mob: 'obyem',
} as const;

/** 191-д notebook-ийн НЭМЭХ 42 багана (дараалал нь notebook-ийнхтэй ижил) — `rowsReady` эдгээрийг ЯГ нэрээр шалгана */
export const ROW_FIELDS: readonly string[] = [
  COL.turul, COL.key, COL.suuri, COL.nturul, COL.ver, COL.cleared, COL.legacy, COL.jaazOid, COL.jaazSeen,
  COL.oid, COL.dav, COL.davN, COL.path, COL.blkIdx, COL.blk, COL.ym, COL.too, COL.empty, COL.niit, COL.bt, COL.sentAt,
  COL.st, COL.stAt, COL.stSeq, COL.tgtOid, COL.tgtFill,
  COL.des, COL.no, COL.work,
  COL.ob, COL.act, COL.ps, COL.pe, COL.gs, COL.ge, COL.as, COL.ae, COL.ham, COL.hun, COL.mash, COL.asOf, COL.mob,
];
/** Бүтцийн хувилбар — толгойн `huvilbar`; үүнээс ИХ бол энэ клиент бичихгүй (шинэ бүтэц) */
export const ROW_VERSION = 3;
/** Tombstone · хоосон мөрийн амьдрах хугацаа (`DEL_TTL_MS`, `HD_DEL_TTL`-тэй ижил) */
export const ROW_TTL = 7 * 24 * 3600 * 1000;
/** `mur_key`-ийн дээд урт — notebook-ийн `mur_key` String(160) */
export const KEY_MAX = 160;

export type Val = string | number | null;
export type Attrs = Record<string, Val>;
/** `noorog_turul` — самбар `dkey` задлахгүйгээр шүүнэ */
export type NKind = 'guitsetgel' | 'plan' | 'geree' | 'ilgeelt' | 'huvaari_ilgeelt';
/** `mur_turul` — `ustgal` (tombstone мөр) нь 2026-10-26-ны загварын нэмэлт */
export type Turul = 'tolgoi' | 'ajil' | 'sar_obyem' | 'sar_noots' | 'barimt' | 'oroltsogch' | 'ustgal';

/* ══════════════ Түлхүүр (`dkey`) — хуучин кодын шүүлтэд ХЭЗЭЭ Ч таарахгүй (`n:` угтвар, `|`-гүй) ══════════════ */
export const perfDkey = (pkg: string): string => `n:${pkg}`;
export const planDkey = (kind: HDKind, pkg: string): string => `n:plan:${kind}:${pkg}`;
export const subDkey = (oid: number): string => `n:sub:${oid}`;
export const hsubDkey = (oid: number): string => `n:hsub:${oid}`;
/** Хуучин JSON түлхүүр (`plan:<төрөл>:<багц>`) → шинэ (`n:plan:…`) */
export const planDkeyOfLegacy = (legacy: string): string => `n:${legacy}`;

/* ══════════════ Утгын туслахууд ══════════════ */
const DAY = 86_400_000;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const int = (x: unknown): number | null => { const v = num(x); return v == null ? null : Math.floor(v); };
const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
/** UTC өдөрт тэгшитгэнэ (`bagtsSheet.normDayMs`-ийн дүрэм) */
const normDay = (ms: number | null): number | null => (ms == null ? null : Math.round(ms / DAY) * DAY);
/** 'YYYY-MM-DD' → UTC шөнө дунд мс; задрахгүй бол null */
export const ymdToMs = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export const msToYmd = (ms: number): string => new Date(normDay(ms) ?? ms).toISOString().slice(0, 10);
/** Харьцуулалтын хэвшил — `''`/`undefined` нь null (ArcGIS хоосон мөрийг null болгож болно) */
const nv = (v: unknown): Val => (v === undefined || v === '' ? null : (v as Val));
const USER_MAX = 128;
const cutUser = (u: string | undefined | null): string | null => (u ? u.trim().toLowerCase().slice(0, USER_MAX) : null);

/** `hoosolson` мөр ↔ олонлог */
export const listedOf = (a: Attrs | undefined): Set<string> =>
  new Set(typeof a?.[COL.empty] === 'string' ? (a[COL.empty] as string).split(',').map((s) => s.trim()).filter(Boolean) : []);
const listStr = (s: Iterable<string>): string | null => { const l = [...new Set(s)].sort(); return l.length ? l.join(',') : null; };

/* ══════════════ Нүдний утга (гүйцэтгэл) ══════════════ */

/**
 * Нэмэлтийн мөр («15 %10», «%10», «-3», «0», «=55») → `obyem_sum` · `бодит_гүйцэтгэл` (0–1) · `niit`.
 * ⚠️ Задрахгүй (хог) мөр → `null` — БИЧИГДЭХГҮЙ (локалд үлдэнэ). «=» угтвар = хуучин НИЙТ утга (`niit=1`).
 */
export function cellToCols(v0: string): { ob: number | null; act: number | null; niit: number | null; blank?: true } | null {
  const tot = v0.startsWith('=');
  const v = tot ? v0.slice(1) : v0;
  /* ⚠️ 2026-10-26 (амьд 191-ийн эргэлт, R1): '' = ИЛ ХООСОЛСОН нүд (хуучин НИЙТ горим) — `obyem_sum`-ыг `hoosolson`-д
     жагсааж хадгална; эс бөгөөс `done|…` мөр рүү шилжихдээ нүд алга болдог байв */
  if (!v.trim()) return { ob: null, act: null, niit: tot ? 1 : null, blank: true };
  const x = parseInc(v);
  if (!x) return null;
  /* ⚠️ Аль баганад орохыг ТЭМДЭГТЭЭР (`%` угтвар) — утгаар биш: НИЙТ горимд '%0' (хувь 0) ≠ '0' (обьём 0) */
  const toks = v.trim().split(/\s+/);
  const hasP = toks.some((t) => t.startsWith('%'));
  const hasN = toks.some((t) => !t.startsWith('%'));
  return { ob: hasN ? x.n : null, act: hasP ? x.p : null, niit: tot ? 1 : null };
}
/**
 * `cellToCols`-ийн урвуу; утгагүй бол null. `blank` — `obyem_sum` `hoosolson`-д жагсаагдсан (ил хоосолсон нүд) бол
 * утгагүй ч '' (НИЙТ горимд '=') буцаана.
 */
export function colsToCell(ob: unknown, act: unknown, niit: unknown, blank = false): string | null {
  const n = num(ob);
  const p = num(act);
  if (n == null && p == null) return blank ? (num(niit) === 1 ? '=' : '') : null;
  const parts: string[] = [];
  if (n != null) parts.push(n === 0 ? '0' : fmtInc({ n, p: 0 }));
  if (p != null) parts.push(p === 0 ? '%0' : fmtInc({ n: 0, p }));
  const s = parts.join(' ');
  return num(niit) === 1 ? `=${s}` : s;
}

/* ══════════════ Мөрийн тодорхойлолт ══════════════ */

/** Хүссэн мөр — `a` нь танихуун + БҮХ бүлгийн багана (null = тохируулаагүй), `e` = ил хоосолсон багана */
/**
 * Хүссэн мөр. `gs` — бүлэг бүрийн ЯГ агшин/хэрэглэгч (нүднийх): бичигч өөрийн зурагт тавина (`stampRow`-ийн ⚠️ — бусад клиент
 * мөрийн `at`-аар л мэднэ).
 */
export type Want = { k: string; t: Turul; a: Attrs; e: Set<string>; at: number; u: string | null; unit: string; base?: boolean; gs?: Record<string, [number, string]> };
/** Бүлгийн ЯГ агшныг тэмдэглэнэ (`Want.gs`) */
const groupStamp = (w: Want, cols: readonly string[], at: number, u: string | undefined | null): void => {
  (w.gs ??= {})[cols.join(',')] = [at, (u ?? '').trim().toLowerCase()];
};
export type WantSet = { hdr: Attrs; rows: Map<string, Want> };

/** Танихууны багана — бүлгийн бус (бичихэд шинэчлэгдэнэ, агшин хөдлөхгүй) */
export const ID_COLS: readonly string[] = [COL.des, COL.no, COL.work, COL.oid, COL.dav, COL.davN, COL.path, COL.blkIdx, COL.blk, COL.ym];
/** Утгын бүх багана — мөр «хоосон» эсэхийг шалгахад */
export const VAL_COLS: readonly string[] = [
  COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.gs, COL.ge, COL.as, COL.ae, COL.ham, COL.hun, COL.mash, COL.asOf, COL.mob,
  COL.bt, COL.st, COL.stAt, COL.stSeq, COL.tgtOid, COL.tgtFill, COL.sentAt,
];

/**
 * БАГАНЫН БҮЛЭГ (нийлүүлэлтийн нэгж) — ноорогийн төрөл · мөрийн төрөл · түлхүүрээс.
 * ⚠️ Хуваарийн муж (`SPAN`) АТОМ — эхлэх/дуусах хоёрыг хамтран засагчид холилдвол хүчингүй муж үүснэ.
 *    Гүйцэтгэлийн огноо (`:s`/`:e`) нь ТУСДАА нүд (FillNew) тул тусдаа бүлэг.
 * ⚠️ Сарын цувааны мөрд `at` ч бүлэгт (цуваа = нэг агшинтай үе, `seriesRead`).
 */
export function groupsOf(kind: NKind, t: string, k: string): string[][] {
  const kk = k.startsWith('b:') ? k.slice(2) : k;
  if (t === 'ustgal') return [[COL.at]];
  if (t === 'oroltsogch') return [[COL.st, COL.stSeq, COL.stAt, COL.tgtOid, COL.tgtFill]];
  if (t === 'barimt') return [[COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.sentAt]];
  if (t === 'sar_obyem') return [[COL.mob, COL.too, COL.at]];
  if (t === 'sar_noots') return [[COL.hun, COL.mash, COL.too, COL.at]];
  if (kk === '*' || kk === 'o') return [[COL.asOf]];
  if (kind === 'guitsetgel') {
    if (k.startsWith('b:s:')) return [[COL.ps]];
    if (k.startsWith('b:e:')) return [[COL.pe]];
    return [[COL.ob, COL.act, COL.niit], [COL.ps], [COL.pe], [COL.bt], [COL.st, COL.stAt]];
  }
  if (kind === 'plan' || kind === 'geree' || kind === 'huvaari_ilgeelt') {
    const span = kind === 'geree' ? [COL.gs, COL.ge] : [COL.ps, COL.pe];
    if (k.startsWith('b:s:')) return [span];
    if (k.startsWith('b:a:')) return [[COL.as, COL.ae]];
    if (k.startsWith('b:h:')) return [[COL.ham]];
    if (k.startsWith('b:r:')) return [[COL.hun, COL.mash]];
    /* `w:<id>:<блок>` — блокийн мөр · `w:<id>` — ажлын мөр */
    return /^w:[^:]+:\d+$/.test(k) ? [span, [COL.as, COL.ae]] : [[COL.ham], [COL.hun, COL.mash]];
  }
  /* илгээлт (MVCC — мөр бичигдсэний дараа өөрчлөгдөхгүй) — бүх утга нэг бүлэг */
  return [[COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.asOf]];
}

/** Бүлэг «ноорогт байгаа» эсэх: аль нэг багана null биш ЭСВЭЛ жагсаагдсан */
const present = (a: Attrs, l: Set<string>, cols: readonly string[]): boolean =>
  cols.some((c) => c !== COL.at && c !== COL.too && (nv(a[c]) != null || l.has(c)));
/** Мөр хоосон уу — утгын багана бүгд null, жагсаалтгүй (tombstone/толгойг тооцохгүй) */
export const isEmptyRow = (a: Attrs): boolean =>
  /* ⚠️ `hoosolson` дахь ТАНИХУУНЫ багана (`ажил` — « ¦ »-гүй шошгын тэмдэг, R2) утга биш — мөрийг «хоосон биш» болгохгүй */
  VAL_COLS.every((c) => nv(a[c]) == null) && ![...listedOf(a)].some((c) => !ID_COLS.includes(c));
/** Бүлгийн гарын үсэг (утга + жагсаалт) — агшин гаргахад */
const groupSig = (a: Attrs, l: Set<string>, cols: readonly string[]): string =>
  JSON.stringify(cols.filter((c) => c !== COL.at).map((c) => [nv(a[c]), l.has(c) ? 1 : 0]));

/* ══════════════ Бүлгийн агшин (зурагтай жишиж гаргах) ══════════════ */

/** `[гарын үсэг, агшин, хэрэглэгч]` */
export type Stamp = [string, number, string];
export type Stamps = Record<string, Stamp>;
/**
 * МӨРИЙН БҮЛЭГ БҮРИЙН АГШИН — өмнөх зурагтай (`prev`) жишинэ: бүлгийн утга ӨӨРЧЛӨГДСӨН (эсвэл анх) бол мөрийн `at`/`usr`,
 * эс бөгөөс өмнөхийнх хэвээр. ⚠️ Мөрийн `at` нь бүлгүүдийн агшны ДЭЭД тул анх уншихад бүлгийн жинхэнэ агшнаас их байж
 * болно (баримтжуулсан хязгаар — нүд бүрийн агшны багана байхгүй); зураг localStorage-д хадгалагдаж нарийсна.
 */
export function stampRow(prev: Stamps | undefined, a: Attrs, groups: string[][]): Stamps {
  const l = listedOf(a);
  const at = num(a[COL.at]) ?? 0;
  const u = typeof a[COL.usr] === 'string' ? (a[COL.usr] as string).toLowerCase() : '';
  const out: Stamps = {};
  for (const g of groups) {
    const name = g.join(',');
    const s = groupSig(a, l, g);
    const p = prev?.[name];
    out[name] = p && p[0] === s ? p : [s, at, u];
  }
  return out;
}
/**
 * БИЧИГЧИЙН ЗУРАГ — бичсэн мөрийн бүлэг бүрд нүдний ЯГ агшныг (`Want.gs`) тавина (бусад бүлэг `stampRow`-ийн дүрмээр).
 * ⚠️ Бичигч өөрийн дараагийн уншилтад нүдний агшныг алдахгүй — эс бөгөөс нэг мөрийн өөр бүлгийн шинэ агшин хуучин бүлэгт наалдана.
 */
export function stampWant(prev: Stamps | undefined, a: Attrs, w: Want, groups: string[][]): Stamps {
  const st = stampRow(prev, a, groups);
  if (!w.gs) return st;
  const l = listedOf(a);
  for (const g of groups) {
    const name = g.join(',');
    const x = w.gs[name];
    if (x) st[name] = [groupSig(a, l, g), x[0], x[1]];
  }
  return st;
}
const stampOf = (st: Stamps | undefined, cols: readonly string[], a: Attrs): { at: number; u: string } => {
  const s = st?.[cols.join(',')];
  return s ? { at: s[1], u: s[2] } : { at: num(a[COL.at]) ?? 0, u: typeof a[COL.usr] === 'string' ? (a[COL.usr] as string).toLowerCase() : '' };
};

/* ══════════════ Давхардал (нэгдмэл индексгүй — зэрэг нэмэлт) ══════════════ */

/**
 * НЭГ `mur_key`-ийн ОЛОН мөр → нэг харагдац: бүлэг бүрийг тэр бүлэгтэй хамгийн ШИНЭ (`at`) мөрөөс, танихууныг хамгийн бага
 * OBJECTID-оос. Дараагийн бичигч нийлбэрийг бага OBJECTID-д бичиж бусдыг устгана (`diffRows`).
 */
export function mergeDupes(rows: readonly Attrs[], groups: string[][]): Attrs {
  if (rows.length === 1) return rows[0];
  const byOid = [...rows].sort((x, y) => (num(x.objectid) ?? 0) - (num(y.objectid) ?? 0));
  const out: Attrs = { ...byOid[0] };
  /* Танихууны жагсаалт (« ¦ »-гүй шошгын тэмдэг) — танихуунтай хамт бага OBJECTID-оос */
  const l = new Set<string>([...listedOf(byOid[0])].filter((c) => ID_COLS.includes(c)));
  let at = 0;
  let usr: Val = out[COL.usr] ?? null;
  for (const r of byOid) { const t = num(r[COL.at]) ?? 0; if (t >= at) { at = t; usr = r[COL.usr] ?? null; } }
  for (const g of groups) {
    let best: Attrs | null = null;
    for (const r of byOid) {
      if (!present(r, listedOf(r), g)) continue;
      if (!best || (num(r[COL.at]) ?? 0) > (num(best[COL.at]) ?? 0)) best = r;
    }
    for (const c of g) if (c !== COL.at) out[c] = best ? best[c] ?? null : null;
    if (best) { const bl = listedOf(best); for (const c of g) if (bl.has(c)) l.add(c); }
  }
  out[COL.empty] = listStr(l);
  out[COL.at] = at;
  out[COL.usr] = usr;
  return out;
}

/* ══════════════ Дифф (зураг ↔ хүссэн) ══════════════ */

export type Op =
  | { op: 'add'; k: string; unit: string; a: Attrs }
  | { op: 'update'; k: string; unit: string; oid: number; a: Attrs }
  | { op: 'delete'; k: string; unit: string; oid: number };

/** Зургийн мөр — `mur_key` бүрд биет мөрүүд (OBJECTID өсөхөөр) */
export type ImgRows = ReadonlyMap<string, readonly Attrs[]>;

/** Нэмэх атрибут — хүссэн мөрөөс */
export function addAttrs(w: Want, base: { dkey: string; pkg: string; kind: NKind }): Attrs {
  return {
    [COL.dkey]: base.dkey, [COL.pkg]: base.pkg, [COL.nturul]: base.kind, [COL.turul]: w.t, [COL.key]: w.k,
    [COL.suuri]: w.base ? 1 : null, ...w.a, [COL.empty]: listStr(w.e), [COL.at]: w.at, [COL.usr]: w.u,
  };
}

/**
 * ДИФФ — «ноорог = мөрүүд» (хуучин JSON-ы бүтэн орлуулалттай ИЖИЛ утга зүй) ГЭХДЭЭ зөвхөн ӨӨРЧЛӨГДСӨН бүлгийг илгээнэ:
 *   · хүссэн, зурагт алга → нэмнэ;
 *   · хүссэн, зурагт бий → бүлэг бүрээр (утга + жагсаалт) зөрсөн бүлэг + `at`/`usr`/`hoosolson` (бусад бүлгийн жагсаалт хэвээр),
 *     танихуун зөрвөл түүнийг (агшингүй); давхардсан биет мөрийг устгана;
 *   · зурагт бий, хүсээгүй → `ustgal` бол устгана; хоосон биш бол ХООСОЛНО (`clearAt`) — бусад клиент өөрчлөлтийн уншилтаар
 *     харна; аль хэдийн хоосон бөгөөд `ROW_TTL`-ээс хуучин бол устгана (GC, `gcMax` хүртэл).
 * ⚠️ ЗӨВХӨН ЭНЭ клиентийн УНШСАН зураг — уншаагүй (хамтрагчийн шинэ) мөр ХӨНДӨГДӨХГҮЙ (дараагийн уншилт нийлүүлнэ).
 */
export function diffRows(
  img: ImgRows, want: ReadonlyMap<string, Want>, kind: NKind,
  base: { dkey: string; pkg: string; kind: NKind },
  opt: { clearAt: number; me: string | null; now: number; gcMax?: number; keep?: (k: string) => boolean; skipped?: string[] },
): Op[] {
  const ops: Op[] = [];
  let gc = opt.gcMax ?? 200;
  for (const [k, w] of want) {
    /* ⚠️ 2026-10-26: `mur_key` 160 тэмдэгтээс урт бол Enterprise БҮХ хэсгийг (толгойтой нь) татгалзаж ноорог хэзээ ч
       хадгалагдахгүй — ийм мөрийг алгасаж (локалд үлдэнэ) дуудагчид мэдээлнэ */
    if (k.length > KEY_MAX) { opt.skipped?.push(k); continue; }
    const phys = img.get(k) ?? [];
    if (!phys.length) { ops.push({ op: 'add', k, unit: w.unit, a: addAttrs(w, base) }); continue; }
    const groups = groupsOf(kind, w.t, k);
    const prim = phys[0];
    const pl = listedOf(prim);
    const a: Attrs = {};
    const sent: string[] = [];
    for (const g of groups) {
      const same = g.every((c) => (c === COL.at ? nv(prim[c]) === nv(w.at) : nv(prim[c]) === nv(w.a[c]) && pl.has(c) === w.e.has(c)));
      if (same) continue;
      for (const c of g) if (c !== COL.at) { a[c] = w.a[c] ?? null; sent.push(c); }
    }
    for (const c of ID_COLS) if (c in w.a && nv(prim[c]) !== nv(w.a[c])) a[c] = w.a[c] ?? null;
    if (nv(prim[COL.turul]) !== w.t) a[COL.turul] = w.t;
    if (nv(prim[COL.suuri]) !== (w.base ? 1 : null)) a[COL.suuri] = w.base ? 1 : null;
    if (sent.length || (w.t === 'ustgal' && nv(prim[COL.at]) !== w.at) || groups.some((g) => g.includes(COL.at) && nv(prim[COL.at]) !== w.at)) {
      const l = new Set([...pl].filter((c) => !sent.includes(c)));
      for (const c of sent) if (w.e.has(c)) l.add(c);
      a[COL.empty] = listStr(l);
      a[COL.at] = w.at;
      a[COL.usr] = w.u;
    }
    if (Object.keys(a).length) ops.push({ op: 'update', k, unit: w.unit, oid: num(prim.objectid) ?? 0, a });
    for (const d of phys.slice(1)) ops.push({ op: 'delete', k, unit: w.unit, oid: num(d.objectid) ?? 0 });
  }
  for (const [k, phys] of img) {
    if (want.has(k) || k === 'h' || !phys.length || opt.keep?.(k)) continue;
    const t = String(phys[0][COL.turul] ?? '');
    if (t === 'tolgoi') continue;
    const unit = unitOf(k);
    if (t === 'ustgal') { for (const d of phys) ops.push({ op: 'delete', k, unit, oid: num(d.objectid) ?? 0 }); continue; }
    const live = phys.filter((r) => !isEmptyRow(r) || num(r[COL.too]) != null);
    if (live.length) {
      const a: Attrs = {};
      for (const c of VAL_COLS) a[c] = null;
      /* ⚠️ `sar_too` ч арилна — цэвэрлэсэн сарын мөр/тэмдэг цувааны уншилтад (`seriesRead`) тооцогдохгүй */
      a[COL.too] = null;
      a[COL.empty] = null; a[COL.at] = opt.clearAt; a[COL.usr] = opt.me;
      for (const r of live) ops.push({ op: 'update', k, unit, oid: num(r.objectid) ?? 0, a: { ...a } });
      continue;
    }
    for (const d of phys) {
      if (gc <= 0) break;
      if (opt.now - (num(d[COL.at]) ?? 0) > ROW_TTL) { ops.push({ op: 'delete', k, unit, oid: num(d.objectid) ?? 0 }); gc -= 1; }
    }
  }
  return ops;
}

/** Хэсэглэлтийн нэгж — сарын цуваа (`m:`/`n:` + суурь) нэг хэсэгт; бусад мөр тус бүр */
export function unitOf(k: string): string {
  const kk = k.startsWith('b:') ? k.slice(2) : k;
  if (kk.startsWith('m:') || kk.startsWith('n:')) return `${kk[0]}:${seriesOf(kk)}`;
  return k;
}
/** Сарын мөрийн түлхүүр `m:<id>:<блок>:<YYYY-MM|->` → `<id>:<блок>` */
const seriesOf = (kk: string): string => kk.slice(2, kk.lastIndexOf(':'));

/* ══════════════ Хуваарийн ноорог (HDDraft) ══════════════ */

export type PlanCtx = { n: number; rows: ReadonlyMap<number, HDRowBase>; bld?: readonly string[] } | null;
/** `bare` — хуучин `rowKeys` шошго « ¦ »-гүй (бүтэн шошго `f_`-д, `ажил` NULL, `hoosolson`-д `ажил` — R2) */
type IdInfo = { id: string; des: number | null; no: string; work: string; path?: string; occ?: number; occN?: number; bare?: boolean };
/** Танихууны `hoosolson` тэмдэг — « ¦ »-гүй шошго */
const idListed = (x: IdInfo): Set<string> => new Set(x.bare ? [COL.work] : []);
/** Мөрөөс шошго — « ¦ »-гүй тэмдэгтэй бол `f_` бүтнээр, эс бөгөөс `<№> ¦ <ажил>` */
const labelOf = (a: Attrs, no: string, work: string): { label: string; bare: boolean } => {
  const bare = !work && listedOf(a).has(COL.work);
  return { label: bare ? no : `${no} ¦ ${work}`, bare };
};

/** Ажлын танихуун — одоогийн мөр (`ctx`) → ноорогийн `rk` → нэмэлт эх; код (`des_dugaar`) байвал `d<код>`, эс бөгөөс `o<oid>` */
function planId(d: HDDraft, ctx: PlanCtx, oid: number, extra?: ReadonlyMap<number, HDRowKey>): IdInfo {
  const r = ctx?.rows.get(oid);
  const k = d.rk?.get(oid) ?? extra?.get(oid);
  const des = r?.des ?? k?.des ?? null;
  return {
    id: des != null ? `d${des}` : `o${oid}`, des,
    no: r?.no ?? k?.no ?? '', work: r?.work ?? k?.work ?? '',
    path: r?.path ?? k?.path, occ: r?.occ ?? k?.occ, occN: r?.occN ?? k?.occN,
  };
}
const idAttrs = (x: IdInfo, oid: number | null): Attrs => ({
  [COL.des]: x.des, [COL.no]: str(x.no?.slice(0, 255)), [COL.work]: str(x.work?.slice(0, 255)), [COL.oid]: oid,
  [COL.dav]: x.occ ?? null, [COL.davN]: x.occN ?? null, [COL.path]: str(x.path?.slice(0, 1000)),
});
const blkAttrs = (b: number | null, bld: readonly string[] | undefined, n: number): Attrs => ({
  [COL.blkIdx]: b, [COL.blk]: b == null ? null : (str(bld?.[b]?.slice(0, 64)) ?? (n <= 1 ? 'Ажил' : null)),
});
const blank = (cols: readonly string[]): Attrs => Object.fromEntries(cols.map((c) => [c, null]));
/** Сарын түлхүүрийн код|блок → `<id>:<блок>` (код тоо бол `d<код>`) */
const monthId = (mkey: string): { mid: string; des: number | null; label: string } => {
  const cut = mkey.indexOf('|');
  const code = cut >= 0 ? mkey.slice(0, cut) : mkey;
  const label = cut >= 0 ? mkey.slice(cut + 1) : '';
  const des = /^-?\d+$/.test(code) ? Number(code) : null;
  return { mid: `${des != null ? `d${des}` : `k${code.replace(/:/g, '_')}`}:${label}`, des, label };
};
/** `<id>:<блок>` → HD сарын түлхүүрийн код|блок */
const monthKeyOf = (mid: string): string => {
  const cut = mid.indexOf(':');
  const id = mid.slice(0, cut);
  const label = mid.slice(cut + 1);
  /* `d<код>` · `k<код>` — угтвараа хасна */
  return `${id.slice(1)}|${label}`;
};

/**
 * HDDraft → хүссэн мөрүүд. Эхлээд `prune` (`merge(d, null)`); `val === bv` нүд бичигдэхгүй (`serialize`-ийн дүрэм).
 * ⚠️ Мөрийн агшин = бүлгүүдийн нүдний агшны ДЭЭД; tombstone — тусдаа `x:` мөр (агшин ЯГ).
 * @param extra танихууны нэмэлт эх (админы бүгдийг шилжүүлэх — хуудасны хүснэгтээс)
 */
export function planToRows(d0: HDDraft, ctx: PlanCtx, kind: HDKind, opt: { now?: number; extra?: ReadonlyMap<number, HDRowKey>; nkind?: NKind } = {}): WantSet {
  const now = opt.now ?? Date.now();
  const d = hdMerge(d0, null, now) ?? d0;
  const nk: NKind = opt.nkind ?? kind;
  const span = kind === 'geree' ? [COL.gs, COL.ge] : [COL.ps, COL.pe];
  const n = Math.max(1, ctx?.n || d.base.n || 1);
  const bld = ctx?.bld;
  const rows = new Map<string, Want>();
  const ensure = (k: string, t: Turul, idA: Attrs, cols: readonly string[], unit = k, isBase = false): Want => {
    let w = rows.get(k);
    if (!w) { w = { k, t, a: { ...idA, ...blank(cols) }, e: new Set(), at: 0, u: null, unit, ...(isBase ? { base: true } : {}) }; rows.set(k, w); }
    return w;
  };
  const stampW = (w: Want, at: number, u: string) => { if (at >= w.at) { w.at = at; w.u = cutUser(u); } };
  const putSpan = (w: Want, v: unknown) => {
    const s = v as { start?: unknown; end?: unknown } | null;
    const a0 = s && typeof s === 'object' ? num(s.start) : null;
    const a1 = s && typeof s === 'object' ? num(s.end) : null;
    if (a0 != null && a1 != null) { w.a[span[0]] = a0; w.a[span[1]] = a1; } else { w.e.add(span[0]); w.e.add(span[1]); }
  };
  const putPair = (w: Want, cols: readonly string[], v: unknown, intOnly = false) => {
    const arr = Array.isArray(v) ? v : [];
    cols.forEach((c, i) => {
      const x = intOnly ? int(arr[i]) : num(arr[i]);
      if (x == null) w.e.add(c); else w.a[c] = x;
    });
  };
  const putHam = (w: Want, v: unknown) => {
    const s = typeof v === 'string' ? v : v == null ? '' : String(v);
    if (s) w.a[COL.ham] = s.slice(0, 255); else w.e.add(COL.ham);
  };
  /*
   * ⚠️ 2026-10-26 (R-H1): НЭГ ЛОГИК НҮДЭНД (ажил × бүлэг [× блок]) ХАМГИЙН ШИНЭ ОРОЛТ Л ХҮЧИНТЭЙ — утга ба танихуун (`mur_oid`)
   * хоёулаа тэр оролтоос. Хуучин/шинэ жаазны давхардсан oid нэг ажилд (`des`) буух үед Map-ын дарааллаар хуучин утга шинэ
   * агшинтай бичигдэх эрсдэлтэй байв (`planMigrate` · `migrateAll` · `planSyncSubmitted` шууд дууддаг). Тэнцвэл одоогийн
   * жаазад (`ctx.rows`) байгаа oid давамгайлна. Tombstone-ыг тэр нүдний шинэ-эсвэл-тэнцүү амьд оролт байвал алгасна.
   */
  const live = new Map<string, { k: string; at: number; cur: boolean }>();
  const logical = (type: string, oid: number, blk: number | null): string => {
    const x = planId(d, ctx, oid, opt.extra);
    return blk != null ? `${type}:${x.id}:${blk}` : `${type}:${x.id}`;
  };
  for (const [k, e] of d.entries) {
    if (e.bv !== undefined && sameVal(e.val, e.bv)) continue;
    const p = parseKey(k);
    if (!p || p.type === 'm' || p.type === 'n') continue;
    const lk = logical(p.type, p.oid, p.type === 's' || p.type === 'a' ? p.blk : null);
    const cur = !!ctx?.rows.has(p.oid);
    const o = live.get(lk);
    if (!o || e.at > o.at || (e.at === o.at && cur && !o.cur)) live.set(lk, { k, at: e.at, cur });
  }
  const idAt = new Map<string, number>();
  /* Нүд */
  for (const [k, e] of d.entries) {
    if (e.bv !== undefined && sameVal(e.val, e.bv)) continue;
    const p = parseKey(k);
    if (!p) continue;
    if (p.type === 'm' || p.type === 'n') { putSeries(rows, p.type, p.key, e, nk); continue; }
    if (live.get(logical(p.type, p.oid, p.type === 's' || p.type === 'a' ? p.blk : null))?.k !== k) continue;
    const x = planId(d, ctx, p.oid, opt.extra);
    const idA = idAttrs(x, p.oid);
    /** Мөрийн танихууныг (`mur_oid` г.м.) мөрийн хамгийн шинэ оролтоос */
    const own = (w: Want) => {
      if (e.at >= (idAt.get(w.k) ?? -1)) { idAt.set(w.k, e.at); Object.assign(w.a, idA); }
    };
    if (p.type === 's' || p.type === 'a') {
      const cols = [...span, COL.as, COL.ae];
      const w = ensure(`w:${x.id}:${p.blk}`, 'ajil', { ...idA, ...blkAttrs(p.blk, bld, n) }, cols);
      own(w);
      if (p.type === 's') putSpan(w, e.val); else putPair(w, [COL.as, COL.ae], e.val);
      stampW(w, e.at, e.user);
      groupStamp(w, p.type === 's' ? span : [COL.as, COL.ae], e.at, e.user);
      if (e.bv !== undefined) {
        const bw = ensure(`b:${p.type}:${x.id}:${p.blk}`, 'ajil', { ...idA, ...blkAttrs(p.blk, bld, n) }, p.type === 's' ? span : [COL.as, COL.ae], `b:${p.type}:${x.id}:${p.blk}`, true);
        if (e.bv !== null) { if (p.type === 's') putSpan(bw, e.bv); else putPair(bw, [COL.as, COL.ae], e.bv); }
        stampW(bw, e.at, e.user);
      }
    } else {
      const w = ensure(`w:${x.id}`, 'ajil', { ...idA, ...blkAttrs(null, bld, n) }, [COL.ham, COL.hun, COL.mash]);
      own(w);
      if (p.type === 'h') putHam(w, e.val); else putPair(w, [COL.hun, COL.mash], e.val, true);
      stampW(w, e.at, e.user);
      groupStamp(w, p.type === 'h' ? [COL.ham] : [COL.hun, COL.mash], e.at, e.user);
      if (e.bv !== undefined) {
        const bk = `b:${p.type}:${x.id}`;
        const bw = ensure(bk, 'ajil', { ...idA, ...blkAttrs(null, bld, n) }, p.type === 'h' ? [COL.ham] : [COL.hun, COL.mash], bk, true);
        if (e.bv !== null) { if (p.type === 'h') putHam(bw, e.bv); else putPair(bw, [COL.hun, COL.mash], e.bv, true); }
        stampW(bw, e.at, e.user);
      }
    }
  }
  /* Tombstone — тусдаа мөр (агшин ЯГ) */
  for (const [k, t] of d.del) {
    if (d.entries.has(k)) continue;
    const p = parseKey(k);
    if (!p) continue;
    let tk: string;
    let idA: Attrs;
    if (p.type === 'm' || p.type === 'n') {
      const m = monthId(p.key);
      tk = `x:${p.type}:${m.mid}`;
      idA = { [COL.des]: m.des, [COL.blk]: str(m.label.slice(0, 64)) };
    } else {
      const x = planId(d, ctx, p.oid, opt.extra);
      const blk = p.type === 's' || p.type === 'a' ? p.blk : null;
      const lv = live.get(logical(p.type, p.oid, blk));
      if (lv && lv.at >= t) continue;
      tk = blk != null ? `x:${p.type}:${x.id}:${blk}` : `x:${p.type}:${x.id}`;
      idA = { ...idAttrs(x, p.oid), [COL.blkIdx]: blk };
    }
    const w = ensure(tk, 'ustgal', idA, []);
    if (t >= w.at) { w.at = t; w.u = null; }
  }
  const hdr: Attrs = {
    [COL.turul]: 'tolgoi', [COL.key]: 'h', [COL.ver]: ROW_VERSION, [COL.at]: d.t || now, [COL.usr]: cutUser(d.by.user),
    [COL.cleared]: d.cleared ?? null,
    /* ⚠️ `HDDraft.base` — блокийн тоо (`blok_idx`) ба серверийн суурийн агшин (`jaaz_harsan`) толгойд */
    [COL.blkIdx]: d.base.n, [COL.jaazSeen]: d.base.at || null,
  };
  return { hdr, rows };
}

/** Сарын цуваа — сар бүрд мөр (`at` = нүдний агшин, `sar_too` = мөрийн тоо), хоосон бол `-` тэмдэг мөр; суурь тусдаа цуваа */
function putSeries(rows: Map<string, Want>, type: 'm' | 'n', mkey: string, e: HDEntry, _nk: NKind): void {
  const m = monthId(mkey);
  const t: Turul = type === 'm' ? 'sar_obyem' : 'sar_noots';
  const cols = type === 'm' ? [COL.mob] : [COL.hun, COL.mash];
  const unit = `${type}:${m.mid}`;
  const idA: Attrs = { [COL.des]: m.des, [COL.blk]: str(m.label.slice(0, 64)) };
  const write = (prefix: string, v: unknown, isBase: boolean) => {
    const months: [string, Val, Val][] = type === 'm'
      ? monthsVal(monthsOfVal(v)).map(([ym, x]): [string, Val, Val] => [ym, x, null])
      : resVal(resOfVal(v)).map(([ym, h, ma]): [string, Val, Val] => [ym, h, ma]);
    const too = v === null && isBase ? -1 : months.length;
    if (!months.length) {
      const k = `${prefix}${type}:${m.mid}:-`;
      const w: Want = { k, t, a: { ...idA, [COL.ym]: null, ...blank(cols), [COL.too]: too }, e: new Set(too === -1 ? [] : cols), at: e.at, u: cutUser(e.user), unit, ...(isBase ? { base: true } : {}) };
      rows.set(k, w);
      return;
    }
    for (const [ym, x, y] of months) {
      const k = `${prefix}${type}:${m.mid}:${ym}`;
      const a: Attrs = { ...idA, [COL.ym]: ym, [COL.too]: too };
      if (type === 'm') a[COL.mob] = x; else { a[COL.hun] = x; a[COL.mash] = y; }
      rows.set(k, { k, t, a, e: new Set(), at: e.at, u: cutUser(e.user), unit, ...(isBase ? { base: true } : {}) });
    }
  };
  write('', e.val, false);
  if (e.bv !== undefined) write('b:', e.bv, true);
}

/** Сарын цувааг унших — хамгийн их `at`-тай ХООСОН БУС мөрүүд; тоо нь `sar_too`-той зөрвөл дутуу (агшин − 1) */
export function seriesRead(rows: readonly Attrs[], type: 'm' | 'n'): { val: unknown; at: number; user: string; nul?: boolean } | null {
  /* ⚠️ Амьд мөр: `sar_too`-тай (цэвэрлэсэн мөрд null) БӨГӨӨД утгатай, эсвэл тэмдэг мөр (`sar_txt` null, `sar_too` ≤ 0) —
     цэвэрлэсэн мөрийн (бичих агшинтай) `at` цувааны агшныг дарахгүй */
  const cand = rows.filter((a) => num(a[COL.too]) != null && (!isEmptyRow(a) || (nv(a[COL.ym]) == null && (num(a[COL.too]) ?? 1) <= 0)));
  let amax = -1;
  for (const a of cand) { const t = num(a[COL.at]) ?? 0; if (t > amax) amax = t; }
  const live = cand.filter((a) => (num(a[COL.at]) ?? 0) === amax);
  if (!live.length) return null;
  const lead = live[0];
  const user = typeof lead[COL.usr] === 'string' ? (lead[COL.usr] as string).toLowerCase() : '';
  if (live.some((a) => nv(a[COL.ym]) == null)) {
    const too = num(lead[COL.too]) ?? 0;
    return { val: too === -1 ? null : [], at: amax, user, ...(too === -1 ? { nul: true } : {}) };
  }
  const too = num(lead[COL.too]);
  const at = too != null && live.length !== too ? amax - 1 : amax;
  if (type === 'm') {
    const v = new Map<string, number>();
    for (const a of live) { const ym = str(a[COL.ym]); const x = num(a[COL.mob]); if (ym && x != null) v.set(ym, x); }
    return { val: monthsVal(v), at, user };
  }
  const v = new Map<string, { hun: number | null; mashin: number | null }>();
  for (const a of live) {
    const ym = str(a[COL.ym]);
    const h = int(a[COL.hun]); const ma = int(a[COL.mash]);
    if (ym && (h != null || ma != null)) v.set(ym, { hun: h, mashin: ma });
  }
  return { val: resVal(v), at, user };
}

/** Мөрүүдийг `mur_key`-ээр бүлэглэж давхардлыг нийлүүлсэн харагдац */
export function viewOf(rows: Iterable<Attrs>, kind: NKind): Map<string, Attrs> {
  const by = new Map<string, Attrs[]>();
  for (const a of rows) {
    const k = typeof a[COL.key] === 'string' ? (a[COL.key] as string) : '';
    if (!k) continue;
    const l = by.get(k);
    if (l) l.push(a); else by.set(k, [a]);
  }
  const out = new Map<string, Attrs>();
  for (const [k, l] of by) out.set(k, mergeDupes(l, groupsOf(kind, String(l[0][COL.turul] ?? ''), k)));
  return out;
}

const rkOf = (a: Attrs): HDRowKey | null => {
  if (a[COL.des] == null && a[COL.no] == null && a[COL.work] == null && a[COL.path] == null) return null;
  const id: HDRowKey = { des: num(a[COL.des]), no: str(a[COL.no]) ?? '', work: str(a[COL.work]) ?? '' };
  if (str(a[COL.path])) id.path = a[COL.path] as string;
  if (num(a[COL.dav]) != null) id.occ = a[COL.dav] as number;
  if (num(a[COL.davN]) != null) id.occN = a[COL.davN] as number;
  return id;
};

/**
 * Мөрүүд → HDDraft. Нүдний `oid` = `mur_oid` (бичих үеийн жааз), `rk` = танихууны баганаас — жааз солигдсон бол hook-ийн
 * `identityRemap` код → эцэг бүлгийн зам → «№ ¦ нэр» + дэс дугаараар зөөнө. Бүлгийн агшин `stamps`-аас (зурагтай жишсэн).
 * ⚠️ Блокийг НЭРЭЭР тулгана (`bld` өгсөн бол) — багцын блокийн дараалал солигдсон бол `blok_idx` хөрш блок руу заана.
 */
export function planFromRows(
  hdr: Attrs | null, view: ReadonlyMap<string, Attrs>, stamps: ReadonlyMap<string, Stamps>,
  meta: { kind: HDKind; pkg: string }, now = Date.now(), bld?: readonly string[],
): HDDraft {
  const span = meta.kind === 'geree' ? [COL.gs, COL.ge] : [COL.ps, COL.pe];
  const bldN = new Map<string, number>();
  for (const [i, nm] of (bld ?? []).entries()) bldN.set(nm, bldN.has(nm) ? -1 : i);
  const blkOf = (a: Attrs): number => {
    const i = num(a[COL.blkIdx]) ?? 0;
    const nm = typeof a[COL.blk] === 'string' ? a[COL.blk] as string : '';
    if (!nm || !bld?.length || bld[i] === nm) return i;
    const j = bldN.get(nm);
    return j != null && j >= 0 ? j : i;
  };
  const entries: HDEntries = new Map();
  const del = new Map<string, number>();
  const rk = new Map<number, HDRowKey>();
  const spanOf = (a: Attrs): unknown => {
    const s0 = num(a[span[0]]); const s1 = num(a[span[1]]);
    return s0 != null && s1 != null ? { start: s0, end: s1 } : null;
  };
  const pairOf = (a: Attrs, cols: readonly string[]): unknown => cols.map((c) => num(a[c]));
  const hamOf = (a: Attrs): string => (typeof a[COL.ham] === 'string' ? a[COL.ham] as string : '');
  const take = (k: string, e: HDEntry) => { const o = entries.get(k); if (!o || e.at > o.at) entries.set(k, e); };
  const series = new Map<string, Attrs[]>();
  const bseries = new Map<string, Attrs[]>();
  /** Суурь — бүлэг бүрд тусдаа мөр (`b:<s|a|h|r>:<id>[:<блок>]`): хоосон мөр = серверийн null, утга = суурь, мөр алга = үл мэдэгдэх */
  const bvOf = (bk: string, kind: 's' | 'a' | 'h' | 'r'): unknown => {
    const b = view.get(bk);
    if (!b) return undefined;
    if (isEmptyRow(b)) return null;
    return kind === 's' ? spanOf(b) : kind === 'a' ? pairOf(b, [COL.as, COL.ae]) : kind === 'h' ? hamOf(b) : pairOf(b, [COL.hun, COL.mash]);
  };
  const withBv = (e: HDEntry, bv: unknown): HDEntry => (bv === undefined ? e : { ...e, bv });
  for (const [k, a] of view) {
    const t = String(a[COL.turul] ?? '');
    if (t === 'tolgoi') continue;
    if (k.startsWith('b:')) {
      if (t === 'sar_obyem' || t === 'sar_noots') { const u = unitOf(k); const l = bseries.get(u); if (l) l.push(a); else bseries.set(u, [a]); }
      continue;
    }
    if (t === 'sar_obyem' || t === 'sar_noots') {
      const u = unitOf(k);
      const l = series.get(u);
      if (l) l.push(a); else series.set(u, [a]);
      continue;
    }
    const oid = num(a[COL.oid]);
    if (t === 'ustgal') {
      const at = num(a[COL.at]) ?? 0;
      const p = k.split(':');
      let dk: string | null = null;
      if (p[1] === 'm' || p[1] === 'n') dk = `${p[1]}:${monthKeyOf(k.slice(4))}`;
      else if (oid != null && (p[1] === 's' || p[1] === 'a')) dk = `${p[1]}:${oid}:${blkOf(a)}`;
      else if (oid != null && (p[1] === 'h' || p[1] === 'r')) dk = `${p[1]}:${oid}`;
      if (dk && (del.get(dk) ?? -1) < at) del.set(dk, at);
      /* ⚠️ 2026-10-26 (R-H2): устгалын мөрөөс ч ажлын танихуун — өөр жаазны oid-оор хийсэн устгалыг `huvaariStore.alignToFrame`
         одоогийн жаазны oid руу шилжүүлэхэд хэрэгтэй (эс бөгөөс хамтрагчийн устгал шинэ жаазтай хэрэглэгчид хүрэхгүй) */
      const xid = rkOf(a);
      if (xid && oid != null && !rk.has(oid)) rk.set(oid, xid);
      continue;
    }
    if (oid == null || !k.startsWith('w:')) continue;
    const st = stamps.get(k);
    const l = listedOf(a);
    const id = rkOf(a);
    if (id && !rk.has(oid)) rk.set(oid, id);
    const id0 = k.split(':')[1];
    if (/^w:[^:]+:\d+$/.test(k)) {
      const blk = blkOf(a);
      const b0 = k.slice(k.lastIndexOf(':') + 1);
      if (present(a, l, span)) {
        const s = stampOf(st, span, a);
        take(kS(oid, blk), withBv({ val: spanOf(a), at: s.at, user: s.u }, bvOf(`b:s:${id0}:${b0}`, 's')));
      }
      if (present(a, l, [COL.as, COL.ae])) {
        const s = stampOf(st, [COL.as, COL.ae], a);
        take(kA(oid, blk), withBv({ val: pairOf(a, [COL.as, COL.ae]), at: s.at, user: s.u }, bvOf(`b:a:${id0}:${b0}`, 'a')));
      }
    } else {
      if (present(a, l, [COL.ham])) {
        const s = stampOf(st, [COL.ham], a);
        take(kH(oid), withBv({ val: hamOf(a), at: s.at, user: s.u }, bvOf(`b:h:${id0}`, 'h')));
      }
      if (present(a, l, [COL.hun, COL.mash])) {
        const s = stampOf(st, [COL.hun, COL.mash], a);
        take(kR(oid), withBv({ val: pairOf(a, [COL.hun, COL.mash]), at: s.at, user: s.u }, bvOf(`b:r:${id0}`, 'r')));
      }
    }
  }
  for (const [u, rows] of series) {
    const type = u[0] as 'm' | 'n';
    const mk = monthKeyOf(u.slice(2));
    const r = seriesRead(rows, type);
    if (!r) continue;
    const e: HDEntry = { val: r.val, at: r.at, user: r.user };
    const bRows = bseries.get(u);
    if (bRows?.length) { const b = seriesRead(bRows, type); if (b) e.bv = b.nul ? null : b.val; }
    take(type === 'm' ? kM(mk) : kN(mk), e);
  }
  const t = num(hdr?.[COL.at]) ?? 0;
  const cleared = num(hdr?.[COL.cleared]);
  const d: HDDraft = {
    t, kind: meta.kind, pkg: meta.pkg,
    by: { user: typeof hdr?.[COL.usr] === 'string' ? (hdr[COL.usr] as string).toLowerCase() : '', at: t },
    entries, del,
    base: { at: num(hdr?.[COL.jaazSeen]) ?? 0, n: num(hdr?.[COL.blkIdx]) ?? 0 },
    ...(cleared ? { cleared } : {}),
    ...(rk.size ? { rk } : {}),
  };
  return hdMerge(d, null, now) ?? d;
}

/* ══════════════ Гүйцэтгэлийн ноорог (FillNew `Draft`) ══════════════ */

/** Хуудасны жааз (`setFillFrame`) — oid ↔ код · № · нэр · гүн, блокийн нэрс */
export type FrameRow = { oid: number; no: string; work: string; des: number | null; depth: number; group: boolean };
export type Frame = {
  bld: readonly string[];
  byOid: ReadonlyMap<number, IdInfo>;
  /** Код → одоогийн oid (давтагдашгүй кодоор л) */
  byDes: ReadonlyMap<number, number>;
};
export function buildFrame(rows: readonly FrameRow[], bld: readonly string[]): Frame {
  const live = rows.filter((r) => Number.isInteger(r.oid) && r.oid >= 0);
  const ids = rowIdentity(live);
  const cnt = new Map<number, number>();
  for (const r of live) if (r.des != null) cnt.set(r.des, (cnt.get(r.des) ?? 0) + 1);
  const byOid = new Map<number, IdInfo>();
  const byDes = new Map<number, number>();
  for (const r of live) {
    const uniq = r.des != null && cnt.get(r.des) === 1;
    const x = ids.get(r.oid);
    byOid.set(r.oid, { id: uniq ? `d${r.des}` : `o${r.oid}`, des: r.des, no: r.no, work: r.work, path: x?.path, occ: x?.occ, occN: x?.occN });
    if (uniq) byDes.set(r.des as number, r.oid);
  }
  return { bld, byOid, byDes };
}

/** Ноорогийн `rowKeys`/`rowOcc`-оос танихуун (жаазад алга хуучин oid) */
const draftId = (oid: number, label: string | undefined, occ: [number, number, number] | undefined): IdInfo => {
  const cut = label ? label.indexOf(' ¦ ') : -1;
  return {
    id: `o${oid}`, des: null,
    no: label ? (cut >= 0 ? label.slice(0, cut) : label) : '', work: label && cut >= 0 ? label.slice(cut + 3) : '',
    ...(occ ? { occ: occ[1] + 1, occN: occ[2] } : {}),
    ...(label && cut < 0 ? { bare: true } : {}),
  };
};
const userKey = (u: string): string => `u:${u.trim().toLowerCase().slice(0, 150)}`;

/**
 * FillNew `Draft` → хүссэн мөрүүд (`n:<багц>`).
 *   · нүд `${oid}:${b}` → `w:<id>:<b>`: `obyem_sum` · `бодит_гүйцэтгэл` (0–1 НЭМЭЛТ) · `niit` (хуучин «=» НИЙТ);
 *     огноо `:s`/`:e` → `төлөвлөгөөт_хуваарь__эхлэх/__дуусах` ('' → жагсаалт);
 *   · `bt` → `barimt_harsan` (мөрийн ДЭЭД) · `hold` → `tuluv` (`barisan`/`albadsan`) + `tuluv_at`;
 *   · `del` → `x:<v|s|e>:<id>:<b>` (`ustgal`) · `rcpt` → `r:<v|s|e>:<id>:<b>` (`barimt`, `at` = илгээсэн, `ilgeesen_huvilbar` = sa);
 *   · `datesB` → `b:<s|e>:<id>:<b>` · `asOf`/`asOfB` → `*`/`b:*` · `marks`/`tgt` → `u:<хэрэглэгч>` (`oroltsogch`);
 *   · `frameSeenAt` → толгойн `jaaz_oid`/`jaaz_harsan`. `conv` (анхааруулга) зөвхөн локал; `adds`/`sent` (хуучин) хаягдана.
 * ⚠️ Задрахгүй нүд (хог) БИЧИГДЭХГҮЙ — `skipped`-д буцна (дуудагч анхааруулна).
 */
export function perfToRows(
  d: Draft, frame: Frame | null, stale: ReadonlyMap<number, IdInfo>, now = Date.now(),
): WantSet & { skipped: string[] } {
  const rows = new Map<string, Want>();
  const skipped: string[] = [];
  const rkMap = new Map<number, string>(d.rowKeys ?? []);
  const occMap = new Map<number, [number, number, number]>((d.rowOcc ?? []).map((e): [number, [number, number, number]] => [e[0], e]));
  const idOf = (oid: number): IdInfo => frame?.byOid.get(oid) ?? stale.get(oid) ?? draftId(oid, rkMap.get(oid), occMap.get(oid));
  const n = Math.max(1, frame?.bld.length ?? 1);
  const by = new Map<string, string>(d.by ?? []);
  const byAt = new Map<string, number>(d.byAt ?? []);
  const split = (k: string): { oid: number; b: number; g: 'v' | 's' | 'e' } | null => {
    const m = /^(-?\d+):(\d+)(?::([se]))?$/.exec(k);
    return m ? { oid: Number(m[1]), b: Number(m[2]), g: (m[3] ?? 'v') as 'v' | 's' | 'e' } : null;
  };
  const W_COLS = [COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.bt, COL.st, COL.stAt];
  const ensure = (k: string, t: Turul, oid: number, b: number | null, cols: readonly string[], isBase = false): Want => {
    let w = rows.get(k);
    if (!w) {
      const x = idOf(oid);
      w = { k, t, a: { ...idAttrs(x, oid), ...blkAttrs(b, frame?.bld, n), ...blank(cols) }, e: idListed(x), at: 0, u: null, unit: k, ...(isBase ? { base: true } : {}) };
      rows.set(k, w);
    }
    return w;
  };
  const stampW = (w: Want, at: number, u: string | undefined) => { if (at >= w.at) { w.at = at; w.u = cutUser(u ?? ''); } };
  const live = new Set<string>();
  for (const [k, v] of d.cells) {
    const s = split(k);
    const c = s && s.g === 'v' ? cellToCols(String(v)) : null;
    if (!s || !c) { skipped.push(k); continue; }
    const w = ensure(`w:${idOf(s.oid).id}:${s.b}`, 'ajil', s.oid, s.b, W_COLS);
    w.a[COL.ob] = c.ob; w.a[COL.act] = c.act; w.a[COL.niit] = c.niit;
    if (c.blank) w.e.add(COL.ob);
    stampW(w, byAt.get(k) ?? d.t, by.get(k));
    groupStamp(w, [COL.ob, COL.act, COL.niit], byAt.get(k) ?? d.t, by.get(k));
    live.add(k);
  }
  for (const [k, v] of d.dates ?? []) {
    const s = split(k);
    if (!s || s.g === 'v') { skipped.push(k); continue; }
    const w = ensure(`w:${idOf(s.oid).id}:${s.b}`, 'ajil', s.oid, s.b, W_COLS);
    const col = s.g === 's' ? COL.ps : COL.pe;
    const ms = v ? ymdToMs(String(v)) : null;
    if (v && ms == null) { skipped.push(k); continue; }
    if (ms == null) w.e.add(col); else w.a[col] = ms;
    stampW(w, byAt.get(k) ?? d.t, by.get(k));
    groupStamp(w, [col], byAt.get(k) ?? d.t, by.get(k));
    live.add(k);
  }
  /* Баримтыг харсан агшин (мөрийн ДЭЭД) · тэмдэглэсэн нүд (мөрийн түвшин) */
  for (const [k, t] of d.bt ?? []) {
    const s = split(k);
    const w = s ? rows.get(`w:${idOf(s.oid).id}:${s.b}`) : undefined;
    if (w && live.has(k) && t > (num(w.a[COL.bt]) ?? 0)) w.a[COL.bt] = t;
  }
  for (const [k, at, force] of d.hold ?? []) {
    const s = split(k);
    const w = s ? rows.get(`w:${idOf(s.oid).id}:${s.b}`) : undefined;
    if (!w || !live.has(k)) continue;
    const prevF = w.a[COL.st] === 'albadsan';
    w.a[COL.st] = force === 1 || prevF ? 'albadsan' : 'barisan';
    const p = num(w.a[COL.stAt]);
    w.a[COL.stAt] = p == null ? at : Math.min(p, at);
  }
  /* Tombstone */
  for (const [k, t] of d.del ?? []) {
    if (live.has(k) || now - t > ROW_TTL) continue;
    const s = split(k);
    if (!s) continue;
    const x = idOf(s.oid);
    const tk = `x:${s.g}:${x.id}:${s.b}`;
    const w = ensure(tk, 'ustgal', s.oid, s.b, []);
    if (t >= w.at) { w.at = t; w.u = null; }
  }
  /* Илгээлтийн баримт — нүд/огноо бүрд тусдаа мөр (`a`, `sa` ЯГ) */
  for (const r of d.rcpt ? unpackRcpt(d.rcpt) : []) {
    if (now - r[1] > ROW_TTL) continue;
    const s = split(r[0]);
    if (!s) continue;
    const x = idOf(s.oid);
    const rk = `r:${s.g}:${x.id}:${s.b}`;
    const cur = rows.get(rk);
    if (cur && cur.at >= r[1]) continue;
    const w: Want = { k: rk, t: 'barimt', a: { ...idAttrs(x, s.oid), ...blkAttrs(s.b, frame?.bld, n), ...blank([COL.ob, COL.act, COL.niit, COL.ps, COL.pe]), [COL.sentAt]: r[3] }, e: idListed(x), at: r[1], u: null, unit: rk };
    if (s.g === 'v') {
      const c = r[2] ? cellToCols(r[2]) : null;
      if (c) { w.a[COL.ob] = c.ob; w.a[COL.act] = c.act; w.a[COL.niit] = c.niit; }
    } else {
      const ms = r[2] ? ymdToMs(r[2]) : null;
      /* ⚠️ '' (цэвэрлэсэн огноо эсвэл серверийн баримт) — утгагүй мөр; `rcptApply`-д хоёулаа ижил зан */
      if (ms != null) w.a[s.g === 's' ? COL.ps : COL.pe] = ms;
    }
    rows.set(rk, w);
  }
  /* Огнооны суурь */
  for (const [k, v] of d.datesB ?? []) {
    const s = split(k);
    if (!s || s.g === 'v' || !live.has(k)) continue;
    const col = s.g === 's' ? COL.ps : COL.pe;
    const w = ensure(`b:${s.g}:${idOf(s.oid).id}:${s.b}`, 'ajil', s.oid, s.b, [col], true);
    const ms = v ? ymdToMs(String(v)) : null;
    if (ms != null) w.a[col] = ms; else w.e.add(col);
    stampW(w, byAt.get(k) ?? d.t, by.get(k));
  }
  /* Шинэчлэгдсэн огноо */
  if (d.asOf !== undefined) {
    const w: Want = { k: '*', t: 'ajil', a: { [COL.asOf]: d.asOf }, e: new Set(d.asOf == null ? [COL.asOf] : []), at: d.asOfAt ?? d.t, u: null, unit: '*' };
    rows.set('*', w);
    if (d.asOfB !== undefined) {
      rows.set('b:*', { k: 'b:*', t: 'ajil', a: { [COL.asOf]: d.asOfB }, e: new Set(), at: d.asOfAt ?? d.t, u: null, unit: 'b:*', base: true });
    }
  }
  /* Оролцогч — «дуусгасан/дахин засах» ба буцаагдсан илгээлтийн зорилт */
  const parts = new Map<string, Want>();
  const part = (u: string): Want => {
    const k = userKey(u);
    let w = parts.get(k);
    if (!w) { w = { k, t: 'oroltsogch', a: blank([COL.st, COL.stSeq, COL.stAt, COL.tgtOid, COL.tgtFill]), e: new Set(), at: 0, u: cutUser(u), unit: k }; parts.set(k, w); }
    return w;
  };
  for (const [u, s, seq, at] of d.marks ?? []) {
    const w = part(u);
    w.a[COL.st] = s === 1 ? 'duussan' : 'zasaj_bui'; w.a[COL.stSeq] = seq; w.a[COL.stAt] = at;
    if (!num(w.a[COL.tgtOid]) && at > w.at) w.at = at;
  }
  if (!d.marks) for (const [u, at] of d.done ?? []) {
    const w = part(u);
    w.a[COL.st] = 'duussan'; w.a[COL.stSeq] = 0; w.a[COL.stAt] = at;
    if (at > w.at) w.at = at;
  }
  for (const [u, oid, fillMs, at] of d.tgt ?? []) {
    const w = part(u);
    w.a[COL.tgtOid] = oid; w.a[COL.tgtFill] = fillMs;
    /* ⚠️ Зорилтын агшин = мөрийн `at` (тэмдгийнх нь `tuluv_at`-д) */
    w.at = at;
  }
  for (const [k, w] of parts) rows.set(k, w);
  const hdr: Attrs = {
    [COL.turul]: 'tolgoi', [COL.key]: 'h', [COL.ver]: ROW_VERSION, [COL.at]: d.t || now,
    [COL.jaazOid]: d.frameSeenAt?.[0] ?? null, [COL.jaazSeen]: d.frameSeenAt?.[1] ?? null,
  };
  return { hdr, rows, skipped };
}

/**
 * Мөрүүд → FillNew `Draft`. Нүдний `oid`: код (`d<код>`) одоогийн жаазад бий бол ТЭР oid, эс бөгөөс `mur_oid` (хуучин жааз —
 * `rowKeys`/`rowOcc`-оор hook-ийн `mapOldOids` зөөнө). `staleOut` — жаазад алга oid → танихуун (дараагийн бичилт ижил мөрт).
 */
export function perfFromRows(
  hdr: Attrs | null, view: ReadonlyMap<string, Attrs>, stamps: ReadonlyMap<string, Stamps>, frame: Frame | null,
  t: number, staleOut?: Map<number, IdInfo>,
): Draft {
  const cells: [string, string][] = [];
  const dates: [string, string][] = [];
  const by: [string, string][] = [];
  const byAt: [string, number][] = [];
  const bt: [string, number][] = [];
  const hold: [string, number, 0 | 1][] = [];
  const del = new Map<string, number>();
  const rcpt: Rcpt[] = [];
  const datesB: [string, string][] = [];
  const rowKeys = new Map<number, string>();
  const rowOcc = new Map<number, [number, number, number]>();
  const marks: [string, 0 | 1, number, number][] = [];
  const tgt: [string, number, number, number][] = [];
  let asOf: number | null | undefined;
  let asOfAt: number | undefined;
  let asOfB: number | null | undefined;
  const oidOf = (k: string, a: Attrs): number | null => {
    const id = k.split(':')[k.startsWith('w:') ? 1 : 2] ?? '';
    const des = id.startsWith('d') ? Number(id.slice(1)) : null;
    const cur = des != null && Number.isFinite(des) ? frame?.byDes.get(des) : undefined;
    const oid = cur ?? num(a[COL.oid]) ?? (id.startsWith('o') ? Number(id.slice(1)) : null);
    if (oid == null || !Number.isInteger(oid)) return null;
    if (!rowKeys.has(oid)) {
      const f = frame?.byOid.get(oid);
      const no = f ? f.no : typeof a[COL.no] === 'string' ? a[COL.no] as string : '';
      const work = f ? f.work : typeof a[COL.work] === 'string' ? a[COL.work] as string : '';
      const lb = f ? { label: `${no} ¦ ${work}`, bare: false } : labelOf(a, no, work);
      if (no || work) rowKeys.set(oid, lb.label);
      const occ = f ? f.occ : num(a[COL.dav]);
      const occN = f ? f.occN : num(a[COL.davN]);
      if (occ != null && occN != null && occ >= 1 && occN >= occ) rowOcc.set(oid, [oid, occ - 1, occN]);
      if (!f && staleOut) {
        staleOut.set(oid, { id, des: num(a[COL.des]), no, work, ...(str(a[COL.path]) ? { path: a[COL.path] as string } : {}), ...(occ != null ? { occ } : {}), ...(occN != null ? { occN } : {}), ...(lb.bare ? { bare: true } : {}) });
      }
    }
    return oid;
  };
  const blkOf = (k: string): number => Number(k.slice(k.lastIndexOf(':') + 1));
  for (const [k, a] of view) {
    const tt = String(a[COL.turul] ?? '');
    if (tt === 'tolgoi') continue;
    if (k === '*') { const l = listedOf(a); if (present(a, l, [COL.asOf])) { asOf = num(a[COL.asOf]); asOfAt = stampOf(stamps.get(k), [COL.asOf], a).at; } continue; }
    if (k === 'b:*') { asOfB = num(a[COL.asOf]); continue; }
    if (tt === 'oroltsogch') {
      const u = typeof a[COL.usr] === 'string' && a[COL.usr] ? (a[COL.usr] as string).toLowerCase() : k.slice(2);
      const s = a[COL.st];
      if (s === 'duussan' || s === 'zasaj_bui') marks.push([u, s === 'duussan' ? 1 : 0, num(a[COL.stSeq]) ?? 0, num(a[COL.stAt]) ?? 0]);
      if (num(a[COL.tgtOid]) != null) tgt.push([u, int(a[COL.tgtOid]) as number, num(a[COL.tgtFill]) ?? 0, num(a[COL.at]) ?? 0]);
      continue;
    }
    if (tt === 'ustgal') {
      const p = /^x:([vse]):/.exec(k);
      const oid = p ? oidOf(k.replace(/^x:[vse]:/, 'w:'), a) : null;
      if (p && oid != null) {
        const dk = `${oid}:${blkOf(k)}${p[1] === 'v' ? '' : `:${p[1]}`}`;
        const at = num(a[COL.at]) ?? 0;
        if ((del.get(dk) ?? -1) < at) del.set(dk, at);
      }
      continue;
    }
    if (tt === 'barimt') {
      const p = /^r:([vse]):/.exec(k);
      const oid = p ? oidOf(k.replace(/^r:[vse]:/, 'w:'), a) : null;
      if (!p || oid == null) continue;
      const dk = `${oid}:${blkOf(k)}${p[1] === 'v' ? '' : `:${p[1]}`}`;
      const sv = p[1] === 'v' ? colsToCell(a[COL.ob], a[COL.act], a[COL.niit]) ?? ''
        : (() => { const ms = num(a[p[1] === 's' ? COL.ps : COL.pe]); return ms != null ? msToYmd(ms) : ''; })();
      const at = num(a[COL.at]) ?? 0;
      rcpt.push([dk, at, sv, num(a[COL.sentAt]) ?? at]);
      continue;
    }
    if (k.startsWith('b:')) {
      const p = /^b:([se]):/.exec(k);
      const oid = p ? oidOf(k.replace(/^b:[se]:/, 'w:'), a) : null;
      if (!p || oid == null) continue;
      const ms = num(a[p[1] === 's' ? COL.ps : COL.pe]);
      datesB.push([`${oid}:${blkOf(k)}:${p[1]}`, ms != null ? msToYmd(ms) : '']);
      continue;
    }
    if (!k.startsWith('w:')) continue;
    const oid = oidOf(k, a);
    if (oid == null) continue;
    const b = blkOf(k);
    const l = listedOf(a);
    const st = stamps.get(k);
    const keys: string[] = [];
    if (present(a, l, [COL.ob, COL.act, COL.niit])) {
      const v = colsToCell(a[COL.ob], a[COL.act], a[COL.niit], l.has(COL.ob));
      if (v != null) {
        const ck = `${oid}:${b}`;
        const s = stampOf(st, [COL.ob, COL.act, COL.niit], a);
        cells.push([ck, v]); byAt.push([ck, s.at]); if (s.u) by.push([ck, s.u]);
        keys.push(ck);
      }
    }
    for (const [g, col] of [['s', COL.ps], ['e', COL.pe]] as const) {
      if (!present(a, l, [col])) continue;
      const ms = num(a[col]);
      const dk = `${oid}:${b}:${g}`;
      const s = stampOf(st, [col], a);
      dates.push([dk, ms != null ? msToYmd(ms) : '']); byAt.push([dk, s.at]); if (s.u) by.push([dk, s.u]);
      keys.push(dk);
    }
    const btv = num(a[COL.bt]);
    if (btv != null) for (const kk of keys) bt.push([kk, btv]);
    if (a[COL.st] === 'barisan' || a[COL.st] === 'albadsan') {
      for (const kk of keys) hold.push([kk, num(a[COL.stAt]) ?? 0, a[COL.st] === 'albadsan' ? 1 : 0]);
    }
  }
  const live = new Set([...cells.map(([k]) => k), ...dates.map(([k]) => k)]);
  const fs = num(hdr?.[COL.jaazOid]) != null && num(hdr?.[COL.jaazSeen]) != null
    ? [int(hdr?.[COL.jaazOid]) as number, num(hdr?.[COL.jaazSeen]) as number] as [number, number] : undefined;
  const liveOids = new Set([...live].map((k) => Number(k.slice(0, k.indexOf(':')))));
  const out: Draft = {
    t, mode: 'inc', cells, dates,
    rowKeys: [...rowKeys].filter(([o]) => liveOids.has(o)).sort((x, y) => x[0] - y[0]),
    ...(by.length ? { by } : {}),
    ...(byAt.length ? { byAt } : {}),
    ...(del.size ? { del: [...del] } : {}),
    ...(rcpt.length ? { rcpt: packRcpt(rcpt) } : {}),
    ...(bt.length ? { bt } : {}),
    ...(hold.length ? { hold } : {}),
    ...(datesB.filter(([k]) => live.has(k)).length ? { datesB: datesB.filter(([k]) => live.has(k)) } : {}),
    ...(marks.length ? { marks, done: marks.filter((m) => m[1] === 1).map((m): [string, number] => [m[0], m[3]]) } : {}),
    ...(tgt.length ? { tgt } : {}),
    ...(rowOcc.size ? { rowOcc: [...rowOcc.values()].filter(([o]) => liveOids.has(o)).sort((x, y) => x[0] - y[0]) } : {}),
    ...(asOf !== undefined ? { asOf, ...(asOfAt != null ? { asOfAt } : {}) } : {}),
    ...(asOfB !== undefined && asOf !== undefined ? { asOfB } : {}),
    ...(fs ? { frameSeenAt: fs } : {}),
  };
  return out;
}

/* ══════════════ Илгээлт (`sub|`/`done|` толгой + `n:sub:<OBJECTID>` мөр, MVCC) ══════════════ */

/** Илгээлтийн агуулга (нүд) — `SubmissionPayload`-ын хэсэг */
export type SubCells = {
  cells: [string, string][]; dates: [string, string][]; rowKeys: [number, string][];
  rowOcc?: [number, number, number][]; asOf: number | null;
};

/**
 * Илгээлтийн нүд → мөрийн атрибут (`mur_key` → утга + танихуун). Нүдний oid нь ИЛГЭЭХ ҮЕИЙН жааз (`mur_oid` ЯГ хадгалагдана —
 * хэрэглэгчид `rowKeys`-ээр өөрсдөө зөөдөг). Код мэдэгдвэл `w:d<код>:<b>`, эс бөгөөс `w:o<oid>:<b>`.
 * ⚠️ Агшин/үе (`at`) энд ОРОХГҮЙ — бичигч үеийн дугаараар тавина.
 */
export function subToRows(p: SubCells, frame: Frame | null): Map<string, Attrs> {
  const out = new Map<string, Attrs>();
  const rk = new Map<number, string>(p.rowKeys);
  const occ = new Map<number, [number, number, number]>((p.rowOcc ?? []).map((e): [number, [number, number, number]] => [e[0], e]));
  const n = Math.max(1, frame?.bld.length ?? 1);
  const idOf = (oid: number): IdInfo => {
    const f = frame?.byOid.get(oid);
    const x = draftId(oid, rk.get(oid), occ.get(oid));
    return f && rk.has(oid) && rk.get(oid) === `${f.no} ¦ ${f.work}` ? { ...x, id: f.id, des: f.des, path: f.path } : x;
  };
  const row = (oid: number, b: number): Attrs => {
    const x = idOf(oid);
    const k = `w:${x.id}:${b}`;
    let a = out.get(k);
    if (!a) {
      a = { [COL.turul]: 'ajil', ...idAttrs(x, oid), ...blkAttrs(b, frame?.bld, n), ...blank([COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.asOf]), [COL.empty]: listStr(idListed(x)) };
      out.set(k, a);
    }
    return a;
  };
  for (const [k, v] of p.cells) {
    const m = /^(-?\d+):(\d+)$/.exec(k);
    const c = m ? cellToCols(v) : null;
    if (!m || !c) continue;
    const a = row(Number(m[1]), Number(m[2]));
    a[COL.ob] = c.ob; a[COL.act] = c.act; a[COL.niit] = c.niit;
    if (c.blank) { const l = listedOf(a); l.add(COL.ob); a[COL.empty] = listStr(l); }
  }
  for (const [k, v] of p.dates) {
    const m = /^(-?\d+):(\d+):([se])$/.exec(k);
    if (!m) continue;
    const a = row(Number(m[1]), Number(m[2]));
    const col = m[3] === 's' ? COL.ps : COL.pe;
    const ms = v ? ymdToMs(v) : null;
    if (ms != null) a[col] = ms;
    else { const l = listedOf(a); l.add(col); a[COL.empty] = listStr(l); }
  }
  if (p.asOf != null) out.set('*', { [COL.turul]: 'ajil', ...blank([COL.ob, COL.act, COL.niit, COL.ps, COL.pe]), [COL.asOf]: p.asOf, [COL.empty]: null });
  return out;
}

/** Хоёр мөрийн агуулга ижил үү (танихуун + утга + жагсаалт; агшингүй) */
export const sameSubRow = (a: Attrs | undefined, b: Attrs | undefined): boolean => {
  if (!a || !b) return !a && !b;
  const cols = [...ID_COLS, COL.ob, COL.act, COL.niit, COL.ps, COL.pe, COL.asOf, COL.empty];
  return cols.every((c) => nv(a[c]) === nv(b[c]));
};

/**
 * ҮЕИЙН СОНГОЛТ (MVCC) — `mur_key` бүрд толгойн БАТАЛГААЖСАН үеүдээс (`gens`, дарааллаар) хамгийн СҮҮЛИЙНХ (`upto` хүртэл);
 * баталгаажаагүй (бичилт тасалдсан/зөрчилд ялагдсан) үеийн мөр ХЭЗЭЭ Ч харагдахгүй. Хоосон мөр = тэр үед хасагдсан.
 */
export function pickGeneration(rows: readonly Attrs[], gens: readonly number[], upto?: number): Map<string, Attrs> {
  const idx = new Map<number, number>(gens.map((g, i) => [g, i]));
  const lim = upto != null ? idx.get(upto) ?? -1 : gens.length - 1;
  const best = new Map<string, { i: number; a: Attrs }>();
  for (const a of rows) {
    const k = typeof a[COL.key] === 'string' ? a[COL.key] as string : '';
    const i = idx.get(num(a[COL.at]) ?? NaN);
    if (!k || i == null || i > lim) continue;
    const c = best.get(k);
    if (!c || i > c.i || (i === c.i && (num(a.objectid) ?? 0) < (num(c.a.objectid) ?? 0))) best.set(k, { i, a });
  }
  const out = new Map<string, Attrs>();
  for (const [k, v] of best) if (!isEmptyRow(v.a)) out.set(k, v.a);
  return out;
}

/** Харагдах мөрүүд → илгээлтийн нүд (`mur_oid`-оор, `rowKeys`/`rowOcc` танихууны баганаас) */
export function subFromRows(vis: ReadonlyMap<string, Attrs>): SubCells {
  const cells: [string, string][] = [];
  const dates: [string, string][] = [];
  const rowKeys = new Map<number, string>();
  const rowOcc = new Map<number, [number, number, number]>();
  let asOf: number | null = null;
  for (const [k, a] of vis) {
    if (k === '*') { asOf = num(a[COL.asOf]); continue; }
    const m = /^w:[^:]+:(\d+)$/.exec(k);
    const oid = int(a[COL.oid]);
    if (!m || oid == null) continue;
    const b = Number(m[1]);
    const l = listedOf(a);
    const v = colsToCell(a[COL.ob], a[COL.act], a[COL.niit], l.has(COL.ob));
    if (v != null) cells.push([`${oid}:${b}`, v]);
    for (const [g, col] of [['s', COL.ps], ['e', COL.pe]] as const) {
      const ms = num(a[col]);
      if (ms != null) dates.push([`${oid}:${b}:${g}`, msToYmd(ms)]);
      else if (l.has(col)) dates.push([`${oid}:${b}:${g}`, '']);
    }
    const no = typeof a[COL.no] === 'string' ? a[COL.no] as string : '';
    const work = typeof a[COL.work] === 'string' ? a[COL.work] as string : '';
    if (!rowKeys.has(oid) && (no || work)) rowKeys.set(oid, labelOf(a, no, work).label);
    const occ = num(a[COL.dav]); const occN = num(a[COL.davN]);
    if (occ != null && occN != null && occ >= 1 && occN >= occ) rowOcc.set(oid, [oid, occ - 1, occN]);
  }
  /* ⚠️ Хуудасны дарааллаар (oid өсөхөөр) — `submission.byPageOrder`-ийн ⚠️ */
  const ord = (x: [string, string], y: [string, string]) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  return {
    cells: cells.sort(ord), dates: dates.sort(ord),
    rowKeys: [...rowKeys].sort((x, y) => (x[0] < 0 ? 1 : 0) - (y[0] < 0 ? 1 : 0) || x[0] - y[0]),
    ...(rowOcc.size ? { rowOcc: [...rowOcc.values()].sort((x, y) => x[0] - y[0]) } : {}),
    asOf,
  };
}

/**
 * ХУУЧИРСАН ҮЕИЙН МӨР (GC) — `mur_key` бүрд хамгийн сүүлийн баталгаажсан мөрөөс ӨМНӨХ (бэхэлсэн `pin` үеийн агшинд
 * харагддагийг үлдээнэ) ба баталгаажаагүй, `orphanTtl`-ээс хуучин мөр. Буцаах: устгах OBJECTID.
 */
export function gcCandidates(rows: readonly Attrs[], gens: readonly number[], pins: readonly number[], now: number, orphanTtl: number): number[] {
  const idx = new Map<number, number>(gens.map((g, i) => [g, i]));
  const keepO = new Set<number>();
  const latest = pickGenerationRaw(rows, gens);
  for (const v of [latest, ...pins.map((p) => pickGenerationRaw(rows, gens, p))]) for (const a of v.values()) keepO.add(num(a.objectid) ?? -1);
  const edOf = (a: Attrs | undefined): number => num(a?.last_edited_date) ?? num(a?.[COL.at]) ?? now;
  const out: number[] = [];
  for (const a of rows) {
    const o = num(a.objectid);
    if (o == null || keepO.has(o)) continue;
    const g = num(a[COL.at]) ?? NaN;
    /* ⚠️ Хуучирсан (дараагийн үеэр солигдсон) мөр — солигч мөр `orphanTtl`-ээс ХУУЧИН бол л: өмнөх толгойг уншсан уншигч
       (уншилтын хоорондох хэдэн секунд) мөрийг нь алдахгүй */
    if (idx.has(g)) {
      const k = typeof a[COL.key] === 'string' ? a[COL.key] as string : '';
      if (now - edOf(latest.get(k)) > orphanTtl) out.push(o);
      continue;
    }
    if (now - edOf(a) > orphanTtl) out.push(o);
  }
  return out;
}
/** `pickGeneration` — хоосон мөрийг ч үлдээнэ (GC-д) */
function pickGenerationRaw(rows: readonly Attrs[], gens: readonly number[], upto?: number): Map<string, Attrs> {
  const idx = new Map<number, number>(gens.map((g, i) => [g, i]));
  const lim = upto != null ? idx.get(upto) ?? -1 : gens.length - 1;
  const best = new Map<string, { i: number; a: Attrs }>();
  for (const a of rows) {
    const k = typeof a[COL.key] === 'string' ? a[COL.key] as string : '';
    const i = idx.get(num(a[COL.at]) ?? NaN);
    if (!k || i == null || i > lim) continue;
    const c = best.get(k);
    if (!c || i > c.i) best.set(k, { i, a });
  }
  return new Map([...best].map(([k, v]) => [k, v.a]));
}

/* ══════════════ Хуучин JSON-ыг шингээх (хуучин таб) ══════════════ */

/**
 * ХУУЧИН ТАБЫН JSON-ООС ШИНГЭЭХ ХЭСЭГ — `huuchin_at`-аас ХОЙШ бичсэн нүд (шилжүүлснээс хойш 7 хоногт БҮХ нүд — тэр хугацаанд
 * мөрийн tombstone хүчинтэй тул хуучин нүд амилахгүй); tombstone · `cleared` бүгд. Хуучин таб мөрийг хардаггүй тул ноорог
 * нэг чиглэлтэй (баримтжуулсан).
 */
export function absorbPlan(b: HDDraft, huuchinAt: number, migratedAt: number, now = Date.now()): HDDraft {
  const all = now - migratedAt < HD_DEL_TTL;
  const entries = all ? new Map(b.entries) : new Map([...b.entries].filter(([, e]) => e.at > huuchinAt));
  return { ...b, entries, del: new Map(b.del) };
}
export function absorbPerf(b: Draft, huuchinAt: number, migratedAt: number, now = Date.now()): Draft {
  if (now - migratedAt < ROW_TTL) return b;
  const at = new Map<string, number>(b.byAt ?? []);
  const keep = (k: string) => (at.get(k) ?? b.t) > huuchinAt;
  return { ...b, cells: b.cells.filter(([k]) => keep(k)), dates: (b.dates ?? []).filter(([k]) => keep(k)) };
}
