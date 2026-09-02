// БАГЦУУДЫН БҮРТГЭЛ ба талбарын нэрийг АЖИЛЛАХ ҮЕДЭЭ таних логик.
//
// ⚠️ Багц бүрийн үйлчилгээ ӨӨР талбарын нэртэй: AGOL нь excel-ийн толгойн
// мөрөөс автоматаар нэр үүсгэдэг тул доогуур зураасны тоо, «-шинэ» дагавар,
// бүр бичээсийн алдаа (`Төлөвлөгөөт_гүйцтэгэл`) хүртэл багц бүрд зөрдөг.
// Мөн блокийн тоо 8 · 11 · 12 · 22 гэж өөр, зарим багцад «Төлөвлөгөө биелэлт»
// багана огт байхгүй.
//
// Тиймээс нэрийг ХАТУУ бичихгүй — үйлчилгээний метадатагаас нь ХЭВ ШИНЖЭЭР
// таньж авна. Ингэснээр шинэ багц нэмэгдэхэд зөвхөн `PKGS`-д мөр нэмнэ.

import { agsFetch } from "./ags";

const HJ = "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services";

export type Pkg = {
  /** `bagts.trees.ts`-ийн түлхүүр — мөрийн модыг үүгээр олно */
  key: string;
  /**
   * Багцын нэр. ⚠️ Бичлэг нь «Гүйцэтгэл бөглөх» табын `bagts` талбартай ЯГ
   * ижил (4-1, 4-2 нь цэгээр биш ЗУРААСААР) — хоёр таб нэг нэрийг харуулна.
   */
  group: string;
  /** Давхрын хувилбар: багц бүр 9 ба 12 давхрын тусдаа хуудастай байж болно */
  floors: 9 | 12;
  label: string;
  url: string;
};

/**
 * ⚠️ ДАРААЛАЛ нь сонгогчид харагдах дараалал. `key` нь `TREES`-ийн түлхүүртэй
 * ЯГ таарна — зөрвөл мод буруу багцад наалдана.
 */
export const PKGS: Pkg[] = [
  { key: "b1_9f", group: 'Багц 1', floors: 9, label: 'Багц 1 · 9 давхар', url: `${HJ}/Bagts_1_9f/FeatureServer/0` },
  { key: "b1_12f", group: 'Багц 1', floors: 12, label: 'Багц 1 · 12 давхар', url: `${HJ}/Bagts_1_12f/FeatureServer/0` },
  { key: "b2_9f", group: 'Багц 2', floors: 9, label: 'Багц 2 · 9 давхар', url: `${HJ}/Bagts_2_9f/FeatureServer/0` },
  { key: "b2_12f", group: 'Багц 2', floors: 12, label: 'Багц 2 · 12 давхар', url: `${HJ}/Bagts_2_12f/FeatureServer/0` },
  { key: "b31_9f", group: 'Багц 3.1', floors: 9, label: 'Багц 3.1 · 9 давхар', url: `${HJ}/Bagts_3_1_9f/FeatureServer/0` },
  { key: "b32_9f", group: 'Багц 3.2', floors: 9, label: 'Багц 3.2 · 9 давхар', url: `${HJ}/Bagts_3_2_9f/FeatureServer/0` },
  { key: "b33_9f", group: 'Багц 3.3', floors: 9, label: 'Багц 3.3 · 9 давхар', url: `${HJ}/Bagts_3_3_9f/FeatureServer/0` },
  { key: "b41_9f", group: 'Багц 4-1', floors: 9, label: 'Багц 4-1 · 9 давхар', url: `${HJ}/Bagts_4_1_9f/FeatureServer/0` },
  { key: "b42_9f", group: 'Багц 4-2', floors: 9, label: 'Багц 4-2 · 9 давхар', url: `${HJ}/Bagts_4_2_9f/FeatureServer/0` },
  { key: "b42_12f", group: 'Багц 4-2', floors: 12, label: 'Багц 4-2 · 12 давхар', url: `${HJ}/Bagts_4_2_12f/FeatureServer/0` },
];

/** Сонгогчид харагдах 7 багц — давхрын хувилбарууд нь дотроо. */
export const PKG_GROUPS: string[] = [...new Set(PKGS.map((p) => p.group))];

/** Тухайн багцын давхрын хувилбарууд (1 эсвэл 2). */
export const pkgFloors = (group: string): Pkg[] =>
  PKGS.filter((p) => p.group === group);

/** Багцын талбарын БҮДҮҮВЧ — нэр бүхэн үйлчилгээнээс танигдсан. */
/**
 * БАРИМТ БИЧГИЙН ТЕКСТ БАГАНУУД — 2026-08-28-нд 10/10 үйлчилгээнд нэмэгдсэн.
 *
 * ⚠️ Мөр тус бүрд НЭГ утга (блокоор БИШ) — тухайн ажлын М-акт, FIC, MA, MIR
 * бичиг баримтын дугаар/нэр. Бүгд `String(4000)`, эхлээд бүгд ХООСОН.
 *
 * ⚠️ Дараалал нь хуудсанд ЗУРАГДАХ дараалал. Талбар байхгүй үйлчилгээнд
 * `Schema.docs`-д `null` орж, тэр багана «засагдахгүй» болно (унахгүй).
 */
export const DOC_COLS: { name: string; label: string; short: string }[] = [
  { name: 'Makt_dugaar', label: 'М-акт — М-актын №', short: 'М-актын №' },
  { name: 'Makt_ner', label: 'М-акт — М-актын нэр', short: 'М-актын нэр' },
  { name: 'Makt_havsralt', label: 'М-акт — Хавсралт бичиг баримт', short: 'Хавсралт бичиг баримт' },
  { name: 'FIC_dugaar', label: 'FIC — FIC дугаар', short: 'FIC дугаар' },
  { name: 'FIC_ner', label: 'FIC — FIC нэр', short: 'FIC нэр' },
  { name: 'MA_dugaar', label: 'MA Material Approval — MA дугаар', short: 'MA дугаар' },
  { name: 'MA_ner', label: 'MA Material Approval — MA нэр', short: 'MA нэр' },
  { name: 'MIR_dugaar', label: 'MIR — MIR дугаар', short: 'MIR дугаар' },
  { name: 'MIR_ner', label: 'MIR — MIR нэр', short: 'MIR нэр' },
];

/**
 * ТОЛГОЙН БҮЛЭГЛЭЛТ — excel-ийн эх загвартай ЯГ ижил.
 *
 *   ┌──────────────── Inspection Test Plan ────────────────┐
 *   │  М-акт (3)  │ FIC (2) │ MA Material Approval (2) │ MIR (2) │
 *   │ №│нэр│хавсралт│ №│нэр  │ №│нэр                   │ №│нэр   │
 *
 * ⚠️ `count`-ийн нийлбэр нь `DOC_COLS.length`-тэй ЗААВАЛ тэнцүү байна —
 * зөрвөл толгойн нүд баганатайгаа таарахгүй болж хүснэгт бүхэлдээ гулсана.
 */
export const DOC_BAND = 'Inspection Test Plan';
export const DOC_GROUPS: { label: string; count: number }[] = [
  { label: 'М-акт', count: 3 },
  { label: 'FIC', count: 2 },
  { label: 'MA Material Approval', count: 2 },
  { label: 'MIR', count: 2 },
];

export type Schema = {
  /** Блокийн шошго — «5/1», «6/8», «29/3» г.м. Excel-ийн толгойтой ижил. */
  bld: string[];
  /** Блок тус бүрийн БОДИТ гүйцэтгэлийн талбар (засварлагдана) */
  act: string[];
  /** Блок тус бүрийн ТӨЛӨВЛӨГӨӨТ талбар */
  plan: string[];
  /**
   * Блок тус бүрийн ХУРИМТЛАГДСАН ОБЬЁМ (`F<цуваа>_<блок>…obyem`) — 2026-08-20-нд
   * үйлчилгээнд нэмэгдсэн. Гүйцэтгэлийн хувийг ЭНДЭЭС бодно:
   *     хувь = хуримтлагдсан обьём ÷ мөрийн `Обьём`
   *
   * ⚠️ Багц 4-2·9F-д зөвхөн 8 багана (`F5_1_9obyem…F5_8_9obyem`) үүссэн атлаа
   *    хуудас нь 14 блоктой — F6 цувааны 8 блокт талбар БАЙХГҮЙ тул `null`.
   *    Тэдгээр нүд обьёмоор бөглөгдөхгүй (AGOL дээр багана нэмж өгөх ёстой).
   */
  obyem: (string | null)[];
  /** ⚠️ Огноо дутуу блок бий (Багц 3.1-ийн 5/2) — тэнд `null` */
  start: (string | null)[];
  end: (string | null)[];
  /**
   * `DOC_COLS`-той ИЖИЛ дараалалтай талбарын нэрс. Үйлчилгээнд байхгүй
   * баганад `null` — тэр багана харагдах ч засагдахгүй.
   */
  docs: (string | null)[];
  /** Мөрийн скаляр талбарууд. Байхгүй бол `null`. */
  f: {
    no: string;
    work: string;
    wC: string;
    wD: string;
    wE: string | null;
    vol: string;
    obyemSum: string | null;
    /**
     * «Объём_шинэ2» — 2026-08-19-нд үйлчилгээнд нэмэгдсэн ХОЁР ДАХЬ обьём.
     * ⚠️ Бичлэг нь хуучин `Обьём`-оос ЯЛГААТАЙ: зөөлний тэмдэг биш ХАТУУГИЙН
     *   тэмдэг (Объём). Тиймээс `vol`-ийн шүүлтүүрт огт баригдахгүй.
     * ⚠️ Багц 3.1-д БАЙХГҮЙ — тэнд `null`, багана хоосон харагдана.
     */
    unit: string;
    money: string;
    plan: string;
    act: string;
    /** ⚠️ Багц 1·12F, 2·12F-д БАЙХГҮЙ — тэнд биелэлтийг зөвхөн энд боддог */
    ratio: string | null;
    /** ⚠️ Багц 4.2·9F-д толгой нь хоосон тул `F68` гэж нэрлэгдсэн */
    asOf: string | null;
    /**
     * БӨГЛӨСӨН ОГНОО (`buglusun_ognoo`) — 2026-08-20-нд нэмэгдсэн, АРХИВЫН
     * түлхүүр. Нийтлэх бүрд хуудас бүхэлдээ доор нь ХУУЛБАРЛАГДАЖ нэмэгдэх
     * бөгөөд мөр бүрд тухайн өдрийн огноо бичигдэнэ. Огноогоор шүүхэд тэр
     * агшны бүтэн зураг гарна.
     *
     * ⚠️ Хуучин `asOf` («Шинэчлэгдсэн огноо») нь ЗӨВХӨН 1-р мөрд бичигддэг
     *    excel-ийн лавлах нүд — агшин ялгах түлхүүр БОЛОХГҮЙ.
     */
    fillDate: string | null;
    /**
     * ШАТЛАЛ (0–4) — мөр бүрийн модны гүн.
     *
     * ⚠️ 2026-08-27-нд `tools/bagts-gun.mjs`-ээр нэмэгдсэн. Урьд нь шатлал нь
     * ЗӨВХӨН `bagts.trees.ts` дахь тогтмол тэмдэгтийн мөрөөс, БАЙРЛАЛААР
     * гардаг байв — тиймээс хуудсанд мөр нэмэх боломжгүй байлаа (мөрийн тоо
     * зураглалын урттай зөрөнгүүт хуудас нээгдэхээ болино).
     *
     * ⚠️ Багана нэмэгдсэн ч утга нь ЭХЛЭЭД ХООСОН — багц бүрийг нэг удаа
     * нийтлэхэд `FillNew.publish` мөр бүрд гүнийг нь бичиж дүүргэнэ. Тэр
     * хүртэл `loadRows` нь `TREES`-рүү нөөцлөн буцна.
     *
     * Багана огт үүсээгүй үйлчилгээнд `null`.
     */
    gun: string | null;
    /**
     * АЖЛЫН КОД (`Des_dugaar`) — 2026-09-02-нд 10/10 үйлчилгээнд нэмэгдсэн,
     * АГШИН бүрийн дотор 1…N (хуудасны дарааллаар, дээрээс доош).
     *
     * ⚠️ `no` (`F_`, «№») нь бүлэг бүрд 1-ЭЭС ДАХИН эхэлдэг шаталсан дугаар
     * тул давтагдана — Багц 1·9F-д «1» гэсэн утга 2,231 удаа тохиолдоно.
     * `des` нь харин жаазан дотор ДАВТАГДАХГҮЙ бөгөөд нэг ажил бүх агшинд
     * ижил утгатай тул агшин дамжсан ТОГТВОРТОЙ түлхүүр болно.
     *
     * ⚠️ Латин нэртэй тул `norm()`-ийн кирилл хайлтад орохгүй — шууд нэрээр.
     * Багана байхгүй үйлчилгээнд `null`, тэр үед багана хоосон харагдана.
     */
    des: string | null;
    /**
     * УЯЛДАА ХОЛБООС (`Hamaaral`, String 255) — 2026-09-03-нд 10/10
     * үйлчилгээнд нэмэгдсэн. «18FS3,22SS-5» хэлбэрээр урьдчилагчдыг
     * хадгална (код = `Des_dugaar`). Задлалт нь `src/lib/deps.ts`-д.
     * Багана байхгүй үйлчилгээнд `null` — уялдааны хэсэг зүгээр нуугдана.
     */
    ham: string | null;
    oid: string;
  };
};

export type FieldMeta = { name: string; type?: string };

/** Харьцуулахад бэлдэх: жижиг үсэг, доогуур зураас/зай хасах */
const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

/**
 * Үйлчилгээний талбаруудаас бүдүүвчийг угсарна.
 *
 * ⚠️ Блокийн талбар нь `F<цуваа>_<блок>_…` хэлбэртэй (`F5_1_гүйцэтгэл`,
 * `F5_1__гүйцэтгэл`, `F6_3_блок___12_давхар_төлөвлөгөөт`). ЦУВАА нь давхрын
 * тоог заана: Багц 4.2·9F-д F5 (9 давхар, 6 блок) ба F6 (12 давхар, 8 блок)
 * ХОЁУЛАА нэг хуудсанд бий — тиймээс блокийг «цуваа+дугаар» хосоор нь таньж,
 * зөвхөн цуваагаар нь БУСДЫГ нь дараад болохгүй.
 */
export function resolveSchema(fields: FieldMeta[]): Schema {
  const names = fields.map((x) => x.name);
  const byNorm = new Map<string, string>();
  for (const n of names) byNorm.set(norm(n), n);

  /** Эхний тохирох талбарыг нөхцлөөр */
  const find = (test: (n: string, raw: string) => boolean): string | null => {
    for (const raw of names) if (test(norm(raw), raw)) return raw;
    return null;
  };

  /* ── Блокийн талбарууд ── */
  type Slot = {
    act: string[];
    plan: string[];
    start: string[];
    end: string[];
    obyem: string[];
  };
  const blocks = new Map<string, Slot>();
  const order: { key: string; s: number; n: number }[] = [];
  for (const raw of names) {
    const m = /^F(\d+)_(\d+)_/.exec(raw);
    if (!m) continue;
    const key = `${m[1]}/${m[2]}`;
    let slot = blocks.get(key);
    if (!slot) {
      slot = { act: [], plan: [], start: [], end: [], obyem: [] };
      blocks.set(key, slot);
      order.push({ key, s: Number(m[1]), n: Number(m[2]) });
    }
    const tail = norm(raw.slice(m[0].length));
    // ⚠️ Дараалал чухал: «эхлэх/дуусах» нь «төлөвлөгөөт»-өөс ЭРТ шалгагдана,
    //    учир нь огнооны толгойд «барилга … Дуусах» гэж бичигдсэн байдаг.
    // ⚠️ Обьёмын бичлэг багц бүрд өөр: `F5_1_obyem` · `F5_1_9obyem` ·
    //    `F6_1_12_obyem` — бүгд латинаар төгсдөг тул доорх кирилл
    //    шалгууруудад баригдахгүй, тиймээс тэднээс өмнө шалгав.
    if (/obyem$/.test(tail)) slot.obyem.push(raw);
    else if (/дуусах$/.test(tail) || /дуусах\d+$/.test(tail)) slot.end.push(raw);
    else if (/эхлэх$/.test(tail)) slot.start.push(raw);
    else if (/төлөвлөгө/.test(tail)) slot.plan.push(raw);
    else if (/гүйцэтгэл/.test(tail)) slot.act.push(raw);
  }

  // Блок гэж тооцох нөхцөл: гүйцэтгэл БА төлөвлөгөөт хоёул бий.
  // ⚠️ Багц 4.2·12F-д 9 давхрын (F5_1..6) огноонууд ҮЛДЭГДЭЛ болж хоцорсон —
  //    гүйцэтгэл/төлөвлөгөө нь байхгүй тул энэ шүүлтүүрээр унана.
  const bld = order
    .filter(({ key }) => {
      const s = blocks.get(key)!;
      return s.act.length > 0 && s.plan.length > 0;
    })
    .sort((a, b) => a.s - b.s || a.n - b.n)
    .map((x) => x.key);

  const act: string[] = [];
  const plan: string[] = [];
  const start: (string | null)[] = [];
  const end: (string | null)[] = [];
  const obyem: (string | null)[] = [];
  for (const key of bld) {
    const s = blocks.get(key)!;
    act.push(s.act[0]);
    plan.push(s.plan[0]);
    // Обьёмын багана дутуу байж болно (Багц 4-2·9F) — тэнд нүд түгжигдэнэ.
    obyem.push(s.obyem[0] ?? null);
    // ⚠️ Багц 3.1-ийн 5/2 блокт ЭХЛЭХ баганын толгойг «Дуусах» гэж буруу
    //    бичсэн тул AGOL хоёр дахийг нь `…Дуусах1` болгосон. Эхлэх байхгүй
    //    атлаа дуусах хоёр байвал эхнийхийг нь ЭХЛЭХ гэж үзнэ (баганы дараалал).
    if (!s.start.length && s.end.length > 1) {
      start.push(s.end[0]);
      end.push(s.end[1]);
    } else {
      start.push(s.start[0] ?? null);
      end.push(s.end[0] ?? null);
    }
  }

  /* ── Скаляр талбарууд ── */
  // «Хувийн жин» гурав удаа давтагдана: C, D (дээд мөр/нийт) ба E (одоо байгаа).
  const weights = names.filter(
    (n) => norm(n).startsWith("хувийнжин") && !/одоо/.test(norm(n)),
  );
  const f: Schema["f"] = {
    no: byNorm.get("f") ?? "F_",
    work: byNorm.get("ажил") ?? 'Ажил',
    wC: weights[0] ?? 'Хувийн_жин',
    wD: weights[1] ?? weights[0] ?? 'Хувийн_жин1',
    wE: find((n) => n.startsWith("хувийнжин") && /одоо/.test(n)),
    /*
     * ⚠️ `2`-оор төгссөнийг ХАСНА. «Объём_шинэ2» гэсэн багана 10 үйлчилгээний
     * АЛЬ НЬ Ч БАЙХГҮЙ (2026.08.21-нд шалгав) бөгөөд байх ч ёсгүй. Хэрэв
     * хэзээ нэгэн цагт нэмэгдвэл `vol`-д санамсаргүй наалдахаас сэргийлнэ.
     */
    vol: find((n) => /^об[ьъ]ём/.test(n) && !/2$/.test(n)) ?? 'Обьём',
    /*
     * ОБЬЁМЫН НИЙЛБЭР — мөрийн блок бүрийн хуримтлагдсан обьёмын нийлбэр.
     * ⚠️ Үйлчилгээнд 2026.08.21-нд нэмэгдсэн ба БҮГД ХООСОН байсан. Нийтлэх
     * бүрд энэ програм бодож бичнэ; гараар засагдахгүй.
     * ⚠️ Нэр нь латинаар (`obyem_sum`) тул `norm()`-ийн кирилл хайлтад
     *    орохгүй — ШУУД нэрээр нь хайна.
     */
    obyemSum: names.includes('obyem_sum') ? 'obyem_sum' : null,
    unit: find((n) => n.startsWith("нэгжөртөг")) ?? 'Нэгж_өртөг',
    money: find((n) => n.startsWith("мөнгөндүн")) ?? 'Мөнгөн_дүн',
    // ⚠️ Гурван бичлэг: `Төлөвлөгөөт_гүйцэтгэл`, бичээсийн алдаатай
    //    `Төлөвлөгөөт_гүйцтэгэл` (Багц 2, 3.1), `…_гүйцэтгэлийн_хувь` (Багц 3.3, 4.x)
    plan:
      find((n) => /^төлөвлөгөөт(гүйцэтгэл|гүйцтэгэл)/.test(n)) ??
      'Төлөвлөгөөт_гүйцэтгэл',
    act:
      find((n) => /^(бодитгүйцэтгэл|гүйцэтгэл)/.test(n)) ?? 'Бодит_гүйцэтгэл',
    // ⚠️ Багц 4.1-д `Төлөвлөгөө_биеэлэлт` гэж бичигдсэн
    ratio: find((n) => /^төлөвлөгөөбие/.test(n)),
    // Толгойгүй үлдсэн бол AGOL `F<баганын дугаар>` гэж нэрлэдэг — огнооны
    // төрөлтэй, блокийн бус цорын ганц талбарыг нь шинэчлэгдсэн огноо гэж үзнэ.
    asOf:
      find((n) => n.startsWith("шинэчлэгдсэн")) ??
      fields.find((x) => /^F\d+$/.test(x.name) && x.type === "esriFieldTypeDate")
        ?.name ??
      null,
    fillDate: names.find((n) => /^buglusun_ognoo$/i.test(n)) ?? null,
    // ⚠️ Нэр нь латинаар (`gun`) тул `norm()`-ийн кирилл хайлтад орохгүй —
    //    ШУУД нэрээр нь хайна.
    gun: names.find((n) => /^gun$/i.test(n)) ?? null,
    // ⚠️ `Des_dugaar` мөн латин нэртэй — шууд нэрээр, том/жижиг үсэг үл ялгана.
    des: names.find((n) => /^des_dugaar$/i.test(n)) ?? null,
    ham: names.find((n) => /^hamaaral$/i.test(n)) ?? null,
    oid: names.find((n) => /^objectid$/i.test(n)) ?? "ObjectID",
  };

  /*
   * БАРИМТЫН БАГАНУУД — нэр нь ЛАТИНААР (`Makt_dugaar` г.м.) тул `norm()`-ийн
   * кирилл хайлтад орохгүй; шууд нэрээр нь, том/жижиг үсэг үл ялгаж хайна.
   */
  const docs = DOC_COLS.map(
    (c) => fields.find((x) => x.name.toLowerCase() === c.name.toLowerCase())?.name ?? null,
  );

  return { bld, act, plan, obyem, start, end, docs, f };
}

/** Үйлчилгээний талбарын жагсаалтыг татаж бүдүүвч болгоно (кэштэй). */
const cache = new Map<string, Promise<Schema>>();
export function loadSchema(pkg: Pkg): Promise<Schema> {
  const hit = cache.get(pkg.key);
  if (hit) return hit;
  const p = agsFetch(pkg.url, {})
    .then((j) => resolveSchema((j.fields ?? []) as FieldMeta[]))
    .catch((e) => {
      cache.delete(pkg.key);
      throw e;
    });
  cache.set(pkg.key, p);
  return p;
}
