/**
 * ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛИЙН МУРУЙ — «Гүйцэтгэл бөглөх» хуудасны ХУВААРЬТ
 * үндэслэсэн, сар тутмын өссөн хувь.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ БАЙХ ЁСТОЙ ВЭ (2026-09-04): «Гүйцэтгэлийн явц» графикийн
 * ТӨЛӨВЛӨСӨН муруй нь `cashflow_0813`-аас гардаг байв —
 *
 *     cumPct = (тухайн сар хүртэлх мөнгө) / (12 сарын ЦОНХНЫ нийлбэр)
 *
 * Хуваагч нь ТОГТМОЛ 12 сарын цонхны нийлбэр тул муруй нь цонх дуусахад ҮРГЭЛЖ
 * 100% болно. Дэлгэц дээр «2026-09-д төсөл 100% дуусна» гэж гарч байсан нь
 * ЯГ ЭНЭ: төсөл бодитоор 2027-12 хүртэл үргэлжилдэг.
 *
 * ⚠️ ХУУДАСТАЙ ЯГ ТААРНА (2026-09-09-ний хэрэглэгчийн шаардлага: «хуваарь
 * хэсэгтэй яг таарч байх ёстой, хуваарь өөрчлөгдөх үед хамт өөрчлөгдөнө»).
 * Тиймээс энд ТУСДАА томъёо БИЧИХГҮЙ: хуудасны мөрүүдийг `loadRows`-оор
 * уншаад `bagtsSheet.planCurve`-ээр бодно. Тэр функц нь `computeAll`-тай ЯГ
 * ИЖИЛ дүрэмтэй (жин `D`, огнооны өв `own`/`agg`, бүлгийн онцгой тохиолдол,
 * сарын задаргаа) бөгөөд `planCurve.check`-ээр хоёулаа тулгагддаг.
 *
 * ⚠️ БҮЛГИЙН ӨӨРИЙН ОГНОО ХҮЧИНГҮЙ БОЛГОГДОНО (2026-09-09, хэрэглэгч:
 * «хуваарь хэсэгтэй ямар ч зөрөөгүй таарах ёстой»). `computeAll` нь бүлэгт
 * ӨӨРИЙН огноог дэд ажлуудаас нь ДАВАМГАЙЛУУЛДАГ (`own` > `agg`) — тэр нь
 * excel-ийн `9F` эталонтой тааруулах шийдвэр. Гэтэл «Хуваарь» харагдац
 * 2026-09-06-нд ЭСРЭГ дүрэмтэй болсон: бүлгийн зурвас нь ДЭД АЖЛУУДЫНХАА
 * MIN/MAX-аар бодогдоно (`deps.effSpan`, хэрэглэгчийн шууд заавар).
 *
 * Улмаас Багц 1-ийн «Б.» мөрийн өөрийн огноо 2027-04-20-нд дуусдаг ч дэд
 * ажлууд нь 2028-01-01 хүртэл үргэлжилдэг байв: муруй 2027-08-д 100%
 * хүрч, «Хуваарь» дээр ажил үргэлжилсээр байхад «төлөвлөгөө дууссан» гэж
 * ХУДАЛ хэлж байлаа.
 *
 * Тиймээс `planCurve`-д өгөхөөс ӨМНӨ бүлгийн мөрүүдийн огноог цэвэрлэнэ —
 * тэгснээр тооцоолол нь `agg` (хүүхдийн MIN/MAX) руу унаж, «Хуваарь»-тай
 * ЯГ ижил болно. ⚠️ Бөглөх хуудасны (`computeAll`) дүрэм ХӨНДӨГДӨХГҮЙ:
 * зөвхөн ЭНЭ муруйд зориулж хуулбар мөр үүсгэнэ.
 *
 * ⚠️ ХУВААРЬГҮЙ САРД ЦЭГ ГАРАХГҮЙ (2026-09-09, хэрэглэгч: «хуваарьгүй бол
 * харагдах ёсгүй»). Хуудас бүрийн муруй нь ӨӨРИЙН хуваарийн мужаар л
 * тасарна: Багц 2 · 12F-ийн ажил 2027-05-16-нд дуусдаг атлаа муруй нь
 * 2027-12 хүртэл 100% гэсэн ХАВТГАЙ сүүл татаж, «энэ саруудад ямар нэг
 * төлөвлөгөө бий» мэт уншигдаж байв. Мужаас ГАДУУРХ сар нь төлөвлөгөөгүй
 * — тэнд 100% ч, 0% ч БИШ, ЮУ Ч БАЙХГҮЙ.
 *
 * ⚠️ БАГЦ/ТӨСЛИЙН нэгтгэлд ч мөн адил: тухайн сард хуваарьтай хуудас
 * байхгүй бол цэг гарахгүй. Харин хуудас аль хэдийн ДУУССАН (муж нь
 * өнгөрсөн) бол түүний 100% нь нэгтгэлд ҮРГЭЛЖ тоологдоно — эс бөгөөс
 * багц дуусах бүрд нийт муруй ДООШ унаж, хуурамч ухралт харагдана.
 *
 * ⚠️ ЯАГААД ХӨНГӨН ЗАМ БАЙЖ БОЛОХГҮЙ ВЭ. Урьд нь энэ файл зөвхөн 6 нэгтгэсэн
 * мөрийг («Б.» ба Б1…Б5) татаж, өөрийн гэсэн жигнэлт хийдэг байв. Тэр нь
 * хоёр согогтой:
 *   1. Блок бүрд ГАНЦ урт муж тул муруй бараг ШУЛУУН ШУГАМ болж, «Хуваарь»
 *      дээр зурсан 1,400 ажлын дараалал огт тусахгүй.
 *   2. Ажлын мөрүүдийг оруулах гэж оролдоход бүлгийн мөр (жин нь гүн 0-д = 1)
 *      навчаас (0.0005–0.02) хэдэн зуу дахин хүнд болж дунджийг эзэлдэг.
 * Хуудасны тооцоолол эдгээрийг аль хэдийн зөв шийдсэн — давхардуулах
 * шаардлагагүй.
 *
 * ⚠️ ҮНЭ: хуудас бүрийг бүтнээр нь уншина (10 хуудас, зэрэг). Муруй нь
 * `Finance`-ийн модуль-түвшний кэшэд (`planCurveCache`) нэг удаа хадгалагдаж,
 * дашбоард, KPI, хоцрогдол бүгд түүнээс уншина.
 */
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows, planCurve } from '@/modules/sheet/bagtsSheet';
import { bagtsKey, isConstructionNo } from './services';
import { loadPkgPlan, planPctFromMonths } from './huvaariObyem';
import { register } from './dataBus';

/** Нэг сарын цэг */
export type PlanPoint = {
  /** «2026-09» */
  label: string;
  /** Төлөвлөгөөт хувь 0–100 */
  pct: number;
  /**
   * ТУХАЙН САРД төлөвлөсөн обьём (хуваарийн сарын задаргаанаас).
   *
   * ⚠️ `null` = задаргаа ОРООГҮЙ — 0 БИШ. `huvaari_obyem` хүснэгт
   *    бөглөгдтөл бүх сар `null` байна; дэлгэц дээр зүгээр л гарахгүй.
   * ⚠️ НЭГЖ ХОЛИЛДОНО (м³ · м² · м · ш): багц доторх ажлууд өөр өөр
   *    нэгжтэй тул энэ нийлбэрийг ХАРУУЛАХ л боломжтой, тооцоонд
   *    ХЭРЭГЛЭХГҮЙ. Жин нь `Хувийн_жин` хэвээр.
   */
  vol: number | null;
};

export type PlanCurve = {
  months: PlanPoint[];
  /** Хуудас бүрийн муруй — `Pkg.key`-ээр («b1_9f») түлхүүрлэсэн */
  bySheet: Map<string, PlanPoint[]>;
  /** Багц бүрийн муруй — `bagtsKey(Pkg.group)`-оор; `Pack.key`-тэй ТААРНА */
  byBagts: Map<string, PlanPoint[]>;
  /** Хуваарийн муж (ms) — тэнхлэгийг эндээс тогтооно */
  from: number | null;
  to: number | null;
  /**
   * УНШИГДААГҮЙ хуудсууд (`Pkg.key`) — бүдүүвч эсвэл мөр нь (дахин
   * оролдлогын дараа ч) татагдаагүй.
   *
   * ⚠️ 2026-09-25-ны аудит: урьд нь уналт бүр `.catch(() => null)`-оор ЧИМЭЭГҮЙ
   *    хасагддаг байв — b1_12f-ийн түр зуурын «Too many requests» нь түүний
   *    22 блокийг Багц 1 ба төслийн дунджаас хасаж, төлөвлөгөөт хувь 41% → 47%
   *    болж шилжсэн муруй сешн турш кэшлэгдэн (Finance `planCurveCache`,
   *    execReport) хоцрогдол · KPI бүгд түүгээр бодогддог байлаа.
   * ⚠️ Тиймээс ДУТУУ нэгтгэл ГАРГАХГҮЙ: хуудас нь унасан багцын `byBagts`
   *    муруй, мөн төслийн `months` ХООСОН — буруу муруйгаас хоосон нь дээр
   *    (Finance/PkgProg «муруйгүй» төлөвөө аль хэдийн зохицуулдаг). Бүрэн
   *    уншигдсан хуудас/багцын `byBagts` муруй хэвээр.
   * ⚠️ 2026-09-25: `PkgProg.progMonths` нь `months` хоосон бол багц сонгосон
   *    ч `byBagts`-ийг харалгүй `null` буцаадаг — тэнд бүрэн багцын муруй ч
   *    түр алга болно (буруу тоо гарахгүй, зөвхөн UX).
   */
  failed: string[];
};

/**
 * ⚠️ Excel-ийн 0 сериал (1899-12-30) зэрэг эвдэрсэн огноог мужаас ХАСНА —
 * эс тэгвээс тэнхлэг 1899 оноос эхэлж, 1,500 сарын график гарна.
 * (Багц 3.2-т яг ийм хоёр нүд бий.)
 */
const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);
const sane = (ms: unknown): ms is number => typeof ms === 'number'
  && Number.isFinite(ms) && ms >= OK_LO && ms <= OK_HI;

/** Сарын СҮҮЛИЙН өдөр — тухайн сарын эцсийн байдлаар үнэлнэ */
const monthEnd = (y: number, m: number) => Date.UTC(y, m + 1, 0);
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

/** Нэг хуудасны бэлтгэсэн төлөв */
type Sheet = {
  key: string;
  group: string;
  rows: Awaited<ReturnType<typeof loadRows>>['rows'];
  nBld: number;
  /** «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» мөрийн индекс; олдоогүй бол `-1` */
  bi: number;
  /** Сарын задаргааны хувь бодогч (задаргаагүй бол `undefined`) */
  planPct?: (row: { des: number | null }, b: number, asOf: number) => number | null;
  /** Сар → тухайн сард төлөвлөсөн обьёмын нийлбэр */
  volByMonth: Map<string, number>;
  from: number;
  to: number;
};

/**
 * Хуваариас төлөвлөгөөт муруйг бодно.
 *
 * ⚠️ ЗӨВХӨН барилга угсралт («Б.») — бэлтгэл ажил ОРОХГҮЙ. Тэр мөрийн
 * төлөвлөгөө нь доод бүх ажлаа жингээрээ агуулна (`computeAll`-ийн дүрэм).
 *
 * ⚠️ Багц хоорондын жин нь БЛОКИЙН ТОО — `PkgProg`-ийн биет гүйцэтгэлийн
 * дүрэмтэй ИЖИЛ. Багцуудын дундаж авбал 4 блоктой багц 22 блоктойтой ижил
 * жинтэй болж гажуудна.
 */
export async function loadPlanCurve(): Promise<PlanCurve> {
  const sheets: Sheet[] = [];
  /** Уншигдаагүй хуудсууд — `PlanCurve.failed`-ийн ⚠️ */
  const failed: { key: string; group: string }[] = [];
  /* ⚠️ НЭГ УДАА ДАХИН оролдоно — түр зуурын саатал (429 г.м.) нь бүхэл
     багц/төслийн муруйг хоослохгүйн тулд. */
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch {
      await new Promise((res) => setTimeout(res, 800));
      return fn();
    }
  };

  await Promise.all(PKGS.map(async (pkg) => {
    let sc: Awaited<ReturnType<typeof loadSchema>>;
    let r: Awaited<ReturnType<typeof loadRows>>;
    try {
      sc = await retry(() => loadSchema(pkg));
      /* ⚠️ БЛОКГҮЙ хуудас (5.x · 6.x · 10) муруйд ОРОЛЦДОГГҮЙ — муж нь блокийн
         огнооноос (`sc.bld`) тул доорх `from == null`-оор ҮРГЭЛЖ хасагддаг.
         Мөрийг нь дэмий татахгүй, түүний уналт муруйг «дутуу» болгохгүй. */
      if (!sc.bld.length) return;
      const s = sc;
      r = await retry(() => loadRows(pkg, s));
    } catch (e) {
      failed.push({ key: pkg.key, group: bagtsKey(pkg.group) });
      console.warn(`[selbe] төлөвлөгөөт муруй: ${pkg.key} уншигдсангүй — багц/төслийн муруй гаргахгүй`, e);
      return;
    }
    if (!r.rows.length) return;

    /*
     * ⚠️ БҮЛГИЙН ОГНОО ЦЭВЭРЛЭГДЭНЭ — толгойн ⚠️-г үз. Хуулбар мөр:
     *    эх өгөгдөл, бөглөх хуудас хөндөгдөхгүй.
     */
    const rows = r.rows.map((row) => (
      row.group ? { ...row, start: row.start.map(() => null), end: row.end.map(() => null) } : row
    ));

    /* Хуваарийн муж — АЖЛЫН мөрүүдийн огноогоор */
    let from: number | null = null;
    let to: number | null = null;
    for (const row of rows) {
      for (let b = 0; b < sc.bld.length; b += 1) {
        const s = row.start[b];
        const e = row.end[b];
        if (!sane(s) || !sane(e) || e < s) continue;
        if (from == null || s < from) from = s;
        if (to == null || e > to) to = e;
      }
    }
    if (from == null || to == null) return;

    /*
     * САРЫН ОБЬЁМЫН ЗАДАРГАА — байвал төлөвлөгөөт хувь ТҮҮГЭЭР (S-муруй).
     * ⚠️ Уншилт УНАВАЛ ЧИМЭЭГҮЙ: задаргаа бол нэмэлт нарийвчлал, түүнгүйгээр
     *    муруй огнооны шугаман замаараа зурагдана.
     */
    const obPlan = await loadPkgPlan(pkg.key).then((x) => x.plan).catch(() => null);
    const planPct = obPlan && obPlan.size
      ? (row: { des: number | null }, b: number, asOf: number): number | null => {
        if (row.des == null) return null;
        const blok = sc.bld[b];
        const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
        return m ? planPctFromMonths(m, asOf) : null;
      }
      : undefined;

    /*
     * САРЫН ОБЬЁМЫН НИЙЛБЭР — зөвхөн ХАРУУЛАХ зорилгоор.
     * ⚠️ Задаргаа нь ажил × блок × сар тул нэг сард ногдох нийлбэрийг
     *    урьдчилан бэлдэнэ (график дуудалт бүрд дахин тоолохгүй).
     */
    const volByMonth = new Map<string, number>();
    if (obPlan) {
      for (const byBlok of obPlan.values()) {
        for (const m of byBlok.values()) {
          for (const [sar, v] of m) {
            if (v != null && Number.isFinite(v)) volByMonth.set(sar, (volByMonth.get(sar) ?? 0) + v);
          }
        }
      }
    }

    sheets.push({
      key: pkg.key,
      volByMonth,
      group: bagtsKey(pkg.group),
      rows,
      nBld: sc.bld.length,
      bi: rows.findIndex((x) => isConstructionNo(x.no)),
      planPct,
      from,
      to,
    });
  }));

  const failedKeys = failed.map((x) => x.key);
  if (!sheets.length) {
    return { months: [], bySheet: new Map(), byBagts: new Map(), from: null, to: null, failed: failedKeys };
  }
  /** Хуудас нь унасан багцууд — тэдний нэгтгэсэн муруй ГАРАХГҮЙ */
  const failedGroups = new Set(failed.map((x) => x.group));

  const from = Math.min(...sheets.map((x) => x.from));
  const to = Math.max(...sheets.map((x) => x.to));

  /* Сарын тэнхлэг — хуваарийн ЭХНЭЭС ТӨГСГӨЛ хүртэл */
  const d0 = new Date(from);
  const d1 = new Date(to);
  const axis: { label: string; asOf: number }[] = [];
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); ;) {
    axis.push({ label: ym(y, m), asOf: monthEnd(y, m) });
    if (y === d1.getUTCFullYear() && m === d1.getUTCMonth()) break;
    m += 1; if (m > 11) { m = 0; y += 1; }
    /* Гажигтай өгөгдлөөс сэргийлэх дээд хязгаар */
    if (axis.length > 120) break;
  }
  const asOfs = axis.map((a) => a.asOf);

  const bySheet = new Map<string, PlanPoint[]>();
  /** багц → сар бүрийн (нийлбэр, блокийн тоо) */
  const gAcc = new Map<string, { s: number; n: number }[]>();
  const tAcc: { s: number; n: number }[] = axis.map(() => ({ s: 0, n: 0 }));

  for (const sh of sheets) {
    if (sh.bi < 0) continue;
    /*
     * ⚠️ ХУУДАСТАЙ ЯГ ИЖИЛ ТООЦОО. `planCurve` нь `computeAll`-ийн дүрмийг
     *    давтдаг (`planCurve.check` тулгана) тул график ба бөглөх хуудас нэг
     *    тоо харуулна. Энд өөрийн жигнэлт бичвэл хоёр нь чимээгүй зөрнө.
     */
    const curves = planCurve(sh.rows, sh.nBld, asOfs, sh.planPct);
    const pts: PlanPoint[] = [];
    const gArr = gAcc.get(sh.group) ?? axis.map(() => ({ s: 0, n: 0 }));
    /* Хуваарь ЭХЛЭХЭЭС ӨМНӨХ сарууд — тухайн хуудсанд төлөвлөгөө байхгүй */
    const startYm = ym(new Date(sh.from).getUTCFullYear(), new Date(sh.from).getUTCMonth());
    /* Хуваарь ДУУСАХ сар — түүнээс хойш цэг ГАРАХГҮЙ */
    const endYm = ym(new Date(sh.to).getUTCFullYear(), new Date(sh.to).getUTCMonth());
    axis.forEach((a, i) => {
      const plan = curves[i]?.[sh.bi];
      /*
       * ⚠️ `planCurve` нь МӨРИЙН блокуудын ДУНДЖИЙГ буцаадаггүй — мөр бүрийн
       *    блокийн массивыг өгдөг. Гэвч `avgOut` (дундаж) буцаадаг хувилбар
       *    тул энд утга нь аль хэдийн 0–1 дундаж.
       */
      if (plan == null || !Number.isFinite(plan)) return;
      /*
       * ⚠️ ХУВААРИЙН МУЖААС ГАДУУР ЦЭГ ГАРГАХГҮЙ. Эхлэхээс өмнө — огт
       *    төлөвлөгөөгүй; дууссаны дараа — хавтгай 100% сүүл нь «энд ч
       *    төлөвлөгөө бий» гэж худал уншигдана.
       */
      if (a.label < startYm || a.label > endYm) {
        /*
         * ⚠️ НЭГТГЭЛД харин ҮЛДЭНЭ: дууссан хуудсыг хасвал багц дуусах
         *    бүрд нийт муруй ДООШ унаж, хуурамч ухралт үүснэ. Эхлээгүй
         *    хуудас нь 0%-иар (`plan` нь аль хэдийн 0) тоологдоно.
         */
        gArr[i].s += plan * sh.nBld;
        gArr[i].n += sh.nBld;
        tAcc[i].s += plan * sh.nBld;
        tAcc[i].n += sh.nBld;
        return;
      }
      pts.push({ label: a.label, pct: plan * 100, vol: sh.volByMonth.get(a.label) ?? null });
      /* Багц/төслийн нэгтгэлд БЛОКИЙН ТООГООР жигнэнэ */
      gArr[i].s += plan * sh.nBld;
      gArr[i].n += sh.nBld;
      tAcc[i].s += plan * sh.nBld;
      tAcc[i].n += sh.nBld;
    });
    if (pts.length) bySheet.set(sh.key, pts);
    gAcc.set(sh.group, gArr);
  }

  /**
   * Багц бүрийн ХУВААРИЙН МУЖ — доторх хуудсуудынхаа нэгдэл.
   * ⚠️ Багцын муруй ч мужаасаа гадуур цэг гаргахгүй (хуудасны дүрэмтэй ижил).
   */
  /** багц → сар → обьёмын нийлбэр */
  const gVol = new Map<string, Map<string, number>>();
  /** төсөл → сар → обьёмын нийлбэр */
  const tVol = new Map<string, number>();
  for (const sh of sheets) {
    const g = gVol.get(sh.group) ?? new Map<string, number>();
    for (const [sar, v] of sh.volByMonth) {
      g.set(sar, (g.get(sar) ?? 0) + v);
      tVol.set(sar, (tVol.get(sar) ?? 0) + v);
    }
    gVol.set(sh.group, g);
  }

  const gRange = new Map<string, { a: string; z: string }>();
  for (const sh of sheets) {
    const a = ym(new Date(sh.from).getUTCFullYear(), new Date(sh.from).getUTCMonth());
    const z = ym(new Date(sh.to).getUTCFullYear(), new Date(sh.to).getUTCMonth());
    const cur = gRange.get(sh.group);
    gRange.set(sh.group, {
      a: cur && cur.a < a ? cur.a : a,
      z: cur && cur.z > z ? cur.z : z,
    });
  }

  const byBagts = new Map<string, PlanPoint[]>();
  for (const [g, arr] of gAcc) {
    /* ⚠️ Нэг хуудас нь уншигдаагүй багц — дутуу дундаж ГАРГАХГҮЙ (`failed`-ийн ⚠️) */
    if (failedGroups.has(g)) continue;
    const rg = gRange.get(g);
    const pts: PlanPoint[] = [];
    axis.forEach((a, i) => {
      if (rg && (a.label < rg.a || a.label > rg.z)) return;
      if (arr[i].n > 0) {
        pts.push({
          label: a.label,
          pct: (arr[i].s / arr[i].n) * 100,
          vol: gVol.get(g)?.get(a.label) ?? null,
        });
      }
    });
    if (pts.length) byBagts.set(g, pts);
  }

  const months: PlanPoint[] = [];
  /* ⚠️ Аль нэг хуудас уншигдаагүй бол төслийн муруй ХООСОН (`failed`-ийн ⚠️) */
  axis.forEach((a, i) => {
    if (failed.length) return;
    if (tAcc[i].n > 0) {
      months.push({
        label: a.label,
        pct: (tAcc[i].s / tAcc[i].n) * 100,
        vol: tVol.get(a.label) ?? null,
      });
    }
  });

  return { months, bySheet, byBagts, from, to, failed: failedKeys };
}

/**
 * ТӨЛӨВЛӨГӨӨТ ХУВЬ — ТОДОРХОЙ ӨДРИЙН байдлаар (цэвэр функц).
 *
 * ⚠️ 2026-09-25: хоцрогдол (`Finance.lagOf`, `PkgProg`) нь хэмжилтийн САРЫН
 *    ЭЦСИЙН цэгийг авдаг байсан тул сарын 5-нд хэмжсэн гүйцэтгэлийг 30-ны
 *    төлөвлөгөөтэй жишиж хиймэл «хоцрогдол» гаргадаг байв. Одоо өмнөх сарын
 *    эцэс → тухайн сарын эцсийн хооронд `at` өдрөөр шугаман завсарлана —
 *    `negtgelAuto.housingPlanOf`-тэй ЯГ ижил дүрэм:
 *      · өмнөх сарын цэг байхгүй = хуваарь ЭНЭ сард эхэлсэн → эхлэл 0;
 *      · тухайн сарын цэг байхгүй (муж өнгөрсөн) → хамгийн сүүлийн өнгөрсөн цэг;
 *      · бүх цэг ирээдүйд → `null` (төлөвлөгөөгүй ≠ 0).
 * @param at «YYYY-MM-DD»; өдөр нь сарын уртаас их бол сарын эцэс (`-31` зөвшөөрнө)
 */
export function planPctAt(
  series: ReadonlyArray<{ label: string; pct: number }>,
  at: string,
): number | null {
  const y = Number(at.slice(0, 4));
  const mo = Number(at.slice(5, 7));
  const day = Number(at.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const cur = at.slice(0, 7);
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const frac = Number.isFinite(day) ? Math.max(0, Math.min(1, day / days)) : 1;
  let p1: number | null = null;
  let p0: number | null = null;
  let past: { label: string; pct: number } | null = null;
  for (const pt of series) {
    if (pt.label === cur) p1 = pt.pct;
    else if (pt.label === prev) p0 = pt.pct;
    if (pt.label < cur && (!past || pt.label > past.label)) past = pt;
  }
  if (p1 != null) return (p0 ?? 0) + (p1 - (p0 ?? 0)) * frac;
  return past ? past.pct : null;
}

/**
 * КЭШТЭЙ МУРУЙ (5 мин) — «Нэгтгэл гүйцэтгэл»-ийн дэлгэц ба удирдлагын тайлан
 * НЭГ хуулбарыг хуваалцана (2026-09-25).
 *
 * ⚠️ Урьд нь `negtgelAuto.loadNegSources` ба `execReport` тус бүр
 *    `loadPlanCurve`-ийг КЭШГҮЙ дууддаг тул нэг нээлтэд 10 хуудсыг хоёр
 *    дахин бүтнээр уншдаг байв.
 * ⚠️ Бөглөх хуудасны бичилтээр (`BAGTS_SHEET`) шууд хаягдана — `negtgel.ts`
 *    -ийн `loadNegtgelFull` кэштэй ИЖИЛ түлхүүр, ижил 5 минут.
 * ⚠️ Хүснэгт рүү БИЧИХ зам (`syncNegtgel`) үүнийг ХЭРЭГЛЭХГҮЙ — шууд
 *    `loadPlanCurve` (шинэ уншилт).
 */
let curveP: Promise<PlanCurve> | null = null;
let curveAt = 0;
register(() => { curveP = null; }, ['BAGTS_SHEET']);

export function loadPlanCurveCached(): Promise<PlanCurve> {
  if (!curveP || Date.now() - curveAt > 5 * 60_000) {
    curveAt = Date.now();
    const mine = loadPlanCurve();
    curveP = mine;
    /* ⚠️ Уналт нь ЗӨВХӨН өөрөө идэвхтэй байхад л кэшийг цэвэрлэнэ (`live.cached`-ийн ⚠️) */
    mine.catch(() => { if (curveP === mine) curveP = null; });
  }
  return curveP;
}
