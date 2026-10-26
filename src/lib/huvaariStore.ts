'use client';

/**
 * «ХУВААРЬ»-ИЙН ХУВААЛЦСАН НООРОГИЙН ХАДГАЛАЛТЫН ДАВХАРГА (2026-10-26).
 *
 * ⚠️ ЯАГААД: `useSharedDraft`-ийн утга зүй (нүд бүрийн нийлүүлэлт · tombstone · HLC · түгжээ · цэвэрлэлтийн тэмдэг)
 *    ХЭВЭЭР — зөвхөн хадгалалт солигдоно. Hook үргэлж бүтэн `HDDraft` авна/өгнө:
 *      · `rows`      — 191-д ЭХ ХУУДАСНЫ БҮТЦЭЭР (`n:plan:<төрөл>:<багц>`, ажил × блок × сар бүрд мөр — `draftRowsRemote`);
 *      · `blob`      — notebook-ийн багана нэмэгдээгүй: ЯГ өнөөгийн JSON (`draftRemote`, `REMOTE_MAX`); super-т тайлбар;
 *      · `rows-wait` — баганыг шалгаж чадсангүй (сүлжээ): ЮУ Ч уншихгүй/бичихгүй (засвар localStorage-д), hook 30 с тутам дахин
 *                      бэлдэнэ. JSON руу нөөц бичилт ХЭЗЭЭ Ч хийхгүй (хоёр эх сурвалж салаална).
 * ⚠️ 2026-10-26 (эцсийн загвар): ТУСДАА ШИЛЖҮҮЛЭЛТИЙН АЛХАМ АЛГА — мөрийн уншилт хуучин JSON-ыг (`huuchin_at`-аас хойшхи)
 *    нийлүүлж, засагчийн анхны нээлт (`planMigrate`) эсвэл анхны бичилт толгойд `huuchin_at`-ыг тавина (= шилжүүлэлт); хуучин таб
 *    JSON-д бичсээр байвал дараагийн уншилт шингээнэ (`legacyPending` — hook хэрэглэгчид хэлнэ). Хуучин 3 хүснэгтийн тусдаа
 *    үйлчилгээний хадгалалт ба түүний «хүснэгт алга/зөвхөн унших» горимууд БҮРЭН ХАСАГДСАН.
 * ⚠️ 2026-10-26: ЖААЗ СОЛИГДОХ (`alignToFrame` · `collapseCells`) — мөрийн түлхүүр нь ажлын КОД (`w:d<des_dugaar>:<блок>`), oid
 *    биш. Тиймээс уншилтад нүдийг ОДООГИЙН жаазны тухайн кодтой oid руу шууд зөөж (хуучин oid шинэ жаазад ӨӨР ажилд
 *    давтагдсан ч буруу ажилд наалдахгүй), бичихдээ НЭГ ажил × блокийн давхардсан нүдийг (хуучин/шинэ oid) ГАНЦ болгоно.
 *    `useSharedDraft`-ийн `identityRemap` нь кодгүй мөрийн нөөц (эцэг бүлгийн зам · «№ ¦ нэр») хэвээр.
 */

import { readRemoteDraft, readRemoteDraftAt, REMOTE_MAX, saveRemoteDraft, type RemoteSaveResult } from '@/lib/draftRemote';
import {
  kA, kH, kR, kS, parse as hdParse, parseKey, serialize as hdSerialize,
  type HDDraft, type HDEntries, type HDEntry, type HDRowBase, type HDRowKey,
} from '@/lib/huvaariDraft';
import { planMigrate, planRead, planReadAt, planSave, planWriteSubmitted, rowsReady } from '@/lib/draftRowsRemote';
import { t as tr } from '@/lib/i18nCore';

export type HDStoreMode = 'blob' | 'rows' | 'rows-wait';
export type HDStoreRead = { ok: true; draft: HDDraft | null; at: number | null } | { ok: false; error: string };
/** `big` — JSON хэт том (зөвхөн `blob`); `local` — энэ горимд алсад бичихгүй (засвар зөвхөн энэ компьютерт) */
export type HDStoreSave = RemoteSaveResult & { at?: number; big?: number; local?: boolean };
/** Hook-ийн `HDCtx`-ийн хадгалалтад хэрэгтэй хэсэг (блокийн тоо · одоогийн мөрүүд · блокийн нэрс) */
export type StoreCtx = { n: number; rows: ReadonlyMap<number, HDRowBase>; bld?: readonly string[] } | null;
export type HDStore = {
  mode: HDStoreMode;
  /** Хэрэглэгчид (`rows-wait`) эсвэл super-т (`blob`) харуулах тайлбар */
  note?: string;
  readAt(key: string): Promise<number | null | undefined>;
  /** `ctx` — одоогийн жааз (блокийг НЭРЭЭР, ажлыг КОДООР тааруулна — `planFromRows` · `alignToFrame`-ийн ⚠️) */
  read(key: string, opt?: { full?: boolean; ctx?: StoreCtx }): Promise<HDStoreRead>;
  save(key: string, d: HDDraft, opt: { expectAt: number | null; quick?: boolean; ctx: StoreCtx }): Promise<HDStoreSave>;
  /** Илгээх агшны хуулбар (`rows`, `n:hsub:<Huvaari_Batlah OBJECTID>`) */
  submitted?(key: string, d: HDDraft, ctx: StoreCtx, oid: number): Promise<boolean>;
};

async function blobRead(key: string): Promise<HDStoreRead> {
  const rr = await readRemoteDraft(key);
  if (!rr.ok) return rr;
  return { ok: true, draft: rr.draft ? hdParse(rr.draft.payload) : null, at: rr.draft ? rr.draft.at : null };
}

/** ХУУЧИН JSON — ЯГ өнөөгийн зам (`draftRemote`, `REMOTE_MAX`) */
export const blobStore: HDStore = {
  mode: 'blob',
  readAt: readRemoteDraftAt,
  read: (key) => blobRead(key),
  async save(key, d, opt) {
    const body = hdSerialize(d, REMOTE_MAX);
    if (body.length > REMOTE_MAX) {
      return { ok: false, big: body.length, error: tr('ноорог хэт том ({0} тэмдэгт, дээд {1})', String(body.length), String(REMOTE_MAX)) };
    }
    const r = await saveRemoteDraft(key, d.t, body, { expectAt: opt.expectAt });
    return r.ok ? { ...r, at: d.t } : r;
  },
};

/** Түр алдаа — юу ч уншихгүй/бичихгүй, засвар localStorage-д (`rows-wait`, толгойн ⚠️) */
const waiting = (note: string): HDStore => ({
  mode: 'rows-wait',
  note,
  readAt: async () => undefined,
  read: async () => ({ ok: false, error: note }),
  async save() { return { ok: false, local: true, error: note }; },
});

/* ══════════════ Жааз солигдох — кодоор тааруулах (цэвэр) ══════════════ */

/**
 * Одоогийн жаазад ОЛДООГҮЙ кодын нүдийн орлуулах oid — хуучин oid шинэ жаазад ӨӨР ажилд давтагдсан үед (жиш. хуудсыг дахин
 * импортлоход OBJECTID 1-ээс эхэлнэ). Сөрөг тул одоогийн мөрд хэзээ ч таарахгүй → hook «мөр алга» (`identityRemap` нөөц,
 * эс бөгөөс хуучирсан нүд — `hdStale`) гэж үзнэ; `rk` код нь хадгалагдаж, бичихэд ижил мөр (`w:d<код>`) рүү буцна.
 * ⚠️ `mur_oid` (Integer) — int32-т багтана; нэмэлт ажлын түр oid (`adds.nextTmpOid`, ~−10¹⁰)-оос өөр муж.
 */
const SYN_BASE = 1_000_000_000;
export const synOid = (des: number): number => -(SYN_BASE + Math.abs(Math.trunc(des)));

type KeyParts = { type: 's' | 'a' | 'h' | 'r'; oid: number; blk: number | null };
const cellOf = (k: string): KeyParts | null => {
  const p = parseKey(k);
  if (!p || p.type === 'm' || p.type === 'n') return null;
  return { type: p.type, oid: p.oid, blk: p.type === 's' || p.type === 'a' ? p.blk : null };
};
const keyOf = (c: KeyParts, oid: number): string =>
  c.type === 's' ? kS(oid, c.blk ?? 0) : c.type === 'a' ? kA(oid, c.blk ?? 0) : c.type === 'h' ? kH(oid) : kR(oid);
/** Код → одоогийн oid (давхардсан код → null) */
function desIndex(ctx: NonNullable<StoreCtx>): Map<number, number | null> {
  const m = new Map<number, number | null>();
  for (const [oid, r] of ctx.rows) if (r.des != null) m.set(r.des, m.has(r.des) ? null : oid);
  return m;
}
/** Нүдийг tombstone-тэй нь `merge`-ийн ЯГ дүрмээр шийднэ: tombstone нүднээс ХОЖУУ (>) бол нүд хаягдана, эс бөгөөс tombstone */
function settle(entries: HDEntries, del: Map<string, number>): void {
  for (const [k, e] of [...entries]) {
    const t = del.get(k);
    if (t == null) continue;
    if (t > e.at) entries.delete(k); else del.delete(k);
  }
}

/**
 * УНШИЛТЫГ ОДООГИЙН ЖААЗАД ТААРУУЛНА — мөрийн нүд бүрийн `oid` нь БИЧИХ ҮЕИЙН жааз (`mur_oid`); код (`rk.des`) нь одоогийн
 * жаазад ГАНЦ бол тэр oid руу; кодын ажил одоогийн жаазад алга бөгөөд хуучин oid нь ӨӨР кодтой ажил бол `synOid` руу (буруу
 * ажилд наалдахгүй); бусад (кодгүй · жааз ачаалагдаагүй) — хэвээр (hook-ийн `identityRemap`).
 * ⚠️ Зөөлт нь ХАДГАЛАЛТЫН ТҮВШНИЙ нэр солилт (мөр нэг л): шинэ tombstone ҮҮСГЭХГҮЙ; нэг түлхүүрт нийлсэн нүднээс ШИНЭ нь,
 *    tombstone — `merge`-ийн дүрмээр.
 */
export function alignToFrame(d: HDDraft, ctx: StoreCtx): HDDraft {
  if (!ctx?.rows.size) return d;
  const byDes = desIndex(ctx);
  const memo = new Map<number, number>();
  const target = (oid: number): number => {
    const hit = memo.get(oid);
    if (hit != null) return hit;
    const des = d.rk?.get(oid)?.des;
    let to = oid;
    if (des != null) {
      const x = byDes.get(des);
      if (typeof x === 'number') to = x;
      else if (x === undefined) {
        const cur = ctx.rows.get(oid);
        if (cur && cur.des != null && cur.des !== des) to = synOid(des);
      }
    }
    memo.set(oid, to);
    return to;
  };
  let moved = false;
  const entries: HDEntries = new Map();
  const del = new Map<string, number>();
  const put = (k: string, e: HDEntry, own: boolean) => {
    const ex = entries.get(k);
    /* ⚠️ Тэнцвэл ЗОРИЛТОТ түлхүүр дээр байсных (одоогийн жаазаар бичигдсэн) үлдэнэ */
    if (!ex || e.at > ex.at || (e.at === ex.at && own)) entries.set(k, e);
  };
  for (const [k, e] of d.entries) {
    const c = cellOf(k);
    const to = c ? target(c.oid) : null;
    if (!c || to === c.oid || to == null) { put(k, e, true); continue; }
    moved = true;
    put(keyOf(c, to), e, false);
  }
  for (const [k, t] of d.del) {
    const c = cellOf(k);
    const to = c ? target(c.oid) : null;
    const nk = !c || to == null || to === c.oid ? k : keyOf(c, to);
    if (nk !== k) moved = true;
    if ((del.get(nk) ?? -1) < t) del.set(nk, t);
  }
  if (!moved) return d;
  settle(entries, del);
  let rk: Map<number, HDRowKey> | undefined;
  if (d.rk?.size) {
    rk = new Map(d.rk);
    for (const [from, to] of memo) {
      const id = d.rk.get(from);
      if (to !== from && id && !rk.has(to)) rk.set(to, id);
    }
  }
  return { ...d, entries, del, ...(rk ? { rk } : {}) };
}

/**
 * БИЧИХИЙН ӨМНӨ НЭГ АЖИЛ × БЛОКИЙН ДАВХАРДЛЫГ ГАНЦ БОЛГОНО — мөрийн загварт нэг ажил × блок (× бүлэг) = нэг мөр (`w:d<код>:<блок>`)
 * тул HDDraft-ийн хуучин/шинэ oid-ын ХОЁР түлхүүр (hook хамтрагчийн хуучин түлхүүрийг хадгалдаг — `remapDraft`-ийн `keep`) нэг
 * мөрөнд бичигдэж, Map-ын дарааллаар ХУУЧИН утга шинэ агшинтай үлдэх эрсдэлтэй байв. Дүрэм (логик нүд бүрд):
 *   · хамгийн ШИНЭ нүд (тэнцвэл одоогийн жаазны oid-тай) ба tombstone-ийн ХАМГИЙН ХОЖУУ нь `merge`-ийн дүрмээр өрсөлдөнө;
 *   · ⚠️ одоогийн жаазад АЛГА oid-ын tombstone нь тухайн нүд одоогийн oid дээр амьд бол ТООЦОГДОХГҮЙ — тэр нь hook-ийн
 *     «хуучин түлхүүрээс зөөсөн» тэмдэг (`remapDraft`, агшин = одоо), нүдийг устгах шийдвэр БИШ; эс тооцвол зөөсөн нүд өөрийн
 *     tombstone-д устна.
 * Код нь одоогийн мөрөөс (`ctx`), эс бөгөөс `rk`-ээс; кодгүй бол `o<oid>` (давхардал үүсэхгүй).
 */
export function collapseCells(d: HDDraft, ctx: StoreCtx): HDDraft {
  const lid = (c: KeyParts): string => {
    const des = ctx?.rows.get(c.oid)?.des ?? d.rk?.get(c.oid)?.des ?? null;
    return `${c.type}:${des != null ? `d${des}` : `o${c.oid}`}:${c.blk ?? ''}`;
  };
  type G = { live: [string, HDEntry, boolean][]; dels: [string, number, boolean][] };
  const groups = new Map<string, G>();
  const grp = (id: string): G => { let g = groups.get(id); if (!g) { g = { live: [], dels: [] }; groups.set(id, g); } return g; };
  const inCtx = (c: KeyParts) => !!ctx?.rows.has(c.oid);
  for (const [k, e] of d.entries) { const c = cellOf(k); if (c) grp(lid(c)).live.push([k, e, inCtx(c)]); }
  for (const [k, t] of d.del) { const c = cellOf(k); if (c) grp(lid(c)).dels.push([k, t, inCtx(c)]); }
  const dropE = new Set<string>();
  const dropD = new Set<string>();
  for (const g of groups.values()) {
    if (g.live.length + g.dels.length <= 1) continue;
    let best: [string, HDEntry, boolean] | null = null;
    for (const x of g.live) if (!best || x[1].at > best[1].at || (x[1].at === best[1].at && x[2] && !best[2])) best = x;
    const liveCtx = g.live.some((x) => x[2]);
    const rel = liveCtx ? g.dels.filter((x) => x[2]) : g.dels;
    let td: [string, number, boolean] | null = null;
    for (const x of rel) if (!td || x[1] > td[1]) td = x;
    if (best && !(td && td[1] > best[1].at)) {
      for (const x of g.live) if (x !== best) dropE.add(x[0]);
      for (const x of g.dels) dropD.add(x[0]);
    } else {
      for (const x of g.live) dropE.add(x[0]);
      for (const x of g.dels) if (x !== td) dropD.add(x[0]);
    }
  }
  if (!dropE.size && !dropD.size) return d;
  return {
    ...d,
    entries: new Map([...d.entries].filter(([k]) => !dropE.has(k))),
    del: new Map([...d.del].filter(([k]) => !dropD.has(k))),
  };
}

/**
 * Хуучин (шинэчлээгүй) таб 191-ийн JSON мөрөнд бичсэн бөгөөд мөр рүү шингээгдээгүй байна уу — `planReadAt`-ийн хувилбарт
 * бутархай нэмэгддэг (`draftRowsRemote.readVer`: серверийн цаг (бүхэл мс) + шингээгдээгүй JSON-ы тэмдэг). Hook хэрэглэгчид
 * «хуучин хувилбартай таб — дахин ачаална уу» гэж хэлнэ; нүд нь уншилтаар аль хэдийн нийлсэн.
 */
export const legacyPending = (at: number | null | undefined): boolean => typeof at === 'number' && !Number.isInteger(at);

/** Эх хуудасны бүтцээр мөр (191) */
export const rowStore: HDStore = {
  mode: 'rows',
  readAt: planReadAt,
  async read(key, opt) {
    const r = await planRead(key, { full: opt?.full, bld: opt?.ctx?.bld });
    return r.ok && r.draft ? { ...r, draft: alignToFrame(r.draft, opt?.ctx ?? null) } : r;
  },
  save: (key, d, opt) => planSave(key, collapseCells(d, opt.ctx), { ctx: opt.ctx, expectAt: opt.expectAt }),
  submitted: (key, d, ctx, oid) => planWriteSubmitted(key, collapseCells(d, ctx), ctx, oid),
};

export const NOTE_NO_TABLE = (): string => tr('Ноорогийн хүснэгтэд (191) мөрийн баганууд нэмэгдээгүй — notebook ажиллуулна уу');

/**
 * ТҮЛХҮҮРИЙН ХАДГАЛАЛТЫГ БЭЛДЭНЭ — сэргээлт бүрд (hook). Баганы шалгалт (`rowsReady`, сешнд кэштэй) → горим; засагч бол АНХНЫ
 * НЭЭЛТЭЭР шилжүүлнэ (`planMigrate` — мөр алга, хуучин JSON бий: JSON-ыг ЯГ мөр болгоно, JSON хөндөгдөхгүй; best effort —
 * унавал засагчийн анхны бичилт мөн адил шилжүүлнэ). Уншигч (засах эрхгүй) хуучин JSON-ыг уншилтаар л харна.
 */
export async function prepareStore(key: string, opt: { canWrite: boolean; ctx: StoreCtx }): Promise<HDStore> {
  const st = await rowsReady();
  if (st.mode === 'rows') {
    if (opt.canWrite) await planMigrate(key, opt.ctx).catch(() => false);
    return rowStore;
  }
  if (st.mode === 'blob') return { ...blobStore, note: NOTE_NO_TABLE() };
  return waiting(tr('Ноорогийн хүснэгт шалгагдсангүй ({0}) — ноорог зөвхөн энэ компьютерт, дахин оролдоно', st.why ?? ''));
}
