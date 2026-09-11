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
 * зөвшөөрсөн» гэж уншигдаж, хариуцлага замхарна. Мөн `hyanalt` үйлчилгээ нь
 * ӨӨР байгууллагад (ACqsMOmNLi5wIdIh) бөгөөд түүний талбарууд гүйцэтгэлийн 60
 * баганын загварт хатуу уягдсан.
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
import { t as tr } from '@/lib/i18nCore';

/** Илгээлтийн төлөв */
export const OBYEM_STATUS = {
  /** Инженер илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
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

/**
 * ArcGIS REST дуудлага.
 * ⚠️ ArcGIS алдаагаа HTTP 200 + `{error:{…}}` биеэр буцаадаг — шалгахгүй бол
 * хагас дутуу хүснэгт үүсгээд URL-ыг нь кэшилнэ.
 */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  const r = await fetch(url, { method: 'POST', body });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
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
  const search = await req(`${restBase()}/search`, {
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
  const created = await req(
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
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  await req(
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
  if (!url && canCreate && !ownerMismatch) url = await createTable(auth.token, auth.user);
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
    const j = await req(`${url}/query`, {
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
    return { v: 1, pkgKey: String(j.pkgKey ?? ''), cells };
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
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.addResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
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
  /** Илгээсэн хүн — өөрийгөө батлахаас хамгаалахад */
  author: string;
  reason?: string;
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
   */
  const me = args.approver.trim().toLowerCase();
  if (me && me === args.author.trim().toLowerCase()) {
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
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
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
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? OBYEM_STATUS.approved : OBYEM_STATUS.returned,
    [F.approver]: args.approver.toLowerCase(),
    [F.approverAt]: Date.now(),
    [F.reason]: args.approve ? null : (args.reason?.trim() ?? null),
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
