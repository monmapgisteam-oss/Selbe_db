/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хяналтын УРСГАЛ (flow · өөр өдрүүд · буцаалт) ба өөр өдрийн хяналтад буй нэмэлт.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PKGS, type Pkg, type Schema } from "../bagts.pkg";
import { loadRows, msToDay, type SheetRow } from "../bagtsSheet";
import { overlaySubmission } from "../sheetFrame";
import { readSubmissionByOid } from "@/lib/submission";
import { OWNER, STATUS, F as HF } from "@/lib/hyanalt";
import { useHyanaltRows } from "@/lib/hyanaltStore";
import { nowFillMs, type SheetView } from "./util";

/** Хяналтын урсгалын мөрүүд — энэ хуудасны өнөөдрийн/буцаагдсан мөр, өөр өдрүүдийн байдал. */
export function useFlow({ pkg, view }: { pkg: Pkg; view?: SheetView }) {
  const { rows: hyRows, loading: hyLoading, error: hyErr, reload: reloadHy } = useHyanaltRows();
  /**
   * ӨНӨӨДРИЙН БӨГЛӨХ ӨДӨР (`Date.UTC(y,m,d)`) — ИЛГЭЭЛТИЙН ТҮЛХҮҮРИЙН ӨДӨР.
   *
   * ⚠️ НЭГ Л УДАА (2026-09-07): `publish` доторх `fillMs` тооцоо ба хуудас
   *    ачаалах эффектийн `fillMs` ХОЁУЛАА ЭНДЭЭС уншина. Хоёр газар тус
   *    тусад нь `Date.UTC(...)` бодвол шөнө дунд өнгөрөхөд хуудас нэг өдрийн
   *    илгээлтийг давхарлаж, `publish` өөр өдрийн түлхүүрт бичиж, `staged`
   *    (нэгтгэх суурь) чимээгүй тасарна.
   * ⚠️ `today` (`msToDay`) нь ХАРАГДАЦЫН мөр — энэ нь ТҮЛХҮҮРИЙН тоо. Хоёрыг
   *    андуурч болохгүй.
   */
  /* ⚠️ ӨДӨР СОЛИГДОХЫГ ТАНИНА (2026-09-25-ны аудит). Урьд нь `useState` нэг
     удаа бодогдож ХӨЛДДӨГ байв: шөнө дунд өнгөрсөн нээлттэй таб өчигдрийн
     түлхүүрээр (`sub|<pkg>|<өчигдөр>`) илгээж, өчигдрийн хянагдаж буй мөрийг
     дарж/нийлүүлж, архивт өчигдрийн `buglusun_ognoo`-оор оруулдаг байв. Одоо
     `nowFillMs()`-ээр дахин бодож (доорх эффект ба `publish`), зөрвөл төлөвийг
     шинэчилнэ — ачаалах эффект (`todayFillMs`-ээс хамаарна) хуудсыг ШИНЭ
     өдрөөр дахин ачаалж, ноорог локал/алсаас сэргэнэ. «НЭГ Л УДАА» дүрэм
     хэвээр: хоёр зам ХОЁУЛАА энэ төлөвөөс уншина. */
  const [todayFillMs, setTodayFillMs] = useState(nowFillMs);
  /**
   * ЭНЭ ӨДРИЙН хяналтын мөрийг ЯЛГАХ шошго — `hyanaltSubmit.dayLabel`-тэй
   * ИЖИЛ хэлбэр (`YYYY.MM.DD`).
   *
   * ⚠️ ЛОКАЛЬ цагаар задална — `hyanaltSubmit.dayLabel` ч мөн адил
   *    (`new Date(ms).getFullYear/...`). `todayFillMs` нь `Date.UTC`-ээр
   *    бүтсэн тул UTC+8-д тэр хоёр НЭГ өдөр өгнө. Хэрэв энэ хоёрын аль нэгийг
   *    өөрчлөх бол НӨГӨӨГ НЬ ЗААВАЛ хамт өөрчил — эс бөгөөс өнөөдрийн
   *    хяналтын мөрийг «өөр өдрийнх» гэж уншиж, хориг ажиллахаа болино.
   */
  const todayAjilTag = useMemo(() => {
    const d = new Date(todayFillMs);
    const p = (n: number) => String(n).padStart(2, '0');
    return `Гүйцэтгэл · ${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }, [todayFillMs]);
  const flow = useMemo(() => {
    /*
     * ⚠️ ХУУДСЫГ ЯЛГАНА (2026-09-04-ний аудит). Хяналтын мөр нь БАГЦААР
     *    (`Багц 1`) бүртгэгддэг ч илгээлт нь ХУУДСААР (`sub|b1_9f`) явдаг.
     *    Багц 1 · Багц 2 · Багц 4-2 гурав нь 9 ба 12 давхрын ХОЁР хуудастай
     *    тул зөвхөн багцаар шүүвэл 12F-ийн илгээлт 9F-ийн «Нийтлэх»-ийг
     *    бүрмөсөн хаадаг байв («Илгээлт хяналтад байна»).
     * ⚠️ ХУУЧИН мөрүүдэд хуудсын нэр ОРООГҮЙ — тэдгээр нь багцын БҮХ хуудсанд
     *    хамаарна (өмнөх зан төлөв хэвээр); зөвхөн ӨӨР хуудсын нэр тодорхой
     *    бичигдсэн мөрийг хасна.
     */
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    /* ⚠️ `pkg.name` (орчуулагддаггүй эх нэр), `pkg.label` БИШ (2026-09-21):
       `Ажлын_нэр`-д монгол нэр бичигддэг тул англи UI дээр `label`-аар тулгавал
       өөрийн мөр олдохгүй, нөгөө хуудсынх нь шүүгдэхгүй байв. */
    const mine = hyRows.filter((r) => {
      if (r[HF.bagts] !== pkg.group) return false;
      const ajil = String(r[HF.ajil] ?? '');
      if (ajil.includes(pkg.name)) return true;
      return !others.some((p) => ajil.includes(p.name));
    });
    if (!mine.length) return null;
    /*
     * ⚠️ ӨНӨӨДРИЙН МӨРИЙГ ЭРХЭМЛЭНЭ (2026-09-07). Урьд нь энд шууд «OBJECTID
     *    хамгийн их» гэж авдаг байсан нь өдөр бүр тусдаа илгээлт болсноор
     *    БУРУУ болов: өчигдрийн ажил инженерийн гар дээр байхад өнөөдөр
     *    илгээвэл хамгийн их OBJECTID нь ӨНӨӨДРИЙНХ болох ч, өнөөдөр хараахан
     *    илгээгээгүй бол ӨЧИГДРИЙНХ гарч ирж, түүгээр `inReview` тооцвол
     *    өнөөдрийн илгээлт хаагдана — яг тэр зам нь хэрэглэгчийн 2026-09-07-ны
     *    гомдол («хянагдаж байсан ч дараа өдрийнхийг илгээх боломжтой байх
     *    ёстой»). Тиймээс ЭНЭ ӨДРИЙН (Ажлын_нэр-д огноо нь орсон) мөрийг
     *    тусад нь сонгоно; байхгүй бол `null` — өнөөдөр урсгал эхлээгүй.
     */
    const mineToday = mine.filter((r) => String(r[HF.ajil] ?? '').startsWith(todayAjilTag));
    // Хамгийн сүүлийн тойрог — OBJECTID хамгийн их нь
    if (mineToday.length) return mineToday.reduce((a, b) => (b.__oid > a.__oid ? b : a));
    /*
     * ⚠️ ӨНӨӨДРИЙН МӨР БАЙХГҮЙ БОЛ — ӨМНӨХ ӨДРИЙН БУЦААГДСАН МӨР (2026-09-21).
     *    Урьд нь энд шууд `null` буцдаг тул 09-04-нд буцаагдсан илгээлт
     *    09-05-нд `flow = null` болж: «БУЦААСАН» баннер гарахгүй, ачаалах
     *    замын `flowRef`-ээс уншдаг сэргээлт (`OWNER === 'company'` мөрийг
     *    `Эх_мөрийн_дугаар`-аар давхарлах) ХЭЗЭЭ Ч ажиллахгүй, `publish` нь
     *    буцаагдсан мөрийг update хийхийн оронд өнөөдрийн ШИНЭ мөр үүсгэдэг
     *    байв. Одоо ЗӨВХӨН гүйцэтгэгчийн гар дээрх (`company`, `Шилжүүлсэн`
     *    биш) хамгийн сүүлийн мөрийг өдөр үл хамааран сонгоно.
     * ⚠️ Хянагчийн гар дээрх өөр өдрийн мөрийг ЭНД АВАХГҮЙ — тэр нь
     *    `inReview`-ээр өнөөдрийн илгээлтийг хаах байсан (2026-09-07-ны
     *    гомдол); тэдгээр нь `otherDaysInReview`-д мэдээлэл болж үлдэнэ.
     */
    /* ⚠️ НЭГ ИЛГЭЭЛТИЙН (ижил `Эх_мөрийн_дугаар`) зөвхөн ХАМГИЙН СҮҮЛИЙН
       тойргийг харна: буцаагдсан мөр дахин илгээгдэхэд `submitForReview`
       ergelt+1-тэй ШИНЭ мөр үүсгэдэг ба хуучин «буцаасан» мөр хэвээр үлддэг
       тул түүнийг үл тоовол аль хэдийн хянагдаж буй илгээлт «буцаагдсан»
       мэт харагдана. */
    const lastRound = new Map<number, (typeof mine)[number]>();
    for (const r of mine) {
      const so = Number(r[HF.sheetOid]);
      const k = Number.isInteger(so) && so > 0 ? so : -r.__oid;
      const prev = lastRound.get(k);
      if (!prev || r.__oid > prev.__oid) lastRound.set(k, r);
    }
    const backed = [...lastRound.values()]
      .filter((r) => r[HF.status] !== STATUS.transferred && OWNER[r[HF.status]] === 'company');
    if (!backed.length) return null;
    return backed.reduce((a, b) => (b.__oid > a.__oid ? b : a));
  }, [hyRows, pkg.group, pkg.key, pkg.name, todayAjilTag]);
  /**
   * ӨӨР ӨДРИЙН хянагдаж буй урсгалууд — ЗӨВХӨН МЭДЭЭЛЭЛ, ХОРИГ БИШ.
   *
   * ⚠️ 2026-09-07: эдгээр нь одоо «Илгээх»-ийг ХААХГҮЙ. Өдөр бүр өөрийн
   *    `sub|<pkg>|<fillMs>` мөртэй тул өнөөдрийн илгээлт өчигдрийн хянагдаж
   *    буй агуулгыг ОГТ хөндөхгүй (`saveSubmission` өдрийн түлхүүрээр
   *    ажилладаг). Гэхдээ гүйцэтгэгч «өмнөх өдрүүд хаана явж байна» гэдгээ
   *    харах ёстой — эс бөгөөс хариу ирээгүй өдрөө мартаж, тэр өдрийн
   *    буцаалт хариугүй үлдэнэ.
   */
  const otherDaysInReview = useMemo(() => {
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const days = new Set<string>();
    for (const r of hyRows) {
      if (r[HF.bagts] !== pkg.group) continue;
      const ajil = String(r[HF.ajil] ?? '');
      /* ⚠️ `name` (эх нэр) — `label` орчуулагддаг (2026-09-21, `flow`-ийн ⚠️). */
      if (!ajil.includes(pkg.name) && others.some((p) => ajil.includes(p.name))) continue;
      if (ajil.startsWith(todayAjilTag)) continue;
      if (r[HF.status] === STATUS.transferred) continue;
      /* Гүйцэтгэгчийн гар дээр буцаж ирсэн нь «хянагдаж байгаа» БИШ.
         ⚠️ `OWNER` нь `Record<Status, Stage>` тул түүхий `string`-ээр
         индекслэхгүй — мөрийн талбарыг ШУУД дамжуулна (`flow`-ийн
         `OWNER[flow[HF.status]]`-тэй ижил хэв маяг). */
      if (OWNER[r[HF.status]] === 'company') continue;
      const m = /(\d{4}\.\d{2}\.\d{2})/.exec(ajil);
      if (m) days.add(m[1]);
    }
    return [...days].sort();
  }, [hyRows, pkg.group, pkg.key, pkg.name, todayAjilTag]);
  /**
   * ӨӨР ӨДРИЙН БУЦААГДСАН урсгалууд — зөвхөн МЭДЭЭЛЭЛ (2026-09-21-ний дахин аудит).
   *
   * ⚠️ ЯАГААД: `flow` нь ӨНӨӨДРИЙН мөрийг эрхэмлэдэг тул өнөөдөр шинэ илгээлт
   *    байвал өмнөх өдрийн БУЦААГДСАН мөр `flow` болохгүй; `otherDaysInReview`
   *    нь гүйцэтгэгчийн гар дээрх (`company`) мөрийг санаатай алгасдаг. Тэгэхээр
   *    тэр буцаалт ХААНА Ч харагдахгүй — хариугүй үлддэг байв. `flow`-той ижил
   *    «нэг илгээлтийн сүүлийн тойрог» дүрмээр шүүнэ; `flow` өөрөө буцаагдсан
   *    мөр бол түүнийг давхар хэлэхгүй (`backNote` аль хэдийн харуулна).
   */
  const otherDaysReturned = useMemo(() => {
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const lastRound = new Map<number, (typeof hyRows)[number]>();
    for (const r of hyRows) {
      if (r[HF.bagts] !== pkg.group) continue;
      const ajil = String(r[HF.ajil] ?? '');
      if (!ajil.includes(pkg.name) && others.some((p) => ajil.includes(p.name))) continue;
      const so = Number(r[HF.sheetOid]);
      const k = Number.isInteger(so) && so > 0 ? so : -r.__oid;
      const prev = lastRound.get(k);
      if (!prev || r.__oid > prev.__oid) lastRound.set(k, r);
    }
    const days = new Map<string, number>();
    for (const r of lastRound.values()) {
      if (flow && r.__oid === flow.__oid) continue;
      if (r[HF.status] === STATUS.transferred || OWNER[r[HF.status]] !== 'company') continue;
      const m = /(\d{4}\.\d{2}\.\d{2})/.exec(String(r[HF.ajil] ?? ''));
      /* 2026-09-24: өдөр → илгээлтийн OBJECTID (`resumeReturned`-д) */
      if (m) days.set(m[1], Number(r[HF.sheetOid]));
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, soid]) => ({ day, soid }));
  }, [hyRows, flow, pkg.group, pkg.key, pkg.name]);
  /**
   * ЭНЭ СЕШНД ГАРААР СОНГОСОН буцаагдсан илгээлтийн OBJECTID (2026-09-24).
   * ⚠️ Өнөөдрийн илгээлт байхад өмнөх өдрийн буцаалт `flow` болдоггүй тул
   *    `publish` түүнийг өнөөдрийн түлхүүрээр явуулж, «өөр хэрэглэгч илгээсэн»
   *    гэж зогсдог байв — буцаагдсан илгээлт ХЭЗЭЭ Ч дахин илгээгдэхгүй.
   *    Сонгосон бол `staged` тэр илгээлт болж, `publish` ТҮҮНИЙ өдрөөр
   *    UPDATE хийнэ (`fillMs`-ийн ⚠️). Багц солиход тэглэгдэнэ.
   */
  /* ⚠️ 2026-09-30: БАГЦААР ТҮЛХҮҮРЛЭСЭН төлөв — багц солиход эффектгүйгээр өөрөө `null`
     (урьд `useEffect(() => setResumedOid(null), [pkg.key])` — эффект доторх setState). Утга ба
     тэглэгдэх агшин ижил: өөр багцын түлхүүртэй утга уншигдахгүй. */
  const [resumedSt, setResumedSt] = useState<{ pkgKey: string; oid: number | null }>({ pkgKey: pkg.key, oid: null });
  const resumedOid = resumedSt.pkgKey === pkg.key ? resumedSt.oid : null;
  const setResumedOid = useCallback((oid: number | null) => setResumedSt({ pkgKey: pkg.key, oid }), [pkg.key]);
  const returned = flow ? OWNER[flow[HF.status]] === "company" : false;
  /** Урсгал ОДОО хэний гар дээр байна вэ (`null` = бүртгэлгүй) */
  const reviewStage = flow ? OWNER[flow[HF.status]] : null;
  /**
   * ЭНЭ ӨДРИЙН илгээлт хянагчийн гар дээр байна уу.
   *
   * ⚠️ 2026-09-07-НООС ЭНЭ НЬ ХОРИГ БИШ, ЗӨВХӨН САНУУЛГА (хэрэглэгчийн шууд
   *    шаардлага: «Times-ийн хязгаарлалт болиод хэдэн ч удаа илгээх боломжтой
   *    болго»). Урьд нь энэ туг «Илгээх» товчийг БҮРМӨСӨН хаадаг байсан тул
   *    инженер хариу өгөх хүртэл гүйцэтгэгч ямар ч засвар илгээж чадахгүй,
   *    дараа өдрийнхөө гүйцэтгэлийг ч оруулж чаддаггүй байв.
   *
   * ⚠️ ҮЛДЭЖ БУЙ ЭРСДЭЛ, САНААТАЙ ХҮЛЭЭН ЗӨВШӨӨРСӨН: ЯГ ЭНЭ ӨДРИЙН илгээлтийг
   *    дахин илгээвэл `saveSubmission` тэр мөрийг update хийнэ (хэрэглэгчийн
   *    шийдвэр 2: «шинэ тойрог үүсгэхгүй, тэр өдрийн илгээлт шинэчлэгдэнэ»)
   *    — хянагчийн ЯГ ОДОО харж буй агуулга доор нь солигдож болно. Тиймээс
   *    ХААХГҮЙ ч ИЛ САНУУЛНА (доорх мэдэгдлийн хэсэг ба `publish`-ийн
   *    `done(...)` мессеж).
   * ⚠️ ӨӨР ӨДРИЙН илгээлтэд энэ эрсдэл ОГТ БАЙХГҮЙ: түлхүүр нь өөр
   *    (`sub|<pkg>|<fillMs>`) тул тэр мөр хөндөгдөхгүй.
   *
   * ⚠️ `Шилжүүлсэн` (батлагдсан) нь энэ тугт ОРОХГҮЙ: мөчлөг дууссан.
   * ⚠️ Буцаалт (`OWNER === 'company'`) ч ОРОХГҮЙ — засах ЁСТОЙ.
   */
  const inReview = !!flow
    && flow[HF.status] !== STATUS.transferred
    && reviewStage !== "company";
  /**
   * Урсгалын мөрийн ХАМГИЙН СҮҮЛИЙН утга — багц ачаалах эффектэд.
   *
   * ⚠️ ЯАГААД REF, ХАМААРАЛ БИШ: `flow` нь `useHyanaltRows`-ийн кэшээс ирдэг
   *    бөгөөд хяналтын жагсаалт шинэчлэгдэх бүрд ШИНЭ объект болно. Ачаалах
   *    эффектийн хамаарлын жагсаалтад тавибал 1,400 мөр + илгээлт нь
   *    бүртгэлийн хөдөлгөөн болгонд ДАХИН татагдаж, хэрэглэгчийн засварын
   *    дунд `setRows` дуудагдана. Overlay-ийн нөхцөлд зөвхөн эффект АЖИЛЛАХ
   *    агшны утга хэрэгтэй тул ref хангалттай.
   */
  const flowRef = useRef(flow);
  /* ⚠️ 2026-09-30: render-д биш ЭФФЕКТЭД тольдоно (react-hooks/refs) — уншигч нь ачаалах эффект
     (дараа зарлагдсан, `await`-ийн дараа уншдаг) тул утга ижил. */
  useEffect(() => { flowRef.current = flow; }, [flow]);
  /*
   * ⚠️ Өнөөдрийн огноог зурагдах бүрд БИШ, НЭГ л удаа авна — эс бөгөөс
   *    зурагдалт цэвэр биш болж, шөнө дундаас хойш зөрчил үүснэ.
   * ⚠️ ЛОКАЛ ӨДӨР — `todayFillMs`-ээс (2026-09-25-ны аудит). Урьд нь
   *    `msToDay(Date.now())` (UTC) байсан тул Улаанбаатарт 08:00-аас өмнө
   *    «Хуваарийн дагуу» шүүлт, «Өнөөдөр (…)» бичвэр, `publishedToday` бүгд
   *    ӨЧИГДРӨӨР ажилладаг байв. `todayFillMs` = `Date.UTC(локал он, сар, өдөр)`
   *    тул `msToDay` нь яг локал өдрийг өгнө; `snapDay` (архивын `buglusun_ognoo`
   *    = илгээлтийн `fillMs`) ч мөн ийм хэлбэртэй.
   */
  const today = useMemo(() => msToDay(todayFillMs), [todayFillMs]);

  /*
   * ⚠️ 2026-09-30: ӨӨР ӨДРИЙН ХЯНАЛТАД БАЙГАА НЭМЭЛТ — ЗӨВХӨН ХАРАГДАЦ.
   *    «өмнөх: X» (`prevHint`) ба «мөрийн Обьёмоос хэтэрлээ» асуулт (`commit`)
   *    урьд нь зөвхөн АРХИВЫН утгаар бодогддог тул өчигдрийн +30 хяналтад
   *    байхад өнөөдөр дахин +30 бичсэн хүн давхардлаа мэдэхгүй, Обьёмоос
   *    хэтэрсэн ч асуулт гардаггүй байв.
   * ⚠️ Импортын дэргэдэх `listActiveSubmissions`-ийн ⚠️-тэй НИЙЦНЭ: «аль өдөр
   *    хянагдаж байна» гэдгийг ХЯНАЛТЫН МӨРӨӨС (`hyRows`, `otherDaysInReview`-тэй
   *    ижил шүүлт) авч, зөвхөн тэдгээрийн АГУУЛГЫГ OBJECTID-оор (`readSubmissionByOid`)
   *    уншина — `sub|` жагсаалтыг давхар уншихгүй.
   * ⚠️ БИЧИЛТЭД ОГТ ОРОХГҮЙ: `pending`, илгээлт, архив хөндөгдөхгүй — батлахад
   *    нэмэлт бүр СҮҮЛИЙН архив дээр нэмэгддэг (`overlaySubmission`-ийн ⚠️).
   * ⚠️ Зөвхөн `mode: 'inc'` илгээлт: хуучин (НИЙТ орлуулах) илгээлтийг нэмэлт
   *    гэж нэмбэл худал тоо гарна. Нэмсэн (oid < 0) мөрийг алгасна.
   * ⚠️ `null ≠ 0`: утгагүй бол түлхүүр ОГТ байхгүй (0 гэж харуулахгүй).
   */
  const reviewSoids = useMemo(() => {
    if (view) return [] as number[];
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const lastRound = new Map<number, (typeof hyRows)[number]>();
    for (const r of hyRows) {
      if (r[HF.bagts] !== pkg.group) continue;
      const ajil = String(r[HF.ajil] ?? '');
      if (!ajil.includes(pkg.name) && others.some((p) => ajil.includes(p.name))) continue;
      const so = Number(r[HF.sheetOid]);
      if (!Number.isInteger(so) || so <= 0) continue;
      const prev = lastRound.get(so);
      if (!prev || r.__oid > prev.__oid) lastRound.set(so, r);
    }
    const out: number[] = [];
    for (const [so, r] of lastRound) {
      if (String(r[HF.ajil] ?? '').startsWith(todayAjilTag)) continue;
      if (r[HF.status] === STATUS.transferred || OWNER[r[HF.status]] === 'company') continue;
      out.push(so);
    }
    return out.sort((a, b) => a - b);
  }, [view, hyRows, pkg.group, pkg.key, pkg.name, todayAjilTag]);
  const reviewSoidsKey = reviewSoids.join(',');
  return {
    hyRows, hyLoading, hyErr, reloadHy,
    todayFillMs, setTodayFillMs, todayAjilTag, flow, otherDaysInReview, otherDaysReturned,
    resumedOid, setResumedOid, returned, reviewStage, inReview, flowRef, today, reviewSoidsKey,
  };
}

/** Өөр өдрийн ХЯНАЛТАД байгаа нэмэлт — зөвхөн харагдац (`prevHint` · `commit`-ийн сануулга). */
export function useReviewInc({ view, sc, pkg, reviewSoidsKey, rows, loadedPkgRef }: {
  view?: SheetView; sc: Schema | null; pkg: Pkg; reviewSoidsKey: string; rows: SheetRow[]; loadedPkgRef: RefObject<string>;
}) {
  /** `${oid}:${b}` → хяналтад байгаа нэмэлт: `n` обьём, `a` хувь (0–1) */
  const [reviewInc, setReviewInc] = useState<Map<string, { n: number | null; a: number | null }>>(new Map());
  const reviewIncKeyRef = useRef('');
  useEffect(() => {
    if (view || !sc || loadedPkgRef.current !== pkg.key) return undefined;
    const k = `${pkg.key}|${reviewSoidsKey}`;
    if (reviewIncKeyRef.current === k) return undefined;
    reviewIncKeyRef.current = k;
    setReviewInc(new Map());
    if (!reviewSoidsKey) return undefined;
    let alive = true;
    let finished = false;
    const soids = reviewSoidsKey.split(',').map(Number);
    const add = (x: number | null | undefined, y: number | null) =>
      (y == null ? (x ?? null) : (x ?? 0) + y);
    void (async () => {
      try {
        const base = await loadRows(pkg, sc);
        const baseBy = new Map(base.rows.map((x) => [x.oid, x] as const));
        const acc = new Map<string, { n: number | null; a: number | null }>();
        for (const so of soids) {
          const rr = await readSubmissionByOid(so);
          if (!alive) return;
          const sub = rr.ok ? rr.sub : null;
          if (!sub || sub.done || sub.payload.pkgKey !== pkg.key || sub.payload.mode !== 'inc') continue;
          const ov = overlaySubmission(base.rows, sub.payload, sc, sc.bld.length);
          const ovBy = new Map(ov.rows.map((x) => [x.oid, x] as const));
          for (const ck of ov.cellKeys) {
            const cut = ck.indexOf(':');
            if (cut <= 0) continue;
            const oid = Number(ck.slice(0, cut));
            const b = Number(ck.slice(cut + 1));
            const o = ovBy.get(oid);
            const bs = baseBy.get(oid);
            if (!o || !bs || oid < 0) continue;
            const dn = o.obyem[b] != null ? o.obyem[b]! - (bs.obyem[b] ?? 0) : null;
            const da = o.act[b] != null ? o.act[b]! - (bs.act[b] ?? 0) : null;
            if (!dn && !da) continue;
            const prev = acc.get(ck);
            acc.set(ck, { n: add(prev?.n, dn || null), a: add(prev?.a, da || null) });
          }
        }
        finished = true;
        if (alive) setReviewInc(acc);
      } catch {
        /* Зөвхөн харагдац — уншилт унавал сануулгагүй үлдэнэ, дараагийн ачаалалтаар дахин */
        finished = true;
        reviewIncKeyRef.current = '';
      }
    })();
    return () => {
      alive = false;
      if (!finished) reviewIncKeyRef.current = '';
    };
  }, [view, sc, pkg, reviewSoidsKey, rows, loadedPkgRef]);
  return reviewInc;
}
