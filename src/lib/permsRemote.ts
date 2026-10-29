'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 *
 * Эрхийн override-ыг байгууллагын ArcGIS дээрх нэг hosted хүснэгтэд хадгална.
 * Ингэснээр super admin ямар ч төхөөрөмжөөс өөрчилсөн эрх бүх хэрэглэгчид
 * (өөр газраас нэвтэрсэн ч) үйлчилнэ — `localStorage` шиг нэг browser-т хязгаарлагдахгүй.
 */

import { SYS_PERMS } from '@/lib/services/env';
import { installEntInterceptor } from '@/lib/entInterceptor';
import { AUTH, ROLE_BY_USER, type Role, type ViewKey } from './services';
import { arcgisPost } from '@/lib/query';
import { ensureFreshToken } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from './scopedAcl';
import { UNSAFE_KEY } from './caps';

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
  autoRole?: boolean;
};

/**
 * НЭМЭЛТ ЭРХИЙН нэг мөр — `__cap__:` угтвартай.
 */
export type CapRow = { user: string; caps: string[] };


/**
 * ХУВААРИЙН хуваарилалтын нэг мөр — `__huvaari__:` угтвартай.
 */
/**
 * ХУВААРИЛАЛТЫН `views` НҮДНИЙ JSON — гурван үүрэгтэй систем (Хуваарь · Обьём ·
 * Чанарын баримт) ижил хэлбэрээр бичдэг.
 */
type ViewsJson = { roles?: string[]; bagts?: string[]; grants?: Grant[] };

export type HuvaariRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН хуваарилалтын нэг мөр — `__obyem__:` угтвартай.
 */
export type ObyemRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

/**
 * НЭМЭЛТ АЖЛЫН хуваарилалтын нэг мөр — `__ajil__:` угтвартай.
 */
/**
 * ДЭД БҮТЦИЙН ЗАСВАРЫН хуваарилалтын нэг мөр — `__butets__:` угтвартай.
 */
export type ButetsRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

export type AjilRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

/**
 * ЧАНАРЫН БАРИМТЫН хуваарилалтын нэг мөр — `__chanar__:` угтвартай.
 */
export type ChanarRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

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
/** Чанарын баримтын хуваарилалтын угтвар — QAQC-ийнхаас ялгана */
const CHANAR_PREFIX = '__chanar__:';
/** Нэмэлт ажлын хуваарилалтын угтвар — обьёмынхоос ялгана */
const AJIL_PREFIX = '__ajil__:';
/** Дэд бүтцийн засварын багцын хуваарилалтын угтвар — нэмэлт ажлынхаас ялгана */
const BUTETS_PREFIX = '__butets__:';
/**
 * ЭРХИЙН ТӨРЛИЙН ЗАГВАРЫН угтвар (2026-09-25) — `__type__:injener` г.м.
 */
const TYPE_PREFIX = '__type__:';
/**
 * СИСТЕМИЙН ТӨЛӨВИЙН угтвар (2026-10-19) — `__sys__:maintenance` («Систем түр хаах»).
 */
const SYS_PREFIX = '__sys__:';
/** Засварын (хаалтын) мөрийн түлхүүр — `SYS_PREFIX`-ийн ард */
const SYS_MAINT = 'maintenance';

/**
 * СИСТЕМ ТҮР ХААХ ТӨЛӨВ (2026-10-19) — `__sys__:maintenance` мөрийн `views` JSON.
 *   · `on`    — ЗӨВХӨН яг `true` бол хаалттай (эргэлзээтэй утга хаахгүй — fail-open, доорх)
 *   · `note`  — хаагчийн нэмэлт тайлбар (сонголттой)
 *   · `until` — «Дахин нээгдэх: …» чөлөөт текст (сонголттой; цагийг шалгахгүй, зөвхөн харуулна)
 *   · `by` · `at` — хэн, хэзээ (мс)
 */
export type SysState = { on: boolean; note?: string; until?: string; by: string; at: number };

/**
 * `__sys__:maintenance` мөрийн `views`-ийг задлана — ЦЭВЭР (`permissions.check` шалгана).
 */
export function parseSysState(raw: string | null | undefined): SysState | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.on !== 'boolean') return null;
    const str = (v: unknown, max: number): string | undefined =>
      (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    const note = str(d.note, 500);
    const until = str(d.until, 100);
    return {
      on: d.on === true,
      ...(note ? { note } : {}),
      ...(until ? { until } : {}),
      by: typeof d.by === 'string' ? d.by : '',
      at: typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : 0,
    };
  } catch {
    return null;
  }
}

/**
 * ЗАЙТАЙ ТҮЛХҮҮР ( 2026-10-19, `MalformedRow.space`) — нэрийн захад эсвэл угтварын ДАРАА зай.
 * Цэвэр функц (`permissions.check` шалгана). Том/жижиг үсэг хамаарахгүй (`LOWER` олно).
 */
export function isSpacedKey(raw: string): boolean {
  const lu = raw.trim().toLowerCase();
  if (raw.toLowerCase() !== lu) return true;
  const pre = [SYS_PREFIX, TYPE_PREFIX, AJIL_PREFIX, BUTETS_PREFIX, CHANAR_PREFIX, OBYEM_PREFIX, HUVAARI_PREFIX, QAQC_PREFIX, CAP_PREFIX, FLOW_PREFIX]
    .find((p) => lu.startsWith(p));
  return pre != null && lu.slice(pre.length) !== lu.slice(pre.length).trim();
}

/** Эрхийн төрлийн нэг загвар — `tpl` нь задлаагүй JSON (`roleTypes.cleanTpl` шүүнэ) */
export type TypeRow = { role: string; tpl: unknown };

/**
 * ЗАДЛАГДААГҮЙ (АЛГАССАН) МӨР — 2026-10-19 (аудит). `key` нь хүснэгтийн `username` ЯГ хэвээр (админ хайж олно).
 *   · `json`  — `views` JSON биш / хүлээгдсэн хэлбэр биш
 *   · `stage` — урсгалын мөрөнд шат алга
 *   · `user`  — угтварын дараа нэр хоосон эсвэл аюултай нэр (`__proto__` г.м.)
 */
export type MalformedRow = { key: string; reason: 'json' | 'stage' | 'user' | 'space'; oid?: number };

let tableUrlCache: string | undefined;

/** IdentityManager-аас идэвхтэй token авах (нэвтрээгүй бол null) */
async function getToken(): Promise<{ token: string; user: string } | null> {
  try {
    await ensureFreshToken();
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
 */
const req = (url: string, params: Record<string, string>) => arcgisPost(url, params, { token: 'org' });

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн ЖИНХЭНЭ эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u),
);
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([...SUPER_OWNERS, ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase())]);
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт олдсон — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;
/** Танигдаагүй эздийн нэрс (сүүлийн хайлт) — админд ИЛ хэлэхэд */
let mismatchOwners: string[] = [];
export const permsOwnerMismatch = (): string[] => (ownerMismatch ? mismatchOwners : []);
let tablePublic = false;
/** Эрхийн хүснэгт нийтэд нээлттэй эсэх — UserAdmin-ы анхааруулга */
export const permsTablePublic = (): boolean => tablePublic;

let tableOrgEditable = false;
/** Эрхийн хүснэгт байгууллагад засагдахаар нээлттэй эсэх (Enterprise) — UserAdmin-ы анхааруулга */
export const permsTableOrgEditable = (): boolean => tableOrgEditable;
let exposureProbed = false;
type LayerMetaLite = { capabilities?: unknown; serviceItemId?: unknown };
async function probeEntExposure(layerUrl: string): Promise<void> {
  if (exposureProbed) return;
  exposureProbed = true;
  try {
    const meta = await arcgisPost<LayerMetaLite>(layerUrl, {}, { token: 'org' });
    const caps = String(meta.capabilities ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const editable = ['editing', 'create', 'update', 'delete'].some((c) => caps.includes(c));
    let itemId = typeof meta.serviceItemId === 'string' ? meta.serviceItemId : '';
    if (!itemId) {
      const svc = await arcgisPost<LayerMetaLite>(layerUrl.replace(/\/\d+\/?$/, ''), {}, { token: 'org' });
      itemId = typeof svc.serviceItemId === 'string' ? svc.serviceItemId : '';
    }
    if (!itemId) return;
    /* Порталын item — анхдагч `token: 'always'`: портал хост руу хэрэглэгчийн токен явна */
    const item = await arcgisPost<{ access?: unknown }>(`${restBase()}/content/items/${encodeURIComponent(itemId)}`, {});
    const access = String(item.access ?? '').toLowerCase();
    tablePublic = access === 'public';
    tableOrgEditable = editable && (access === 'org' || access === 'public');
  } catch {
    /* шалгаж чадсангүй — анхааруулгагүй (дээрх) */
  }
}

/**
 * Хүснэгтийн URL олох — байгаа item-ээс.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  tablePublic = String(hit?.access ?? '') === 'public';
  if (tablePublic) {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч эрхийн мөр засаж чадна.`,
      'AGOL дээр item-ийн Share-ийг «Organization» болгоно уу.',
    );
  }
  ownerMismatch = !hit && same.length > 0;
  mismatchOwners = ownerMismatch ? [...new Set(same.map((x) => String(x.owner ?? '?')))] : [];
  if (ownerMismatch) {
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй: ${mismatchOwners.join(', ')}.`,
      'Энэ нэр кодын super жагсаалтад (ROLE_BY_USER) алга тул БҮХ хэрэглэгчийн remote эрх унтарсан.',
      `Засвар: (а) AGOL дээр item-ийн эзнийг одоогийн super-т шилжүүлэх (Change owner), ЭСВЭЛ (б) src/lib/permsRemote.ts-ийн FORMER_TABLE_OWNERS-д '${mismatchOwners.join("', '")}' нэмж дахин байршуулах.`,
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
      objectIdField: 'objectid',
      fields: [
        { name: 'objectid', type: 'esriFieldTypeOID', nullable: false, editable: false },
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

/**
 * Хүснэгтийн URL-ыг тодорхойлох — олох, эс бөгөөс (super) үүсгэх.
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const direct: string | null = `${SYS_PERMS}/230`;
  if (direct) {
    tableUrlCache = direct;
    if (typeof document !== 'undefined') void probeEntExposure(direct);
    return direct;
  }
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  if (!url && canCreate && !ownerMismatch && TABLE_OWNERS.has(auth.user.toLowerCase())) {
    url = await createTable(auth.token, auth.user);
  }
  if (url) tableUrlCache = url;
  return url;
}

type FeatureLayerMod = typeof import('@arcgis/core/layers/FeatureLayer').default;
type FeatureLayerInst = InstanceType<FeatureLayerMod>;
async function layer(url: string): Promise<FeatureLayerInst> {
  await installEntInterceptor();
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

type RawAttrs = { objectid?: number; username?: string; role?: string; views?: string; docs?: number };

/**
 * БҮХ мөрийг хуудаслаж татна.
 */
async function queryAllRows(fl: FeatureLayerInst, where: string): Promise<RawAttrs[]> {
  const out: RawAttrs[] = [];
  for (let offset = 0; ; ) {
    const res = await fl.queryFeatures({
      where, outFields: ['*'], returnGeometry: false,
      orderByFields: ['objectid ASC'], start: offset, num: 2000,
    });
    out.push(...res.features.map((f) => f.attributes as RawAttrs));
    if (!res.exceededTransferLimit || res.features.length === 0) break;
    offset += res.features.length;
  }
  return out;
}

/**
 * Бүх мөрийг татаж, ЭРХ ба УРСГАЛЫН томилгоо болгон ялгана.
 */
export async function fetchAll(
  canCreate = false,
): Promise<{
  perms: Record<string, RemoteRow>; flow: FlowRow[]; caps: CapRow[];
  huvaari: HuvaariRow[]; obyem: ObyemRow[]; chanar: ChanarRow[]; ajil: AjilRow[];
  butets: ButetsRow[]; types: TypeRow[];
  malformed: MalformedRow[];
  sys: SysState | null;
} | null> {
  try {
    const url = await tableUrl(canCreate);
    if (!url) return null;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, '1=1');
    const perms: Record<string, RemoteRow> = {};
    const flowBy = new Map<string, FlowRow>();
    const capsBy = new Map<string, CapRow>();
    const huvaariBy = new Map<string, HuvaariRow>();
    const obyemBy = new Map<string, ObyemRow>();
    const chanarBy = new Map<string, ChanarRow>();
    const ajilBy = new Map<string, AjilRow>();
    const butetsBy = new Map<string, ButetsRow>();
    const typesBy = new Map<string, TypeRow>();
    const malformed: MalformedRow[] = [];
    let sys: SysState | null = null;
    /** Одоо уншиж буй мөрийн OBJECTID — цэвэрлэгээний товчинд (2026-10-19) */
    let curOid: number | undefined;
    const bad = (key: string, reason: MalformedRow['reason']) => {
      malformed.push({ key, reason, ...(typeof curOid === 'number' ? { oid: curOid } : {}) });
    };
    /** Угтвартай мөр бол угтваргүй нэр (trim · жижиг үсэг), үгүй бол `null` */
    const strip = (lu: string, prefix: string): string | null =>
      (lu.startsWith(prefix) ? lu.slice(prefix.length).trim() : null);
    /** Үүрэгтэй/үүрэггүй багцын хуваарилалтын мөр — `{roles, bagts, grants}` */
    const scoped = (d: ViewsJson, user: string) => ({
      user,
      roles: Array.isArray(d.roles) ? d.roles : [],
      bagts: Array.isArray(d.bagts) ? d.bagts : [],
      ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
    });
    const SCOPED: [string, Map<string, AjilRow | ButetsRow | ChanarRow | ObyemRow | HuvaariRow>][] = [
      [AJIL_PREFIX, ajilBy], [BUTETS_PREFIX, butetsBy], [CHANAR_PREFIX, chanarBy], [OBYEM_PREFIX, obyemBy], [HUVAARI_PREFIX, huvaariBy],
    ];
    rowLoop: for (const a of rows) {
      if (!a.username) continue;
      const raw = String(a.username);
      const lu = raw.trim().toLowerCase();
      if (!lu) continue;
      curOid = typeof a.objectid === 'number' ? a.objectid : undefined;
      if (isSpacedKey(raw)) { bad(raw, 'space'); continue; }

      /* ── Системийн төлөвийн мөр ( 2026-10-19, «Систем түр хаах») ── */
      const sysKey = strip(lu, SYS_PREFIX);
      if (sysKey != null) {
        if (sysKey === SYS_MAINT) {
          const st = parseSysState(a.views);
          if (st) sys = st; else { sys = null; bad(raw, 'json'); }
        }
        continue;
      }

      /* ── Эрхийн төрлийн загварын мөр (2026-09-25) ── */
      const role = strip(lu, TYPE_PREFIX);
      if (role != null) {
        try {
          const d = JSON.parse(a.views || '{}') as unknown;
          if (!d || typeof d !== 'object') bad(raw, 'json');
          typesBy.set(role, { role, tpl: d && typeof d === 'object' ? d : null });
        } catch { bad(raw, 'json'); typesBy.set(role, { role, tpl: null }); }
        continue;
      }

      /* ── Багцын хуваарилалтын мөрүүд (нэмэлт ажил · дэд бүтэц · чанарын баримт · обьём · хуваарь) ── */
      for (const [prefix, map] of SCOPED) {
        const user = strip(lu, prefix);
        if (user == null) continue;
        if (!user || UNSAFE_KEY.has(user)) { bad(raw, 'user'); continue rowLoop; }
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (!d || typeof d !== 'object') { bad(raw, 'json'); continue rowLoop; }
          map.set(user, scoped(d, user));
        } catch { bad(raw, 'json'); /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue rowLoop;
      }

      if (strip(lu, QAQC_PREFIX) != null) continue;

      /* ── Нэмэлт эрхийн мөр ── */
      const cUser = strip(lu, CAP_PREFIX);
      if (cUser != null) {
        if (!cUser || UNSAFE_KEY.has(cUser)) { bad(raw, 'user'); continue; }
        try {
          const d = JSON.parse(a.views || '[]') as unknown;
          if (Array.isArray(d)) capsBy.set(cUser, { user: cUser, caps: d as string[] });
          else bad(raw, 'json');
        } catch { bad(raw, 'json'); /* эвдэрсэн мөр — алгасна (эрхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Урсгалын томилгооны мөр ── */
      const fUser = strip(lu, FLOW_PREFIX);
      if (fUser != null) {
        if (!fUser || UNSAFE_KEY.has(fUser)) { bad(raw, 'user'); continue; }
        try {
          const d = JSON.parse(a.views || '{}') as {
            stage?: string; bagts?: string[]; viewOnly?: boolean; autoRole?: boolean;
          };
          if (d && typeof d === 'object' && d.stage) {
            flowBy.set(fUser, {
              user: fUser,
              stage: d.stage,
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(d.viewOnly === true ? { viewOnly: true as const } : {}),
              ...(d.autoRole === true ? { autoRole: true as const } : {}),
            });
          } else bad(raw, 'stage');
        } catch { bad(raw, 'json'); /* эвдэрсэн мөр — алгасна (томилгоо байхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Эрхийн мөр ── */
      // Устгагдсан аккаунт — `views` талбарт `removed` шууд утга (JSON биш)
      const removed = a.views === 'removed';
      let views: ViewKey[] | 'all' = [];
      if (!removed) {
        try {
          const v = a.views ? JSON.parse(a.views) : [];
          views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
          if (v !== 'all' && !Array.isArray(v)) bad(raw, 'json');
        } catch { views = []; bad(raw, 'json'); }
      }
      if (UNSAFE_KEY.has(lu)) { bad(raw, 'user'); continue; }
      perms[lu] = {
        username: raw.trim(),
        role: (a.role as Role) || null,
        views,
        docs: a.docs === 1 || (a.docs as unknown) === true,
        ...(removed ? { removed: true } : {}),
      };
    }
    return {
      perms,
      flow: [...flowBy.values()],
      caps: [...capsBy.values()],
      huvaari: [...huvaariBy.values()],
      obyem: [...obyemBy.values()],
      chanar: [...chanarBy.values()],
      ajil: [...ajilBy.values()],
      butets: [...butetsBy.values()],
      types: [...typesBy.values()],
      malformed,
      sys,
    };
  } catch {
    return null;
  }
}

/**
 * `username`-ээр таарах БҮХ мөрийн OBJECTID (өсөх эрэмбээр).
 */
async function findOids(fl: FeatureLayerInst, username: string): Promise<number[]> {
  const where = `LOWER(username) = '${username.trim().toLowerCase().replace(/'/g, "''")}'`;
  const out: number[] = [];
  for (let offset = 0; ; ) {
    const found = await fl.queryFeatures({
      where, outFields: ['objectid'], returnGeometry: false,
      orderByFields: ['objectid ASC'], start: offset, num: 2000,
    });
    out.push(...found.features
      .map((x) => x.attributes?.objectid as number)
      .filter((x) => typeof x === 'number'));
    if (!found.exceededTransferLimit || found.features.length === 0) break;
    offset += found.features.length;
  }
  return out;
}

const editOk = (r: { error?: unknown }[] | undefined): boolean =>
  (r ?? []).every((x) => x.error == null);

const VIEWS_MAX = 2048;
let lastWriteErr = '';
let lastWriteErrAt = 0;
/**
 * Сүүлийн бичилтийн ТОДОРХОЙ шалтгаан (уншмагц цэвэрлэгдэнэ) — `aclOps.runOp` · `UserAdmin`.
 */
export function takeWriteError(): string {
  const m = Date.now() - lastWriteErrAt < 15_000 ? lastWriteErr : '';
  lastWriteErr = '';
  return m;
}
function noteWriteError(e: unknown): void {
  if (lastWriteErr && Date.now() - lastWriteErrAt < 15_000) return;
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e
    : String((e as { message?: string } | null)?.message ?? e ?? '');
  if (!m) return;
  lastWriteErr = tr('ArcGIS-т хадгалагдсангүй: {0}', m);
  lastWriteErrAt = Date.now();
}
/** applyEdits-ийн үр дүнгийн ЭХНИЙ алдааны текст */
const editErr = (r: { error?: unknown }[] | undefined): string => {
  const x = (r ?? []).find((y) => y.error != null)?.error as { message?: string; description?: string } | undefined;
  return x ? String(x.message ?? x.description ?? '') : '';
};
function assertViewsFit(usernameKey: string, attrs: Record<string, unknown>): void {
  const v = attrs.views;
  if (typeof v !== 'string' || v.length <= VIEWS_MAX) return;
  const msg = tr('«{0}» мөрийн эрхийн өгөгдөл хэт урт ({1} тэмдэгт, дээд тал нь {2}) тул хадгалагдсангүй — багцын жагсаалтыг цөөлөх эсвэл «Бүх багц» болгоно уу.',
    usernameKey, v.length, VIEWS_MAX);
  lastWriteErr = msg;
  lastWriteErrAt = Date.now();
  console.error('[selbe]', msg);
  throw new Error(msg);
}

/** Нэг түлхүүр (username)-д нэг мөр байлгаж upsert хийнэ; давхардлыг цэвэрлэнэ */
async function upsertByKey(usernameKey: string, attrs: Record<string, unknown>): Promise<boolean> {
  try {
    assertViewsFit(usernameKey, attrs);
    const url = await tableUrl(false);
    if (!url) { noteWriteError(tr('Эрхийн хүснэгт олдсонгүй эсвэл хандах эрхгүй байна.')); return false; }
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { objectid: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    const good = ok.length > 0 && ok.every((x) => x.error == null) && editOk(r.deleteFeatureResults);
    if (!good) noteWriteError(editErr(ok) || editErr(r.deleteFeatureResults) || tr('ArcGIS бичилтийг хүлээж авсангүй.'));
    return good;
  } catch (e) {
    noteWriteError(e);
    return false;
  }
}

/** Түлхүүрт таарах БҮХ мөрийг устгана (давхардал ч бас) */
async function removeByKey(usernameKey: string): Promise<boolean> {
  try {
    const url = await tableUrl(false);
    if (!url) { noteWriteError(tr('Эрхийн хүснэгт олдсонгүй эсвэл хандах эрхгүй байна.')); return false; }
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    if (!oids.length) return true;
    const del = { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0];
    const r = await fl.applyEdits(del);
    const dr = r.deleteFeatureResults ?? [];
    const good = dr.length === oids.length && editOk(dr);
    if (!good) noteWriteError(editErr(r.deleteFeatureResults) || tr('ArcGIS бичилтийг хүлээж авсангүй.'));
    return good;
  } catch (e) {
    noteWriteError(e);
    return false;
  }
}

/**
 * ЭВДЭРСЭН (ЗАЙТАЙ г.м.) МӨРИЙГ OBJECTID-ООР УСТГАНА — админы «Эрхийн хүснэгтийн цэвэрлэгээ» (2026-10-19).
 */
export async function removeMalformedRow(oid: number, expectKey: string): Promise<boolean> {
  try {
    if (!Number.isInteger(oid) || oid <= 0) return false;
    const url = await tableUrl(false);
    if (!url) { noteWriteError(tr('Эрхийн хүснэгт олдсонгүй эсвэл хандах эрхгүй байна.')); return false; }
    const fl = await layer(url);
    const rows = await queryAllRows(fl, `objectid = ${oid}`);
    if (!rows.length) return true; // аль хэдийн устгагдсан
    if (String(rows[0].username ?? '') !== expectKey) {
      noteWriteError(tr('Мөр өөрчлөгдсөн байна — хуудсыг шинэчлээд дахин оролдоно уу.'));
      return false;
    }
    const r = await fl.applyEdits({ deleteFeatures: [{ objectId: oid }] } as Parameters<typeof fl.applyEdits>[0]);
    const dr = r.deleteFeatureResults ?? [];
    const good = dr.length === 1 && editOk(dr);
    if (!good) noteWriteError(editErr(r.deleteFeatureResults) || tr('ArcGIS бичилтийг хүлээж авсангүй.'));
    return good;
  } catch (e) {
    noteWriteError(e);
    return false;
  }
}

/**
 * НЭГ ТҮЛХҮҮРИЙН `views`-ИЙГ ШИНЭЭР УНШИНА — бичихийн ЯГ ӨМНӨ нэгтгэхэд (2026-10-04).
 */
async function readViewsByKey(key: string): Promise<string | null | undefined> {
  const r = await readRowByKey(key);
  if (r === undefined) return undefined;
  return r ? String(r.views ?? '') : null;
}

/** Нэг түлхүүрийн их OID-тай МӨРИЙГ бүтнээр — `undefined` = уншиж чадсангүй, `null` = мөр алга */
async function readRowByKey(key: string): Promise<RawAttrs | null | undefined> {
  try {
    const url = await tableUrl(false);
    if (!url) return undefined;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, `LOWER(username) = '${key.trim().toLowerCase().replace(/'/g, "''")}'`);
    return rows[rows.length - 1] ?? null;
  } catch {
    return undefined;
  }
}

/**
 * Урсгалын томилгоог ШИНЭЭР уншина (`guitsetgelAcl.pushFlow`-ийн нэгтгэлд, 2026-10-05).
 */
export async function flowRead(user: string): Promise<{ row: FlowRow | null } | null> {
  const u = user.trim().toLowerCase();
  const v = await readViewsByKey(FLOW_PREFIX + u);
  if (v === undefined) return null;
  if (v === null) return { row: null };
  try {
    const d = JSON.parse(v || '{}') as { stage?: string; bagts?: string[]; viewOnly?: boolean; autoRole?: boolean };
    if (!d.stage) return { row: null };
    return {
      row: {
        user: u,
        stage: d.stage,
        bagts: Array.isArray(d.bagts) ? d.bagts : [],
        ...(d.viewOnly === true ? { viewOnly: true as const } : {}),
        ...(d.autoRole === true ? { autoRole: true as const } : {}),
      },
    };
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил алгасна (томилгоогүй, fail-closed) */
    return { row: null };
  }
}

/**
 * Хэрэглэгчийн ЭРХИЙН мөрийг ШИНЭЭР уншина (`permissions.setUser`-ийн нэгтгэлд, 2026-10-05).
 */
export async function userRead(username: string): Promise<{ row: RemoteRow | null } | null> {
  const a = await readRowByKey(username.trim());
  if (a === undefined) return null;
  if (a === null || !a.username) return { row: null };
  const removed = a.views === 'removed';
  let views: ViewKey[] | 'all' = [];
  if (!removed) {
    try {
      const v = a.views ? JSON.parse(a.views) : [];
      views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
    } catch { views = []; }
  }
  return {
    row: {
      username: a.username,
      role: (a.role as Role) || null,
      views,
      docs: a.docs === 1 || (a.docs as unknown) === true,
      ...(removed ? { removed: true } : {}),
    },
  };
}

/** Хэрэглэгчийн нэмэлт эрхийг ШИНЭЭР уншина — `null` = уншиж чадсангүй, `[]` = мөр алга */
export async function capRead(user: string): Promise<string[] | null> {
  const v = await readViewsByKey(CAP_PREFIX + user.trim().toLowerCase());
  if (v === undefined) return null;
  if (v === null) return [];
  try {
    const d = JSON.parse(v || '[]') as unknown;
    return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил эрхгүй гэж уншина (fail-closed) */
    return [];
  }
}

/** `scopedAcl`-ийн систем бүрийн угтвар */
const SCOPED_PREFIX = {
  huvaari: HUVAARI_PREFIX, obyem: OBYEM_PREFIX, chanar: CHANAR_PREFIX,
  ajil: AJIL_PREFIX, butets: BUTETS_PREFIX,
} as const;
export type ScopedKind = keyof typeof SCOPED_PREFIX;

/**
 * Багцын хуваарилалтын мөрийг ШИНЭЭР уншина (`scopedAcl.pushRow`-ийн нэгтгэлд).
 * @returns `null` = уншиж чадсангүй; `{ row: null }` = мөр алга; эс бөгөөс `fetchAll`-тэй ижил задлалт.
 */
export async function scopedRead(
  kind: ScopedKind, user: string,
): Promise<{ row: { roles: string[]; bagts: string[]; grants?: Grant[] } | null } | null> {
  const v = await readViewsByKey(SCOPED_PREFIX[kind] + user.trim().toLowerCase());
  if (v === undefined) return null;
  if (v === null) return { row: null };
  try {
    const d = JSON.parse(v || '{}') as ViewsJson;
    return {
      row: {
        roles: Array.isArray(d.roles) ? d.roles : [],
        bagts: Array.isArray(d.bagts) ? d.bagts : [],
        ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
      },
    };
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил алгасна (хуваарилалтгүй) */
    return { row: null };
  }
}

/** Нэг хэрэглэгчийн эрхийн мөрийг нэмэх/шинэчлэх (upsert) */
export function upsert(row: RemoteRow): Promise<boolean> {
  const key = row.username.trim().toLowerCase();
  return upsertByKey(key, {
    username: row.username.trim(),
    role: row.role ?? null,
    // Устгагдсан аккаунт — JSON биш `removed` шууд утга (RemoteRow-ийн тайлбарыг үз)
    views: row.removed ? 'removed' : JSON.stringify(row.views),
    docs: row.docs ? 1 : 0,
  });
}

/** Хэрэглэгчийн эрхийн мөрийг устгах */
export function remove(username: string): Promise<boolean> {
  return removeByKey(username.trim().toLowerCase());
}

/**
 * Урсгалын томилгоог бичих — нэг хэрэглэгч нэг мөр (`__flow__:` угтвартай).
 */
export function flowUpsert(
  user: string, stage: string, bagts: string[], viewOnly = false, autoRole = false,
): Promise<boolean> {
  const key = FLOW_PREFIX + user.trim().toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify({
      stage, bagts, ...(viewOnly ? { viewOnly: true } : {}), ...(autoRole ? { autoRole: true } : {}),
    }),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бичих — нэг хэрэглэгч нэг мөр (`__cap__:` угтвартай) */
export function capUpsert(user: string, caps: string[]): Promise<boolean> {
  const key = CAP_PREFIX + user.trim().toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(caps),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бүрмөсөн арилгах (эрхгүй болгох) */
export function capRemove(user: string): Promise<boolean> {
  return removeByKey(CAP_PREFIX + user.trim().toLowerCase());
}

/** Урсгалын томилгоог арилгах */
export function flowRemove(user: string): Promise<boolean> {
  return removeByKey(FLOW_PREFIX + user.trim().toLowerCase());
}

/** Эрхийн төрлийн загварыг бичих — нэг төрөл нэг мөр */
export function typeUpsert(role: string, tpl: unknown): Promise<boolean> {
  const key = TYPE_PREFIX + role.trim().toLowerCase();
  return upsertByKey(key, { username: key, role: null, views: JSON.stringify(tpl), docs: 0 });
}

/**
 * «СИСТЕМ ТҮР ХААХ» ТӨЛӨВИЙГ БИЧНЭ (2026-10-19) — `__sys__:maintenance` нэг мөр (`typeUpsert`-ийн загвар).
 */
export function sysUpsert(state: SysState): Promise<boolean> {
  const key = SYS_PREFIX + SYS_MAINT;
  return upsertByKey(key, { username: key, role: null, views: JSON.stringify(state), docs: 0 });
}

/**
 * «Систем түр хаах» төлөвийг ШИНЭЭР уншина — бичсний дараа батлахад (`capRead`-ийн загвар).
 * @returns `null` = уншиж чадсангүй; `{ state: null }` = мөр алга / эвдэрсэн (нээлттэй).
 */
export async function sysRead(): Promise<{ state: SysState | null } | null> {
  const v = await readViewsByKey(SYS_PREFIX + SYS_MAINT);
  if (v === undefined) return null;
  return { state: v === null ? null : parseSysState(v) };
}

/**
 * БАРИМТ БИЧГИЙН САНГИЙН БҮЛГҮҮД (2026-10-23) — `__sys__:docgroups` нэг мөр, `views` нь `[{ id, title }]` JSON.
 */
const DOC_GROUPS = 'docgroups';
export type DocGroupRow = { id: string; title: string };
/** @returns `undefined` = уншиж чадсангүй; `null` = мөр алга (анхдагч бүлгүүд) */
export async function docGroupsRead(): Promise<DocGroupRow[] | null | undefined> {
  const v = await readViewsByKey(SYS_PREFIX + DOC_GROUPS);
  if (v === undefined) return undefined;
  if (v === null) return null;
  try {
    const a = JSON.parse(v) as unknown;
    if (!Array.isArray(a)) return null;
    return a
      .filter((x): x is DocGroupRow => !!x && typeof x === 'object' && typeof (x as DocGroupRow).id === 'string' && typeof (x as DocGroupRow).title === 'string')
      .map((x) => ({ id: x.id.trim(), title: x.title.trim() }))
      .filter((x) => x.id && x.title && !UNSAFE_KEY.has(x.id));
  } catch {
    return null;
  }
}
export function docGroupsWrite(list: readonly DocGroupRow[]): Promise<boolean> {
  const key = SYS_PREFIX + DOC_GROUPS;
  return upsertByKey(key, { username: key, role: null, views: JSON.stringify(list), docs: 0 });
}

/**
 * Багцын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр (`scopedAcl`-ийн таван систем).
 */
export function scopedUpsert(
  kind: ScopedKind, user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = SCOPED_PREFIX[kind] + user.trim().toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/** Багцын хуваарилалтыг арилгах (`scopedUpsert`-ийн эсрэг) */
export function scopedRemove(kind: ScopedKind, user: string): Promise<boolean> {
  return removeByKey(SCOPED_PREFIX[kind] + user.trim().toLowerCase());
}

/** Хуваарийн хуваарилалт — бичих / арилгах */
export function huvaariUpsert(user: string, roles: string[], bagts: string[], grants?: Grant[]): Promise<boolean> { return scopedUpsert('huvaari', user, roles, bagts, grants); }
export function huvaariRemove(user: string): Promise<boolean> { return scopedRemove('huvaari', user); }
/** Инженерийн төлөвлөсөн обьёмын хуваарилалт — бичих / арилгах */
export function obyemUpsert(user: string, roles: string[], bagts: string[], grants?: Grant[]): Promise<boolean> { return scopedUpsert('obyem', user, roles, bagts, grants); }
export function obyemRemove(user: string): Promise<boolean> { return scopedRemove('obyem', user); }
/** Чанарын баримтын хуваарилалт — бичих / арилгах */
export function chanarUpsert(user: string, roles: string[], bagts: string[], grants?: Grant[]): Promise<boolean> { return scopedUpsert('chanar', user, roles, bagts, grants); }
export function chanarRemove(user: string): Promise<boolean> { return scopedRemove('chanar', user); }
/** Нэмэлт ажлын хуваарилалт — бичих / арилгах */
export function ajilUpsert(user: string, roles: string[], bagts: string[], grants?: Grant[]): Promise<boolean> { return scopedUpsert('ajil', user, roles, bagts, grants); }
export function ajilRemove(user: string): Promise<boolean> { return scopedRemove('ajil', user); }
/** Дэд бүтцийн засварын хуваарилалт — бичих / арилгах */
export function butetsUpsert(user: string, roles: string[], bagts: string[], grants?: Grant[]): Promise<boolean> { return scopedUpsert('butets', user, roles, bagts, grants); }
export function butetsRemove(user: string): Promise<boolean> { return scopedRemove('butets', user); }
