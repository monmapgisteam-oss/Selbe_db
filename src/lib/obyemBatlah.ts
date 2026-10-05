'use client';

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН БАТЛАХ УРСГАЛ — инженер засна, батлагч батална.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ БОЛОВ (2026-09-08, хэрэглэгчийн шийдвэр): AGOL-д
 * `Инженерийн_төлөвлөсөн_обьём` талбар 10/10 багцад нэмэгдсэн. Хэрэв түүнийг
 * «Гүйцэтгэл бөглөх» хуудаснаас ШУУД бичдэг болговол нэг хүн зорилтоо дур
 * мэдэн буулгаж, өөрийн гүйцэтгэлийн хувийг өсгөх зам нээгдэнэ. Тиймээс
 * инженер ЗАСНА → «Батлуулах» дарна → БАТЛАГЧ хараад батална → тэр үед л
 * үндсэн өгөгдөлд бичигдэнэ.
 *
 * ⚠️ БАТЛАГДТАЛ ЭХ ӨГӨГДӨЛ ХӨДЛӨХГҮЙ. Засварууд нь ЭНЭ хүснэгтэд хүлээнэ.
 * Батлагдаагүй саналууд дашбоард, тайлан, тооцоонд ОГТ нөлөөлөхгүй —
 * хянагч «юу байсан → юу болох» хоёрыг зэрэг харна.
 *
 * ⚠️ ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`hyanalt.ts`) ТУСДАА. Тэр нь БОДИТ гүйцэтгэлийн
 * 4 шатат урсгал (компани → инженер → менежер → захирал), энэ нь ТӨЛӨВЛӨСӨН
 * ОБЬЁМЫН 2 шатат урсгал. Хольвол «обьёмыг зөвшөөрсөн» нь «гүйцэтгэлийг
 * зөвшөөрсөн» гэж уншигдаж, хариуцлага замхарна. Мөн `hyanalt` үйлчилгээний
 * талбарууд гүйцэтгэлийн 60 баганын загварт хатуу уягдсан (2026-09-17-ноос
 * ижил оргод ч тусдаа үйлчилгээ).
 *
 * ⚠️ ХУВААРИЙН УРСГАЛААС (`huvaariBatlah.ts`) МӨН ТУСДАА. Тэр нь ОГНОО
 * («хэзээ»), энэ нь ОБЬЁМ («хэр их»). `huvaariBatlah` нь багц бүрд ЗӨВХӨН НЭГ
 * хүлээгдэж буй илгээлт зөвшөөрдөг тул хоёрыг нийлүүлбэл огноо буцаагдахад
 * обьём ч гацна — хоёр өөр шийдвэрийг нэг батламжид уяхгүй.
 *
 * ⚠️ ХАДГАЛАЛТ: ӨӨРИЙН ArcGIS хүснэгт (`Selbe_Obyem_Batlah`).
 * `Selbe_Permissions`-ийн `__cap__:` мөрийн загварыг АШИГЛААГҮЙ: тэнд `views`
 * талбар 2048 тэмдэгттэй бөгөөд нэг илгээлт нь хэдэн зуун мөрийн обьём
 * агуулж болно. Хүснэгтийг эхний хэрэгцээнд super админы токеноор ӨӨРӨӨ
 * үүсгэнэ — гар ажиллагаа шаардахгүй.
 *
 * ⚠️ FAIL-CLOSED: хүснэгт уншигдахгүй бол «батлагдсан» гэж ҮЗЭХГҮЙ.
 */

import { AUTH, ROLE_BY_USER } from './services';
import { obyemAclReady, obyemScope } from './obyemAcl';
import { capsRemoteReady, hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ `arcgisPost` (2026-09-30): урьд нь ижил утгатай дотоод `req` байв — хүснэгт
   Organization-only тул нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ (2026-09-17), токеныг
   хүсэлтийн өмнө шинэчилж 498-д нэг удаа дахин оролдоно (2026-09-29). */
import { arcgisPost } from '@/lib/authToken';
import { currentUser } from './who';
import { invalidate } from './dataBus';
import { cached } from '@/lib/live';

/** Илгээлтийн төлөв */
export const OBYEM_STATUS = {
  /** Инженер илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  /** ⚠️ 2026-10-04: зохиогч өөрөө ТАТАЖ АВСАН (`withdrawObyem`) — батлагч хүлээж гацахгүй */
  withdrawn: 'Татаж авсан',
} as const;
export type ObyemStatus = (typeof OBYEM_STATUS)[keyof typeof OBYEM_STATUS];

/**
 * НЭГ ИЛГЭЭЛТИЙН АГУУЛГА.
 *
 * ⚠️ `cells` нь `[oid, утга]` хосуудын массив: `null` = НҮДИЙГ ЦЭВЭРЛЭ.
 *    `undefined` ба `null` хоёрыг ЯЛГАНА — эхнийх нь «хөндөөгүй», хоёр дахь
 *    нь «зориуд хоослов» (`null ≠ 0` дүрмийн үргэлжлэл).
 * ⚠️ Блокоор задлаагүй: талбар нь мөрд ГАНЦ скаляр тул түлхүүр нь `oid`
 *    дангаараа (гүйцэтгэлийн `${oid}:${b}` хэлбэр ЭНД хэрэггүй).
 */
export type ObyemPayload = {
  v: 1;
  pkgKey: string;
  cells: [number, number | null][];
  /**
   * Мөрийн танигч `[oid, «№ ¦ Ажил»]` (хуудасны дарааллаар) — илгээснээс
   * хойш архивт шинэ жааз орвол батлагч oid-ийг шинэ мөр рүү ЗӨӨХ ганц зам.
   * ⚠️ Заавал биш: хуучин илгээлтэд байхгүй.
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
  /** Хэдэн нүд өөрчлөгдсөн — жагсаалтад харуулах */
  cellCount: number;
  /** Түүхий JSON — `parsePayload`-аар задарна */
  payload: string;
};

const TITLE = 'Selbe_Obyem_Batlah';
const TABLE_NAME = 'obyem_batlah';

/** Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно */
export const F = {
  oid: 'OBJECTID',
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
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ: хүснэгтийг үүсгэсэн хүн дараа нь super жагсаалтаас
 *    хасагдвал `findTableUrl` нь БАЙГАА хүснэгтээ «эзэн танигдахгүй» гэж
 *    няцааж, шинээр үүсгэхийг ч хориглоно (`ownerMismatch`). Тэр үед
 *    батлах урсгал бүхэлдээ зогсоно — 2026-09-11-нд яг ийм байдал үүсэв.
 * ⚠️ Энд нэмэх нь ЗӨВХӨН УНШИХ эрхийг нээнэ: хүснэгт өөрөө AGOL дээр
 *    хуваалцагдсан хэвээр, бичих эрх нь тэндээс хамаарна.
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([
  ...SUPER_OWNERS,
  ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase()),
]);

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;

/**
 * ⚠️ ЭЗНИЙГ ШАЛГАНА: title хайлт нь org доторх ХЭНИЙ Ч үүсгэсэн ижил нэртэй
 * item-ыг буцааж болно. Хуурамч хүснэгт үүсгэсэн хүн бүх багцын обьёмыг
 * батлах зам нээх байлаа.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await arcgisPost(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /*
     * ⚠️ 100 (2026-09-11, `permsRemote.ts:176-181`-ийн засварыг тараав):
     * хайлт нь org доторх ХЭНИЙ Ч ижил нэртэй item-ыг буцаадаг тул хэн
     * нэгэн 10+ хуурамч item үүсгэвэл ЖИНХЭНЭ хүснэгт эхний 10-т багтахаа
     * больж, `ownerMismatch` асаад бүх клиентийн урсгал УНТАРНА.
     */
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  /* ⚠️ Нийтэд нээлттэй эсэхийг ЭНД барина — `access` нь хайлтын хариунд
     хамт ирдэг тул нэмэлт хүсэлт хэрэггүй (`permsRemote`-ийн загвар). */
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
 *
 * ⚠️ `aguulga` нь 1,048,576 тэмдэгт — нэг багцын бүх мөрийн обьём багтана.
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
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
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
 * ⚠️ Зөвхөн ОЛДСОН URL-ыг кэшлэнэ: `null`-ыг кэшлэвэл порталын search-ийн
 *    түр зуурын алдаа сешн даяар тогтмолжино.
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  /* ⚠️ ЗӨВХӨН ЭЗЭН ҮҮСГЭНЭ (`permsRemote`-ийн 2026-09-15-ны дүрэм, энд 2026-09-17). */
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
    cellCount: Number(a[F.cellCount]) || 0,
    payload: String(a[F.payload] ?? ''),
  };
}

async function query(where: string, outFields: string): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  const out: Attrs[] = [];
  for (let off = 0; ; off += 1000) {
    const j = await arcgisPost(`${url}/query`, {
      where,
      outFields,
      returnGeometry: 'false',
      /* ⚠️ Хуудаслалтад `orderByFields` ЗААВАЛ — эс бөгөөс ArcGIS хуудас
         хооронд мөр давхардуулах/алгасах эрхтэй. */
      orderByFields: `${F.oid} ASC`,
      resultOffset: String(off),
      resultRecordCount: '1000',
    });
    const fs = (j.features as { attributes: Attrs }[]) ?? [];
    out.push(...fs.map((f) => f.attributes));
    if (fs.length < 1000) break;
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
 *
 * ⚠️ Зөвхөн `pending` нь баганыг ТҮГЖИНЭ. `approved`/`returned` нь түүх тул
 *    инженер дахин засаж болно.
 */
export async function loadPending(pkgKey: string): Promise<ObyemSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${OBYEM_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is ObyemSubmission => x != null);
  /* ⚠️ Хэд хэдэн pending үүссэн бол (зэрэгцээ илгээлтийн race) СҮҮЛИЙНХ ялна */
  return list.length ? list[list.length - 1] : null;
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
  const list = rows.map(toSubmission).filter((x): x is ObyemSubmission => x != null);
  return list.slice(-limit).reverse();
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<ObyemPayload | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  return parsePayload(String(rows[0][F.payload] ?? ''));
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 *
 * ⚠️ Хагас задарсан агуулга хэрэглэвэл обьём ЧИМЭЭГҮЙ устана. Тиймээс бүтэн
 *    эсэхийг шалгаж, эргэлзвэл ТАТГАЛЗАНА.
 * ⚠️ `cells`-ийн элемент бүрийг ШАЛГАНА: `oid` нь бүхэл тоо, утга нь тоо
 *    эсвэл `null`. Танигдахгүй элементийг ХАЯХГҮЙ, харин БҮТЭН агуулгыг
 *    татгалзана — хагас батлагдсан засвар нь батлагдаагүйгээс дор.
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
    /* ⚠️ `rowKeys`-ийг ХАДГАЛНА (2026-09-25 аудит): урьд нь энд хаягдаж,
       шинэ жааз руу дахин ачаалсан батлагч «мөрүүд олдсонгүй»-д гацдаг байв.
       `cells`-ээс ялгаатай нь буруу элементийг ХАЯЖ, агуулгыг татгалзахгүй —
       танигч нь зөвхөн зөөх туслах, дутвал тэр нүд алгасагдаж ил тоологдоно. */
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
 *
 * ⚠️ Эх өгөгдөлд ЮУ Ч бичихгүй. Зөвхөн энэ хүснэгтэд хүлээнэ.
 * ⚠️ Тухайн багцад хүлээгдэж буй илгээлт БАЙВАЛ татгалзана — хоёр санал
 *    зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн хоёулаа
 *    батлагдвал сүүлийнх нь өмнөхийг чимээгүй дарна.
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
  /* ⚠️ ХҮРЭЭГ lib-д ШАЛГАНА (2026-09-17): урьд нь зөвхөн UI. `null` = хязгааргүй. */
  if (AUTH.appId) {
    /* ⚠️ НЭВТЭРСЭН хэрэглэгчээр (дуудагчийн `author` БИШ) — консолоос super-ийн
       нэр дамжуулж алгасахаас (2026-09-17). Хөтөчид нэвтрээгүй бол хаана. */
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
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
    if (!editOk(j.addResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('OBYEM_BATLAH');
    /*
     * ⚠️ 2026-10-05: ДАВХАР ИЛГЭЭЛТ АРИЛГАХ (`huvaariBatlah.submitPlan`-ийн загвар). Дээрх
     *    `loadPending` шалгалт ба `adds` хоёрын завсарт хоёр инженер зэрэг дарвал хоёулаа
     *    шалгалтыг давж, нэг багцад хоёр `pending` үүсдэг байв. Бичсэний ДАРАА дахин уншиж,
     *    БАГА OBJECTID-тай (түрүүлж бичигдсэн) илгээлт байвал ӨӨРИЙНХӨӨ мөрийг устгана — хоёр
     *    тал ижил дүрмээр шийддэг тул яг нэг нь үлдэнэ. Устгал унавал `withdrawn` болгоно.
     * ⚠️ Давхардлын шалгалт өөрөө унавал (сүлжээ · 498) илгээлт ХАДГАЛАГДСАН хэвээр — `ok:true`.
     */
    const mine = Number((j.addResults as { objectId?: number }[])[0]?.objectId);
    if (Number.isFinite(mine)) try {
      const rows = await query(
        `${F.pkgKey} = '${args.pkgKey.replace(/'/g, "''")}' AND ${F.status} = N'${OBYEM_STATUS.pending}'`,
        `${F.oid},${F.author}`,
      );
      const first = rows.map((a) => Number(a[F.oid])).filter(Number.isFinite).sort((a, b) => a - b)[0];
      if (first != null && first < mine) {
        const del = await arcgisPost(`${url}/applyEdits`, { deletes: String(mine) }).catch(() => null);
        if (!editOk(del?.deleteResults)) {
          await arcgisPost(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: mine, [F.status]: OBYEM_STATUS.withdrawn, [F.approverAt]: Date.now() } }]),
          }).catch(() => null);
        }
        invalidate('OBYEM_BATLAH');
        const who = s(rows.find((a) => Number(a[F.oid]) === first)?.[F.author]);
        return { ok: false, error: tr('{0} энэ багцын обьёмыг түрүүлж илгээсэн байна — таны илгээлт цуцлагдлаа. Эхлээд шийдвэрлүүлнэ үү.', who || tr('Өөр хэрэглэгч')) };
      }
    } catch { /* давхардлыг дараагийн уншилт шийднэ */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * БАТЛАХ ТҮГЖЭЭ (claim) — ⚠️ 2026-10-05, `huvaariBatlah`-ийн `claimPlan`/`casClaim`-ийн загвар.
 *
 * ⚠️ ЯАГААД: батлах гинж нь ЭХЛЭЭД үндсэн өгөгдөлд бичээд (`applyUpdates`), ДАРАА нь төлөвийг
 *    `approved` болгодог (`decideObyem`-ийн ⚠️). Урьдчилсан шалгалт (`dryRun`) ба бичилтийн
 *    завсарт зохиогч ТАТАХ, өөр батлагч БУЦААХ боломжтой байсан — утга нь үндсэн өгөгдөлд
 *    орсон атлаа «батлагдсан» бичлэг үүсэхгүй, «дахин батлах» хэзээ ч амжилтгүй.
 * ⚠️ ХЭЛБЭР: ШИНЭ ТӨЛӨВ НЭМЭЭГҮЙ — `pending` хэвээр, `approver` = түгжигч, `approverAt` =
 *    түгжсэн агшин. `pending` мөрийн `approver`-ийг өөр хаана ч уншдаггүй.
 * ⚠️ ХУГАЦААТАЙ (`CLAIM_TTL`): хөтөч батлах явцад хаагдвал түгжээ мөнхөд үлдэхгүй.
 * ⚠️ ArcGIS-д нөхцөлт update БАЙХГҮЙ — бичсэний дараа дахин уншиж өөрийнх эсэхийг шалгана.
 *    Зэрэг хоёр түгжилтийн завсар маш богино болно, тэг биш.
 */
const CLAIM_TTL = 10 * 60_000;
const CLAIM_FIELDS = `${F.oid},${F.status},${F.approver},${F.approverAt}`;
/** `pending` мөрийг хугацаа нь дуусаагүй түгжээтэй байлгаж буй хүн (жижиг үсгээр), эсвэл `null` */
function claimHolder(a: Attrs, now = Date.now()): string | null {
  if (s(a[F.status]) !== OBYEM_STATUS.pending) return null;
  const who = s(a[F.approver])?.toLowerCase() ?? null;
  const at = Number(a[F.approverAt]);
  if (!who || !Number.isFinite(at) || at <= 0) return null;
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
  const now = io.now ?? Date.now;
  const row = await io.read();
  if (!row) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  const st = s(row[F.status]);
  if (st !== OBYEM_STATUS.pending) return decidedMsg(s(row[F.approver]), st);
  const h = claimHolder(row, now());
  if (h && h !== me) return heldMsg(h);
  const at = now();
  if (!(await io.write(at))) return tr('ArcGIS-т хадгалагдсангүй.');
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
 * БАТЛАХААР ТҮГЖИХ — үндсэн өгөгдөлд бичихээс ӨМНӨ (`useObyem.decideObyemHere`), ⚠️ 2026-10-05.
 * ⚠️ Дүрмүүд (өөрийгөө биш · хүрээ · `pending`)-ийг дуудагч ЯГ ӨМНӨ нь `decideObyem({ dryRun })`-аар
 *    шалгасан байх ёстой — энд зөвхөн түгжээ. Амжилттай бол `withdrawObyem` ба өөр батлагчийн
 *    `decideObyem` татгалзана.
 */
export async function claimObyem(args: { oid: number; approver: string }): Promise<{ ok: boolean; error?: string }> {
  const me = args.approver.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const err = await casObyemClaim({
      read: async () => (await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS))[0] ?? null,
      write: async (at) => {
        const j = await arcgisPost(`${url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.approver]: me, [F.approverAt]: at } }]),
          rollbackOnFailure: 'true',
        });
        return editOk(j.updateResults);
      },
    }, me);
    /* ⚠️ Түгжээ бичигдсэн бол кэш хуучирна (`dataBus.invariant`) */
    if (!err) invalidate('OBYEM_BATLAH');
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ҮНДСЭН ӨГӨГДӨЛД БИЧИХИЙН ЯГ ӨМНӨХ ХАМГААЛАЛТ (⚠️ 2026-10-05, `huvaariBatlah.approveGuard`-ийн
 * загвар): төлвийг ДАХИН уншина — `pending` хэвээр, түгжээ ӨӨРИЙНХ (хугацаа нь дуусаагүй) байх ёстой.
 * ⚠️ Уншилт унавал ШИДНЭ (throw) — дуудагч бичихгүй (fail-closed).
 * @returns `null` = бичиж болно; мөр = яагаад зогссон (үндсэн өгөгдөлд юу ч бичигдээгүй)
 */
export async function obyemApproveGuard(args: { oid: number; approver: string }): Promise<string | null> {
  const me = args.approver.trim().toLowerCase();
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, CLAIM_FIELDS);
  if (!cur.length) return tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.');
  const st = s(cur[0][F.status]);
  if (st === OBYEM_STATUS.withdrawn) return tr('Зохиогч илгээлтээ татсан байна — эх хуудсанд юу ч бичигдсэнгүй. Хуудсаа шинэчилнэ үү.');
  if (st !== OBYEM_STATUS.pending) return decidedMsg(s(cur[0][F.approver]), st);
  const h = claimHolder(cur[0]);
  if (h === me) return null;
  if (h) return heldMsg(h);
  return tr('Таны батлах түгжээний хугацаа дууссан — эх хуудсанд юу ч бичигдсэнгүй. «Батлах»-ыг дахин дарна уу.');
}

/**
 * ТҮГЖЭЭГ ТАЙЛАХ — бичилт эхлээгүй/унасан үед (⚠️ 2026-10-05). Зөвхөн ӨӨРИЙН, `pending` хэвээр
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
 * ШИЙДВЭР — батлах эсвэл буцаах.
 *
 * ⚠️ ҮНДСЭН ӨГӨГДӨЛД БИЧИХ нь ЭНД БИШ, дуудагч талд (`FillNew`) — учир нь тэр
 *    ажил нь схем, мөрийн зураглал, агшин солигдох зэрэг эх хуудасны бүх
 *    нарийн ширийнийг мэддэг `applyUpdates`-ыг шаарддаг. Энэ модуль зөвхөн
 *    урсгалын ТӨЛӨВИЙГ хөтөлнө.
 *
 * ⚠️ Дараалал: үндсэн өгөгдөлд АМЖИЛТТАЙ бичигдсэний ДАРАА л энэ мөрийг
 *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан» гэж
 *    харагдах атлаа обьём хуучин хэвээр үлдэнэ.
 */
export async function decideObyem(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   *
   * ⚠️ 2026-09-15-ны аудит: дүрмийн ЖИНХЭНЭ эх нь ЭНЭ БИШ, СЕРВЕРИЙН мөрийн
   *    `F.author` (доор `cur`-аас уншина). Дуудагчийн өгсөн утгад найдвал
   *    консолоос `author: ''` дамжуулаад хамгаалалтыг бүрэн алгасаж болно.
   */
  author?: string;
  reason?: string;
  /**
   * ⚠️ 2026-09-30: ЗӨВХӨН ШАЛГАНА, БИЧИХГҮЙ. Дуудагч (`useObyem.decideObyemHere`)
   *    үндсэн өгөгдөлд (`applyUpdates`) бичихээс ӨМНӨ дуудна: урьд нь бүх дүрэм
   *    (өөрийгөө батлах · хүрээ · аль хэдийн шийдвэрлэсэн) ЗӨВХӨН энд, бичилтийн
   *    ДАРАА ажилладаг тул зохиогч өөрийн засвараа (эсвэл хуучирсан дэлгэцээс
   *    буцаагдсан утгыг) `Инженерийн_төлөвлөсөн_обьём`-д бичээд дараа нь л
   *    «өөрөө батлах боломжгүй» гэж татгалзагддаг байв (05 §6 зөрчил). «Бичээд
   *    дараа нь тэмдэглэх» дараалал (дээрх ⚠️) хэвээр — энэ нь нэмэлт урьдчилсан шалгалт.
   */
  dryRun?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  /*
   * ⚠️ ДҮРМҮҮДИЙГ СҮЛЖЭЭНЭЭС ӨМНӨ шалгана. `tableUrl`-ийн ДАРАА байрлуулбал
   *    ArcGIS уншигдахгүй орчинд «хүснэгт олдсонгүй» гэсэн буруу шалтгаан
   *    буцааж, дүрэм нь чимээгүй алга болно.
   *
   * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ. Энэ шалгуур UI-д БИШ, ЭНД байх ёстой:
   *    товч нуух нь харагдацын асуудал, харин дүрэм нь өгөгдлийнх. Хоёр эрх
   *    (`obyemEdit` + `obyemApprove`) нэг хүнд олгогдвол товч нь идэвхтэй
   *    болох тул ганц хамгаалалт нь энэ.
   *
   * ⚠️ ХОЁР ДАВХАР ШАЛГУУР (2026-09-15-ны аудит):
   *      (1) ЭНД — дуудагчийн өгсөн `author`-оор, СҮЛЖЭЭНЭЭС ӨМНӨ. ArcGIS
   *          уншигдахгүй орчинд дүрэм чимээгүй алга болохоос сэргийлнэ.
   *      (2) `cur`-ийн ДАРАА — СЕРВЕРИЙН мөрийн `F.author`-оор, учир нь (1)
   *          нь дуудагчийн утгад найддаг тул хуурамчлах боломжтой.
   */
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  /*
   * ⚠️ ШИЙДВЭР ГАРСАН ЭСЭХИЙГ ДАХИН ШАЛГАНА. Хоёр батлагч хуудсаа зэрэг
   *    нээгээд нэг нь баталчихвал нөгөөгийн дэлгэц ХУУЧИН хэвээр үлдэнэ.
   *    Түүнийг дарахад шийдвэр гаргасан хүний нэр чимээгүй дарагдана. Мөр нь
   *    ганц тул `applyEdits` алдаа өгөхгүй — ЗӨВХӨН энэ шалгуур л барина.
   */
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.approverAt},${F.author},${F.pkgGroup}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  /* ⚠️ БАТЛАГЧИЙН ХҮРЭЭГ СЕРВЕРИЙН БАГЦААР (2026-09-17): урьд нь зөвхөн UI. */
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = obyemScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын обьёмыг батлах эрхгүй.') };
  }
  /*
   * ⚠️ ХОЁР ДАХЬ ШАЛГУУР — ЗОХИОГЧ СЕРВЕРЭЭС (2026-09-15-ны аудит),
   *    `huvaariBatlah`-тай ижил дүрэм. Дээрх эрт шалгуур нь дуудагчийн утгад
   *    найддаг тул хоосон утга дамжуулаад алгасах боломжтой байв.
   */
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
  /* ⚠️ 2026-10-05: ӨӨР батлагч түгжсэн (үндсэн өгөгдөлд бичиж буй — `claimObyem`) бол шийдвэр
     гаргахгүй: хоёр дахь батлагчийн буцаалт/батлалт эхнийхийн бичилтийн дундуур орж, утга нь
     бичигдсэн атлаа «буцаагдсан» болдог байв. Хугацаа нь дууссан түгжээ саад болохгүй. */
  const holder = claimHolder(cur[0]);
  if (holder && holder !== me) return { ok: false, error: heldMsg(holder) };
  /* ⚠️ 2026-09-30: урьдчилсан шалгалт — бүх дүрэм давсан, юу ч бичихгүй (`dryRun`-ийн ⚠️) */
  if (args.dryRun) return { ok: true };
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? OBYEM_STATUS.approved : OBYEM_STATUS.returned,
    [F.approver]: args.approver.toLowerCase(),
    [F.approverAt]: Date.now(),
    [F.reason]: args.approve ? null : (args.reason?.trim() ?? null),
  };
  try {
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('OBYEM_BATLAH');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ТАТАН АВАХ ДҮРЭМ — цэвэр (`obyemBatlah.check.mjs`, 2026-10-04).
 * ⚠️ ЗӨВХӨН зохиогч (серверийн `F.author`), ЗӨВХӨН `pending`. Багцад нэг л хүлээгдэж буй
 *    илгээлт зөвшөөрөгддөг тул батлагч ирэхгүй бол инженер шинэ засвар ч илгээж чадахгүй
 *    гацдаг байв.
 * @returns `null` = зөвшөөрнө, эс бөгөөс хэрэглэгчид харуулах шалтгаан
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
 * ⚠️ Үндсэн өгөгдөлд ЮУ Ч бичихгүй (илгээлт нь угаас бичээгүй). Төлөв `withdrawn`;
 *    мөр устгахгүй — түүх үлдэнэ. Дүрэм нь СЕРВЕРИЙН мөрөөр (`withdrawDeny`).
 */
export async function withdrawObyem(args: { oid: number; me: string }): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ НЭВТЭРСЭН хэрэглэгчээр — дуудагчийн `me`-д итгэхгүй (`submitObyem`-ийн адил) */
  const meNow = AUTH.appId && typeof window !== 'undefined' ? currentUser() : null;
  if (AUTH.appId && typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const me = (meNow ?? args.me).trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  try {
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver},${F.approverAt}`);
    if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
    const deny = withdrawDeny({ status: s(cur[0][F.status]), author: s(cur[0][F.author]) }, me);
    if (deny) return { ok: false, error: deny };
    /* ⚠️ 2026-10-05: батлагч түгжсэн (үндсэн өгөгдөлд бичиж буй — `claimObyem`) үед татахгүй — эс
       бөгөөс утга нь бичигдсэн атлаа илгээлт «татаж авсан» болж, батлагдсан бичлэг үүсэхгүй. */
    const holder = claimHolder(cur[0]);
    if (holder && holder !== me) return { ok: false, error: tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', holder) };
    const j = await arcgisPost(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.status]: OBYEM_STATUS.withdrawn, [F.approver]: null, [F.approverAt]: Date.now() } }]),
      rollbackOnFailure: 'true',
    });
    if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    invalidate('OBYEM_BATLAH');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ШИЙДВЭРЛЭХ БОЛОМЖТОЙ ОБЬЁМЫН ИЛГЭЭЛТИЙН ТОО — цэсний тэмдэгт (2026-09-30).
 *
 * `decideObyem`-ийн дүрэм: `pending` · батлагчийн хүрээнд (`obyemScope(…,
 * 'approver')`, super/нэвтрэлтгүй бол хязгааргүй) · ӨӨРИЙН илгээлт БИШ.
 *
 * ⚠️ 2026-09-30: `null` ≠ 0 — `null` нь «мэдэхгүй» (нэвтрээгүй, эрх/хуваарилалт
 *    уншигдаагүй, хүснэгт алга, сүлжээ унасан). ⚠️ Хүснэгт ҮҮСГЭХГҮЙ.
 */
/**
 * ⚠️ 2026-09-30: ТЭМДГИЙН ТООЛУУРЫН ӨГӨГДӨЛ — автобусад `OBYEM_BATLAH` тагтай богино
 *    кэш (`huvaariBatlah.loadBadgePending`-тэй ижил шалтгаан). Бичих зам бүр
 *    `invalidate('OBYEM_BATLAH')` дууддаг; `loadAllPending` өөрөө кэшлэгдэхгүй.
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
