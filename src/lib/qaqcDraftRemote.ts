'use client';

/**
 * «ЧАНАР (QAQC)»-ИЙН НООРОГ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 *
 * ⚠️ ЯАГААД ТУСДАА ФАЙЛ, ТУСДАА ХҮСНЭГТ (2026-09-03, хэрэглэгчийн шийдвэр:
 * «чанарын ноорогт тусдаа draft файл үүсгэ»): урьд нь QAQC хуудас
 * `draftRemote.ts`-ийн `Selbe_Guitsetgel_Draft` хүснэгтийг ХУВААЛЦАЖ, зөвхөн
 * түлхүүрийн `qaqc:` угтвараар ялгагдаж байв. Тэр нь гурван бэрхшээлтэй:
 *   · НЭГ хүснэгтийн мөрийн тоо ба эргэлт ХОЁР ХУУДАСНААС хамаарна —
 *     аль нэгнийх нь ачаалал нөгөөгийнхөө уншилтыг удаашруулна;
 *   · түлхүүрийн угтварыг мартвал (эсвэл нэг үсгээр зөрвөл) хоёр хуудас бие
 *     биеийнхээ ноорогийг ЧИМЭЭГҮЙ дарж эхэлнэ;
 *   · «Гүйцэтгэлийн ноорог» гэсэн хүснэгтэд чанарын өгөгдөл суух нь
 *     админд нүдээр шалгахад төөрөгдүүлнэ.
 *
 * ⚠️ ЯАГААД ХУУЛБАР, нэгдсэн параметртэй модуль БИШ: `draftRemote.ts` нь
 * ХҮСНЭГТИЙН URL-ыг модулийн түвшний хувьсагчид кэшилдэг (`tableUrlCache`,
 * `ownerMismatch`). Хоёр хүснэгтийг нэг модулиар үйлчлүүлэх бол тэр кэшийг
 * түлхүүрээр салгах хэрэгтэй бөгөөд тэр өөрчлөлт нь АМЬД ажиллаж буй
 * гүйцэтгэлийн ноорогийн замыг хөнддөг. Тусдаа файл нь хоёр замыг бүрэн
 * тусгаарлана — энэ файлын алдаа гүйцэтгэлийн бөглөлтөд хүрэхгүй.
 *
 * ⚠️ `localStorage` нь ҮНДСЭН зам ХЭВЭЭР. Энэ модуль зөвхөн ХУУЛБАР хийнэ:
 * сүлжээ унасан, эрх дутсан, хүснэгт үүсээгүй — аль ч тохиолдолд бөглөлт
 * тасрахгүй, ажил алдагдахгүй. Алсын хуулбар нь «өөр төхөөрөмж рүү шилжих»
 * гэсэн ГАНЦ асуудлыг шийднэ. Тиймээс энэ файлын функцууд алдаа ХЭЗЭЭ Ч
 * шидэхгүй — `null`/`false` буцаана.
 *
 * ⚠️ ХАРАГДАХ БАЙДЛЫН ХЯЗГААР (`draftRemote`, `permsRemote`-тэй ижил): хүснэгт
 * нь байгууллагад хуваалцагдсан тул REST-ээр хандах эрхтэй хэн боловч бусдын
 * ноорогийг уншиж чадна. Ноорог нь хадгалагдаагүй актын дугаар — нууц агуулга
 * биш; хатуу тусгаарлалт нь мөрийн эзэмшлийн хяналт шаардах бөгөөд тэр нь
 * админуудын засварлах чадварыг таслана.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БИЧИЛТ НЬ НЭГТГЭЛ — ДАРАЛТ БИШ.
 *    Урьд нь `saveQaqcDraft` мөрийг бүтнээр нь ДАРДАГ байв («сүүлд бичсэн нь
 *    ялна»): хоёр төхөөрөмж ээлжлэн бичихэд нэгнийх нь нүд, мөн нөгөө
 *    төхөөрөмж дээр АРИЛГАСАН нүдний мэдээлэл алга болдог. Одоо бичихээс өмнө
 *    ArcGIS дээрх ноорогийг уншиж НҮД БҮРЭЭР нэгтгэнэ (`qaqcDraft.ts` — агшин ба
 *    булш). Нэгтгэл нь хоосон бол мөрийг устгана — тусдаа «устгах» дуудлага
 *    шаардлагагүй. Энэ табын бичилтүүд ДАРААЛАН явна (`serial`) — эс бөгөөс хоёр
 *    бичилт нэг хуучин хувилбарыг уншаад нэг нь нөгөөгийнхөө нэгтгэлийг дарна.
 *    ХЯЗГААР: өөр ТӨХӨӨРӨМЖИЙН яг тэр агшны бичилттэй (уншаад бичих хооронд —
 *    секундын хэсэг) атомар биш; тэр үед хоцорсон тал дараагийн бичилтээрээ
 *    нөхөгдөнө (нүд бүр агшинтай тул ялагч өөрчлөгдөхгүй).
 */

import { AUTH, ROLE_BY_USER } from './services';
import { t as tr } from '@/lib/i18nCore';
/* ⚠️ `arcgisPost` (2026-09-30): урьд нь ижил утгатай дотоод `req` байв — ArcGIS
   алдаагаа HTTP 200 + `{error}` биеэр буцаадаг тул тэр шалгана (`permsRemote`-ийн
   сургамж); токеныг хүсэлтийн өмнө шинэчилж 498-д нэг удаа дахин оролдоно. */
import { arcgisPost } from '@/lib/authToken';
import { invalidate } from './dataBus';
import {
  mergeQaqcDrafts,
  parseQaqcDraft,
  pruneQaqcDraft,
  serializeQaqcDraft,
  type QaqcDraft,
} from './qaqcDraft';

/** ⚠️ `Selbe_Guitsetgel_Draft`-ААС ӨӨР item — хоёр хуудас огтлолцохгүй. */
const TITLE = 'Selbe_QAQC_Draft';
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
export const QAQC_REMOTE_MAX = 80_000;

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;

/**
 * СЕРВЕРИЙН ЦАГТАЙ ЗӨРӨХ ЗӨРҮҮ (мс) — `qaqcDraft.ts`-ийн «ЦАГИЙН ЗӨРҮҮ».
 *
 * ⚠️ 2026-10-01: нүдний агшин нь төхөөрөмжийн цагаар тавигддаг тул цаг нь
 *    хоцорсон/урагшилсан компьютер нэгтгэлд буруу ялна. Хүснэгтэд Editor
 *    Tracking АСААЛТТАЙ бол (`editFieldsInfo.editDateField`) энэ табын эхний
 *    амжилттай бичилтийн дараа тэр мөрийн серверийн `EditDate`-ийг уншиж
 *    зөрүүг тооцно (сүлжээний хоцролтын тал хүртэлх нарийвчлал). Асаагүй бол
 *    0 хэвээр — зөвхөн Лампорт дүрэм хамгаална. Хүснэгтийн схем ӨӨРЧЛӨГДӨХГҮЙ:
 *    талбар байгаа эсэхийг давхаргын мета-өгөгдлөөс ТАНЬЖ авна.
 */
let clockOffset = 0;
/** Зөрүүг тооцох оролдлого хийгдсэн эсэх — сешнд нэг удаа */
let clockTried = false;

/** Нүдний агшинд хэрэглэх «одоо» — серверийн цагт тааруулсан (боломжтой бол) */
export const qaqcClockNow = (): number => Date.now() + clockOffset;

/** IdentityManager-аас идэвхтэй token + нэвтэрсэн хэрэглэгч */
async function getAuth(): Promise<{ token: string; user: string } | null> {
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
  const search = await arcgisPost(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /* ⚠️ 100 (2026-09-25 аудит, `draftRemote`/`permsRemote`-тэй ижил): 10-т
       ижил гарчигтай бусдын item олон байвал жинхэнэ хүснэгт гадна үлддэг. */
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
    serviceDescription: tr('«Чанар (QAQC)»-ийн хадгалагдаагүй ноорог'),
    hasStaticData: false,
    maxRecordCount: 2000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await arcgisPost(`${restBase()}/content/users/${encodeURIComponent(user)}/createService`, {
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
  await arcgisPost(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  /* Байгууллага даяар — уншихад бүгд, бичихэд ArcGIS-ийн editor эрх шийднэ */
  await arcgisPost(`${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`, {
    token, org: 'true', everyone: 'false',
  });
  return `${serviceUrl}/0`;
}

/**
 * Хүснэгтийн URL — олох, эс бөгөөс (super) үүсгэх.
 * ⚠️ Зөвхөн ОЛДСОН URL кэшлэгдэнэ: `null`-ыг кэшлэвэл порталын хайлтын түр
 *    саат сешн даяар тогтмолжиж, ноорог хэзээ ч алсад очихгүй болно.
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
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
async function layer(url: string): Promise<FeatureLayerInst> {
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

/**
 * «хэрэглэгч|багц» — жижиг үсгээр, SQL-д аюулгүй байхаар хашилт нь давхарлагдана.
 *
 * ⚠️ УГТВАРГҮЙ. Хүснэгт нь өөрөө тусдаа тул `qaqc:` угтвар шаардлагагүй болов;
 *    нэмбэл хуучин угтвартай мөрүүдтэй давхардаж, «хадгалсан ноорог эргэж
 *    ирэхгүй» гэсэн чимээгүй алдаа гарна.
 */
const keyOf = (user: string, pkgKey: string) => `${user.toLowerCase()}|${pkgKey}`;
const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type QaqcRemoteDraft = { at: number; payload: string };

/** ⚠️ Дотоод — алдааг ШИДНЭ. Гадна талын хос нь доор. */
async function readQaqcDraftRaw(pkgKey: string): Promise<QaqcRemoteDraft | null> {
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
      orderByFields: ['OBJECTID ASC'],
    });
    const last = res.features[res.features.length - 1]?.attributes as
      { at?: number; payload?: string } | undefined;
    if (!last?.payload || !Number.isFinite(last.at)) return null;
    /* ⚠️ 2026-10-01: давхардсан мөр (эхний бичилтийн зэрэгцээ race) — урьд нь
       СҮҮЛИЙНХ нь л ялдаг тул нөгөө мөрийн нүд алга болдог байв; одоо НҮД
       БҮРЭЭР нэгтгэнэ. Задрахгүй мөр байвал сүүлийнхийг хэвээр буцаана. */
    if (res.features.length > 1) {
      const now = Date.now();
      let merged: QaqcDraft | null = null;
      for (const f of res.features) {
        const p = (f.attributes as { payload?: unknown } | undefined)?.payload;
        merged = mergeQaqcDrafts(merged, parseQaqcDraft(p, { now }));
      }
      const payload = merged ? serializeQaqcDraft(merged, { now }) : null;
      if (merged && payload) return { at: merged.t, payload };
    }
    return { at: Number(last.at), payload: String(last.payload) };
  } catch (e) {
    /* ⚠️ ШИДНЭ — дээрх `readQaqcDraft` барьж, дуудагчид ЯЛГАЖ хэлнэ */
    throw e;
  }
}

/**
 * АЛСЫН НООРОГИЙН УНШИЛТ — АЛДААГ ЯЛГАДАГ хувилбар (2026-09-07).
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: «ноорог БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг
 * ялгалгүй `null` буцаадаг байв. Сүлжээ түр тасрах, токен шинэчлэгдэх,
 * хүснэгтийн URL олдохгүй байх агшинд дуудагч «ноорог алга» гэж дүгнэж,
 * бөглөгч ХООСОН хуудас хараад ажлаа алдсан гэж боддог — ямар ч алдаа
 * гарахгүй. Тэр ноорог ArcGIS дээр БАЙСААР байна.
 *
 * ⚠️ ЯГ ЭНЭ АНГИЛЛЫН алдааг `submission.ts` (`readActiveSubmission`),
 * `hyanaltStore.ts` ба `hyanaltDetail.ts` дээр 2026-09-04-нд CRITICAL гэж
 * тэмдэглэн зассан — ноорогийн зам ганцаараа хоцорсон байв.
 *
 * ⚠️ Нэвтрээгүй ба хүснэгт үүсээгүй нь АЛДАА БИШ: ноорог зөвхөн локалд
 * байна гэсэн үг тул `{ ok: true, draft: null }`.
 */
export type QaqcRemoteDraftRead =
  | { ok: true; draft: QaqcRemoteDraft | null }
  | { ok: false; error: string };

export async function readQaqcDraft(pkgKey: string): Promise<QaqcRemoteDraftRead> {
  try {
    const d = await readQaqcDraftRaw(pkgKey);
    return { ok: true, draft: d };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * ЭНЭ ТАБЫН АЛСЫН БИЧИЛТИЙН ДАРААЛАЛ — толгойн ⚠️ 2026-10-01.
 * Өмнөх бичилт (амжилттай ч, унасан ч) дууссаны ДАРАА л дараагийнх нь уншина.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = writeChain.then(fn, fn);
  writeChain = p.catch(() => undefined);
  return p;
}

/** Алсын бичилтийн үр дүн — `big` = нүд нь өөрөө талбарт багтахгүй (локалд үлдэнэ) */
export type QaqcDraftWrite = 'ok' | 'big' | 'fail';

/**
 * НООРОГИЙГ АЛСАД БИЧНЭ — ArcGIS дээрхтэй НҮД БҮРЭЭР НЭГТГЭЖ (upsert).
 * Хэт том бол `'big'`, эрхгүй/сүлжээгүй бол `'fail'`; алдаа шидэхгүй.
 * ⚠️ Давхардсан мөрийг ЦЭВЭРЛЭНЭ (агуулгыг нь нэгтгэсний дараа) — эс бөгөөс
 *    уншилт хуучин мөрийг сонгож «хадгалсан ч эргэж ирэхгүй» гэсэн чимээгүй
 *    алдаа үүсгэнэ.
 * ⚠️ 2026-10-01: нэгтгэл ХООСОН (амьд нүдгүй, хүчинтэй булшгүй) бол мөрийг
 *    УСТГАНА — урьдын `clearQaqcDraft`-ийн үүрэг; гэхдээ өөр төхөөрөмжийн
 *    хараахан хадгалаагүй нүд байвал тэр нь нэгтгэлд үлдэх тул УСТАХГҮЙ.
 */
export function saveQaqcDraft(pkgKey: string, draft: QaqcDraft): Promise<QaqcDraftWrite> {
  return serial(() => writeQaqcDraft(pkgKey, draft));
}

async function writeQaqcDraft(pkgKey: string, draft: QaqcDraft): Promise<QaqcDraftWrite> {
  try {
    const auth = await getAuth();
    if (!auth) return 'fail';
    const url = await tableUrl(true);
    if (!url) return 'fail';
    const fl = await layer(url);
    const dkey = keyOf(auth.user, pkgKey);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(dkey)}`,
      outFields: ['OBJECTID', 'payload'],
      returnGeometry: false,
      orderByFields: ['OBJECTID ASC'],
    });
    const oids = found.features
      .map((f) => f.attributes?.OBJECTID as number)
      .filter((x) => typeof x === 'number');
    /* ⚠️ 2026-10-01: ДАРАХГҮЙ — ArcGIS дээрх (давхардсан мөрүүд ч) ноорогтой нэгтгэнэ */
    const now = Date.now();
    let merged: QaqcDraft | null = draft;
    for (const f of found.features) {
      const p = (f.attributes as { payload?: unknown } | undefined)?.payload;
      merged = mergeQaqcDrafts(merged, parseQaqcDraft(p, { now }));
    }
    merged = pruneQaqcDraft(merged, now);
    if (!merged) {
      /* Юу ч үлдээгүй — мөрийг (байвал) устгана */
      if (!oids.length) return 'ok';
      const r = await fl.applyEdits(
        { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0],
      );
      const dr = r.deleteFeatureResults ?? [];
      const gone = dr.length === oids.length && dr.every((x) => x.error == null);
      if (gone) invalidate('QAQC_DRAFT');
      return gone ? 'ok' : 'fail';
    }
    const payload = serializeQaqcDraft(merged, { now, maxLen: QAQC_REMOTE_MAX });
    if (payload == null) return 'big';
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: merged.t, payload };
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const t0 = Date.now();
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const t1 = Date.now();
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    const saved = ok.length > 0 && ok.every((x) => x.error == null);
    if (saved) {
      invalidate('QAQC_DRAFT');
      const oid = target ?? (ok[0]?.objectId as number | undefined);
      if (typeof oid === 'number') await learnClockOffset(fl, oid, (t0 + t1) / 2);
    }
    return saved ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

/**
 * Серверийн `EditDate`-ээс энэ төхөөрөмжийн цагийн зөрүүг тооцно (сешнд нэг
 * удаа; `clockOffset`-ийн ⚠️). Editor Tracking асаагүй бол юу ч хийхгүй.
 * ⚠️ Алдаа ЗАЛГИНА — бичилт аль хэдийн амжилттай; зөрүү нь нэмэлт тав тух.
 */
async function learnClockOffset(
  fl: FeatureLayerInst,
  oid: number,
  localMid: number,
): Promise<void> {
  if (clockTried) return;
  clockTried = true;
  try {
    await fl.load();
    const f = fl.editFieldsInfo?.editDateField;
    if (!f) return;
    const q = await fl.queryFeatures({ objectIds: [oid], outFields: [f], returnGeometry: false });
    const ed = Number((q.features[0]?.attributes as Record<string, unknown> | undefined)?.[f]);
    if (Number.isFinite(ed) && ed > 0) clockOffset = Math.round(ed - localMid);
  } catch {
    /* зөрүүгүйгээр (0) үргэлжилнэ */
  }
}

/**
 * АЛСЫН НООРОГИЙГ БҮРЭН УСТГАНА.
 * ⚠️ 2026-10-01: `Qaqc.tsx` үүнийг ДУУДАХАА БОЛИВ — устгах нь булшгүй тул өөр
 *    төхөөрөмжийн хуучин ноорог арилгасан нүдийг буцааж амилуулдаг байв
 *    (`saveQaqcDraft` одоо хоосон нэгтгэлийг өөрөө устгана). Админ/цэвэрлэгээнд
 *    үлдээв; энэ табын бичилтийн дараалалд (`serial`) орно.
 * ⚠️ Түлхүүрт таарах БҮХ мөрийг устгана (давхардлыг ч) — үлдсэн мөр дараагийн
 *    ачаалалтад «хадгалаагүй ажил байна» гэж ХУДЛАА сануулна.
 */
export function clearQaqcDraft(pkgKey: string): Promise<boolean> {
  return serial(() => clearQaqcDraftNow(pkgKey));
}

async function clearQaqcDraftNow(pkgKey: string): Promise<boolean> {
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
    /* ⚠️ 2026-09-25: хоосон/дутуу хариу ≠ амжилт — ArcGIS алдаагаа 200-аар буцаадаг тул тоо нь oid-тай тэнцэх ёстой */
    const dr = r.deleteFeatureResults ?? [];
    const gone = dr.length === oids.length && dr.every((x) => x.error == null);
    if (gone) invalidate('QAQC_DRAFT');
    return gone;
  } catch {
    return false;
  }
}
