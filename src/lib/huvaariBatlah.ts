'use client';

/**
 * ХУВААРИЙН БАТЛАХ УРСГАЛ — гүйцэтгэгч зохионо, батлагч батална.
 */

import { GUITS } from '@/lib/services/env';
import { AUTH, ROLE_BY_USER, roleForUser } from './services';
import { huvaariAclReady, huvaariScope } from './huvaariAcl';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/authToken';
import { currentUser } from './who';
import { invalidate } from './dataBus';
import { cached } from '@/lib/live';
import { serverNow, clockOffsetOf, syncServerClock as syncClockAt } from './serverClock';

/** Илгээлтийн төлөв */
export const PLAN_STATUS = {
  /** Гүйцэтгэгч илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  /**
   * ЗОХИОГЧ ӨӨРӨӨ ТАТСАН (2026-09-21). Урьд нь зохиогч илгээснээ буцаах
   * замгүй байв: `decidePlan` нь зохиогч=батлагч буцаалтыг татгалздаг, UI-д
   * товч ч байгаагүй — алдаатай илгээлт өөр батлагч буцаатал багцыг түгжинэ.
   */
  withdrawn: 'Татсан',
} as const;
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

/**
 * Төлөвийн ДЭЛГЭЦИЙН нэр (2026-10-12, аудит) — `PLAN_STATUS` нь ӨГӨГДӨЛ (орчуулагдахгүй), харин
 * алдааны мессежид («… шийдвэрлэсэн байна ({1})») түүхий утга орж англи UI-д монголоор гардаг байв.
 */
export function planStatusLabel(st: string | null | undefined): string {
  switch (st) {
    case PLAN_STATUS.pending: return tr('Хүлээгдэж буй');
    case PLAN_STATUS.approved: return tr('Батлагдсан');
    case PLAN_STATUS.returned: return tr('Буцаасан');
    case PLAN_STATUS.withdrawn: return tr('Татсан');
    default: return st ?? '';
  }
}

/**
 * БАТЛАХ/ХАДГАЛАХ ГИНЖ ЯВЖ БУЙ эсэх — `Portal` харагдац солихоос өмнө асууна
 * (2026-09-25 аудит #4).
 */
const navBusy = new Set<symbol>();
export function setPlanNavBusy(id: symbol, on: boolean): void {
  if (on) navBusy.add(id); else navBusy.delete(id);
}
export function planNavBusy(): boolean {
  return navBusy.size > 0;
}

/**
 * НЭГ ИЛГЭЭЛТ — нэг багцын хуваарийн санал.
 */
export type PlanSubmission = {
  oid: number;
  /** Багцын түлхүүр (`Pkg.key`) — жишээ нь `b2_9f` */
  pkgKey: string;
  /** Багцын БҮЛЭГ (`Pkg.group`) — эрхийн хүрээ үүгээр шалгагдана */
  pkgGroup: string;
  status: PlanStatus;
  /** Илгээсэн хүн (ArcGIS-ийн нэр, жижиг үсгээр) */
  author: string;
  authorSent: number | null;
  /** Шийдвэр гаргасан хүн */
  approver: string | null;
  approverAt: number | null;
  /** Буцаасан шалтгаан — ЗӨВХӨН `returned` төлөвт утгатай */
  reason: string | null;
  /** Гүйцэтгэгчийн тайлбар (сонголтоор) */
  note: string | null;
  /** Өөрчлөгдөх мөрийн тоо — жагсаалтад харуулна (payload задлахгүйгээр). */
  rowCount: number | null;
  /** Хадгалагдсан ноорог — задлахад `parsePayload` */
  payload: string;
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРСӨН МӨРҮҮД — мөрийн `oid` (2026-09-25, хэрэглэгч:
   * «гүйцэтгэлтэй адил алийг нь зөвшөөрсөн, алийг нь зөвшөөрөөгүйг гүйцэтгэгч харна»).
   */
  okRows: number[] | null;
  kind?: PlanPayloadKind;
};

/**
 * ХУВААРИЙН ТӨРӨЛ — илгээлт АЛЬ огнооны багцад хамаарах вэ (2026-09-11).
 */
export type PlanPayloadKind = 'plan' | 'geree';

/** `payload`-ийн задарсан хэлбэр — `Huvaari`-ийн гурван ноорог */
export type PlanPayload = {
  /**
   * ЯМАР ОГНООНЫ багцад хамаарах (2026-09-11).
   */
  kind: PlanPayloadKind;
  /** `oid` → блок бүрийн муж (`null` = тухайн блокт хуваарь байхгүй) */
  spans: Record<string, ({ start: number; end: number } | null)[]>;
  /** `oid` → уялдааны текст */
  deps: Record<string, string>;
  /** `${ажлын код}|${блок}` → сар → обьём */
  obyem: Record<string, Record<string, number>>;
  /**
   * САРЫН НӨӨЦ — `${код}|${блок}` → сар → { хүн хүч, машин } (2026-09-24).
   */
  obres?: Record<string, Record<string, { hun: number | null; mashin: number | null }>>;
  /**
   * ИЛГЭЭХ ҮЕИЙН СУУРЬ — сервер дээр тэр агшинд ЮУ байсан (2026-09-21).
   */
  base?: {
    spans: Record<string, ({ start: number; end: number } | null)[]>;
    deps: Record<string, string | null>;
    obyem: Record<string, Record<string, number>>;
    /** Бодит огноо · нөөцийн суурь (2026-09-23) — `actual`/`res`-тэй ижил хэлбэр */
    actual?: Record<string, { start: (number | null)[]; end: (number | null)[] }>;
    res?: Record<string, { hun: number | null; mashin: number | null }>;
    /** Сарын нөөцийн суурь (2026-09-24) */
    obres?: Record<string, Record<string, { hun: number | null; mashin: number | null }>>;
  };
  /**
   * БОДИТ ЭХЭЛСЭН/ДУУССАН огноо — `oid` → блок бүрийн { start[], end[] }
   * (2026-09-23). `null` = тэр блокт бүртгэлгүй.
   */
  actual: Record<string, { start: (number | null)[]; end: (number | null)[] }>;
  /** Хүн хүч · машин механизм — `oid` → { hun, mashin } (2026-09-23). Сонголттой, дээрхтэй ижил. */
  res: Record<string, { hun: number | null; mashin: number | null }>;
  /**
   * МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮР — `oid` → ажлын код (`des`) (2026-09-29).
   */
  keys?: Record<string, number>;
};

/**
 * ИЛГЭЭЛТИЙН `oid`-ЫГ ОДООГИЙН ЖААЗ РУУ ЗӨӨНӨ — ажлын кодоор (2026-09-29).
 */
export function remapPayload(
  p: PlanPayload,
  cur: readonly { oid: number; des: number | null }[],
): { pay: PlanPayload; map: Map<number, number> } {
  const map = new Map<number, number>();
  if (!p.keys) return { pay: p, map };
  const have = new Set(cur.map((r) => r.oid));
  const byDes = new Map<number, number | null>();
  for (const r of cur) {
    if (r.des == null) continue;
    byDes.set(r.des, byDes.has(r.des) ? null : r.oid);
  }
  const taken = new Set<number>();
  for (const [k, des] of Object.entries(p.keys)) {
    const oid = Number(k);
    if (!Number.isInteger(oid) || have.has(oid)) continue;
    const to = byDes.get(des);
    const tk = String(to);
    if (to == null || taken.has(to) || tk in p.spans || tk in p.deps || tk in p.actual || tk in p.res || tk in p.keys) continue;
    taken.add(to);
    map.set(oid, to);
  }
  if (!map.size) return { pay: p, map };
  const re = <T,>(rec: Record<string, T> | undefined): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec ?? {})) {
      const nk = String(map.get(Number(k)) ?? k);
      if (!(nk in out)) out[nk] = v;
    }
    return out;
  };
  const pay: PlanPayload = {
    ...p,
    spans: re(p.spans),
    deps: re(p.deps),
    actual: re(p.actual),
    res: re(p.res),
    keys: re(p.keys),
    ...(p.base ? {
      base: {
        ...p.base,
        spans: re(p.base.spans),
        deps: re(p.base.deps),
        ...(p.base.actual ? { actual: re(p.base.actual) } : {}),
        ...(p.base.res ? { res: re(p.base.res) } : {}),
      },
    } : {}),
  };
  return { pay, map };
}

const TITLE = 'Selbe_Huvaari_Batlah';
const TABLE_NAME = 'huvaari_batlah';

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
  rowCount: 'mor_too',
  payload: 'aguulga',
  /**
   * Зөвшөөрсөн мөрийн `oid`-ийн JSON массив (2026-09-25) — `PlanSubmission.okRows`.
   */
  okRows: 'zovshoorson_mor',
} as const;

/**
 * ХАГАС БИЧИГДСЭН БАТЛАЛТЫН СЕРВЕРИЙН ТЭМДЭГ (2026-10-01).
 */
export const PARTIAL_MARK = '__hagas_bichigdsen__';
/**
 * Хагас бичсэн батлагчийн нэр (`''` = нэргүй тэмдэг), тэмдэггүй бол `null`.
 */
export function partialBy(status: string | null | undefined, reason: string | null | undefined): string | null {
  if (status !== PLAN_STATUS.pending) return null;
  const r = (reason ?? '').trim();
  if (r !== PARTIAL_MARK && !r.startsWith(`${PARTIAL_MARK}:`)) return null;
  return r.slice(PARTIAL_MARK.length + 1).trim().toLowerCase();
}

/**
 * ДАВХАР ИЛГЭЭЛТИЙН ЦУЦЛАЛТЫН ТЭМДЭГ (2026-10-01) — `submitPlan`-ийн давхардал арилгах
 * зам устгал унахад ялагдсан мөрийг `withdrawn` болгохдоо `butsaasan_shaltgaan`-д бичнэ.
 */
export const DUP_MARK = '__davhar_tsutslagdsan__';
/**
 * Давхардлын улмаас цуцлагдсан мөр мөн эсэх — «сүүлийн шийдвэр»-ээс хасна.
 */
export function isDupCancel(x: Pick<PlanSubmission, 'status' | 'reason' | 'approverAt'>): boolean {
  if (x.status !== PLAN_STATUS.withdrawn) return false;
  return (x.reason ?? '').trim() === DUP_MARK || x.approverAt == null;
}

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
 * `aguulga` талбарын урт (тэмдэгт). 2026-09-29: `base` (2026-09-21) нэмэгдсэнээс
 * хойш «бүх мөр багтана» гэсэн таамаг худал — `submitPlan` илгээхийн өмнө шалгана.
 */
export const PAYLOAD_MAX = 1_048_576;
/** Буцаах шалтгаан · тайлбарын талбарын урт — UI `maxLength` үүнтэй ижил */
export const REASON_MAX = 2000;

/**
 * Хүснэгт үүсгэх (publish эрхтэй super admin).
 */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын хуваарийн батлах урсгал'),
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
        { name: F.rowCount, type: 'esriFieldTypeInteger', nullable: true, editable: true },
        { name: F.payload, type: 'esriFieldTypeString', length: PAYLOAD_MAX, nullable: true, editable: true },
        { name: F.okRows, type: 'esriFieldTypeString', length: 65536, nullable: true, editable: true },
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
  const direct: string | null = `${GUITS}/192`;
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

/**
 * ХҮСНЭГТ БЭЛЭН ҮҮ — ба ҮГҮЙ бол ЯАГААД (2026-09-11).
 */
export type PlanTableState = {
  ok: boolean;
  /**
   * `auth`   — ArcGIS-д нэвтрээгүй (токен алга)
   * `owner`  — ижил нэртэй хүснэгт бий ч эзэн нь танигдахгүй
   * `none`   — хүснэгт олдсонгүй (super нэвтрэхэд үүснэ)
   * `error`  — порталын хайлт алдаа өгсөн (мессеж нь `detail`-д)
   */
  why: 'ok' | 'auth' | 'owner' | 'none' | 'error';
  detail?: string;
};

export async function planTableState(canCreate = false): Promise<PlanTableState> {
  try {
    if (!(await getToken())) return { ok: false, why: 'auth' };
    const url = await tableUrl(canCreate);
    if (url) return { ok: true, why: 'ok' };
    return { ok: false, why: ownerMismatch ? 'owner' : 'none' };
  } catch (e) {
    return { ok: false, why: 'error', detail: String((e as Error)?.message ?? e) };
  }
}

/** Хүснэгт бэлэн эсэх — хуучин дуудагчдад зориулсан нимгэн бүрхүүл */
export async function planTableReady(canCreate = false): Promise<boolean> {
  return (await planTableState(canCreate)).ok;
}

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

/** Мөрийг задлах — танигдахгүй төлөв нь `pending` руу УНАХГҮЙ, алгасна */
function toSubmission(a: Attrs): PlanSubmission | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const pkgKey = s(a[F.pkgKey]);
  if (!pkgKey) return null;
  const st = s(a[F.status]);
  const known = Object.values(PLAN_STATUS).find((x) => x === st);
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
    okRows: parseOkRows(okRowsAttr(a)),
  };
}

/**
 * Зөвшөөрсөн мөрийн жагсаалтыг задлах.
 */
export function parseOkRows(v: unknown): number[] | null {
  if (v == null || String(v).trim() === '') return null;
  try {
    const j = JSON.parse(String(v)) as unknown;
    if (!Array.isArray(j)) return null;
    const out: number[] = [];
    for (const x of j) {
      const n = Number(x);
      if (!Number.isInteger(n)) return null;
      out.push(n);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * `zovshoorson_mor` талбар хүснэгтэд БАЙГАА ЭСЭХ (2026-09-25).
 */
let okRowsLenCache = 0;
const OK_ROWS_MISS_TTL = 60_000;
let okRowsMissAt = 0;
/**
 * Талбарын ЖИНХЭНЭ нэр (том/жижиг үсэг AGOL-ийнхоор) — `outFields`, бичилт,
 * уншилт гурвуулаа үүгээр (2026-09-25 аудит #9). ArcGIS attributes-ийн
 * түлхүүр нь схемийн нэрийн ЯГ бичлэгээр ирдэг тул `a[F.okRows]` нь
 * `Zovshoorson_Mor` г.м. нэртэй талбарыг уншихгүй байв.
 */
let okRowsName: string = F.okRows;
/** Талбарын урт (тэмдэгт); `0` = талбар алга; `-1` = уншигдсангүй (сүлжээ/хүснэгтгүй) */
async function okRowsFieldLen(): Promise<number> {
  if (okRowsLenCache > 0) return okRowsLenCache;
  if (okRowsMissAt && Date.now() - okRowsMissAt < OK_ROWS_MISS_TTL) return 0;
  const url = await tableUrl(false);
  if (!url) return -1;
  try {
    const j = await arcgisPost(url, {});
    const fields = (j.fields as { name?: string; length?: number }[] | undefined) ?? [];
    if (!fields.length) return -1;
    const f = fields.find((x) => (x.name ?? '').toLowerCase() === F.okRows);
    /* урт заагаагүй бол AGOL-ийн анхдагч 256 гэж үзнэ */
    const len = f ? (Number(f.length) > 0 ? Number(f.length) : 256) : 0;
    if (len > 0) { okRowsLenCache = len; okRowsName = f?.name ?? F.okRows; okRowsMissAt = 0; }
    else okRowsMissAt = Date.now();
    return len;
  } catch {
    return -1;
  }
}

/**
 * `catch`-ийн алдааг `{ ok: false, error }`-д ТЕКСТ болгоно (2026-10-06 аудит).
 */
function errText(e: unknown): string {
  if ((e as { sessionExpired?: boolean } | null)?.sessionExpired === true) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  return String((e as Error | null)?.message || e);
}

/**
 * СЕРВЕРИЙН ЦАГ — түгжээний агшин ба хугацааг ҮҮГЭЭР (2026-10-12, аудит).
 */
export { serverNow, clockOffsetOf };
/**
 * Серверийн цагийн зөрүүг шинэчилнэ (кэштэй, явагдаж буйг хуваалцана) — алдааг залгина.
 * @param url хэмжих хүснэгт; өгөөгүй бол хуваарийн батлах хүснэгт (`tableUrl`). `obyemBatlah` өөрийнхөө хүснэгтийг өгнө.
 */
export async function syncServerClock(url?: string): Promise<void> {
  let u: string | null | undefined = url;
  if (!u) { try { u = await tableUrl(false); } catch { return; } }
  if (!u) return;
  return syncClockAt(u, F.oid);
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
/** Мөрийн attributes-аас `zovshoorson_mor`-ыг нэрийн том/жижиг үсэг үл харгалзан уншина */
function okRowsAttr(a: Attrs): unknown {
  if (okRowsName in a) return a[okRowsName];
  if (F.okRows in a) return a[F.okRows];
  const k = Object.keys(a).find((x) => x.toLowerCase() === F.okRows);
  return k ? a[k] : undefined;
}
export async function okRowsField(): Promise<boolean> {
  return (await okRowsFieldLen()) > 0;
}

async function query(where: string, outFields: string, strict = false): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) {
    if (strict && (ownerMismatch || (AUTH.appId && !(await getToken()))))
      throw new Error(tr('Батлах хүснэгт олдсонгүй — админд хандана уу.'));
    return [];
  }
  await syncServerClock();
  const out: Attrs[] = [];
  for (let off = 0; ;) {
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
/** Толгой + зөвшөөрсөн мөр (талбар БАЙГАА үед л — `okRowsField`) */
const headFields = async (): Promise<string> =>
  ((await okRowsField()) ? `${HEAD_FIELDS},${okRowsName}` : HEAD_FIELDS);

/**
 * Багцын СҮҮЛИЙН илгээлт — хуудас нээхэд «хүлээгдэж буй юу» гэдгийг мэднэ.
 */
const KIND_SQL = (kind: PlanPayloadKind): string => (kind === 'geree'
  ? `${F.payload} LIKE '%"kind":"geree"%'`
  : `NOT (${F.payload} LIKE '%"kind":"geree"%')`);

/**
 * Мөрүүдийн агуулгын төрөл — `oid` → `kind` (2026-10-08). Эхлээд НЭГ `LIKE` query-гээр;
 */
async function pendingKinds(oids: number[]): Promise<Map<number, PlanPayloadKind>> {
  const out = new Map<number, PlanPayloadKind>();
  if (!oids.length) return out;
  try {
    const g = await query(`${F.oid} IN (${oids.map(Number).join(',')}) AND ${KIND_SQL('geree')}`, F.oid);
    const geree = new Set(g.map((a) => Number(a[F.oid])));
    for (const o of oids) out.set(o, geree.has(o) ? 'geree' : 'plan');
    return out;
  } catch { /* доорх нөөц зам */ }
  for (const o of oids) {
    const p = await loadPayload(o).catch(() => null);
    if (p) out.set(o, p.kind);
  }
  return out;
}

export async function loadPending(pkgKey: string, kind?: PlanPayloadKind): Promise<PlanSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const base = `${F.pkgKey} = '${esc}' AND ${F.status} = N'${PLAN_STATUS.pending}'`;
  let list: PlanSubmission[];
  if (kind) {
    try {
      const rows = await query(`${base} AND ${KIND_SQL(kind)}`, HEAD_FIELDS, true);
      list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null).map((x) => ({ ...x, kind }));
    } catch {
      /* `LIKE` унавал: бүх pending → агуулгаар шүүнэ (`pendingKinds`-ийн нөөц зам) */
      const rows = await query(base, HEAD_FIELDS, true);
      const all = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
      const kinds = await pendingKinds(all.map((x) => x.oid));
      list = all.filter((x) => kinds.get(x.oid) === kind).map((x) => ({ ...x, kind }));
    }
  } else {
    const rows = await query(base, HEAD_FIELDS, true);
    list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
  }
  list.sort((a, b) => a.oid - b.oid);
  return list[0] ?? null;
}

export async function loadPendingBoth(pkgKey: string): Promise<{ plan: PlanSubmission | null; geree: PlanSubmission | null }> {
  const esc = pkgKey.replace(/'/g, "''");
  const any = await query(`${F.pkgKey} = '${esc}' AND ${F.status} = N'${PLAN_STATUS.pending}'`, F.oid, true);
  if (!any.length) return { plan: null, geree: null };
  const [plan, geree] = await Promise.all([loadPending(pkgKey, 'plan'), loadPending(pkgKey, 'geree')]);
  return { plan, geree };
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<PlanSubmission[]> {
  const rows = await query(`${F.status} = N'${PLAN_STATUS.pending}'`, HEAD_FIELDS);
  const list = rows.map(toSubmission).filter((x): x is PlanSubmission => x != null);
  const byPkg = new Map<string, PlanSubmission[]>();
  for (const x of list) (byPkg.get(x.pkgKey) ?? byPkg.set(x.pkgKey, []).get(x.pkgKey)!).push(x);
  const dupOids = [...byPkg.values()].filter((v) => v.length > 1).flatMap((v) => v.map((x) => x.oid));
  const kinds = await pendingKinds(dupOids).catch(() => new Map<number, PlanPayloadKind>());
  const first = new Map<string, PlanSubmission>();
  for (const x of list) {
    const k = kinds.get(x.oid);
    if (k) x.kind = k;
    const key = `${x.pkgKey}|${k ?? ''}`;
    const was = first.get(key);
    if (!was || x.oid < was.oid) first.set(key, x);
  }
  return list.filter((x) => first.get(`${x.pkgKey}|${x.kind ?? ''}`) === x);
}

/**
 * БАГЦ БҮРИЙН СҮҮЛИЙН ИЛГЭЭЛТ — толгой л (`payload`-гүй) (2026-09-29).
 */
const LAST_SQL = `${F.status} IN (${Object.values(PLAN_STATUS).map((x) => `N'${x}'`).join(',')})`
  + ` AND (${F.status} <> N'${PLAN_STATUS.withdrawn}' OR (${F.approverAt} IS NOT NULL AND (${F.reason} IS NULL OR ${F.reason} <> '${DUP_MARK}')))`;
async function lastOidsBy(url: string, where: string): Promise<number[]> {
  const j = await arcgisPost(`${url}/query`, {
    where,
    groupByFieldsForStatistics: F.pkgKey,
    outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: F.oid, outStatisticFieldName: 'last_oid' }]),
    returnGeometry: 'false',
  });
  const fs = j.features as { attributes?: Attrs }[] | undefined;
  if (!Array.isArray(fs)) throw new Error('stats');
  return fs.map((f) => {
    const a = f.attributes ?? {};
    const k = Object.keys(a).find((x) => x.toLowerCase() === 'last_oid');
    return k ? Number(a[k]) : Number.NaN;
  }).filter((x) => Number.isInteger(x));
}
async function loadLastFast(): Promise<PlanSubmission[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  let kinds: Map<number, PlanPayloadKind> | null = new Map();
  let oids: number[];
  try {
    const [g, p] = await Promise.all([
      lastOidsBy(url, `${LAST_SQL} AND ${KIND_SQL('geree')}`),
      /* `NULL` агуулга бүтэн уншилтад `plan` гэж тооцогддог — `NOT (NULL LIKE …)` нь хасах тул ил */
      lastOidsBy(url, `${LAST_SQL} AND (${F.payload} IS NULL OR ${KIND_SQL('plan')})`),
    ]);
    for (const o of g) kinds.set(o, 'geree');
    for (const o of p) kinds.set(o, 'plan');
    oids = [...g, ...p];
  } catch {
    /* `LIKE` унавал хуучин дүрэм — багцаар, `kind`-гүй */
    kinds = null;
    oids = await lastOidsBy(url, LAST_SQL);
  }
  if (!oids.length) return [];
  const out: PlanSubmission[] = [];
  for (const a of await query(`${F.oid} IN (${oids.join(',')})`, HEAD_FIELDS)) {
    const x = toSubmission(a);
    if (!x) continue;
    if (isDupCancel(x)) throw new Error('dup');
    if (kinds) x.kind = kinds.get(x.oid);
    out.push(x);
  }
  return out;
}

export async function loadLastPerPkg(): Promise<PlanSubmission[]> {
  try { return await loadLastFast(); } catch { /* доорх бүтэн уншилт */ }
  const rows = await query('1=1', HEAD_FIELDS);
  let geree: Set<number> | null = null;
  try {
    geree = new Set((await query(KIND_SQL('geree'), F.oid)).map((a) => Number(a[F.oid])));
  } catch { geree = null; }
  const last = new Map<string, PlanSubmission>();
  for (const a of rows) {
    const x = toSubmission(a);
    if (!x || isDupCancel(x)) continue;
    if (geree) x.kind = geree.has(x.oid) ? 'geree' : 'plan';
    last.set(`${x.pkgKey}|${x.kind ?? ''}`, x);
  }
  return [...last.values()];
}

/**
 * Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан ба буцаагдсан).
 */
export async function loadHistory(pkgKey: string, limit = 20, kind?: PlanPayloadKind): Promise<PlanSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const base = `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${PLAN_STATUS.pending}'`;
  const fields = await headFields();
  const keep = (rows: Attrs[]): PlanSubmission[] =>
    rows.map(toSubmission).filter((x): x is PlanSubmission => x != null && !isDupCancel(x));
  if (!kind) return keep(await query(base, fields)).slice(-limit).reverse();
  try {
    return keep(await query(`${base} AND ${KIND_SQL(kind)}`, fields)).map((x) => ({ ...x, kind })).slice(-limit).reverse();
  } catch { /* доорх нөөц зам */ }
  const all = keep(await query(base, fields)).reverse();
  const out: PlanSubmission[] = [];
  for (const x of all) {
    if (out.length >= limit) break;
    const p = await loadPayload(x.oid).catch(() => null);
    if (p?.kind === kind) out.push({ ...x, kind });
  }
  return out;
}

/* ══════════════ НЯГТ АГУУЛГА (v2) — 2026-10-22 (аудит №4) ══════════════
 */
const PAY_DAY = 86_400_000;
type Enc = number | string | null;
/** Огноо (мс) → хоногийн зөрүү (бүхэл хоног бол) эсвэл мс-ийн мөр */
const encMs = (ms: number | null | undefined, d0: number): Enc => {
  if (ms == null || typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return Number.isInteger(ms) && ms % PAY_DAY === 0 ? ms / PAY_DAY - d0 : String(ms);
};
const decMs = (x: unknown, d0: number): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return (d0 + x) * PAY_DAY;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
};
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const monIdx = (k: string): number | null => {
  const m = MONTH_RE.exec(k);
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? Number(m[1]) * 12 + (mo - 1) : null;
};
const monKey = (i: number): string => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
/** Сар → утга объектыг `[эхний индекс, …утга]` болгоно; түлхүүр/утга хэвийн биш бол объектоор нь (алдагдалгүй) */
function encMonths<V>(rec: Record<string, V>, ok: (v: V) => boolean, enc: (v: V) => unknown): unknown {
  const ks = Object.keys(rec);
  if (!ks.length) return [];
  const idx = ks.map(monIdx);
  if (idx.some((i) => i == null) || ks.some((k) => !ok(rec[k]))) return rec;
  const lo = Math.min(...(idx as number[]));
  const hi = Math.max(...(idx as number[]));
  if (hi - lo > 1200) return rec;
  const out: unknown[] = [lo];
  for (let i = lo; i <= hi; i += 1) {
    const k = monKey(i);
    out.push(k in rec ? enc(rec[k]) : null);
  }
  return out;
}
function decMonths(x: unknown, dec: (v: unknown) => unknown): unknown {
  if (!Array.isArray(x)) return x;
  const out: Record<string, unknown> = {};
  if (!x.length) return out;
  const lo = Number(x[0]);
  if (!Number.isInteger(lo)) return out;
  for (let k = 1; k < x.length; k += 1) if (x[k] !== null) out[monKey(lo + k - 1)] = dec(x[k]);
  return out;
}
const mapRec = <A, B>(rec: Record<string, A> | undefined, f: (v: A, k: string) => B): Record<string, B> =>
  Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [k, f(v, k)]));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `PlanPayload` → нягт JSON мөр (v2). Илгээх (`submitPlan`) үүгээр. */
export function encodePayload(p: PlanPayload): string {
  /* Хоногийн эх — бүх бүхэл хоногийн огнооны MIN (зөрүүнүүд сөрөг биш, богино) */
  let d0 = Number.POSITIVE_INFINITY;
  const see = (ms: number | null | undefined) => {
    if (typeof ms === 'number' && Number.isInteger(ms) && ms % PAY_DAY === 0 && ms / PAY_DAY < d0) d0 = ms / PAY_DAY;
  };
  const seeSpans = (rec: PlanPayload['spans'] | undefined) => {
    for (const arr of Object.values(rec ?? {})) for (const s of arr ?? []) if (s) { see(s.start); see(s.end); }
  };
  const seeActual = (rec: PlanPayload['actual'] | undefined) => {
    for (const v of Object.values(rec ?? {})) { for (const x of v?.start ?? []) see(x); for (const x of v?.end ?? []) see(x); }
  };
  seeSpans(p.spans); seeSpans(p.base?.spans); seeActual(p.actual); seeActual(p.base?.actual);
  if (!Number.isFinite(d0)) d0 = 0;
  const sp1 = (s: { start: number; end: number } | null | undefined): unknown =>
    (s ? [encMs(s.start, d0), encMs(s.end, d0)] : null);
  const same = (a: { start: number; end: number } | null | undefined, b: { start: number; end: number } | null | undefined) =>
    !!a && !!b && a.start === b.start && a.end === b.end;
  const sp = mapRec(p.spans, (arr, k) => {
    const bs = p.base?.spans?.[k];
    return (arr ?? []).map((s, b) => (bs && same(s, bs[b]) ? 0 : sp1(s)));
  });
  /* Хэлбэр нь эвдэрсэн мөр `null` — хуучин задлалт ч тэр мөрийг хаядаг (`sanitizeActual`/`sanitizeRes`) */
  const ac1 = (v: { start: (number | null)[]; end: (number | null)[] }) =>
    (v && Array.isArray(v.start) && Array.isArray(v.end)
      ? [v.start.map((x) => encMs(x, d0)), v.end.map((x) => encMs(x, d0))]
      : null);
  const rs1 = (v: { hun: number | null; mashin: number | null }) =>
    (v && typeof v === 'object' ? [v.hun ?? null, v.mashin ?? null] : null);
  const obEnc = (rec: Record<string, number>) => encMonths(rec, isNum, (v) => v);
  const orEnc = (rec: Record<string, { hun: number | null; mashin: number | null }>) =>
    encMonths(rec, (v) => !!v && typeof v === 'object', (v) => [v.hun ?? null, v.mashin ?? null]);
  const b = p.base;
  const w: Record<string, unknown> = {
    kind: p.kind,
    z: 2,
    d0,
    sp,
    deps: p.deps ?? {},
    ob: mapRec(p.obyem, obEnc),
    or: mapRec(p.obres, orEnc),
    ac: mapRec(p.actual, ac1),
    rs: mapRec(p.res, rs1),
    ...(p.keys ? { keys: p.keys } : {}),
    ...(b ? {
      hb: 1,
      bs: mapRec(b.spans, (arr) => (arr ?? []).map(sp1)),
      bdeps: b.deps ?? {},
      bob: mapRec(b.obyem, obEnc),
      ...(b.actual ? { bac: mapRec(b.actual, ac1) } : {}),
      ...(b.res ? { brs: mapRec(b.res, rs1) } : {}),
      ...(b.obres ? { bor: mapRec(b.obres, orEnc) } : {}),
    } : {}),
  };
  return JSON.stringify(w);
}

/**
 * Нягт (v2) объект → ХУУЧИН хэлбэрийн объект — `parsePayload` цааш нь урьдын шалгалтаар цэвэрлэнэ.
 */
function expandPayload(w: Record<string, unknown>): Record<string, unknown> {
  const d0 = Number(w.d0);
  if (!Number.isFinite(d0)) throw new Error('d0');
  const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
  const spanOf = (x: unknown) => {
    if (!Array.isArray(x)) return null;
    const s = decMs(x[0], d0);
    const e = decMs(x[1], d0);
    return s == null || e == null ? { start: Number.NaN, end: Number.NaN } : { start: s, end: e };
  };
  const bsRec = mapRec(rec(w.bs) as Record<string, unknown>, (arr) => (Array.isArray(arr) ? arr.map(spanOf) : arr));
  const spans = mapRec(rec(w.sp) as Record<string, unknown>, (arr, k) => {
    if (!Array.isArray(arr)) return arr;
    const bs = bsRec[k];
    return arr.map((x, i) => (x === 0 ? (Array.isArray(bs) ? bs[i] ?? null : null) : spanOf(x)));
  });
  const acOf = (v: unknown) => (Array.isArray(v) && Array.isArray(v[0]) && Array.isArray(v[1])
    ? { start: (v[0] as unknown[]).map((x) => decMs(x, d0)), end: (v[1] as unknown[]).map((x) => decMs(x, d0)) }
    : null);
  const rsOf = (v: unknown) => (Array.isArray(v) ? { hun: v[0] ?? null, mashin: v[1] ?? null } : null);
  const obOf = (v: unknown) => decMonths(v, (x) => x);
  const orOf = (v: unknown) => decMonths(v, (x) => (Array.isArray(x) ? { hun: x[0] ?? null, mashin: x[1] ?? null } : x));
  const out: Record<string, unknown> = {
    kind: w.kind,
    spans,
    deps: rec(w.deps),
    obyem: mapRec(rec(w.ob) as Record<string, unknown>, obOf),
    obres: mapRec(rec(w.or) as Record<string, unknown>, orOf),
    actual: mapRec(rec(w.ac) as Record<string, unknown>, acOf),
    res: mapRec(rec(w.rs) as Record<string, unknown>, rsOf),
    ...(w.keys !== undefined ? { keys: w.keys } : {}),
  };
  if (w.hb === 1) {
    out.base = {
      spans: bsRec,
      deps: rec(w.bdeps),
      obyem: mapRec(rec(w.bob) as Record<string, unknown>, obOf),
      ...(w.bac !== undefined ? { actual: mapRec(rec(w.bac) as Record<string, unknown>, acOf) } : {}),
      ...(w.brs !== undefined ? { res: mapRec(rec(w.brs) as Record<string, unknown>, rsOf) } : {}),
      ...(w.bor !== undefined ? { obres: mapRec(rec(w.bor) as Record<string, unknown>, orOf) } : {}),
    };
  }
  return out;
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<PlanPayload | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  return parsePayload(String(rows[0][F.payload] ?? ''));
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 */
/**
 * `spans`-ийг ШАЛГАЖ ЦЭВЭРЛЭНЭ (2026-09-16 аудит).
 */
function sanitizeSpans(raw: object): PlanPayload['spans'] {
  const out: PlanPayload['spans'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const ok = v.map((x) => (
      x != null
      && typeof x === 'object'
      && Number.isFinite((x as { start?: unknown }).start)
      && Number.isFinite((x as { end?: unknown }).end)
      && (x as { start: number }).start <= (x as { end: number }).end
        ? x : null
    ));
    out[k] = ok as PlanPayload['spans'][string];
  }
  return out;
}

/** Тоо эсвэл `null` — бусад бүхэн (мөр, NaN, undefined) `null` (fail-closed) */
const numOrNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * `actual`-ыг ШАЛГАЖ ЦЭВЭРЛЭНЭ (2026-09-23) — `sanitizeSpans`-ын ижил ёс:
 * мөр тус бүрээр fail-closed, эвдэрсэн элемент `null` (`map`, `filter` БИШ —
 * индекс гулсвал огноо өөр блокт бичигдэнэ). `start`/`end` хоёул массив
 * биш бол мөрийг хаяна.
 */
function sanitizeActual(raw: object): PlanPayload['actual'] {
  const out: PlanPayload['actual'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const s = (v as { start?: unknown }).start;
    const e = (v as { end?: unknown }).end;
    if (!Array.isArray(s) || !Array.isArray(e)) continue;
    out[k] = { start: s.map(numOrNull), end: e.map(numOrNull) };
  }
  return out;
}

const intOrNull = (x: unknown): number | null => { const v = numOrNull(x); return v == null ? null : Math.floor(v); };

/** `res` (хүн хүч · машин) — объект биш мөрийг хаяна, тоо биш утга `null`. */
function sanitizeRes(raw: object): PlanPayload['res'] {
  const out: PlanPayload['res'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    out[k] = {
      hun: intOrNull((v as { hun?: unknown }).hun),
      mashin: intOrNull((v as { mashin?: unknown }).mashin),
    };
  }
  return out;
}

/** `obres` (сарын нөөц, 2026-09-24) — түлхүүр → сар → {hun, mashin}; эвдэрсэн сар хаягдана */
function sanitizeObRes(raw: object): NonNullable<PlanPayload['obres']> {
  const out: NonNullable<PlanPayload['obres']> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const months: Record<string, { hun: number | null; mashin: number | null }> = {};
    for (const [sar, x] of Object.entries(v as Record<string, unknown>)) {
      if (!x || typeof x !== 'object') continue;
      months[sar] = { hun: intOrNull((x as { hun?: unknown }).hun), mashin: intOrNull((x as { mashin?: unknown }).mashin) };
    }
    out[k] = months;
  }
  return out;
}

/** `keys` — эвдэрсэн хосыг хаяна (зөөлт нэмэлт; нэг буруу хос бүх саналыг унагахгүй) */
function sanitizeKeys(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const des = typeof v === 'number' ? v : Number.NaN;
    if (Number.isInteger(Number(k)) && Number.isInteger(des)) out[k] = des;
  }
  return out;
}

export function parsePayload(raw: string): PlanPayload | null {
  try {
    const j0 = JSON.parse(raw) as Record<string, unknown> | null;
    if (!j0 || typeof j0 !== 'object') return null;
    const j = (j0.z === 2 ? expandPayload(j0) : j0) as Partial<PlanPayload>;
    const spans = j.spans && typeof j.spans === 'object' ? sanitizeSpans(j.spans) : null;
    if (!spans) return null;
    const kind: PlanPayloadKind = j.kind === 'geree' ? 'geree' : 'plan';
    const b = j.base && typeof j.base === 'object' ? j.base : null;
    const base = b && b.spans && typeof b.spans === 'object'
      ? {
        spans: sanitizeSpans(b.spans),
        deps: (b.deps && typeof b.deps === 'object' ? b.deps : {}) as NonNullable<PlanPayload['base']>['deps'],
        obyem: (b.obyem && typeof b.obyem === 'object' ? b.obyem : {}) as NonNullable<PlanPayload['base']>['obyem'],
        /* Бодит огноо · нөөцийн суурь (2026-09-23) — байвал л */
        ...(b.actual && typeof b.actual === 'object' ? { actual: sanitizeActual(b.actual) } : {}),
        ...(b.res && typeof b.res === 'object' ? { res: sanitizeRes(b.res) } : {}),
        ...(b.obres && typeof b.obres === 'object' ? { obres: sanitizeObRes(b.obres) } : {}),
      }
      : undefined;
    return {
      kind,
      spans,
      deps: (j.deps && typeof j.deps === 'object' ? j.deps : {}) as PlanPayload['deps'],
      obyem: (j.obyem && typeof j.obyem === 'object' ? j.obyem : {}) as PlanPayload['obyem'],
      actual: j.actual && typeof j.actual === 'object' ? sanitizeActual(j.actual) : {},
      res: j.res && typeof j.res === 'object' ? sanitizeRes(j.res) : {},
      /* Сарын нөөц (2026-09-24) — хуучин илгээлтэд байхгүй → `{}` */
      obres: j.obres && typeof j.obres === 'object' ? sanitizeObRes(j.obres) : {},
      ...(base ? { base } : {}),
      /* Мөрийн тогтвортой түлхүүр (2026-09-29) — бүхэл тоон `oid` → бүхэл код л үлдэнэ */
      ...(j.keys && typeof j.keys === 'object' ? { keys: sanitizeKeys(j.keys) } : {}),
    };
  } catch {
    return null;
  }
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

/**
 * ИЛГЭЭХ — гүйцэтгэгчийн «Батлуулах».
 */
export async function submitPlan(args: {
  pkgKey: string;
  pkgGroup: string;
  author: string;
  rowCount: number;
  note?: string;
  payload: PlanPayload;
}): Promise<{ ok: boolean; error?: string; oid?: number }> {
  const payloadJson = encodePayload(args.payload);
  if (payloadJson.length > PAYLOAD_MAX) {
    return { ok: false, error: tr('Илгээлтийн агуулга хэт том ({0} тэмдэгт, дээд {1}). Нэг багцад нэг л илгээлт хүлээгдэх тул хуваан зэрэг илгээх боломжгүй — өөрчлөлтийн нэг хэсгийг эхлээд батлуулж, дараа нь үлдсэнийг илгээнэ үү (эсвэл админд хандана уу).', String(payloadJson.length), String(PAYLOAD_MAX)) };
  }
  let pkgGroup: string;
  try {
    const { PKGS } = await import('@/modules/sheet/bagts.pkg');
    const pk = PKGS.find((p) => p.key === args.pkgKey);
    if (!pk || pk.group !== args.pkgGroup) {
      return { ok: false, error: tr('Багцын түлхүүр ба бүлэг зөрж байна — хуудсаа шинэчилнэ үү.') };
    }
    pkgGroup = pk.group;
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const own = sameAsLogin(args.author);
    if (own) return own;
    const sc = huvaariScope(meNow ?? args.author, 'author');
    if (sc !== null && !sc.includes(pkgGroup))
      return { ok: false, error: tr('Энэ багцад хуваарь илгээх эрхгүй.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const already = await loadPending(args.pkgKey, args.payload.kind);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: pkgGroup,
    [F.status]: PLAN_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    [F.authorSent]: serverNow(),
    [F.rowCount]: args.rowCount,
    [F.note]: args.note?.trim() || null,
    [F.payload]: payloadJson,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.addResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('HUVAARI_BATLAH');
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    if (Number.isFinite(mine)) try {
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${PLAN_STATUS.pending}' AND ${KIND_SQL(args.payload.kind)}`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        if (!editOk(del?.deleteResults)) {
          const upd = await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: PLAN_STATUS.withdrawn, [F.reason]: DUP_MARK, [F.approverAt]: null } }]),
          }).catch(() => null);
          if (!editOk(upd?.updateResults)) {
            invalidate('HUVAARI_BATLAH');
            return { ok: false, error: tr('{0} энэ багцын хуваарийг түрүүлж илгээсэн байна — таны давхар илгээлтийг цуцалж чадсангүй. Хуудсыг шинэчилнэ үү.', who || tr('Өөр хэрэглэгч')) };
          }
        }
        invalidate('HUVAARI_BATLAH');
        return { ok: false, error: tr('{0} энэ багцын хуваарийг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
      }
    } catch {
      return { ok: false, error: tr('Илгээлт хадгалагдсан боловч давхардлыг шалгаж чадсангүй — хуудсыг шинэчилнэ үү.') };
    }
    return Number.isFinite(mine) ? { ok: true, oid: mine } : { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ШИЙДВЭР — батлах эсвэл буцаах.
 */
export async function decidePlan(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   */
  author?: string;
  reason?: string;
  /**
   * Батлагчийн ЗӨВШӨӨРСӨН мөрүүд (2026-09-25) — `PlanSubmission.okRows`.
   */
  okRows?: number[];
  claimAt?: number;
}): Promise<{ ok: boolean; error?: string; warn?: string }> {
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup},${F.reason}`);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = huvaariScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, planStatusLabel(curStatus))
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  if (!args.approve) {
    const pb = partialBy(curStatus, s(cur[0][F.reason]));
    if (pb != null) {
      return { ok: false, error: tr('Энэ илгээлтийн хуваарийг батлагч ({0}) эх хуудсанд ХЭСЭГЧЛЭН бичсэн — буцаах боломжгүй. «Батлах»-ыг дахин дарж бичилтийг гүйцээнэ үү.', pb || '—') };
    }
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  const raw = s(cur[0][F.approver])?.trim().toLowerCase() ?? '';
  if (args.approve && raw && raw !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', raw) };
  }
  if (holder === me && args.claimAt != null && Math.abs(Number(cur[0][F.approverAt]) - args.claimAt) >= 1000) {
    return { ok: false, error: tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.') };
  }
  /** Энэ дуудлага өөрөө түгжээ авсан уу — шийдвэрийн бичилт унавал тайлна */
  let tookClaim = false;
  if (holder !== me) {
    const fields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
    try {
      const got = await casClaim({
        read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null,
        write: (at) => writeClaim(url, args.oid, me, at),
      }, me, { requireEmpty: args.approve });
      if (!got.ok) return { ok: false, error: claimError(got) };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
    tookClaim = true;
  }
  if (!args.approve) {
    let pb: string | null;
    try {
      const re = (await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.reason}`))[0] ?? null;
      if (!re || s(re[F.status]) !== PLAN_STATUS.pending) {
        if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
        return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
      }
      pb = partialBy(s(re[F.status]), s(re[F.reason]));
    } catch (e) {
      if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: errText(e) };
    }
    if (pb != null) {
      if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: tr('Энэ илгээлтийн хуваарийг батлагч ({0}) эх хуудсанд ХЭСЭГЧЛЭН бичсэн — буцаах боломжгүй. «Батлах»-ыг дахин дарж бичилтийг гүйцээнэ үү.', pb || '—') };
    }
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? PLAN_STATUS.approved : PLAN_STATUS.returned,
    [F.approver]: me,
    [F.approverAt]: serverNow(),
    [F.reason]: args.approve ? null : (args.reason?.trim()?.slice(0, REASON_MAX) ?? null),
  };
  let warn: string | undefined;
  if (args.okRows) {
    const js = JSON.stringify(args.okRows.filter((x) => Number.isInteger(x)));
    const len = await okRowsFieldLen().catch(() => -1);
    if (len < 0) warn = tr('Зөвшөөрсөн мөрийн тэмдэглэгээ хадгалагдсангүй (шийдвэр хадгалагдсан) — холболт тасарсан байж магадгүй.');
    else
    if (len > 0 && js.length <= len) attrs[okRowsName] = js;
    else if (len > 0) warn = tr('Зөвшөөрсөн мөрийн тэмдэглэгээ хүснэгтийн талбарт багтсангүй (шийдвэр хадгалагдсан) — админд мэдэгдэнэ үү.');
    else warn = tr('Батлах хүснэгтэд зөвшөөрсөн мөрийн тэмдэглэгээний талбар алга (шийдвэр хадгалагдсан) — админд мэдэгдэнэ үү.');
    if (len === 0 || (len > 0 && js.length > len)) console.warn(`[selbe] huvaariBatlah: «${F.okRows}» талбар ${len > 0 ? `богино (${len})` : 'алга'} — String (урт 65536) болгоно`);
  }
  const undo = () => { if (tookClaim) void releasePlanClaim({ oid: args.oid, approver: me }); };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { undo(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
    invalidate('HUVAARI_BATLAH');
    /* ⚠️ 2026-10-29 (хэрэглэгч: «төлөвлөхөд шууд ордог байх ёстой»): батлагдсан хуваарийн (төлөвлөгөө · гэрээ) огноог
       «Төсөл төлөвлөгөө биелэлт»-ийн хүснэгтэд (CASHFLOW_NEW `geree_*` · `guits_*`) бичнэ (`projectPlanSync`). Шийдвэрийг
       САТААЛГҮЙ ард нь — унавал дараагийн батлалт зөрсөн мөрийг дахин тулгаж нөхнө. */
    if (args.approve) {
      void import('./projectPlanSync')
        .then((m) => m.syncPlanProgress())
        .then((r) => { if (!r.ok) console.warn('[selbe] төсөл төлөвлөгөөний огноо бичигдсэнгүй:', r.error); })
        .catch((e) => console.warn('[selbe] төсөл төлөвлөгөөний огноо бичих алдаа:', e));
    }
    return { ok: true, warn };
  } catch (e) {
    undo();
    return { ok: false, error: errText(e) };
  }
}

/**
 * ТҮГЖЭЭГ АТОМААР АВАХ (CAS) — `claimPlan` ба `decidePlan` хоёулаа (2026-10-01,
 * хэрэглэгч: бүгдийг зас).
 */
export type ClaimFail = { ok: false; why: 'gone' | 'decided' | 'held' | 'expired' | 'write' | 'lost'; holder: string | null; status?: string | null };
export async function casClaim(
  io: { read: () => Promise<Attrs | null>; write: (at: number) => Promise<boolean>; now?: () => number },
  me: string,
  opt: { requireEmpty: boolean },
): Promise<{ ok: true } | ClaimFail> {
  const now = io.now ?? serverNow;
  const row = await io.read();
  if (!row) return { ok: false, why: 'gone', holder: null };
  const st = s(row[F.status]);
  if (st !== PLAN_STATUS.pending) return { ok: false, why: 'decided', holder: s(row[F.approver])?.toLowerCase() ?? null, status: st };
  const h = claimHolder(row, now());
  if (h && h !== me) return { ok: false, why: 'held', holder: h };
  const raw = s(row[F.approver])?.toLowerCase() ?? '';
  if (opt.requireEmpty && raw && raw !== me) return { ok: false, why: 'expired', holder: raw };
  const at = now();
  if (!(await io.write(at))) return { ok: false, why: 'write', holder: null };
  const back = await io.read();
  const who = back ? s(back[F.approver])?.toLowerCase() ?? null : null;
  const ok = !!back
    && s(back[F.status]) === PLAN_STATUS.pending
    && who === me
    /* Огнооны талбар секундээр тайрагдаж болзошгүй — 1 с-ийн хүлцэл */
    && Math.abs(Number(back[F.approverAt]) - at) < 1000;
  if (ok) return { ok: true };
  return { ok: false, why: 'lost', holder: who && who !== me ? who : null };
}

/** `casClaim`-ийн татгалзлыг хэрэглэгчийн мессеж болгоно — БАЙГАА мөрүүд (шинэ tr() үгүй) */
function claimError(f: ClaimFail): string {
  switch (f.why) {
    case 'gone': return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
    case 'decided': return f.holder
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', f.holder, planStatusLabel(f.status))
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
    case 'expired': return tr('{0} энэ илгээлтийг түгжсэн байна — таны түгжээ хугацаа дууссан. Хуудсаа шинэчилнэ үү.', f.holder ?? '');
    case 'write': return tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.');
    case 'held':
    case 'lost':
    default: return f.holder
      ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', f.holder)
      : tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.');
  }
}

/** Түгжээг бичнэ (`approver`/`approverAt`) — амжилттай бол `HUVAARI_BATLAH`-ыг хүчингүй болгоно */
async function writeClaim(url: string, oid: number, me: string, at: number): Promise<boolean> {
  const j = await arcgisPost(`${url}/applyEdits`, {
    updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.approver]: me, [F.approverAt]: at } }]),
    rollbackOnFailure: 'true',
  });
  if (!editOk(j.updateResults)) return false;
  invalidate('HUVAARI_BATLAH');
  return true;
}

/**
 * НЭГ ИЛГЭЭЛТИЙН ТОЛГОЙ (`payload`-гүй) — `oid`-оор (2026-10-01).
 */
export async function loadSubmissionHead(oid: number): Promise<PlanSubmission | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, HEAD_FIELDS);
  return rows.length ? toSubmission(rows[0]) : null;
}

export async function isApprovedBy(oid: number, user: string): Promise<boolean> {
  const me = user.trim().toLowerCase();
  if (!me) return false;
  const h = await loadSubmissionHead(oid).catch(() => null);
  return !!h && h.status === PLAN_STATUS.approved && h.approver === me;
}

/**
 * ЭХ ХУУДСАНД БИЧИХИЙН ӨМНӨХ ХАМГААЛАЛТ — цэвэр функц (2026-10-01, хэрэглэгч: бүгдийг зас).
 */
export function approveGuard(
  fresh: Pick<PlanSubmission, 'oid' | 'status' | 'approver' | 'approverAt'> | null,
  oid: number,
  me: string,
  claimAt?: number,
  now = serverNow(),
): string | null {
  const mine = me.trim().toLowerCase();
  if (!fresh || fresh.oid !== oid) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  if (fresh.status === PLAN_STATUS.withdrawn) {
    return tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.');
  }
  if (fresh.status !== PLAN_STATUS.pending) {
    return fresh.approver
      ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', fresh.approver, planStatusLabel(fresh.status))
      : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.');
  }
  const h = claimHolderOf(fresh, now);
  if (h === mine) {
    if (claimAt != null && !sameClaimAt(fresh.approverAt, claimAt)) {
      return tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.');
    }
    return null;
  }
  if (h) return tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h);
  return tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.');
}

/**
 * БАТЛАХ ТҮГЖЭЭ (claim) — 2026-09-25 аудит.
 */
const CLAIM_TTL = 10 * 60_000;
/**
 * Түгжээний агшин дуудагчийн барьсан агшинтай ИЖИЛ үү — ±1000 мс (огнооны талбар секундээр
 * тайрагдаж болно; `casClaim`-ийн ижил хүлцэл). `null`/эвдэрсэн бол үгүй (2026-10-12).
 */
export function sameClaimAt(at: unknown, claimAt: number): boolean {
  const v = Number(at);
  return at != null && Number.isFinite(v) && v > 0 && Math.abs(v - claimAt) < 1000;
}
/** `pending` мөрийг хугацаа нь дуусаагүй түгжээтэй байлгаж буй хүн (жижиг үсгээр), эсвэл `null`. */
function claimHolder(a: Attrs, now = serverNow()): string | null {
  if (s(a[F.status]) !== PLAN_STATUS.pending) return null;
  const who = s(a[F.approver])?.toLowerCase() ?? null;
  const at = Number(a[F.approverAt]);
  if (!who || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}
/**
 * Жагсаалтын мөрөөс түгжигчийг уншина (`claimHolder`-тай ИЖИЛ дүрэм) — 2026-09-29
 * аудит: батлагчийн жагсаалт «X батлаж байна» гэж харуулж, хоёр дахь батлагч бүтэн
 * хяналт хийгээд сая `claimPlan` дээр унахаас сэргийлнэ.
 */
export function claimHolderOf(sub: Pick<PlanSubmission, 'status' | 'approver' | 'approverAt'>, now = serverNow()): string | null {
  if (sub.status !== PLAN_STATUS.pending) return null;
  const who = sub.approver?.trim().toLowerCase() || null;
  const at = sub.approverAt;
  if (!who || at == null || !Number.isFinite(at) || at <= 0) return null;
  return now - at < CLAIM_TTL ? who : null;
}

/**
 * БАТЛАХААР ТҮГЖИХ — эх хуудсанд бичихээс ӨМНӨ (`Huvaari.decide`).
 * `decidePlan`-ийн дүрмүүд (өөрийгөө биш · хүрээ · `pending`) + өөр хүний
 * хүчинтэй түгжээ байхгүй. Амжилттай бол `decidePlan` нь ЭНЭ батлагчид л
 * зөвшөөрөгдөнө, `withdrawPlan` татгалзана.
 */
export async function claimPlan(args: { oid: number; approver: string; author?: string }): Promise<{ ok: boolean; error?: string; at?: number }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const own = sameAsLogin(me);
  if (own) return own;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup}`;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, fields);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = huvaariScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (s(cur[0][F.status]) !== PLAN_STATUS.pending) {
    return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  let first: Attrs | null = cur[0];
  let at0: number | undefined;
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
      },
      write: (at) => { at0 = at; return writeClaim(url, args.oid, me, at); },
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  return { ok: true, at: at0 };
}

/**
 * ТҮГЖЭЭГ СУНГАХ — урт `save`-ийн явцад (2026-10-12, аудит).
 */
export async function renewPlanClaim(args: { oid: number; approver: string; claimAt: number }): Promise<{ ok: boolean; at?: number; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const own = sameAsLogin(me);
  if (own) return own;
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    const read = async () => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    const cur = await read();
    if (!cur) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    if (s(cur[F.status]) !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    const h = claimHolder(cur);
    if (h !== me) {
      return { ok: false, error: h
        ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h)
        : tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.') };
    }
    if (!sameClaimAt(cur[F.approverAt], args.claimAt)) {
      return { ok: false, error: tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.') };
    }
    const at = serverNow();
    if (!(await writeClaim(url, args.oid, me, at))) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    const back = await read();
    if (!back || s(back[F.status]) !== PLAN_STATUS.pending || s(back[F.approver])?.toLowerCase() !== me || !sameClaimAt(back[F.approverAt], at)) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
    return { ok: true, at };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ТҮГЖЭЭГ ТАЙЛАХ — бичилт унасан/тасарсан үед (`Huvaari`). Зөвхөн ӨӨРИЙН,
 * `pending` хэвээр мөрийг. Алдааг залгина: ямар ч байсан `CLAIM_TTL`-ээр тайлагдана.
 */
export async function releasePlanClaim(args: { oid: number; approver: string }): Promise<void> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return;
  try {
    const url = await tableUrl(false);
    if (!url) return;
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt}`);
    if (!cur.length || claimHolder(cur[0]) !== me) return;
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: null, [F.approverAt]: null } }]),
      rollbackOnFailure: 'true',
    });
    if (editOk(j.updateResults)) invalidate('HUVAARI_BATLAH');
  } catch { /* CLAIM_TTL-ээр тайлагдана */ }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ ТАВИХ — батлагчийн `save` эх хуудсанд АНХНЫ бичилтээс ӨМНӨ
 * (2026-10-01, `PARTIAL_MARK`).
 */
export async function markPlanPartial(args: { oid: number; approver: string; claimAt?: number }): Promise<{ ok: boolean; error?: string; existing?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const mark = `${PARTIAL_MARK}:${me}`;
  const fields = `${F.oid},${F.status},${F.approver},${F.approverAt},${F.reason}`;
  const otherWindow = () => tr('Энэ илгээлтийг таны өөр цонх түгжсэн байна — тэр цонхноос үргэлжлүүлнэ үү, эсвэл хуудсаа шинэчилнэ үү.');
  try {
    const cur = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!cur) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    if (s(cur[F.status]) !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    const h = claimHolder(cur);
    if (h !== me) {
      return { ok: false, error: h
        ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', h)
        : tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.') };
    }
    if (args.claimAt != null && !sameClaimAt(cur[F.approverAt], args.claimAt)) return { ok: false, error: otherWindow() };
    const had = partialBy(s(cur[F.status]), s(cur[F.reason]));
    if (had != null) return { ok: true, existing: had };
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.reason]: mark } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    invalidate('HUVAARI_BATLAH');
    const back = (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
    if (!back || s(back[F.status]) !== PLAN_STATUS.pending || claimHolder(back) !== me || (s(back[F.reason]) ?? '').trim() !== mark) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
    if (args.claimAt != null && !sameClaimAt(back[F.approverAt], args.claimAt)) return { ok: false, error: otherWindow() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * ХАГАС БИЧИЛТИЙН ТЭМДЭГ АРИЛГАХ (2026-10-01) — эх хуудсанд НЭГ Ч мөр бичигдээгүй унасан үед.
 */
export async function clearPlanPartial(oid: number, owner?: string): Promise<boolean> {
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
    invalidate('HUVAARI_BATLAH');
    return true;
  } catch {
    return false;
  }
}

/**
 * `returnStuckPlan`-ийн шалтгааны угтвар — зохиогч «бичигдсэн огноо хэвээр» гэдгийг харна.
 */
export const STUCK_PREFIX_SRC = 'Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.';
export const STUCK_PREFIX = (): string => tr('Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.');
/**
 * «Хуанли дээр нээлгүй буцаасан» тайлбар (`HuvaariBatlah`-ийн дарааллаас буцаах) — БИЧИХДЭЭ энэ эх
 * текстийг (`tr()`-гүй) шалтгааны сүүлийн мөрөнд залгана; дэлгэцэнд `displayReason` орчуулна (2026-10-12).
 */
export const BLIND_NOTE_SRC = '(Батлагч хуваарийг хуанли дээр нээлгүй буцаасан — өөрчлөгдсөн бүх мөрийг шалгана уу.)';
/**
 * ХАДГАЛСАН ШАЛТГААН/ТАЙЛБАРЫГ ДЭЛГЭЦЭНД (2026-10-12, аудит) — системийн тогтмол мөрүүдийг (`STUCK_PREFIX_SRC`
 * · `BLIND_NOTE_SRC`) идэвхтэй хэлээр орчуулна; хэрэглэгчийн бичсэн текст ХЭВЭЭР. Мөр тус бүрээр тулгана
 * (угтвар нь эхний мөр, тайлбар нь сүүлийн мөр — `\n`-ээр залгагддаг). `null`/хоосон → `''` (дуудагч
 * «шалтгаан бичигдээгүй» г.м.-ийг өөрөө харуулна). Литерал `tr` — i18n-extract түлхүүрийг олно.
 * Урьд нь орчуулагдаж (англиар) хадгалагдсан хуучин мөр түүхийгээрээ харагдана.
 */
export function displayReason(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.split('\n').map((ln) => {
    const t = ln.trim();
    if (t === STUCK_PREFIX_SRC) return tr('Хагас бичигдсэн батлалт буцаагдав — хуудсанд аль хэдийн бичигдсэн огноо хэвээр.');
    if (t === BLIND_NOTE_SRC) return tr('(Батлагч хуваарийг хуанли дээр нээлгүй буцаасан — өөрчлөгдсөн бүх мөрийг шалгана уу.)');
    return ln;
  }).join('\n');
}

/**
 * ГАЦСАН (ХАГАС БИЧИГДСЭН) ИЛГЭЭЛТИЙГ БУЦААХ — батлагч эсвэл super (2026-10-08).
 */
export async function returnStuckPlan(args: { oid: number; approver: string; reason: string }): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: false, error: errText(e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const who = meNow ?? me;
    const sc = roleForUser(who) === 'super' ? null : huvaariScope(who, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын хуваарийг батлах эрхгүй.') };
  }
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
  if (partialBy(curStatus, s(cur[0][F.reason])) == null) {
    return { ok: false, error: tr('Энэ илгээлт хагас бичигдээгүй — жирийн «Буцаах»-аар буцаана уу.') };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder) };
  }
  const claimFields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  let first: Attrs | null = cur[0];
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return (await query(`${F.oid} = ${Number(args.oid)}`, claimFields))[0] ?? null;
      },
      write: (at) => writeClaim(url, args.oid, me, at),
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  const reason = `${STUCK_PREFIX_SRC}\n${why}`.slice(0, REASON_MAX);
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid,
        [F.status]: PLAN_STATUS.returned,
        [F.approver]: me,
        [F.approverAt]: serverNow(),
        [F.reason]: reason,
      } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) {
      await releasePlanClaim({ oid: args.oid, approver: me });
      return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    }
    invalidate('HUVAARI_BATLAH');
    return { ok: true };
  } catch (e) {
    await releasePlanClaim({ oid: args.oid, approver: me });
    return { ok: false, error: errText(e) };
  }
}

/**
 * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч ӨӨРИЙН хүлээгдэж буй илгээлтийг буцааж авна
 * (2026-09-21).
 */
export async function withdrawPlan(args: {
  oid: number;
  /** Татаж буй хүн — нэвтэрсэн хэрэглэгч (`currentUser`) байх ёстой */
  me: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  }
  let url: string;
  let cur: Attrs[];
  try {
    const u = await tableUrl(false);
    if (!u) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
    url = u;
    cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt},${F.reason}`);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== PLAN_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, planStatusLabel(curStatus))
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  const pb = partialBy(curStatus, s(cur[0][F.reason]));
  if (pb != null) {
    return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн хуваарийг эх хуудсанд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb || '—') };
  }
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) {
    return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', holder) };
  }
  const claimFields = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
  const readHead = async (fields: string) => (await query(`${F.oid} = ${Number(args.oid)}`, fields))[0] ?? null;
  let first: Attrs | null = cur[0];
  let at0: number | undefined;
  try {
    const got = await casClaim({
      read: async () => {
        if (first) { const f = first; first = null; return f; }
        return readHead(claimFields);
      },
      write: (at) => { at0 = at; return writeClaim(url, args.oid, me, at); },
    }, me, { requireEmpty: false });
    if (!got.ok) return { ok: false, error: claimError(got) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
  const release = () => releasePlanClaim({ oid: args.oid, approver: me });
  try {
    const re = await readHead(`${claimFields},${F.reason}`);
    if (!re || s(re[F.status]) !== PLAN_STATUS.pending) {
      await release();
      return { ok: false, error: tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.') };
    }
    const pb2 = partialBy(s(re[F.status]), s(re[F.reason]));
    if (pb2 != null) {
      await release();
      return { ok: false, error: tr('Батлагч ({0}) энэ илгээлтийн хуваарийг эх хуудсанд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pb2 || '—') };
    }
    if (claimHolder(re) !== me || at0 == null || !sameClaimAt(re[F.approverAt], at0)) {
      await release();
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch (e) {
    await release();
    return { ok: false, error: errText(e) };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: PLAN_STATUS.withdrawn,
    /* Түгжээний үлдэгдэл (зохиогчийн CAS түгжээ ч) «батлагч» баганад үлдэхгүй */
    [F.approver]: null,
    [F.approverAt]: serverNow(),
    [F.reason]: null,
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) { await release(); return { ok: false, error: tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') }; }
    invalidate('HUVAARI_BATLAH');
  } catch (e) {
    await release();
    return { ok: false, error: errText(e) };
  }
  /* (4) баталгаажуулалт — уншилт унавал бичилт амжилттай хариутай тул `ok` (хуудас шинэчлэхэд харагдана) */
  try {
    const back = await readHead(`${F.oid},${F.status}`);
    if (!back || s(back[F.status]) !== PLAN_STATUS.withdrawn) {
      return { ok: false, error: tr('Илгээлтийг өөр хүн зэрэг шийдвэрлэж байна — хуудсаа шинэчилнэ үү.') };
    }
  } catch { /* бичилт `editOk` — амжилттай */ }
  return { ok: true };
}

/**
 * ШИЙДВЭРЛЭХ БОЛОМЖТОЙ ХУВААРИЙН ИЛГЭЭЛТИЙН ТОО — цэсний тэмдэгт (2026-09-30).
 *
 * `HuvaariBatlah`-ийн «Шийдвэрлэх» + «Бүртгэлгүй багц»-тай ИЖИЛ дүрэм: `pending` ·
 * батлагчийн хүрээнд (`huvaariScope(…, 'approver')`, super/нэвтрэлтгүй бол
 * хязгааргүй) · ӨӨРИЙН илгээлт БИШ · ӨӨР батлагчийн хүчинтэй түгжээгүй
 * (`claimHolderOf` — тэр үед `claimPlan` татгалзана).
 */
const BADGE_TTL = 60_000;
const loadBadgePending = cached(loadAllPending, BADGE_TTL, ['HUVAARI_BATLAH']);

export async function countPlanPending(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (AUTH.appId) {
      if (!me || !huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'approver') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgePending();
    const now = serverNow();
    return rows.filter((x) => {
      if (sc != null && !sc.includes(x.pkgGroup)) return false;
      if (x.author.trim().toLowerCase() === me) return false;
      const h = claimHolderOf(x, now);
      return !h || h === me;
    }).length;
  } catch {
    return null;
  }
}

/**
 * ЗОХИОГЧИД БУЦААГДСАН, ДАХИН ИЛГЭЭГЭЭГҮЙ ИЛГЭЭЛТИЙН ТОО — «Хуваарь» цэсний тэмдэгт (2026-10-08).
 *
 * `HuvaariBatlah`-ийн «Буцаагдсан — засаад дахин илгээнэ» хэсэгтэй ИЖИЛ дүрэм: багцын СҮҮЛИЙН
 * илгээлт (`loadLastPerPkg`) `returned` · зохиогч нь би · зохиогчийн хүрээнд (`huvaariScope(…,
 * 'author')`). Дахин илгээсэн бол сүүлийнх нь `pending`/өөр тул тоологдохгүй.
 */
const loadBadgeLast = cached(loadLastPerPkg, BADGE_TTL, ['HUVAARI_BATLAH']);

export async function countPlanReturned(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me) return AUTH.appId ? null : 0;
    if (AUTH.appId) {
      if (!huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'author') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgeLast();
    return rows.filter((x) => x.status === PLAN_STATUS.returned
      && x.author.trim().toLowerCase() === me
      && (sc == null || sc.includes(x.pkgGroup))).length;
  } catch {
    return null;
  }
}

/**
 * ЗОХИОГЧИД САЯХАН БАТЛАГДСАН, ХАРААГҮЙ ИЛГЭЭЛТ — «Хуваарь» цэсний тэмдэгт (2026-10-09).
 */
export const PLAN_APPROVED_TTL = 3 * 86_400_000;
const APPROVED_SEEN_KEY = 'selbe-huvaari-approved-seen';
function approvedSeen(): Set<number> {
  try {
    const v = JSON.parse(localStorage.getItem(APPROVED_SEEN_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []);
  } catch { return new Set(); }
}
/** Зохиогч батлагдсан илгээлтийг «Хуваарь» хуудсанд харсныг тэмдэглэнэ (сүүлийн 200 л хадгална) */
export function markPlanApprovedSeen(oid: number): void {
  try {
    const s = approvedSeen();
    if (s.has(oid)) return;
    s.add(oid);
    localStorage.setItem(APPROVED_SEEN_KEY, JSON.stringify([...s].slice(-200)));
  } catch { /* хаалттай орчин — тэмдэг 3 хоногийн дараа өөрөө алга болно */ }
}
export async function countPlanApproved(username: string | null | undefined): Promise<number | null> {
  try {
    const me = (username ?? '').trim().toLowerCase();
    if (!me) return AUTH.appId ? null : 0;
    if (AUTH.appId) {
      if (!huvaariAclReady()) return null;
    }
    if (!(await planTableState(false)).ok) return null;
    const sc = AUTH.appId ? huvaariScope(me, 'author') : null;
    if (Array.isArray(sc) && sc.length === 0) return 0;
    const rows = await loadBadgeLast();
    const seen = approvedSeen();
    const now = serverNow();
    return rows.filter((x) => x.status === PLAN_STATUS.approved
      && x.author.trim().toLowerCase() === me
      && x.approverAt != null && now - x.approverAt < PLAN_APPROVED_TTL
      && !seen.has(x.oid)
      && (sc == null || sc.includes(x.pkgGroup))).length;
  } catch {
    return null;
  }
}
