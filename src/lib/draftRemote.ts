'use client';

/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ИЙН НООРОГ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 */

import { GUITS } from '@/lib/services/env';
import { installEntInterceptor } from '@/lib/entInterceptor';
import { AUTH, ROLE_BY_USER } from './services';
import { arcgisPost } from '@/lib/query';
import { ensureFreshToken } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import { currentUser } from './who';

const TITLE = 'Selbe_Guitsetgel_Draft';
const TABLE_NAME = 'drafts';

/**
 * ХАДГАЛАХ ДЭЭД ХЭМЖЭЭ (тэмдэгт). Талбарын урт 100,000 тул түүнээс доогуур
 * барина — үлдсэн зай нь JSON-ы escape-д (кирилл тэмдэгт `\uXXXX` болж
 * 6 дахин сунаж болно) нөөц.
 */
export const REMOTE_MAX = 80_000;

/**
 * АЛСЫН НООРОГ БИЧИХ ТҮГЖИГДСЭН ҮҮ (2026-10-19, «Систем түр хаах»).
 */
export const draftWriteLocked = (): boolean =>
  typeof window !== 'undefined' && !!AUTH.appId && !currentUser();

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;

/** IdentityManager-аас идэвхтэй token + нэвтэрсэн хэрэглэгч */
export async function getAuth(): Promise<{ token: string; user: string } | null> {
  try {
    await ensureFreshToken();
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    const cred = esriId.findCredential(`${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`);
    if (!cred?.token) return null;
    const user = (cred.userId as string) ?? '';
    return user ? { token: cred.token, user } : null;
  } catch {
    return null;
  }
}

/**
 * ArcGIS REST дуудлага.
 */
const req = (url: string, params: Record<string, string>) => arcgisPost(url, params, { token: 'org' });

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хүснэгтийг үүсгэж болох (ба эзэмших) эрхтэй хүмүүс — хатуу тохиргооны super */
const TABLE_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);

/**
 * Хүснэгтийн URL — байгаа item-ээс.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй:`,
      same.map((x) => x.owner).join(', '),
      '— одоогийн super-т reassign хийнэ үү',
    );
  }
  return hit?.url ? `${hit.url}/0` : null;
}

/** Хүснэгт үүсгэх — зөвхөн publish эрхтэй super admin эхэлж нээхэд */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('«Гүйцэтгэл бөглөх»-ийн нийтлэгдээгүй ноорог'),
    hasStaticData: false,
    maxRecordCount: 2000,
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
        /* Мөрийн ганц түлхүүр — БАГЦЫН түлхүүр (2026-09-08). */
        { name: 'dkey', type: 'esriFieldTypeString', length: 512, nullable: false, editable: true },
        /* Задалсан хэсгүүд — зөвхөн админ хүснэгтийг нүдээр шалгахад */
        { name: 'usr', type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: 'pkg', type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: 'at', type: 'esriFieldTypeDouble', nullable: true, editable: true },
        { name: 'payload', type: 'esriFieldTypeString', length: 100000, nullable: true, editable: true },
      ],
    }],
  };
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  /* Байгууллага даяар — уншихад бүгд, бичихэд ArcGIS-ийн editor эрх шийднэ */
  await req(`${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`, {
    token, org: 'true', everyone: 'false',
  });
  return `${serviceUrl}/0`;
}

/**
 * Хүснэгтийн URL — олох, эс бөгөөс (super) үүсгэх.
 */
export async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const direct: string | null = `${GUITS}/191`;
  if (direct) {
    tableUrlCache = direct;
    return direct;
  }
  const auth = await getAuth();
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
/**
 * ДАВХАРГЫН КЭШ — URL тутамд НЭГ `FeatureLayer` (2026-09-08, гүйцэтгэл).
 */
const layerCache = new Map<string, Promise<FeatureLayerInst>>();
export async function layer(url: string): Promise<FeatureLayerInst> {
  const hit = layerCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    await installEntInterceptor();
    const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
    const fl = new FeatureLayer({ url });
    await fl.load();
    return fl;
  })();
  layerCache.set(url, p);
  /* Унавал (импорт · конструктор · `load`) кэшээс хасна — дараагийн дуудлага дахин оролдоно. */
  p.catch(() => { if (layerCache.get(url) === p) layerCache.delete(url); });
  return p;
}

/**
 * МӨРИЙН ТҮЛХҮҮР — ЗӨВХӨН БАГЦ (2026-09-08, хэрэглэгчийн шийдвэр).
 */
const keyOf = (pkgKey: string) => pkgKey;
/**
 * ХУУЧИН түлхүүрийн загвар (`хэрэглэгч|багц`) — ЗӨВХӨН шилжүүлэлтэд.
 */
const legacyLike = (pkgKey: string) => `%|${pkgKey}`;
export const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
/**
 * Хуучин НООРОГИЙН мөрийн шүүлт — `readLegacyDrafts` ба `clearLegacyDrafts`
 * ХОЁУЛАА ЭНИЙГ хэрэглэнэ.
 */
const legacyWhere = (pkgKey: string) =>
  `dkey LIKE ${sqlStr(legacyLike(pkgKey))} AND dkey NOT LIKE 'sub|%' AND dkey NOT LIKE 'done|%'`;

export type RemoteDraft = { at: number; payload: string };

/**
 * АЛСЫН НООРОГИЙН АГШИН — `payload`-ГҮЙ, ХЯМД шалгалт (2026-09-08, гүйцэтгэл).
 *
 * Буцаана: `at` (мс) · `null` = мөр байхгүй · `undefined` = уншиж чадсангүй
 * (сүлжээ/эрх). Гуравыг ЯЛГАХ нь чухал — «байхгүй» гэж андуурвал дуудагч
 * бусдын ажлыг дарж бичнэ.
 */
export async function readRemoteDraftAt(pkgKey: string): Promise<number | null | undefined> {
  try {
    const auth = await getAuth();
    if (!auth) return null;
    const url = await tableUrl(false);
    if (!url) return null;
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `dkey = ${sqlStr(keyOf(pkgKey))}`,
      outFields: ['objectid', 'at'],
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const last = res.features[res.features.length - 1]?.attributes as { at?: number } | undefined;
    if (!last || !Number.isFinite(last.at)) return null;
    return Number(last.at);
  } catch {
    return undefined;
  }
}

/**
 * ХУУЧИН МӨРҮҮД (`хэрэглэгч|багц`) — нэг удаагийн шилжүүлэлтэд.
 */
export type LegacyDraft = { at: number; payload: string; user: string };

export async function readLegacyDrafts(pkgKey: string): Promise<LegacyDraft[]> {
  try {
    const url = await tableUrl(false);
    if (!url) return [];
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: legacyWhere(pkgKey),
      outFields: ['objectid', 'at', 'payload', 'dkey', 'usr'],
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const out: LegacyDraft[] = [];
    for (const f of res.features) {
      const a = f.attributes as { at?: number; payload?: string; dkey?: string; usr?: string } | undefined;
      if (!a?.payload || !Number.isFinite(a.at)) continue;
      /* Нэр нь `usr` талбараас, эс бөгөөс түлхүүрийн эхний хэсгээс */
      const user = String(a.usr ?? String(a.dkey ?? '').split('|')[0] ?? '').toLowerCase();
      out.push({ at: Number(a.at), payload: String(a.payload), user });
    }
    return out;
  } catch {
    return [];
  }
}

/** ХУУЧИН мөрүүдийг устгана — шинэ түлхүүрт АМЖИЛТТАЙ бичсэний ДАРАА л дуудна. */
export async function clearLegacyDrafts(pkgKey: string): Promise<boolean> {
  if (draftWriteLocked()) return false;
  try {
    const url = await tableUrl(false);
    if (!url) return false;
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: legacyWhere(pkgKey),
      outFields: ['objectid'], returnGeometry: false, orderByFields: ['objectid ASC'],
    });
    const oids = res.features
      .map((f) => f.attributes?.objectid as number)
      .filter((x) => typeof x === 'number');
    if (!oids.length) return true;
    const r = await fl.applyEdits(
      { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0],
    );
    const dr = r.deleteFeatureResults ?? [];
    return dr.length === oids.length && dr.every((x) => x.error == null);
  } catch {
    return false;
  }
}

async function readRemoteDraftRaw(pkgKey: string): Promise<RemoteDraft | null> {
  try {
    const auth = await getAuth();
    if (!auth) return null;
    const url = await tableUrl(false);
    if (!url) return null;
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `dkey = ${sqlStr(keyOf(pkgKey))}`,
      outFields: ['objectid', 'at', 'payload'],
      returnGeometry: false,
      /* Давхардсан мөр (зэрэгцээ бичилтийн race) — СҮҮЛИЙНХ нь ялна */
      orderByFields: ['objectid ASC'],
    });
    const last = res.features[res.features.length - 1]?.attributes as
      { at?: number; payload?: string } | undefined;
    if (!last?.payload || !Number.isFinite(last.at)) return null;
    return { at: Number(last.at), payload: String(last.payload) };
  } catch (e) {
    throw e;
  }
}

/**
 * АЛСЫН НООРОГИЙН УНШИЛТ — АЛДААГ ЯЛГАДАГ хувилбар (2026-09-07).
 */
export type RemoteDraftRead =
  | { ok: true; draft: RemoteDraft | null }
  | { ok: false; error: string };

export async function readRemoteDraft(pkgKey: string): Promise<RemoteDraftRead> {
  try {
    const d = await readRemoteDraftRaw(pkgKey);
    return { ok: true, draft: d };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * АЛСЫН НООРОГ — байхгүй/алдаа бол `null`.
 */
export async function loadRemoteDraft(pkgKey: string): Promise<RemoteDraft | null> {
  const r = await readRemoteDraft(pkgKey);
  return r.ok ? r.draft : null;
}

/**
 * НООРОГИЙГ АЛСАД БИЧНЭ (upsert). Хэт том, эрхгүй, сүлжээгүй бол `false`.
 */
export type RemoteSave = { ok: true } | { ok: false; error: string; conflict?: boolean };
export type RemoteSaveResult = RemoteSave & { written?: boolean };

/**
 * @param opt.expectAt — ХУВААЛЦСАН нооргийн optimistic lock (2026-09-29 аудит):
 *   дуудагчийн сүүлд уншсан `at`. Серверийн мөрийн `at` зөрвөл (завсарт өөр хүн
 *   бичсэн) ЮУ Ч БИЧИХГҮЙ, `conflict: true` буцаана — дуудагч дахин уншиж нийлүүлнэ.
 *   Урьд нь read→merge→write-ийн завсарт бусдын сүүлийн нүд дарагддаг байв.
 *   `undefined` = хуучин зан (blind overwrite; FillNew-ийн хувийн ноорог).
 */
export async function saveRemoteDraft(
  pkgKey: string,
  at: number,
  payload: string,
  opt?: { expectAt?: number | null },
): Promise<RemoteSaveResult> {
  if (payload.length > REMOTE_MAX) {
    return { ok: false, error: tr('ноорог хэт том ({0} тэмдэгт, дээд {1})', String(payload.length), String(REMOTE_MAX)) };
  }
  if (draftWriteLocked()) {
    return { ok: false, error: tr('систем хаалттай эсвэл эрх түгжигдсэн — ноорог зөвхөн энэ хөтчид, нээгдмэгц хуулагдана') };
  }
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: tr('нэвтрээгүй эсвэл токен дууссан') };
    const url = await tableUrl(true);
    if (!url) {
      return {
        ok: false,
        error: ownerMismatch
          ? tr('«{0}» хүснэгтийн эзэн танигдсангүй — super-т reassign хийнэ үү', TITLE)
          : tr('«{0}» хүснэгт олдсонгүй — super админ нэг удаа нэвтэрч үүсгэнэ', TITLE),
      };
    }
    const fl = await layer(url);
    const dkey = keyOf(pkgKey);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(dkey)}`,
      outFields: ['objectid', 'at'],
      returnGeometry: false,
      orderByFields: ['objectid ASC'],
    });
    const oids = found.features
      .map((f) => f.attributes?.objectid as number)
      .filter((x) => typeof x === 'number');
    const target = oids.length ? oids[oids.length - 1] : null;
    if (opt && opt.expectAt !== undefined) {
      const last = found.features[found.features.length - 1];
      const rowAt = Number(last?.attributes?.at);
      const have = Number.isFinite(rowAt) && rowAt > 0 ? rowAt : 0;
      if (have !== (opt.expectAt ?? 0)) {
        return { ok: false, conflict: true, error: tr('хооронд нь өөр хүн ноорог бичсэн — дахин уншиж нийлүүлнэ') };
      }
    }
    const dupes = oids.slice(0, -1);
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at, payload };
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { objectid: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const res = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    if (!res.length) return { ok: false, error: tr('ArcGIS бичилтийн үр дүн хоосон буцаав') };
    const bad = res.find((x) => x.error != null);
    if (bad) {
      const e = bad.error as { message?: string; description?: string } | undefined;
      return { ok: false, error: tr('ArcGIS татгалзав: {0}', e?.message ?? e?.description ?? String(bad.error)) };
    }
    if (opt && opt.expectAt !== undefined) {
      try {
        const chk = await fl.queryFeatures({
          where: `dkey = ${sqlStr(dkey)}`,
          outFields: ['objectid', 'at'],
          returnGeometry: false,
          orderByFields: ['objectid ASC'],
        });
        const got = Number(chk.features[chk.features.length - 1]?.attributes?.at);
        if (Number.isFinite(got) && got > 0 && got !== at) {
          return { ok: false, conflict: true, written: true, error: tr('хооронд нь өөр хүн ноорог бичсэн — дахин уншиж нийлүүлнэ') };
        }
      } catch { /* шалгалт унасан — бичилт өөрөө амжилттай буусан */ }
    }
    return { ok: true };
  } catch (e) {
    console.error('[selbe] ноорог алсад хадгалагдсангүй:', e);
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * АЛСЫН НООРОГИЙГ УСТГАНА — нийтэлсэн, эсвэл хэрэглэгч «Устгах» дарсан үед.
 */
export async function clearRemoteDraft(pkgKey: string): Promise<boolean> {
  if (draftWriteLocked()) return false;
  try {
    const auth = await getAuth();
    if (!auth) return false;
    const url = await tableUrl(false);
    if (!url) return false;
    const fl = await layer(url);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(keyOf(pkgKey))}`,
      outFields: ['objectid'],
      returnGeometry: false,
    });
    const oids = found.features
      .map((f) => f.attributes?.objectid as number)
      .filter((x) => typeof x === 'number');
    if (!oids.length) return true;
    const r = await fl.applyEdits(
      { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0],
    );
    const dr = r.deleteFeatureResults ?? [];
    return dr.length === oids.length && dr.every((x) => x.error == null);
  } catch {
    return false;
  }
}
