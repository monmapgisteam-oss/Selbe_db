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
 */

import { AUTH, type Role, type ViewKey } from './services';
import { t as tr } from '@/lib/i18nCore';

export type RemoteRow = { username: string; role: Role | null; views: ViewKey[] | 'all'; docs: boolean };

const TITLE = 'Selbe_Permissions';
const TABLE_NAME = 'permissions';

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

async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  const r = await fetch(url, { method: 'POST', body });
  return r.json();
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хүснэгтийн URL олох — байгаа item-ээс. Олдвол `<serviceUrl>/0`. */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '5',
  });
  const results = (search.results as Array<{ url?: string; title?: string }>) ?? [];
  const hit = results.find((x) => x.title === TITLE && x.url);
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
async function layer(url: string) {
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

/** Бүх мөрийг татаж, эрхийн map болгоно */
export async function fetchAll(canCreate = false): Promise<Record<string, RemoteRow> | null> {
  try {
    const url = await tableUrl(canCreate);
    if (!url) return null;
    const fl = await layer(url);
    const res = await fl.queryFeatures({ where: '1=1', outFields: ['*'], returnGeometry: false });
    const out: Record<string, RemoteRow> = {};
    for (const f of res.features) {
      const a = f.attributes as { username?: string; role?: string; views?: string; docs?: number };
      if (!a.username) continue;
      // ⚠️ FAIL-CLOSED: views талбар хоосон/эвдэрсэн (JSON алдаа, урт таслагдсан)
      //    бол «бүх эрх» БИШ, «эрхгүй» ([]) руу унана — аюулгүй байдлын анхдагч.
      let views: ViewKey[] | 'all' = [];
      try {
        const v = a.views ? JSON.parse(a.views) : [];
        views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
      } catch { views = []; }
      out[a.username.toLowerCase()] = {
        username: a.username,
        role: (a.role as Role) || null,
        views,
        // ⚠️ FAIL-CLOSED: зөвхөн ТОДОРХОЙ 1 (эсвэл true) бол эрх нээнэ; null/хоосон → үгүй
        docs: a.docs === 1 || (a.docs as unknown) === true,
      };
    }
    return out;
  } catch {
    return null;
  }
}

/** Нэг хэрэглэгчийн мөрийг нэмэх/шинэчлэх (upsert) */
export async function upsert(row: RemoteRow): Promise<boolean> {
  try {
    const url = await tableUrl(true);
    if (!url) return false;
    const fl = await layer(url);
    const attrs = {
      username: row.username,
      role: row.role ?? null,
      views: JSON.stringify(row.views),
      docs: row.docs ? 1 : 0,
    };
    const found = await fl.queryFeatures({
      where: `LOWER(username) = '${row.username.toLowerCase().replace(/'/g, "''")}'`,
      outFields: ['OBJECTID'], returnGeometry: false,
    });
    const oid = found.features[0]?.attributes?.OBJECTID as number | undefined;
    const edit = oid != null
      ? { updateFeatures: [{ attributes: { OBJECTID: oid, ...attrs } }] }
      : { addFeatures: [{ attributes: attrs }] };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    return ok.length > 0 && ok.every((x) => x.error == null);
  } catch {
    return false;
  }
}

/** Хэрэглэгчийн мөрийг устгах */
export async function remove(username: string): Promise<boolean> {
  try {
    const url = await tableUrl(true);
    if (!url) return false;
    const fl = await layer(url);
    const found = await fl.queryFeatures({
      where: `LOWER(username) = '${username.toLowerCase().replace(/'/g, "''")}'`,
      outFields: ['OBJECTID'], returnGeometry: false,
    });
    const oid = found.features[0]?.attributes?.OBJECTID as number | undefined;
    if (oid == null) return true;
    const del = { deleteFeatures: [{ objectId: oid }] } as Parameters<typeof fl.applyEdits>[0];
    const r = await fl.applyEdits(del);
    return (r.deleteFeatureResults ?? []).every((x) => x.error == null);
  } catch {
    return false;
  }
}
