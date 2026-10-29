'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАТЛАХ УРСГАЛ — инженер засна, батлагч батална.
 */

import { GUITS } from '@/lib/services/env';
import { AUTH, ROLE_BY_USER, roleForUser } from './services';
import { obyemAclReady, obyemScope } from './obyemAcl';
import { capsRemoteReady, hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/authToken';
import { currentUser } from './who';
import { invalidate } from './dataBus';
import { cached } from '@/lib/live';
import { REASON_MAX, sameClaimAt, serverNow, syncServerClock } from './huvaariBatlah';

/** Илгээлтийн төлөв */
export const OBYEM_STATUS = {
  /** Инженер илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  withdrawn: 'Татаж авсан',
} as const;
export type ObyemStatus = (typeof OBYEM_STATUS)[keyof typeof OBYEM_STATUS];

/**
 * Буцаах шалтгааны дээд урт (тэмдэгт) — 2026-10-06. Талбар (`butsaasan_shaltgaan`) 2048;
 * `huvaariBatlah.REASON_MAX`-тай ижил 2000. Урьд нь таслагдаагүй тул урт шалтгаан
 * `applyEdits`-ийг бүхэлд нь унагаж, батлагч БУЦААЖ ЧАДАХГҮЙ байв. UI (`toolbar`) ч үүгээр шалгана.
 */

/**
 * ХАГАС БИЧИГДСЭН БАТЛАЛТЫН СЕРВЕРИЙН ТЭМДЭГ — 2026-10-06, `huvaariBatlah.PARTIAL_MARK`-ийн загвар.
 */
export const PARTIAL_MARK = '__hagas_bichigdsen__';
/** Хагас бичсэн батлагчийн нэр (`''` = нэргүй тэмдэг), тэмдэггүй бол `null`. Зөвхөн `pending` мөрд. */
export function partialBy(status: string | null | undefined, reason: string | null | undefined): string | null {
  if (status !== OBYEM_STATUS.pending) return null;
  const r = (reason ?? '').trim();
  if (r !== PARTIAL_MARK && !r.startsWith(`${PARTIAL_MARK}:`)) return null;
  return r.slice(PARTIAL_MARK.length + 1).trim().toLowerCase();
}

/**
 * ДАВХАР ИЛГЭЭЛТИЙН ЦУЦЛАЛТЫН ТЭМДЭГ — 2026-10-06, `huvaariBatlah.DUP_MARK`-ийн загвар.
 * `submitObyem`-ийн давхардал арилгах зам устгал унахад ялагдсан мөрийг `withdrawn` болгохдоо
 * `butsaasan_shaltgaan`-д бичнэ. Урьд нь тэмдэггүй тул тэр мөр `loadHistory`-д багцын «сүүлийн
 * шийдвэр» болж, жинхэнэ буцаалтын шалтгааныг (`useObyem.pvReturned`) инженерээс нуудаг байв.
 */
export const DUP_MARK = '__davhar_tsutslagdsan__';
/** Давхардлын улмаас цуцлагдсан мөр мөн эсэх — түүхээс («сүүлийн шийдвэр»-ээс) хасна */
export function isDupCancel(x: Pick<ObyemSubmission, 'status' | 'reason' | 'approverAt'>): boolean {
  if (x.status !== OBYEM_STATUS.withdrawn) return false;
  return (x.reason ?? '').trim() === DUP_MARK || x.approverAt == null;
}

/**
 * НЭГ ИЛГЭЭЛТИЙН АГУУЛГА.
 */
export type ObyemPayload = {
  v: 1;
  pkgKey: string;
  cells: [number, number | null][];
  /**
   * Мөрийн танигч `[oid, «№ ¦ Ажил»]` (хуудасны дарааллаар) — илгээснээс
   * хойш архивт шинэ жааз орвол батлагч oid-ийг шинэ мөр рүү ЗӨӨХ ганц зам.
   */
  rowKeys?: [number, string][];
};

/** НЭГ ИЛГЭЭЛТ — нэг багцын обьёмын засварын багц */
export type ObyemSubmission = {
  oid: number;
  /** Багцын түлхүүр (`Pkg.key`) — жишээ нь `b2_9f` */
  pkgKey: string;
  /** Багцын БҮЛЭГ (`Pkg.group`) — эрхийн хүрээ үүгээр шалгагдана */
  pkgGroup: string;
  status: ObyemStatus;
  /** Илгээсэн хүн (ArcGIS-ийн нэр, жижиг үсгээр) */
  author: string;
  authorSent: number | null;
  approver: string | null;
  approverAt: number | null;
  reason: string | null;
  note: string | null;
  /** Хэдэн нүд өөрчлөгдсөн — жагсаалтад харуулах. 2026-10-23: хоосон `nud_too` = мэдэгдэхгүй (`null`), 0 биш */
  cellCount: number | null;
  /** Түүхий JSON — `parsePayload`-аар задарна */
  payload: string;
};

const TITLE = 'Selbe_Obyem_Batlah';
const TABLE_NAME = 'obyem_batlah';

/** Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно */
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
  cellCount: 'nud_too',
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
 * болох аккаунтууд (2026-09-11, `permsRemote.FORMER_TABLE_OWNERS`-ийн загвар).
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([
  ...SUPER_OWNERS,
  ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase()),
]);

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
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
  return hit?.url ? `${hit.url}/0` : null;
}

/**
 * Хүснэгт үүсгэх (publish эрхтэй super admin).
 */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын инженерийн төлөвлөсөн обьёмын батлах урсгал'),
    hasStaticData: false,
    maxRecordCount: 10000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await arcgisPost(
    `${restBase()}/content/users/${encodeURIComponent(user)}/createService`,
    { token, createParameters: JSON.stringify(createParameters), outputType: 'featureService' },
  );
  const serviceUrl = created.encodedServiceURL as string | undefined;
  const itemId = created.itemId as string | undefined;
  if (!serviceUrl || !itemId) return null;

  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const table = {
    tables: [{
      name: TABLE_NAME,
      type: 'Table',
      objectIdField: 'objectid',
      fields: [
        { name: 'objectid', type: 'esriFieldTypeOID', nullable: false, editable: false },
        { name: F.pkgKey, type: 'esriFieldTypeString', length: 64, nullable: false, editable: true },
        { name: F.pkgGroup, type: 'esriFieldTypeString', length: 128, nullable: true, editable: true },
        { name: F.status, type: 'esriFieldTypeString', length: 32, nullable: false, editable: true },
        { name: F.author, type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: F.authorSent, type: 'esriFieldTypeDate', nullable: true, editable: true },
        { name: F.approver, type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: F.approverAt, type: 'esriFieldTypeDate', nullable: true, editable: true },
        { name: F.reason, type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: F.note, type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: F.cellCount, type: 'esriFieldTypeInteger', nullable: true, editable: true },
        { name: F.payload, type: 'esriFieldTypeString', length: 1048576, nullable: true, editable: true },
      ],
    }],
  };
  await arcgisPost(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  await arcgisPost(
    `${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`,
    { token, org: 'true', everyone: 'false' },
  );
  return `${serviceUrl}/0`;
}

/**
 * Хүснэгтийн URL — олох, эс бөгөөс (super) үүсгэх.
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const direct: string | null = `${GUITS}/193`;
  if (direct) {
    tableUrlCache = direct;
    return direct;
  }
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  if (!url && canCreate && !ownerMismatch && TABLE_OWNERS.has(auth.user.toLowerCase()))
    url = await createTable(auth.token, auth.user);
  if (url) tableUrlCache = url;
  return url;
}

/** Хүснэгт бэлэн эсэх — харагдац дээр шалтгааныг ил хэлэхэд */
export async function obyemTableReady(canCreate = false): Promise<boolean> {
  try {
    return (await tableUrl(canCreate)) != null;
  } catch {
    return false;
  }
}

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

function toSubmission(a: Attrs): ObyemSubmission | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const pkgKey = s(a[F.pkgKey]);
  if (!pkgKey) return null;
  const st = s(a[F.status]);
  const known = Object.values(OBYEM_STATUS).find((x) => x === st);
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
    cellCount: a[F.cellCount] == null || a[F.cellCount] === '' || !Number.isFinite(Number(a[F.cellCount])) ? null : Number(a[F.cellCount]),
    payload: String(a[F.payload] ?? ''),
  };
}

/**
 * Дуудагчийн өгсөн нэр НЭВТЭРСЭН хэрэглэгчтэй ижил үү (хөтөчид, `AUTH.appId` үед) —
 */
function sameAsLogin(name: string): { ok: false; error: string } | null {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  const meNow = currentUser();
  if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (meNow.toLowerCase() !== name.trim().toLowerCase()) return { ok: false, error: tr('Нэр нэвтэрсэн хэрэглэгчтэй зөрж байна — хуудсаа шинэчилнэ үү.') };
  return null;
}

async function query(where: string, outFields: string, strict = false): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) {
    if (strict && (ownerMismatch || (AUTH.appId && !(await getToken()))))
      throw new Error(tr('Батлах хүснэгт олдсонгүй — админд хандана уу.'));
    return [];
  }
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
    off += fs.length;
    if (!j.exceededTransferLimit || !fs.length) break;
  }
  return out;
}

/** Бүх илгээлтийн ТОЛГОЙ — `payload`-гүй (жагсаалт хөнгөн байх ёстой) */
const HEAD_FIELDS = [
  F.oid, F.pkgKey, F.pkgGroup, F.status, F.author, F.authorSent,
  F.approver, F.approverAt, F.reason, F.note, F.cellCount,
].join(',');

/**
 * Багцын хүлээгдэж буй илгээлт.
 */
export async function loadPending(pkgKey: string): Promise<ObyemSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${OBYEM_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is ObyemSubmission => x != null);
  list.sort((a, b) => a.oid - b.oid);
  return list[0] ?? null;
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<ObyemSubmission[]> {
  const rows = await query(`${F.status} = N'${OBYEM_STATUS.pending}'`, HEAD_FIELDS);
  return rows.map(toSubmission).filter((x): x is ObyemSubmission => x != null);
}

/** Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан ба буцаагдсан) */
export async function loadHistory(pkgKey: string, limit = 20): Promise<ObyemSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${OBYEM_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is ObyemSubmission => x != null && !isDupCancel(x));
  return list.slice(-limit).reverse();
}

/**
 * НЭГ ИЛГЭЭЛТИЙН ТОЛГОЙ — 2026-10-09 (`useObyem.decideObyemHere`): нэг батлагч хоёр табаас зэрэг
 * баталбал хоёр дахь таб «аль хэдийн шийдвэрлэсэн»-ээр унадаг байв — утга нь аль хэдийн бичигдсэн, илгээлт
 * ӨӨРӨӨ баталсан. Дахин уншиж `approved` && `approver === би` бол амжилт гэж үзнэ.
 */
export async function loadHead(oid: number): Promise<ObyemSubmission | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, HEAD_FIELDS);
  return rows.length ? toSubmission(rows[0]) : null;
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<ObyemPayload | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  return parsePayload(String(rows[0][F.payload] ?? ''));
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 */
export function parsePayload(raw: string): ObyemPayload | null {
  try {
    const j = JSON.parse(raw) as Partial<ObyemPayload>;
    if (!j || typeof j !== 'object') return null;
    if (!Array.isArray(j.cells)) return null;
    const cells: [number, number | null][] = [];
    for (const c of j.cells) {
      if (!Array.isArray(c) || c.length !== 2) return null;
      const [oid, v] = c as [unknown, unknown];
      if (!Number.isInteger(oid)) return null;
      if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) return null;
      cells.push([oid as number, v as number | null]);
    }
    const rowKeys: [number, string][] = [];
    if (Array.isArray(j.rowKeys)) {
      for (const e of j.rowKeys as unknown[]) {
        if (Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && typeof e[1] === 'string') {
          rowKeys.push([e[0] as number, e[1]]);
        }
      }
    }
    return { v: 1, pkgKey: String(j.pkgKey ?? ''), cells, rowKeys };
  } catch {
    return null;
  }
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

/**
 * ИЛГЭЭХ — инженерийн «Батлуулах».
 */
export async function submitObyem(args: {
  pkgKey: string;
  pkgGroup: string;
  author: string;
  note?: string;
  payload: ObyemPayload;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.payload.cells.length) {
    return { ok: false, error: tr('Өөрчлөгдсөн нүд алга.') };
  }
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const own = sameAsLogin(args.author);
    if (own) return own;
    const sc = obyemScope(meNow ?? args.author, 'editor');
    if (sc !== null && !sc.includes(args.pkgGroup))
      return { ok: false, error: tr('Энэ багцад обьём илгээх эрхгүй.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const already = await loadPending(args.pkgKey);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: args.pkgGroup,
    [F.status]: OBYEM_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    [F.authorSent]: Date.now(),
    [F.cellCount]: args.payload.cells.length,
    [F.note]: args.note?.trim() || null,
    [F.payload]: JSON.stringify(args.payload),
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.addResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') };
    invalidate('OBYEM_BATLAH');
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    if (Number.isFinite(mine)) try {
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${OBYEM_STATUS.pending}'`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        if (!editOk(del?.deleteResults)) {
          const upd = await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: OBYEM_STATUS.withdrawn, [F.reason]: DUP_MARK, [F.approverAt]: null } }]),
          }).catch(() => null);
          if (!editOk(upd?.updateResults)) {
            invalidate('OBYEM_BATLAH');
            return { ok: false, error: tr('{0} энэ багцын обьёмыг түрүүлж илгээсэн байна — таны давхар илгээлтийг цуцалж чадсангүй. Хуудсыг шинэчилнэ үү.', who || tr('Өөр хэрэглэгч')) };
          }
        }
        invalidate('OBYEM_BATLAH');
        return { ok: false, error: tr('{0} энэ багцын обьёмыг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
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
 * БАТЛАХ ТҮГЖЭЭ (claim) — 2026-10-05, `huvaariBatlah`-ийн `claimPlan`/`casClaim`-ийн загвар.
 */
const CLAIM_TTL = 10 * 60_000;
const CLAIM_FIELDS = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
/** `pending` мөрийг хугацаа нь дуусаагүй түгжээтэй байлгаж буй хүн (жижиг үсгээр), эсвэл `null`. */
function claimHolder(a: Attrs, now = serverNow()): string | null {
  if (s(a[F.status]) !== OBYEM_STATUS.pending) return null;
  const who = s(a[F.approver])?.toLowerCase() ?? null;
  const at = Number(a[F.approverAt]);
  if (!who || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}
/**
 * Жагсаалтын мөрөөс түгжигчийг уншина (`claimHolder`-тай ИЖИЛ дүрэм) — 2026-10-12 (дарааллын аудит),
 * `huvaariBatlah.claimHolderOf`-ийн хуулбар: `aclOps.pendingHeldBy` (аккаунт устгах/үүрэг хасахын өмнөх тоолол).
 */
export function claimHolderOf(sub: Pick<ObyemSubmission, 'status' | 'approver' | 'approverAt'>, now = serverNow()): string | null {
  if (sub.status !== OBYEM_STATUS.pending) return null;
  const who = sub.approver?.trim().toLowerCase() || null;
  const at = sub.approverAt;
  if (!who || at == null || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}
const heldMsg = (holder: string) => tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder);
const decidedMsg = (by: string | null, st: string | null) => (by
  ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, st ?? '')
  : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));

/**
 * ТҮГЖЭЭГ АТОМААР АВАХ (CAS) — цэвэр (сүлжээг `io`-оор), `huvaariBatlah.casClaim`-ийн хуулбар:
 * (1) дахин унш — `pending`, өөр хүний хүчинтэй түгжээгүй; (2) өөр дээрээ бич;
 * (3) дахин уншиж баталгаажуул — зэрэг бичсэн хүн ялсан бол түүний нэрийг буцаана.
 * @returns `null` = түгжээ минийх; мөр = яагаад авч чадаагүй
 */
export async function casObyemClaim(
  io: { read: () => Promise<Attrs | null>; write: (at: number) => Promise<boolean>; now?: () => number },
  me: string,
): Promise<string | null> {
  const now = io.now ?? serverNow;
  const row = await io.read();
  if (!row) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  const st = s(row[F.status]);
  if (st !== OBYEM_STATUS.pending) return decidedMsg(s(row[F.approver]), st);
  const h = claimHolder(row, now());
  if (h && h !== me) return heldMsg(h);
  const at = now();
  if (!(await io.write(at))) return tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.');
  const back = await io.read();
  const who = back ? s(back[F.approver])?.toLowerCase() ?? null : null;
  const ok = !!back
    && s(back[F.status]) === OBYEM_STATUS.pending
    && who === me
    /* Огнооны талбар секундээр тайрагдаж болзошгүй — 1 с-ийн хүлцэл */
    && Math.abs(Number(back[F.approverAt]) - at) < 1000;
  if (ok) return null;
  if (back && s(back[F.status]) !== OBYEM_STATUS.pending) return decidedMsg(who, s(back[F.status]));
  return who && who !== me ? heldMsg(who) : tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.');
}

/**
 * БАТЛАГЧИЙН ХҮРЭЭ ба ЗОХИОГЧ ≠ БАТЛАГЧ — `decideObyem`-ийн дүрмийг `claimObyem` · `markObyemPartial`-д ч НЭГ газраас
 * (2026-10-21, аудит). Серверийн мөрөөр (`F.author` · `F.pkgGroup`); `null` = зөвшөөрнө.
 */
function obyemAuthzDeny(cur: Attrs, me: string): string | null {
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
    const sc = obyemScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[F.pkgGroup] ?? ''))) return tr('Энэ багцын обьёмыг батлах эрхгүй.');
  }
  const author = s(cur[F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) return tr('Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.');
  return null;
}

/**
 * БАТЛАХААР ТҮГЖИХ — үндсэн өгөгдөлд бичихээс ӨМНӨ (`useObyem.decideObyemHere`), 2026-10-05.
 */
export async function claimObyem(args: { oid: number; approver: string }): Promise<{ ok: boolean; error?: string; at?: number }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const cur0 = (await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.pkgGroup}`))[0];
    if (!cur0) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    const deny0 = obyemAuthzDeny(cur0, me);
    if (deny0) return { ok: false, error: deny0 };
    let at0: number | undefined;
    const err = await casObyemClaim({
      read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0] ?? null,
      write: async (at) => {
        at0 = at;
        const j = await arcgisPost(`${url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
          rollbackOnFailure: 'true',
        });
        return editOk(j.updateResults);
      },
    }, me);
    if (!err) invalidate('OBYEM_BATLAH');
    return err ? { ok: false, error: err } : { ok: true, at: at0 };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ҮНДСЭН ӨГӨГДӨЛД БИЧИХИЙН ЯГ ӨМНӨХ ХАМГААЛАЛТ (2026-10-05, `huvaariBatlah.approveGuard`-ийн
 * загвар): төлвийг ДАХИН уншина — `pending` хэвээр, түгжээ ӨӨРИЙНХ (хугацаа нь дуусаагүй) байх ёстой.
 */
const otherWindowMsg = () => tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.');
export async function obyemApproveGuard(args: { oid: number; approver: string; claimAt?: number }): Promise<string | null> {
  const me = args.approver.trim().toLowerCase();
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS);
  if (!cur.length) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  const st = s(cur[0][F.status]);
  if (st === OBYEM_STATUS.withdrawn) return tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.');
  if (st !== OBYEM_STATUS.pending) return decidedMsg(s(cur[0][F.approver]), st);
  const h = claimHolder(cur[0]);
  if (h === me) {
    if (args.claimAt != null && !sameClaimAt(cur[0][F.approverAt], args.claimAt)) return otherWindowMsg();
    return null;
  }
  if (h) return heldMsg(h);
  return tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.');
}

/**
 * БАГЦЫН ОБЬЁМЫН БАТЛАЛТ ЯГ ОДОО ЯВЖ БАЙНА УУ — 2026-10-09 (`ajilApply.materializeInner`).
 */
export async function obyemBusyFor(pkgKey: string): Promise<{ who: string; partial: boolean } | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${OBYEM_STATUS.pending}'`,
    `${CLAIM_FIELDS},${F.reason}`,
    true,
  );
  for (const a of rows) {
    const pb = partialBy(s(a[F.status]), s(a[F.reason]));
    if (pb != null) return { who: pb, partial: true };
  }
  for (const a of rows) {
    const h = claimHolder(a);
    if (h) return { who: h, partial: false };
  }
  return null;
}

/**
 * ТҮГЖЭЭГ ТАЙЛАХ — бичилт эхлээгүй/унасан үед (2026-10-05). Зөвхөн ӨӨРИЙН, `pending` хэвээр
 * мөрийг. Алдааг залгина: ямар ч байсан `CLAIM_TTL`-ээр тайлагдана.
 */
export async function releaseObyemClaim(args: { oid: number; approver: string }): Promise<void> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return;
  try {
    const url = await tableUrl(false);
    if (!url) return;
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS);
    if (!cur.length || claimHolder(cur[0]) !== me) return;
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: null, [F.approverAt]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (editOk(j.updateResults)) invalidate('OBYEM_BATLAH');
  } catch { /* CLAIM_TTL-ээр тайлагдана */ }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ ТАВИХ — батлагч үндсэн өгөгдөлд бичихээс ӨМНӨ (2026-10-06,
 * `PARTIAL_MARK`, `huvaariBatlah.markPlanPartial`-ийн загвар).
 */
export async function markObyemPartial(args: { oid: number; approver: string; claimAt?: number }): Promise<{ ok: boolean; error?: string; existing?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const mark = `${PARTIAL_MARK}:${me}`;
  const fields = `${CLAIM_FIELDS},${F.reason},${F.author},${F.pkgGroup}`;
  try {
    const cur = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!cur) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    const st = s(cur[F.status]);
    if (st === OBYEM_STATUS.withdrawn) return { ok: false, error: tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.') };
    if (st !== OBYEM_STATUS.pending) return { ok: false, error: decidedMsg(s(cur[F.approver]), st) };
    const deny = obyemAuthzDeny(cur, me);
    if (deny) return { ok: false, error: deny };
    const h = claimHolder(cur);
    if (h !== me) {
      return { ok: false, error: h
        ? heldMsg(h)
        : tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.') };
    }
    if (args.claimAt != null && !sameClaimAt(cur[F.approverAt], args.claimAt)) return { ok: false, error: otherWindowMsg() };
    const had = partialBy(st, s(cur[F.reason]));
    if (had != null) return { ok: true, existing: had };
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.reason]: mark } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') };
    invalidate('OBYEM_BATLAH');
    const back = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!back || s(back[F.status]) !== OBYEM_STATUS.pending || claimHolder(back) !== me || (s(back[F.reason]) ?? '').trim() !== mark) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
    if (args.claimAt != null && !sameClaimAt(back[F.approverAt], args.claimAt)) return { ok: false, error: otherWindowMsg() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ АРИЛГАХ — үндсэн өгөгдөлд НЭГ Ч мөр бичигдээгүй унасан үед (2026-10-06).
 */
export async function clearObyemPartial(oid: number, owner?: string): Promise<boolean> {
  const url = await tableUrl(false);
  if (!url) return false;
  try {
    const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status},${F.reason}`);
    const pb = cur.length ? partialBy(s(cur[0][F.status]), s(cur[0][F.reason])) : null;
    if (pb == null) return false;
    if (owner != null && pb !== owner.trim().toLowerCase()) return false;
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.reason]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return false;
    invalidate('OBYEM_BATLAH');
    return true;
  } catch {
    return false;
  }
}

/**
 * ШИЙДВЭР — батлах эсвэл буцаах.
 */
export async function decideObyem(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   */
  author?: string;
  reason?: string;
  dryRun?: boolean;
  skipped?: string;
  claimAt?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  if (!args.approve && (args.reason?.trim().length ?? 0) > REASON_MAX) {
    return { ok: false, error: tr('Шалтгаан хэт урт ({0} тэмдэгтээс ихгүй).', String(REASON_MAX)) };
  }
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup},${F.reason},${F.note}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = obyemScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын обьёмыг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== OBYEM_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) return { ok: false, error: heldMsg(holder) };
  if (holder === me && args.claimAt != null && !sameClaimAt(cur[0][F.approverAt], args.claimAt)) {
    return { ok: false, error: otherWindowMsg() };
  }
  if (!args.approve) {
    const pb = partialBy(curStatus, s(cur[0][F.reason]));
    if (pb != null) {
      return { ok: false, error: tr('Энэ илгээлтийн обьёмыг батлагч ({0}) үндсэн өгөгдөлд ХЭСЭГЧЛЭН бичсэн — буцаах боломжгүй. «Обьём батлах»-ыг дахин дарж бичилтийг гүйцээнэ үү.', pb || '—') };
    }
  }
  if (args.dryRun) return { ok: true };
  let tookClaim = false;
  if (holder !== me) {
    try {
      const err = await casObyemClaim({
        read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0] ?? null,
        write: async (at) => {
          const w = await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
            rollbackOnFailure: 'true',
          });
          return editOk(w.updateResults);
        },
      }, me);
      if (err) return { ok: false, error: err };
    } catch (e) {
      return { ok: false, error: String((e as Error).message || e) };
    }
    tookClaim = true;
    invalidate('OBYEM_BATLAH');
  }
  const undo = () => { if (tookClaim) void releaseObyemClaim({ oid: args.oid, approver: me }); };
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? OBYEM_STATUS.approved : OBYEM_STATUS.returned,
    [F.approver]: me,
    [F.approverAt]: serverNow(),
    [F.reason]: args.approve ? null : (args.reason?.trim()?.slice(0, REASON_MAX) ?? null),
  };
  const skip = args.approve ? (args.skipped ?? '').trim() : '';
  if (skip) {
    const prev = s(cur[0][F.note]);
    /* Дахин баталгаа (бичсэний дараа шийдвэр унасан) давхар залгахгүй */
    attrs[F.note] = (prev ? (prev.includes(skip) ? prev : `${prev}\n${skip}`) : skip).slice(0, 2048);
  }
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { undo(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') }; }
    invalidate('OBYEM_BATLAH');
    return { ok: true };
  } catch (e) {
    undo();
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** `returnStuckObyem`-ийн шалтгааны угтвар — инженер «бичигдсэн обьём хэвээр» гэдгийг харна (2026-10-09) */
export const OBYEM_STUCK_PREFIX = (): string => tr('Хагас бичигдсэн батлалт буцаагдав — үндсэн өгөгдөлд аль хэдийн бичигдсэн обьём хэвээр.');
export const OBYEM_STUCK_PREFIX_SRC = 'Хагас бичигдсэн батлалт буцаагдав — үндсэн өгөгдөлд аль хэдийн бичигдсэн обьём хэвээр.';
/** Хадгалсан шалтгааныг дэлгэцэнд — системийн тогтмол мөрийг идэвхтэй хэлээр, хэрэглэгчийн текст ХЭВЭЭР (2026-10-26) */
export function displayObyemReason(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.split('\n').map((ln) => (ln.trim() === OBYEM_STUCK_PREFIX_SRC ? OBYEM_STUCK_PREFIX() : ln)).join('\n');
}

/**
 * ГАЦСАН (ХАГАС БИЧИГДСЭН) ОБЬЁМЫН ИЛГЭЭЛТИЙГ БУЦААХ — батлагч эсвэл super (2026-10-09,
 * `huvaariBatlah.returnStuckPlan`-ийн ЯГ загвар).
 */
export async function returnStuckObyem(args: { oid: number; approver: string; reason: string }): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const why = args.reason.trim();
  if (!why) return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.pkgGroup},${F.reason},${F.approver},${F.approverAt}`);
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const who = meNow ?? me;
    const sc = roleForUser(who) === 'super' ? null : obyemScope(who, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын обьёмыг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== OBYEM_STATUS.pending) return { ok: false, error: decidedMsg(s(cur[0][F.approver]), curStatus) };
  if (partialBy(curStatus, s(cur[0][F.reason])) == null) {
    return { ok: false, error: tr('Энэ илгээлт хагас бичигдээгүй — жирийн «Буцаах»-аар буцаана уу.') };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) return { ok: false, error: heldMsg(holder) };
  /* Түгжээг АТОМААР — эхний уншилт нь дээрх `cur` (`claimPlan`-ийн загвар) */
  let first: Attrs | null = cur[0];
  try {
    const err = await casObyemClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0] ?? null;
      },
      write: async (at) => {
        const w = await arcgisPost(`${url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
          rollbackOnFailure: 'true',
        });
        return editOk(w.updateResults);
      },
    }, me);
    if (err) return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  invalidate('OBYEM_BATLAH');
  const reason = `${OBYEM_STUCK_PREFIX_SRC}\n${why}`.slice(0, REASON_MAX);
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid,
        [F.status]: OBYEM_STATUS.returned,
        [F.approver]: me,
        [F.approverAt]: serverNow(),
        [F.reason]: reason,
      } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) {
      await releaseObyemClaim({ oid: args.oid, approver: me });
      return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') };
    }
    invalidate('OBYEM_BATLAH');
    return { ok: true };
  } catch (e) {
    /* хариу алдагдсан ч аюулгүй — `releaseObyemClaim` зөвхөн `pending` + өөрийн түгжээг тайлна */
    await releaseObyemClaim({ oid: args.oid, approver: me });
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ТАТАН АВАХ ДҮРЭМ — цэвэр (`obyemBatlah.check.mjs`, 2026-10-04).
 */
export function withdrawDeny(cur: { status: string | null; author: string | null }, me: string): string | null {
  const u = me.trim().toLowerCase();
  if (!u) return tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.');
  if ((cur.author ?? '').trim().toLowerCase() !== u) return tr('Зөвхөн илгээсэн инженер өөрийн илгээлтээ татаж авна.');
  if (cur.status !== OBYEM_STATUS.pending) return tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн тул татаж авах боломжгүй. Хуудсаа шинэчилнэ үү.');
  return null;
}

/**
 * ТАТАН АВАХ — зохиогч өөрийн хүлээгдэж буй обьёмын илгээлтийг цуцална (2026-10-04).
 */
export async function withdrawObyem(args: { oid: number; me: string }): Promise<{ ok: boolean; error?: string }> {
  const meNow = AUTH.appId && typeof window !== 'undefined' ? currentUser() : null;
  if (AUTH.appId && typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const me = (meNow ?? args.me).trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt},${F.reason}`);
    if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    const deny = withdrawDeny({ status: s(cur[0][F.status]), author: s(cur[0][F.author]) }, me);
    if (deny) return { ok: false, error: deny };
    const pb = partialBy(s(cur[0][F.status]), s(cur[0][F.reason]));
    if (pb != null) return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн обьёмыг үндсэн өгөгдөлд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb || '—') };
    const holder = claimHolder(cur[0]);
    if (holder && holder !== me) return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', holder) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  const readHead = async (fields: string) => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
  let at0: number | undefined;
  try {
    const err = await casObyemClaim({
      read: () => readHead(CLAIM_FIELDS),
      write: async (at) => {
        at0 = at;
        const w = await arcgisPost(`${url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
          rollbackOnFailure: 'true',
        });
        return editOk(w.updateResults);
      },
    }, me);
    if (err) return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  invalidate('OBYEM_BATLAH');
  const release = () => releaseObyemClaim({ oid: args.oid, approver: me });
  try {
    const re = await readHead(`${CLAIM_FIELDS},${F.reason}`);
    if (!re || s(re[F.status]) !== OBYEM_STATUS.pending) {
      await release();
      return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн тул татаж авах боломжгүй. Хуудсаа шинэчилнэ үү.') };
    }
    const pb2 = partialBy(s(re[F.status]), s(re[F.reason]));
    if (pb2 != null) {
      await release();
      return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн обьёмыг үндсэн өгөгдөлд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb2 || '—') };
    }
    if (claimHolder(re) !== me || at0 == null || !sameClaimAt(re[F.approverAt], at0)) {
      await release();
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch (e) {
    await release();
    return { ok: false, error: String((e as Error).message || e) };
  }
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.status]: OBYEM_STATUS.withdrawn, [F.approver]: null, [F.approverAt]: serverNow() } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { await release(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин оролдоно уу.') }; }
    invalidate('OBYEM_BATLAH');
  } catch (e) {
    await release();
    return { ok: false, error: String((e as Error).message || e) };
  }
  /* (4) баталгаажуулалт — уншилт унавал бичилт амжилттай хариутай тул `ok` (хуудас шинэчлэхэд харагдана) */
  try {
    const back = await readHead(`${F.oid},${F.status}`);
    if (!back || s(back[F.status]) !== OBYEM_STATUS.withdrawn) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch { /* бичилт `editOk` — амжилттай */ }
  return { ok: true };
}

/**
 * ШИЙДВЭРЛЭХ БОЛОМЖТОЙ ОБЬЁМЫН ИЛГЭЭЛТИЙН ТОО — цэсний тэмдэгт (2026-09-30).
 *
 * `decideObyem`-ийн дүрэм: `pending` · батлагчийн хүрээнд (`obyemScope(…,
 * 'approver')`, super/нэвтрэлтгүй бол хязгааргүй) · ӨӨРИЙН илгээлт БИШ.
 */
const BADGE_TTL = 60_000;
const loadBadgePending = cached(loadAllPending, BADGE_TTL, ['OBYEM_BATLAH']);

export async function countObyemPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (AUTH.appId) {
      if (!me || !capsRemoteReady() || !obyemAclReady()) return null;
      if (!hasCap(me, 'obyemApprove')) return 0;
    }
    if (!(await obyemTableReady(false))) return null;
    const sc = AUTH.appId ? obyemScope(me, 'approver') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgePending();
    return rows.filter((x) => (sc == null || sc.includes(x.pkgGroup)) && x.author.trim().toLowerCase() !== me).length;
  } catch {
    return null;
  }
}
