/**
 * IPC ХҮСНЭГТИЙН ЗАГВАР — «олгосон санхүүжилт»-ийг ГЭРЭЭГЭЭР бүлэглэж
 * уншигдахуйц болгох цэвэр логик.
 *
 * ⚠️ ЯАГААД ЭНЭ МОДУЛЬ БАЙХ ЁСТОЙ ВЭ. Түүхий бүртгэл (`FullTable`) нь 45
 * мөрийг 37 БАГАНААР дэлгэдэг. Үүний 20 багана нь ГЭРЭЭНИЙ талбар бөгөөд
 * тухайн гэрээний мөр БҮРД ЯГ ИЖИЛ утгаараа давтагдана — Багц-4.1-ийн
 * төсөв 7 мөрд 7 удаа. Амьдаар хэмжив (2026-09-09): 37 багананы 10 нь
 * ХООСОН эсвэл ЦОРЫН ГАНЦ утгатай. Хүн «Багц-1-д нийт хэд олгосон бэ»
 * гэдгийг харахын тулд мөрүүдийг нүдээр түүж нэмэх шаардлагатай болдог.
 *
 * ЗАГВАР: 22 гэрээ = 22 бүлэг. Бүлгийн ТОЛГОЙД гэрээний давтагддаг утгууд
 * НЭГ УДАА; дотор нь тухайн гэрээний төлбөрүүд (урьдчилгаа + IPC-1,2,3…)
 * цөөн баганаар.
 *
 * ⚠️ НИЙЛБЭРИЙГ ЭНД БОДОХГҮЙ — `groupHo()` (`@/lib/ipc`) аль хэдийн dedup
 * хийж бодсоныг ХЭРЭГЛЭНЭ. Энд дахин нийлүүлбэл яг тэр «7 дахин давхардах»
 * алдаа руу буцна.
 *
 * ⚠️ React импортлохгүй, сүлжээ дуудахгүй — `ipcTable.check.mjs` шууд Node
 * дээр ачаална. БҮХ экспорт ЦЭВЭР функц.
 */
import { t as tr } from '@/lib/i18nCore';
import { HO_IPC, hoAmount, hoPayCode, hoSaving, num } from '@/lib/services';
import type { HoContract } from '@/lib/ipc';
import { LINK_FIELDS } from '@/lib/ipcLink';

type Row = Record<string, unknown>;

const P = HO_IPC.payFields;
const C = HO_IPC.contractFields;

/* ─────────────────────── ТӨЛБӨРИЙН МӨР ─────────────────────── */

/**
 * Бүлэг дотор харагдах НЭГ ТӨЛБӨР.
 * ⚠️ Мөнгөн талбар БҮГД `number | null` — `0` нь ЖИНХЭНЭ тэг.
 */
export type PayRow = {
  oid: number | null;
  /** `murun_id` «ХО-0001» */
  id: string;
  /** «Урьдчилгаа» | «IPC-01» — `hoPayCode` */
  code: string;
  /** Урьдчилгаа эсэх — өнгө/эрэмбэд */
  advance: boolean;
  /** `ipc_dugaar`; урьдчилгаад ҮРГЭЛЖ `null` */
  ipcNo: number | null;
  /** `guilgee_ognoo` түүхий утга — форматлахыг дуудагч тал хийнэ */
  date: unknown;
  /** `dun` — олгосон дүн */
  amount: number | null;
  /**
   * ⚠️ ХУРИМТЛАЛ: энэ мөрийг ОРУУЛААД тухайн гэрээнд олгосон нийт.
   *
   * ⚠️ 2026-09-09-нөөс КАРТАД ХАРАГДАХГҮЙ (хэрэглэгчийн шийдвэр) — гэрээний
   * толгойд «олгосон … %» гэж аль хэдийн байдаг тул давхардаж байв. Талбарыг
   * ҮЛДЭЭВ: `ipcLink.linkContract`-ийн зөрүү нь ЯГ ЭНЭ хуримтлалаар
   * бодогддог (нэмэгдлээр биш) бөгөөд тестээр хамгаалагдсан.
   */
  cum: number | null;
  /** `guits_obyem` — бодит гүйцэтгэлийн обьём */
  obyem: number | null;
  /** `guits_une` — обьёмоос бодогдсон «байх ёстой» ₮ */
  une: number | null;
  /** `guits_zoruu` — олгосон − байх ёстой */
  zoruu: number | null;
  /** `on_` — ⚠️ ТАНИГЧ, хэмжигдэхүүн БИШ: мянгатын тасалалгүй гаргана */
  year: number | null;
  /** `tulult_turul` түүхий утга — 2 мөрд ХООСОН («ангилагдаагүй») */
  kind: string;
  /**
   * ЗАХИРАМЖИЙН ДУГААР — «А/250».
   *
   * ⚠️ ЭНЭ НЬ ГЭРЭЭНИЙ талбар, мөрийнх БИШ: тухайн гэрээний БҮХ төлбөрт
   * ИЖИЛ утга давтагдана. Хэрэглэгчийн шийдвэрээр (2026-09-09) мөрөнд
   * гаргаж байгаа — санхүүгийн баримт нь захирамжаар эхэлдэг тул мөр
   * бүрийн эрх зүйн үндэслэл нэг харцаар танигдана.
   *
   * ⚠️ Гурван захирамжаас ЭХНИЙХ (`zahiramj1_dugaar`, 45/45 бөглөгдсөн).
   * 2, 3-р захирамж нь нэмэлт өөрчлөлт тул дэлгэрэнгүйд үлдэнэ.
   */
  orderNo: string;
};

/**
 * Гэрээний төлбөрүүдийг ХАРАГДАХ дараалалд эрэмбэлж мөр болгоно.
 *
 * ⚠️ ДАРААЛАЛ: урьдчилгаа ЭХЭНД, дараа нь IPC дугаараар өсөх. Гүйлгээний
 * огноогоор эрэмбэлэх ГЭЖ БҮҮ ОРОЛД — `guilgee_ognoo` нь 45-ийн 5 мөрд
 * ХООСОН тул эрэмбэ тогтворгүй болж, хуримтлал буруу мөрд наалдана.
 *
 * ⚠️ ХУРИМТЛАЛ нь ЗӨВХӨН ГҮЙЦЭТГЭЛИЙН мөрөөр (`ipcLink.linkContract`-тай
 * ИЖИЛ дүрэм). Урьдчилгаа нь ирээдүйн ажлын өмнөх төлбөр тул гүйцэтгэлийн
 * хуримтлалд оруулбал «хийснээсээ илүү авсан» гэсэн худал дүр зураг гарна.
 */
export function payRows(pays: readonly Row[]): PayRow[] {
  const adv: Row[] = [];
  const work: Row[] = [];
  for (const r of pays) {
    (r[P.kind] === HO_IPC.kinds.advance ? adv : work).push(r);
  }
  work.sort((a, b) => (num(a[P.ipcNo]) ?? 0) - (num(b[P.ipcNo]) ?? 0));

  let acc: number | null = null;
  const out: PayRow[] = [];

  const push = (r: Row, advance: boolean, cum: number | null): void => {
    out.push({
      oid: num(r[HO_IPC.oid]),
      id: String(r[P.id] ?? ''),
      code: hoPayCode(r),
      advance,
      ipcNo: num(r[P.ipcNo]),
      date: r[P.payDate] ?? null,
      amount: hoAmount(r),
      cum,
      obyem: num(r[LINK_FIELDS.obyem]),
      une: num(r[LINK_FIELDS.une]),
      zoruu: num(r[LINK_FIELDS.zoruu]),
      year: num(r[P.year]),
      kind: String(r[P.kind] ?? ''),
      orderNo: String(r[C.order1No] ?? ''),
    });
  };

  /* ⚠️ Урьдчилгаанд `cum` нь `null` — хуримтлалын багана нь ГҮЙЦЭТГЭЛИЙН
     явцыг хэмждэг тул урьдчилгаад утгагүй. `0` бичвэл «эхлээгүй» гэж
     худлаа уншигдана. */
  for (const r of adv) push(r, true, null);
  for (const r of work) {
    const v = hoAmount(r);
    if (v != null) acc = (acc ?? 0) + v;
    push(r, false, acc);
  }
  return out;
}

/* ─────────────────────── БҮЛГИЙН ТОЛГОЙ ─────────────────────── */

/* ─────────────────────── ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ ─────────────────────── */

/**
 * Дэлгэрэнгүйд харагдах НЭГ талбар.
 * ⚠️ `value` нь ТҮҮХИЙ утга — форматлахыг харагдацын тал шийднэ (₮ үү,
 * огноо юу, текст үү). Энд форматлавал i18n ба `mnt()` логик хоёр
 * газарт хуваагдана.
 */
export type DetailGroup = {
  /** Бүлгийн гарчиг — «ГЭРЭЭ», «ТӨСӨВ» г.м. */
  title: string;
  items: Detail[];
};

export type Detail = {
  /** Үйлчилгээний талбарын нэр — шошгыг `finFieldLabel`-ээр гаргана */
  field: string;
  /** ⚠️ Өгвөл `finFieldLabel`-ийг ДАРНА (хосолсон мөрд «Захирамж 1») */
  label?: string;
  value: unknown;
  /**
   * Хэрхэн харуулах вэ.
   * ⚠️ `pair` — аль хэдийн НЭГТГЭГДСЭН текст («2025-02-20 · А/250»);
   * харагдацын тал дахин форматлахгүй, ШУУД гаргана.
   */
  kind: 'money' | 'date' | 'text' | 'pair';
};

/**
 * ГЭРЭЭНИЙ түвшний БҮХ талбар — дэлгэрэнгүйд гаргах дараалалтайгаар.
 *
 * ⚠️ ЭНЭ ЖАГСААЛТ нь «нэг хуудсанд бүх мэдээлэл» гэсэн шаардлагын ГОЛ:
 * түүхий хүснэгт хасагдсан тул ЭНД байхгүй талбар нь хэрэглэгчид ХЭЗЭЭ Ч
 * харагдахгүй. Шинэ талбар нэмэгдвэл ЭНД нэмнэ.
 *
 * ⚠️ `budgetTotal`/`contractTotal`/`saving` нь бүлгийн ТОЛГОЙД аль хэдийн
 * гарсан ч ЭНД ДАХИН орно — дэлгэрэнгүй нь бүрэн байх ёстой (эх үүсвэрийн
 * задаргаатай нь зэрэгцүүлж харах).
 */
const DETAIL_SPEC: readonly {
  /** ⚠️ ФУНКЦ — дуудагдах үедээ орчуулагдана (дээрх ⚠️) */
  title: () => string;
  fields: readonly [string, Detail['kind']][];
  /** [огнооны талбар, дугаарын талбар, шошго] — НЭГ мөр болж нийлнэ */
  pairs?: readonly [string, string, () => string][];
}[] = [
  {
    title: () => tr('ГЭРЭЭ'),
    fields: [
      [C.project, 'text'],
      /* ⚠️ Гүйцэтгэгч нь бүлгийн толгойд ellipsis-ээр ТАСАРДАГ
         («Хятадын барилгын зургадугаар инженерий…») тул БҮТЭН нэрийг
         энд заавал гаргана. */
      [C.contractor, 'text'],
      [C.workType, 'text'],
      [C.contractForm, 'text'],
      [C.contractNo, 'text'],
      [C.no, 'text'],
      [C.amendment, 'text'],
    ],
  },
  {
    /* ⚠️ Захирамжийн ОГНОО ба ДУГААР зэрэгцэж байх ЁСТОЙ — тэдгээр нь нэг
       баримтын хоёр тал. Урьд нь 6 баганат сүлжээнд тарж, «Захирамж 1 ·
       огноо» нь «Захирамж 2 · дугаар»-ын хажууд буудаг байв. */
    title: () => tr('ЭРХ ЗҮЙН ҮНДЭСЛЭЛ'),
    fields: [
      [C.legalBasis, 'text'],
    ],
    /* ⚠️ ЗАХИРАМЖ нь ХОС талбар (огноо + дугаар) — нэг мөр болж нийлнэ.
       `fields`-ээр биш ТУСДАА зарлагдана, учир нь хоёр талбараас нэг
       мөр гаргах нь ердийн «нэг талбар = нэг мөр» дүрмээс өөр. */
    pairs: [
      [C.order1Date, C.order1No, () => tr('Захирамж 1')],
      [C.order2Date, C.order2No, () => tr('Захирамж 2')],
      [C.order3Date, C.order3No, () => tr('Захирамж 3')],
    ],
  },
  {
    /* ⚠️ ДАРААЛАЛ нь УТГАТАЙ: төсөвт өртөг → гэрээт төсөв → хэмнэлт.
       Эхний хоёрын ЗӨРҮҮ нь гуравдахь — нүд дээрээс доош уншаад
       тооцоог нь шууд шалгана. */
    title: () => tr('ТӨСӨВ'),
    fields: [
      [C.budgetTotal, 'money'],
      [C.budgetBond, 'money'],
      [C.budgetCity, 'money'],
      [C.budgetSales, 'money'],
      [C.contractTotal, 'money'],
      [C.contractBond, 'money'],
      [C.contractCity, 'money'],
      [C.contractSales, 'money'],
      [C.saving, 'money'],
    ],
  },
];

/**
 * Гэрээний дэлгэрэнгүй талбарууд.
 *
 * ⚠️ ХООСОН талбарыг ХАСНА. Амьдаар 37 багананы 10 нь хоосон/ганц утгатай
 * (`zahiramj3_*`, `*_niislel_tosov`, `hul_*`) — тэдгээрийг «—» гэж
 * гаргавал дэлгэрэнгүй нь хоосон нүднээс бүрдэж, ЖИНХЭНЭ мэдээлэл
 * дунд нь живнэ. Хоосон биш байвал л гарна.
 *
 * ⚠️ Жинхэнэ `0` нь ХОOСОН БИШ — үлдэнэ (`null ≠ 0`).
 */
/** Огноог `YYYY-MM-DD` болгоно — танихгүй бол түүхийгээр нь */
const dayOf = (v: unknown): string => {
  const s = String(v ?? '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const t = typeof v === 'number' ? v : Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toISOString().slice(0, 10);
};

export function details(h: Row): DetailGroup[] {
  const out: DetailGroup[] = [];
  for (const g of DETAIL_SPEC) {
    const items: Detail[] = [];
    for (const [field, kind] of g.fields) {
      const value = h[field];
      if (value == null || value === '') continue;
      items.push({ field, value, kind });
    }
    /* ⚠️ ХОС талбар (захирамжийн огноо + дугаар) — НЭГ мөр.
       Аль нэг нь байхад мөр гарна; хоёулаа хоосон бол ОГТ гарахгүй. */
    for (const [dateF, noF, label] of g.pairs ?? []) {
      const d = h[dateF];
      const n = h[noF];
      const hasD = d != null && d !== '';
      const hasN = n != null && n !== '';
      if (!hasD && !hasN) continue;
      const txt = [hasD ? dayOf(d) : null, hasN ? String(n) : null]
        .filter(Boolean).join(' · ');
      /* ⚠️ `field` нь React-ийн `key` болдог тул ДАВТАГДАШГҮЙ байх ёстой —
         огнооны талбарын нэрийг ашиглана. */
      items.push({ field: dateF, value: txt, kind: 'pair', label: label() });
    }
    /* ⚠️ ХООСОН БҮЛГИЙГ ОГТ ГАРГАХГҮЙ — гарчиг нь дангаараа зай эзэлж,
       «энд юм байх ёстой байсан» гэсэн худал сэтгэгдэл төрүүлнэ. */
    if (items.length) out.push({ title: g.title(), items });
  }
  return out;
}

/**
 * НЭГ ГЭРЭЭНИЙ бүлэг — толгой + төлбөрүүд.
 * ⚠️ Мөнгөн утгууд `HoContract`-аас ШУУД ирнэ (dedup хийгдсэн).
 */
export type ContractBlock = {
  /** `geree_kod`; кодгүй гэрээнд `''` */
  code: string;
  /** Харагдах гарчиг — багцын нэр, эс бөгөөс гэрээний код */
  title: string;
  contractor: string;
  workType: string;
  contractNo: string;
  /** Гэрээт төсөв — ⚠️ гэрээнд НЭГ УДАА */
  contractTotal: number | null;
  /** Олгосон нийт (урьдчилгаа + гүйцэтгэл) */
  paidTotal: number | null;
  /** `paidTotal / contractTotal` × 100 — 0–100. ⚠️ `pct()` 100-аар үржүүлдэггүй */
  paidPct: number | null;
  /** Төлбөрийн мөр */
  rows: PayRow[];
  /** ⚠️ Энэ гэрээнд гүйцэтгэлийн обьёмын мэдээлэл БАЙГАА эсэх */
  hasObyem: boolean;
  /** Гэрээний БҮХ бусад талбар — дэлгэрэнгүйд, бүлэглэсэн */
  details: DetailGroup[];
  /** Урьдчилгааны нийт — «олгосон»-ы задаргаанд */
  advanceTotal: number | null;
  /** Гүйцэтгэлийн төлбөрийн нийт */
  workTotal: number | null;
  /**
   * ⚠️ ХАДГАЛАГДСАН `hemnelt_hetrelt` ба БОДОГДСОН хэмнэлт ЗӨРВӨЛ `true`.
   * Амьдаар 45/45 таарсан; зөрөх нь эх сурвалж эвдэрсний ДОХИО тул
   * хэрэглэгчид ИЛ харуулна — чимээгүй өнгөрөөвөл буруу тоо тайланд орно.
   */
  savingMismatch: boolean;
};

/**
 * Гэрээ бүрийг харагдах бүлэг болгоно.
 *
 * ⚠️ Гарчиг нь `pkg` (багцын нэр) — хүнд утгатай. Багцгүй гэрээнд
 * (диапазон мөр эсвэл хоосон) `code`-оор нэрлэнэ; хоёулаа хоосон бол
 * `murun_id`-аар. Гарчиггүй бүлэг ХЭЗЭЭ Ч гаргахгүй — хүн юу харж
 * байгаагаа мэдэхгүй болно.
 */
export function contractBlocks(cs: readonly HoContract[]): ContractBlock[] {
  return cs.map((c) => {
    const rows = payRows(c.pays);
    /* ⚠️ Гэрээний талбарыг ЭХНИЙ мөрөөс — `groupHo`-ийн ЯГ ижил дүрэм
       (гэрээ бүрд uniq утга 1 гэж амьдаар батлагдсан). */
    const h = c.pays[0] ?? {};
    const stored = num(h[C.saving]);
    const calc = hoSaving(h);
    return {
      code: c.code,
      title: c.pkg || c.code || rows[0]?.id || '—',
      contractor: c.contractor,
      workType: c.workType,
      contractNo: c.contractNo,
      contractTotal: c.contractTotal,
      paidTotal: c.paidTotal,
      paidPct: c.paidPct,
      rows,
      /* ⚠️ Хэрэглэгчийн шийдвэр (2026-09-09): «гүйцэтгэлийн обьём байгаа нь
         гарна, байхгүй нь хоосон». Тиймээс баганыг БҮЛЭГ ТУС БҮРД шийднэ —
         бүх 22 гэрээ хоосон байхад 3 хоосон багана харуулах нь утгагүй,
         харин нэг гэрээнд өгөгдөл орвол ТЭР бүлэгт нь гарна. */
      hasObyem: rows.some((r) => r.obyem != null || r.une != null || r.zoruu != null),
      details: details(h),
      advanceTotal: c.advanceTotal,
      workTotal: c.workTotal,
      /* ⚠️ Хоёулаа хэмжигдсэн үед л жишнэ — аль нэг нь `null` бол
         «зөрсөн» гэж БҮҮ мэдэгд (хэмжигдээгүй ≠ зөрчил). */
      savingMismatch: stored != null && calc != null && Math.abs(stored - calc) > 0.5,
    };
  });
}

/**
 * ЯМАР НЭГ бүлэгт гүйцэтгэлийн обьём байна уу — хүснэгтийн толгойд
 * 3 багана нэмэх эсэхийг шийднэ.
 */
export const anyObyem = (bs: readonly ContractBlock[]): boolean =>
  bs.some((b) => b.hasObyem);

/* ─────────────────────── ЭРЭМБЭ ─────────────────────── */

export type SortKey = 'pkg' | 'paid' | 'pct' | 'contract';

/**
 * Бүлгүүдийг эрэмбэлнэ — ШИНЭ массив буцаана (оролтыг хөндөхгүй).
 *
 * ⚠️ `null` нь ҮРГЭЛЖ ЭЦЭСТ — өсөх/буурах аль ч чиглэлд. Тоон эрэмбэд
 * `null`-ыг `0` гэж үзвэл «хэмжигдээгүй» гэрээ «хамгийн бага» болж
 * жагсаалтын эхэнд гарч ирнэ.
 */
export function sortBlocks(
  bs: readonly ContractBlock[],
  key: SortKey,
  desc = true,
): ContractBlock[] {
  const val = (b: ContractBlock): number | null => {
    if (key === 'paid') return b.paidTotal;
    if (key === 'pct') return b.paidPct;
    if (key === 'contract') return b.contractTotal;
    return null;
  };
  const out = [...bs];
  out.sort((a, b) => {
    if (key === 'pkg') return a.title.localeCompare(b.title, 'mn');
    const x = val(a);
    const y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;      // ⚠️ null ЭЦЭСТ
    if (y == null) return -1;
    return desc ? y - x : x - y;
  });
  return out;
}

/* ─────────────────────── НИЙТ МӨР ─────────────────────── */

export type IpcTotals = {
  contracts: number;
  pays: number;
  /** Σ гэрээт төсөв — ⚠️ ГЭРЭЭНИЙ түвшнээс */
  contract: number | null;
  /** Σ олгосон */
  paid: number | null;
  /** `paid / contract` × 100 */
  paidPct: number | null;
};

/**
 * Хүснэгтийн ХӨЛИЙН нийт мөр.
 *
 * ⚠️ Бүлгүүдийн `contractTotal`-ыг нийлүүлэх нь АЮУЛГҮЙ — `groupHo` аль
 * хэдийн гэрээ бүрд НЭГ утга үлдээсэн. Түүхий 45 мөрөөр нийлүүлэхийг
 * ХОРИГЛОНО (7 дахин давхардана).
 */
export function ipcTotals(bs: readonly ContractBlock[]): IpcTotals {
  let contract: number | null = null;
  let paid: number | null = null;
  let pays = 0;
  for (const b of bs) {
    pays += b.rows.length;
    if (b.contractTotal != null) contract = (contract ?? 0) + b.contractTotal;
    if (b.paidTotal != null) paid = (paid ?? 0) + b.paidTotal;
  }
  return {
    contracts: bs.length,
    pays,
    contract,
    paid,
    /* ⚠️ 0-д хуваавал Infinity — график/хувь эвдэрнэ */
    paidPct: paid == null || contract == null || contract === 0
      ? null
      : (paid / contract) * 100,
  };
}
