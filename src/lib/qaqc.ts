/**
 * ЧАНАР (QAQC) — Inspection Test Plan-ийн ӨГӨГДЛИЙН ДАВХАРГА.
 *
 * ⚠️ 2026-09-03, хэрэглэгчийн шийдвэр («QAQC-ийг гүйцэтгэл бөглөхөөс БҮРЭН
 *    салгаж тусдаа дэд сэдэв болго»): чанарын баримт нь одоо ӨӨРИЙН
 *    харагдацтай (`ViewKey: 'qaqc'`, `src/modules/Qaqc.tsx`) бөгөөд
 *    `QAQC`/`QAQC2` үйлчилгээнээс ШУУД уншиж, тийш нь ШУУД бичнэ.
 *
 * ⚠️ БӨГЛӨХ ХУУДСЫГ ОГТ ХӨНДӨХГҮЙ. Урьд нь эдгээр багана «Гүйцэтгэл бөглөх»
 *    хуудасны 60 баганын хажууд амьдардаг байсан ч `Bagts_*` үйлчилгээнд тэр
 *    багана ОГТ БАЙХГҮЙ (`Schema.docs` бүгд `null`) тул юу ч хадгалагддаггүй
 *    байв — шилжилтэд АЛДАГДАХ өгөгдөл байгаагүй.
 *
 * ⚠️ Хуудас хооронд мөр тулгах шаардлагагүй болсон нь энэ модулийн ХАМГИЙН
 *    ЭМЗЭГ хэсгийг (№ + ажил + давталтаар холбох) бүрмөсөн арилгав: QAQC
 *    хүснэгт өөрөө `F_`, `Ажил` ба ТОГТВОРТОЙ `ObjectID`-тай.
 *
 * ⚠️ БҮРЭН ӨӨР АМЬДРАЛЫН МӨЧЛӨГ: бөглөх хуудас нь нийтлэх бүрд БҮХЭЛДЭЭ
 *    хуулбарлагдаж архивын шинэ агшин үүсгэдэг; QAQC хүснэгт нь архивгүй,
 *    мөр нь БАЙРАНДАА засагдана. Тиймээс энд «нийтлэх» биш «хадгалах».
 *
 * ⚠️ React импортлохгүй — `qaqc.check.mjs` шууд Node дээр ачаална.
 */
import { t as tr } from '@/lib/i18nCore';
import { agsFetch } from '@/modules/sheet/ags';
import { AUTH, HJ, roleForUser } from '@/lib/services';
import { currentUser, requireCap } from '@/lib/who';
import { qaqcScope } from '@/lib/qaqcAcl';
import { PKGS } from '@/modules/sheet/bagts.pkg';

/** QAQC хүснэгтүүд байрлах үйлчилгээнүүд */
export const QAQC_SERVICES = {
  QAQC: `${HJ}/QAQC/FeatureServer`,
  QAQC2: `${HJ}/QAQC2/FeatureServer`,
} as const;
export type QaqcSvc = keyof typeof QAQC_SERVICES;
/** Нэг QAQC хүснэгтийн БҮРЭН хаяг — үйлчилгээ + дугаар */
export type QaqcRef = { svc: QaqcSvc; id: number };

/**
 * Багцын түлхүүр → QAQC хүснэгт (үйлчилгээ + дугаар).
 *
 * ⚠️ 10/10 багц ХАМРАГДСАН. `QAQC2` дахь хоёр хүснэгтийн мөр нь бөглөх
 *    хуудасныхтай 100% таарсан (2026-09-03-нд хэмжсэн: b2_9f 1,386/1,386;
 *    b32_9f 1,470/1,470).
 * ⚠️ ДУГААР ДАВХАРДДАГ: `QAQC/169` нь Багц 1 · 9F, `QAQC2/169` нь
 *    Багц 3.2 · 9F; `QAQC/191` ба `QAQC2/191` мөн адил. Үйлчилгээг нь хаясан
 *    богино бичиглэл рүү «хялбарчилж» БОЛОХГҮЙ — хоёр өөр багцын чанарын
 *    баримт бие бие рүүгээ бичигдэнэ.
 * ⚠️ Үл мэдэх багц нь `null` буцаана (`qaqcTableOf`) — харагдац дээр
 *    шалтгааныг ИЛ хэлнэ, чимээгүй нуухгүй.
 */
export const QAQC_TABLE: Record<string, QaqcRef> = {
  b1_9f: { svc: 'QAQC', id: 169 },
  b1_12f: { svc: 'QAQC', id: 185 },
  b2_9f: { svc: 'QAQC2', id: 191 },
  b2_12f: { svc: 'QAQC', id: 186 },
  b31_9f: { svc: 'QAQC', id: 187 },
  b32_9f: { svc: 'QAQC2', id: 169 },
  /**
   * ⚠️ ХУУЧИРСАН ХҮСНЭГТ (2026-09-07-нд хэмжсэн) — 1,258 мөр, бөглөх хуудас нь
   *    1,459. Дутуу 201 мөр нь ТӨГСГӨЛД биш, 46-р мөрөөс эхлэн ДУНД нь тархсан:
   *      QAQC[46]   «ХАНА, ХАМАР ХАНЫН АЖИЛ»
   *      хуудас[46] «ТӨМӨР БЕТОН РАМЫН АЖИЛ»
   *    Өөрөөр хэлбэл энэ хүснэгт нь эх Excel-ийн ХУУЧИН хувилбараас үүссэн
   *    (бөглөх хуудас 2026-09-06-нд 1,258 → 1,459 болж шинэчлэгдсэн).
   *
   *    ҮР ДАГАВАР: `attachTree` татгалзаж, хуудас ХАВТГАЙ зурагдана (унахгүй,
   *    бөглөлт ажиллана) бөгөөд CEO самбарт бүлгийн мөр «ажил» гэж тоологдоно.
   *
   *    ⚠️ ПРОГРАМААС НӨХӨХ БОЛОМЖГҮЙ: аль мөр аль ажилд харьяалагдахыг
   *    таамаглавал чанарын акт БУРУУ ажилд бичигдэнэ. Хүснэгтийг эх хүснэгтийн
   *    шинэ хувилбараар дахин үүсгэх ёстой.
   */
  b33_9f: { svc: 'QAQC', id: 189 },
  b41_9f: { svc: 'QAQC', id: 190 },
  b42_9f: { svc: 'QAQC', id: 191 },
  b42_12f: { svc: 'QAQC', id: 192 },
};

export const qaqcUrl = (r: QaqcRef): string => `${QAQC_SERVICES[r.svc]}/${r.id}`;

/** Тухайн багцын QAQC хүснэгт — үл мэдэх багцад `null` */
export const qaqcTableOf = (pkgKey: string): QaqcRef | null => QAQC_TABLE[pkgKey] ?? null;

/**
 * БАРИМТЫН 9 БАГАНА — зурагдах дараалал.
 *
 * ⚠️ Дараалал нь `QAQC_GROUPS`-ийн `count`-той ЗААВАЛ нийцнэ; зөрвөл толгойн
 *    нүд баганатайгаа таарахгүй болж хүснэгт бүхэлдээ гулсана (шалгуур барина).
 */
export const QAQC_COLS: { name: string; label: string; short: string }[] = [
  { name: 'Makt_dugaar', get label() { return tr('М-акт — М-актын №'); }, get short() { return tr('М-актын №'); } },
  { name: 'Makt_ner', get label() { return tr('М-акт — М-актын нэр'); }, get short() { return tr('М-актын нэр'); } },
  { name: 'Makt_havsralt', get label() { return tr('М-акт — Хавсралт бичиг баримт'); }, get short() { return tr('Хавсралт бичиг баримт'); } },
  { name: 'FIC_dugaar', get label() { return tr('FIC — FIC дугаар'); }, get short() { return tr('FIC дугаар'); } },
  { name: 'FIC_ner', get label() { return tr('FIC — FIC нэр'); }, get short() { return tr('FIC нэр'); } },
  { name: 'MA_dugaar', get label() { return tr('MA Material Approval — MA дугаар'); }, get short() { return tr('MA дугаар'); } },
  { name: 'MA_ner', get label() { return tr('MA Material Approval — MA нэр'); }, get short() { return tr('MA нэр'); } },
  { name: 'MIR_dugaar', get label() { return tr('MIR — MIR дугаар'); }, get short() { return tr('MIR дугаар'); } },
  { name: 'MIR_ner', get label() { return tr('MIR — MIR нэр'); }, get short() { return tr('MIR нэр'); } },
];

/**
 * ТОЛГОЙН БҮЛЭГЛЭЛТ — excel-ийн эх загвартай ЯГ ижил.
 *
 *   ┌──────────────── Inspection Test Plan ────────────────┐
 *   │  М-акт (3)  │ FIC (2) │ MA Material Approval (2) │ MIR (2) │
 *   │ №│нэр│хавсралт│ №│нэр  │ №│нэр                   │ №│нэр   │
 */
export const QAQC_BAND = 'Inspection Test Plan';
export const QAQC_GROUPS: { label: string; count: number }[] = [
  { get label() { return tr('М-акт'); }, count: 3 },
  { label: 'FIC', count: 2 },
  { label: 'MA Material Approval', count: 2 },
  { label: 'MIR', count: 2 },
];

/**
 * Ажлын мөрийг танилцуулах талбарууд — хүснэгтэд байхгүй бол алгасагдана.
 *
 * ⚠️ `Хувийн_жин` ЭНД БАЙХГҮЙ: 2026-09-03-нд QAQC хүснэгтүүд нимгэрч 15
 *    талбар болсон (өмнө нь 74–113) бөгөөд жингийн багана хасагдсан.
 *    Түүнийг ЯГ шатлал тодорхойлоход хэрэглэдэг байсан тул модыг QAQC
 *    хүснэгтээс дангаар гаргах боломж БАЙХГҮЙ — `attachTree` үзнэ үү.
 */
const INFO_FIELDS = ['F_', 'Ажил', 'Des_dugaar'];
const OID = 'ObjectID';

export type QaqcRow = {
  oid: number;
  /** «№» — excel-ийн A багана (`F_`) */
  no: string;
  /** Ажлын нэр (`Ажил`) */
  work: string;
  /** Ажлын давтагдахгүй код (`Des_dugaar`) — ихэнх хүснэгтэд хоосон */
  des: string;
  /**
   * ЭГНҮҮЛЭЛТИЙН гүн (0-ээс) — бөглөх хуудасны модноос (`attachTree`).
   * ⚠️ Мод холбогдоогүй үед 0 — хүснэгт ХАВТГАЙ зурагдана.
   */
  depth: number;
  /** Дэд ажилтай бүлгийн мөр — эвхэгддэг, тодоор зурагдана */
  group: boolean;
  /** `QAQC_COLS`-той ИЖИЛ дараалалтай утгууд; хоосон нүд `null` */
  docs: (string | null)[];
};

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Мөр нь ЖИНХЭНЭ ажлын мөр мөн үү.
 *
 * ⚠️ QAQC хүснэгтүүд нь excel-ийн ШУУД хуулбар тул эхний 3 мөр нь толгойн
 *    хэсэг: `F_` ба `Ажил` хоёул хоосон, зөвхөн өргөн `F<n>` баганууд дүүрсэн
 *    байдаг. Тэднийг харуулбал хэрэглэгч хоосон мөрд акт бөглөх гэж оролдоно.
 */
export const isDataRow = (r: { no: string; work: string }): boolean =>
  r.no !== '' || r.work !== '';

/** Бөглөх хуудасны мөрөөс шатлалд хэрэгтэй хэсэг */
export type TreeRow = { no: unknown; work: unknown; depth: number; group: boolean };

/**
 * ШАТЛАЛЫГ БӨГЛӨХ ХУУДАСНААС ХОЛБОНО (зөвхөн ХАРАГДАЦ).
 *
 * ⚠️ ЯАГААД ГАДНААС: QAQC хүснэгт 2026-09-03-нд нимгэрч `Хувийн_жин`
 *    хасагдсан. Тэр багана нь бүхэл № бүхий мөр АНГИЛАЛ уу НАВЧ уу гэдгийг
 *    ялгах ЦОРЫН ГАНЦ тэмдэг байв. № бүтцээр дүгнэх туршилт: эгнүүлэлт
 *    ердөө 4.8–70.9% таарсан (3 багц дээр хэмжсэн) — тийм мод нь «энэ
 *    М-акт аль ажилд харьяалагдана» гэдгийг ХУДАЛ харуулна.
 *
 * ⚠️ ДАРААЛЛААР холбоно, түлхүүрээр БИШ: хоёр хүснэгт нэг excel-ийн хуулбар
 *    тул мөр мөрөөрөө таарна (2026-09-03-нд 10/10 багцад хэмжсэн: 14,300
 *    мөр, дараалал 100% ижил). Түлхүүр (№ + ажил) нь ДАВХАРДДАГ тул
 *    дараалал нь илүү тодорхой холбоос.
 *
 * ⚠️ БАТАЛГААЖУУЛАЛТ нь ЗӨВХӨН АЖЛЫН НЭРЭЭР — № -ГЭЭР БИШ (2026-09-07).
 *    Урьд нь № -г ч тулгадаг байсан тул шатлал 10/10 багцад ХЭЗЭЭ Ч
 *    холбогдож чадаагүй, хуудас байнга ХАВТГАЙ зурагддаг байв. Шалтгаан нь
 *    QAQC хүснэгтийн `F_` баганын ӨГӨГДЛИЙН алдаа (кодынх биш):
 *      · excel «3.10»-г ТОО гэж уншаад «3.1» болгосон — хадгалагдсан
 *        дараалал нь `… 3.8, 3.9, 3.1, 3.11 …` (`F_` нь `String` төрөлтэй
 *        мөртлөө);
 *      · зарим бүлгийн дугаар хоёр хүснэгтэд ЖИНХЭНЭЭСЭЭ зөрдөг («ГДДС» нь
 *        QAQC-д 7, бөглөх хуудсанд 4).
 *    Багц бүрд 3–9 мөр ингэж зөрдөг.
 *
 * ⚠️ ЭНЭ СУЛРАЛТ ЯАГААД АЮУЛГҮЙ ВЭ: 2026-09-07-нд 9 багцын 13,032 мөрийг
 *    хэмжихэд АЖЛЫН НЭР 100.00% таарсан (зөрүү 0). Өөрөөр хэлбэл мөрүүд
 *    ЗӨВ эгнэсэн нь батлагдсан бөгөөд ганц зөрөх багана нь яг тэр найдваргүй
 *    № юм. Ажлын нэр нь урт, утга агуулсан тул санамсаргүй таарах магадлал
 *    үгүй; нэг мөр ч гэсэн зөрвөл `null` буцааж, хавтгай хүснэгт зурна.
 *
 * ⚠️ Засварыг УНШИЛТЫН талд хийв: эх өгөгдөлд «3.1» → «3.10» гэж бичих нь
 *    жинхэнэ 3.1-тэй давхцаж, буцаах аргагүй эвдрэл үүсгэнэ.
 *
 * ⚠️ ЗӨРВӨЛ `null` — таамаглахгүй. Дуудагч нь хавтгай хүснэгт зурж,
 *    шалтгааныг ИЛ хэлнэ. Хагас таарсан модыг зурвал ажлын харьяалал
 *    чимээгүй хуурамч болно.
 *
 * ⚠️ БИЧИЛТЭД ОГТ НӨЛӨӨЛӨХГҮЙ: хадгалалт нь QAQC хүснэгтийн ӨӨРИЙН
 *    `ObjectID`-гаар явдаг тул мод зөрсөн ч утга буруу мөрд хэзээ ч
 *    бичигдэхгүй — энэ холбоос ердөө эгнүүлэлт ба эвхэлтэд зориулагдсан.
 */
export function attachTree(
  rows: readonly QaqcRow[],
  sheet: readonly TreeRow[],
): QaqcRow[] | null {
  if (rows.length === 0 || rows.length !== sheet.length) return null;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].work !== s(sheet[i].work)) return null;
  }
  return rows.map((r, i) => ({
    ...r,
    depth: Number.isFinite(sheet[i].depth) ? Math.max(0, sheet[i].depth) : 0,
    group: !!sheet[i].group,
  }));
}

type Feat = { attributes: Record<string, unknown> };

/**
 * Хүснэгтийн БОДИТ талбарууд — нэр → тэмдэгтийн дээд урт (`null` = мэдэгдэхгүй).
 * Байхгүй багана асуувал query бүхэлдээ унана.
 * ⚠️ 2026-10-09: `fields[].length`-ийг ч авна — урьд нь оролтын дээд урт нь дурын
 *    4000 байсан тул талбараас урт утга бичих гэж оролдоод ArcGIS-ийн ерөнхий
 *    алдаагаар (аль нүд гэдэг нь тодорхойгүй) бүх хадгалалт унадаг байв.
 */
async function fieldsOf(url: string): Promise<Map<string, number | null>> {
  const j = await agsFetch(url, {});
  const fs = (j.fields ?? []) as { name?: string; length?: unknown }[];
  return new Map(fs.map((f) => {
    const n = Number(f.length);
    return [String(f.name), Number.isInteger(n) && n > 0 ? n : null] as [string, number | null];
  }));
}

/** Баримтын баганын дээд урт — `QAQC_COLS`-той ИЖИЛ дараалал; `null` = мэдэгдэхгүй/багана алга */
const maxLenOf = (have: ReadonlyMap<string, number | null>): (number | null)[] =>
  QAQC_COLS.map((c) => have.get(c.name) ?? null);

/** Ачаалсан хуудас — мөрүүд ба баганын дээд урт */
export type QaqcSheet = { rows: QaqcRow[]; maxLen: (number | null)[] };

/**
 * Багцын QAQC хүснэгтийг БҮТНЭЭР татна.
 *
 * ⚠️ `outFields=*` ХЭРЭГЛЭХГҮЙ: хүснэгтүүд 74–113 баганатай (F13…F99 гэсэн
 *    excel-ийн өргөн блокууд) тул 1,400 мөрийн бүтэн татац хэдэн МБ болно.
 *    Зөвхөн харуулах/засах багануудыг нэрээр нь асууна.
 * ⚠️ Талбарын бүрдэл хүснэгт бүрд ЗӨРНӨ (Багц 2-т `Гүйцэтгэл`, Багц 3.2-т
 *    `Бодит_гүйцэтгэл`…) тул хүсэлт бичихийн ӨМНӨ бодит нэрсийг татаж
 *    огтлолцлыг нь авна.
 * ⚠️ 2000 мөрийн хуудаслалт — `orderByFields` ЗААВАЛ, эс бөгөөс ArcGIS хуудас
 *    хооронд мөр давхардуулах/алгасах эрхтэй.
 */
export async function loadQaqcRows(pkgKey: string): Promise<QaqcRow[]> {
  return (await loadQaqcSheet(pkgKey)).rows;
}

/** `loadQaqcRows` + баганын дээд урт (⚠️ 2026-10-09, `fieldsOf`-ийн ⚠️) — «Чанар» харагдац */
export async function loadQaqcSheet(pkgKey: string): Promise<QaqcSheet> {
  const ref = qaqcTableOf(pkgKey);
  if (!ref) throw new Error(tr('Энэ багцын QAQC хүснэгт тодорхойлогдоогүй байна.'));
  const url = qaqcUrl(ref);
  const have = await fieldsOf(url);
  const want = [OID, ...INFO_FIELDS, ...QAQC_COLS.map((c) => c.name)].filter((f) => have.has(f));
  if (!want.includes(OID)) throw new Error(tr('QAQC хүснэгтэд ObjectID талбар алга.'));

  const feats: Feat[] = [];
  /*
   * ⚠️ ХУУДСЫГ ИРСЭН МӨРИЙН ТООГООР ахиулна, тогтмол 2000-аар БИШ; тасрахыг
   *    нь `exceededTransferLimit`-ээр шийднэ (2026-09-15-ны аудит).
   *
   *    Урьд нь `off += 2000` + `f.length < 2000` байв. Үйлчилгээний
   *    `maxRecordCount` 2000-аас БАГА бол (1000 нь ArcGIS-ийн түгээмэл
   *    анхдагч) эхний хуудас 1000 мөр буцаад давталт ЗОГСОНО: `attachTree`
   *    шатлалаа холбож чадахгүй (`rows.length !== sheet.length`), хуудас
   *    хавтгай зурагдаж, ачаалагдаагүй мөрүүдэд акт бөглөх БОЛОМЖГҮЙ болно.
   *    Хэрэв сервер тасалдаггүй ч хуудас дүүргэдэггүй бол алгасалт үүснэ.
   */
  for (let off = 0; ; ) {
    const j = await agsFetch(`${url}/query`, {
      where: '1=1',
      outFields: want.join(','),
      orderByFields: `${OID} ASC`,
      resultOffset: String(off),
      resultRecordCount: '2000',
      returnGeometry: 'false',
    });
    const f = (j.features ?? []) as Feat[];
    feats.push(...f);
    if (!j.exceededTransferLimit || f.length === 0) break;
    off += f.length;
  }
  return { rows: toRows(feats), maxLen: maxLenOf(have) };
}

/** Мөрийн атрибутаас баримтын 9 утга — `toRows` ба `fetchQaqcDocs` НЭГ дүрэм */
const docsOf = (a: Record<string, unknown>): (string | null)[] =>
  /* ⚠️ Хоосон тэмдэгт мөрийг `null` болгоно — «бөглөгдөөгүй» тооллого нь
     хоёуланг нэг гэж үзэх ёстой (эх өгөгдөлд хоёул тохиолддог). */
  QAQC_COLS.map((c) => {
    const v = a[c.name];
    return v == null || s(v) === '' ? null : String(v);
  });

/** Түүхий `features` → дэлгэцийн мөрүүд (шалгуур энэ функцийг шууд дуудна). */
export function toRows(feats: readonly Feat[]): QaqcRow[] {
  const out: QaqcRow[] = [];
  for (const f of feats) {
    const a = f.attributes;
    /* ⚠️ `Number(null)` нь `0` буюу ХҮЧИНТЭЙ тоо — `== null`-ыг ТУСАД НЬ
       шалгана, эс бөгөөс ObjectID-гүй мөр 0 дугаартай болж, хадгалахад
       үйлчилгээний 0 дугаартай (эсвэл байхгүй) мөр рүү бичих оролдлого болно. */
    if (a[OID] == null) continue;
    const oid = Number(a[OID]);
    if (!Number.isInteger(oid)) continue;
    const no = s(a.F_);
    const work = s(a['Ажил']);
    if (!isDataRow({ no, work })) continue;   // excel-ийн толгойн мөрүүд
    out.push({
      oid,
      no,
      work,
      des: s(a.Des_dugaar),
      /* ⚠️ Шатлал нь ЭНД тодорхойлогдохгүй — `attachTree` бөглөх хуудасны
         модыг холбоно. Хавтгай (0) нь «мод холбогдоогүй» гэсэн ҮНЭН төлөв. */
      depth: 0,
      group: false,
      docs: docsOf(a),
    });
  }
  return out;
}

/** Бөглөгдсөн нүдний тоо — толгойн хураангуйд */
export const filledCount = (rows: readonly QaqcRow[]): number =>
  rows.reduce((n, r) => n + r.docs.filter((d) => d != null).length, 0);

/* ══════════════════ EXCEL-ЭЭС НААХ ══════════════════ */

/** Нэг нүдний зорилт: аль мөрийн ObjectID, аль баганын индекс, ямар текст */
export type QaqcHit = { oid: number; di: number; v: string };

export type QaqcPastePlan = {
  hits: QaqcHit[];
  /** Байрлалаа эзэлсэн ч бичигдээгүй нүд (хоосон, хүснэгтээс хальсан, хязгаараас давсан) */
  skipped: number;
};

/**
 * Санамсаргүй асар том буулгалтаас хамгаална (бүтэн хуудас хуулах).
 * ⚠️ Хязгаараас хэтэрсэн хэсэг нь `skipped` болж ТООЛОГДОНО — чимээгүй
 *    алга болохгүй, хэрэглэгчид тоогоор нь мэдэгдэнэ.
 */
export const QAQC_PASTE_MAX = 5000;

/**
 * EXCEL-ЭЭС ХУУЛСАН БЛОКИЙГ БАРИМТЫН НҮДНҮҮДЭД БАЙРЛУУЛНА.
 *
 * ⚠️ ЯАГААД (2026-09-06, хэрэглэгчийн хүсэлт «гүйцэтгэл бөглөхөөс авах чадварууд»):
 *    М-актын дугаарууд excel дээр аль хэдийн бэлэн байдаг; 1,370 мөрийг
 *    нэг нэгээр нь бичих нь тэвчихийн аргагүй. Бөглөх хуудасны `planPaste`-ийн
 *    ЯГ ижил зарчим, гэхдээ утга нь ТООН биш ТЕКСТ.
 *
 * ⚠️ БАЙРЛАЛААР нь буулгана: буулгасан мөр бүр ДЭЛГЭЦЭД ХАРАГДАХ дараагийн
 *    мөрд тохирно (`vis`), багана нь эхэлсэн баганаас баруун тийш. Хальсан
 *    нүд байрлалаа ЭЗЭЛНЭ — алгасвал доорх бүх утга нэг мөр дээшилж,
 *    чимээгүй БУРУУ мөрд бичигдэнэ.
 *
 * ⚠️ ХООСОН нүд нь «устга» ГЭСЭН УТГАГҮЙ — алгасна. Excel-ийн блокт хоосон
 *    нүд элбэг тохиолддог тул устгал гэж үзвэл бөглөсөн баримт бөөнөөрөө
 *    арилна.
 *
 * ⚠️ Бүлгийн мөрд Ч бичигдэнэ: М-акт, FIC нь ажлын БҮЛЭГТ олгогдож болно
 *    (нүдээр гараар бичихийг ч хориглодоггүй).
 *
 * @param rows   Хуудсанд ачаалагдсан БҮХ мөр
 * @param vis    Харагдаж буй мөрүүдийн индекс (`rows`-ийн дугаараар)
 * @param startVi Эхлэх нүдний байрлал `vis` доторх индексээр
 * @param startDi Эхлэх баримтын баганын индекс
 */
export function planQaqcPaste(
  rows: readonly QaqcRow[],
  vis: readonly number[],
  startVi: number,
  startDi: number,
  grid: readonly (readonly string[])[],
): QaqcPastePlan {
  const hits: QaqcHit[] = [];
  let skipped = 0;
  let seen = 0;
  for (let gr = 0; gr < grid.length; gr += 1) {
    const vi = startVi + gr;
    for (let gc = 0; gc < grid[gr].length; gc += 1) {
      seen += 1;
      if (seen > QAQC_PASTE_MAX) { skipped += 1; continue; }
      const di = startDi + gc;
      if (vi < 0 || vi >= vis.length || di >= QAQC_COLS.length) { skipped += 1; continue; }
      const r = rows[vis[vi]];
      if (!r) { skipped += 1; continue; }
      const v = String(grid[gr][gc] ?? '').trim();
      if (!v) { skipped += 1; continue; }
      /* ⚠️ 2026-10-09: ТАСЛАХГҮЙ (урьд нь дурын `slice(0, 4000)`) — таслагдсан дугаар/нэр
         нь ЧИМЭЭГҮЙ буруу утга. Талбараас урт утгыг хадгалахын өмнө `qaqcTooLong`
         нүдээр нь нэрлэж зогсооно. */
      hits.push({ oid: r.oid, di, v });
    }
  }
  return { hits, skipped };
}

/**
 * Засварыг ХҮСНЭГТИЙН МӨРӨӨР бүлэглэнэ.
 *
 * @param pend `«ObjectID:баганын индекс» → текст`
 * @param known Хуудсанд ачаалагдсан ObjectID-ууд (заавал биш)
 *
 * ⚠️ ЗӨВХӨН ЗАССАН баганыг илгээнэ. Бүтэн мөр буцааж бичвэл хооронд нь өөр
 *    хүний бөглөсөн багана `null`-аар дарагдана.
 * ⚠️ Хоосон мөр → `null`, `''` БИШ: ArcGIS-д хоосон тэмдэгт мөр ба NULL хоёр
 *    өөр бөгөөд хайлт, тайланд өөрөөр биелдэг.
 * ⚠️ Үл мэдэх багана/мөрийг ЧИМЭЭГҮЙ алгасахгүй — `skipped` болгож буцаана,
 *    дуудагч нь хадгалалтыг зогсооно. Байхгүй мөр рүү бичвэл сервер алдаа
 *    буцаана, эсвэл хуудсыг бохирдуулна.
 */
export function qaqcUpdates(
  pend: Record<string, string>,
  known?: ReadonlySet<number>,
): { updates: Record<string, unknown>[]; skipped: string[] } {
  const byOid = new Map<number, Record<string, unknown>>();
  const skipped: string[] = [];
  for (const [pk, text] of Object.entries(pend)) {
    const cut = pk.lastIndexOf(':');
    const oid = Number(pk.slice(0, cut));
    const fld = QAQC_COLS[Number(pk.slice(cut + 1))]?.name;
    /* ⚠️ `cut <= 0` (2026-09-15-ны аудит): `cut === 0` бол OID хэсэг нь ХООСОН
       мөр бөгөөд `Number('') === 0`, `Number.isInteger(0)` нь ҮНЭН тул
       ObjectID **0** руу бичих хүсэлт үүсдэг байв. ArcGIS-д 0 нь хүчинтэй
       дугаар байж болзошгүй тул чимээгүй буруу мөр засагдана. */
    if (cut <= 0 || !Number.isInteger(oid) || !fld || (known && !known.has(oid))) {
      skipped.push(pk);
      continue;
    }
    const a = byOid.get(oid) ?? { [OID]: oid };
    a[fld] = text.trim() || null;
    byOid.set(oid, a);
  }
  return { updates: [...byOid.values()], skipped };
}

/** `«ObjectID:баганын индекс»` → [oid, di]; буруу түлхүүрт `null` (`qaqcUpdates`-ийн ⚠️ `cut <= 0`) */
const splitKey = (pk: string): [number, number] | null => {
  const cut = pk.lastIndexOf(':');
  const oid = Number(pk.slice(0, cut));
  const di = Number(pk.slice(cut + 1));
  if (cut <= 0 || !Number.isInteger(oid) || !Number.isInteger(di) || di < 0 || di >= QAQC_COLS.length) return null;
  return [oid, di];
};

/** Талбарт багтахгүй нүд */
export type QaqcTooLong = { key: string; oid: number; di: number; len: number; max: number };

/**
 * ТАЛБАРЫН УРТААС ХЭТЭРСЭН НҮД — хадгалахын ӨМНӨ (⚠️ 2026-10-09).
 * ⚠️ Урт нь `qaqcUpdates`-ийн илгээх утгаар (`trim`) хэмжигдэнэ. Дээд урт
 *    мэдэгдэхгүй (`null`) баганыг шалгахгүй — сервер өөрөө татгалзана.
 * ⚠️ ТАСЛАХГҮЙ, зогсооно: таслагдсан акт/баримтын дугаар нь чимээгүй худал.
 */
export function qaqcTooLong(
  pend: Readonly<Record<string, string>>,
  maxLen: readonly (number | null)[],
): QaqcTooLong[] {
  const out: QaqcTooLong[] = [];
  for (const [key, text] of Object.entries(pend)) {
    const kd = splitKey(key);
    if (!kd) continue;
    const max = maxLen[kd[1]];
    const len = text.trim().length;
    if (max != null && len > max) out.push({ key, oid: kd[0], di: kd[1], len, max });
  }
  return out;
}

/** Ачаалсны ДАРАА серверт өөрчлөгдсөн нүд; `gone` = мөр нь серверт алга болсон */
export type QaqcConflict = {
  key: string; oid: number; di: number;
  base: string | null; live: string | null; gone: boolean;
};

/**
 * ЗЭРЭГ ЗАСВАРЫН ЗӨРЧИЛ — хадгалахын ӨМНӨ (⚠️ 2026-10-09).
 *
 * ⚠️ ЯАГААД: `saveQaqc` нь нөхцөлгүй `updates` илгээдэг тул хуудсыг ачаалсны
 *    ДАРАА өөр хүн (өөр төхөөрөмж) бөглөсөн утгыг энэ табын хуучин суурин дээрх
 *    засвар ЧИМЭЭГҮЙ дардаг байв. Одоо бичихийн өмнө хөндөх мөрүүдийг дахин уншиж
 *    (`fetchQaqcDocs`), ачаалах үед харсан утгаас (`base`) ӨӨРЧЛӨГДСӨН нүдийг
 *    бичихгүй — дуудагч тэднийг хадгалаагүй засвар хэвээр үлдээж, нэрлэнэ.
 * ⚠️ Жишилт `trim`-тэй, `null` = `''` (`commit`-ийн ижил дүрэм).
 * ⚠️ Сервер аль хэдийн ЯГ энэ утгатай бол зөрчил БИШ (бичсэн ч үр дүн ижил).
 * ⚠️ Мөр нь серверт алга (`live`-д байхгүй) бол зөрчил — устгагдсан мөр рүү бичихгүй.
 * ⚠️ Буруу түлхүүрийг энд алгасна — тэднийг `qaqcUpdates`-ийн `skipped` барина.
 */
export function qaqcConflicts(
  pend: Readonly<Record<string, string>>,
  base: ReadonlyMap<number, readonly (string | null)[]>,
  live: ReadonlyMap<number, readonly (string | null)[]>,
): QaqcConflict[] {
  const norm = (v: string | null | undefined) => (v ?? '').trim();
  const out: QaqcConflict[] = [];
  for (const [key, text] of Object.entries(pend)) {
    const kd = splitKey(key);
    if (!kd) continue;
    const [oid, di] = kd;
    const b = base.get(oid)?.[di] ?? null;
    const lr = live.get(oid);
    if (!lr) { out.push({ key, oid, di, base: b, live: null, gone: true }); continue; }
    const l = lr[di] ?? null;
    if (norm(l) === norm(b) || norm(l) === text.trim()) continue;
    out.push({ key, oid, di, base: b, live: l, gone: false });
  }
  return out;
}

/**
 * ХӨНДӨХ МӨРҮҮДИЙН ОДООГИЙН БАРИМТЫН 9 УТГА — `qaqcConflicts`-ийн `live` (⚠️ 2026-10-09).
 * ⚠️ `objectIds`-оор 500-аар хуваана; хариу тасарвал (`exceededTransferLimit`)
 *    ДУТУУ зураглалаар «мөр алга» гэж андуурахгүйн тулд ШИДНЭ.
 * ⚠️ Алдаа HTTP 200-аар ирдэг — `agsFetch` (`arcgisPost`) `{error}`-ийг шиднэ.
 * ⚠️ Зөвхөн УНШИЛТ — алдаа гарвал дуудагч юу ч бичихгүй зогсоно.
 */
export async function fetchQaqcDocs(
  pkgKey: string,
  oids: readonly number[],
): Promise<Map<number, (string | null)[]>> {
  const ref = qaqcTableOf(pkgKey);
  if (!ref) throw new Error(tr('Энэ багцын QAQC хүснэгт тодорхойлогдоогүй байна.'));
  const url = qaqcUrl(ref);
  const out = new Map<number, (string | null)[]>();
  const ids = [...new Set(oids)].filter((o) => Number.isInteger(o));
  if (!ids.length) return out;
  const have = await fieldsOf(url);
  const cols = QAQC_COLS.map((c) => c.name).filter((f) => have.has(f));
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const j = await agsFetch(`${url}/query`, {
      objectIds: chunk.join(','),
      outFields: [OID, ...cols].join(','),
      returnGeometry: 'false',
    });
    if (j.exceededTransferLimit) {
      throw new Error(tr('QAQC-ийн одоогийн утгыг бүрэн уншиж чадсангүй — засвар хадгалагдаагүй. Дахин оролдоно уу.'));
    }
    for (const f of (j.features ?? []) as Feat[]) {
      const a = f.attributes;
      if (a?.[OID] == null) continue;
      const oid = Number(a[OID]);
      if (Number.isInteger(oid)) out.set(oid, docsOf(a));
    }
  }
  return out;
}

/**
 * `applyEdits`-ийн `updates` параметрийн ТҮҮХИЙ утга.
 *
 * ⚠️ МӨР БҮР `{ attributes: {...} }` ДОТОР ОРНО. Атрибутыг нүцгэн массиваар
 *    илгээвэл ArcGIS «Cannot perform operation. Invalid operation parameters.»
 *    гэж унана — 2026-09-03-нд амьд шалгалтаар илэрсэн бөгөөд `agsFetch` нь
 *    түүнийг зөвхөн ЕРӨНХИЙ алдаа болгож дамжуулдаг тул шалтгаан нь кодоос
 *    уншигдахгүй байв. `bagtsSheet.applyUpdates` мөн ЯГ ижил дугтуй хэрэглэдэг.
 * ⚠️ Тусад нь ГАРГАСАН шалтгаан: дугтуйг шалгуур (`qaqc.check.mjs`) барих
 *    ёстой — сүлжээний функцийг тест дуудаж чадахгүй тул энэ нь эвдэрвэл
 *    зөвхөн бодит хэрэглэгч дээр илэрнэ.
 */
export const qaqcPayload = (updates: readonly Record<string, unknown>[]): string =>
  JSON.stringify(updates.map((attributes) => ({ attributes })));

/**
 * QAQC засварыг хадгална. Буцаах нь БОДИТООР бичигдсэн мөрийн тоо.
 *
 * ⚠️ Алдаа HTTP 200-аар ирдэг (ArcGIS-ийн занга) — мөр бүрийн `success`-ыг
 *    ЗААВАЛ шалгана, эс бөгөөс «хадгаллаа» гэж ХУДАЛ мэдээлнэ.
 * ⚠️ 500 мөрийн багцаар: `rollbackOnFailure` нь НЭГ БАГЦ дотор л үйлчилнэ —
 *    багц дундуур унавал өмнөх багцууд бичигдсэн хэвээр үлдэнэ, тиймээс
 *    алдааны мессежид хэдэн мөр амжсаныг ХЭЛНЭ. Дуудагч мөрүүдээ дахин татах
 *    ёстой (эс бөгөөс дэлгэц ба өгөгдөл зөрнө).
 */
/**
 * LIB-ТҮВШНИЙ ЭРХИЙН ШАЛГУУР — `qaqc` эрх + БАГЦЫН ХҮРЭЭ (2026-09-21).
 *
 * ⚠️ Урьд нь `saveQaqc` эрхээ ЗӨВХӨН UI-д (`Qaqc.tsx`-ийн `canEdit`) шалгадаг
 *    байв — консолоос дуудсан хэн ч ArcGIS руу бичиж чаддаг. `zovshoorol.saveZov`
 *    · `parcelEdit.saveParcel` · `tableWrite.applyAll`-ийн (2026-09-17) ижил
 *    загвар: `who.requireCap` + энд нэмээд `qaqcScope` — учир нь QAQC эрх нь
 *    БАГЦААР хуваарилагддаг («Багц 2»-ын ажилтан «Багц 5»-ын актыг ХАРНА,
 *    ЗАСАХГҮЙ). Дүрэм нь `Qaqc.tsx`-ийн `canEdit`-тэй ЯГ ижил:
 *      · `null` = хязгааргүй (super, «бүх багц»); `[]` = нэг ч багц.
 *      · Хатуу super ба нэвтрэлт унтраалттай (`AUTH.appId` хоосон) орчин —
 *        хүрээ үл хамаарна (`caps.hasCap`-ийн ижил үндэслэл).
 * ⚠️ Зөвхөн ХӨТӨЧИД (`requireCap`-тэй ижил): Node тест/tools админ токеноор.
 * ⚠️ `updates` ХООСОН ч шалгана — эрхгүй дуудлага юу ч илгээхээс өмнө унана.
 */
export function assertQaqcWrite(pkgKey: string): void {
  requireCap('qaqc');
  if (typeof window === 'undefined' || !AUTH.appId) return;
  const me = currentUser();
  if (roleForUser(me) === 'super') return;
  const sc = qaqcScope(me);
  if (sc === null) return;
  const group = PKGS.find((p) => p.key === pkgKey)?.group;
  if (!group || !sc.includes(group)) {
    throw new Error(tr('«{0}» багц танд хуваарилагдаагүй тул QAQC засвар хадгалагдахгүй.', group ?? pkgKey));
  }
}

export async function saveQaqc(
  pkgKey: string,
  updates: Record<string, unknown>[],
): Promise<number> {
  /* ⚠️ Эрх ЭХЛЭЭД (2026-09-21) — `updates` хоосон ч эрхгүй дуудлага унана */
  assertQaqcWrite(pkgKey);
  if (!updates.length) return 0;
  const ref = qaqcTableOf(pkgKey);
  if (!ref) throw new Error(tr('Энэ багцын QAQC хүснэгт тодорхойлогдоогүй байна.'));
  const url = `${qaqcUrl(ref)}/applyEdits`;
  let done = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    /* ⚠️ 2026-10-06 аудит: СҮЛЖЭЭНИЙ алдаа (2+ дахь багц) урьд нь түүхийгээр шидэгддэг тул өмнөх
       багцууд аль хэдийн бичигдсэнийг хэрэглэгч мэддэггүй байв — `bad`-ийн мессежтэй ижил хэлбэрээр
       хадгалагдсан мөрийн тоог хавсаргана. Эхний багц (`done === 0`) бол түүхий хэвээр — юу ч бичигдээгүй. */
    let j: Record<string, unknown>;
    try {
      j = await agsFetch(url, {
        updates: qaqcPayload(chunk),
        rollbackOnFailure: 'true',
      });
    } catch (e) {
      if (done > 0) throw new Error(tr('{0} ({1} мөр хадгалагдсан)', String((e as Error)?.message || e), done));
      throw e;
    }
    const res = (j.updateResults ?? []) as {
      success?: boolean;
      error?: { description?: string };
    }[];
    /* ⚠️ `success !== true` (2026-09-08): урьд нь ЗӨВХӨН `=== false`-ыг
       шалгадаг байсан тул `success` талбар БАЙХГҮЙ хариу чимээгүй давдаг. */
    const bad = res.find((r) => r.success !== true);
    if (bad) {
      throw new Error(
        tr('{0} ({1} мөр хадгалагдсан)', bad.error?.description || tr('QAQC хадгалалт амжилтгүй'), done),
      );
    }
    /* ⚠️ ХООСОН/ДУТУУ `updateResults` нь АЛДАА (2026-09-08): ArcGIS алдаагаа
       HTTP 200-аар буцаадаг тул бичилт хэрэгжээгүй үед `updateResults` огт
       ирэхгүй байж болно. Урьд нь `res = []` бол `find` нь `undefined` буцааж,
       `done += 0` хийгээд «0 мөр хадгалагдлаа» гэсэн НОГООН амжилт харуулж,
       дуудагч нь локал БА алсын ноорогийг устгаснаар бөглөсөн ажил бүрмөсөн
       алга болдог байв. */
    if (res.length !== chunk.length) {
      throw new Error(
        tr('QAQC хадгалалт баталгаажсангүй: {0} мөр илгээснээс {1} мөрийн хариу ирлээ ({2} мөр хадгалагдсан). Хуудсыг дахин ачаална уу — засвар хадгалагдаагүй байж магадгүй.', chunk.length, res.length, done),
      );
    }
    done += res.length;
  }
  return done;
}
