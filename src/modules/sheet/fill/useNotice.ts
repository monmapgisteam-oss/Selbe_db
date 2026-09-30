/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хөвөгч мэдэгдэл (say · done · warn · ro).
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useNotice() {
  // Засагдахгүй нүд дарахад «яагаад» гэдгийг хэлнэ. Дараагийн товшилт бүр
  // өмнөх мэдэгдлийг солино; 4 секундын дараа өөрөө арилна.
  /**
   * ХӨВӨГЧ МЭДЭГДЭЛ — «яагаад засагдахгүй» ба «юу амжилттай болов» ХОЁУЛАА.
   *
   * ⚠️ ТӨРӨЛ ЗААВАЛ (2026-09-03-ны аудитын олдвор): зурвас нь «Энэ нүд
   * засагдахгүй.» гэсэн угтварыг ХАТУУ бичдэг байсан тул нийтлэлийн амжилт
   * («Архивт 1,370 мөр нэмэгдэв · хяналтад илгээв»), буулгалтын үр дүн
   * («22 нүд бичигдлээ»), мөр нэмсэн зэрэг БҮГД тэр худал гарчигтай гарч
   * байв — өдрийн ажлын гол баталгааг «алдаа» гэж уншуулна.
   */
  const [notice, setNotice] = useState<{ kind: 'ro' | 'ok' | 'warn'; msg: string } | null>(null);
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ⚠️ АМЖИЛТЫН мэдэгдэл УДААН (2026-09-15-ны хэрэглээний аудит).
   *
   * «Хяналтад илгээв (GH-0042) · 38 нүд» бол өдрийн хамгийн чухал баталгаа:
   * илгээсний дараа `dirtyCount` 0 болох тул ногоон тоолуур ч, хадгалалтын
   * цаг ч алга болж, 4 секундын дараа хэрэглэгчид «би илгээсэн үү» гэдгийг
   * шалгах ямар ч ул мөр үлддэггүй байв — утсаар ярьж байгаад эргэхэд
   * хангалттай. Мэдэгдэл дээр товшиход хаагддаг тул урт байх нь саад биш.
   *
   * ⚠️ `ro` (засагдахгүй нүд) ба `warn` нь ХЭВЭЭР 4 секунд: тэдгээр нь дараагийн
   * товшилтоор дахин гарах тул удаан үлдвэл ажилд саад болно.
   */
  const show = useCallback((kind: 'ro' | 'ok' | 'warn', msg: string) => {
    if (noticeT.current) clearTimeout(noticeT.current);
    setNotice({ kind, msg });
    noticeT.current = setTimeout(() => setNotice(null), kind === 'ok' ? 15_000 : 4000);
  }, []);
  /** Засагдахгүй нүдний тайлбар — «Энэ нүд засагдахгүй.» гарчигтай */
  const say = useCallback((msg: string) => show('ro', msg), [show]);
  /** Үр дүнгийн мэдээ (нийтлэл, буулгалт, мөр нэмэх) — амжилтын гарчигтай */
  const done = useCallback((msg: string) => show('ok', msg), [show]);
  /** Үйлдэл БҮТСЭНГҮЙ ч алдаа биш (буулгах нүд таарсангүй г.м.) */
  const warn = useCallback((msg: string) => show('warn', msg), [show]);
  useEffect(
    () => () => {
      if (noticeT.current) clearTimeout(noticeT.current);
    },
    [],
  );
  /** Засагдахгүй нүдэнд өгөх props — товшихад тайлбарыг харуулна. */
  const ro = (msg: string) => ({
    title: msg,
    onClick: () => say(msg),
  });
  return { notice, setNotice, show, say, done, warn, ro };
}
