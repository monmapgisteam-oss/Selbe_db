/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» ХУУДСУУДЫН НЭГДСЭН УНШИГЧ — өргөн хэлбэрийг УРТ болгоно.
 *
 * ⚠️ ЯАГААД ЭНЭ МОДУЛЬ БАЙХ ЁСТОЙ ВЭ: урьд нь гүйцэтгэлийн бүх хэрэглэгч
 * (`blockProgress`, `BuildingPanel`, `reportData`) `Selbe_guitsetgel_consolidated`
 * гэсэн НЭГ нэгтгэсэн хүснэгтээс уншдаг байсан. Тэр хүснэгтийг 2026-08-26-нд
 * эзэн нь дахин зохион байгуулж эхэлсэн бөгөөд эхлээд `dugaar`/`ognoo`/`tuvshin`
 * талбарууд алга болж, дараа нь үйлчилгээ бүхэлдээ хаагдсан (499). Одоо БҮГД
 * `Bagts_*` бөглөх хуудсуудаас ШУУД уншина — завсрын хүснэгтгүй.
 *
 * ⚠️ ХУУДСЫН ХЭЛБЭР: ӨРГӨН. Мөр = АЖИЛ, багана = БЛОК (`F5_1_гүйцэтгэл`,
 * `F5_2_гүйцэтгэл`…). Гүйцэтгэлийн бүх хэрэглэгч УРТ хэлбэр (мөр = ажил×блок)
 * хүлээдэг тул задаргааг ЭНД НЭГ УДАА хийнэ. Хуулбарлавал шинэ багана нэмэгдэх
 * бүрд хоёр газар засах шаардлагатай болно.
 *
 * ⚠️ ТҮВШИН (`level`) нь ХУУДСАНД БАЙХГҮЙ. Нэгтгэсэн хүснэгтэд `tuvshin` багана
 * байсан бол энд №-ийн ХЭЛБЭРЭЭС гаргана (`levelFromNo`) — тэр функц нь
 * excel-ийн А баганын бичиглэлийг унших цорын ганц найдвартай эх.
 *
 * ⚠️ АГШИН нь `buglusun_ognoo` — нийтлэх бүрд хуудас бүхэлдээ доор нь
 * ХУУЛБАРЛАГДАЖ нэмэгддэг тул нэг өдрийн бүх мөр ижил огноотой. Хуучин
 * `Шинэчлэгдсэн_огноо` нь зөвхөн 1-р мөрд бичигддэг excel-ийн лавлах нүд —
 * агшин ялгах түлхүүр БОЛОХГҮЙ.
 */
import { PKGS, loadSchema, type Pkg } from './bagts.pkg';
import { msToDay } from './bagtsSheet';
import { levelFromNo } from './ags';
import { TASK_SHEET, bagtsKey, normalizeTaskNo, constructionWhere } from '@/lib/services';
import { withSlot, isRateLimit } from '@/lib/query';

/** Урт хэлбэрийн НЭГ мөр — нэг ажлын, нэг блокийн, нэг агшны бүртгэл. */
export type SheetRow = {
  /** Багцын нэр — `Pkg.group` («Багц 4-1») */
  bagts: string;
  /** Блокийн код — «5/1». ⚠️ «5/1 барилга» гэсэн үг ЗАЛГАХГҮЙ */
  block: string;
  /** Агшны огноо, `YYYY-MM-DD` */
  date: string;
  /** № — «Б.», «Б1», «3.2», «7» */
  no: string;
  /** Ажлын нэр. Бүлгийн мөрд хоосон байвал №-ийг нь тавина */
  work: string;
  /** Шатлал 1–5 (5 = навч). №-ээс гаргасан тул `null` байж болно */
  level: number | null;
  /** Хувийн жин — түвшин гаргахад ба жигнэхэд */
  weight: number | null;
  /** Гүйцэтгэл 0–1 (ХУВЬ БИШ). Бөглөөгүй нүд `null` */
  progress: number | null;
  /**
   * ХУВААРЬ — тухайн блокийн эхлэх/дуусах (ms epoch). `withDates` сонголттой
   * үед л дүүрнэ, эс бөгөөс `null`.
   *
   * ⚠️ ЯАГААД ЭНД (2026-09-04): «Гүйцэтгэлийн явц» графикийн ТӨЛӨВЛӨСӨН муруй
   * нь урьд нь `cashflow`-оос гардаг байсан — тэр нь МӨНГӨний хуваарийн хувь
   * бөгөөд хуваарийн 12 сарын цонхны нийлбэрт хуваагддаг тул цонх дуусахад
   * ҮРГЭЛЖ 100% болдог байв («2026-09-д төсөл дуусна» гэсэн худал). Хуваариас
   * бодвол биет гүйцэтгэлтэй ИЖИЛ нэгжтэй болж, төсөл эхлэхээс дуусах хүртэл
   * үнэн муж гарна.
   *
   * ⚠️ Бүтэн хуудас татах нь 13MB (хэмжсэн) тул БОЛОХГҮЙ. «Б.» мөр нь блок
   * бүрд өөрийн огноотой байдаг ба 10 багцын 9-д бүтэн модны тооцоотой ЯГ
   * ижил хариу өгдөг (b1_12f-ийн нэг блок «Б.»-д огноогүй тул 6пп зөрнө —
   * төслийн нийтэд 0.4пп).
   */
  start: number | null;
  end: number | null;
  /**
   * Хуудсан дахь МӨРИЙН ДАРААЛАЛ (ObjectID). Толгой↔навч харьцааг зөвхөн
   * дараалал заадаг тул хэсэг/үе шат стампалахад ЗААВАЛ хэрэгтэй.
   */
  ord: number;
  /** Эх хуудасны түлхүүр (`Pkg.key`) — «b1_9f». Багц бүр 1–2 хуудастай. */
  sheet: string;
  /**
   * НИЙТЛЭЛТИЙН ХУУЛБАРЫН дугаар (0-оос эхэлнэ).
   *
   * ⚠️ ЯАГААД ОГНОО ХАНГАЛТГҮЙ ВЭ: нийтлэх бүрд хуудас бүхэлдээ доор нь
   * ХУУЛБАРЛАГДАЖ нэмэгддэг бөгөөд НЭГ ӨДӨРТ хоёр ч удаа нийтэлж болно
   * (Багц 1-ийн 2026-08-21-нд яг тийм). Зөвхөн огноогоор багцлавал хоёр
   * хуулбар нэг цувралд НИЙЛЖ, толгой↔навч харьцаа эвдэрдэг — тэгэхэд
   * «Бэлтгэл (А.)» ажлууд «Б.» үе шатанд ХУДЛААР тоологдоно.
   *
   * Хуулбарын зааг: жаазны ЭХНИЙ № дахин тааралдах мөр.
   */
  snap: number;
};

export type SheetRowOpts = {
  /** Зөвхөн энэ багцын хуудсуудыг татна («Багц 1»). `bagtsKey`-ээр жишнэ. */
  group?: string | null;
  /** Зөвхөн энэ блокийн БАГАНЫГ татна («5/1») — хүсэлт хамаагүй хөнгөн болно. */
  block?: string | null;
  /**
   * Зөвхөн `Б.` ба `Б1…Б5` мөр. Газрын зургийн гүйцэтгэлд ЭНЭ хэрэгтэй:
   * навч ажлууд (1,370 мөр × 20 блок = 27 мянган цэг) огт татагдахгүй.
   */
  constructionOnly?: boolean;
  /** Энэ түвшнээс ДЭЭШ мөрийг хаяна (`useBagtsWorks` нь 1–4-ийг хүсдэг) */
  maxLevel?: number;
  /**
   * Блокийн ХУВААРИЙН огноог (эхлэх/дуусах) ч татна.
   * ⚠️ Багана тутам 2 нэмэгдэх тул анхдагчаар УНТРААЛТТАЙ — зөвхөн
   *    төлөвлөгөөт муруй бодох дуудагч асаана.
   */
  withDates?: boolean;
};

/** `'` тэмдэгтийг SQL-д аюулгүй болгоно */
const esc = (v: string) => v.replace(/'/g, "''");

const nOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Нэг хуудасны хүсэлт — хязгаарлагчийн ДОТОР, rate-limit дээр дахин оролдоно. */
async function onePage(url: string, params: Record<string, string>) {
  /*
   * ⚠️ `withSlot` ЗААВАЛ: энэ модулийн fetch нь `query.ts`-ийн 6 слотын
   *    хязгаарлагчийг ТОЙРЧ гардаг байв. `loadSheetRows` нь 10 багцыг
   *    `Promise.all`-аар зэрэг эхлүүлдэг тул дашбоардын ~120 slotted хүсэлтийн
   *    дээр нэмэгдэж, ArcGIS «Too many requests» гэж татгалздаг. `parcelOverlap`
   *    ба `suit/roadNet` дээр яг энэ алдаа 2026-08-21-нд аль хэдийн засагдсан —
   *    энэ зам орхигдсон байлаа.
   *
   * ⚠️ ДАХИН ОРОЛДОХ нь мөн заавал: rate-limit нь ТҮР зуурын бөгөөд ArcGIS
   *    түүнийг HTTP 200 + `{error:…}`-ээр буцаадаг. Урьд нь шууд `throw` хийдэг
   *    тул `loadBlockProgress` реject болж, MapCanvas кэшээ хаяад бүх блок
   *    «мэдээлэлгүй» болж саарладаг байв.
   */
  const RETRIES = 4;
  for (let attempt = 0; ; attempt += 1) {
    const j = await withSlot(async () => {
      const res = await fetch(`${url}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ f: 'json', ...params }),
      });
      // ⚠️ HTTP алдаанд (429/503) бие нь JSON биш байж болно — эхлээд `res.ok`
      //    шалгахгүй бол `res.json()` тодорхойгүй SyntaxError шидэж будлиантана.
      if (!res.ok) {
        if ((res.status === 429 || res.status === 503) && attempt < RETRIES) return null;
        throw new Error(`ArcGIS HTTP ${res.status}`);
      }
      const body = await res.json();
      // ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — биеийг ЗААВАЛ шалгана.
      if (body.error) {
        const msg = body.error.message || 'ArcGIS error';
        if (isRateLimit(msg) && attempt < RETRIES) return null;
        throw new Error(msg);
      }
      return body as {
        features?: { attributes: Record<string, unknown> }[];
        exceededTransferLimit?: boolean;
      };
    });
    if (j) return j;
    await sleep(400 * 2 ** attempt + Math.random() * 200);
  }
}

/**
 * Нэг хуудсыг БҮРЭН татна (2000 мөрийн хязгаарыг хуудаслаж давна).
 *
 * ⚠️ `orderByFields` нь гоо сайхны зүйл БИШ: `resultOffset`-той хуудаслалт
 * эрэмбэгүй бол ArcGIS-д ТОДОРХОЙГҮЙ — хуудасны зааг дээр мөр давхардах/унах
 * бөгөөд алдаа нь ЧИМЭЭГҮЙ (нэг блокийн сүүлийн утга алга болж, хуучин утга
 * харагдана).
 */
async function fetchPage(
  url: string,
  where: string,
  outFields: string[],
  orderBy: string,
  /** ЗӨВХӨН ялгаатай утгууд — огнооны жагсаалт мэт нэгдмэл асуулгад. */
  distinct = false,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let off = 0; ; ) {
    const j = await onePage(url, {
      where,
      outFields: [...new Set(outFields)].join(','),
      returnGeometry: 'false',
      orderByFields: orderBy,
      resultRecordCount: '2000',
      resultOffset: String(off),
      ...(distinct ? { returnDistinctValues: 'true' } : {}),
    });
    const rows = (j.features || []).map((x) => x.attributes);
    out.push(...rows);
    if (!j.exceededTransferLimit || !rows.length) break;
    off += rows.length;
  }
  return out;
}

/**
 * Бөглөх хуудсуудаас УРТ хэлбэрийн мөрүүд.
 *
 * Буцаах дараалал: хуудас бүрийн дотор ObjectID ӨСӨХ (`ord`). Дуудагч тал
 * огноогоор эрэмбэлэх шаардлагатай бол өөрөө хийнэ — хуудасны дараалал нь
 * толгой↔навч харьцааг үүрдэг тул ЭНД алдагдуулж болохгүй.
 */
export async function loadSheetRows(opts: SheetRowOpts = {}): Promise<SheetRow[]> {
  const {
    group = null, block = null, constructionOnly = false, maxLevel, withDates = false,
  } = opts;

  const wanted: Pkg[] = group
    ? PKGS.filter((p) => bagtsKey(p.group) === bagtsKey(group))
    : PKGS;
  if (!wanted.length) return [];

  const subList = TASK_SHEET.subPhaseNos.map((n) => `N'${esc(n)}'`).join(',');
  const out: SheetRow[] = [];

  await Promise.all(wanted.map(async (pkg) => {
    const sc = await loadSchema(pkg).catch(() => null);
    // Архивын багана үүсээгүй хуудсыг алгасна — агшин ялгах түлхүүргүй тул
    // түүх байгуулах боломжгүй (одоогийн утгыг ч огноогүйгээр хэрэглэхгүй).
    if (!sc?.f.fillDate) return;

    /* ── Аль блокийн багануудыг татах вэ ── */
    let idx: number[] = sc.bld.map((_, i) => i);
    if (block) {
      const want = String(block).trim();
      idx = idx.filter((i) => sc.bld[i] === want);
      if (!idx.length) return;               // энэ хуудсанд тэр блок алга
    }
    const actCols = idx.map((i) => sc.act[i]).filter(Boolean);
    if (!actCols.length) return;
    /* Хуваарийн багана — зөвхөн хүссэн үед (`withDates`) */
    /* ⚠️ `filter(Boolean)` нь TS-д төрлийг НАРИЙСГАДАГГҮЙ — предикат хэрэгтэй */
    const dateCols: string[] = withDates
      ? [...idx.map((i) => sc.start[i]), ...idx.map((i) => sc.end[i])]
        .filter((x): x is string => !!x)
      : [];

    /*
     * ⚠️ БӨГЛӨХ ХУУДСАНД № ТАЛБАР ЯЛГААТАЙ: дэд үе шат нь «Б1»…«Б5» гэж цэвэр
     *    кодтой ч НИЙТ мөр нь «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» гэсэн БҮТЭН шошготой.
     *    Тиймээс нийт мөрийг ТЭНЦҮҮГЭЭР биш, LIKE-ээр барина — эс бөгөөс
     *    гүйцэтгэлийн нийт дүн олдохгүй бөгөөд блок бүр «мэдээлэлгүй» болно.
     *
     * ⚠️ 2026-09-04: LIKE ч хангалтгүй байв — Багц 2·12F ба Багц 3.2·9F-д тэр
     *    нүд «Б» гэж ЦЭГГҮЙ бичигдсэн тул `LIKE N'Б.%'` 0 мөр өгч, тэр хоёр
     *    багцын БҮХ блок газрын зурагт «мэдээлэлгүй» саарал үлддэг байлаа
     *    (амьд хэмжсэн). Одоо предикат нь `services.constructionWhere` —
     *    цэгтэй ба цэггүй хоёуланг барих ЦОРЫН ГАНЦ дүрэм.
     */
    const where = constructionOnly
      ? `(${sc.f.no} IN (${subList}) OR ${constructionWhere(sc.f.no)})`
        + ` AND ${sc.f.fillDate} IS NOT NULL`
      : `${sc.f.fillDate} IS NOT NULL`;

    const rows = await fetchPage(
      pkg.url,
      where,
      [sc.f.no, sc.f.work, sc.f.wC, sc.f.fillDate, sc.f.oid, ...actCols, ...dateCols],
      `${sc.f.oid} ASC`,
    );

    /* ── ӨРГӨН → УРТ ── */
    let snap = 0;
    let firstNo: string | null = null;
    for (const a of rows) {
      const ms = a[sc.f.fillDate];
      if (typeof ms !== 'number') continue;
      const date = msToDay(ms);

      const rawNo = String(a[sc.f.no] ?? '').trim();
      /* «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ» → «Б.»; бүлгийн нэр нь № дотор байдаг.
       * ⚠️ Нормчлол нь `services.normalizeTaskNo` — «Б» (ЦЭГГҮЙ) хэлбэрийг ч
       *    барина. Урьд нь `startsWith('Б.')` байсан тул Багц 2·12F ба
       *    Багц 3.2·9F-ийн нийт мөр «Б» хэвээр үлдэж, `blockProgress`-ийн
       *    `cells.get('Б.')` undefined болж тэр багцууд дашбоардад ОРДОГГҮЙ
       *    байв. «Б1»…«Б5» дэд үе шат нь хөндөгдөхгүй. */
      const no = normalizeTaskNo(rawNo);
      /* ⚠️ Хуулбарын зааг нь ШҮҮЛТЭЭС ӨМНӨ бодогдоно: `maxLevel`-ээр хаясан
         мөр ч жаазны нэг хэсэг тул алгасвал хуулбарын дугаар алдагдана. */
      if (firstNo == null) firstNo = rawNo;
      else if (rawNo === firstNo) snap += 1;

      const weight = nOrNull(a[sc.f.wC]);
      /* ⚠️ Түвшнийг НОРМЧИЛСОН №-ээс бодно: `levelFromNo` нь үе шатыг таниа
       *    гэхэд үсгийн ард ЦЭГ шаарддаг (`^[үсэг]\.`) тул цэггүй «Б»/«А» нь
       *    `null` буцааж, тэр багцуудад ТҮВШИН-1 мөр ОЛДОХГҮЙ болдог байв —
       *    `BuildingPanel`-ийн үе шатын стамп хоосорч, «ажлын төлөв» самбар
       *    бүхэлдээ 0 ажилтай харагддаг байлаа. Нормчлол нь дэд үе шат
       *    («Б1»…«Б5» → түвшин 2) ба навч мөрийг хөндөхгүй. */
      const level = levelFromNo(no, weight);
      if (maxLevel != null && (level == null || level > maxLevel)) continue;

      const work = String(a[sc.f.work] ?? '').trim() || rawNo;
      const ord = Number(a[sc.f.oid]) || 0;

      for (const i of idx) {
        const fld = sc.act[i];
        if (!fld) continue;                  // тэр блокт багана үүсээгүй
        out.push({
          bagts: pkg.group,
          block: sc.bld[i],
          date,
          sheet: pkg.key,
          snap,
          no,
          work,
          level,
          weight,
          progress: nOrNull(a[fld]),
          /* ⚠️ Огноо нь ms epoch — `withDates` унтраалттай бол `null` */
          start: withDates && sc.start[i] ? nOrNull(a[sc.start[i] as string]) : null,
          end: withDates && sc.end[i] ? nOrNull(a[sc.end[i] as string]) : null,
          ord,
        });
      }
    }
  }));

  return out;
}

/**
 * Хуудсуудад бүртгэгдсэн БҮХ АГШНЫ ОГНОО (`YYYY-MM-DD`, өсөх дараалал).
 *
 * ⚠️ Урьд нь энэ жагсаалт нэгтгэсэн хүснэгтийн `ognoo` талбараас
 * (`ags.distinct`) гардаг байв — тэр үйлчилгээ хаагдсан тул огнооны сонголт
 * ЧИМЭЭГҮЙ хоосорч байсан (дуудалт нь `.catch(() => {})`-той). Одоо бөглөх
 * хуудсуудын `buglusun_ognoo`-оос шууд гарна.
 *
 * ⚠️ Алдаа гарсан хуудсыг АЛГАСНА — нэг хуудас унаснаас болж бүх сонголт
 * алга болох ёсгүй.
 */
export async function sheetDates(): Promise<string[]> {
  const days = new Set<string>();
  await Promise.all(PKGS.map(async (pkg) => {
    const sc = await loadSchema(pkg).catch(() => null);
    if (!sc?.f.fillDate) return;
    /*
     * ⚠️ ЗӨВХӨН ЯЛГААТАЙ ОГНОО (`returnDistinctValues`). Урьд нь хуудас бүрийн
     *    БҮХ мөрийг (10 багц нийлээд ~39,700 мөр, ~1.8 МБ, ~22 дараалсан
     *    хүсэлт) татаад 4 огноо ялгаж авдаг байв — Багц 1 дангаараа 14 хуудас,
     *    4.5 секунд. «Гүйцэтгэл бөглөх» нээх БҮРД бүхэлдээ давтагдана.
     *    `returnDistinctValues` эдгээр үйлчилгээнд ажилладгийг амьдаар шалгав:
     *    нэг хүсэлт, 4 мөр, ~0.3 сек.
     * ⚠️ Хуудаслалт ба `orderByFields` ХЭВЭЭР: ялгаатай утга 2000-аас хэтэрвэл
     *    (олон жил бөглөгдвөл) хариу чимээгүй тайрагдах ёсгүй.
     */
    const rows = await fetchPage(
      pkg.url,
      `${sc.f.fillDate} IS NOT NULL`,
      [sc.f.fillDate],
      `${sc.f.fillDate} ASC`,
      true,
    ).catch(() => []);
    for (const a of rows) {
      const ms = a[sc.f.fillDate as string];
      if (typeof ms === 'number') days.add(msToDay(ms));
    }
  }));
  return [...days].sort();
}

/**
 * Хуудсуудад бүртгэлтэй БАГЦЫН НЭРС.
 *
 * ⚠️ Урьд нь энэ нь нэгтгэсэн хүснэгтээс `returnDistinctValues`-ээр татдаг
 * СҮЛЖЭЭНИЙ хүсэлт байв. Бөглөх хуудас бүр өөрийн багцтай нэг-нэгээр таарах
 * тул одоо бүртгэлээс шууд гарна — хүсэлт огт шаардлагагүй.
 */
export const sheetBagtsNames = (): string[] => [...new Set(PKGS.map((p) => p.group))];
