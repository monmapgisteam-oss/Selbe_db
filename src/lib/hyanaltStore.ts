'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТЫН ӨГӨГДЛИЙН ДАВХАРГА — амьд ArcGIS үйлчилгээ.
 *
 * ⚠️ ОГНООГ СИСТЕМ ТАВЬНА, хэрэглэгч гараар оруулахгүй. Бүх огноо энд
 * `Date.now()`-ээр бичигдэнэ. Дээр нь ArcGIS-ийн Editor Tracking нэмэлт
 * баталгаа болно — тэдгээрийг програм БИЧИХГҮЙ.
 *
 * ⚠️ БУЦААХ ЗАМ ЯВСАН ЗАМААРАА: менежер буцаавал ажил ШУУД компанид очихгүй,
 * инженер рүү очно. Инженер нь ДАМЖУУЛАГЧ БИШ — дахин шалгаад өөрөө шийднэ
 * (`recheck`): асуудалгүй бол менежерт эргүүлж илгээх, асуудалтай бол компанид
 * буцаах.
 *
 * ⚠️ ДАХИН ИЛГЭЭХЭД ХУУЧИН МӨРИЙГ ЗАСАХГҮЙ — ШИНЭ мөр үүснэ. Засвал өмнөх
 * буцаалтын шалтгаан дарагдаж алга болно; хяналтын гол утга нь тэр түүхэнд.
 *
 * ⚠️ ЭНЭ МОДУЛЬ (`archiveSubmission`) нь `Bagts_*` АРХИВТ (ҮНДСЭН ДАТА) жааз
 * бичдэг ЦОРЫН ГАНЦ ГАЗАР болов (2026-09-04). Хэрэглэгчийн шаардлага:
 * «ноорог ҮНДСЭН ДАТАНД хадгалагдаж болохгүй — 4 шат дамжсаны дараа л дата
 * хүснэгт буюу үндсэн сервис рүү орно». Урьд нь «Нийтлэх» дармагц
 * `FillNew.publish` өөрөө `applyAdds` дуудаж бүтэн жаазыг архивт бичдэг байв:
 * хянагч буцаасан ч, огт хараагүй ч тоо нь үндсэн өгөгдөлд аль хэдийн сууж
 * байлаа. Одоо «Нийтлэх» нь зөвхөн ИЛГЭЭЛТ (`Selbe_Guitsetgel_Draft`-ийн
 * `sub|<pkgKey>` мөр, diff) үүсгэнэ; архив руу энд, ерөнхий менежерийн
 * зөвшөөрлийн үед л бичигдэнэ. `applyAdds`-ыг өөр газраас БҮҮ дууд.
 */

import { useCallback, useEffect, useState } from 'react';
import { t as tr } from './i18nCore';
import {
  addRows, queryAll, updateRows,
  DECISION, F, HYANALT, STATUS,
  type Attrs, type Decision, type Row, type Status,
} from './hyanalt';

/* ── ArcGIS ↔ програмын хэлбэр ── */

/** ArcGIS огноог epoch ms-ээр өгдөг — ISO болгоно */
const toIso = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString() : null;

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * ⚠️ ЭКСПОРТ (2026-08-24): удирдлагын самбар (`ExecKpi`) нь `queryAll()`-ыг
 * шууд дуудаж, хүлээгдлийн насыг боддог. Хөрвүүлэлт нь ГАНЦ газар байх ёстой —
 * тэнд дахин бичвэл огнооны хэлбэр (epoch ms ↔ ISO) хоёр тайлбартай болно.
 */
export function toRow(a: Attrs): Row {
  return {
    __oid: num(a[HYANALT.oid]),
    [F.id]: str(a[F.id]),
    [F.sheetOid]: num(a[F.sheetOid]),
    [F.ergelt]: num(a[F.ergelt]),
    [F.bagts]: str(a[F.bagts]),
    [F.ajil]: str(a[F.ajil]),
    [F.company]: str(a[F.company]),
    [F.companySent]: toIso(a[F.companySent]),
    [F.engineer]: str(a[F.engineer]),
    [F.engineerDecision]: str(a[F.engineerDecision]) as Decision | '',
    [F.engineerReason]: str(a[F.engineerReason]),
    [F.engineerReturned]: toIso(a[F.engineerReturned]),
    [F.engineerSent]: toIso(a[F.engineerSent]),
    [F.manager]: str(a[F.manager]),
    [F.managerDecision]: str(a[F.managerDecision]) as Decision | '',
    [F.managerReason]: str(a[F.managerReason]),
    [F.managerReturned]: toIso(a[F.managerReturned]),
    [F.managerSent]: toIso(a[F.managerSent]),
    [F.director]: str(a[F.director]),
    [F.directorDecision]: str(a[F.directorDecision]) as Decision | '',
    [F.directorReason]: str(a[F.directorReason]),
    [F.directorReturned]: toIso(a[F.directorReturned]),
    [F.directorSent]: toIso(a[F.directorSent]),
    [F.status]: str(a[F.status]) as Status,
  };
}

/* ── Захиалагчид мэдэгдэх модулийн түвшний store ── */

let ROWS: Row[] = [];
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function refresh(): Promise<void> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  emit();
}

/**
 * Мөрийг ШИНЭЭР уншиж буцаана (захиалагчдад мэдэгдэхгүй — дуудагч шийднэ).
 * ⚠️ 2026-08-29: хянагчийн шийдвэрийг хуучирсан `ROWS`-оос бичдэг байсан тул нэг
 *    багцад хоёр инженер томилогдсон үед А-гийн буцаалтыг Б-гийн «зөвшөөрөх»
 *    чимээгүй дарж бичиж, эсвэл дахин шалгалт давхар мөр үүсгэж болдог байв.
 *    Хуудас нэг л удаа ачаалдаг тул мөрийг бичихийн ӨМНӨ заавал дахин уншина.
 */
async function liveRow(oid: number): Promise<Row | undefined> {
  ROWS = (await queryAll()).map(toRow);
  loaded = true;
  return ROWS.find((r) => r.__oid === oid);
}

/**
 * Шат бүрд хүлээгдэх ЯГ тэр төлөв — өөр төлөвтэй мөрд шийдвэр бичихгүй.
 * ⚠️ `OWNER`-оор шалгавал «Менежер буцаасан» мөрд инженерийн зөвшөөрөл,
 *    «Шилжүүлсэн» мөрд ерөнхий менежерийн давхар баталгаа (нэгтгэлд давхар
 *    бүртгэл) нэвтэрнэ. Дахин шалгалт `recheck`-ээр ШИНЭ мөр үүсгэнэ.
 */
const REVIEW_STATUS = {
  engineer: STATUS.engineerReview,
  manager: STATUS.managerReview,
  director: STATUS.directorReview,
} as const;

const STALE = 'Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу';

export function useHyanaltRows(): {
  rows: Row[];
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const [, tick] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    refresh().catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!loaded) load();
    return () => { subs.delete(f); };
  }, [load]);

  return { rows: ROWS, loading: !loaded && !error, error, reload: load };
}

/* ── Үйлдэл ── */

const nextId = () => {
  /*
   * ⚠️ Дугаарыг МӨРИЙН ТООГООР биш, ХАМГИЙН ИХ дугаараар үүсгэнэ. Мөр
   * устгагдсан тохиолдолд тоогоор бодвол давхардсан дугаар гарна.
   */
  const max = ROWS.reduce((m, r) => {
    const n = Number(String(r[F.id]).replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `G-${String(max + 1).padStart(6, '0')}`;
};

export type Result = { ok: boolean; error?: string };

const fail = (e: unknown): Result => ({ ok: false, error: String((e as Error)?.message ?? e) });

/** Архивлалтын үр дүн — амжилттай бол нэгтгэлд бүртгэх АРХИВЫН OBJECTID. */
type Archived = { ok: true; archiveOid: number } | { ok: false; error: string };

/**
 * ИЛГЭЭЛТИЙГ АРХИВТ БУУЛГАНА — ерөнхий менежер БАТЛАХАД л дуудагдана
 * (дизайны дүрэм 5a–5e).
 *
 * Гурван зам:
 *   · илгээлт олдохгүй  → LEGACY: `Эх_мөрийн_дугаар` нь архивын OBJECTID
 *     (энэ өөрчлөлтөөс өмнөх мөрүүд) — жааз аль хэдийн бичигдсэн;
 *   · илгээлт `done|…`  → аль хэдийн архивлагдсан (idempotent) — дахин бичихгүй;
 *   · идэвхтэй `sub|…`  → сүүлийн жааз + overlay → шинэ жааз `applyAdds`.
 *
 * ⚠️ Модулиудыг ДИНАМИКААР импортолно. `hyanaltStore`-ыг удирдлагын самбар
 *    (`ExecKpi`) зөвхөн `toRow`-ын төлөө импортолдог тул `bagtsSheet` ·
 *    `sheetFrame` · `bagts.pkg`-ийг СТАТИКААР оруулбал дашбоардын багц
 *    бөглөх хуудсыг бүхэлд нь чирнэ.
 */
async function archiveSubmission(cur: Row): Promise<Archived> {
  const subOid = cur[F.sheetOid];
  const { loadSubmissionByOid, closeSubmission } = await import('./submission');
  const staged = await loadSubmissionByOid(subOid);
  /*
   * ⚠️ ХУУЧИН МӨРД ИЛГЭЭЛТ БАЙХГҮЙ (дүрэм 6). Тэдгээрт `Эх_мөрийн_дугаар` нь
   *    архивын ЭХНИЙ мөрийн OBJECTID — жааз нь «Нийтлэх» дээр аль хэдийн
   *    бичигдсэн. Шинэ логикоор дахин бичвэл нэг гүйцэтгэл архивт хоёр
   *    агшинтай болно. Тиймээс зөвхөн нэгтгэлд бүртгээд өнгөрнө.
   */
  if (!staged) return { ok: true, archiveOid: subOid };
  /*
   * ⚠️ IDEMPOTENT: илгээлт `done|…` бол (эсвэл `archiveOid` тэмдэглэгдсэн)
   *    архивт аль хэдийн буусан. Сүлжээ тасарч товч дахин дарагдвал ижил
   *    жааз ХОЁР удаа бичигдэх байлаа.
   */
  if (staged.done || staged.payload.archiveOid != null)
    return { ok: true, archiveOid: staged.payload.archiveOid ?? 0 };

  const pl = staged.payload;
  const { PKGS, loadSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pl.pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pl.pkgKey) };

  const [{ loadRows, applyAdds, applyDeletes, msToDay }, { overlaySubmission, buildFrame }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
  ]);
  const sc = await loadSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  /*
   * ⚠️ СҮҮЛИЙН жаазыг татна (өдөр зааж ӨГӨХГҮЙ). Илгээлт нь diff тул суурь нь
   *    БАТЛАХ агшны хамгийн сүүлийн архив байх ёстой: хооронд нь өөр илгээлт
   *    батлагдсан бол түүний тоог дарж бичихгүй.
   */
  const loaded = await loadRows(pkg, sc);
  const ov = overlaySubmission(loaded.rows, pl, sc, nBld);
  /*
   * ⚠️ Тулгагдаагүй нүд байвал ЗОГСОНО (дүрэм 5b). Хагас буусан diff-ийг
   *    архивт бичвэл гүйцэтгэгчийн бичсэн тоо ЧИМЭЭГҮЙ алга болж, батлагдсан
   *    баримт нь илгээснээсээ зөрнө.
   */
  if (ov.unmoved > 0)
    return {
      ok: false,
      error: tr('{0} нүдийг шинэ мөрүүдэд тулгаж чадсангүй — архивт бичсэнгүй. Гүйцэтгэгчээр дахин илгээүүлнэ үү.', String(ov.unmoved)),
    };
  /*
   * ⚠️ `asOf` нь `computeAll`-ийн ЛАВЛАХ огноо — байхгүй бол төлөвлөгөөт хувь
   *    бүхэлдээ утгагүй болно. 0 гэж таамаглахгүй (`null ≠ 0`).
   */
  const asOf = ov.asOf ?? loaded.asOf;
  if (asOf == null)
    return { ok: false, error: tr('«Шинэчлэгдсэн огноо» алга тул архивт бичих боломжгүй') };

  /*
   * БӨГЛӨСӨН ӨДӨР — илгээсэн өдөр (`payload.fillMs`).
   *
   * ⚠️ Гэхдээ илгээснээс хойш архивт ШИНЭ жааз нэмэгдсэн бол (өөр илгээлт
   *    эрт батлагдсан, эсвэл хуучин урсгалаар нийтлэгдсэн) тэр өдрөөр бичсэн
   *    жааз `latestWhere`-ийн «хамгийн сүүлийн өдөр» шүүлтэд ХАРАГДАХГҮЙ:
   *    батлагдсан гүйцэтгэл архивт орсон мөртөө хуудсанд хэзээ ч гарч ирэхгүй
   *    алга болно. Тиймээс тийм үед ӨНӨӨДРИЙН өдрөөр бичнэ.
   */
  let fillMs = pl.fillMs;
  const now = new Date();
  const lastDay = loaded.snapshot != null ? msToDay(loaded.snapshot) : '';
  if (lastDay && lastDay >= msToDay(fillMs))
    fillMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const frame = buildFrame(ov.rows, sc, nBld, asOf, hasObyem, fillMs);
  let firstOid: number | null = null;
  /* ⚠️ БИЧИГДСЭН МӨРИЙН ДУГААР — унасан үед буцааж устгахад ЗААВАЛ хэрэгтэй. */
  const written: number[] = [];
  try {
    const r = await applyAdds(pkg, frame, written);
    firstOid = r.firstOid;
  } catch (e) {
    /*
     * ⚠️ ХАГАС ЖААЗЫГ БУЦААНА. `rollbackOnFailure` нь зөвхөн нэг 500-мөрийн
     *    багц дотор үйлчилдэг тул унатал бичигдсэн мөрүүд архивт ҮЛДЭНЭ. Тэр
     *    хагас жааз нь `loadRows`-ын мөрийн тооны шалгуурыг унагааж багцын
     *    бөглөх хуудсыг БҮХЭЛД НЬ хаадаг (Багц 2·9F дээр бодитоор тохиолдсон:
     *    1,000 мөрийн үлдэгдэл, бүтэн нь 1,386).
     * ⚠️ Хяналтын мөр ӨӨРЧЛӨГДӨХГҮЙ — менежер дахин дарж болно.
     */
    const why = String((e as Error)?.message ?? e);
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`,
      };
    }
    return { ok: false, error: why };
  }
  /*
   * ⚠️ Мөр бичигдсэн ч дугаар ирээгүй бол ЗОГСОХГҮЙ. `{ok:false}` буцаавал
   *    менежер дахин дарж архивт ХОЁР ижил жааз үүснэ. Нэгтгэлийн бүртгэл нь
   *    `archiveOid = 0`-д унаж, зөвхөн `console.warn`-оор мэдэгдэнэ.
   */
  const cl = await closeSubmission(staged.oid, firstOid ?? 0, Date.now());
  /*
   * ⚠️ Илгээлтийг ХААХ алхам унавал батлалт УНАХГҮЙ — жааз аль хэдийн архивт
   *    бичигдсэн. Нээлттэй үлдсэн `sub|` мөр дараагийн ачаалалтад давхарлагдах
   *    боловч `overlaySubmission`-ийн давхардал шалгалт (alias) түүнийг барина.
   */
  if (!cl.ok) console.warn('[selbe] илгээлтийг хааж чадсангүй:', cl.error);

  return { ok: true, archiveOid: firstOid ?? 0 };
}

/**
 * ХЯНАГЧИЙН ШИЙДВЭРИЙГ БҮРТГЭНЭ — гурван хянах шат тус бүрд.
 *
 * ⚠️ ЗӨВШӨӨРӨЛ нь ДАРААГИЙН шат руу, БУЦААЛТ нь ӨМНӨХ шат руу — нэг алхмаар.
 *    Эцсийн `Шилжүүлсэн` төлөвт ЗӨВХӨН ерөнхий менежер зөвшөөрснөөр хүрнэ:
 *    гурав дахь шатанд «шилжүүлсэн» гэж тэмдэглэвэл дөрөв дэх хяналт
 *    хийгдээгүй атлаа бүртгэгдсэн болно.
 */
export async function apply(a: {
  oid: number;
  stage: 'engineer' | 'manager' | 'director';
  decision: Decision;
  /** ⚠️ Буцаах үед ХООСОН БАЙЖ БОЛОХГҮЙ */
  reason?: string;
  who: string;
}): Promise<Result> {
  const returning = a.decision === DECISION.return;
  const reason = (a.reason ?? '').trim();
  // ⚠️ Шалтгаангүй буцаалт нь хяналтын бүртгэлийг утгагүй болгоно
  if (returning && !reason) return { ok: false, error: 'Буцаах шалтгаанаа бичнэ үү' };

  const t = Date.now();
  const attrs: Attrs = { [HYANALT.oid]: a.oid };
  /*
   * ⚠️ НЭГТГЭЛД ЗӨВХӨН ЭЦСИЙН БАТАЛГААНЫ ДАРАА бичнэ. Дунд шатанд бичвэл
   *    хараахан батлагдаагүй тоо албан ёсны бүртгэлд орж, дараа нь буцаагдвал
   *    устгах шаардлагатай болно.
   */
  let registerNow = false;

  if (a.stage === 'engineer') {
    attrs[F.engineer] = a.who;
    attrs[F.engineerDecision] = a.decision;
    if (returning) {
      attrs[F.engineerReason] = reason;
      attrs[F.engineerReturned] = t;
      attrs[F.status] = STATUS.engineerReturned;
    } else {
      attrs[F.engineerSent] = t;
      attrs[F.status] = STATUS.managerReview;
    }
  } else if (a.stage === 'manager') {
    attrs[F.manager] = a.who;
    attrs[F.managerDecision] = a.decision;
    if (returning) {
      attrs[F.managerReason] = reason;
      attrs[F.managerReturned] = t;
      // ⚠️ Компанид БИШ — инженер рүү буцна
      attrs[F.status] = STATUS.managerReturned;
    } else {
      attrs[F.managerSent] = t;
      // ⚠️ ШИЛЖҮҮЛСЭН БИШ — ерөнхий менежерийн хяналт үлдэж байна
      attrs[F.status] = STATUS.directorReview;
    }
  } else {
    attrs[F.director] = a.who;
    attrs[F.directorDecision] = a.decision;
    if (returning) {
      attrs[F.directorReason] = reason;
      attrs[F.directorReturned] = t;
      // ⚠️ Инженерт БИШ — багцын менежерт буцна (явсан замаараа)
      attrs[F.status] = STATUS.directorReturned;
    } else {
      attrs[F.directorSent] = t;
      // ЭЦСИЙН БАТАЛГАА — дөрвөн шат бүгд өнгөрлөө
      attrs[F.status] = STATUS.transferred;
      registerNow = true;
    }
  }

  try {
    const cur = await liveRow(a.oid);
    if (!cur || cur[F.status] !== REVIEW_STATUS[a.stage]) {
      emit();
      return { ok: false, error: STALE };
    }
    /*
     * ⚠️ АРХИВЛАЛТ нь хяналтын мөрийг засахаас ӨМНӨ (дизайны дүрэм 5d).
     *    Урвуу дарааллаар хийвэл архив унахад мөр «Шилжүүлсэн» болчихсон
     *    байх ба дахин батлах зам ХААГДАНА — батлагдсан гүйцэтгэл үндсэн
     *    дататай хэзээ ч уулзахгүй, хаана ч алдаа үлдэхгүй.
     */
    let archiveOid = cur[F.sheetOid];
    if (registerNow) {
      const ar = await archiveSubmission(cur);
      if (!ar.ok) return { ok: false, error: ar.error };
      archiveOid = ar.archiveOid;
    }

    await updateRows([attrs]);
    if (registerNow) {
      /*
       * ⚠️ БҮРТГЭЛ УНАВАЛ БАТАЛГАА УНАХГҮЙ. Хяналтын шийдвэр аль хэдийн
       *    хадгалагдсан байхад «болсонгүй» гэж харуулбал менежер дахин дарж,
       *    давхардсан бүртгэл үүсгэнэ. Алдааг зөвхөн бүртгэнэ.
       *
       * ⚠️ `registerApproved`-д АРХИВЫН OBJECTID өгнө — илгээлтийн мөрийн
       *    дугаар БИШ (тэр нь өөр үйлчилгээний дугаар; тэгвэл нэгтгэл
       *    «агшин олдсонгүй» гэж чимээгүй унана).
       */
      const { registerApproved } = await import('./negtgelWrite');
      const r = await registerApproved(cur[F.bagts], archiveOid);
      if (!r.ok) console.warn('[selbe] нэгтгэлд бүртгэж чадсангүй:', r.error);
    }
    await refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/*
 * ⚠️ `resubmit` УСТГАГДСАН (2026.08.21). Компани буцаалт хүлээж авбал
 * «Гүйцэтгэл бөглөх» хуудас руу шилжиж, тэндээ засаад «Нийтлэх» дарна —
 * тэр үед `hyanaltSubmit.submitForReview` шинэ хянуулалт үүсгэнэ. Энд бас
 * мөр үүсгэвэл НЭГ засварт ХОЁР бүртгэл орно.
 */

/**
 * МЕНЕЖЕР БУЦААСНЫГ ИНЖЕНЕР ДАХИН ШАЛГАВ.
 *
 * ⚠️ Инженер бол ДАМЖУУЛАГЧ БИШ, ДАХИН ШАЛГАГЧ:
 *   ok    → асуудал үнэхээр байхгүй тул менежерт ЭРГҮҮЛЖ илгээнэ (ШИНЭ мөр)
 *   back  → дахин шалгахад асуудал ГАРСАН тул компанид буцаана (мөн мөр)
 *
 * ⚠️ Компанид буцаах үед шалтгааныг ИНЖЕНЕР ӨӨРӨӨ бичнэ. Менежерийн бичвэрийг
 * хуулж дамжуулахгүй — тэр нь дотоод хяналтын мэдээлэл.
 */
export async function recheck(
  oid: number,
  verdict: 'ok' | 'back',
  reason: string,
  who: string,
  /**
   * ХЭН дахин шалгаж байна.
   * ⚠️ Хоёр газар давтагдана: менежер буцаахад ИНЖЕНЕР, ерөнхий менежер
   *    буцаахад БАГЦЫН МЕНЕЖЕР. Логик нь ижил, зөвхөн талбар ба шат өөр.
   */
  by: 'engineer' | 'manager' = 'engineer',
): Promise<Result> {
  let prev: Row | undefined;
  try { prev = await liveRow(oid); } catch (e) { return fail(e); }
  if (!prev) { emit(); return { ok: false, error: 'Бүртгэл олдсонгүй' }; }
  // ⚠️ Зөвхөн ДЭЭД шатнаас буцсан мөрийг дахин шалгана — хуучирсан дэлгэцээс
  //    давхар дахин шалгалт (давхар мөр) эсвэл өөр төлөвт бичихээс сэргийлнэ.
  const want = by === 'engineer' ? STATUS.managerReturned : STATUS.directorReturned;
  if (prev[F.status] !== want) { emit(); return { ok: false, error: STALE }; }

  const t = Date.now();

  if (verdict === 'ok') {
    const base = prev;
    /*
     * ⚠️ ДАВХАР МӨРӨӨС ХАМГААЛАХ ХОЁР ДАХЬ ШАЛГУУР — төлөвийн шалгуур
     *    ГАНЦААРАА хангалтгүй. Дахин шалгалт ХУУЧИН мөрийг ЗАСДАГГҮЙ (энэ нь
     *    санаатай: буцаалтын шалтгаан ба цаг дарагдахгүй), тиймээс эх мөр
     *    «Менежер буцаасан» ТӨЛӨВТЭЙГЭЭ үлдэж, дараагийн дуудлага дээрх
     *    `prev[F.status] !== want` шалгуурыг мөн ДАВНА. Нэг багцад хоёр
     *    инженер томилогдоод хоёул «менежерт илгээх» дарвал ижил
     *    `Хэддэх_удаа`-тай ХОЁР шинэ мөр үүсдэг байв; `groupWorks` зөвхөн
     *    хамгийн их OID-тайг «одоогийн» болгодог тул нөгөө нь мөнхөд
     *    «Менежер хянаж байна» төлөвт үлдэж, тойргийн тоолуурыг гажуудуулна.
     *    `ROWS` нь дээрх `liveRow`-оос ДӨНГӨЖ ирсэн — хуучирсан биш.
     */
    const ergelt = base[F.ergelt] + 1;
    const twin = ROWS.some((r) => r[F.sheetOid] === base[F.sheetOid]
      && r[F.bagts] === base[F.bagts] && r[F.ergelt] === ergelt);
    if (twin) { emit(); return { ok: false, error: STALE }; }

    const sentAt = prev[F.companySent];
    /*
     * ⚠️ ХУУЧИН МӨРИЙГ ЗАСАХГҮЙ — ДАХИН ШАЛГАЛТ БҮРТ ШИНЭ МӨР. Хуучныг засвал
     * менежерийн буцаалт болон инженерийн анхны зөвшөөрлийн цаг дарагдаж,
     * инженер↔менежер хооронд хэдэн удаа ярвал бүгд алга болно.
     */
    /* Дахин шалгасны дараа ажил ХААШАА явах вэ — нэг алхам урагш. */
    const nextStatus = by === 'engineer' ? STATUS.managerReview : STATUS.directorReview;
    /* Инженерийн илгээсэн огноо — менежер дахин шалгахад ХЭВЭЭР үлдэнэ. */
    const engPrev = prev[F.engineerSent];
    const engSent = engPrev ? Date.parse(engPrev) : t;
    const fresh: Attrs = {
      [F.id]: nextId(),
      [F.sheetOid]: prev[F.sheetOid],
      [F.ergelt]: ergelt,
      [F.bagts]: prev[F.bagts],
      [F.ajil]: prev[F.ajil],
      [F.company]: prev[F.company],
      /*
       * ⚠️ ОДООГИЙН ЦАГ ТАВИХГҮЙ — компани дахин илгээгээгүй. Хуучин огноог
       * хэвээр авч явна; эс бөгөөс компани илгээгээгүй атлаа илгээсэн мэт
       * ХУДАЛ бүртгэл үүснэ. Дэлгэц дээр давхардсан огноогоор нь тухайн
       * тойргийг «дахин шалгалт» гэж таньдаг.
       */
      [F.companySent]: sentAt ? Date.parse(sentAt) : null,
      /*
       * ⚠️ ДАХИН ШАЛГАСАН ШАТ хүртэлх бүх түүх ХЭВЭЭР, дараагийн шатнуудынх
       *    ХООСОН — шинэ хяналт тэднээс эхэлж байна. Хуучин зөвшөөрлийг
       *    үлдээвэл дараагийн шат «би аль хэдийн баталсан» гэж харагдана.
       */
      [F.engineer]: by === 'engineer' ? who : prev[F.engineer],
      [F.engineerDecision]: DECISION.approve,
      [F.engineerReason]: '',
      [F.engineerReturned]: null,
      [F.engineerSent]: by === 'engineer' ? t : engSent,
      [F.manager]: by === 'manager' ? who : '',
      [F.managerDecision]: by === 'manager' ? DECISION.approve : '',
      [F.managerReason]: '',
      [F.managerReturned]: null,
      [F.managerSent]: by === 'manager' ? t : null,
      [F.director]: '', [F.directorDecision]: '', [F.directorReason]: '',
      [F.directorReturned]: null, [F.directorSent]: null,
      [F.status]: nextStatus,
    };
    try {
      await addRows([fresh]);
      await refresh();
      return { ok: true };
    } catch (e) { return fail(e); }
  }

  // ── Асуудал БАЙНА — компанид буцаана. Мөрийн ЭЦСИЙН үйлдэл тул шинэ мөр
  //    хэрэггүй; компани засаад илгээхэд `resubmit` шинийг үүсгэнэ.
  const why = reason.trim();
  // ⚠️ Шалтгаангүй буцаалт нь хүлээн авагчийг юу засахаа мэдэхгүй болгоно
  if (!why) return { ok: false, error: 'Буцаах шалтгаанаа бичнэ үү' };

  const back: Attrs = by === 'engineer'
    ? {
      [HYANALT.oid]: oid,
      [F.engineer]: who,
      [F.engineerDecision]: DECISION.return,
      [F.engineerReason]: why,
      [F.engineerReturned]: t,
      [F.status]: STATUS.engineerReturned,
    }
    : {
      [HYANALT.oid]: oid,
      [F.manager]: who,
      [F.managerDecision]: DECISION.return,
      [F.managerReason]: why,
      [F.managerReturned]: t,
      [F.status]: STATUS.managerReturned,
    };

  try {
    await updateRows([back]);
    await refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
