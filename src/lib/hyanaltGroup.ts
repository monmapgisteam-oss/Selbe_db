/**
 * МӨРҮҮДИЙГ АЖЛААР БҮЛЭГЛЭНЭ.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ ВЭ: хяналтын хүснэгтэд мөр бүр НЭГ ТОЙРОГ. Нэг ажил
 * 5 удаа буцвал 5 мөр болно. Тэдгээрийг дэлгэцэд тус тусад нь үзүүлбэл нэг
 * ажил 5 өөр зүйл мэт харагдаж, олон компанитай үед бүрэн уншигдахаа болино.
 */

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
    const ar = a.engineerReturns + a.managerReturns;
    const br = b.engineerReturns + b.managerReturns;
    if (ar !== br) return br - ar;
    return a.ajil.localeCompare(b.ajil, 'mn');
  });
}

/** Шүүлтийн сонголтуудыг ӨГӨГДЛӨӨС гаргана — гараар жагсаахгүй */
export const optionsOf = (works: Work[], pick: (w: Work) => string) =>
  [...new Set(works.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'mn'));
