/**
 * ENTERPRISE ЗУРАГЛАЛ — AGOL үйлчилгээний хаягийг Сэлбэ Enterprise-ийн hosted үйлчилгээ рүү
 * НЭГ ДОРООС шилжүүлнэ, мөн Enterprise-ийн ЖИЖИГ ҮСЭГТЭЙ талбарын нэрийг кодын эх нэртэй
 * хоёр чиглэлд хөрвүүлнэ (2026-10-20, нийслэлийн дата төв рүү БҮРЭН шилжилт).
 *
 * ⚠️ ЯАГААД ЭНД, ТАРААЖ БИШ: кодод ~45 AGOL үйлчилгээ · 225 давхарга/хүснэгт
 *    `${HJ}/<нэр>/FeatureServer/<№>` хэлбэрээр ~90 газар бичигдсэн. Enterprise-д нийтлэхэд
 *    үйлчилгээний нэр ч, давхаргын дугаар ч өөрчлөгддөг (AGOL-ын /193 · /199 · /205 г.м. дугаар
 *    Pro-оос нийтлэхэд 0..n болно). Тиймээс хаяг бүрийг гараар солихын оронд ГАНЦ хүснэгтээр
 *    (`entMap.data.ts` — `tools/entMap-build.mjs` үүсгэнэ)
 *    `(AGOL үйлчилгээ, давхарга №) → (Enterprise үйлчилгээ, давхарга №)` зураглана.
 *    `HJ`/`TD`/`INFRA_SVC` (env `NEXT_PUBLIC_ARCGIS_HJ` · `…_GAZAR`) нь ОДОО ЗӨВХӨН ТҮЛХҮҮРИЙН
 *    СУУРЬ — тэдгээр хаяг руу сүлжээний хүсэлт ХЭЗЭЭ Ч явахгүй (`query.run` зураглалгүй AGOL хаягийг
 *    ИЛ алдаагаар татгалзана — чимээгүй AGOL руу буцах зам байхгүй).
 *
 * ⚠️ ТАЛБАРЫН НЭР — Enterprise (relational data store · PostgreSQL) нь нийтлэхдээ талбарын нэрийг
 *    БҮГДИЙГ ЖИЖИГ ҮСЭГ болгодог (`BAGTS`→`bagts`, `Work_Status`→`work_status`, `OBJECTID`→`objectid`).
 *    Амьд шалгалт (2026-10-20): `where` · `returnCountOnly` · `outStatistics`/`groupBy` том үсгийг
 *    хүлээн авна, харин `outFields` · `orderByFields` · `applyEdits`-ийн атрибутын түлхүүр ЗААВАЛ
 *    жижиг үсэг (эс бөгөөс 500 «Field name 'BAGTS' does not exist»), хариултын түлхүүр үргэлж
 *    жижиг. Код 23 модульд эх нэрээр (`row.BAGTS`) ханддаг тул:
 *      · ХҮСЭЛТ (`entRequestWith`): outFields · orderByFields · groupBy · outStatistics · adds/updates
 *        → Enterprise нэр; `where`-д зөвхөн НЭР НЬ ӨӨРЧЛӨГДСӨН талбар (`FID`→`objectid`,
 *        `EditDate`→`last_edited_date`) солигдоно;
 *      · ХАРИУ (`entResponseWith`): features[].attributes · fields[].name · objectIdFieldName ·
 *        editFieldsInfo → эх нэр: эхлээд ДУУДАГЧИЙН БИЧСЭН `outFields`-ийн үсэг (код тэр нэрээр уншина),
 *        дараа нь `ENT_FIELDS` толь (AGOL-ын эх нэрс, `tools/entMap-build.mjs` + `tools/agol-fields.py`),
 *        аль нь ч байхгүй бол хэвээр (жижиг).
 *    Хэрэглэх цэг: REST-ийн ганц цөм (`query.attemptRequest`) ба JS API-ийн `esriConfig.request.interceptors`
 *    (`lib/entInterceptor.ts` — давхаргын мета, асуулга, applyEdits; мета дээр `supportedQueryFormats`-ыг
 *    JSON болгож PBF-ийг хаана — PBF хариуг хөрвүүлэх боломжгүй).
 * ⚠️ OID ба засварын мөшгөлт: AGOL-ын `FID`/`OBJECTID` → Enterprise `objectid`; AGOL-ын
 *    `CreationDate/Creator/EditDate/Editor` → Enterprise-ийн АМЬД `created_date/created_user/
 *    last_edited_date/last_edited_user` (`ENT_FIELDS[*].ren`). gdb-ээс хуулагдсан хуучин
 *    `creationdate…` баганууд (хөдөлгөөнгүй хуулбар) кодоос ХАРАГДАХГҮЙ — «сүүлд хэн/хэзээ зассан»
 *    гэдэг утга нь амьд талбарт л үнэн.
 *
 * ⚠️ ХЭРЭГЛЭХ ЦЭГҮҮД (бүгд энэ модулиар):
 *    · `query.run` — REST хүсэлт бүрийн ганц цөм (`remapUrl` + талбарын хөрвүүлэлт);
 *    · `layers.layerUrl` — газрын зургийн давхарга (JS API FeatureLayer) ба түүгээр асуудаг бүх зам;
 *    · `MapCanvas`-ийн шууд `url`-тай цөөн давхарга (иргэдийн үр өгөөж · 3D);
 *    · порталын item ХАЙЛТААР олддог хүснэгтүүд (`entDirect`): permsRemote · draftRemote ·
 *      qaqcDraftRemote · huvaariBatlah · obyemBatlah · ajilBatlah · chanarStore — зураглалд байвал
 *      хайлт/үүсгэлтгүй шууд (AGOL-ын item хайлт Enterprise-д утгагүй).
 *
 * ⚠️ `NEXT_PUBLIC_ENT_DATA` ЗААВАЛ (`req`) — хоосон бол ачаалахад ил алдаа (AGOL руу буцах горим БАЙХГҮЙ,
 *    хэрэглэгчийн 2026-10-20-ны шийдвэр: «AGOL датаг бүрэн хая»).
 * ⚠️ `styleUrl` (webmap-загварын ТҮЛХҮҮР) зураглагдахгүй — тэр нь хаяг биш, түлхүүр.
 */
import { HJ, TD, ENT_HOSTED } from './env';
import { ENT_MAP, ENT_FIELDS, type EntFieldsRec } from './entMap.data';

/**
 * Enterprise hosted үйлчилгээний суурь (`…/map/rest/services/Hosted`) — ЗААВАЛ.
 * ⚠️ `SELBE_ENT_OFF=1` — ЗӨВХӨН Node-ийн нэгж тест (`tools/test-all.mjs` тавина): тестүүдийн хуурамч хүснэгт/fetch
 *    AGOL хэлбэрийн хаягаар бичигдсэн тул зураглалыг унтраана. `NEXT_PUBLIC_` биш тул хөтчийн багцад ОГТ шингэхгүй
 *    (Next.js зөвхөн `NEXT_PUBLIC_*`-ийг шингээдэг) — production-д энэ зам байхгүй. Зураглалын цэвэр функцүүд
 *    `entMap.check.mjs`-д тусдаа шалгагдана.
 */
const ENT_OFF = process.env.SELBE_ENT_OFF === '1';
export const ENT_DATA = ENT_OFF ? '' : ENT_HOSTED;

/** `TD` = `${GAZAR суурь}/SELBE_ALL_DATA_last_0917/FeatureServer` — сүүлийн үйлчилгээг хасаж суурийг авна */
const GAZAR_BASE = TD.replace(/\/[^/]+\/FeatureServer$/i, '');
/** AGOL-ын (түлхүүрийн) суурь хаягууд — зөвхөн эдгээрээс эхэлсэн хаяг зураглагдана (UBHUB · Enterprise хөндөгдөхгүй) */
export const AGOL_BASES: readonly string[] = [...new Set([HJ, GAZAR_BASE].filter(Boolean))];

/** `<үйлчилгээ>/FeatureServer[/<№>][сүүл]` — сүүл нь `/query` · `/applyEdits` · `?f=json` · `/12/attachments` г.м. */
const SVC_RE = /^([^/?#]+)\/FeatureServer(?:\/(\d+))?(.*)$/i;

/** Кодод зарим үйлчилгээ percent-encoded (`Инженерийн_дэд_бүтэц…`, `Цамхагт_кран`) — түлхүүр нь decode хэлбэрээр */
const dec = (s: string): string => {
  try { return decodeURIComponent(s); } catch { return s; }
};

export type EntMap = Readonly<Record<string, string>>;

const entLayerUrl = (entBase: string, to: string): string => {
  const cut = to.lastIndexOf('/');
  return `${entBase}/${encodeURIComponent(to.slice(0, cut))}/FeatureServer/${to.slice(cut + 1)}`;
};

/**
 * ЦЭВЭР зураглал — `remapUrl` нь орчны утгатай бүрхүүл (тест энэ функцийг шалгана).
 * Зураглалгүй/AGOL биш/`entBase` хоосон бол хаяг ХЭВЭЭР.
 */
export function remapWith(url: string, map: EntMap, entBase: string, agolBases: readonly string[]): string {
  if (!entBase || !url) return url;
  for (const base of agolBases) {
    if (!base || !url.startsWith(`${base}/`)) continue;
    const m = SVC_RE.exec(url.slice(base.length + 1));
    if (!m) return url;
    const svc = dec(m[1]);
    const tail = m[3] ?? '';
    if (m[2] != null) {
      const to = map[`${svc}/${m[2]}`];
      return to ? `${entLayerUrl(entBase, to)}${tail}` : url;
    }
    const whole = map[`${svc}/*`];
    return whole ? `${entBase}/${encodeURIComponent(whole)}/FeatureServer${tail}` : url;
  }
  return url;
}

/** AGOL (түлхүүрийн) хаяг → Enterprise хаяг (зураглалд байвал), эс бөгөөс хэвээр */
export const remapUrl = (url: string): string => remapWith(url, ENT_MAP, ENT_DATA, AGOL_BASES);

/** AGOL-ын түлхүүрийн суурь дор байгаа хаяг уу — `query.run` зураглагдаагүй үлдвэл ил алдаа */
export const isAgolUrl = (url: string): boolean => !!ENT_DATA && AGOL_BASES.some((b) => !!b && url.startsWith(`${b}/`));

/** Enterprise ӨГӨГДЛИЙН хаяг уу (зураглалын суурь дор) — токены сонголт ба талбарын хөрвүүлэлт */
export const isEntDataUrl = (url: string): boolean => !!ENT_DATA && url.startsWith(`${ENT_DATA}/`);

/** Цэвэр хувилбар — `entDirect`-ийн тест */
export function entDirectWith(svc: string, id: number, map: EntMap, entBase: string): string | null {
  if (!entBase) return null;
  const to = map[`${svc}/${id}`];
  return to ? entLayerUrl(entBase, to) : null;
}

/** Порталын хайлтаар олддог хүснэгтэд — зураглалд байвал Enterprise-ийн БҮТЭН хаяг, үгүй бол `null` */
export const entDirect = (svc: string, id: number): string | null => entDirectWith(svc, id, ENT_MAP, ENT_DATA);

/**
 * УРВУУ зураглал: Enterprise давхаргын дугаар → AGOL (түлхүүрийн) дугаар — `loadInfra` (`planOverlap.ts`) үйлчилгээний
 * МЕТАНААС давхаргуудаа уншдаг. Enterprise-д хэд хэдэн AGOL үйлчилгээ НЭГ үйлчилгээнд (`Bagts_ajluud`, 198 давхарга)
 * багтсан, дугаар нь ӨӨР. Кодын `infra:N` түлхүүр (LAYER_BY_ID · groups.ts · MapCanvas) AGOL дугаараар тул буцаана;
 * тухайн AGOL үйлчилгээнд ХАМААРАХГҮЙ давхаргад `null` (дуудагч алгасна). Зураглал хоосон (тест) эсвэл үйлчилгээ
 * зураглалгүй бол дугаар ХЭВЭЭР (хаяг ч хэвээр үлддэг тул мета AGOL-ынх).
 */
export function agolLayerIdWith(agolSvcUrl: string, entId: number, map: EntMap, entBase: string, agolBases: readonly string[]): number | null {
  if (!entBase) return entId;
  const base = agolBases.find((b) => !!b && agolSvcUrl.startsWith(`${b}/`));
  if (!base) return entId;
  const m = SVC_RE.exec(agolSvcUrl.slice(base.length + 1));
  if (!m) return entId;
  const svc = dec(m[1]);
  const whole = map[`${svc}/*`];
  if (!whole) return entId;
  const want = `${whole}/${entId}`;
  const prefix = `${svc}/`;
  for (const [k, v] of Object.entries(map)) {
    if (v !== want || !k.startsWith(prefix)) continue;
    const n = Number(k.slice(prefix.length));
    if (Number.isInteger(n)) return n;
  }
  return null;
}
export const agolLayerId = (agolSvcUrl: string, entId: number): number | null => agolLayerIdWith(agolSvcUrl, entId, ENT_MAP, ENT_DATA, AGOL_BASES);

/** Зураглалын хэмжээ — оношилгоо */
export const entMapSize = (): number => Object.keys(ENT_MAP).length;

/* ══════════════════ ТАЛБАРЫН НЭРИЙН ХӨРВҮҮЛЭЛТ ══════════════════ */

/** Нэг давхаргын толь: AGOL нэр (жижиг) → Enterprise нэр · Enterprise нэр → AGOL эх нэр */
export type EntDict = { toEnt: Map<string, string>; toOrig: Map<string, string> };

/** `ENT_FIELDS`-ийн нэг бичлэгээс толь (цэвэр — тест) */
export function entDictFor(rec: EntFieldsRec | undefined): EntDict | null {
  if (!rec) return null;
  const toEnt = new Map<string, string>();
  const toOrig = new Map<string, string>();
  for (const f of rec.f) {
    const lo = f.toLowerCase();
    const ent = rec.ren?.[lo] ?? lo;
    toEnt.set(lo, ent);
    if (!toOrig.has(ent)) toOrig.set(ent, f);
  }
  return { toEnt, toOrig };
}

/** Enterprise давхаргын хаяг → `<үйлчилгээ>/<№>` түлхүүр (decode) — `ENT_FIELDS`-ийн түлхүүр */
export function entKeyOf(url: string): string | null {
  if (!isEntDataUrl(url)) return null;
  const m = SVC_RE.exec(url.slice(ENT_DATA.length + 1));
  return m && m[2] != null ? `${dec(m[1])}/${m[2]}` : null;
}

const dictCache = new Map<string, EntDict | null>();
/** Хаягийн давхаргын толь (`ENT_FIELDS`); толь байхгүй давхаргад `null` — зөвхөн жижиг үсэг + дуудагчийн үсэг */
export function entDict(url: string): EntDict | null {
  const k = entKeyOf(url);
  if (!k) return null;
  let d = dictCache.get(k);
  if (d === undefined) {
    d = entDictFor(ENT_FIELDS[k]);
    dictCache.set(k, d);
  }
  return d;
}

/**
 * ГЕОМЕТРИЙН СИСТЕМИЙН ТАЛБАР — Enterprise (PostgreSQL) дээр `SHAPE__Area` · `SHAPE__Length` (ТОМ `SHAPE`, амьд
 * `geometryProperties` 2026-10-20). Жижиг үсэг болговол «field does not exist» → кодын `Shape__Area` эндээс хөрвөнө.
 * ⚠️ Эх SR нь UTM 48N (32648) тул утга нь бодит м²/м (AGOL-ынхтой ижил).
 */
const SYS_ENT: Readonly<Record<string, string>> = { shape__area: 'SHAPE__Area', shape__length: 'SHAPE__Length' };
const SYS_ORIG: Readonly<Record<string, string>> = { SHAPE__Area: 'Shape__Area', SHAPE__Length: 'Shape__Length' };

/** Кодын талбарын нэр → Enterprise-ийн нэр (толь → геометрийн системийн талбар → жижиг үсэг) */
export const entFieldName = (name: string, d: EntDict | null): string => {
  const lo = name.trim().toLowerCase();
  return d?.toEnt.get(lo) ?? SYS_ENT[lo] ?? lo;
};

/** SQL литерал (`'…'`, `''` дотоод хашилттай) эсвэл таних тэмдэг (латин · кирилл · `_` · тоо) */
const WHERE_TOKEN = /'(?:[^']|'')*'|[A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*/g;

/**
 * `where` доторх ТОЛИНД БАЙГАА талбар бүрийг Enterprise нэр рүү солино (`FID` → `objectid`, `EditDate` →
 * `last_edited_date`, `Талб_1` → `талб_1`, `BAGTS` → `bagts`).
 * ⚠️ 2026-10-20 (амьд шалгалт, «Газар чөлөөлөлт» «Database error»): Enterprise `where`-д ЛАТИН нэрийн том/жижиг
 *    үсгийг ялгадаггүй ч КИРИЛЛ нэрийг ялгадаг — `Талб_1 IS NOT NULL` → 500 «Database error has occurred»,
 *    `талб_1` → OK. Тиймээс толинд байгаа БҮХ талбарыг (зөвхөн нэр өөрчлөгдсөнийг биш) солино.
 *    SQL түлхүүр үг · функц (`AND` · `UPPER`) · `N'…'`-ийн `N` · литерал доторх текст нь толинд байхгүй/хөндөгдөхгүй.
 */
export function entWhereWith(where: string, d: EntDict | null): string {
  if (!d) return where;
  return where.replace(WHERE_TOKEN, (tok) => {
    if (tok.startsWith("'")) return tok;
    return d.toEnt.get(tok.toLowerCase()) ?? tok;
  });
}

const mapList = (s: string, d: EntDict | null): string =>
  s.split(',').map((x) => (x.trim() === '*' ? '*' : entFieldName(x, d))).join(',');

const mapOrder = (s: string, d: EntDict | null): string =>
  s.split(',').map((x) => {
    const m = /^\s*(\S+)(\s+(?:ASC|DESC))?\s*$/i.exec(x);
    return m ? `${entFieldName(m[1], d)}${m[2] ?? ''}` : x;
  }).join(',');

/** Атрибутын түлхүүрүүд → Enterprise нэр (`applyEdits` · `addFeatures`) */
export const entAttrsWith = (attrs: Record<string, unknown>, d: EntDict | null): Record<string, unknown> =>
  Object.fromEntries(Object.entries(attrs).map(([k, v]) => [entFieldName(k, d), v]));

const mapFeaturesJson = (s: string, d: EntDict | null): string => {
  try {
    const arr = JSON.parse(s) as unknown;
    if (!Array.isArray(arr)) return s;
    for (const f of arr as { attributes?: Record<string, unknown> }[]) {
      if (f && f.attributes && typeof f.attributes === 'object') f.attributes = entAttrsWith(f.attributes, d);
    }
    return JSON.stringify(arr);
  } catch {
    return s;
  }
};

/**
 * REST ХҮСЭЛТИЙН параметрүүд → Enterprise-ийн талбарын нэр (цэвэр — тест).
 * outFields · orderByFields · groupByFieldsForStatistics · outStatistics.onStatisticField · where (зөвхөн
 * нэр өөрчлөгдсөн) · adds/updates/features (атрибутын түлхүүр). Бусад параметр хэвээр.
 */
export function entRequestWith(params: Record<string, string>, d: EntDict | null): Record<string, string> {
  const out: Record<string, string> = { ...params };
  if (out.outFields) out.outFields = mapList(out.outFields, d);
  if (out.orderByFields) out.orderByFields = mapOrder(out.orderByFields, d);
  if (out.groupByFieldsForStatistics) out.groupByFieldsForStatistics = mapList(out.groupByFieldsForStatistics, d);
  if (out.outStatistics) {
    try {
      const st = JSON.parse(out.outStatistics) as unknown;
      if (Array.isArray(st)) {
        for (const s of st as { onStatisticField?: unknown }[]) {
          if (s && typeof s.onStatisticField === 'string') s.onStatisticField = entFieldName(s.onStatisticField, d);
        }
        out.outStatistics = JSON.stringify(st);
      }
    } catch { /* JSON биш — хэвээр */ }
  }
  if (out.where) out.where = entWhereWith(out.where, d);
  for (const k of ['adds', 'updates', 'features'] as const) if (out[k]) out[k] = mapFeaturesJson(out[k], d);
  return out;
}

/** Дуудагчийн `outFields`-ийн ҮСЭГ — хариултын түлхүүрийг тэр нэр рүү буцаана (`*`-ыг тооцохгүй) */
export const requestedFields = (params: Record<string, string>): string[] =>
  (params.outFields ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '*');

type Keyed = Record<string, unknown>;
const renameKeys = (o: Keyed, f: (k: string) => string): Keyed =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

/**
 * REST ХАРИУ → кодын эх нэр (цэвэр — тест). `body`-г ГАЗАР ДЭЭР НЬ засаж буцаана (шинэ JSON тул аюулгүй).
 * Эрэмбэ: дуудагчийн бичсэн үсэг (`requested`) → `ENT_FIELDS` толь → хэвээр.
 */
export function entResponseWith<T extends Keyed>(body: T, d: EntDict | null, requested: readonly string[] = []): T {
  const back = new Map<string, string>();
  for (const r of requested) back.set(entFieldName(r, d), r.trim());
  const orig = (k: string): string => back.get(k) ?? d?.toOrig.get(k) ?? SYS_ORIG[k] ?? k;
  const b = body as Keyed;
  if (Array.isArray(b.features)) {
    for (const f of b.features as { attributes?: Keyed }[]) {
      if (f && f.attributes && typeof f.attributes === 'object') f.attributes = renameKeys(f.attributes, orig);
    }
  }
  if (Array.isArray(b.fields)) {
    for (const f of b.fields as { name?: unknown }[]) if (f && typeof f.name === 'string') f.name = orig(f.name);
  }
  for (const k of ['objectIdFieldName', 'objectIdField', 'globalIdField', 'displayField'] as const) {
    if (typeof b[k] === 'string') b[k] = orig(b[k] as string);
  }
  const uid = b.uniqueIdField as { name?: unknown } | undefined;
  if (uid && typeof uid.name === 'string') uid.name = orig(uid.name);
  const efi = b.editFieldsInfo as Keyed | undefined;
  if (efi && typeof efi === 'object') {
    for (const k of Object.keys(efi)) if (typeof efi[k] === 'string') efi[k] = orig(efi[k] as string);
  }
  const tpl = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const t of arr as { prototype?: { attributes?: Keyed } }[]) {
      if (t?.prototype?.attributes) t.prototype.attributes = renameKeys(t.prototype.attributes, orig);
    }
  };
  tpl(b.templates);
  if (Array.isArray(b.types)) for (const t of b.types as { templates?: unknown }[]) tpl(t?.templates);
  return body;
}

/** Давхаргын мета (`?f=json`) мөн үү — `fields` + `type` ("Feature Layer" · "Table") */
export const isLayerMeta = (b: Keyed): boolean => Array.isArray(b.fields) && typeof b.type === 'string';
