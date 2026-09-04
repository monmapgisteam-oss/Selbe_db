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
 * ⚠️ Мөн НЭГЖ нь зөрдөг: тэр муруй нь МӨНГӨний хуваарь, доорх «Бодит
 * гүйцэтгэл» нь БИЕТ ажлын хувь. Хоёрын зөрүүг «хоцрогдол» гэж харуулах нь
 * утгагүй байсан.
 *
 * Одоо хоёулаа НЭГ эх сурвалж, НЭГ нэгжтэй:
 *     төлөвлөгөө = хуваарийн огноогоор шугаман интерполяци (`planAt`)
 *     бодит      = бөглөсөн обьём/хувь (`blockProgress`)
 *
 * ⚠️ ХӨНГӨН ЗАМ. Бүтэн хуудсуудыг татвал 13MB (хэмжсэн) — дашбоардад
 * боломжгүй. Барилга угсралтын мод нь ЗӨВХӨН 6 мөр («Б.» ба Б1…Б5) тул
 * тэдгээрийг л татна.
 *
 * ⚠️ `loadSheetRows`-ыг ЭНД ХЭРЭГЛЭХГҮЙ. Тэр нь `buglusun_ognoo` архивын
 * багана байхыг ШААРДДАГ (`if (!sc?.f.fillDate) return`) тул архивгүй 4
 * хуудас (b1_12f · b2_12f · b31_9f · b42_12f) чимээгүй унаж, муруй нь
 * төслийн 40%-ийг алгасаж байв. Хуваарь бол ХЭМЖИЛТ БИШ ТӨЛӨВЛӨГӨӨ —
 * архивын түүх огт хэрэггүй, одоогийн утга нь зөв.
 */
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { queryFeatures } from './query';
import { bagtsKey } from './services';
import { planAt } from '@/modules/sheet/bagtsSheet';

/** Нэг сарын цэг */
export type PlanPoint = {
  /** «2026-09» */
  label: string;
  /** Төлөвлөгөөт хувь 0–100 */
  pct: number;
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

/** Нэг зангилааны хуваарь */
type Node = { s: number; e: number; w: number };
/** Нэг блокийн хуваарь: өөрийн огноо, эс бөгөөс дэд үе шатууд жинтэйгээр */
type Blk = { own: Node | null; subs: Node[] };

/** Блокийн төлөвлөгөө 0–1, огноогүй бол `null` */
function blockPlan(blk: Blk, asOf: number): number | null {
  /* ⚠️ ӨӨРИЙН огноо нь дэд үе шатуудаас ДАВАМГАЙЛНА — `computeAll`-ийн
     дүрэмтэй ижил (`own` > `agg`). Эс тэгвээс гараар засварласан нийт
     хугацаа үл тоомсорлогдоно. */
  if (blk.own) return planAt(asOf, blk.own.s, blk.own.e);
  if (!blk.subs.length) return null;
  let num = 0;
  let den = 0;
  for (const n of blk.subs) {
    num += n.w * (planAt(asOf, n.s, n.e) ?? 0);
    den += n.w;
  }
  return den > 0 ? num / den : null;
}

/**
 * Хуваариас төлөвлөгөөт муруйг бодно.
 *
 * ⚠️ ЗӨВХӨН барилга угсралт («Б») — суурь мод нь энэ. Дэд үе шат (Б1…Б5) нь
 * зөвхөн «Б.» мөр огноогүй үед л хэрэглэгдэнэ, давхар тоолохгүй.
 *
 * ⚠️ Багц хоорондын жин нь БЛОКИЙН ТОО — `PkgProg`-ийн биет гүйцэтгэлийн
 * дүрэмтэй ИЖИЛ. Багцуудын дундаж авбал 4 блоктой багц 22 блоктойтой ижил
 * жинтэй болж гажуудна.
 */
export async function loadPlanCurve(): Promise<PlanCurve> {
  /** хуудас → блокийн нэр → хуваарь */
  const sched = new Map<string, Map<string, Blk>>();

  await Promise.all(PKGS.map(async (pkg) => {
    const sc = await loadSchema(pkg).catch(() => null);
    if (!sc) return;

    const dateCols = [...sc.start, ...sc.end].filter((x): x is string => !!x);
    if (!dateCols.length) return;

    /* ⚠️ `Б%` нь «Б.», «Б1»…«Б5»-ыг ХАМРАНА. Багц 3.2-т «Б.» нийт мөр ОГТ
       БАЙХГҮЙ (зөвхөн Б1…Б5) тул зөвхөн «Б.»-ээр шүүвэл тэр багц бүхэлдээ
       муруйнаас унана. */
    const rows = await queryFeatures(pkg.url, {
      where: `${sc.f.no} LIKE N'Б%'`,
      outFields: [sc.f.no, sc.f.wC, sc.f.oid, ...dateCols],
      orderBy: `${sc.f.oid} ASC`,
    }).catch(() => [] as Record<string, string | number | null>[]);
    if (!rows.length) return;

    /* ⚠️ Архивтай хуудсанд нэг № олон агшинд давтагдана. `oid ASC` тул
       СҮҮЛИЙНХ нь хамгийн шинэ — Map-д дарж бичихэд шинэ нь үлдэнэ. */
    const latest = new Map<string, Record<string, string | number | null>>();
    for (const a of rows) latest.set(String(a[sc.f.no] ?? '').trim(), a);

    const byBlock = new Map<string, Blk>();
    for (const [rawNo, a] of latest) {
      /*
       * «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» = нийт; «Б1»…«Б5» = дэд үе шат.
       * ⚠️ Нийт мөрийн № нь хуудсаар ЯЛГААТАЙ: заримд «Б.» (бүтэн шошготой),
       *    заримд ЦЭВЭР «Б» (b2_12f). Зөвхөн «Б.»-ээр барьвал тэр хуудсанд
       *    нийт мөр олдохгүй бөгөөд дэд үе шат руу чимээгүй унана.
       */
      const isTotal = rawNo === 'Б' || rawNo.startsWith('Б.');
      const isSub = /^Б\d+$/.test(rawNo);
      if (!isTotal && !isSub) continue;
      const w = Number(a[sc.f.wC]);
      const weight = Number.isFinite(w) && w > 0 ? w : 1;

      for (let b = 0; b < sc.bld.length; b++) {
        const sf = sc.start[b];
        const ef = sc.end[b];
        if (!sf || !ef) continue;
        const s = a[sf];
        const e = a[ef];
        if (!sane(s) || !sane(e) || e < s) continue;
        const cur = byBlock.get(sc.bld[b]) ?? { own: null, subs: [] };
        if (isTotal) cur.own = { s, e, w: weight };
        else cur.subs.push({ s, e, w: weight });
        byBlock.set(sc.bld[b], cur);
      }
    }
    if (byBlock.size) sched.set(pkg.key, byBlock);
  }));

  let from: number | null = null;
  let to: number | null = null;
  for (const byBlock of sched.values()) {
    for (const blk of byBlock.values()) {
      for (const n of blk.own ? [blk.own] : blk.subs) {
        if (from == null || n.s < from) from = n.s;
        if (to == null || n.e > to) to = n.e;
      }
    }
  }
  if (from == null || to == null) {
    return {
      months: [], bySheet: new Map(), byBagts: new Map(), from: null, to: null,
    };
  }

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

  const bySheet = new Map<string, PlanPoint[]>();
  const byBagts = new Map<string, PlanPoint[]>();
  const groupOf = new Map<string, string>(PKGS.map((p) => [p.key, bagtsKey(p.group)]));

  const months: PlanPoint[] = axis.map(({ label, asOf }) => {
    let wSum = 0;
    let wCnt = 0;
    /** багц → блокийн тоогоор жигнэсэн хуримтлал */
    const gAcc = new Map<string, { s: number; n: number }>();

    for (const [key, byBlock] of sched) {
      let s = 0;
      let n = 0;
      for (const blk of byBlock.values()) {
        const v = blockPlan(blk, asOf);
        /* ⚠️ Хуваарьгүй блок нь 0 БИШ — тоологдохгүй. `null`-ыг 0 гэж авбал
           хуваарь дутуу багц зохиомлоор хоцорсон харагдана. */
        if (v == null) continue;
        s += v; n += 1;
      }
      if (!n) continue;
      const v = (s / n) * 100;
      bySheet.set(key, [...(bySheet.get(key) ?? []), { label, pct: v }]);
      const g = groupOf.get(key) ?? key;
      const acc = gAcc.get(g) ?? { s: 0, n: 0 };
      acc.s += s; acc.n += n;
      gAcc.set(g, acc);
      wSum += s; wCnt += n;
    }
    for (const [g, acc] of gAcc) {
      byBagts.set(g, [...(byBagts.get(g) ?? []), { label, pct: (acc.s / acc.n) * 100 }]);
    }
    return { label, pct: wCnt ? (wSum / wCnt) * 100 : 0 };
  });

  return {
    months, bySheet, byBagts, from, to,
  };
}
