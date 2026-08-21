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
 */

import { useCallback, useEffect, useState } from 'react';
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

function toRow(a: Attrs): Row {
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
    }
  }

  try {
    await updateRows([attrs]);
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
  const prev = ROWS.find((r) => r.__oid === oid);
  if (!prev) return { ok: false, error: 'Бүртгэл олдсонгүй' };

  const t = Date.now();

  if (verdict === 'ok') {
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
      [F.ergelt]: prev[F.ergelt] + 1,
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
