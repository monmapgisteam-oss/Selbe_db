'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАТЛАХ УРСГАЛ — менежер мөр нэмнэ, батлагч батална.
 */

import { GUITS } from '@/lib/services/env';
import { AUTH, ROLE_BY_USER, roleForUser } from './services';
import { ajilAclReady, ajilScope } from './ajilAcl';
import { capsRemoteReady, hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/authToken';
import { currentUser, requireCap } from './who';
import type { NewRow } from './submission';
import { invalidate } from './dataBus';
import { cached } from '@/lib/live';
import { REASON_MAX, serverNow, syncServerClock } from './huvaariBatlah';
import { isLostWrite } from './lostWrite';
import { askConfirm } from './confirm';

/** Илгээлтийн төлөв */
export const AJIL_STATUS = {
  /** Мөр нэмэгч илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  /** Зохиогч өөрөө буцааж авсан — `withdrawAjil` */
  withdrawn: 'Татсан',
  /**
   * Батлагдсан БА мөрүүд үндсэн хүснэгтэд (`Bagts_*`) аль хэдийн
   * БИЧИГДСЭН — `ajilApply.materializeAdds` амжилттай дууссан (2026-09-24).
   */
  applied: 'Буулгасан',
  /**
   * БУЦААГДСАН БА зохиогчийн «Хуваарь» хуудас мөрүүдийг `adds`-д
   * аль хэдийн БУЦААЖ буулгасан (2026-09-23, аудитын #13).
   */
  restored: 'Сэргээсэн',
} as const;
export type AjilStatus = (typeof AJIL_STATUS)[keyof typeof AJIL_STATUS];

/**
 * НЭГ ИЛГЭЭЛТИЙН АГУУЛГА — нэмэхээр хүлээж буй мөрүүд.
 */
export type AjilPayload = {
  v: 1;
  pkgKey: string;
  adds: NewRow[];
};

/** НЭГ ИЛГЭЭЛТ — нэг багцад нэмэх мөрүүдийн багц */
export type AjilSubmission = {
  oid: number;
  /** Багцын түлхүүр (`Pkg.key`) — жишээ нь `b2_9f` */
  pkgKey: string;
  /** Багцын БҮЛЭГ (`Pkg.group`) — эрхийн хүрээ үүгээр шалгагдана */
  pkgGroup: string;
  status: AjilStatus;
  /** Илгээсэн хүн (ArcGIS-ийн нэр, жижиг үсгээр) */
  author: string;
  authorSent: number | null;
  approver: string | null;
  approverAt: number | null;
  reason: string | null;
  note: string | null;
  /** Хэдэн мөр нэмэгдэх — жагсаалтад харуулах. 2026-10-23: хоосон `mor_too` = мэдэгдэхгүй (`null`), 0 биш */
  rowCount: number | null;
  /** Түүхий JSON — `parsePayload`-аар задарна */
  payload: string;
};

/**
 * Буцаах шалтгааны дээд урт (тэмдэгт) — UI `maxLength` үүнтэй ижил (2026-10-06).
 */

/**
 * ДАВХАР ИЛГЭЭЛТИЙН ЦУЦЛАЛТЫН ТЭМДЭГ (2026-10-06, `huvaariBatlah.DUP_MARK`-ийн загвар) —
 * `submitAjil`-ийн давхардал арилгах зам устгал унахад ялагдсан мөрийг `withdrawn`
 * болгохдоо `butsaasan_shaltgaan`-д бичнэ.
 */
export const DUP_MARK = '__davhar_tsutslagdsan__';
/**
 * Давхардлын улмаас цуцлагдсан мөр мөн эсэх.
 */
export function isDupCancel(x: Pick<AjilSubmission, 'status' | 'reason' | 'approverAt'>): boolean {
  if (x.status !== AJIL_STATUS.withdrawn) return false;
  return (x.reason ?? '').trim() === DUP_MARK || x.approverAt == null;
}

/**
 * Дуудагчийн өгсөн нэр НЭВТЭРСЭН хэрэглэгчтэй ижил үү (хөтөчид, `AUTH.appId` үед).
 */
function sameAsLogin(name: string): { ok: false; error: string } | null {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  const meNow = currentUser();
  if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (meNow.toLowerCase() !== name.trim().toLowerCase()) return { ok: false, error: tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.') };
  return null;
}

const TITLE = 'Selbe_Ajil_Batlah_csv';

const LAYER_ID = 219;

/**
 * Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно.
 */
export const F = {
  oid: 'objectid',
  pkgKey: 'bagts_key',
  pkgGroup: 'bagts_group',
  status: 'toloh',
  author: 'zohiogch',
  authorSent: 'ilgeesen_ognoo',
  approver: 'batlagch',
  approverAt: 'shiidver_ognoo',
  reason: 'butsaasan_shaltgaan',
  note: 'tailbar',
  rowCount: 'mor_too',
  payload: 'aguulga',
} as const;

/* ══════════════════════ ArcGIS давхарга ══════════════════════ */

async function getToken(): Promise<{ token: string; user: string } | null> {
  try {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    const cred = esriId.findCredential(`${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`);
    if (!cred?.token) return null;
    return { token: cred.token, user: (cred.userId as string) ?? '' };
  } catch {
    return null;
  }
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);

/**
 * ХУУЧИН ЭЗЭД — `ROLE_BY_USER`-ээс хасагдсан ч хүснэгтийг үүсгэсэн байж
 * болох аккаунтууд (`obyemBatlah.FORMER_TABLE_OWNERS`-ийн загвар).
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([
  ...SUPER_OWNERS,
  ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase()),
]);

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — анхааруулга */
let ownerMismatch = false;

async function findTableUrl(token: string): Promise<string | null> {
  const search = await arcgisPost(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  if (String(hit?.access ?? '') === 'public') {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч`,
      'батлах мөрийг засаж чадна. AGOL дээр Share-ийг «Organization» болгоно уу.',
    );
  }
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй:`,
      same.map((x) => x.owner).join(', '), '— super-т reassign хийнэ үү',
    );
  }
  return hit?.url ? `${hit.url}/${LAYER_ID}` : null;
}

/**
 * Хүснэгтийн URL.
 */
async function tableUrl(): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const direct: string | null = `${GUITS}/189`;
  if (direct) {
    tableUrlCache = direct;
    return direct;
  }
  const auth = await getToken();
  if (!auth) return null;
  const url = await findTableUrl(auth.token);
  if (url) tableUrlCache = url;
  return url;
}

/**
 * ХҮСНЭГТ БЭЛЭН ҮҮ — ба ҮГҮЙ бол ЯАГААД.
 */
export type AjilTableState = {
  ok: boolean;
  /**
   * `auth`   — ArcGIS-д нэвтрээгүй (токен алга)
   * `owner`  — ижил нэртэй хүснэгт бий ч эзэн нь танигдахгүй
   * `none`   — хүснэгт олдсонгүй (AGOL дээр нийтлэх шаардлагатай)
   * `error`  — порталын хайлт алдаа өгсөн (мессеж нь `detail`-д)
   */
  why: 'ok' | 'auth' | 'owner' | 'none' | 'error';
  detail?: string;
};

export async function ajilTableState(): Promise<AjilTableState> {
  try {
    if (!(await getToken())) return { ok: false, why: 'auth' };
    const url = await tableUrl();
    if (url) return { ok: true, why: 'ok' };
    return { ok: false, why: ownerMismatch ? 'owner' : 'none' };
  } catch (e) {
    return { ok: false, why: 'error', detail: String((e as Error)?.message ?? e) };
  }
}

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

function toSubmission(a: Attrs): AjilSubmission | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const pkgKey = s(a[F.pkgKey]);
  if (!pkgKey) return null;
  const st = s(a[F.status]);
  const known = Object.values(AJIL_STATUS).find((x) => x === st);
  if (!known) return null;
  const n = (v: unknown): number | null => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return {
    oid,
    pkgKey,
    pkgGroup: s(a[F.pkgGroup]) ?? '',
    status: known,
    author: (s(a[F.author]) ?? '').toLowerCase(),
    authorSent: n(a[F.authorSent]),
    approver: s(a[F.approver])?.toLowerCase() ?? null,
    approverAt: n(a[F.approverAt]),
    reason: s(a[F.reason]),
    note: s(a[F.note]),
    rowCount: a[F.rowCount] == null || a[F.rowCount] === '' || !Number.isFinite(Number(a[F.rowCount])) ? null : Number(a[F.rowCount]),
    payload: String(a[F.payload] ?? ''),
  };
}

async function query(where: string, outFields: string): Promise<Attrs[]> {
  const url = await tableUrl();
  if (!url) return [];
  await syncServerClock(url);
  const out: Attrs[] = [];
  for (let off = 0; ; ) {
    const j = await arcgisPost(`${url}/query`, {
      where,
      outFields,
      returnGeometry: 'false',
      orderByFields: `${F.oid} ASC`,
      resultOffset: String(off),
      resultRecordCount: '1000',
    });
    const fs = (j.features as { attributes: Attrs }[]) ?? [];
    out.push(...fs.map((f) => f.attributes));
    if (!j.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return out;
}

/** Бүх илгээлтийн ТОЛГОЙ — `payload`-гүй (жагсаалт хөнгөн байх ёстой) */
const HEAD_FIELDS = [
  F.oid, F.pkgKey, F.pkgGroup, F.status, F.author, F.authorSent,
  F.approver, F.approverAt, F.reason, F.note, F.rowCount,
].join(',');

/**
 * Багцын хүлээгдэж буй илгээлт.
 */
export async function loadPending(pkgKey: string): Promise<AjilSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${AJIL_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
  list.sort((a, b) => a.oid - b.oid);
  return list[0] ?? null;
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<AjilSubmission[]> {
  const rows = await query(`${F.status} = N'${AJIL_STATUS.pending}'`, HEAD_FIELDS);
  return rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
}

/**
 * Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан · буцаагдсан · татсан ·
 * буулгасан · сэргээсэн).
 */
export async function loadHistory(pkgKey: string, limit = 20): Promise<AjilSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${AJIL_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is AjilSubmission => x != null && !isDupCancel(x));
  return list.slice(-limit).reverse();
}

/**
 * БАТЛАГДСАН, гэвч үндсэн хүснэгтэд хараахан БУУГААГҮЙ илгээлтүүд.
 */
export async function loadApproved(pkgKey: string): Promise<AjilSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${AJIL_STATUS.approved}'`,
    HEAD_FIELDS,
  );
  return rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
}

/**
 * Батлагчийн жагсаалт — батлагдсан ч БУУГААГҮЙ БҮХ илгээлт (`loadAllPending`-ийн
 * хуулбар, төлөв `approved`; 2026-09-24). `AjilBatlah` «Батлагдсан · буулгаагүй»
 * хэсэгт харуулж «Дахин буулгах» боломж өгнө.
 */
export async function loadAllApproved(): Promise<AjilSubmission[]> {
  const rows = await query(`${F.status} = N'${AJIL_STATUS.approved}'`, HEAD_FIELDS);
  return rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
}

/**
 * Батлагчийн «Буцаасан» хэсэг (2026-10-23, UX аудит P1) — сүүлийн `days` хоногт буцаасан илгээлтүүд (шалтгаантай),
 * шинээс хуучин руу. `restored` (зохиогчийн хуудас мөрүүдийг буулгасан) ч буцаалт мөн тул орно.
 */
export async function loadAllReturned(days = 30, now = serverNow()): Promise<AjilSubmission[]> {
  const rows = await query(`${F.status} IN (N'${AJIL_STATUS.returned}', N'${AJIL_STATUS.restored}')`, HEAD_FIELDS);
  const since = now - days * 86_400_000;
  return rows.map(toSubmission)
    .filter((x): x is AjilSubmission => x != null && (x.approverAt ?? 0) >= since)
    .sort((a, b) => (b.approverAt ?? 0) - (a.approverAt ?? 0));
}

/**
 * НЭГ ИЛГЭЭЛТИЙН ТОЛГОЙ — `payload`-гүй (2026-09-24).
 */
export async function loadHead(oid: number): Promise<AjilSubmission | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, HEAD_FIELDS);
  return rows.length ? toSubmission(rows[0]) : null;
}

/**
 * БУУЛГАСАН гэж тэмдэглэх — `loadApproved` дахин буцаахгүй болно.
 */
export async function markApplied(oid: number): Promise<{ ok: boolean; error?: string }> {
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (s(cur[0][F.status]) !== AJIL_STATUS.approved) {
    return s(cur[0][F.status]) === AJIL_STATUS.applied
      ? { ok: true }
      : { ok: false, error: tr('Энэ илгээлт энэ хооронд өөрчлөгдлөө — хуудсаа шинэчилнэ үү.') };
  }
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.status]: AJIL_STATUS.applied, [F.reason]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  } finally {
    invalidate('AJIL_BATLAH');
  }
}

/**
 * БУЦААГДСАНЫГ «СЭРГЭЭСЭН» гэж тэмдэглэх — зохиогчийн хуудас мөрүүдийг
 * `adds`-д буцааж буулгасны ДАРАА (2026-09-23, аудитын #13).
 */
export async function markRestored(oid: number): Promise<{ ok: boolean; error?: string }> {
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const st = s(cur[0][F.status]);
  if (st === AJIL_STATUS.restored) return { ok: true };
  if (st !== AJIL_STATUS.returned) {
    return { ok: false, error: tr('Энэ илгээлт энэ хооронд өөрчлөгдлөө — хуудсаа шинэчилнэ үү.') };
  }
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.status]: AJIL_STATUS.restored } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('AJIL_BATLAH');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * БАТЛАГДСАН/БУУЛГАСАН НЭМЭЛТ АЖЛЫН ТҮЛХҮҮРҮҮД — «эцгийн № ¦ эцгийн нэр ¦ № ¦ нэр».
 */
export function addedKeyOf(parentNo: string, parentWork: string, no: string, work: string): string {
  return `${parentNo.trim()}¦${parentWork.trim()}¦${no.trim()}¦${work.trim()}`;
}
/** Нэг нэмэгдсэн мөрийн тэмдэглэгээ — түлхүүр + нэмсэн үеийн эцгийн байрлал */
export type AddedKey = { key: string; parentIdx: number };
export async function loadAddedKeys(pkgKey: string): Promise<AddedKey[]> {
  const out: AddedKey[] = [];
  try {
    const esc = pkgKey.replace(/'/g, "''");
    const rows = await query(
      `${F.pkgKey} = '${esc}' AND ${F.status} IN (N'${AJIL_STATUS.approved}', N'${AJIL_STATUS.applied}')`,
      `${F.oid},${F.payload}`,
    );
    for (const r of rows) {
      const p = parsePayload(s(r[F.payload]) ?? "");
      for (const a of p?.adds ?? []) {
        out.push({ key: addedKeyOf(a.parentNo, a.parentWork, a.no, a.work), parentIdx: a.parentIdx });
      }
    }
  } catch { /* тэмдэглэгээ л — уншигдахгүй бол улаан гарахгүй, хуудас ажиллана */ }
  return out;
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<AjilPayload | null> {
  return (await loadPayloadStamped(oid))?.p ?? null;
}

/**
 * АГУУЛГЫН ХУВИЛБАРЫН ТЭМДЭГ — түүхий `aguulga` мөрийн хэш (FNV-1a 32 + урт).
 */
export function payloadStamp(raw: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${raw.length}:${h.toString(16).padStart(8, '0')}`;
}

/**
 * АГУУЛГА + ХУВИЛБАРЫН ТЭМДЭГ (2026-09-30) — батлагчийн урьдчилан харах цонх.
 */
export async function loadPayloadStamped(oid: number): Promise<{ p: AjilPayload; stamp: string } | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  const raw = String(rows[0][F.payload] ?? '');
  const p = parsePayload(raw);
  return p ? { p, stamp: payloadStamp(raw) } : null;
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 */
export function parsePayload(raw: string): AjilPayload | null {
  try {
    const j = JSON.parse(raw) as Partial<AjilPayload>;
    if (!j || typeof j !== 'object') return null;
    if (!Array.isArray(j.adds)) return null;
    const num = (v: unknown): v is number | null =>
      v === null || (typeof v === 'number' && Number.isFinite(v));
    const adds: NewRow[] = [];
    for (const a of j.adds) {
      if (!a || typeof a !== 'object') return null;
      const r = a as Partial<NewRow>;
      if (!Number.isInteger(r.oid) || (r.oid as number) >= 0) return null;
      if (typeof r.no !== 'string' || typeof r.work !== 'string') return null;
      if (typeof r.parentNo !== 'string' || typeof r.parentWork !== 'string') return null;
      if (!Number.isInteger(r.parentIdx)) return null;
      if (!num(r.vol) || !num(r.unit)) return null;
      adds.push({
        oid: r.oid as number,
        parentNo: r.parentNo,
        parentWork: r.parentWork,
        parentIdx: r.parentIdx as number,
        no: r.no,
        work: r.work,
        vol: r.vol as number | null,
        unit: r.unit as number | null,
      });
    }
    return { v: 1, pkgKey: String(j.pkgKey ?? ''), adds };
  } catch {
    return null;
  }
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

/* ══════════════════ СЕРВЕРИЙН ТҮГЖЭЭ (claim) — 2026-10-09 ══════════════════ */

/**
 * НЭМЭЛТ АЖЛЫН ТҮГЖЭЭ — `obyemBatlah.casObyemClaim`-ийн загвар (2026-10-09).
 */
export const AJIL_CLAIM_MARK = '__ajil_tugjee__';
export const AJIL_CLAIM_TTL = 10 * 60_000;
/** Энэ табын танигч — түгжээ «минийх» эсэхийг нэрээс гадна үүгээр ялгана */
const TAB = Math.random().toString(36).slice(2, 10) || 'tab';
const CLAIM_RE = new RegExp(`^${AJIL_CLAIM_MARK}:(\\d+):([A-Za-z0-9]+):(.*)$`);
/** Түгжээ тавьж болох төлвүүд — `pending` (шийдвэр), `approved` (буулгалт) */
const CLAIMABLE: readonly string[] = [AJIL_STATUS.pending, AJIL_STATUS.approved];

/** Хугацаа нь дуусаагүй түгжээ (`{ who, at, tab }`), эсвэл `null`. Цэвэр. */
export function ajilClaimOf(
  status: string | null | undefined,
  reason: string | null | undefined,
  now = serverNow(),
): { who: string; at: number; tab: string } | null {
  if (!status || !CLAIMABLE.includes(status)) return null;
  const m = CLAIM_RE.exec((reason ?? '').trim());
  if (!m) return null;
  const at = Number(m[1]);
  if (!Number.isFinite(at) || now - at >= AJIL_CLAIM_TTL || at - now >= AJIL_CLAIM_TTL) return null;
  return { who: m[3].trim().toLowerCase(), at, tab: m[2] };
}

/** UI-д: илгээлтийг яг одоо түгжиж буй хүн (жижиг үсгээр), эсвэл `null` */
export function ajilClaimHolder(x: Pick<AjilSubmission, 'status' | 'reason'>, now = serverNow()): string | null {
  return ajilClaimOf(x.status, x.reason, now)?.who ?? null;
}

/**
 * БАГЦАД НЭМЭЛТ АЖИЛ ЯГ ОДОО ХУУДСАНД БУУЖ БАЙНА УУ — 2026-10-12 (дарааллын аудит), Хуваарь (`Huvaari.archGate`)
 * ба обьёмын батлагч (`useObyem.archBusy`) `Bagts_*`-д бичихийн ӨМНӨ дуудна.
 */
export async function ajilApplyBusyFor(pkgKey: string): Promise<{ who: string } | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${AJIL_STATUS.approved}'`,
    `${F.oid},${F.status},${F.reason}`,
  );
  for (const a of rows) {
    const c = ajilClaimOf(s(a[F.status]), s(a[F.reason]));
    if (c) return { who: c.who };
  }
  return null;
}

const ajilHeldMsg = (holder: string) => tr('{0} энэ илгээлтийг яг одоо шийдвэрлэж/буулгаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder);
const ajilDecidedMsg = (by: string | null, st: string | null) => (by
  ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, st ?? '')
  : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));

/**
 * ТҮГЖЭЭГ АТОМААР АВАХ (CAS) — цэвэр (сүлжээг `io`-оор; `ajilReapply.check.mjs`).
 * (1) дахин унш — төлөв `want`, өөр хүний/табын хүчинтэй түгжээгүй; (2) тэмдгээ бич;
 * (3) дахин уншиж ЯГ манай тэмдэг үлдсэнийг батал — зэрэг бичсэн хүн ялсан бол түүний нэрийг буцаана.
 */
export async function casAjilClaim(
  io: {
    read: () => Promise<Attrs | null>;
    write: (mark: string) => Promise<boolean>;
    now?: () => number;
    tab?: string;
    takeover?: (who: string) => boolean | Promise<boolean>;
    release?: () => Promise<void>;
  },
  me: string,
  want: AjilStatus,
): Promise<string | null> {
  const now = io.now ?? serverNow;
  const tab = io.tab ?? TAB;
  const u = me.trim().toLowerCase();
  if (!u) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  const row = await io.read();
  if (!row) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  const st = s(row[F.status]);
  if (st !== want) return ajilDecidedMsg(s(row[F.approver]), st);
  const h = ajilClaimOf(st, s(row[F.reason]), now());
  if (h && !(h.who === u && h.tab === tab)) {
    if (h.who !== u || !io.takeover || !(await io.takeover(h.who))) return ajilHeldMsg(h.who);
  }
  const mark = `${AJIL_CLAIM_MARK}:${now()}:${tab}:${u}`;
  let lost = false;
  try {
    if (!(await io.write(mark))) return tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.');
  } catch (e) {
    if (!isLostWrite(e)) throw e;
    lost = true;
  }
  const fail = async (msg: string): Promise<string> => {
    if (lost && io.release) await io.release().catch(() => undefined);
    return msg;
  };
  let back: Attrs | null;
  try {
    back = await io.read();
  } catch (e) {
    if (!lost) throw e;
    return fail(tr('Түгжээний хариу алдагдсан — үр дүн тодорхойгүй; хуудсаа шинэчлээд дахин оролдоно уу.'));
  }
  if (back && s(back[F.status]) === want && s(back[F.reason]) === mark) return null;
  if (back && s(back[F.status]) !== want) return fail(ajilDecidedMsg(s(back[F.approver]), s(back[F.status])));
  const other = back ? ajilClaimOf(s(back[F.status]), s(back[F.reason]), now()) : null;
  return fail(other ? ajilHeldMsg(other.who) : tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.'));
}

const CLAIM_FIELDS = `${F.oid},${F.status},${F.approver},${F.reason}`;

/** Түгжээний тэмдгийг `reason` талбарт бичих — `editOk`-оор */
async function writeReason(url: string, oid: number, reason: string | null): Promise<boolean> {
  let j: Awaited<ReturnType<typeof arcgisPost>>;
  try {
    j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.reason]: reason } }]),
      rollbackOnFailure: 'true',
    });
  } catch (e) {
    if (isLostWrite(e)) invalidate('AJIL_BATLAH');
    throw e;
  }
  const ok = editOk(j.updateResults);
  if (ok) invalidate('AJIL_BATLAH');
  return ok;
}

/**
 * ТҮГЖЭЭ АВАХ — `ajilApply.materializeAdds` (`want: approved`) ба `decideAjil` (`want: pending`).
 */
export async function claimAjil(args: { oid: number; me: string; want: AjilStatus }): Promise<string | null> {
  const url = await tableUrl();
  if (!url) return tr('Батлах хүснэгт олдсонгүй — админд хандана уу.');
  try {
    const err = await casAjilClaim({
      read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0] ?? null,
      write: (mark) => writeReason(url, args.oid, mark),
      takeover: async (who) => typeof window !== 'undefined'
        && askConfirm(tr('Энэ илгээлтийг таны ({0}) өөр цонх түгжсэн байна. Тэр цонхыг хаасан бол түгжээг энд авах уу?', who), { ok: tr('Түгжээг авах') }),
      release: () => releaseAjilClaim({ oid: args.oid, me: args.me }),
    }, args.me, args.want);
    if (!err) invalidate('AJIL_BATLAH');
    return err;
  } catch (e) {
    return String((e as Error).message || e);
  }
}

/**
 * ӨӨР ХЭН НЭГЭН (өөр хүн ЭСВЭЛ өөр таб) хүчинтэй түгжээ барьж байна уу — 2026-10-09
 * (`ajilApply` → `markApplied`-ийн ӨМНӨ). Манай түгжээ хугацаа нь дуусч өөр хүн авсан бол
 * `markApplied` (`reason: null`) түүний тэмдгийг арчиж, бичиж буй жааз нь хамгаалалтгүй болно.
 * @returns бусдын нэр, эсвэл `null` (түгжээ минийх / хэнийх ч биш). Уншилт унавал ШИДНЭ.
 */
export async function ajilClaimOther(oid: number, me: string): Promise<string | null> {
  const u = me.trim().toLowerCase();
  const cur = (await query(`${F.oid} = ${Number(oid)}`, CLAIM_FIELDS))[0];
  if (!cur) return null;
  const h = ajilClaimOf(s(cur[F.status]), s(cur[F.reason]));
  if (!h || (h.who === u && h.tab === TAB)) return null;
  return h.who;
}

/**
 * ТҮГЖЭЭГ ТАЙЛАХ — зөвхөн ЭНЭ табын, төлөв нь хэвээр (`pending`/`approved`) мөрийн тэмдгийг.
 * Алдааг залгина: ямар ч байсан `AJIL_CLAIM_TTL`-ээр тайлагдана.
 */
export async function releaseAjilClaim(args: { oid: number; me: string }): Promise<void> {
  const u = args.me.trim().toLowerCase();
  try {
    const url = await tableUrl();
    if (!url) return;
    const cur = (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0];
    if (!cur) return;
    const h = ajilClaimOf(s(cur[F.status]), s(cur[F.reason]));
    if (!h || h.who !== u || h.tab !== TAB) return;
    if (await writeReason(url, args.oid, null)) invalidate('AJIL_BATLAH');
  } catch { /* AJIL_CLAIM_TTL-ээр тайлагдана */ }
}

/**
 * ИЛГЭЭХ — мөр нэмэгчийн «Батлуулах».
 */
export async function submitAjil(args: {
  pkgKey: string;
  pkgGroup: string;
  author: string;
  note?: string;
  payload: AjilPayload;
}): Promise<{ ok: boolean; error?: string }> {
  requireCap('addRow');
  if (!args.payload.adds.length) {
    return { ok: false, error: tr('Нэмсэн мөр алга.') };
  }
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const own = sameAsLogin(args.author);
    if (own) return own;
    const sc = ajilScope(meNow ?? args.author, 'editor');
    if (sc !== null && !sc.includes(args.pkgGroup))
      return { ok: false, error: tr('Энэ багцад нэмэлт ажил илгээх эрхгүй.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const already = await loadPending(args.pkgKey);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: args.pkgGroup,
    [F.status]: AJIL_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    [F.authorSent]: serverNow(),
    [F.rowCount]: args.payload.adds.length,
    [F.note]: args.note?.trim() || null,
    [F.payload]: JSON.stringify(args.payload),
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.addResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('AJIL_BATLAH');
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    if (Number.isFinite(mine)) try {
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${AJIL_STATUS.pending}'`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        if (!editOk(del?.deleteResults)) {
          const upd = await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: AJIL_STATUS.withdrawn, [F.reason]: DUP_MARK, [F.approverAt]: null } }]),
          }).catch(() => null);
          if (!editOk(upd?.updateResults)) {
            invalidate('AJIL_BATLAH');
            return { ok: false, error: tr('{0} энэ багцад нэмэлт ажлыг түрүүлж илгээсэн байна — таны давхар илгээлтийг цуцалж чадсангүй. Хуудсыг шинэчилнэ үү.', who || tr('Өөр хэрэглэгч')) };
          }
        }
        invalidate('AJIL_BATLAH');
        return { ok: false, error: tr('{0} энэ багцад нэмэлт ажлыг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
      }
    } catch {
      return { ok: false, error: tr('Илгээлт хадгалагдсан боловч давхардлыг шалгаж чадсангүй — хуудсыг шинэчилнэ үү.') };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ШИЙДВЭР — батлах эсвэл буцаах.
 */
export async function decideAjil(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   */
  author?: string;
  reason?: string;
  /**
   * Батлагчийн ХАРСАН агуулгын тэмдэг (`loadPayloadStamped.stamp`) — 2026-09-30.
   */
  stamp?: string;
}): Promise<{ ok: boolean; error?: string; /** Зохиогч агуулгыг өөрчилсөн — дахин харуулна */ stale?: boolean }> {
  requireCap('ajilApprove');
  const own = sameAsLogin(args.approver);
  if (own) return own;
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн нэмэлт ажлыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  if (args.approve && !args.stamp) {
    return { ok: false, stale: true, error: tr('Илгээлтийн агуулгыг харсны дараа батлана уу.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const curFields = `${F.oid},${F.status},${F.approver},${F.author},${F.pkgGroup}${args.stamp ? `,${F.payload}` : ''}`;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, curFields);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = ajilScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын нэмэлт ажлыг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн нэмэлт ажлыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== AJIL_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  if (args.stamp && payloadStamp(String(cur[0][F.payload] ?? '')) !== args.stamp) {
    return { ok: false, stale: true, error: tr('Зохиогч илгээлтийг өөрчилсөн — дахин харж шийднэ үү.') };
  }
  const claimer = me || 'anon';
  const claimErr = await claimAjil({ oid: args.oid, me: claimer, want: AJIL_STATUS.pending });
  if (claimErr) return { ok: false, error: claimErr };
  const release = () => { void releaseAjilClaim({ oid: args.oid, me: claimer }); };
  try {
    const again = (await query(`${F.oid} = ${Number(args.oid)}`, `${CLAIM_FIELDS}${args.stamp ? `,${F.payload}` : ''}`))[0];
    if (!again) { release(); return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') }; }
    if (s(again[F.status]) !== AJIL_STATUS.pending) { release(); return { ok: false, error: ajilDecidedMsg(s(again[F.approver]), s(again[F.status])) }; }
    const h = ajilClaimOf(s(again[F.status]), s(again[F.reason]));
    if (!h || h.who !== claimer || h.tab !== TAB) {
      return { ok: false, error: h ? ajilHeldMsg(h.who) : tr('Таны батлах түгжээний хугацаа дууссан — юу ч бичигдсэнгүй. Дахин оролдоно уу.') };
    }
    if (args.stamp && payloadStamp(String(again[F.payload] ?? '')) !== args.stamp) {
      release();
      return { ok: false, stale: true, error: tr('Зохиогч илгээлтийг өөрчилсөн — дахин харж шийднэ үү.') };
    }
  } catch (e) {
    release();
    return { ok: false, error: String((e as Error).message || e) };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? AJIL_STATUS.approved : AJIL_STATUS.returned,
    [F.approver]: args.approver.toLowerCase(),
    [F.approverAt]: serverNow(),
    [F.reason]: args.approve ? null : (args.reason?.trim() ? ajilReasonSrc(args.reason.trim()).slice(0, REASON_MAX) : null),
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { release(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
    invalidate('AJIL_BATLAH');
    return { ok: true };
  } catch (e) {
    if (isLostWrite(e) || isLostWrite((e as { cause?: unknown } | null)?.cause)) {
      try {
        const back = (await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver}`))[0];
        const want = args.approve ? AJIL_STATUS.approved : AJIL_STATUS.returned;
        if (back && s(back[F.status]) === want && (s(back[F.approver]) ?? '').trim().toLowerCase() === me) {
          invalidate('AJIL_BATLAH');
          return { ok: true };
        }
      } catch (e2) {
        console.warn('[selbe] нэмэлт ажлын шийдвэрийн хариу алдагдсан — дахин уншиж чадсангүй:', e2);
      }
    }
    release();
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч ӨӨРИЙН хүлээгдэж буй илгээлтийг буцааж авна.
 */
export async function withdrawAjil(args: {
  oid: number;
  /** Татаж буй хүн — нэвтэрсэн хэрэглэгч (`currentUser`) байх ёстой */
  me: string;
}): Promise<{
  ok: boolean;
  error?: string;
  unsure?: boolean;
}> {
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.reason}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  const held = ajilClaimOf(s(cur[0][F.status]), s(cur[0][F.reason]));
  if (held && held.who !== me) return { ok: false, error: ajilHeldMsg(held.who) };
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== AJIL_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  const claimErr = await claimAjil({ oid: args.oid, me, want: AJIL_STATUS.pending });
  if (claimErr) return { ok: false, error: claimErr };
  const release = () => { void releaseAjilClaim({ oid: args.oid, me }); };
  try {
    const again = (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0];
    if (!again) { release(); return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') }; }
    if (s(again[F.status]) !== AJIL_STATUS.pending) { release(); return { ok: false, error: ajilDecidedMsg(s(again[F.approver]), s(again[F.status])) }; }
    const h = ajilClaimOf(s(again[F.status]), s(again[F.reason]));
    if (!h || h.who !== me || h.tab !== TAB) {
      return { ok: false, error: h ? ajilHeldMsg(h.who) : tr('Таны түгжээний хугацаа дууссан — юу ч бичигдсэнгүй. Дахин оролдоно уу.') };
    }
  } catch (e) {
    release();
    return { ok: false, error: String((e as Error).message || e) };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: AJIL_STATUS.withdrawn,
    [F.approverAt]: serverNow(),
    [F.reason]: null,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { release(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
    invalidate('AJIL_BATLAH');
    return { ok: true };
  } catch (e) {
    if (isLostWrite(e) || isLostWrite((e as { cause?: unknown } | null)?.cause)) {
      invalidate('AJIL_BATLAH');
      try {
        const back = (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0];
        const st = back ? s(back[F.status]) : null;
        if (st === AJIL_STATUS.withdrawn) return { ok: true };
        if (st === AJIL_STATUS.pending) {
          release();
          return { ok: false, error: tr('Татах хүсэлтийн хариу алдагдсан — илгээлт татагдаагүй, хүлээгдсэн хэвээр. Дахин оролдоно уу.') };
        }
        return { ok: false, error: back ? ajilDecidedMsg(s(back[F.approver]), st) : tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
      } catch (e2) {
        console.warn('[selbe] нэмэлт ажил татах хариу алдагдсан — дахин уншиж чадсангүй:', e2);
        return { ok: false, unsure: true, error: tr('Татах хүсэлтийн хариу алдагдсан — татагдсан эсэх тодорхойгүй. Мөрүүдийг энэ компьютерт хадгалав; хуудсаа шинэчлэхэд шийдэгдэнэ.') };
      }
    }
    release();
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** «Эцэг бүлэг олдсонгүй» буцаалтын стандарт шалтгаан (2026-10-04) */
export const NO_PARENT_REASON = (): string => tr('Эцэг бүлэг олдсонгүй — нэмэлт ажлыг одоо байгаа бүлэгт харьяалуулж дахин илгээнэ үү.');
/** «Багцын түлхүүр бүртгэлд алга» буцаалтын стандарт шалтгаан (2026-10-26) */
export const NO_KEY_REASON = (): string => tr('Багцын түлхүүр бүртгэлд алга — хуудсанд буулгах боломжгүй.');
export const NO_PARENT_REASON_SRC = 'Эцэг бүлэг олдсонгүй — нэмэлт ажлыг одоо байгаа бүлэгт харьяалуулж дахин илгээнэ үү.';
export const NO_KEY_REASON_SRC = 'Багцын түлхүүр бүртгэлд алга — хуудсанд буулгах боломжгүй.';
const AJIL_SYS_REASONS: readonly (readonly [string, () => string])[] = [
  [NO_PARENT_REASON_SRC, NO_PARENT_REASON],
  [NO_KEY_REASON_SRC, NO_KEY_REASON],
];
/** Бичихийн өмнө — системийн мөр (аль ч хэлээр) эх текст болно; хэрэглэгчийн текст ХЭВЭЭР */
export function ajilReasonSrc(text: string): string {
  return text.split('\n').map((ln) => {
    const t = ln.trim();
    const hit = AJIL_SYS_REASONS.find(([src, show]) => t === src || t === show());
    return hit ? hit[0] : ln;
  }).join('\n');
}
/** Хадгалсан шалтгааныг дэлгэцэнд — системийн эх мөрийг идэвхтэй хэлээр */
export function displayAjilReason(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.split('\n').map((ln) => {
    const hit = AJIL_SYS_REASONS.find(([src]) => ln.trim() === src);
    return hit ? hit[1]() : ln;
  }).join('\n');
}

/**
 * ГАЦСАН БАТЛАЛТЫГ БУЦААХ ДҮРЭМ — цэвэр (`ajilApply.check.mjs`, 2026-10-04).
 */
export function returnStuckDeny(status: string | null, reason: string): string | null {
  if (!reason.trim()) return tr('Буцаах шалтгааныг бичнэ үү.');
  if (status !== AJIL_STATUS.approved) return tr('Зөвхөн «Батлагдсан · буулгаагүй» илгээлтийг буцаана. Хуудсаа шинэчилнэ үү.');
  return null;
}

/**
 * БАТЛАГДСАН Ч БУУЛГАХ БОЛОМЖГҮЙ ИЛГЭЭЛТИЙГ БУЦААХ — батлагч эсвэл админ (2026-10-04).
 */
export async function returnStuckAjil(args: { oid: number; me: string; reason?: string }): Promise<{ ok: boolean; error?: string }> {
  const reason = ajilReasonSrc((args.reason ?? NO_PARENT_REASON_SRC).trim()).slice(0, REASON_MAX);
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const own = sameAsLogin(args.me);
    if (own) return own;
    if (roleForUser(meNow) !== 'super' && !hasCap(meNow, 'ajilApprove')) {
      return { ok: false, error: tr('Энэ үйлдэлд эрхгүй — нэмэлт ажлын батлагч эсвэл админ буцаана.') };
    }
  }
  const me = args.me.trim().toLowerCase();
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.pkgGroup},${F.reason}`);
    if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    if (AUTH.appId) {
      const meNow = currentUser() ?? me;
      const sc = roleForUser(meNow) === 'super' ? null : ajilScope(meNow, 'approver');
      if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? ''))) {
        return { ok: false, error: tr('Энэ багцын нэмэлт ажлыг батлах эрхгүй.') };
      }
    }
    const deny = returnStuckDeny(s(cur[0][F.status]), reason);
    if (deny) return { ok: false, error: deny };
    const held = ajilClaimOf(s(cur[0][F.status]), s(cur[0][F.reason]));
    if (held) return { ok: false, error: ajilHeldMsg(held.who) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  const claimer = me || 'anon';
  const claimErr = await claimAjil({ oid: args.oid, me: claimer, want: AJIL_STATUS.approved });
  if (claimErr) return { ok: false, error: claimErr };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid,
        [F.status]: AJIL_STATUS.returned,
        [F.approver]: me || null,
        [F.approverAt]: serverNow(),
        [F.reason]: reason,
      } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) {
      await releaseAjilClaim({ oid: args.oid, me: claimer });
      return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    }
    invalidate('AJIL_BATLAH');
    return { ok: true };
  } catch (e) {
    /* хариу алдагдсан ч аюулгүй — `releaseAjilClaim` зөвхөн `approved` хэвээр, ЭНЭ табын тэмдгийг тайлна */
    await releaseAjilClaim({ oid: args.oid, me: claimer });
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТЭЭ ЗАСАХ — зохиогч батлагч шийдэхээс ӨМНӨ (2026-09-29,
 * хэрэглэгч: «ажил нэмэх хүсэлт явуулсны дараа буцаагаагүй байхад өөрөө дахин засах
 * боломжтой байх»).
 */
export async function updateAjil(args: {
  oid: number;
  /** Засаж буй хүн — нэвтэрсэн хэрэглэгч (`currentUser`) байх ёстой */
  me: string;
  payload: AjilPayload;
}): Promise<{ ok: boolean; error?: string }> {
  requireCap('addRow');
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (!args.payload.adds.length) {
    return { ok: false, error: tr('Нэмсэн мөр алга — бүх мөрийг хасах бол илгээлтээ татна уу.') };
  }
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ засна.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const fields = `${F.oid},${F.status},${F.author},${F.approver},${F.pkgKey},${F.pkgGroup},${F.reason}`;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, fields);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ засна.') };
  if (s(cur[0][F.pkgKey]) !== args.payload.pkgKey) {
    return { ok: false, error: tr('Илгээлт өөр багцынх байна — хуудсаа шинэчилнэ үү.') };
  }
  if (AUTH.appId) {
    const sc = ajilScope(currentUser() ?? me, 'editor');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцад нэмэлт ажил илгээх эрхгүй.') };
  }
  const gone = (st: string | null, by: string | null) => (by
    ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, st ?? '')
    : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
  if (s(cur[0][F.status]) !== AJIL_STATUS.pending) {
    return { ok: false, error: gone(s(cur[0][F.status]), s(cur[0][F.approver])) };
  }
  const held = ajilClaimOf(s(cur[0][F.status]), s(cur[0][F.reason]));
  if (held) return { ok: false, error: ajilHeldMsg(held.who) };
  const claimErr = await claimAjil({ oid: args.oid, me, want: AJIL_STATUS.pending });
  if (claimErr) return { ok: false, error: claimErr };
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.rowCount]: args.payload.adds.length,
    [F.payload]: JSON.stringify(args.payload),
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('AJIL_BATLAH');
    const after = await query(`${F.oid} = ${Number(args.oid)}`, fields);
    if (after.length && s(after[0][F.status]) !== AJIL_STATUS.pending) {
      return {
        ok: false,
        error: tr('Засвар хадгалагдах зуур батлагч шийдвэрлэсэн байна ({0}) — батлагчийн харсан нь өмнөх хувилбар байж болзошгүй. Батлагчтай тулгана уу.', s(after[0][F.status]) ?? ''),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  } finally {
    await releaseAjilClaim({ oid: args.oid, me }).catch(() => undefined);
  }
}

/**
 * ШИЙДВЭРЛЭХ БОЛОМЖТОЙ ИЛГЭЭЛТИЙН ТОО — цэсний тэмдэгт (2026-09-30).
 *
 * `AjilBatlah`-ийн «Шийдвэрлэх» + «Бүртгэлгүй багц» хэсэгтэй ИЖИЛ дүрэм:
 * `pending` · батлагчийн хүрээнд (`ajilScope(…, 'approver')`, super/нэвтрэлтгүй
 * бол хязгааргүй) · ӨӨРИЙН илгээлт БИШ (`decideAjil` татгалздаг).
 */
const BADGE_TTL = 60_000;
const loadBadgePending = cached(loadAllPending, BADGE_TTL, ['AJIL_BATLAH']);

export async function countAjilPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (AUTH.appId) {
      if (!me || !capsRemoteReady() || !ajilAclReady()) return null;
      if (!hasCap(me, 'ajilApprove')) return 0;
    }
    if (!(await ajilTableState()).ok) return null;
    const sc = AUTH.appId ? ajilScope(me, 'approver') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgePending();
    return rows.filter((x) => (sc == null || sc.includes(x.pkgGroup)) && x.author !== me).length;
  } catch {
    return null;
  }
}
