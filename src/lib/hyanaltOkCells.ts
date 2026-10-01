/**
 * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮД (`Zovshoorson_nud`) — МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮРЭЭР.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас — ШИЙДВЭР): урьд нь `"мөрийн индекс:блок"`
 *    массив хадгалдаг байв. Индекс нь ХУУДАСНЫ дараалал — нэмэлт ажил батлагдаж
 *    (`ajilApply.materializeAdds`) шинэ мөр орох, архивт шинэ жааз үүсэхэд
 *    индекс гулсаж, ногоон тэмдэг ӨӨР ажлын нүдэнд бууж болох байв.
 *    · БИЧИХ: ЗӨВХӨН шинэ хэлбэр `{"v":2,"c":["<oid>|<sid>|<блок>", …]}`.
 *      `oid` — хянагчийн харсан жаазны OBJECTID (тэр жааз хэвээр бол шууд таарна);
 *      `sid` — «№ ¦ Ажлын нэр»-ийн хэш + ижил шошготой мөрийн дарааллын дугаар
 *      (`rowSids`) — жааз солигдсон ч тогтвортой (`sheetFrame.buildOidMap`-тай ижил санаа).
 *    · УНШИХ: хоёр хэлбэрийг. Хуучин индексийн массивыг ЗӨВХӨН бичигдсэн агшны
 *      мөрийн дараалал одоогийнхтой ижил нь мэдэгдэж байвал (`legacyTrusted`)
 *      хэрэглэнэ; эс бөгөөс «мэдэхгүй» (`unknown`) — UI «дахин хянах» гэж хэлнэ,
 *      буруу нүдийг ногоон болгохгүй.
 * ⚠️ ЦЭВЭР модуль — ArcGIS/React/i18n импортлохгүй (`hyanaltOkCells.check.mjs`).
 */

export const OK_FORMAT = 2;

/** FNV-1a 32 бит → base36 (6–7 тэмдэгт) — хадгалах урт бага, мөргөлдөөн ~1/4e9 */
export function hash36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Мөр бүрийн тогтвортой түлхүүр — `${hash36("№ ¦ ажил")}.${n}`, `n` = ижил
 * шошготой мөрүүдийн дотор хуудасны дарааллаарх дугаар (0-ээс).
 * ⚠️ `no`/`work` нь ТҮҮХИЙ (trim хийсэн) утга — дэлгэцийн «—» орлуулга биш.
 */
export function rowSids(rows: { no: string; work: string }[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const h = hash36(`${String(r.no ?? '').trim()} ¦ ${String(r.work ?? '').trim()}`);
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return `${h}.${n}`;
  });
}

export type OkRef = { oid: number; sid: string; block: string };

/** Нэг зөвшөөрөлийн мөр — `"<oid>|<sid>|<блок>"` (блок нь `|` агуулж болно — сүүлд) */
export const okRefKey = (r: OkRef): string => `${r.oid}|${r.sid}|${r.block}`;

export function parseOkRef(s: string): OkRef | null {
  const a = s.indexOf('|');
  const b = a < 0 ? -1 : s.indexOf('|', a + 1);
  if (a <= 0 || b < 0) return null;
  const oid = Number(s.slice(0, a));
  const sid = s.slice(a + 1, b);
  const block = s.slice(b + 1);
  if (!Number.isFinite(oid) || !sid || !block) return null;
  return { oid, sid, block };
}

/** ШИНЭ хэлбэрээр кодлоно — давхардлыг хасна */
export function encodeOkCells(refs: string[]): string {
  return JSON.stringify({ v: OK_FORMAT, c: [...new Set(refs.filter((x) => parseOkRef(x)))] });
}

export type ParsedOk =
  | { kind: 'none' }
  | { kind: 'v2'; refs: OkRef[] }
  | { kind: 'legacy'; keys: string[] }
  | { kind: 'bad' };

/**
 * Түүхий утга → задаргаа.
 *   · хоосон/`[]` → `none` (ил «нэг ч нүд зөвшөөрөөгүй»);
 *   · `{v:2,c:[…]}` → `v2`;
 *   · `["12:5/1", …]` → `legacy` (хуучин индексийн хэлбэр);
 *   · бусад (эвдэрсэн JSON) → `bad` — «мэдэхгүй», ногоон болгохгүй.
 */
export function parseOkCells(raw: unknown): ParsedOk {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return { kind: 'none' };
  let j: unknown;
  try { j = JSON.parse(s); } catch { return { kind: 'bad' }; }
  if (Array.isArray(j)) {
    const keys = j.filter((x): x is string => typeof x === 'string');
    return keys.length ? { kind: 'legacy', keys } : { kind: 'none' };
  }
  if (j && typeof j === 'object' && (j as { v?: unknown }).v === OK_FORMAT && Array.isArray((j as { c?: unknown }).c)) {
    const refs = ((j as { c: unknown[] }).c)
      .map((x) => (typeof x === 'string' ? parseOkRef(x) : null))
      .filter((x): x is OkRef => x != null);
    return refs.length ? { kind: 'v2', refs } : { kind: 'none' };
  }
  return { kind: 'bad' };
}

/**
 * Задаргааг ОДООГИЙН мөрүүдийн индексийн түлхүүр (`"${i}:${блок}"`) болгоно.
 *
 * @param rows   индексээр — `rows[i]` нь i-р мөрийн `{oid, sid}` (сийрэг байж болно:
 *               зөвхөн өөрчлөгдсөн мөрүүд)
 * @param legacyTrusted хуучин индексийн хэлбэрийг шууд хэрэглэж болох уу —
 *               бичигдсэн агшны мөрийн дараалал одоогийнхтой ИЖИЛ нь баттай үед л `true`
 * @returns `keys` — тулгагдсан; `unknown` — тулгаж ЧАДААГҮЙ зөвшөөрлийн тоо
 *          (>0 бол UI «дахин хянах» гэж хэлнэ)
 */
export function resolveOk(
  p: ParsedOk,
  rows: ({ oid: number; sid: string } | undefined)[],
  legacyTrusted: boolean,
): { keys: Set<string>; unknown: number } {
  const keys = new Set<string>();
  if (p.kind === 'none') return { keys, unknown: 0 };
  if (p.kind === 'bad') return { keys, unknown: 1 };
  if (p.kind === 'legacy') {
    if (!legacyTrusted) return { keys, unknown: p.keys.length };
    let unknown = 0;
    for (const k of p.keys) {
      const cut = k.indexOf(':');
      const i = cut > 0 ? Number(k.slice(0, cut)) : NaN;
      if (Number.isInteger(i) && i >= 0 && i < rows.length) keys.add(k);
      else unknown += 1;
    }
    return { keys, unknown };
  }
  const byOid = new Map<number, number>();
  const bySid = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r) return;
    if (!byOid.has(r.oid)) byOid.set(r.oid, i);
    if (!bySid.has(r.sid)) bySid.set(r.sid, i);
  });
  let unknown = 0;
  for (const ref of p.refs) {
    const io = byOid.get(ref.oid);
    /* ⚠️ OID таарсан ч sid зөрвөл (өөр жааз — oid санамсаргүй давхцсан) sid-ээр */
    const i = io != null && rows[io]?.sid === ref.sid ? io : bySid.get(ref.sid);
    if (i == null) { unknown += 1; continue; }
    keys.add(`${i}:${ref.block}`);
  }
  return { keys, unknown };
}

/**
 * Хянагчийн индексийн түлхүүрүүдийг (`"${i}:${блок}"`) ШИНЭ хэлбэрийн мөрүүд болгоно.
 * ⚠️ Мөр олдохгүй (`rows[i]` алга) түлхүүр ХАЯГДАНА — индексээр бичихгүй.
 */
export function toOkRefs(
  idxKeys: Iterable<string>,
  rows: ({ oid: number; sid: string } | undefined)[],
): string[] {
  const out: string[] = [];
  for (const k of idxKeys) {
    const cut = k.indexOf(':');
    const i = cut > 0 ? Number(k.slice(0, cut)) : NaN;
    const r = Number.isInteger(i) ? rows[i] : undefined;
    if (!r) continue;
    out.push(okRefKey({ oid: r.oid, sid: r.sid, block: k.slice(cut + 1) }));
  }
  return out;
}
