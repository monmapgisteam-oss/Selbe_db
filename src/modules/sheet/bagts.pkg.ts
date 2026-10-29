// БАГЦУУДЫН БҮРТГЭЛ ба талбарын нэрийг АЖИЛЛАХ ҮЕДЭЭ таних логик.
//
//
// Тиймээс нэрийг ХАТУУ бичихгүй — үйлчилгээний метадатагаас нь ХЭВ ШИНЖЭЭР
// таньж авна. Ингэснээр шинэ багц нэмэгдэхэд зөвхөн `PKGS`-д мөр нэмнэ.

import { t as tr } from '@/lib/i18nCore';
import { agsFetch } from "./ags";
import { GUITS } from '@/lib/services';

export type Pkg = {
  /** `bagts.trees.ts`-ийн түлхүүр — мөрийн модыг үүгээр олно */
  key: string;
  /**
   * Багцын нэр. Бичлэг нь «Гүйцэтгэл бөглөх» табын `bagts` талбартай ЯГ
   * ижил (4-1, 4-2 нь цэгээр биш ЗУРААСААР) — хоёр таб нэг нэрийг харуулна.
   */
  group: string;
  /**
   * Давхрын хувилбар: багц бүр 9 ба 12 давхрын тусдаа хуудастай байж болно.
   */
  floors: 9 | 12 | null;
  /**
   * ХУУДСЫН ТОГТМОЛ НЭР — ОРЧУУЛАГДДАГГҮЙ монгол эх текст (2026-09-21).
   */
  name: string;
  label: string;
  url: string;
};

export const PKGS: Pkg[] = [
  { key: "b1_9f", group: 'Багц 1', floors: 9, name: 'Багц 1 · 9 давхар', get label() { return tr('Багц 1 · 9 давхар'); }, url: `${GUITS}/153` },
  { key: "b1_12f", group: 'Багц 1', floors: 12, name: 'Багц 1 · 12 давхар', get label() { return tr('Багц 1 · 12 давхар'); }, url: `${GUITS}/154` },
  { key: "b2_9f", group: 'Багц 2', floors: 9, name: 'Багц 2 · 9 давхар', get label() { return tr('Багц 2 · 9 давхар'); }, url: `${GUITS}/155` },
  { key: "b2_12f", group: 'Багц 2', floors: 12, name: 'Багц 2 · 12 давхар', get label() { return tr('Багц 2 · 12 давхар'); }, url: `${GUITS}/156` },
  { key: "b31_9f", group: 'Багц 3.1', floors: 9, name: 'Багц 3.1 · 9 давхар', get label() { return tr('Багц 3.1 · 9 давхар'); }, url: `${GUITS}/157` },
  { key: "b32_9f", group: 'Багц 3.2', floors: 9, name: 'Багц 3.2 · 9 давхар', get label() { return tr('Багц 3.2 · 9 давхар'); }, url: `${GUITS}/158` },
  { key: "b33_9f", group: 'Багц 3.3', floors: 9, name: 'Багц 3.3 · 9 давхар', get label() { return tr('Багц 3.3 · 9 давхар'); }, url: `${GUITS}/159` },
  { key: "b41_9f", group: 'Багц 4-1', floors: 9, name: 'Багц 4-1 · 9 давхар', get label() { return tr('Багц 4-1 · 9 давхар'); }, url: `${GUITS}/160` },
  { key: "b42_9f", group: 'Багц 4-2', floors: 9, name: 'Багц 4-2 · 9 давхар', get label() { return tr('Багц 4-2 · 9 давхар'); }, url: `${GUITS}/162` },
  { key: "b42_12f", group: 'Багц 4-2', floors: 12, name: 'Багц 4-2 · 12 давхар', get label() { return tr('Багц 4-2 · 12 давхар'); }, url: `${GUITS}/164` },

  /*
   * ── НЭМЭЛТ БАГЦУУД (2026-09-16) ──────────────────────────────────────
   *
   *    `resolveSchema` нь `F<цуваа>_<блок>_` ХЭВ ШИНЖЭЭР таньдаг тул эдгээрт
   *    `bld`/`act`/`plan`/`obyem`/`start`/`end`/`gStart`/`gEnd` бүгд ХООСОН
   *    массив болно. Хэрэглэгчид нь бүгд `.length` эсвэл индексээр ханддаг
   *    (хуваалт хийдэггүй) тул давталт зүгээр л ажиллахгүй — унахгүй.
   */
  { key: "b51", group: 'Багц 5.1', floors: null, name: 'Багц 5.1', get label() { return tr('Багц 5.1'); }, url: `${GUITS}/166` },
  { key: "b52", group: 'Багц 5.2', floors: null, name: 'Багц 5.2', get label() { return tr('Багц 5.2'); }, url: `${GUITS}/167` },
  { key: "b53", group: 'Багц 5.3', floors: null, name: 'Багц 5.3', get label() { return tr('Багц 5.3'); }, url: `${GUITS}/168` },
  { key: "b54", group: 'Багц 5.4', floors: null, name: 'Багц 5.4', get label() { return tr('Багц 5.4'); }, url: `${GUITS}/169` },
  { key: "b61", group: 'Багц 6.1', floors: null, name: 'Багц 6.1', get label() { return tr('Багц 6.1'); }, url: `${GUITS}/170` },
  { key: "b62", group: 'Багц 6.2', floors: null, name: 'Багц 6.2', get label() { return tr('Багц 6.2'); }, url: `${GUITS}/171` },
  { key: "b64", group: 'Багц 6.4', floors: null, name: 'Багц 6.4', get label() { return tr('Багц 6.4'); }, url: `${GUITS}/173` },
  { key: "b63", group: 'Багц 6.3', floors: null, name: 'Багц 6.3', get label() { return tr('Багц 6.3'); }, url: `${GUITS}/172` },
  { key: "b65", group: 'Багц 6.5', floors: null, name: 'Багц 6.5', get label() { return tr('Багц 6.5'); }, url: `${GUITS}/174` },
  { key: "b66", group: 'Багц 6.6', floors: null, name: 'Багц 6.6', get label() { return tr('Багц 6.6'); }, url: `${GUITS}/175` },
  { key: "b67", group: 'Багц 6.7', floors: null, name: 'Багц 6.7', get label() { return tr('Багц 6.7'); }, url: `${GUITS}/177` },
  { key: "b68", group: 'Багц 6.8', floors: null, name: 'Багц 6.8', get label() { return tr('Багц 6.8'); }, url: `${GUITS}/178` },
  { key: "b71", group: 'Багц 7.1', floors: null, name: 'Багц 7.1', get label() { return tr('Багц 7.1'); }, url: `${GUITS}/179` },
  { key: "b10", group: 'Багц 10', floors: null, name: 'Багц 10', get label() { return tr('Багц 10'); }, url: `${GUITS}/180` },
];

/**
 * Сонгогчид харагдах багцууд — давхрын хувилбарууд нь дотроо.
 */
export const PKG_GROUPS: string[] = [...new Set(PKGS.map((p) => p.group))];

/** Тухайн багцын давхрын хувилбарууд (1 эсвэл 2). */
export const pkgFloors = (group: string): Pkg[] =>
  PKGS.filter((p) => p.group === group);

/** Багцын талбарын БҮДҮҮВЧ — нэр бүхэн үйлчилгээнээс танигдсан. */
/*
 * Тэдгээр нь `QAQC`/`QAQC2` үйлчилгээнд амьдардаг бөгөөд `Bagts_*` бөглөх
 * хуудсанд ОГТ ҮҮСЭЭГҮЙ байсан (бүдүүвч үргэлж `null` буцаадаг байв).
 * Тодорхойлолт ба уншилт нь `src/lib/qaqc.ts`-д, харагдац нь
 * `src/modules/Qaqc.tsx`-д — «Чанар (QAQC)» тусдаа дэд сэдэв.
 */

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
   */
  obyem: (string | null)[];
  start: (string | null)[];
  end: (string | null)[];
  /**
   * ГЭРЭЭНИЙ огноо (`F<цуваа>_<блок>_geree_ehleh` / `…_geree_duusah`) —
   * 2026-09-11-нд 10/10 үйлчилгээнд нэмэгдсэн (Date, nullable, 242 талбар).
   */
  gStart: (string | null)[];
  gEnd: (string | null)[];
  /**
   * БОДИТ огноо (`F<цуваа>_<блок>_bodit_ehleh` / `…_bodit_duusah`) —
   * 2026-09-23-нд 10 барилгын багцад нэмэгдсэн (Date, nullable, `geree_*`-тэй
   * ижил хэв).
   */
  aStart: (string | null)[];
  aEnd: (string | null)[];
  /**
   * СИНТЕТИК НЭГ БЛОК (2026-09-23) — блокгүй 14 багцын МӨРИЙН түвшний огноог
   * блокийн массивт «нэг блок» болгон ороосон эсэх.
   */
  synthetic: boolean;

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
     * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ (`Инженерийн_төлөвлөсөн_обьём`) —
     * 2026-09-07-нд 10/10 үйлчилгээнд нэмэгдсэн (Double, nullable).
     */
    plannedVol: string | null;
    /**
     * «Объём_шинэ2» — 2026-08-19-нд үйлчилгээнд нэмэгдсэн ХОЁР ДАХЬ обьём.
     */
    unit: string;
    money: string;
    plan: string;
    act: string;
    ratio: string | null;
    asOf: string | null;
    /**
     * БӨГЛӨСӨН ОГНОО (`buglusun_ognoo`) — 2026-08-20-нд нэмэгдсэн, АРХИВЫН
     * түлхүүр. Нийтлэх бүрд хуудас бүхэлдээ доор нь ХУУЛБАРЛАГДАЖ нэмэгдэх
     * бөгөөд мөр бүрд тухайн өдрийн огноо бичигдэнэ. Огноогоор шүүхэд тэр
     * агшны бүтэн зураг гарна.
     */
    fillDate: string | null;
    /**
     * ШАТЛАЛ (0–4) — мөр бүрийн модны гүн.
     *
     * Багана огт үүсээгүй үйлчилгээнд `null`.
     */
    gun: string | null;
    /**
     * АЖЛЫН КОД (`Des_dugaar`) — 2026-09-02-нд 10/10 үйлчилгээнд нэмэгдсэн,
     * АГШИН бүрийн дотор 1…N (хуудасны дарааллаар, дээрээс доош).
     */
    des: string | null;
    /**
     * УЯЛДАА ХОЛБООС (`Hamaaral`, String 255) — 2026-09-03-нд 10/10
     * үйлчилгээнд нэмэгдсэн. «18FS3,22SS-5» хэлбэрээр урьдчилагчдыг
     * хадгална (код = `Des_dugaar`). Задлалт нь `src/lib/deps.ts`-д.
     * Багана байхгүй үйлчилгээнд `null` — уялдааны хэсэг зүгээр нуугдана.
     */
    ham: string | null;
    bham?: string | null;
    /**
     * ХҮН ХҮЧ (`hun_huch`) ба МАШИН МЕХАНИЗМ (`mashin_mehanizm`) — Integer,
     * 2026-09-23-нд 18/18 бөглөх хуудсанд нэмэгдсэн. Ажил (навч) бүрийн
     * нөөцийн тоо; «Хуваарь» модулиас засагдана, бүлгийн мөрд нийлбэр нь
     * ЗӨВХӨН дэлгэц дээр бодогдоно (бичигдэхгүй).
     */
    hunHuch: string | null;
    mashin: string | null;
    rowAct?: string | null;
    rowPlan1?: string | null;
    rowGS?: string | null;
    rowGE?: string | null;
    rowAS?: string | null;
    rowAE?: string | null;
    /** Editor Tracking-ийн 4 талбар (сервер оноодог — архивын хуулбарт дамжихгүй, `SERVER_FIELDS`) */
    created?: string | null;
    creator?: string | null;
    edited?: string | null;
    editor?: string | null;
    oid: string;
  };
};

export type FieldMeta = { name: string; type?: string };

/**
 * Синтетик блокийн шошго (2026-09-23). `tr`-ээр ОРУУЛАХГҮЙ — `obKey(des,
 * blok)` түлхүүрт орж сарын задаргааны хүснэгтэд бичигдэж болно; хэл солиход
 * түлхүүр өөрчлөгдвөл задаргаа «алга» болно.
 */
export const SYNTHETIC_BLOCK = 'Ажил';

export type ResolveOpts = {
  /** Блок олдоогүй БӨГӨӨД мөрийн огнооны багана байвал синтетик нэг блок үүсгэх */
  synthetic?: boolean;
  /**
   * ГҮЙЦЭТГЭЛ БӨГЛӨХ бүдүүвч (2026-10-09) — `synthetic`-ийг АГУУЛНА.
   */
  fill?: boolean;
};

/** Харьцуулахад бэлдэх: жижиг үсэг, доогуур зураас/зай хасах */
const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

/**
 * Үйлчилгээний талбаруудаас бүдүүвчийг угсарна.
 */
export function resolveSchema(fields: FieldMeta[], opts: ResolveOpts = {}): Schema {
  const names = fields.map((x) => x.name);
  const byNorm = new Map<string, string>();
  for (const n of names) byNorm.set(norm(n), n);

  /** Эхний тохирох талбарыг нөхцлөөр */
  const find = (test: (n: string, raw: string) => boolean): string | null => {
    for (const raw of names) if (test(norm(raw), raw)) return raw;
    return null;
  };
  /**
   * ЗОРИЛТОТ нэрийг ЯГ (том/жижиг үсэг үл ялган) хайна (2026-09-23).
   */
  const exactCI = (target: string): string | null => {
    const t = target.toLowerCase();
    return names.find((n) => n.toLowerCase() === t) ?? null;
  };

  /* ── Блокийн талбарууд ── */
  type Slot = {
    act: string[];
    plan: string[];
    start: string[];
    end: string[];
    obyem: string[];
    /** ГЭРЭЭНИЙ огноо — латин нэртэй тул кирилл шүүлтүүрт баригдахгүй */
    gStart: string[];
    gEnd: string[];
    /** БОДИТ огноо (2026-09-23) — мөн латин */
    aStart: string[];
    aEnd: string[];
  };
  const blocks = new Map<string, Slot>();
  const order: { key: string; s: number; n: number }[] = [];
  for (const raw of names) {
    const m = /^f(\d+)_(\d+)_/i.exec(raw);
    if (!m) continue;
    const key = `${m[1]}/${m[2]}`;
    let slot = blocks.get(key);
    if (!slot) {
      slot = { act: [], plan: [], start: [], end: [], obyem: [], gStart: [], gEnd: [], aStart: [], aEnd: [] };
      blocks.set(key, slot);
      order.push({ key, s: Number(m[1]), n: Number(m[2]) });
    }
    const tail = norm(raw.slice(m[0].length));
    if (/boditehleh$/.test(tail)) slot.aStart.push(raw);
    else if (/boditduusah$/.test(tail)) slot.aEnd.push(raw);
    else if (/gereeehleh$/.test(tail)) slot.gStart.push(raw);
    else if (/gereeduusah$/.test(tail)) slot.gEnd.push(raw);
    else if (/obyem$/.test(tail)) slot.obyem.push(raw);
    else if (/дуусах$/.test(tail) || /дуусах\d+$/.test(tail)) slot.end.push(raw);
    else if (/эхлэх$/.test(tail)) slot.start.push(raw);
    else if (/төлөвлөгө/.test(tail)) slot.plan.push(raw);
    else if (/гүйцэтгэл/.test(tail)) slot.act.push(raw);
  }

  // Блок гэж тооцох нөхцөл: гүйцэтгэл БА төлөвлөгөөт хоёул бий.
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
  const gStart: (string | null)[] = [];
  const gEnd: (string | null)[] = [];
  const aStart: (string | null)[] = [];
  const aEnd: (string | null)[] = [];
  const obyem: (string | null)[] = [];
  for (const key of bld) {
    const s = blocks.get(key)!;
    act.push(s.act[0]);
    plan.push(s.plan[0]);
    // Обьёмын багана дутуу байж болно (Багц 4-2·9F) — тэнд нүд түгжигдэнэ.
    obyem.push(s.obyem[0] ?? null);
    if (!s.start.length && s.end.length > 1) {
      start.push(s.end[0]);
      end.push(s.end[1]);
    } else {
      start.push(s.start[0] ?? null);
      end.push(s.end[0] ?? null);
    }
    gStart.push(s.gStart[0] ?? null);
    gEnd.push(s.gEnd[0] ?? null);
    /* Бодит огноо (2026-09-23) — талбар дутуу блокт `null`, бичихгүй. */
    aStart.push(s.aStart[0] ?? null);
    aEnd.push(s.aEnd[0] ?? null);
  }

  /* ── СИНТЕТИК НЭГ БЛОК (2026-09-23) — зөвхөн `opts.synthetic`, зөвхөн блокгүй ──
   */
  let synthetic = false;
  if ((opts.synthetic || opts.fill) && bld.length === 0) {
    const exact = (re: RegExp): string | null => names.find((n) => re.test(n)) ?? null;
    const rStart = exactCI('төлөвлөгөөт_хуваарь__эхлэх') ?? find((n) => /^төлөвлөгөөтхуваарь.*эхлэх$/.test(n));
    const rEnd = exactCI('төлөвлөгөөт_хуваарь__дуусах') ?? find((n) => /^төлөвлөгөөтхуваарь.*дуусах$/.test(n));
    const rGS = exact(/^geree_ehleh$/i);
    const rGE = exact(/^geree_duusah$/i);
    const rAS = exact(/^bodit_ehleh$/i);
    const rAE = exact(/^bodit_duusah$/i);
    const rAct = exactCI('ажил_гүйцэтгэл') ?? find((n) => /^ажилгүйцэтгэл/.test(n));
    const rOb = opts.fill ? exactCI('obyem_sum') : null;
    if (rStart || rEnd || rGS || rGE || rAS || rAE || (opts.fill && (rAct || rOb))) {
      synthetic = true;
      bld.push(SYNTHETIC_BLOCK);
      /* Гүйцэтгэл/төлөвлөгөө — мөрийн багана; байхгүй бол доорх `f`-ийн
         нөөц нэр (уншихад `null`, Huvaari эдгээрийг БИЧДЭГГҮЙ). */
      act.push(rAct ?? 'ажил_гүйцэтгэл');
      const rPlan = exactCI('төлөвлөгөөт_гүйцэтгэл') ?? find((n) => /^төлөвлөгөөт(гүйцэтгэл|гүйцтэгэл)/.test(n));
      plan.push((opts.fill ? exactCI('төлөвлөгөөт_гүйцэтгэл1') : null) ?? rPlan ?? 'төлөвлөгөөт_гүйцэтгэл');
      obyem.push(rOb);
      start.push(rStart);
      end.push(rEnd);
      gStart.push(rGS);
      gEnd.push(rGE);
      aStart.push(rAS);
      aEnd.push(rAE);
    }
  }

  /* ── Скаляр талбарууд ── */
  // «Хувийн жин» гурав удаа давтагдана: C, D (дээд мөр/нийт) ба E (одоо байгаа).
  const weights = names.filter(
    (n) => norm(n).startsWith("хувийнжин") && !/одоо/.test(norm(n)),
  );
  const wC = exactCI('хувийн_жин');
  const wD = exactCI('хувийн_жин1');
  const f: Schema["f"] = {
    no: byNorm.get("f") ?? "f_",
    work: byNorm.get("ажил") ?? 'ажил',
    wC: wC ?? weights[0] ?? 'хувийн_жин',
    wD: wD ?? (wC ? weights.find((n) => n !== wC) ?? wC : weights[1] ?? weights[0]) ?? 'хувийн_жин1',
    wE: exactCI('хувийн_жин__одоо_байгаа') ?? find((n) => n.startsWith("хувийнжин") && /одоо/.test(n)),
    vol: exactCI('обьём') ?? find((n) => /^об[ьъ]ём/.test(n) && !/2$/.test(n)) ?? 'обьём',
    /*
     * ОБЬЁМЫН НИЙЛБЭР — мөрийн блок бүрийн хуримтлагдсан обьёмын нийлбэр.
     */
    obyemSum: exactCI('obyem_sum'),
    /*
     * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — 2026-09-07-нд 10/10 үйлчилгээнд нэмэгдсэн.
     */
    plannedVol: exactCI('инженерийн_төлөвлөсөн_обьём') ?? find((n) => /^инженерийнтөлөвлөсөноб[ьъ]ём/.test(n)) ?? null,
    unit: exactCI('нэгж_өртөг') ?? find((n) => n.startsWith("нэгжөртөг")) ?? 'нэгж_өртөг',
    money: exactCI('мөнгөн_дүн') ?? find((n) => n.startsWith("мөнгөндүн")) ?? 'мөнгөн_дүн',
    plan:
      exactCI('төлөвлөгөөт_гүйцэтгэл') ??
      find((n) => /^төлөвлөгөөт(гүйцэтгэл|гүйцтэгэл)/.test(n)) ??
      'төлөвлөгөөт_гүйцэтгэл',
    act:
      exactCI('бодит_гүйцэтгэл') ??
      find((n) => /^(бодитгүйцэтгэл|гүйцэтгэл)/.test(n)) ?? 'бодит_гүйцэтгэл',
    ratio: exactCI('төлөвлөгөө_биелэлт') ?? find((n) => /^төлөвлөгөөбие/.test(n)),
    // Толгойгүй үлдсэн бол AGOL `F<баганын дугаар>` гэж нэрлэдэг — огнооны
    // төрөлтэй, блокийн бус цорын ганц талбарыг нь шинэчлэгдсэн огноо гэж үзнэ.
    asOf:
      exactCI('шинэчлэгдсэн_огноо') ??
      find((n) => n.startsWith("шинэчлэгдсэн")) ??
      fields.find((x) => /^f\d+$/i.test(x.name) && x.type === "esriFieldTypeDate")
        ?.name ??
      null,
    fillDate: names.find((n) => /^buglusun_ognoo$/i.test(n)) ?? null,
    gun: names.find((n) => /^gun$/i.test(n)) ?? null,
    des: names.find((n) => /^des_dugaar$/i.test(n)) ?? null,
    ham: names.find((n) => /^hamaaral$/i.test(n)) ?? null,
    bham: names.find((n) => /^bagts_hamaaral$/i.test(n)) ?? null,
    /* Хүн хүч · машин механизм (2026-09-23) — латин, шууд нэрээр. */
    hunHuch: names.find((n) => /^hun_huch$/i.test(n)) ?? null,
    mashin: names.find((n) => /^mashin_mehanizm$/i.test(n)) ?? null,
    rowAct: exactCI('ажил_гүйцэтгэл'),
    rowPlan1: exactCI('төлөвлөгөөт_гүйцэтгэл1'),
    rowGS: exactCI('geree_ehleh'),
    rowGE: exactCI('geree_duusah'),
    rowAS: exactCI('bodit_ehleh'),
    rowAE: exactCI('bodit_duusah'),
    created: exactCI('created_date'),
    creator: exactCI('created_user'),
    edited: exactCI('last_edited_date'),
    editor: exactCI('last_edited_user'),
    oid: names.find((n) => /^objectid$/i.test(n)) ?? "objectid",
  };

  return { bld, act, plan, obyem, start, end, gStart, gEnd, aStart, aEnd, synthetic, f };
}

/** Үйлчилгээний талбарын жагсаалтыг татаж бүдүүвч болгоно (кэштэй). */
const cache = new Map<string, Promise<Schema>>();
export function loadSchema(pkg: Pkg, opts: ResolveOpts = {}): Promise<Schema> {
  const ck = opts.fill ? `${pkg.key}|fill` : opts.synthetic ? `${pkg.key}|synthetic` : pkg.key;
  const hit = cache.get(ck);
  if (hit) return hit;
  const p = fieldsOf(pkg)
    .then((fields) => resolveSchema(fields, opts))
    .catch((e) => {
      cache.delete(ck);
      throw e;
    });
  cache.set(ck, p);
  return p;
}

/**
 * ГҮЙЦЭТГЭЛ БӨГЛӨХ урсгалын бүдүүвч (2026-10-09) — `loadSchema(pkg, { fill: true })`.
 */
export const fillSchema = (pkg: Pkg): Promise<Schema> => loadSchema(pkg, { fill: true });

/**
 * Үйлчилгээний ТҮҮХИЙ талбарын жагсаалт — багц тутамд НЭГ мета хүсэлт (2026-10-04, гүйцэтгэлийн аудит).
 */
const fieldCache = new Map<string, Promise<FieldMeta[]>>();
function fieldsOf(pkg: Pkg): Promise<FieldMeta[]> {
  const hit = fieldCache.get(pkg.key);
  if (hit) return hit;
  const p = agsFetch(pkg.url, {})
    .then((j) => (j.fields ?? []) as FieldMeta[])
    .catch((e) => {
      fieldCache.delete(pkg.key);
      throw e;
    });
  fieldCache.set(pkg.key, p);
  return p;
}
