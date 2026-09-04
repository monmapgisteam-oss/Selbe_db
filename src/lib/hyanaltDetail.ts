'use client';

/**
 * НИЙТЭЛСЭН ГҮЙЦЭТГЭЛИЙГ ХЯНАГЧИД ХАРУУЛАХ.
 *
 * ⚠️ Хяналтын бүртгэл ганцаараа «юу хийсэн» гэдгийг ХЭЛДЭГГҮЙ — зөвхөн хэн,
 * хэзээ илгээснийг л хэлнэ. Инженер юуг зөвшөөрч байгаагаа мэдэхгүй бол
 * хяналт нь ёсорхуу дарах товч болж хувирна. Тиймээс архивын агшнаас
 * бөглөсөн ажлуудыг татаж үзүүлнэ.
 *
 * ⚠️ АГШНЫГ ОГНООГООР БИШ, ЭХ МӨРӨӨР олно. `Компани_илгээсэн_огноо` нь
 * илгээсэн ЯГ АГШИН (UTC), архивын `buglusun_ognoo` нь БӨГЛӨСӨН ӨДӨР
 * (нутгийн цагаар шөнө дунд) — хоёр нь цагийн бүсээс хамаарч ӨӨР өдөрт
 * унаж болно. Эх мөрийн OBJECTID нь тэр агшинд ЯГ хамаарна.
 *
 * ⚠️ 2026-09-04: `Эх_мөрийн_дугаар` нь одоо ИЛГЭЭЛТИЙН мөрийн OBJECTID
 * (`Selbe_Guitsetgel_Draft`-ийн `sub|<pkgKey>`) — гүйцэтгэл нь ерөнхий менежер
 * баталтал архивт БАЙХГҮЙ. Тиймээс хянагчид «архивын сүүлийн жааз + илгээлтийн
 * diff» гэсэн ХАРАГДАЦ угсарч өгнө (`loadStaged`). Хуучин (өөрчлөлтөөс өмнөх)
 * ба батлагдсан (`done|…`) мөрүүд нь архивт байгаа тул хуучин зам (`loadArchived`)
 * хэвээр ажиллана — гурван зам НЭГ `Submission` бүтэц буцаана.
 */

import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { TREES } from '@/modules/sheet/bagts.trees';
import { computeAll, loadRows, msToDay } from '@/modules/sheet/bagtsSheet';
import { overlaySubmission } from '@/modules/sheet/sheetFrame';
import { loadSubmissionByOid, type SubmissionPayload } from '@/lib/submission';
import { t as tr } from '@/lib/i18nCore';

/** Нэг мөр — «Гүйцэтгэл бөглөх» хуудасны багануудтай ижил бүрэлдэхүүн */
export type Filled = {
  no: string;
  work: string;
  /** Хувийн жин — дээд мөрд эзлэх (excel C) */
  wC: number | null;
  /** Хувийн жин — үе шатанд эзлэх (excel D) */
  wD: number | null;
  /** Одоо байгаа хувийн жин (excel E) */
  wE: number | null;
  /** Мөрийн ЭХ обьём (эх хүснэгтээс) */
  vol: number | null;
  /** Блокуудад бөглөсөн обьёмын нийлбэр */
  sum: number | null;
  unit: number | null;
  money: number | null;
  plan: number | null;
  act: number | null;
  ratio: number | null;
  /** Блок бүрийн бөглөсөн обьём — `blocks` шошготой ижил дараалалтай */
  cells: (number | null)[];
  /** Блок бүрийн ГҮЙЦЭТГЭЛИЙН ХУВЬ — бөглөх хуудасны нүдтэй ижил хоёр дахь мөр */
  acts: (number | null)[];
  /**
   * Тухайн нүд ӨМНӨХ АГШНААС ӨӨРЧЛӨГДСӨН эсэх.
   * ⚠️ Өмнөх агшин байхгүй (анхны нийтлэл) бол утгатай нүд бүр өөрчлөлт.
   */
  changed: boolean[];
  /** Өмнөх агшны утга — өөрчлөлтийг «юунаас юу болсон» гэж харуулахад. */
  before: (number | null)[];
  /** Модны гүн (0–4). Бүлгийн мөр эсэхийг `group`-оос. */
  depth: number;
  /** Бүлгийн мөр үү — дэд мөрүүдээсээ бодогддог, бөглөгддөггүй. */
  group: boolean;
};

/** Нэг ӨӨРЧЛӨГДСӨН нүд — жагсаалтаас дарж хүснэгт рүү үсрэхэд. */
export type Change = {
  /** `rows` доторх мөрийн индекс */
  row: number;
  /** Блокийн индекс (`blocks`-той ижил дараалалтай) */
  col: number;
  no: string;
  work: string;
  block: string;
  from: number | null;
  to: number | null;
};

export type Submission = {
  /** Аль үйлчилгээнээс — «Багц 1 · 9 давхар» */
  pkgLabel: string;
  /** `PKGS`-ийн түлхүүр — бөглөх хуудсыг ЯГ ТЭР багцаар нээхэд. */
  pkgKey: string;
  /**
   * Аль АГШИН (`YYYY-MM-DD`) — хянагчид бөглөх хуудсыг ЭНЭ өдрөөр нээнэ.
   * ⚠️ Хамгийн сүүлийн агшнаар нээвэл гүйцэтгэгч дараа нь дахин бөглөсөн
   *    тохиолдолд хянагч огт өөр тоо хараад батална.
   */
  day: string;
  /** Блокийн шошго — «5/1», «5/2» г.м. */
  blocks: string[];
  /** Өмнөх агшинтай жишсэн эсэх (анхны нийтлэлд `false`) */
  compared: boolean;
  /**
   * Өмнөх агшны асуулга АЛДААТАЙ дууссан — жишилт «тодорхойгүй».
   * ⚠️ `compared=false` + `prevError=true` нөхцөлийг «анхны нийтлэл» гэж
   * ойлгож болохгүй: өөрчлөлтийг илрүүлж ЧАДААГҮЙ гэсэн үг тул `changes`
   * хоосон байх нь «өөрчлөлтгүй» гэсэн баталгаа БИШ.
   */
  prevError: boolean;
  /** Архивт нэмэгдсэн нийт мөр */
  rows: number;
  /**
   * Агшны БҮХ мөр — хуудасны дараалалаар (бүлэг + ажил).
   *
   * ⚠️ Урьд нь зөвхөн обьём бөглөгдсөн мөрийг татдаг байсан нь хянагчийг
   *    «сонгосон хэсгийг» л харуулж, контекстээс салгадаг байв. Хянагч бүтэн
   *    хүснэгтийг хараад дүгнэх ёстой.
   */
  filled: Filled[];
  /** Обьём бөглөгдсөн ажлын тоо */
  filledCount: number;
  /** Өөрчлөгдсөн нүднүүд — дарж хүснэгт рүү үсрэх жагсаалт */
  changes: Change[];
  /**
   * ИЛГЭЭЛТИЙН мөрийн OBJECTID — хараахан архивлагдаагүй (staged) харагдац.
   *
   * ⚠️ Байвал бөглөх хуудсыг ӨДРӨӨР биш, ЭНЭ илгээлтээр нээнэ: архивт тэр
   *    өдрийн жааз БАЙХГҮЙ учир `day`-гаар нээвэл хянагч хоосон (эсвэл огт
   *    өөр) хуудас харна.
   */
  subOid?: number;
};

/**
 * Огноог SQL-д бичих.
 *
 * ⚠️ ТҮҮХИЙ EPOCH ТООГООР харьцуулж БОЛОХГҮЙ. `buglusun_ognoo = 1787270400000`
 * гэж бичвэл энэ үйлчилгээ «Unable to perform query» гэж унана. ArcGIS-ийн
 * стандарт хэлбэр нь `timestamp 'YYYY-MM-DD HH:MM:SS'` (UTC).
 */
const ts = (ms: number) => `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

const post = async (url: string, body: Record<string, string>) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...body }).toString(),
  });
  const j = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  // ⚠️ ArcGIS алдааг HTTP 200-гаар буцаадаг
  if (j.error) throw new Error(j.error.message || 'Асуулга амжилтгүй');
  return j;
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * ХЯНАГЧИД ХАРУУЛАХ АГУУЛГА — гурван зам (дизайн D).
 *
 * 1. `sheetOid` нь ИЛГЭЭЛТИЙН мөр бөгөөд хараахан батлагдаагүй (`sub|…`)
 *    → `loadStaged`: архивын сүүлийн жааз + илгээлтийн overlay.
 * 2. Илгээлт батлагдсан (`done|…`) → архивт жааз үүссэн тул `payload.archiveOid`-оор
 *    ХУУЧИН зам.
 * 3. Илгээлт огт олдохгүй (энэ өөрчлөлтөөс өмнөх мөрүүд) → `sheetOid` нь өөрөө
 *    архивын OBJECTID — ХУУЧИН зам.
 *
 * @param bagts    хяналтын бүртгэл дэх «Багц» (жиш. «Багц 1»)
 * @param sheetOid `Эх_мөрийн_дугаар` — илгээлтийн (эсвэл хуучин мөрд архивын) OBJECTID
 */
export async function loadSubmission(bagts: string, sheetOid: number): Promise<Submission | null> {
  /*
   * ⚠️ Уншилтын алдааг ЗАЛГИХГҮЙ ч ЗОГСООХГҮЙ: `loadSubmissionByOid` нь
   *    алдаа гарвал өөрөө `null` буцаадаг (илгээлтийн хүснэгт байхгүй орчинд
   *    хуучин зам ажиллах ёстой).
   */
  const staged = await loadSubmissionByOid(sheetOid);
  if (staged && !staged.done && staged.payload.archiveOid == null)
    return loadStaged(bagts, sheetOid, staged.payload);
  /*
   * ⚠️ Батлагдсан илгээлтийн `archiveOid` нь архивын ЭХНИЙ мөрийн дугаар —
   *    түүгээр хуучин зам яг тэр агшныг олно. Дугааргүй бол (хаах алхам
   *    унасан) `sheetOid`-оор оролдоно: тэр нь архивын мөр биш тул `null`
   *    буцах ба хянагч «агшин олдсонгүй» гэсэн ил мессеж харна.
   */
  const oid = staged?.payload.archiveOid ?? sheetOid;
  return loadArchived(bagts, oid);
}

/**
 * ХАРААХАН АРХИВЛАГДААГҮЙ ИЛГЭЭЛТИЙГ хянагчид харуулна.
 *
 * Архивын СҮҮЛИЙН жааз дээр илгээлтийн diff-ийг давхарлаж (`overlaySubmission`),
 * бөглөх хуудсынхтай ЯГ ижил мөрүүдийг угсарна — `FillNew` нь `view.subOid`
 * үед ЯГ ижил зүйлийг хийдэг тул мөрийн индекс хоёр талд тэнцэнэ (өөрчлөлтийн
 * жагсаалтаас дарж үсрэх нь тэр индекс дээр тулгуурладаг).
 *
 * ⚠️ Тоонуудыг ЭНД `computeAll`-аар бодно — үйлчилгээнээс уншихгүй. Илгээлт нь
 *    архивт хараахан ороогүй тул уншиж авах газар БАЙХГҮЙ; хянагчийн харах тоо
 *    нь бөглөгчийн харснаас зөрөх ёсгүй тул ЯГ ижил томъёог (нэг эх сурвалж)
 *    дуудна.
 */
async function loadStaged(
  bagts: string,
  subOid: number,
  pl: SubmissionPayload,
): Promise<Submission | null> {
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) throw new Error(tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey));
  /*
   * ⚠️ Багц зөрвөл ЗОГСОНО — өөр багцын гүйцэтгэлийг энэ хяналтын мөрөнд
   *    харуулбал хянагч огт өөр ажлыг батлана.
   */
  if (pkg.group !== bagts)
    throw new Error(tr('Илгээлт «{0}» багцынх — хяналтын бүртгэл «{1}»', pkg.group, bagts));

  const sc = await loadSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  const loaded = await loadRows(pkg, sc);
  const ov = overlaySubmission(loaded.rows, pl, sc, nBld);
  const asOf = ov.asOf ?? loaded.asOf;
  /*
   * ⚠️ `asOf` байхгүй бол төлөвлөгөөт хувь бүхэлдээ утгагүй — 0 гэж
   *    таамаглахгүй (`null ≠ 0`), ил алдаа болгоно.
   */
  if (asOf == null) throw new Error(tr('«Шинэчлэгдсэн огноо» алга тул гүйцэтгэлийг бодох боломжгүй'));
  const c = computeAll(ov.rows, nBld, asOf, {}, {}, hasObyem);

  /* Обьёмтой блокуудын дараалал — `blocks`/`cells`/`acts` бүгд ҮҮГЭЭР индекслэгдэнэ. */
  const blocks = sc.bld.filter((_, i) => sc.obyem[i]);
  /** Блокийн ЖИНХЭНЭ индекс (`b`) → `blocks` доторх багана; обьёмгүй бол `-1`. */
  const colOf: number[] = [];
  {
    let k = 0;
    for (let b = 0; b < nBld; b += 1) colOf[b] = sc.obyem[b] ? k++ : -1;
  }
  /* Overlay-аас ӨМНӨХ утга — «юунаас юу болсон» гэдгийг зөвхөн үүгээр мэдэнэ. */
  const baseObyem = new Map<number, (number | null)[]>();
  for (const r of loaded.rows) baseObyem.set(r.oid, r.obyem);
  /* Илгээлт БУУСАН нүднүүд — `${oid}:${b}` */
  const touched = new Set(ov.cellKeys);

  const changes: Change[] = [];
  const filled: Filled[] = ov.rows.map((r, i) => {
    const base = baseObyem.get(r.oid);
    const cells: (number | null)[] = [];
    const acts: (number | null)[] = [];
    const before: (number | null)[] = [];
    const changed: boolean[] = [];
    for (let b = 0; b < nBld; b += 1) {
      if (colOf[b] < 0) continue;
      const to = c[i].obyem[b];
      /* ⚠️ Шинэ мөрд (нэмсэн ажил) суурь БАЙХГҮЙ — `null` (0 БИШ). */
      const from = base ? base[b] : null;
      cells.push(to);
      acts.push(c[i].act[b]);
      before.push(from);
      changed.push(touched.has(`${r.oid}:${b}`) && from !== to);
    }
    changed.forEach((yes, k) => {
      if (!yes) return;
      changes.push({
        row: i,
        col: k,
        no: r.no,
        work: r.work || '—',
        block: blocks[k] ?? String(k + 1),
        from: before[k],
        to: cells[k],
      });
    });
    return {
      cells,
      acts,
      changed,
      before,
      depth: r.depth,
      group: r.group,
      no: r.no,
      work: r.work || '—',
      wC: c[i].C,
      wD: c[i].D,
      wE: c[i].E,
      vol: r.vol,
      sum: c[i].obyemSum,
      unit: r.unit,
      money: c[i].H,
      plan: c[i].I,
      act: c[i].J,
      ratio: c[i].K,
    };
  });

  return {
    pkgLabel: pkg.label,
    pkgKey: pkg.key,
    /* ⚠️ Мэдээллийн зорилготой — `subOid` байгаа тул бөглөх хуудас үүгээр нээгдэхгүй. */
    day: msToDay(pl.fillMs),
    blocks,
    /* Илгээлт нь суурь жаазтайгаа шууд жишигдсэн — таамаг байхгүй. */
    compared: true,
    prevError: false,
    rows: ov.rows.length,
    filled,
    filledCount: filled.filter((f) => (f.sum ?? 0) > 0).length,
    changes,
    subOid,
  };
}

/**
 * Тухайн хянуулалтын АРХИВЫН АГШНЫГ олж, бөглөсөн ажлуудыг буцаана.
 *
 * @param bagts    хяналтын бүртгэл дэх «Багц» (жиш. «Багц 1»)
 * @param sheetOid архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID
 */
async function loadArchived(bagts: string, sheetOid: number): Promise<Submission | null> {
  // Нэг багцад 9 ба 12 давхрын ХОЁР үйлчилгээ байж болно — аль нь болохыг эх мөрөөр нь тогтооно
  const cands = PKGS.filter((p) => p.group === bagts);
  if (!cands.length || !sheetOid) return null;
  let last = '';

  for (const p of cands) {
    try {
      /*
       * ⚠️ Талбарын нэрийг ЭНД дахин таамаглахгүй — «Гүйцэтгэл бөглөх»-ийн
       * схемийг ЯГ ТЭР ЛОГИКООР ачаална. Эс бөгөөс `Обьём` ба `Обьём__Шинэ`,
       * `Бодит_гүйцэтгэл` ба `…_гүйцэтгэлийн_хувь` мэт багц бүрийн зөрүү энд
       * дахин гараар бичигдэж, нэг нь хоцорвол чимээгүй хоосон харагдана.
       */
      const sc = await loadSchema(p);
      const fill = sc.f.fillDate;
      if (!fill) continue;

      const head = (await post(p.url, {
        where: `OBJECTID = ${sheetOid}`,
        outFields: fill,
        returnGeometry: 'false',
      })) as { features?: { attributes: Record<string, unknown> }[] };

      const at = head.features?.[0]?.attributes?.[fill];
      if (typeof at !== 'number') continue;         // энэ үйлчилгээнд тэр мөр алга

      const where = `${fill} = ${ts(at)}`;
      const cnt = (await post(p.url, { where, returnCountOnly: 'true' })) as { count?: number };

      /*
       * ӨМНӨХ АГШНЫГ олно — өөрчлөлтийг зөвхөн түүнтэй жишиж мэдэж болно.
       * ⚠️ Обьём нь ХУРИМТЛАГДДАГ тул «утгатай = шинэ» гэж үзэж БОЛОХГҮЙ:
       * өчигдрийн 1300 өнөөдөр ч 1300 хэвээр байвал өөрчлөлт БИШ.
       */
      /*
       * ⚠️ Өмнөх агшны асуулгын алдааг ЧИМЭЭГҮЙ залгихгүй — залгивал энэ
       * нийтлэл «анхны» мэт, эсвэл хагас өгөгдөлтэй жишигдэж, хянагчид
       * байхгүй «өөрчлөлт» жинхэнэ мэт харагдана. Гэхдээ throw ч хийхгүй:
       * гадна catch дараагийн үйлчилгээ рүү үсэрч, ажиллаж байгаа энэ
       * үйлчилгээний БҮТЭН харагдацыг алдагдуулна. Тиймээс «тодорхойгүй»
       * (prevError) гэж тэмдэглээд үргэлжлүүлнэ.
       */
      let prevFailed = false;
      let prevQ: { features?: { attributes: Record<string, unknown> }[] } = {};
      try {
        prevQ = (await post(p.url, {
          where: `${fill} < ${ts(at)}`,
          groupByFieldsForStatistics: fill,
          outStatistics: JSON.stringify([
            { statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'm' },
          ]),
          orderByFields: `${fill} DESC`,
          resultRecordCount: '1',
        })) as { features?: { attributes: Record<string, unknown> }[] };
      } catch {
        prevFailed = true;
      }
      const prevAt = num(prevQ.features?.[0]?.attributes?.[fill]);

      let filled: Filled[] = [];
      let filledCount = 0;
      const changes: Change[] = [];
      const sum = sc.f.obyemSum;
      if (sum) {
        const w2 = where;
        const c2 = (await post(p.url, { where: `${where} AND ${sum} > 0`, returnCountOnly: 'true' })) as { count?: number };
        filledCount = c2.count ?? 0;
        {
          const obs = sc.obyem.filter(Boolean) as string[];
          /*
           * ⚠️ Блокийн ХУВЬ нь обьёмын хажууд ЗААВАЛ хэрэгтэй — «Гүйцэтгэл
           *    бөглөх» хуудсанд нүд бүр хоёр тоо (обьём + хувь) харуулдаг.
           *    Зөвхөн обьём үзүүлбэл хянагчийн харж буй хүснэгт бөглөгчийнхөөс
           *    өөр болж, хоёулаа өөр зүйл ярина.
           */
          const acts = sc.obyem.map((o, i) => (o ? sc.act[i] : null)).filter(Boolean) as string[];
          const cols = [sc.f.no, sc.f.work, sc.f.wC, sc.f.wD, sc.f.wE, sc.f.vol, sum,
            sc.f.unit, sc.f.money, sc.f.plan, sc.f.act, sc.f.ratio, ...obs, ...acts]
            .filter(Boolean) as string[];
          /*
           * ⚠️ БҮХ мөрийг ХУУДАСНЫ ДАРААЛЛААР (`OBJECTID ASC`). Эрэмбийг
           *    обьёмоор солибол бүлэг ба ажлын шатлал холилдож, хүснэгт нь
           *    «Гүйцэтгэл бөглөх»-тэй танигдахаа болино.
           * ⚠️ 2,000-ийн хязгаараас давдаг тул хуудаслана.
           */
          const feats: { attributes: Record<string, unknown> }[] = [];
          for (let off = 0; ; ) {
            const page = (await post(p.url, {
              where: w2,
              outFields: [...new Set(cols)].join(','),
              returnGeometry: 'false',
              orderByFields: 'OBJECTID ASC',
              resultOffset: String(off),
              resultRecordCount: '2000',
            })) as { features?: { attributes: Record<string, unknown> }[] };
            const got = page.features ?? [];
            feats.push(...got);
            if (got.length < 2000) break;
            off += got.length;
          }
          /*
           * ⚠️ НЭГ АГШИНД ХОЁР ХУУЛБАР БАЙЖ БОЛНО — санамсаргүй давхар
           *    нийтлэл эсвэл алдаа засаад дахин нийтэлсэн үед. Тэгвэл
           *    хуудас ХОЁР ДАХИН урт болж, мөрийн индекс нь «Гүйцэтгэл
           *    бөглөх»-ийнхтэй ЗӨРНӨ: өөрчлөлтийн жагсаалт хоёр дахин
           *    үржиж, дарахад нь хүснэгтэд тохирох нүд олдохгүй болно.
           *
           *    `bagtsSheet.loadRows` ЯГ ижил зүйл хийдэг (`feats2`) — хоёр
           *    тал НЭГ дүрмээр таслаж байж л индекс нь тэнцэнэ.
           */
          const expect = (TREES[p.key] ?? '').length;
          const feats2 = expect > 0 && feats.length > expect ? feats.slice(-expect) : feats;
          const q = { features: feats2 };
          /*
           * ӨМНӨХ АГШНЫ ижил мөрүүд — `№`-ээр индекслэнэ.
           * ⚠️ OBJECTID-аар холбож БОЛОХГҮЙ: агшин бүрд мөр ДАХИН хуулагддаг
           * тул дугаар нь өөр байна. `№` нь багц дотроо тогтвортой.
           */
          const before = new Map<string, Record<string, unknown>>();
          if (prevAt != null) {
            const prevFeats: { attributes: Record<string, unknown> }[] = [];
            try {
              for (let off = 0; ; ) {
                const pv = (await post(p.url, {
                  where: `${fill} = ${ts(prevAt)}`,
                  outFields: [sc.f.no, sc.f.work, ...obs].join(','),
                  returnGeometry: 'false',
                  orderByFields: 'OBJECTID ASC',
                  resultOffset: String(off),
                  resultRecordCount: '2000',
                })) as { features?: { attributes: Record<string, unknown> }[] };
                const got = pv.features ?? [];
                /*
                 * ⚠️ Түлхүүр нь № ГАНЦААРАА БИШ — «1», «2» гэсэн дугаар хуудсанд
                 *    хэдэн ч удаа давтагддаг (бүлэг бүрд шинээр эхэлдэг). Тиймээс
                 *    БАЙРЛАЛААР индекслэнэ: агшин бүр хуудсыг бүтнээр, ижил
                 *    дараалалаар агуулдаг тул байрлал тогтвортой.
                 */
                prevFeats.push(...got);
                if (got.length < 2000) break;
                off += got.length;
              }
            } catch {
              /*
               * ⚠️ Дундаас нэг хуудас унавал prevFeats ДУТУУ — байрлалаар
               *    индекслэдэг тул дутуу жагсаалттай жишвэл мөр бүр буруу
               *    хөрштэйгөө тулгарч, зохиомол «өөрчлөлт» гарна. Хагас
               *    өгөгдлийг бүхэлд нь хаяж «тодорхойгүй» гэж тэмдэглэнэ.
               */
              prevFailed = true;
            }
            if (!prevFailed) {
              // ⚠️ Өмнөх агшныг ч ИЖИЛ дүрмээр таслана — эс бөгөөс жишилт нь
              //    өөр хуулбартай харьцуулж, байхгүй өөрчлөлт «олдоно».
              const pExpect = (TREES[p.key] ?? '').length;
              const prev2 = pExpect > 0 && prevFeats.length > pExpect
                ? prevFeats.slice(-pExpect)
                : prevFeats;
              prev2.forEach((x, i) => before.set(String(i), x.attributes));
            }
          }

          const tree = TREES[p.key] ?? '';
          const blkLabels = sc.bld.filter((_, i) => sc.obyem[i]);
          filled = (q.features ?? []).map((x, ri) => {
            const a = x.attributes;
            const prev = before.get(String(ri));
            const cells = obs.map((n) => num(a[n]));
            const beforeVals = obs.map((n) => (prev ? num(prev[n]) : null));
            const changed = obs.map((n, k) => {
              const now = cells[k];
              if (now == null) return false;
              // ⚠️ Өмнөх агшныг ТАТАЖ ЧАДААГҮЙ бол таамаглахгүй — «бүгд
              //    өөрчлөгдсөн» ч, «өөрчлөлтгүй» ч гэж мэдэгдэх үндэсгүй.
              //    Төлөв нь `prevError`-оор дуудагчид ил байна.
              if (prevFailed) return false;
              // Анхны нийтлэлд өмнөх агшин алга — утгатай нүд бүр ШИНЭ
              if (!prev) return true;
              return num(prev[n]) !== now;
            });
            const ch = tree[ri] ?? '0';
            const group = ch >= 'A' && ch <= 'E';
            changed.forEach((yes, k) => {
              if (!yes) return;
              changes.push({
                row: ri,
                col: k,
                no: String(a[sc.f.no] ?? '').trim(),
                work: String(a[sc.f.work] ?? '').trim() || '—',
                block: blkLabels[k] ?? String(k + 1),
                from: beforeVals[k],
                to: cells[k],
              });
            });
            return {
              cells,
              acts: acts.map((n) => num(a[n])),
              changed,
              before: beforeVals,
              depth: group ? ch.charCodeAt(0) - 65 : Number(ch),
              group,
              no: String(a[sc.f.no] ?? '').trim(),
              work: String(a[sc.f.work] ?? '').trim() || '—',
              wC: sc.f.wC ? num(a[sc.f.wC]) : null,
              wD: sc.f.wD ? num(a[sc.f.wD]) : null,
              wE: sc.f.wE ? num(a[sc.f.wE]) : null,
              vol: num(a[sc.f.vol]),
              sum: num(a[sum]),
              unit: sc.f.unit ? num(a[sc.f.unit]) : null,
              money: sc.f.money ? num(a[sc.f.money]) : null,
              plan: sc.f.plan ? num(a[sc.f.plan]) : null,
              act: sc.f.act ? num(a[sc.f.act]) : null,
              ratio: sc.f.ratio ? num(a[sc.f.ratio]) : null,
            };
          });
        }
      }

      return {
        pkgLabel: p.label,
        pkgKey: p.key,
        day: msToDay(at),
        blocks: sc.bld.filter((_, i) => sc.obyem[i]),
        // ⚠️ Хуудаслалт унасан бол prevAt олдсон ч ЖИШИГДЭЭГҮЙ — true гэвэл
        //    UI «улаан хүрээ — өөрчлөгдсөн» гэсэн худал тайлбар үзүүлнэ.
        compared: prevAt != null && !prevFailed,
        prevError: prevFailed,
        rows: cnt.count ?? 0,
        filled,
        filledCount,
        changes,
      };
    } catch (e) {
      /*
       * ⚠️ Алдааг ЗАЛГИХГҮЙ — нөгөө үйлчилгээг шалгасаар байгаад бүгд унавал
       * шалтгааныг нь дуудагчид хэлнэ.
       */
      last = String((e as Error)?.message ?? e);
      continue;
    }
  }
  if (last) throw new Error(last);
  return null;
}
