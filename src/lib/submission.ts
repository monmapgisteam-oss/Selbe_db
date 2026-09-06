'use client';

/**
 * ИЛГЭЭЛТИЙН ЗАВСРЫН ХАДГАЛАЛТ — «Нийтлэх» → хяналт → батлагдахад л архив.
 *
 * ⚠️ ЯАГААД (2026-09-04, хэрэглэгч: «ноорог систем дотор файлд түр хадгалагдаж
 * байх ёстой, ноорог ҮНДСЭН ДАТАНД хадгалагдаж болохгүй. Бүх шалгалт дуусаж
 * 4 шат дамжсаны дараа л дата хүснэгт буюу үндсэн сервис рүү орно»):
 * урьд нь «Нийтлэх» дарахад `applyAdds` багцын `Bagts_*` үйлчилгээнд
 * (ҮНДСЭН ДАТА) шууд бүтэн жааз бичиж, хяналт нь ТЭР бичигдсэн жаазыг араас
 * нь харж байв — инженер буцаасан ч архивт жааз аль хэдийн үлдчихсэн.
 * Одоо «Нийтлэх» = ИЛГЭЭХ: зөвхөн diff нь `Selbe_Guitsetgel_Draft` хүснэгтийн
 * `sub|<pkgKey>` мөрөнд хадгалагдаж, ерөнхий менежер БАТЛАХАД л
 * (`hyanaltStore.apply`) архивт жааз үүснэ.
 *
 * ⚠️ `dkey`-ИЙН ЗАЙ — нэг хүснэгт, гурван төрлийн мөр:
 *   · `<user>|<pkg>`      — ноорог (`draftRemote`, хэвээр; хэрэглэгч бүрд тусдаа)
 *   · `sub|<pkg>`         — ИДЭВХТЭЙ илгээлт; багц бүрд ХАМГИЙН ИХДЭЭ НЭГ мөр
 *   · `done|<pkg>|<oid>`  — батлагдсан илгээлт (хөлдсөн); payload-д
 *                           `archiveOid`, `approvedAt` нэмэгдэнэ
 *   Нэг багцад нэг идэвхтэй илгээлт: дахин илгээхэд ШИНЭ мөр биш, БАЙГАА мөр
 *   update хийгдэнэ (`mergeSubmission`-оор нэгтгэсэн payload-той).
 *   Батлагдсаны дараа `sub|` мөр `done|` болж хөлдөх тул дараагийн илгээлт
 *   шинэ `sub|` мөр үүсгэнэ.
 *
 * ⚠️ OBJECTID ХЭВЭЭР ҮЛДЭХ ЁСТОЙ: хяналтын бүртгэлийн (`guitsetgel_bugluh_hyanalt`)
 * `Эх_мөрийн_дугаар` нь илгээлтийн мөрийн ЭНЭ OBJECTID руу заадаг. Update-ийн
 * оронд delete+add хийвэл дугаар солигдож, хянагч илгээлтээ олохгүй.
 *
 * ⚠️ ЧИМЭЭГҮЙ БИШ — `draftRemote`-оос ялгаатай: ноорог нь нэмэлт хуулбар тул
 * алдаагаа залгидаг (`null`/`false`). Илгээлт нь хяналтын бүртгэлтэй холбогдох
 * ЖИНХЭНЭ алхам: хадгалалт унасныг хэрэглэгч мэдэхгүй бол «илгээлээ» гэж
 * бодоод хүлээнэ, хянагч юу ч харахгүй. Тиймээс `saveSubmission`/`closeSubmission`
 * нь `{ok:false, error}` МЕССЕЖТЭЙ буцаана. Унших зам (`load*`) л чимээгүй
 * `null` — харагдацыг унагаахгүй (илгээлтгүйтэй ижил).
 *
 * ⚠️ Хүснэгтийн URL, нэвтрэлт, давхардал цэвэрлэх ёс — `draftRemote`-ийнх
 * ХЭВЭЭР (тэндээс импортолно): хоёр модуль НЭГ хүснэгтэд бичдэг тул URL-ын
 * кэш, эзний шалгалт хоёр газар салж болохгүй.
 *
 * ⚠️ `null ≠ 0`: payload дахь `asOf`/`base` нь «мэдээлэлгүй» = `null`; тоо биш
 * утгыг 0 болгохгүй.
 */

import { getAuth, tableUrl, layer, sqlStr } from './draftRemote';
import { t as tr } from '@/lib/i18nCore';

/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН НЭМСЭН, хараахан батлагдаагүй мөр.
 *
 * ⚠️ Эцгийг ObjectID-гаар санахгүй: батлахад хуудас бүхэлдээ хуулбарлагдаж
 * бүх мөр ШИНЭ ObjectID авдаг тул тэр дугаар удаан амьдардаггүй. (№ + ажлын
 * нэр) хос нь эх excel-ийн бүтэц тул хамаагүй тогтвортой.
 *
 * ⚠️ НЭГ ЭХ СУРВАЛЖ: FillNew ба sheetFrame хоёулаа ЭНДЭЭС импортолно —
 * төрөл салбарлавал илгээлт ба бөглөх хуудасны мөр зөрнө.
 */
export type NewRow = {
  /** Түр ObjectID — САЛАНГИД сөрөг тоо, серверийн дугаартай хэзээ ч мөргөлдөхгүй */
  oid: number;
  parentNo: string;
  parentWork: string;
  /** Нэрээр олдохгүй үед нөхөх сүүлчийн арга */
  parentIdx: number;
  no: string;
  work: string;
  vol: number | null;
  unit: number | null;
};

/**
 * ИЛГЭЭЛТИЙН АГУУЛГА — архивын сүүлийн жааз дээрх diff.
 *
 * ⚠️ `cells`/`dates`/`adds` нь FillNew-ийн `pending`/`pendDate`/`adds`-тай
 * ЯГ ИЖИЛ хэлбэр: илгээлтийг компанийн хуудсанд overlay хийх, хянагчид
 * харуулах, батлахад жааз бүтээх — гурвуулаа нэг хэлбэрээс уншина.
 */
export type SubmissionPayload = {
  v: 1;
  /** PKGS түлхүүр */
  pkgKey: string;
  /** Илгээсэн (компанийн) хэрэглэгч, жижиг үсгээр */
  user: string;
  /** Илгээсэн агшин (ms) */
  at: number;
  /** Бөглөсөн өдөр — Date.UTC(y,m,d); архивын жаазны buglusun_ognoo болно */
  fillMs: number;
  /** diff-ийг ямар архивын агшин (snapshot ms) дээр бичсэн бэ — мэдээлэл */
  base: number | null;
  /** «Шинэчлэгдсэн огноо» — өөрчилсөн бол; эс бөгөөс `null` (0 БИШ) */
  asOf: number | null;
  /** `${oid}:${b}` → утга (мөр) — FillNew-ийн `pending`-тэй ИЖИЛ */
  cells: [string, string][];
  /** `${oid}:${b}:s|e` → 'YYYY-MM-DD' эсвэл '' — `pendDate`-тэй ИЖИЛ */
  dates: [string, string][];
  /** Нэмсэн мөр — oid сөрөг */
  adds: NewRow[];
  /** oid → "№ ¦ Ажлын нэр" — ObjectID шилжилтэд */
  rowKeys: [number, string][];
  /** Батлагдсаны дараа: архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID */
  archiveOid?: number;
  approvedAt?: number;
};

/** Хүснэгтээс уншсан илгээлт — мөрийн дугаар ба төлөвтэй */
export type StagedSubmission = { oid: number; at: number; done: boolean; payload: SubmissionPayload };

/**
 * ХАДГАЛАХ ДЭЭД ХЭМЖЭЭ (тэмдэгт) — `draftRemote.REMOTE_MAX`-тай ижил үндэслэл:
 * талбарын урт 100,000, үлдсэн зай нь JSON escape-ийн нөөц.
 *
 * ⚠️ Хэтэрсэн илгээлт ЯВАХГҮЙ, ил алдаатай буцна — таслаж бичвэл хагас diff
 * батлагдаж архивт орно.
 */
export const SUBMISSION_MAX = 80_000;

const SUB_PREFIX = 'sub|';
const DONE_PREFIX = 'done|';
/**
 * ⚠️ Ноорогийн түлхүүр `<user>|<pkg>` жижиг үсгээр тул `sub`/`done` нэртэй
 *    ArcGIS хэрэглэгч байвал давхцана. Одоогийн байгууллагад тийм нэр байхгүй;
 *    гарвал угтварыг өөрчлөх биш (хуучин мөр алдагдана), тэр нэрийг хориглоно.
 */
const subKey = (pkgKey: string) => `${SUB_PREFIX}${pkgKey}`;
const doneKey = (pkgKey: string, oid: number) => `${DONE_PREFIX}${pkgKey}|${oid}`;
const isSubmissionKey = (dkey: string) => dkey.startsWith(SUB_PREFIX) || dkey.startsWith(DONE_PREFIX);

const isStr = (x: unknown): x is string => typeof x === 'string';
const isFin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** `[string, string]` хос — нүд/огнооны бичлэг */
const isPair = (x: unknown): x is [string, string] =>
  Array.isArray(x) && x.length >= 2 && isStr(x[0]) && isStr(x[1]);
/** `[number, string]` хос — мөрийн танигч */
const isRowKey = (x: unknown): x is [number, string] =>
  Array.isArray(x) && x.length >= 2 && Number.isInteger(x[0]) && isStr(x[1]);

/**
 * `fillMs`-ИЙН БОДИТ МУЖ — 2020-01-01-ээс өнөөдөр + 2 хоног.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудит): `fillMs` нь батлагдахад архивын жаазны
 *    `buglusun_ognoo` болдог бөгөөд `bagtsSheet.latestWhere` нь ХАМГИЙН ИХ
 *    өдрийг «одоогийн» гэж сонгодог. Хүснэгт нь байгууллагын хэн ч засаж
 *    болдог тул `fillMs = Date.UTC(2099,0,1)` гэсэн нэг бичлэг ирээдүйн
 *    жааз үүсгэж, түүнээс хойш батлагдсан БҮХ жаазыг бөглөх хуудас,
 *    хуваарь, дашбоардаас мөнхөд нуух байлаа. Илүү туйлын утга
 *    (|ms| > 8.64e15) нь `msToDay` доторх `toISOString()`-ыг RangeError-оор
 *    унагана.
 * ⚠️ Мужаас гарсан бол payload-ыг БҮХЭЛД нь хаяна (fail-closed): илгээсэн
 *    агшин/өдөр нь мэдэгдэхгүй илгээлтийг батлах боломжгүй. Гүйцэтгэгч
 *    дахин илгээхэд `sub|` мөр дарж бичигддэг тул сэргээх зам нээлттэй.
 */
const FILL_MIN = Date.UTC(2020, 0, 1);
const FILL_SLACK = 2 * 86_400_000;
const isFillMs = (x: unknown): x is number =>
  isFin(x) && Number.isInteger(x) && x >= FILL_MIN && x <= Date.now() + FILL_SLACK;

/**
 * Түүхий JSON → шалгагдсан `SubmissionPayload`; эвдэрсэн бол `null`.
 *
 * ⚠️ FillNew-ийн `parseDraft`-тай ИЖИЛ ЁС: хүснэгт нь org доторх хэн ч засаж
 * болох тул итгэл нь localStorage-аас илүү байх ёсгүй. Нэг талбарын алдаа
 * бусад засварыг устгах ёсгүй — эвдэрсэн ХЭСГИЙГ л хаяна:
 *   · `v !== 1`, `pkgKey` хоосон, `cells` массив биш, `at` тоо биш, `fillMs`
 *     бодит мужаас гадуур (`isFillMs`) → `null` (илгээлтийн мөн чанар алга —
 *     ямар багцад, хэзээ гэдэг нь мэдэгдэхгүй);
 *   · `dates`/`adds`/`rowKeys` массив биш → хоосон массив (тэр хэсэг нь л орхигдоно);
 *   · массив доторх хэлбэргүй бичлэг → тэр бичлэг л хаягдана;
 *   · `adds`-ийн oid САЛАНГИД СӨРӨГ БҮХЭЛ байх ёстой (parseDraft-ийн дүрэм):
 *     давхардсан дугаартай хоёр мөр нэг `${oid}:${b}` нүдийг хуваалцаж, нэгд
 *     нь бичсэн обьём нөгөөд нь ч орно — зөрчилтэй БИЧЛЭГИЙГ л хаяна;
 *   · `asOf`/`base` тоо биш → `null` (0 БИШ — `null ≠ 0`).
 */
export function parseSubmission(raw: string): SubmissionPayload | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    if (d.v !== 1) return null;
    if (!isStr(d.pkgKey) || !d.pkgKey) return null;
    if (!Array.isArray(d.cells)) return null;
    if (!isFin(d.at) || !isFillMs(d.fillMs)) return null;

    const cells = (d.cells as unknown[]).filter(isPair).map(([k, v]): [string, string] => [k, v]);
    const dates = (Array.isArray(d.dates) ? (d.dates as unknown[]) : [])
      .filter(isPair).map(([k, v]): [string, string] => [k, v]);
    const rowKeys = (Array.isArray(d.rowKeys) ? (d.rowKeys as unknown[]) : [])
      .filter(isRowKey).map(([o, k]): [number, string] => [o, k]);

    const seen = new Set<number>();
    const adds: NewRow[] = [];
    for (const a of Array.isArray(d.adds) ? (d.adds as unknown[]) : []) {
      if (!a || typeof a !== 'object') continue;
      const r = a as Record<string, unknown>;
      const o = Number(r.oid);
      if (!Number.isInteger(o) || o >= 0 || seen.has(o)) continue;
      seen.add(o);
      adds.push({
        oid: o,
        parentNo: isStr(r.parentNo) ? r.parentNo : '',
        parentWork: isStr(r.parentWork) ? r.parentWork : '',
        parentIdx: Number.isInteger(r.parentIdx) ? (r.parentIdx as number) : -1,
        no: isStr(r.no) ? r.no : '',
        work: isStr(r.work) ? r.work : '',
        vol: isFin(r.vol) ? r.vol : null,
        unit: isFin(r.unit) ? r.unit : null,
      });
    }

    const out: SubmissionPayload = {
      v: 1,
      pkgKey: d.pkgKey,
      user: isStr(d.user) ? d.user.toLowerCase() : '',
      at: d.at,
      fillMs: d.fillMs,
      base: isFin(d.base) ? d.base : null,
      asOf: isFin(d.asOf) ? d.asOf : null,
      cells,
      dates,
      adds,
      rowKeys,
    };
    if (Number.isInteger(d.archiveOid) && (d.archiveOid as number) > 0) out.archiveOid = d.archiveOid as number;
    if (isFin(d.approvedAt)) out.approvedAt = d.approvedAt;
    return out;
  } catch {
    return null;
  }
}

/**
 * ХУРИМТЛАГДСАН илгээлт: хуучин payload дээр шинэ diff-ийг НЭГТГЭНЭ.
 *
 * ⚠️ ЯАГААД нэгтгэх, дарахгүй: багцын хяналтын мөр батлагдаагүй байхад
 * компани дахин илгээвэл (жишээ нь инженер буцаасны дараа нэг нүд засаад)
 * ШИНЭ diff нь зөвхөн тэр нэг нүд — хуучин 40 нүдийг дарвал хянагч
 * «40 нүд алга болов» гэж харна, батлахад ч архивт ордоггүй.
 *
 * Дүрэм: cells/dates — түлхүүрээр, шинэ нь дарна; adds — oid-оор, шинэ нь
 * дарна (хуучин байрлал хэвээр — эцэг/дүү дараалал хадгалагдана); rowKeys —
 * oid-оор нэгтгэнэ; asOf — шинэ ?? хуучин ?? null; base — мөн адил (мэдээлэл);
 * pkgKey/user/at/fillMs — шинэ. `archiveOid`/`approvedAt` ОРОХГҮЙ: нэгтгэсэн
 * илгээлт нь идэвхтэй (батлагдаагүй) — хаах үед `closeSubmission` нэмнэ.
 *
 * Оролтыг ӨӨРЧЛӨХГҮЙ (шинэ объект/массив).
 */
export function mergeSubmission(
  prev: SubmissionPayload | null,
  next: Omit<SubmissionPayload, 'v'>,
): SubmissionPayload {
  const cells = new Map<string, string>(prev?.cells ?? []);
  for (const [k, v] of next.cells) cells.set(k, v);
  const dates = new Map<string, string>(prev?.dates ?? []);
  for (const [k, v] of next.dates) dates.set(k, v);
  const adds = new Map<number, NewRow>();
  for (const a of prev?.adds ?? []) adds.set(a.oid, a);
  for (const a of next.adds) adds.set(a.oid, a);
  const rowKeys = new Map<number, string>(prev?.rowKeys ?? []);
  for (const [o, k] of next.rowKeys) rowKeys.set(o, k);
  return {
    v: 1,
    pkgKey: next.pkgKey,
    /* ⚠️ Жижиг үсгээр — `parseSubmission`-тэй ижил инвариант, дуудагчид найдахгүй */
    user: next.user.toLowerCase(),
    at: next.at,
    fillMs: next.fillMs,
    base: next.base ?? prev?.base ?? null,
    asOf: next.asOf ?? prev?.asOf ?? null,
    cells: [...cells].map(([k, v]): [string, string] => [k, v]),
    dates: [...dates].map(([k, v]): [string, string] => [k, v]),
    adds: [...adds.values()].map((a) => ({ ...a })),
    rowKeys: [...rowKeys].map(([o, k]): [number, string] => [o, k]),
  };
}

/* ───────────────────────── ArcGIS — хүснэгттэй харьцах ───────────────────────── */

/** Алдааны объектоос хүнд уншигдах мессеж */
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message || 'ArcGIS error';
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; description?: unknown };
    const m = o.message ?? o.description;
    if (m != null && String(m)) return String(m);
  }
  return String(e ?? 'ArcGIS error');
};

type RowAttrs = { OBJECTID?: number; dkey?: string; at?: number; payload?: string };

/**
 * ХАРИУ — «олдсонгүй» ба «уншиж чадсангүй» хоёрыг ЯЛГАНА.
 *
 * ⚠️ ЯАГААД (2026-09-04-ний аудитын CRITICAL олдвор): `loadSubmissionByOid`
 *    нь алдаа гарсан ч, мөр байхгүй ч ялгаагүй `null` буцаадаг байв.
 *    `hyanaltStore.archiveSubmission` тэр `null`-ыг «хуучин (legacy) мөр —
 *    жааз нь аль хэдийн архивт бий» гэж тайлбарладаг тул сүлжээ түр тасрах,
 *    токен дуусах, `tableUrl` null буцаах агшинд БАТЛАГДСАН илгээлт архивт
 *    ОГТ БИЧИГДЭЛГҮЙ хяналтын мөр «Шилжүүлсэн» болж, дахин батлах зам
 *    хаагддаг байлаа — компанийн бүтэн өдрийн гүйцэтгэл ул мөргүй алга
 *    болно, хаана ч алдаа үлдэхгүй.
 *
 * Тиймээс БИЧИХ шийдвэр гаргадаг дуудагч (`archiveSubmission`, `publish`)
 * `read*` хувилбарыг ашиглана; зөвхөн ХАРУУЛАХ зам (`load*`) чимээгүй
 * `null`-аараа хэвээр.
 */
export type SubRead =
  | { ok: true; sub: StagedSubmission | null }
  | { ok: false; error: string };

/**
 * Хүснэгтийн мөр → уншилтын үр дүн.
 *   · мөр огт алга                        → `{ok:true, sub:null}` (legacy зам зөвшөөрөгдөнө)
 *   · `dkey` нь `sub|`/`done|` БИШ        → `{ok:true, sub:null}` (ноорогийн мөр — илгээлт биш)
 *   · илгээлтийн мөр атал payload задрахгүй → `{ok:false}` (ЭНЭ нь илгээлт мөн
 *     боловч уншигдсангүй — legacy гэж үзвэл гүйцэтгэл алга болно)
 */
function readRow(a: RowAttrs | undefined): SubRead {
  if (!a || typeof a.OBJECTID !== 'number') return { ok: true, sub: null };
  const dkey = String(a.dkey ?? '');
  if (!isSubmissionKey(dkey)) return { ok: true, sub: null };
  const payload = a.payload ? parseSubmission(String(a.payload)) : null;
  if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', a.OBJECTID) };
  /* Мөрийн `at` талбар нь payload.at-тай адил боловч хуучин/эвдэрсэн мөрд
     байхгүй байж болно — payload-оос нөхнө. */
  const at = isFin(a.at) ? Number(a.at) : payload.at;
  return { ok: true, sub: { oid: a.OBJECTID, at, done: dkey.startsWith(DONE_PREFIX), payload } };
}

/* ⚠️ Хуучин `toStaged` (мөр → `StagedSubmission`, алдааг `null` болгодог)
   ХАСАГДСАН: `readRow` нь «мөр алга» ба «илгээлт атал уншигдсангүй» хоёрыг
   ялгадаг болсон тул алдааг чимээгүй `null` болгох завсрын функц нь тэр
   ялгааг буцаагаад устгах эрсдэлтэй. Чимээгүй хувилбар хэрэгтэй дуудагчид
   `loadActiveSubmission`/`loadSubmissionByOid`-ыг ашиглана. */

const OUT_FIELDS = ['OBJECTID', 'dkey', 'at', 'payload'];

/**
 * Уншихад бэлэн хүснэгтийн URL — `SubRead`-ийн ёсоор.
 *
 * ⚠️ ХОЁР ӨӨР «null»-ыг ЯЛГАНА (`tableUrl` хоёуланг нь `null` гэж нэгтгэдэг):
 *   · нэвтрээгүй → `{ok:false}` — юу ч мэдэхгүй, шийдвэр гаргаж болохгүй;
 *   · нэвтэрсэн боловч хүснэгт огт БАЙХГҮЙ → `{ok:true, url:null}` —
 *     тэр орчинд илгээлт үүсэх БОЛОМЖГҮЙ тул «мөр байхгүй» нь БАТАЛГААТАЙ
 *     бөгөөд хуучин (legacy) хяналтын мөрүүд хэвийн батлагдана.
 */
async function readUrl(): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлтийг уншиж чадсангүй') };
  return { ok: true, url: await tableUrl(false) };
}

/**
 * Багцын ИДЭВХТЭЙ илгээлт (`sub|<pkgKey>`) — байхгүй/алдаа бол `null`.
 * ⚠️ Давхардвал (зэрэгцээ бичилтийн race) OBJECTID хамгийн ИХ нь ялна —
 *    `saveSubmission` мөн их OBJECTID-д бичиж бусдыг устгадаг тул нийцнэ.
 * ⚠️ Унших зам чимээгүй: алдаа → `null` (илгээлтгүйтэй ижил) — компанийн
 *    хуудас overlay-гүй ч ачаалагдана.
 */
export async function loadActiveSubmission(pkgKey: string): Promise<StagedSubmission | null> {
  const r = await readActiveSubmission(pkgKey);
  return r.ok ? r.sub : null;
}

/**
 * Багцын ИДЭВХТЭЙ илгээлт — АЛДААГ ЯЛГАДАГ хувилбар.
 *
 * ⚠️ `publish` нь энэ хувилбарыг ашиглана: чимээгүй `null` дээр тулгуурлавал
 *    уншилт унасан агшинд «идэвхтэй илгээлт байхгүй» гэж дүгнэж, өөр
 *    хэрэглэгчийн ЯГ ОДОО хянагдаж буй `sub|` мөрийг бүтнээр нь дарж бичдэг
 *    байв (upsert нь мөрийг dkey-гээр олдог тул тэр мөр рүү л бичнэ).
 */
export async function readActiveSubmission(pkgKey: string): Promise<SubRead> {
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `dkey = ${sqlStr(subKey(pkgKey))}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
      orderByFields: ['OBJECTID DESC'],
    });
    return readRow(res.features[0]?.attributes as RowAttrs | undefined);
  } catch (e) {
    return { ok: false, error: tr('Илгээлтийн төлөвийг шалгаж чадсангүй: {0}', errMsg(e)) };
  }
}

/**
 * Илгээлт OBJECTID-оор — хяналтын бүртгэлийн `Эх_мөрийн_дугаар`-аас.
 * `done` = `dkey` нь `done|`-оор эхэлдэг (батлагдсан, архивт орсон).
 *
 * ⚠️ Зөвхөн `sub|`/`done|` мөрийг буцаана: хуучин хяналтын мөрүүдэд
 *    `Эх_мөрийн_дугаар` нь АРХИВЫН OBJECTID тул энэ хүснэгтийн ноорогийн
 *    мөртэй санамсаргүй давхцаж болно — тэр үед `null` буцааж legacy зам
 *    (архивын OBJECTID) ажиллана.
 */
export async function loadSubmissionByOid(oid: number): Promise<StagedSubmission | null> {
  const r = await readSubmissionByOid(oid);
  return r.ok ? r.sub : null;
}

/**
 * Илгээлт OBJECTID-оор — АЛДААГ ЯЛГАДАГ хувилбар (`SubRead`).
 *
 * ⚠️ ЗӨВХӨН ЭНЭ хувилбарыг «архивт бичих эсэх» шийдвэрт хэрэглэнэ
 *    (`hyanaltStore.archiveSubmission`, `FillNew`-ийн хянагчийн харагдац):
 *    `{ok:true, sub:null}` нь «мөр огт байхгүй нь БАТАЛГААЖСАН» гэсэн үг тул
 *    legacy зам руу унаж болно; `{ok:false}` нь «мэдэхгүй» — тэр үед юу ч
 *    хийхгүй зогсоно.
 */
export async function readSubmissionByOid(oid: number): Promise<SubRead> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: true, sub: null };
  try {
    const u = await readUrl();
    if (!u.ok) return u;
    if (!u.url) return { ok: true, sub: null };
    const fl = await layer(u.url);
    const res = await fl.queryFeatures({
      where: `OBJECTID = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    return readRow(res.features[0]?.attributes as RowAttrs | undefined);
  } catch (e) {
    return { ok: false, error: tr('Илгээлт №{0}-ийг уншиж чадсангүй: {1}', oid, errMsg(e)) };
  }
}

/**
 * ИЛГЭЭЛТИЙГ ХАДГАЛНА (upsert `sub|<pkgKey>`).
 *
 * ⚠️ Байгаа мөрийг update — OBJECTID ХЭВЭЭР (толгойн тайлбар: хяналтын
 *    бүртгэл энэ дугаараар холбогдоно). Давхардлыг устгана (их OBJECTID
 *    үлдэнэ) — эс бөгөөс уншилт хуучин мөрийг сонгож «илгээсэн ч эргэж
 *    ирэхгүй» гэсэн чимээгүй алдаа үүснэ.
 * ⚠️ ArcGIS алдаагаа HTTP 200 + мөр бүрийн `error`-оор буцаадаг —
 *    `applyEdits`-ийн ҮР ДҮНГИЙН МӨР БҮРИЙГ шалгана; `ok:false` МЕССЕЖТЭЙ.
 * ⚠️ Давхардал устгах алхам унавал `ok:false` БИШ — илгээлт их OBJECTID-д
 *    аль хэдийн бичигдсэн бөгөөд уншилт түүнийг л сонгоно; зөвхөн warn.
 */
export async function saveSubmission(
  pkgKey: string,
  payload: SubmissionPayload,
  /**
   * ХҮЛЭЭГДЭЖ БУЙ СУУРЬ (optimistic concurrency) — заавал биш.
   *   · `undefined` → шалгахгүй (хуучин зан төлөв);
   *   · `null`      → мөр БАЙХГҮЙ байх ёстой;
   *   · `{at}`      → байгаа мөрийн `at` нь ЯГ энэ байх ёстой.
   *
   * ⚠️ ЯАГААД (2026-09-04-ний аудит): дуудагч талын «хуучирсан уу» шалгуур
   *    нь ХОЁР ТУСДАА уншилтын хооронд (`loadActiveSubmission` → `saveSubmission`)
   *    задгай цонхтой бөгөөд `payload.at` нь КЛИЕНТИЙН цагаар бичигддэг тул
   *    цагийн зөрүүтэй хоёр машин дээр эрэмбийн харьцуулалт чимээгүй давдаг
   *    байв — өөр хэрэглэгчийн илгээсэн нүднүүд ул мөргүй устана. Энд суурийг
   *    бичих АГШИНД нь дахин тулгана: зөрвөл `ok:false`, юу ч бичигдэхгүй.
   */
  expect?: { at: number } | null,
): Promise<{ ok: true; oid: number } | { ok: false; error: string }> {
  if (payload.pkgKey !== pkgKey) {
    /* ⚠️ Өөр багцын diff-ийг энэ түлхүүрт бичвэл батлахад буруу багцын архив
       руу орно — дуудагчийн алдааг ил зогсооно. */
    return { ok: false, error: tr('Багцын түлхүүр зөрсөн: {0} ≠ {1}', payload.pkgKey, pkgKey) };
  }
  const raw = JSON.stringify({ ...payload, v: 1 });
  if (raw.length > SUBMISSION_MAX) {
    /*
     * ⚠️ ЗААВАР ҮНЭН БАЙХ ЁСТОЙ (2026-09-04-ний аудит). Урьд нь «хэсэгчлэн
     *    илгээнэ үү» гэж заадаг байсан нь ХУДАЛ: `mergeSubmission` нь дараагийн
     *    илгээлтийг өмнөхтэй нь ХУРИМТЛУУЛДАГ тул хагасыг илгээгээд үлдсэнийг
     *    илгээхэд дүн нь ДАХИН хязгаараас давна — хэрэглэгч гарцгүй давталтад
     *    орно. Жинхэнэ гарц нь ЗӨВХӨН батлагдах (тэгвэл `sub|` мөр `done|`
     *    болж хөлдөж, дараагийн илгээлт ЦЭВЭР эхэлнэ).
     */
    return {
      ok: false,
      error: tr('Илгээлт хэт том ({0} тэмдэгт, дээд {1}). Хэсэгчлэн илгээх нь ТУСЛАХГҮЙ — дараагийн илгээлт өмнөхтэйгээ нэгтгэгддэг тул хэмжээ буурахгүй. Одоо илгээсэн хэсгээ хянагчаар батлуулсны дараа шинэ илгээлт цэвэр эхэлнэ.', raw.length, SUBMISSION_MAX),
    };
  }
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: tr('Нэвтрээгүй тул илгээлт хадгалагдсангүй') };
    const url = await tableUrl(true);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const dkey = subKey(pkgKey);
    const found = await fl.queryFeatures({
      where: `dkey = ${sqlStr(dkey)}`,
      outFields: ['OBJECTID', 'at'],
      returnGeometry: false,
      orderByFields: ['OBJECTID ASC'],
    });
    const feats = found.features.filter((f) => typeof f.attributes?.OBJECTID === 'number');
    const oids = feats.map((f) => f.attributes.OBJECTID as number);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    /* ⚠️ СУУРИЙН ТУЛГАЛТ — дээрх `expect`-ийн тайлбар. Зөрсөн бол ЮУ Ч
       бичихгүй буцна: дуудагч хуудсаа дахин ачаалж, нөгөө хүний илгээлт
       дээр нэгтгэх ёстой. */
    if (expect !== undefined) {
      const curAt = target != null ? (feats[feats.length - 1].attributes.at as unknown) : null;
      const same = expect === null
        ? target == null
        : target != null && isFin(curAt) && Number(curAt) === expect.at;
      if (!same) {
        return {
          ok: false,
          error: tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.'),
        };
      }
    }
    const attrs = { dkey, usr: auth.user.toLowerCase(), pkg: pkgKey, at: payload.at, payload: raw };
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const results = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    const bad = results.find((x) => x.error != null);
    if (bad) return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(bad.error)) };
    const oid = target ?? results[0]?.objectId;
    if (typeof oid !== 'number' || !(oid > 0)) {
      return { ok: false, error: tr('Илгээлт хадгалагдсангүй: серверээс мөрийн дугаар ирсэнгүй') };
    }
    const badDel = (r.deleteFeatureResults ?? []).find((x) => x.error != null);
    if (badDel) console.warn('[selbe] илгээлтийн давхардсан мөр устсангүй:', errMsg(badDel.error));
    return { ok: true, oid };
  } catch (e) {
    return { ok: false, error: tr('Илгээлт хадгалагдсангүй: {0}', errMsg(e)) };
  }
}

/**
 * ИЛГЭЭЛТИЙГ ХААНА — ерөнхий менежер баталж архивт бичсэний ДАРАА.
 * `dkey` → `done|<pkgKey>|<oid>`, payload-д `archiveOid`/`approvedAt` нэмнэ.
 *
 * ⚠️ Мөр аль хэдийн `done|` бол `ok:true` (idempotent) — батлах алхам
 *    давтагдахад архивт давхар жааз үүсгэхгүйн шалгалт `hyanaltStore`-д
 *    ЭНЭ төлөвөөр хийгдэнэ.
 * ⚠️ Ноорогийн мөрийг (`user|pkg`) OBJECTID-оор олсон ч хаахгүй — илгээлт биш.
 */
export async function closeSubmission(
  oid: number,
  archiveOid: number,
  approvedAt: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(oid) || oid <= 0) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
  try {
    const url = await tableUrl(false);
    if (!url) return { ok: false, error: tr('Илгээлтийн хүснэгт олдсонгүй') };
    const fl = await layer(url);
    const res = await fl.queryFeatures({
      where: `OBJECTID = ${oid}`,
      outFields: OUT_FIELDS,
      returnGeometry: false,
    });
    const a = res.features[0]?.attributes as RowAttrs | undefined;
    if (!a) return { ok: false, error: tr('Илгээлтийн мөр №{0} олдсонгүй', oid) };
    const dkey = String(a.dkey ?? '');
    if (dkey.startsWith(DONE_PREFIX)) return { ok: true };
    if (!dkey.startsWith(SUB_PREFIX)) return { ok: false, error: tr('Мөр №{0} нь илгээлт биш ({1})', oid, dkey) };
    const payload = parseSubmission(String(a.payload ?? ''));
    if (!payload) return { ok: false, error: tr('Илгээлт №{0}-ийн агуулга задарсангүй', oid) };
    const pkgKey = payload.pkgKey || dkey.slice(SUB_PREFIX.length);
    const next: SubmissionPayload = { ...payload, archiveOid, approvedAt };
    const edit = {
      updateFeatures: [{
        attributes: { OBJECTID: oid, dkey: doneKey(pkgKey, oid), payload: JSON.stringify(next) },
      }],
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const bad = (r.updateFeatureResults ?? []).find((x) => x.error != null);
    if (bad) return { ok: false, error: errMsg(bad.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
