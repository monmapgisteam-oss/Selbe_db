/**
 * МӨРҮҮДИЙГ АЖЛААР БҮЛЭГЛЭНЭ.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ ВЭ: хяналтын хүснэгтэд мөр бүр НЭГ ТОЙРОГ. Нэг ажил
 * 5 удаа буцвал 5 мөр болно. Тэдгээрийг дэлгэцэд тус тусад нь үзүүлбэл нэг
 * ажил 5 өөр зүйл мэт харагдаж, олон компанитай үед бүрэн уншигдахаа болино.
 */

import { t as tr } from './i18nCore';
import { DECISION, F, OWNER, STATUS, type Row, type Stage, type Status } from './hyanalt';

export type Work = {
  /** Бүлэглэлтийн түлхүүр — багц|ажил|компани */
  key: string;
  bagts: string;
  ajil: string;
  company: string;
  /** Тойрог бүр — эрэмбэлсэн */
  cycles: Row[];
  /** ХАМГИЙН СҮҮЛИЙН тойрог — одоогийн байдлыг энэ илэрхийлнэ */
  current: Row;
  status: Status;
  /** Одоо хэний гар дээр байгаа */
  owner: Stage;
  /** ⚠️ Шийдвэрийн баганаас тоолно — `Төлөв` явцын туршид өөрчлөгддөг */
  engineerReturns: number;
  managerReturns: number;
  /** Ерөнхий менежерийн буцаалт — эцсийн шатанд гацсан ажлыг дээш нь гаргана */
  directorReturns: number;
};

/**
 * АЖЛЫН ТҮЛХҮҮР — тойргуудыг НЭГ ажил гэж таних.
 *
 * ⚠️ `Эх_мөрийн_дугаар`-ААР БҮЛЭГЛЭЖ БОЛОХГҮЙ. Компани дахин илгээхэд эх
 * хүснэгтэд ШИНЭ мөр үүсдэг тул тойрог бүр ӨӨР OBJECTID-тай болно. Түүгээр
 * бүлэглэвэл нэг ажил 5 өөр ажил мэт харагдана.
 *
 * ⚠️ ХЯЗГААР: хүснэгтэд блок, ажлын № байхгүй тул багц + ажлын нэр + компани
 * гурвыг л түлхүүр болгож байна. Нэг багцад ижил нэртэй ажил ӨӨР БЛОК дээр
 * байвал тэдгээр нь НЭГ ажил мэт нийлнэ.
 */
const workKey = (r: Row) => `${r[F.bagts]}|${r[F.ajil]}|${r[F.company]}`;

export function groupWorks(rows: Row[]): Work[] {
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    const k = workKey(r);
    const a = by.get(k) ?? [];
    a.push(r);
    by.set(k, a);
  }

  const out: Work[] = [];
  for (const [key, list] of by) {
    /*
     * ⚠️ ЗӨВХӨН `Хэддэх_удаа`-гаар эрэмбэлж БОЛОХГҮЙ. Тэр талбар давхцаж
     * болох (импортын мөр бүр 1 гэх мэт) бөгөөд тэр үед эрэмбэ тодорхойгүй
     * болж, `current` буруу мөр заана — ажлын ОДООГИЙН ТӨЛӨВ буруу гарч,
     * буруу шат руу очно. Тиймээс OBJECTID-аар тэнцүүг тасална.
     */
    const cycles = list.slice().sort(
      (a, b) => a[F.ergelt] - b[F.ergelt] || a.__oid - b.__oid,
    );
    const current = cycles[cycles.length - 1];
    const status = current[F.status];
    out.push({
      key,
      bagts: current[F.bagts],
      ajil: current[F.ajil],
      company: current[F.company],
      cycles,
      current,
      status,
      owner: OWNER[status] ?? 'company',
      engineerReturns: cycles.filter((r) => r[F.engineerDecision] === DECISION.return).length,
      managerReturns: cycles.filter((r) => r[F.managerDecision] === DECISION.return).length,
      directorReturns: cycles.filter((r) => r[F.directorDecision] === DECISION.return).length,
    });
  }

  /*
   * Эрэмбэ: ХААГДААГҮЙ ажил эхэнд, дотор нь буцаалт ИХТЭЙ нь дээр — анхаарал
   * шаардсан ажил доогуур живэхээс сэргийлнэ.
   */
  return out.sort((a, b) => {
    const ac = a.status === STATUS.transferred ? 1 : 0;
    const bc = b.status === STATUS.transferred ? 1 : 0;
    if (ac !== bc) return ac - bc;
    const ar = a.engineerReturns + a.managerReturns + a.directorReturns;
    const br = b.engineerReturns + b.managerReturns + b.directorReturns;
    if (ar !== br) return br - ar;
    return a.ajil.localeCompare(b.ajil, 'mn');
  });
}

/** Шүүлтийн сонголтуудыг ӨГӨГДЛӨӨС гаргана — гараар жагсаахгүй */
export const optionsOf = (works: Work[], pick: (w: Work) => string) =>
  [...new Set(works.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'mn'));

/* ══════════════ ХЯНАЛТАД ХҮЛЭЭГДЭХ ХУГАЦАА (2026-08-24) ══════════════ */

const DAY = 86_400_000;

/**
 * ШАТНЫ НЭР — урсгалын ГАНЦ ЭХ СУРВАЛЖ.
 *
 * ⚠️ 2026-08-27: энэ хүснэгт `Guitsetgel.tsx`-д ДАХИН тодорхойлогдсон байсан
 * бөгөөд хоёр нь ЗӨРСӨН: энд «Талбайн инженер», тэнд «Хяналтын инженер».
 * Нэг л хүн эрхийн панел дээр нэг нэр, хүлээгдлийн жагсаалт дээр өөр нэрээр
 * харагдана гэсэн үг. Одоо зөвхөн ЭНД — дэлгэцийн бүх хэрэглэгч эндээс авна.
 *
 * ⚠️ Компонентод БИШ, `lib`-д байх ёстой: `UserAdmin` ба `GuitsetgelAcl` нь
 * үүнийг хэрэглэдэг бөгөөд `Guitsetgel.tsx`-ээс импортлоход админ панел нь
 * бүтэн хяналтын модулийг (хүснэгт, түүх, бөглөх хуудас) дагуулж татдаг байв.
 */
export const STAGE_LABEL: Record<Stage, string> = {
  company: tr('Гүйцэтгэгч компани'),
  engineer: tr('Хяналтын инженер'),
  manager: tr('Багцын менежер'),
  director: tr('Ерөнхий менежер'),
};

/**
 * Ажил ОДООГИЙН шатанд ХЭЗЭЭ орсон бэ.
 *
 * ⚠️ Төлөв бүрд тохирох огноог ГАРААР зураглахгүй, бүх огнооны талбарын
 * ХАМГИЙН СҮҮЛИЙНХИЙГ авна. Шалтгаан: шилжилт бүр өөрийн огноог тамгалдаг тул
 * хамгийн сүүлийн тамга нь яг одоогийн шатанд орсон агшин болно. Гараар
 * зураглавал шинэ төлөв нэмэгдэхэд тэр газар чимээгүй хоцорно.
 *
 * ⚠️ Огноо нь `hyanaltStore.toRow`-оор ISO мөр болсон байдаг тул `Date.parse`.
 */
const enteredAt = (r: Row): number | null => {
  const t = (v: string | null): number => {
    const n = v ? Date.parse(v) : NaN;
    return Number.isFinite(n) ? n : -1;
  };
  const m = Math.max(
    t(r[F.companySent]),
    t(r[F.engineerSent]), t(r[F.engineerReturned]),
    t(r[F.managerSent]), t(r[F.managerReturned]),
    t(r[F.directorSent]), t(r[F.directorReturned]),
  );
  return m > 0 ? m : null;
};

/** Тухайн шатны хариуцагчийн НЭР — бөглөгдөөгүй бол хоосон мөр */
const ownerName = (r: Row, s: Stage): string => {
  const v = s === 'company' ? r[F.company]
    : s === 'engineer' ? r[F.engineer]
      : s === 'manager' ? r[F.manager]
        : r[F.director];
  return String(v ?? '').trim();
};

export type Pending = {
  work: Work;
  /** Одоогийн шатанд орсноос хойш хэдэн хоног болсон */
  days: number;
  /** Хэний гар дээр байгаа — нэр, эс бөгөөс шатны нэр */
  who: string;
  /**
   * Тодорхой хүнд хуваарилагдсан эсэх.
   * ⚠️ «Инженер хянаж байна» төлөвт `Талбайн_инженер` талбар ХООСОН байж болно
   * (`hyanaltSubmit` шинэ бүртгэлийг хоосон нэртэй үүсгэдэг) — тэр үед ажил
   * ДАРААЛАЛД байгаа болохоос хэн нэгний гар дээр байгаа биш.
   */
  assigned: boolean;
};

/**
 * ХААГДААГҮЙ ажлууд — хэн дээр хэдэн хоног хүлээгдэж байгаагаар, буурахаар.
 *
 * ⚠️ `transferred` (Шилжүүлсэн) нь ЭЦСИЙН төлөв тул хүлээгдэлд тооцогдохгүй.
 * ⚠️ `now`-ыг ГАДНААС авна — тооцоог цэвэр функц байлгаж, тестлэх боломжтой.
 */
export function pendingAging(works: Work[], now: number): Pending[] {
  const out: Pending[] = [];
  for (const w of works) {
    if (w.status === STATUS.transferred) continue;
    const at = enteredAt(w.current);
    // ⚠️ Огноогүй мөрийг 0 хоног гэж БОДОХГҮЙ — «саяхан ирсэн» гэсэн худал
    //    дүгнэлт өгнө. Хэмжих боломжгүй тул жагсаалтаас гарна.
    if (at == null) continue;
    const name = ownerName(w.current, w.owner);
    out.push({
      work: w,
      days: Math.max(0, Math.floor((now - at) / DAY)),
      who: name || STAGE_LABEL[w.owner],
      assigned: Boolean(name),
    });
  }
  return out.sort((a, b) => b.days - a.days);
}
