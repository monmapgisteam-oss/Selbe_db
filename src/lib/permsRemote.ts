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
export type FlowRow = { user: string; stage: string; bagts: string[] };

/**
 * НЭМЭЛТ ЭРХИЙН нэг мөр — `__cap__:` угтвартай.
 *
 * ⚠️ `caps` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 * тээвэрлэнэ (`caps.ts` танигдахгүйг нь хаяна). Ингэснээр шинэ эрх нэмэхэд
 * хадгалалтын давхарга хөндөгдөхгүй.
 */
export type CapRow = { user: string; caps: string[] };

const TITLE = 'Selbe_Permissions';
const TABLE_NAME = 'permissions';
/** Урсгалын томилгооны мөрийн `username` угтвар — эрхийн мөрөөс ялгана */
const FLOW_PREFIX = '__flow__:';
/** Нэмэлт эрхийн мөрийн `username` угтвар — эрх ба урсгалын мөрөөс ялгана */
const CAP_PREFIX = '__cap__:';

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
    num: '10',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string }>) ?? [];
  const hit = results.find(
    (x) => x.title === TITLE && x.url && SUPER_OWNERS.has(String(x.owner ?? '').toLowerCase()),
  );
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
  if (!url && canCreate) url = await createTable(auth.token, auth.user);
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
): Promise<{ perms: Record<string, RemoteRow>; flow: FlowRow[]; caps: CapRow[] } | null> {
  try {
    const url = await tableUrl(canCreate);
    if (!url) return null;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, '1=1');
    const perms: Record<string, RemoteRow> = {};
    const flow: FlowRow[] = [];
    const caps: CapRow[] = [];
    for (const a of rows) {
      if (!a.username) continue;

      /* ── Нэмэлт эрхийн мөр ── */
      if (a.username.startsWith(CAP_PREFIX)) {
        const user = a.username.slice(CAP_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '[]') as unknown;
          if (user && Array.isArray(d)) caps.push({ user, caps: d as string[] });
        } catch { /* эвдэрсэн мөр — алгасна (эрхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Урсгалын томилгооны мөр ── */
      if (a.username.startsWith(FLOW_PREFIX)) {
        const user = a.username.slice(FLOW_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as { stage?: string; bagts?: string[] };
          if (user && d.stage) {
            flow.push({ user, stage: d.stage, bagts: Array.isArray(d.bagts) ? d.bagts : [] });
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
    return { perms, flow, caps };
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
  const found = await fl.queryFeatures({
    where: `LOWER(username) = '${username.toLowerCase().replace(/'/g, "''")}'`,
    outFields: ['OBJECTID'], returnGeometry: false, orderByFields: ['OBJECTID ASC'],
  });
  return found.features
    .map((f) => f.attributes?.OBJECTID as number)
    .filter((x) => typeof x === 'number');
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

/** Урсгалын томилгоог бичих — нэг хэрэглэгч нэг мөр (`__flow__:` угтвартай) */
export function flowUpsert(user: string, stage: string, bagts: string[]): Promise<boolean> {
  const key = FLOW_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify({ stage, bagts }),
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
