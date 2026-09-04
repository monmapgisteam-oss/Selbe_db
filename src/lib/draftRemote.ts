'use client';

/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ИЙН НООРОГ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 *
 * ⚠️ ЯАГААД (2026-09-03, хэрэглэгч: «өөр browser, өөр газраас орход ч draft
 * хадгалагдаж байх ёстой»): ноорог нь зөвхөн `localStorage`-д байсан тул
 * оффисын компьютер дээр бөглөсөн ажил гэрийн компьютерт ОГТ харагдахгүй,
 * хөтчийн өгөгдөл цэвэрлэхэд бүрмөсөн алга болдог байв.
 *
 * ⚠️ ЗӨВХӨН ГҮЙЦЭТГЭЛД. Хэрэглэгчийн шийдвэрээр тусдаа хадгалалт: эрхийн
 * `Selbe_Permissions` хүснэгтэд оруулаагүй. Ноорог нь 10–15 секунд тутам
 * дахин бичигддэг ӨНДӨР ЭРГЭЛТТЭЙ өгөгдөл, харин эрхийн хүснэгт нэвтрэлт
 * бүрд уншигддаг — хоёрыг нэг хүснэгтэд хийвэл нэг нь нөгөөгөө удаашруулна.
 *
 * ⚠️ `localStorage` нь ҮНДСЭН зам ХЭВЭЭР. Энэ модуль зөвхөн ХУУЛБАР хийнэ:
 * сүлжээ унасан, эрх дутсан, хүснэгт үүсээгүй — аль ч тохиолдолд бөглөлт
 * тасрахгүй, ажил алдагдахгүй. Алсын хуулбар нь «өөр төхөөрөмж рүү шилжих»
 * гэсэн ГАНЦ асуудлыг шийднэ.
 *
 * ⚠️ ХАРАГДАХ БАЙДЛЫН ХЯЗГААР (баримтжуулсан, `permsRemote`-тэй ижил): хүснэгт
 * нь байгууллагад хуваалцагдсан тул REST-ээр хандах эрхтэй хэн боловч бусдын
 * ноорогийг уншиж чадна. Ноорог нь нийтлэгдээгүй ажлын тоо — нууц агуулга
 * биш; хатуу тусгаарлалт нь мөрийн эзэмшлийн хяналт (ownership-based access)
 * шаардах бөгөөд тэр нь админуудын засварлах чадварыг таслана.
 */

import { AUTH, ROLE_BY_USER } from './services';
import { t as tr } from '@/lib/i18nCore';

const TITLE = 'Selbe_Guitsetgel_Draft';
const TABLE_NAME = 'drafts';

/**
 * ХАДГАЛАХ ДЭЭД ХЭМЖЭЭ (тэмдэгт). Талбарын урт 100,000 тул түүнээс доогуур
 * барина — үлдсэн зай нь JSON-ы escape-д (кирилл тэмдэгт `\uXXXX` болж
 * 6 дахин сунаж болно) нөөц.
 *
 * ⚠️ Хэтэрсэн ноорог алсад ЯВАХГҮЙ, локалд ҮЛДЭНЭ. Чимээгүй таслах нь
 * хамгийн муу зан: хэрэглэгч «хадгалагдсан» гэж бодоод өөр машин дээр
 * хагас ноорог хүлээж авна.
 */
export const REMOTE_MAX = 80_000;

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;

/** IdentityManager-аас идэвхтэй token + нэвтэрсэн хэрэглэгч */
export async function getAuth(): Promise<{ token: string; user: string } | null> {
  try {
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
 * ⚠️ ArcGIS алдаагаа HTTP 200 + `{error:{...}}` биеэр буцаадаг — `res.ok`
 *    хангалтгүй. Шалгахгүй бол хагас дутуу хүснэгт үүсгээд URL-ыг нь
 *    кэшилнэ (`permsRemote`-ийн баримтжуулсан сургамж).
 */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  const r = await fetch(url, { method: 'POST', body });
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хүснэгтийг үүсгэж болох (ба эзэмших) эрхтэй хүмүүс — хатуу тохиргооны super */
const TABLE_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);

/**
 * Хүснэгтийн URL — байгаа item-ээс.
 * ⚠️ ЭЗНИЙГ ШАЛГАНА: org доторх хэн боловч ижил нэртэй item үүсгэж чадна.
 *    Эзэн нь танигдахгүй бол ноорог тэр рүү бичигдэх ёсгүй.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '10',
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
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
        /* Мөрийн ганц түлхүүр — «хэрэглэгч|багц». Хоёр хүн нэг багц бөглөж
           байвал ноороги нь ТУСДАА байх ёстой тул нэр нь түлхүүрт орно. */
        { name: 'dkey', type: 'esriFieldTypeString', length: 512, nullable: false, editable: true },
        /* Задалсан хэсгүүд — зөвхөн админ хүснэгтийг нүдээр шалгахад */
        { name: 'usr', type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        { name: 'pkg', type: 'esriFieldTypeString', length: 256, nullable: true, editable: true },
        /* ⚠️ Огноо БИШ `Double`: epoch мс. Date талбар нь цагийн бүсээр
           хөрвүүлэгддэг тул «аль нь шинэ вэ» гэдэг харьцуулалт эргэлзээтэй
           болно — ноорог сонгоход ЯГ энэ харьцуулалт шийдвэрлэнэ. */
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
 * ⚠️ Зөвхөн ОЛДСОН URL кэшлэгдэнэ: `null`-ыг кэшлэвэл порталын хайлтын түр
 *    саат сешн даяар тогтмолжиж, ноорог хэзээ ч алсад очихгүй болно.
 */
export async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
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
export async function layer(url: string): Promise<FeatureLayerInst> {
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

/** «хэрэглэгч|багц» — жижиг үсгээр, SQL-д аюулгүй байхаар хашилт нь давхарлагдана */
const keyOf = (user: string, pkgKey: string) => `${user.toLowerCase()}|${pkgKey}`;
export const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type RemoteDraft = { at: number; payload: string };

/**
 * АЛСЫН НООРОГ — байхгүй/алдаа бол `null`.
 * ⚠️ Алдаа ХЭЗЭЭ Ч шидэхгүй: энэ нь нэмэлт тав тух, бөглөлтийн зам биш.
 */
export async function loadRemoteDraft(pkgKey: string): Promise<RemoteDraft | null> {
  try {
    const auth = await getAuth();
    if (!auth) return null;
    const url = await tableUrl(false);
    if (!url) return null;
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `dkey = ${sqlStr(keyOf(auth.user, pkgKey))}`,
      outFields: ['OBJECTID', 'at', 'payload'],
      returnGeometry: false,
      /* Давхардсан мөр (зэрэгцээ бичилтийн race) — СҮҮЛИЙНХ нь ялна */
      orderByFields: ['OBJECTID ASC'],
    });
    const last = res.features[res.features.length - 1]?.attributes as
      { at?: number; payload?: string } | undefined;
    if (!last?.payload || !Number.isFinite(last.at)) return null;
    return { at: Number(last.at), payload: String(last.payload) };
  } catch {
    return null;
  }
}

/**
 * НООРОГИЙГ АЛСАД БИЧНЭ (upsert). Хэт том, эрхгүй, сүлжээгүй бол `false`.
 * ⚠️ Давхардсан мөрийг ЦЭВЭРЛЭНЭ — эс бөгөөс уншилт хуучин мөрийг сонгож
 *    «хадгалсан ч эргэж ирэхгүй» гэсэн чимээгүй алдаа үүсгэнэ.
 */
export async function saveRemoteDraft(
  pkgKey: string,
  at: number,
  payload: string,
): Promise<boolean> {
  if (payload.length > REMOTE_MAX) return false;
  try {
    const auth = await getAuth();
    if (!auth) return false;
    const url = await tableUrl(true);
    if (!url) return false;
    const fl = await layer(url);
    const dkey = keyOf(auth.user, pkgKey);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(dkey)}`,
      outFields: ['OBJECTID'],
      returnGeometry: false,
      orderByFields: ['OBJECTID ASC'],
    });
    const oids = found.features
      .map((f) => f.attributes?.OBJECTID as number)
      .filter((x) => typeof x === 'number');
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at, payload };
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    return ok.length > 0 && ok.every((x) => x.error == null);
  } catch {
    return false;
  }
}

/**
 * АЛСЫН НООРОГИЙГ УСТГАНА — нийтэлсэн, эсвэл хэрэглэгч «Устгах» дарсан үед.
 * ⚠️ Түлхүүрт таарах БҮХ мөрийг устгана (давхардлыг ч) — үлдсэн мөр дараагийн
 *    ачаалалтад «нийтлэгдээгүй ажил байна» гэж ХУДЛАА сануулна.
 */
export async function clearRemoteDraft(pkgKey: string): Promise<boolean> {
  try {
    const auth = await getAuth();
    if (!auth) return false;
    const url = await tableUrl(false);
    if (!url) return false;
    const fl = await layer(url);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(keyOf(auth.user, pkgKey))}`,
      outFields: ['OBJECTID'],
      returnGeometry: false,
    });
    const oids = found.features
      .map((f) => f.attributes?.OBJECTID as number)
      .filter((x) => typeof x === 'number');
    if (!oids.length) return true;
    const r = await fl.applyEdits(
      { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0],
    );
    return (r.deleteFeatureResults ?? []).every((x) => x.error == null);
  } catch {
    return false;
  }
}
