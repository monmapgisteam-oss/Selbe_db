/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — НҮДНИЙ ЗАСВАР — горим · оролтын утга · commit · олон нүдэнд буулгах · Enter/Tab шилжилт.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Schema } from "../bagts.pkg";
import { incCell, parseInc, type SheetRow } from "../bagtsSheet";
import { isAmbiguousComma, normCell, parseGrid, planPaste } from "../paste";
import { t as tr } from "@/lib/i18nCore";
import { RO, cellKey, pc, qty, qtyRaw, type EditCell, type EditCol } from "./util";

export function useCellEdit(p: {
  sc: Schema | null;
  fillMode: "obyem" | "pct";
  pending: Record<string, string>;
  setPending: Dispatch<SetStateAction<Record<string, string>>>;
  edit: EditCell | null;
  setEdit: Dispatch<SetStateAction<EditCell | null>>;
  setErr: Dispatch<SetStateAction<string>>;
  warn: (msg: string) => void;
  done: (msg: string) => void;
  /** `${oid}:${b}` → хяналтад байгаа нэмэлт (`useReviewInc`) */
  reviewInc: Map<string, { n: number | null; a: number | null }>;
  revert: (key: string, wasPending: boolean) => void;
  mineRef: RefObject<Set<string>>;
  touchMine: (key: string) => void;
  locked: boolean;
  noEdit: boolean;
  canPerf: boolean;
  busy: boolean;
  editing: boolean;
  rowsAll: SheetRow[];
  vis: number[];
  hidden: boolean[];
  nBld: number;
}) {
  const {
    sc, fillMode, pending, setPending, edit, setEdit, setErr, warn, done, reviewInc, revert, mineRef, touchMine,
    locked, noEdit, canPerf, busy, editing, rowsAll, vis, hidden, nBld,
  } = p;
  /**
   * ОБЬЁМЫН нүд бичигдэх үү — талбар нь байгаа БҮХ ажлын мөрд ТИЙМ.
   * Хуудсан дээрх ЦОРЫН ГАНЦ бөглөх цэг (мөрийн Обьёмоос гадна).
   *
   * ⚠️ «Мөрийн Обьём байхгүй бол хориглоё» гэж БОЛОХГҮЙ: хийсэн тоо хэмжээ
   *    нь өөрөө бүртгэл бөгөөд хуваарь нь хожим орж ирж болно. Түгжвэл
   *    хэрэглэгч хуудсаа нээмэгц бөглөх газаргүй үлддэг.
   */
  /* ⚠️ Оролт нь `{ group }`-тай ямар ч мөр: нооргийн сэргээлт серверийн мөр ба
     хараахан нийтлэгдээгүй НЭМСЭН мөр хоёуланг нь нэг индексээр шалгадаг. */
  const volMode = (r: { group: boolean }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]);

  /**
   * ХУВЬ ГОРИМД БИЧИХ БОЛОМЖТОЙ ЮУ.
   *
   * ⚠️ Обьёмын багана (`sc.obyem[b]`) ШААРДАХГҮЙ: хувь нь `sc.act[b]`-д
   * хадгалагдана, тэр багана 107/107 блокт бүрэн бий. Тиймээс хувь горим нь
   * обьёмын багана дутуу блокуудыг ч нээнэ.
   */
  const pctOnly = (r: { group: boolean }, b: number) =>
    fillMode === "pct" && !r.group && !sc?.obyem[b];

  /**
   * НҮД НЭЭХЭД ОРОЛТОД ТАВИХ ТОО — ОДООГИЙН горимын нэгжээр.
   *
   * ⚠️ `pending[key]`-ийг ШУУД тавьж БОЛОХГҮЙ: тэр нь өөр горимоор бичигдсэн
   * байж болно (`"%50"`). Хөрвүүлэлгүй тавибал «50» гэсэн тоо обьём горимд
   * 50 м³ гэж уншигдана.
   */
  /*
   * ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ (`bagtsSheet.CellMode`-ийн ⚠️): оролт нь
   *    ЭНЭ УДААГИЙН НЭМЭЛТ-ийг л авна. Засваргүй нүд ХООСОН нээгдэнэ (өмнөх
   *    нийт нь `placeholder`-т «өмнөх: 40»); `pending`-д нэмэлт байвал ТЭР
   *    нэмэлтийг (нийтийг биш) ОДООГИЙН горимын нэгжээр тавина — засаж болно.
   *    Хуучин «хадгалагдсан нийтийг урьдчилан тавих» зан ХАСАГДСАН: тэгвэл
   *    хэрэглэгч 40-ийг 55 болгож бичээд 40 + 55 = 95 болно.
   */
  const cellSeed = (r: SheetRow, b: number): string => {
    const d = parseInc(pending[cellKey(r.oid, b)]);
    if (!d) return "";
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    if (fillMode === "pct") {
      /* Обьёмын нэмэлтийг хувь руу — мөрийн Обьёмгүй бол илэрхийлэх аргагүй */
      if (d.n !== 0 && vol == null) return "";
      const p = d.p + (d.n !== 0 ? d.n / (vol as number) : 0);
      return String(Math.round(p * 1e6) / 1e4);
    }
    /* Хувийн нэмэлтийг обьём руу — мөрийн Обьёмгүй бол хоосон (бодох аргагүй) */
    if (d.p !== 0 && vol == null) return "";
    return qtyRaw(d.n + (d.p !== 0 ? d.p * (vol as number) : 0));
  };
  /** Оролтын `placeholder` — ӨМНӨХ нийт (одоогийн горимын нэгжээр). `null` бол «—» (0 БИШ). */
  const prevHint = (r: SheetRow, b: number): string => {
    const storedPct = r.vol != null && r.vol > 0 && r.obyem[b] != null ? r.obyem[b]! / r.vol : r.act[b];
    const v = fillMode === "pct" ? (storedPct == null ? "" : pc(storedPct, 1)) : qty(r.obyem[b]);
    /* ⚠️ 2026-09-30: өөр өдрийн хяналтад байгаа нэмэлтийг ТУСАД НЬ (`reviewInc`-ийн ⚠️) */
    const ri = reviewInc.get(cellKey(r.oid, b));
    const rv = ri ? (fillMode === "pct" ? (ri.a == null ? "" : pc(ri.a, 1)) : (ri.n == null ? "" : qty(ri.n))) : "";
    return rv
      ? tr('өмнөх: {0} · + хяналтад: {1}', v || '—', rv)
      : tr('өмнөх: {0}', v || '—');
  };

  /* ⚠️ `addRow`/`dropAdd`/`localAddOids` ХАСАГДАВ (2026-09-24) — «Хуваарь»-д. */

  /**
   * Нүдний засвар — блокийн ОБЬЁМ эсвэл мөрийн Обьём. Гүйцэтгэлийн хувь
   * энд ОРОХГҮЙ: тэр нь обьёмоос бодогдоно.
   */

  /** ⚠️ `true` = утга хүлээн авагдсан (2026-09-24): Enter/Tab нь ЗӨВХӨН тэр үед шилжинэ —
   *  урьд нь буруу/сөрөг/татгалзсан (confirm) утга дээр ч дараагийн нүд рүү гүйдэг байв. */
  const commit = (r: SheetRow, b: number, raw: string): boolean => {
    const key = cellKey(r.oid, b);
    /* ⚠️ БУУЛГАЛТТАЙ НЭГ ДҮРЭМ — `paste.normCell` (2026-09-25-ны аудит). Урьд нь
       энд эхний таслалыг ҮРГЭЛЖ аравтын цэг болгодог тул «1,250» (en-US
       мянгат) нь 1.25 болж 1000 дахин БАГА бичигддэг байв. Одоо `1,234.5` ·
       `1 234` зөв уншигдаж, `1,250` шиг ТОДОРХОЙГҮЙ бичлэгийг ил асууна.
       `null` = тоо биш (эсвэл тодорхойгүй); хоосон бол `""` (цэвэрлэх). */
    const t0 = raw.trim() === "" ? "" : normCell(raw);
    setEdit(null);
    if (r.group) return false;
    if (t0 === null && isAmbiguousComma(raw)) {
      warn(tr('{0} · {1}: «{2}» — таслал мянгатын эсвэл аравтын тэмдэг болох нь тодорхойгүй. 1250 эсвэл 1.25 гэж бичнэ үү.', sc?.bld[b] ?? "", r.work, raw.trim()));
      return false;
    }
    const t = t0 ?? "";
    if (t0 === null) {
      /* ⚠️ Чимээгүй хаявал хэрэглэгч «бичигдлээ» гэж андуурдаг — мэдэгдэнэ.
         ⚠️ `warn` (хөвөгч), `setErr` БИШ (2026-09-15-ны хэрэглээний аудит):
            `setErr` нь хүснэгтийн ДЭЭР, гүйлтийн талбайгаас ГАДНА зурагддаг
            тул 500 дахь мөр дээр ажиллаж байгаа хүнд ОГТ харагдахгүй — тэр
            «юу ч болоогүй» гэж үзээд утгаа алдсанаа мэдэхгүй өнгөрнө. */
      warn(tr('{0} · {1}: тоон утга оруулна уу.', sc?.bld[b] ?? "", r.work));
      return false;
    }

    /* ══ ХУВИАР БӨГЛӨХ ГОРИМ (2026-09-06) ══════════════════════════════
     * Утга нь `pending`-д `"%50"` гэж хадгалагдана — `bagtsSheet.cellObyem`
     * ба `cellPct` хоёулаа энэ угтварыг таьна. Ингэснээр ноорог, илгээлт,
     * overlay гэсэн доод сувгууд огт хөндөгдөхгүй (бүгд мөр зөөдөг).
     *
     * ⚠️ Обьёмын шалгалтууд (буурсан уу · мөрийн Обьёмоос хэтэрсэн үү) энд
     * ХАМААРАХГҮЙ: хувь нь өөрөө 100-аас давж болно (эх өгөгдөлд бий) бөгөөд
     * буурах нь засвар байж болно. Оронд нь ганц зүйлийг л барина — сөрөг. */
    /* ══ НЭМЭЛТИЙН ГОРИМ (2026-09-25, хэрэглэгчийн шийдвэр) ══════════════
     * Бичсэн тоо = ӨМНӨХ бөглөлтөөс хойш хийсэн обьём (хувь горимд — хувь).
     * `pending`-д НЭМЭЛТ хадгалагдана (`"15"` · `"%10"`); нүдэнд суурь + нэмэлт
     * харагдана (`computeAll(…, "inc")`), батлахад архивын СҮҮЛИЙН утга дээр
     * нэмэгдэнэ. Урьд нь (2026-08-20 — 2026-09-25) энд «НИЙТ хуримтлал»
     * бичигддэг байв; тэр шийдвэрийг хэрэглэгч 2026-09-25-нд БУЦААВ.
     *
     * ⚠️ `""` ба `0` = ЭНЭ НҮДНИЙ ЗАСВАРЫГ БУЦААХ (өөрчлөлтгүй), «цэвэрлэх» БИШ.
     *    Нийтийг `null` болгох зам энэ горимд байхгүй — буруу бүртгэлийг СӨРӨГ
     *    нэмэлтээр (залруулга) засна; нийт нь 0-ээс доош орохгүй (`incCell`).
     * ⚠️ Хувийн засвар мөн `"%N"` угтвартай хэвээр (`bagtsSheet.parseInc`) —
     *    доод сувгууд (ноорог, илгээлт, overlay) мөр зөөсөөр.
     */
    const isPct = fillMode === "pct";
    const incN = t === "" ? 0 : Number(t);
    /* ⚠️ 2026-09-29 (аудит 10): нүдэнд ЮУ Ч БИЧЭЭГҮЙ хаасан (blur/Enter) бол
       `pending`-д ОДООГИЙН горимд илэрхийлэгдэхгүй нэмэлт байж болно (`cellSeed`
       нь "" буцаадаг: Обьёмгүй мөрийн `+15` Хувь горимд · `%10` Обьём горимд).
       Урьд нь тэр хоосон нь `incN === 0` → pending устгаж tombstone тавьж,
       нэмэлт (хамтран засварлагчийнх ч) ЧИМЭЭГҮЙ алга болдог байв. Одоо
       хөндөхгүй буцна — буцаах бол «0» гэж ил бичнэ. */
    if (t === "") {
      const d0 = parseInc(pending[key]);
      if (d0 && (d0.n !== 0 || d0.p !== 0) && cellSeed(r, b) === "") return true;
    }
    if (incN === 0) {
      /* Засвараа буцаасан — «нийтлээгүй» тэмдэглэгээ арилна. `revert`-ийн дүрэм:
         pending-д байгаагүй нүдэнд буцаалт нь tombstone биш (2026-09-21). */
      setErr("");
      setPending((pv) => {
        if (!(key in pv)) return pv;
        const n = { ...pv };
        delete n[key];
        return n;
      });
      revert(key, key in pending);
      return true;
    }
    const nv = isPct ? `%${incN}` : String(incN);
    const res = incCell(r, b, nv, !!sc?.obyem[b]);
    const vol = r.vol;
    const storedPct = vol != null && vol > 0 && r.obyem[b] != null ? r.obyem[b]! / vol : r.act[b];
    /** Өмнөх ба шинэ НИЙТ — одоогийн горимын нэгжээр (баталгаажуулалтад) */
    const before = isPct ? storedPct : r.obyem[b];
    const after = isPct ? (res ? res.act : storedPct) : (res ? res.obyem : r.obyem[b]);
    const fmt = (x: number | null) => (isPct ? pc(x, 1) : qty(x));
    /* ⚠️ СӨРӨГ НЭМЭЛТ = ЗАЛРУУЛГА — ЗӨВШӨӨРНӨ, гэхдээ ИЛ АСУУНА (2026-09-25).
       Урьд нь (НИЙТ горимд) сөрөг утгыг хаадаг байв; одоо «−5» нь «өмнөхөөс 5-аар
       бага» гэсэн үнэн утгатай. 0-ээс доош нийт 0-ээр хаагдах нь асуултад харагдана. */
    if (
      incN < 0 &&
      !window.confirm(
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн — {3} болж БУУРНА.\nБуруу бичсэнээ засаж байна уу?',
          sc?.bld[b] ?? "",
          r.work,
          fmt(before ?? 0),
          fmt(after ?? 0),
        ),
      )
    )
      return false;
    /* ⚠️ 2026-09-25 аудит: ЭЕРЭГ нэмэлт ч БУУРУУЛЖ болно — хувиар бүртгэгдсэн ХУУЧИН
       нүдэнд (act бий, obyem null, мөр обьёмтой) `incCell` обьёмыг 0-ээс эхлүүлдэг
       (санаатай: «хувиас обьём БУЦААЖ БОДОХГҮЙ») тул 50% → +10% = 10%. Чимээгүй
       бичвэл гүйцэтгэл ул мөргүй унана — ил асууна. */
    if (
      incN > 0 &&
      after != null &&
      before != null &&
      after < before &&
      !window.confirm(
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн (хувиар) — нэмэлт бичихэд обьём 0-ээс эхэлж {3} болж БУУРНА.\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          fmt(before),
          fmt(after),
        ),
      )
    )
      return false;
    /* ⚠️ 2026-09-30: өөр өдрийн ХЯНАЛТАД байгаа нэмэлтийг ч тооцно (`reviewInc`-ийн ⚠️) —
       батлагдвал тэр нь мөн архив дээр нэмэгдэнэ. Зөвхөн сануулга, бичилтэд орохгүй. */
    const revN = reviewInc.get(key)?.n ?? null;
    const afterAll = after != null && revN != null && revN > 0 ? after + revN : after;
    if (
      !isPct &&
      incN > 0 &&
      afterAll != null &&
      vol != null &&
      vol > 0 &&
      afterAll > vol &&
      !window.confirm(
        revN != null && revN > 0
          ? tr(
            '{0} · {1}:\n{2} + хяналтад байгаа {3} = {4} нь мөрийн Обьём {5}-оос ХЭТЭРЧ байна ({6}).\nҮргэлжлүүлэх үү?',
            sc?.bld[b] ?? "",
            r.work,
            qty(after),
            qty(revN),
            qty(afterAll),
            qty(vol),
            pc(afterAll / vol, 1),
          )
          : tr(
            '{0} · {1}:\n{2} нь мөрийн Обьём {3}-оос ХЭТЭРЧ байна ({4}).\nҮргэлжлүүлэх үү?',
            sc?.bld[b] ?? "",
            r.work,
            qty(afterAll),
            qty(vol),
            pc(afterAll / vol, 1),
          ),
      )
    )
      return false;
    setErr("");
    setPending((pv) => ({ ...pv, [key]: nv }));
    /* 2026-09-21: буцаасан бол tombstone, бичсэн бол агшин (`Draft.byAt`/`del`).
       Дахин аудит: pending-д байгаагүй нүдэнд ижил утга бичих нь буцаалт БИШ
       (`revert`-ийн тайлбар) — нөгөө талын ирээгүй бичилтийг устгахгүй. */
    /* ⚠️ ЭЗЭМШЛИЙГ ЭНД ЧУХАМ ТЭМДЭГЛЭНЭ (2026-09-08). Энэ бол нүдийг ГАРААС
       нэг нэгээр засах ГОЛ зам; урьд нь зөвхөн олон нүдний (paste) зам дээр
       тэмдэглэгддэг байсан тул ганц нүд бөглөсөн хүн `by`-д ОГТ ОРОХГҮЙ,
       улмаар `participants` хоосон болж «Илгээх» түгжээ ХЭЗЭЭ Ч ажиллахгүй —
       хоёулаа зэрэг илгээж чаддаг байв (хэрэглэгчийн мэдээлсэн эвдрэл). */
    mineRef.current.add(key);
    touchMine(key);
    return true;
  };

  /** Enter/Tab — дараагийн засварлаж болох мөр рүү (баганадаа доошоо). */
  /**
   * Enter/Tab дарахад дараагийн БИЧИГДЭХ нүд. Багана бүр өөрийн дүрэмтэй
   * тул `col`-оор шүүнэ — эс тэгвэл бичиж болохгүй нүд нээгдэж, бөглөсөн
   * тоо чимээгүй алдагдана.
   */
  /**
   * ОЛОН НҮДЭНД БУУЛГАХ — Excel-ээс хуулсан БЛОКИЙГ нэг дор бичнэ.
   *
   * ⚠️ ЯАГААД (2026-09-03, хэрэглэгчийн хүсэлт): бөглөгч Excel дээрээ 20–40
   * блокийн тоог бэлдчихээд энд НЭГ НЭГЭЭР нь дардаг байв. Нэг ажлыг 22
   * блокт бөглөхөд 22 удаа нүд нээж, бичиж, Tab дарна.
   *
   * ⚠️ БАЙРЛАЛААР нь буулгана: буулгасан мөр бүр ДЭЛГЭЦЭД ХАРАГДАХ дараагийн
   * мөрд тохирно (`vis`), багана нь тухайн блокоос БАРУУН тийш. Бүлгийн мөр,
   * обьёмын талбаргүй блок таарвал утгыг нь ХАЯНА — гэхдээ байрлалаа ЭЗЛЭНЭ.
   * Ингэснээр дэлгэц дээр харагдаж буй эгнээ хадгалагдана; алгасвал доорх
   * бүх утга нэг мөр дээшилж, чимээгүй буруу мөрд бичигдэнэ.
   *
   * ⚠️ БАТАЛГААЖУУЛАЛТ НЭГ УДАА. `commit` нь нүд тутамд `window.confirm`
   * асуудаг — 40 нүдэд 40 цонх гарна. Тиймээс энд бууралт/хэтрэлтийг
   * ЦУГЛУУЛЖ, нэг хураангуй асуултаар шийднэ.
   */
  const pasteBlock = (startI: number, startB: number, text: string): boolean => {
    if (!sc) return false;
    /* ⚠️ ТҮГЖЭЭТЭЙ үед ЧИМЭЭГҮЙ бүтэлгүйтэхгүй (2026-09-03-ны аудит): Excel-
       ээс 40 нүд буулгасан хүн юу ч болоогүйг хараад «хуулагдсангүй» гэж
       эргэлзэнэ. Шалтгааныг нь хэлээд буулгалтыг зогсооно. */
    if (locked || noEdit || !canPerf) {
      warn(locked ? RO.viewOnly : RO.noPerf);
      return true;
    }
    /* ⚠️ «БӨГЛӨХ» ХААЛТ ба ИЛГЭЭЛТ ЯВЖ БАЙХ ҮЕ (2026-09-25-ны аудит): нүд нээх
       (`open`) нь `!editing`-ийг хаадаг атлаа буулгалт түүнийг ТОЙРЧ, «Бөглөх»
       дараагүй хүний Ctrl+V шууд `pending`-д бичигддэг байв. `busy` — илгээлтийн
       төгсгөлийн `setPending({})` завсарт бичсэн нүдийг арчина (`RO.busy`). */
    if (busy) { warn(RO.busy); return true; }
    if (!editing) { warn(RO.notEditing); return true; }
    const grid = parseGrid(text);
    /* Нэг нүдний энгийн буулгалт бол ердийн замаар нь явуулна */
    if (grid.length === 1 && grid[0].length === 1) {
      /* ⚠️ ХААЛТТАЙ нүдэн дээр (input нээгдээгүй) ганц утга буулгахад урьд нь
         `preventDefault` дуудагдахгүй тул ЮУ Ч болохгүй, мэдэгдэл ч гарахгүй
         байв. Нүдийг нээхийн оронд утгыг шууд бичнэ — Excel-ийн зан. */
      const one = grid[0][0];
      if (edit || one === '') return false;
      const r0 = rowsAll[startI];
      if (!r0 || !volMode(r0, startB)) return false;
      commit(r0, startB, one);
      return true;
    }

    /* ⚠️ ЗӨВХӨН ХАРАГДАХ мөрүүд — шүүлт/эвхэлтээр нуугдсаныг алгасвал
       хэрэглэгчийн харж буй эгнээ ба бичигдэх эгнээ хоёр зөрнө. */
    const from = vis.indexOf(startI);
    if (from < 0) return false;

    /* ⚠️ Байрлалын логик нь `paste.ts`-д — эгнээ гулсах эрсдэлийг зөвхөн
       тестээр (`paste.check.mjs`) барина. */
    const { hits: raw, skipped, bad } = planPaste(
      grid, vis, sc.bld.length, from, startB,
      (row, b) => volMode(rowsAll[row], b),
    );
    /* ⚠️ ГОРИМООР БУУЛГАНА (2026-09-06). Excel-ээс хуулсан багана нь
       обьём ч, хувь ч байж болно — аль болохыг ХУУДАСНЫ горим шийднэ,
       тоог нь таамаглахгүй. Хувь горимд утга бүрд `%` угтвар тавина
       (`bagtsSheet`-ийн дүрэм); харьцуулах «хадгалагдсан» нь мөн хувь. */
    /* ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ (`commit`-ийн ⚠️): буулгасан утга бүр ЭНЭ
       УДААГИЙН нэмэлт. `after` = суурь + нэмэлт (`incCell`) — «хэтэрсэн» асуултад. */
    const isPct = fillMode === "pct";
    const hits = raw.map((x) => {
      const r = rowsAll[x.row];
      const v = isPct ? `%${Number(x.v)}` : x.v;
      const res = incCell(r, x.b, v, !!sc.obyem[x.b]);
      return {
        key: cellKey(r.oid, x.b),
        /** `pending`-д бичигдэх ТҮҮХИЙ мөр (горимын дүрмээр) — НЭМЭЛТ */
        v,
        /** Нэмэлтийн ТОО (горимын нэгжээр); 0 = өөрчлөлтгүй */
        n: isPct ? Number(x.v) / 100 : Number(x.v),
        r,
        b: x.b,
        /** Шинэ НИЙТ (горимын нэгжээр) */
        after: isPct ? (res ? res.act : null) : (res ? res.obyem : null),
        /** Өмнөх НИЙТ (горимын нэгжээр) — `commit`-тэй ижил томъёо (2026-09-25) */
        before: isPct
          ? (r.vol != null && r.vol > 0 && r.obyem[x.b] != null ? r.obyem[x.b]! / r.vol : r.act[x.b])
          : r.obyem[x.b],
      };
    });

    if (!hits.length) {
      warn(bad
        ? tr("Буулгасан утгууд тоо биш байна — юу ч бичигдсэнгүй.")
        : tr("Буулгах боломжтой нүд таарсангүй."));
      return true;
    }

    /* ── НЭГ УДААГИЙН БАТАЛГААЖУУЛАЛТ ── */
    /* ⚠️ Нэмэлт сөрөг байж чадахгүй (`planPaste` няцаадаг) ч «БУУРНА» асуулт
       ХООСОН БИШ (2026-09-25 аудит): хувиар бүртгэгдсэн ХУУЧИН нүдэнд (act бий,
       obyem null, мөр обьёмтой) `incCell` обьёмыг 0-ээс эхлүүлдэг тул 50% → 10%
       болж буурдаг — `commit`-ийн ганц нүдний асуулттай ижил дүрэм. */
    const down = hits.filter((x) => x.after != null && x.before != null && x.after < x.before);
    /* ⚠️ Хувь горимд «мөрийн Обьёмоос хэтэрсэн» гэдэг нь «100%-иас их» гэсэн үг;
       2026-09-25: харьцуулах нь шинэ НИЙТ (суурь + нэмэлт), нэмэлт өөрөө биш. */
    const over = isPct
      ? hits.filter((x) => x.after != null && x.after > 1)
      : hits.filter((x) => x.after != null && x.r.vol != null && (x.r.vol as number) > 0 && x.after > (x.r.vol as number));
    if (down.length || over.length) {
      const parts: string[] = [];
      if (down.length) parts.push(tr("{0} нүдэнд утга БУУРНА", String(down.length)));
      if (over.length) {
        parts.push(isPct
          ? tr("{0} нүдэнд 100%-иас ХЭТЭРНЭ", String(over.length))
          : tr("{0} нүдэнд мөрийн Обьёмоос ХЭТЭРНЭ", String(over.length)));
      }
      if (!window.confirm(tr("{0} нүд бичих гэж байна.\n{1}.\nҮргэлжлүүлэх үү?", String(hits.length), parts.join("; ")))) return true;
    }

    setErr("");
    /* ⚠️ 2026-09-25: ГАЖ НӨЛӨӨ (revert · mineRef · touchMine) setState-ийн шинэчлэгч
       ДОТОР БАЙХГҮЙ — React (StrictMode/дахин зурагдалт) шинэчлэгчийг хоёр удаа
       дуудаж болох тул tombstone/агшин давхар тавигддаг байв. `pending` нь энэ
       функцийн хүрээнд шинэ (`busy` үед буулгалт хаалттай тул завсрын бичилт үгүй). */
    {
      const pv = pending;
      const n = { ...pv };
      for (const x of hits) {
        /* Тэг нэмэлт = өөрчлөлтгүй → «нийтлээгүй» тэмдэглэгээг арилгана (2026-09-25). */
        const same = x.n === 0;
        if (same) delete n[x.key];
        else n[x.key] = x.v;
        /* ⚠️ ЭЗЭМШЛИЙГ ЭНД тэмдэглэнэ (2026-09-08): энэ бол нүдийг ГАРААС
           засах ЦОРЫН ГАНЦ зам. Нийлүүлэлтээр ирсэн бусдын нүд энд ордоггүй
           тул оролцогчийн жагсаалт зөв үлдэнэ. Хоосон болгосон (`same`) нүдийг
           ч тэмдэглэнэ — «би энэ нүдийг хөндсөн» гэдэг нь оролцоо мөн. */
        /* 2026-09-21: буцаасан бол tombstone, бичсэн бол агшин (`Draft.byAt`/`del`).
           Дахин аудит: pending-д (`pv`) байгаагүй нүдэнд ижил утга бичих нь
           буцаалт БИШ — `revert`-ийн тайлбар (Б-гийн ирээгүй бичилтийг хамгаална). */
        if (same) revert(x.key, x.key in pv);
        else { mineRef.current.add(x.key); touchMine(x.key); }
      }
      setPending(n);
    }
    setEdit(null);
    done(bad || skipped
      ? tr("{0} нүд бичигдлээ · {1} алгасав", String(hits.length), String(skipped + bad))
      : tr("{0} нүд бичигдлээ", String(hits.length)));
    return true;
  };

  const nextEditable = (i: number, b: number, step: number, col: EditCol) => {
    const ok = (r: SheetRow) => volMode(r, b);
    for (let k = i + step; k >= 0 && k < rowsAll.length; k += step)
      if (!hidden[k] && ok(rowsAll[k])) return { i: k, b, col };
    return null;
  };
  /**
   * ХАЖУУ ТИЙШ — нэг мөрөнд дараагийн бөглөгдөх блок (Tab). Мөрийн төгсгөлд
   * дараагийн (Shift: өмнөх) мөрийн эхний (сүүлийн) блок руу ороолдоно.
   */
  const nextBlockEditable = (i: number, b: number, step: number) => {
    let k = i;
    let bb = b + step;
    while (k >= 0 && k < rowsAll.length) {
      if (!hidden[k]) {
        for (; bb >= 0 && bb < nBld; bb += step)
          if (volMode(rowsAll[k], bb)) return { i: k, b: bb, col: "obyem" as EditCol };
      }
      k += step;
      bb = step > 0 ? 0 : nBld - 1;
    }
    return null;
  };
  return { volMode, pctOnly, cellSeed, prevHint, commit, pasteBlock, nextEditable, nextBlockEditable };
}
