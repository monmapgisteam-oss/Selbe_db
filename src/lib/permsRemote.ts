'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 *
 * Эрхийн override-ыг байгууллагын ArcGIS дээрх нэг hosted хүснэгтэд хадгална.
 * Ингэснээр super admin ямар ч төхөөрөмжөөс өөрчилсөн эрх бүх хэрэглэгчид
 * (өөр газраас нэвтэрсэн ч) үйлчилнэ — `localStorage` шиг нэг browser-т хязгаарлагдахгүй.
 *
 * ⚠️ Хүснэгт нь super admin ЭХ АНХ нэвтрэхэд автоматаар үүснэ (publish эрхтэй бол).
 * Уншилт нь бүх нэвтэрсэн хэрэглэгчид (org-shared) нээлттэй, бичих нь editor эрхээр.
 * ArcGIS байхгүй/алдаа гарвал дуудагч тал `localStorage`-руу ухарна.
 *
 * ⚠️ УРСГАЛЫН ТОМИЛГОО (2026-08-27): «хэн аль шатанд, аль багцад» гэсэн
 * гүйцэтгэлийн урсгалын томилгоог мөн ЭНЭ хүснэгтэд хадгална — `username`
 * талбарт `__flow__:` угтвартай нөөц мөрөөр. Урьд нь тэр нь зөвхөн админы
 * browser-ийн localStorage-д байсан тул томилогдсон хүний ӨӨРИЙНХ нь
 * төхөөрөмж дээр томилгоо огт харагдахгүй — багцын хязгаарлалт хаана ч
 * биелдэггүй, Ерөнхий менежерийн эрх (мөр нэмэх г.м.) хэзээ ч асдаггүй байв.
 * Угтвартай мөрүүд эрхийн уншилтад ОГТ ОРОХГҮЙ (`fetchAll` ялгаж буцаана).
 *
 * ⚠️ ХЯЗГААР (баримтжуулсан): бичих эрх нь ArcGIS item-sharing дээр л
 * тулгуурладаг. Хүснэгтийг олон super admin засах ёстой тул мөрийн эзэмшлийн
 * хязгаарлалт (ownership-based access control) тавьж болохгүй — тиймээс org
 * доторх, бичих эрх бүхий хэн боловч REST-ээр шууд засаж чадна. Клиент талын
 * системд үүнээс чанга хамгаалалт байхгүй; нэвтрэлтийн түвшний эрсдэлийг
 * `permissions.hasAccess` (хатуу жагсаалт + remote баталгаажилт) барина.
 */

import { AUTH, ROLE_BY_USER, type Role, type ViewKey } from './services';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from './scopedAcl';

export type RemoteRow = {
  username: string;
  role: Role | null;
  views: ViewKey[] | 'all';
  docs: boolean;
  /**
   * Устгагдсан аккаунтын тэмдэглэгээ — `views` талбарт `removed` гэсэн
   * (JSON биш) шууд утгаар хадгална: хуучин хувилбарын parser JSON.parse-д
   * унаад fail-closed `views: []` болгодог тул хуучин клиент дээр ч эрсдэлгүй.
   */
  removed?: boolean;
};

/**
 * Урсгалын нэг томилгоо — permsRemote нь `Stage` төрлөөс санаатай ХАРААТ БУС
 * (энд зөвхөн тээвэрлэнэ, утгыг нь `guitsetgelAcl` шалгана).
 */
export type FlowRow = {
  user: string; stage: string; bagts: string[];
  /** ХАРНА, ШИЙДВЭРЛЭХГҮЙ — хуучин мөрд `undefined` = жирийн томилгоо */
  viewOnly?: boolean;
};

/**
 * НЭМЭЛТ ЭРХИЙН нэг мөр — `__cap__:` угтвартай.
 *
 * ⚠️ `caps` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 * тээвэрлэнэ (`caps.ts` танигдахгүйг нь хаяна). Ингэснээр шинэ эрх нэмэхэд
 * хадгалалтын давхарга хөндөгдөхгүй.
 */
export type CapRow = { user: string; caps: string[] };

/**
 * ЧАНАРЫН (QAQC) багцын хуваарилалтын нэг мөр — `__qaqc__:` угтвартай.
 *
 * ⚠️ Урсгалын `FlowRow`-оос ТУСДАА: тэнд `stage` байдаг, энд БАЙХГҮЙ. Чанарын
 * хяналт нь дөрвөн шатны аль нь ч биш тул шат зүүвэл тэр хүн гүйцэтгэлийг
 * зөвшөөрөх эрхтэй болно (`qaqcAcl.ts`-ийн толгойн тайлбарыг үз).
 */
export type QaqcRow = { user: string; bagts: string[] };

/**
 * ХУВААРИЙН хуваарилалтын нэг мөр — `__huvaari__:` угтвартай.
 *
 * ⚠️ `QaqcRow`-оос ЯЛГААТАЙ нь `roles` талбартай: хуваарь нь ХОЁР үүрэгтэй
 * (зохиогч · батлагч) тул нэг мөрөнд аль нь болохыг хадгална.
 */
export type HuvaariRow = { user: string; roles: string[]; bagts: string[] };

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН хуваарилалтын нэг мөр — `__obyem__:` угтвартай.
 *
 * ⚠️ `HuvaariRow`-той ижил бүтэц, ӨӨР асуулт: тэр нь ОГНОО төлөвлөх эрх,
 * энэ нь ОБЬЁМ. Хоёр үүрэг: `editor` (засварлагч) · `approver` (батлагч).
 */
export type ObyemRow = { user: string; roles: string[]; bagts: string[] };

const TITLE = 'Selbe_Permissions';
const TABLE_NAME = 'permissions';
/** Урсгалын томилгооны мөрийн `username` угтвар — эрхийн мөрөөс ялгана */
const FLOW_PREFIX = '__flow__:';
/** Нэмэлт эрхийн мөрийн `username` угтвар — эрх ба урсгалын мөрөөс ялгана */
const CAP_PREFIX = '__cap__:';
/** Чанарын (QAQC) багцын хуваарилалтын мөрийн угтвар — урсгалынхаас ялгана */
const QAQC_PREFIX = '__qaqc__:';
/** Хуваарийн хуваарилалтын мөрийн угтвар — чанарынхаас ялгана */
const HUVAARI_PREFIX = '__huvaari__:';
/** Инженерийн төлөвлөсөн обьёмын хуваарилалтын угтвар — хуваариныхаас ялгана */
const OBYEM_PREFIX = '__obyem__:';

let tableUrlCache: string | undefined; // ⚠️ зөвхөн ОЛДСОН URL — null/олдоогүйг кэшлэхгүй (tableUrl-ыг үз)

/** IdentityManager-аас идэвхтэй token авах (нэвтрээгүй бол null) */
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
 * ⚠️ ArcGIS нь алдаагаа HTTP 200 + `{error:{...}}` биеэр буцаадаг — шалгахгүй
 * бол `createTable` хагас дутуу (талбаргүй, share хийгдээгүй) «хордсон»
 * хүснэгт үүсгээд URL-ыг нь кэшилдэг байв. Одоо алдаанд ШИДНЭ — дуудагч
 * тал catch-ээрээ null/false руу ухардаг.
 */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  const r = await fetch(url, { method: 'POST', body });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн ЖИНХЭНЭ эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u),
);
/**
 * ⚠️ ХУУЧИН ЭЗЭД (2026-08-29): super-ийг `ROLE_BY_USER`-аас хасахад түүний
 * үүсгэсэн хүснэгт хэнд ч «танигдахгүй» болж, бүх клиент эрх/томилгоо/
 * tombstone-оо алддаг байв. Super-ийг хасахдаа (а) ArcGIS дээр item-ыг одоогийн
 * super-т reassign хийнэ, ЭСВЭЛ (б) нэрийг нь энд үлдээнэ — super эрх БУЦАХГҮЙ,
 * зөвхөн хүснэгт олдох л зорилготой.
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([...SUPER_OWNERS, ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase())]);
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт олдсон — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;
/**
 * ⚠️ ЭРХИЙН ХҮСНЭГТ НИЙТЭД (`access: public`) НЭЭЛТТЭЙ БАЙНА УУ (2026-09-08-ны
 * амьд шалгалт). `createTable` нь ЗӨВХӨН байгууллагад (`org:'true',
 * everyone:'false'`) хуваалцдаг боловч AGOL дээр гараар нийтийн болгосон байв.
 * Тэр үед НЭВТРЭЭГҮЙ хэн ч (`applyEdits` нь токенгүй амжилттай) БҮХ таван
 * ACL-ийн мөрийг нэмж, засаж, устгаж чадна — үүрэг, эрх, урсгал, чанар,
 * хуваарь, обьём бүгд энэ нэг хүснэгтэд. Кодоор засах боломжгүй (серверийн
 * тохиргоо) тул ИЛРҮҮЛЖ, админ панелд улаанаар мэдэгдэнэ.
 */
let tablePublic = false;
/** Эрхийн хүснэгт нийтэд нээлттэй эсэх — UserAdmin-ы анхааруулга */
export const permsTablePublic = (): boolean => tablePublic;

/**
 * Хүснэгтийн URL олох — байгаа item-ээс.
 *
 * ⚠️ ЭЗНИЙГ ШАЛГАНА: title хайлт нь org доторх ХЭНИЙ Ч үүсгэсэн ижил нэртэй
 * item-ыг буцааж болно — халдагч `Selbe_Permissions` нэртэй хуурамч хүснэгт
 * үүсгэвэл бүх клиент эрхээ түүнээс уншина. Зөвхөн хатуу тохиргооны super
 * админы эзэмшдэг хүснэгтийг л хүлээн авна.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /*
     * ⚠️ 100 (2026-09-08): урьд нь '10' байв. Хайлт нь org доторх ХЭНИЙ Ч ижил
     * нэртэй item-ыг буцаадаг тул хэн нэгэн 10+ хуурамч `Selbe_Permissions`
     * үүсгэвэл ЖИНХЭНЭ хүснэгт эхний 10-т багтахаа больж, `ownerMismatch`
     * асаад бүх клиентийн remote эрх УНТАРНА (үйлчилгээ таслах халдлага).
     * Эзний шүүлтүүр нь хэвээр — энэ нь зөвхөн хайлтын цонхыг өргөсгөнө.
     */
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  /* ⚠️ Нийтэд нээлттэй эсэхийг ЭНД барина — item-ийн `access` талбар хайлтын
     хариунд хамт ирдэг, нэмэлт хүсэлт хэрэггүй (`tablePublic`-ийн тайлбар). */
  tablePublic = String(hit?.access ?? '') === 'public';
  if (tablePublic) {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч эрхийн мөр засаж чадна.`,
      'AGOL дээр item-ийн Share-ийг «Organization» болгоно уу.',
    );
  }
  // ⚠️ Ижил нэртэй хүснэгт байгаа ч эзэн нь танигдахгүй → ШИНЭЭР ҮҮСГЭХГҮЙ
  //    (нэр давхцаж унана, эсвэл салаа хүснэгт үүсэж өгөгдөл хуваагдана).
  //    Админ item-ыг reassign хийх хүртэл remote унтраалттай — шалтгааныг ил хэлнэ.
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(
      '[selbe] Selbe_Permissions хүснэгтийн эзэн танигдсангүй:',
      same.map((x) => x.owner).join(', '),
      '— одоогийн super-т reassign хийнэ үү (permsRemote.FORMER_TABLE_OWNERS)',
    );
  }
  return hit?.url ? `${hit.url}/0` : null;
}

/** Хүснэгт үүсгэх (publish эрхтэй super admin) — service + table definition */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын хэрэглэгчийн эрх'),
    hasStaticData: false,
    maxRecordCount: 10000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await req(`${restBase()}/content/users/${encodeURIComponent(user)}/createService`, {
    token,
    createParameters: JSON.stringify(createParameters),
    outputType: 'featureService',
  });
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
        { name: 'username', type: 'esriFieldTypeString', length: 256, nullable: false, editable: true },
        { name: 'role', type: 'esriFieldTypeString', length: 32, nullable: true, editable: true },
        { name: 'views', type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: 'docs', type: 'esriFieldTypeSmallInteger', nullable: true, editable: true },
      ],
    }],
  };
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  // Байгууллага даяар УНШИХ эрх нээх
  await req(`${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`, {
    token, org: 'true', everyone: 'false',
  });
  return `${serviceUrl}/0`;
}

/** Хүснэгтийн URL-ыг тодорхойлох — олох, эс бөгөөс (super) үүсгэх */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  // ⚠️ Зөвхөн ОЛДСОН URL-ыг кэшлэнэ — null-ыг кэшлэвэл порталын search транзит
  //    алдаа/индексжилтийн хоцрогдолтой үед «олдсонгүй» сешн даяар тогтмолжиж,
  //    remote эрх огт уншигдахгүй байв; одоо дараагийн дуудлагад дахин хайна.
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  if (!url && canCreate && !ownerMismatch) url = await createTable(auth.token, auth.user);
  if (url) tableUrlCache = url;
  return url;
}

type FeatureLayerMod = typeof import('@arcgis/core/layers/FeatureLayer').default;
type FeatureLayerInst = InstanceType<FeatureLayerMod>;
async function layer(url: string): Promise<FeatureLayerInst> {
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

type RawAttrs = { OBJECTID?: number; username?: string; role?: string; views?: string; docs?: number };

/**
 * БҮХ мөрийг хуудаслаж татна.
 * ⚠️ `maxRecordCount`-аас хэтэрсэн мөрийг чимээгүй хаявал сүүлд нэмэгдсэн
 * хэрэглэгчид «эрхгүй» болно — хуудаслалт ЗААВАЛ.
 */
async function queryAllRows(fl: FeatureLayerInst, where: string): Promise<RawAttrs[]> {
  const out: RawAttrs[] = [];
  for (let offset = 0; ; ) {
    const res = await fl.queryFeatures({
      where, outFields: ['*'], returnGeometry: false,
      orderByFields: ['OBJECTID ASC'], start: offset, num: 2000,
    });
    out.push(...res.features.map((f) => f.attributes as RawAttrs));
    if (!res.exceededTransferLimit || res.features.length === 0) break;
    offset += res.features.length;
  }
  return out;
}

/**
 * Бүх мөрийг татаж, ЭРХ ба УРСГАЛЫН томилгоо болгон ялгана.
 *
 * ⚠️ Нэг л асуулгаар хоёуланг нь авна — `initRemote` 5 минут тутам дуудагддаг
 * тул давхар round-trip дэмий.
 */
export async function fetchAll(
  canCreate = false,
): Promise<{
  perms: Record<string, RemoteRow>; flow: FlowRow[]; caps: CapRow[]; qaqc: QaqcRow[];
  huvaari: HuvaariRow[]; obyem: ObyemRow[];
} | null> {
  try {
    const url = await tableUrl(canCreate);
    if (!url) return null;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, '1=1');
    const perms: Record<string, RemoteRow> = {};
    /*
     * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ ТОМИЛГОО (2026-08-29): зэрэгцээ бичилтийн race-аас
     * давхар `__flow__:` мөр үүсвэл уншилт нь ЭХНИЙХ, бичилт нь СҮҮЛИЙНХ (их OID)
     * мөрийг авч зөрдөг байв — багцын хязгаар чимээгүй арилах, эсвэл нэг аккаунт
     * хоёр шатанд. Мөрүүд OBJECTID ASC ирдэг тул Map-д сүүлийнх нь ялна — эрхийн
     * мөртэй ижил дүрэм (`upsertByKey`).
     */
    const flowBy = new Map<string, FlowRow>();
    /*
     * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР (2026-09-08). Урьд нь массив байсан тул
     * зэрэгцээ бичилтийн race-аас үүссэн давхар `__cap__:` мөр ХОЁУЛАА
     * жагсаалтад ордог байв. `_syncRemoteCaps` нь эхнээс нь давтдаг учир
     * СҮҮЛИЙНХ нь ялах ёстой атлаа `upsertByKey` их OID-д бичдэг тул хассан
     * эрх (хуучин, бага OID мөрд үлдсэн) дараалал зөрөхөд СЭРГЭДЭГ байлаа.
     * Map нь flow/qaqc/huvaari/obyem-тэй ижил дүрмийг барина: их OID ялна
     * (мөрүүд OBJECTID ASC ирдэг).
     */
    const capsBy = new Map<string, CapRow>();
    /* ⚠️ QAQC мөр ч мөн НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР — flow-той ижил дүрэм */
    const qaqcBy = new Map<string, QaqcRow>();
    /* ⚠️ Хуваарийн мөр ч мөн НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР */
    const huvaariBy = new Map<string, HuvaariRow>();
    const obyemBy = new Map<string, ObyemRow>();
    for (const a of rows) {
      if (!a.username) continue;

      /* ── Инженерийн төлөвлөсөн обьёмын хуваарилалтын мөр ── */
      if (a.username.startsWith(OBYEM_PREFIX)) {
        const user = a.username.slice(OBYEM_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as { roles?: string[]; bagts?: string[] };
          if (user) {
            obyemBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Хуваарийн хуваарилалтын мөр ── */
      if (a.username.startsWith(HUVAARI_PREFIX)) {
        const user = a.username.slice(HUVAARI_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as { roles?: string[]; bagts?: string[] };
          if (user) {
            huvaariBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Чанарын (QAQC) багцын хуваарилалтын мөр ── */
      if (a.username.startsWith(QAQC_PREFIX)) {
        const user = a.username.slice(QAQC_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as { bagts?: string[] };
          if (user) {
            qaqcBy.set(user, { user, bagts: Array.isArray(d.bagts) ? d.bagts : [] });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Нэмэлт эрхийн мөр ── */
      if (a.username.startsWith(CAP_PREFIX)) {
        const user = a.username.slice(CAP_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '[]') as unknown;
          if (user && Array.isArray(d)) capsBy.set(user, { user, caps: d as string[] });
        } catch { /* эвдэрсэн мөр — алгасна (эрхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Урсгалын томилгооны мөр ── */
      if (a.username.startsWith(FLOW_PREFIX)) {
        const user = a.username.slice(FLOW_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as {
            stage?: string; bagts?: string[]; viewOnly?: boolean;
          };
          if (user && d.stage) {
            flowBy.set(user, {
              user,
              stage: d.stage,
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              /* ⚠️ ЗӨВХӨН ЯГ `true` — эргэлзээтэй утга эрх ХАСАХГҮЙ (2026-09-09) */
              ...(d.viewOnly === true ? { viewOnly: true as const } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (томилгоо байхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Эрхийн мөр ── */
      // Устгагдсан аккаунт — `views` талбарт `removed` шууд утга (JSON биш)
      const removed = a.views === 'removed';
      // ⚠️ FAIL-CLOSED: views талбар хоосон/эвдэрсэн (JSON алдаа, урт таслагдсан)
      //    бол «бүх эрх» БИШ, «эрхгүй» ([]) руу унана — аюулгүй байдлын анхдагч.
      let views: ViewKey[] | 'all' = [];
      if (!removed) {
        try {
          const v = a.views ? JSON.parse(a.views) : [];
          views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
        } catch { views = []; }
      }
      perms[a.username.toLowerCase()] = {
        username: a.username,
        role: (a.role as Role) || null,
        views,
        // ⚠️ FAIL-CLOSED: зөвхөн ТОДОРХОЙ 1 (эсвэл true) бол эрх нээнэ; null/хоосон → үгүй
        docs: a.docs === 1 || (a.docs as unknown) === true,
        ...(removed ? { removed: true } : {}),
      };
    }
    return {
      perms,
      flow: [...flowBy.values()],
      caps: [...capsBy.values()],
      qaqc: [...qaqcBy.values()],
      huvaari: [...huvaariBy.values()],
      obyem: [...obyemBy.values()],
    };
  } catch {
    return null;
  }
}

/**
 * `username`-ээр таарах БҮХ мөрийн OBJECTID (өсөх эрэмбээр).
 * ⚠️ Давхар мөр нь зэрэгцээ бичилтийн race-аас үүсдэг бөгөөд `fetchAll`-д
 * СҮҮЛИЙН (их OID) мөр ялдаг тул засварыг ч мөн их OID-д хийж, бусдыг нь
 * устгана — эс бөгөөс «хадгалсан ч үйлчлэхгүй» чимээгүй алдаа гардаг байв.
 */
async function findOids(fl: FeatureLayerInst, username: string): Promise<number[]> {
  /*
   * ⚠️ ХУУДАСЛАЛТ (2026-09-08): урьд нь ганц дуудлага байсан тул үйлчилгээний
   * `maxRecordCount` (ихэвчлэн 1000, зарим дээр 2000)-аас дээш давхар мөр
   * үүссэн тохиолдолд илүүдэл нь ОГТ буцаагддаггүй байв. Тэр нь `upsertByKey`-д
   * «цэвэрлэх давхардал алга» гэж харагдаж, цэвэрлэгдээгүй хуучин мөр дараагийн
   * уншилтад эргэн гарч ирнэ. `orderByFields`-гүй offset нь мөр алгасдаг тул
   * эрэмбийг ЗААВАЛ хадгална (CLAUDE.md-ийн ArcGIS занга).
   */
  const where = `LOWER(username) = '${username.toLowerCase().replace(/'/g, "''")}'`;
  const out: number[] = [];
  for (let offset = 0; ; ) {
    const found = await fl.queryFeatures({
      where, outFields: ['OBJECTID'], returnGeometry: false,
      orderByFields: ['OBJECTID ASC'], start: offset, num: 2000,
    });
    out.push(...found.features
      .map((x) => x.attributes?.OBJECTID as number)
      .filter((x) => typeof x === 'number'));
    if (!found.exceededTransferLimit || found.features.length === 0) break;
    offset += found.features.length;
  }
  return out;
}

const editOk = (r: { error?: unknown }[] | undefined): boolean =>
  (r ?? []).every((x) => x.error == null);

/** Нэг түлхүүр (username)-д нэг мөр байлгаж upsert хийнэ; давхардлыг цэвэрлэнэ */
async function upsertByKey(usernameKey: string, attrs: Record<string, unknown>): Promise<boolean> {
  try {
    const url = await tableUrl(true);
    if (!url) return false;
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    return ok.length > 0 && ok.every((x) => x.error == null) && editOk(r.deleteFeatureResults);
  } catch {
    return false;
  }
}

/** Түлхүүрт таарах БҮХ мөрийг устгана (давхардал ч бас) */
async function removeByKey(usernameKey: string): Promise<boolean> {
  try {
    const url = await tableUrl(true);
    if (!url) return false;
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    if (!oids.length) return true;
    const del = { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0];
    const r = await fl.applyEdits(del);
    return editOk(r.deleteFeatureResults);
  } catch {
    return false;
  }
}

/** Нэг хэрэглэгчийн эрхийн мөрийг нэмэх/шинэчлэх (upsert) */
export function upsert(row: RemoteRow): Promise<boolean> {
  return upsertByKey(row.username, {
    username: row.username,
    role: row.role ?? null,
    // Устгагдсан аккаунт — JSON биш `removed` шууд утга (RemoteRow-ийн тайлбарыг үз)
    views: row.removed ? 'removed' : JSON.stringify(row.views),
    docs: row.docs ? 1 : 0,
  });
}

/** Хэрэглэгчийн эрхийн мөрийг устгах */
export function remove(username: string): Promise<boolean> {
  return removeByKey(username);
}

/**
 * Урсгалын томилгоог бичих — нэг хэрэглэгч нэг мөр (`__flow__:` угтвартай).
 *
 * ⚠️ `viewOnly` нь ЗӨВХӨН `true` үед бичигдэнэ (2026-09-09). Хуучин мөр
 *    талбаргүй хэвээр үлдэж, задлахад `undefined` = ЖИРИЙН томилгоо болно —
 *    тэр туг эрхийг ХАСДАГ болохоос НЭМДЭГГҮЙ тул анхдагч нь аюулгүй.
 */
export function flowUpsert(
  user: string, stage: string, bagts: string[], viewOnly = false,
): Promise<boolean> {
  const key = FLOW_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(viewOnly ? { stage, bagts, viewOnly: true } : { stage, bagts }),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бичих — нэг хэрэглэгч нэг мөр (`__cap__:` угтвартай) */
export function capUpsert(user: string, caps: string[]): Promise<boolean> {
  const key = CAP_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(caps),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бүрмөсөн арилгах (эрхгүй болгох) */
export function capRemove(user: string): Promise<boolean> {
  return removeByKey(CAP_PREFIX + user.toLowerCase());
}

/** Урсгалын томилгоог арилгах */
export function flowRemove(user: string): Promise<boolean> {
  return removeByKey(FLOW_PREFIX + user.toLowerCase());
}

/**
 * Чанарын (QAQC) багцын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 *
 * ⚠️ `{ bagts }` объектоор бичнэ, массиваар БИШ: `__cap__:` мөр нь массив
 * хадгалдаг тул хэлбэрээр нь ялгаж болохгүй, гэхдээ ирээдүйд талбар нэмэхэд
 * (жишээ нь тайлбар) хэлбэр өөрчлөгдөхгүй байх нь чухал. `__flow__:`-тэй ижил.
 */
export function qaqcUpsert(user: string, bagts: string[]): Promise<boolean> {
  const key = QAQC_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify({ bagts }),
    docs: 0,
  });
}

/** Чанарын багцын хуваарилалтыг арилгах */
export function qaqcRemove(user: string): Promise<boolean> {
  return removeByKey(QAQC_PREFIX + user.toLowerCase());
}

/**
 * Хуваарийн хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `roles` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 *    тээвэрлэнэ (`huvaariAcl` танигдахгүйг нь хаяна) — `caps`-тай ижил зарчим.
 */
export function huvaariUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = HUVAARI_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    /*
     * ⚠️ ХОЁР ХЭЛБЭРИЙГ ЗЭРЭГ БИЧНЭ (2026-09-09). `grants` нь ҮНЭН эх сурвалж;
     *    `roles`/`bagts` нь ХУУЧИН клиент build уншиж чадах нөөц (нэгдэл).
     *    Ингэсэн тул шинэ клиент бичсэн мөрийг хуучин клиент нээхэд эрх
     *    ЧИМЭЭГҮЙ алга болохгүй. Хуучин нь үржвэр болж УЯН болох тул
     *    (жишээ нь Багц 1-д батлагч ч болох) — энэ нь fail-closed биш ч
     *    зөвхөн ШИЛЖИЛТИЙН хугацаанд, зөвхөн хуучин build дээр үйлчилнэ.
     */
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/**
 * Инженерийн төлөвлөсөн обьёмын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `roles` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 *    тээвэрлэнэ (`obyemAcl` танигдахгүйг нь хаяна).
 */
export function obyemUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = OBYEM_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    /*
     * ⚠️ ХОЁР ХЭЛБЭРИЙГ ЗЭРЭГ БИЧНЭ (2026-09-09). `grants` нь ҮНЭН эх сурвалж;
     *    `roles`/`bagts` нь ХУУЧИН клиент build уншиж чадах нөөц (нэгдэл).
     *    Ингэсэн тул шинэ клиент бичсэн мөрийг хуучин клиент нээхэд эрх
     *    ЧИМЭЭГҮЙ алга болохгүй. Хуучин нь үржвэр болж УЯН болох тул
     *    (жишээ нь Багц 1-д батлагч ч болох) — энэ нь fail-closed биш ч
     *    зөвхөн ШИЛЖИЛТИЙН хугацаанд, зөвхөн хуучин build дээр үйлчилнэ.
     */
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/** Инженерийн төлөвлөсөн обьёмын хуваарилалтыг арилгах */
export function obyemRemove(user: string): Promise<boolean> {
  return removeByKey(OBYEM_PREFIX + user.toLowerCase());
}

/** Хуваарийн хуваарилалтыг арилгах */
export function huvaariRemove(user: string): Promise<boolean> {
  return removeByKey(HUVAARI_PREFIX + user.toLowerCase());
}
