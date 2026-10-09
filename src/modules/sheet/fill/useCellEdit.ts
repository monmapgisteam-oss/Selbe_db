/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — НҮДНИЙ ЗАСВАР — горим · оролтын утга · commit · олон нүдэнд буулгах · Enter/Tab шилжилт.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Schema } from "../bagts.pkg";
import { fmtInc, incCell, parseInc, type SheetRow } from "../bagtsSheet";
import { isAmbiguousComma, normCell, parseGrid, planPaste } from "../paste";
import { t as tr } from "@/lib/i18nCore";
import { RO, cellKey, pc, qty, qtyRaw, synNoVol, type EditCell, type EditCol } from "./util";
import { remainOf } from "./remain";

/**
 * «ХЭТЭРСЭН ҮҮ» — хөвөгч цэгийн хүлцэлтэй (2026-09-30).
 * ⚠️ Архив 1.1 + нэмэлт 2.2 = 3.3000000000000003 нь Обьём 3.3-аас «хэтэрсэн» гэж
 *    ХУДАЛ асуудаг байв («3.3 нь 3.3-оос ХЭТЭРЧ байна (100%)»). Харьцангуй 1e-9.
 */
const EPS = 1e-9;
const overVol = (x: number, vol: number) => x > vol * (1 + EPS);
const overPct = (x: number) => x > 1 + EPS;

/** ⚠️ 2026-10-01: буулгалтын урьдчилсан харагдац — `${oid}:${b}` түлхүүрээр */
export type PastePrev = {
  startI: number; startB: number; grid: string[][]; rows: SheetRow[];
  ok: Set<string>; rej: Map<string, string>;
};

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
  /** ⚠️ 2026-10-09: бөглөх эрхгүй ШАЛТГААН (`FillRows.perfWhy`-тэй ижил) */
  perfWhy?: string | null;
  busy: boolean;
  editing: boolean;
  rowsAll: SheetRow[];
  vis: number[];
  hidden: boolean[];
  nBld: number;
  /** ⚠️ 2026-10-01: ноорог сэргэж байна — буулгалт ТҮГЖЭЭТЭЙ (`useDraftSync.restoringUi`) */
  restoring?: boolean;
  /**
   * ⚠️ 2026-10-01: буулгалтын урьдчилсан харагдацын ТӨЛӨВ — дуудагч (FillNew) эзэмшинэ
   *    (энэ hook нь төлөвгүй цэвэр функц хэвээр — `cellEdit.ui.check` шууд дууддаг).
   *    Өгөөгүй бол урьдчилан харуулахгүй, урьдын адил шууд бичнэ.
   */
  pastePrev?: PastePrev | null;
  setPastePrev?: (v: PastePrev | null) => void;
}) {
  const {
    sc, fillMode, pending, setPending, edit, setEdit, setErr, warn, done, reviewInc, revert, mineRef, touchMine,
    locked, noEdit, canPerf, perfWhy, busy, editing, rowsAll, vis, hidden, nBld, restoring,
    pastePrev = null, setPastePrev,
  } = p;
  /**
   * БУУЛГАЛТЫН УРЬДЧИЛСАН ХАРАГДАЦ (2026-10-01, хэрэглэгч: бүгдийг зас).
   * ⚠️ Буулгах блокт БИЧИГДЭХГҮЙ нүд (тоо биш · сөрөг · бүлэг/талбаргүй) байвал ШУУД
   *    бичихгүй: бичигдэх нүдийг цэнхэр, татгалзсаныг УЛААН (✕) тодруулж «Бичих / Болих»-оор
   *    хэрэглэгч шийднэ. Урьд нь эхлээд бичээд дараа нь л «N утга бичигдсэнгүй» гэдэг тул
   *    аль нүд гээгдсэнийг 1,400 мөрөөс хайх шаардлагатай байв. Бүх нүд хүчинтэй бол
   *    урьдын адил ШУУД бичнэ (нэмэлт алхамгүй).
   * ⚠️ Түлхүүр нь `${oid}:${b}` (`cellKey`) — мөр/шүүлт солигдоход индекс гулсахгүй;
   *    `rowsAll` өөр болсон (багц солигдсон, дахин ачаалсан) бол баталгаажуулалт ЦУЦЛАГДАНА.
   */

  /**
   * ҮЛДЭГДЭЛ-ИЙН ТАЙЛБАР — «үлдэгдэл = Обьём − архив − хяналтад − ноорог» (2026-10-01).
   * @param base давхарлалтын СУУРЬ (архивын) мөр — `ovBase`; байхгүй бол `r` нь өөрөө архив.
   * ⚠️ Хяналтад = энэ өдрийн илгээлтийн нэмэлт (`r − base`) + өөр өдрийн хяналтад буй (`reviewInc`).
   * ⚠️ Мөрийн Обьёмгүй бол `""` (`null ≠ 0`). Хувь горимд хувиар харуулна.
   */
  const remainHint = (r: SheetRow, b: number, base?: SheetRow): string => {
    if (r.group || !volMode(r, b)) return "";
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    if (vol == null) return "";
    const volOf = (x: SheetRow) => x.obyem[b] ?? (x.act[b] != null ? (x.act[b] as number) * vol : null);
    const arch = volOf(base ?? r);
    const now = volOf(r);
    const staged = base ? (now ?? 0) - (arch ?? 0) : 0;
    const ri = reviewInc.get(cellKey(r.oid, b));
    const other = ri?.n != null ? ri.n : ri?.a != null ? ri.a * vol : 0;
    const d = parseInc(pending[cellKey(r.oid, b)]);
    const draft = d ? d.n + d.p * vol : 0;
    const rem = remainOf(vol, arch, staged + other, draft);
    if (rem == null) return "";
    const f = (x: number) => (fillMode === "pct" ? pc(x / vol, 1) : qty(x));
    return tr('үлдэгдэл = Обьём − архив − хяналтад − ноорог = {0} − {1} − {2} − {3} = {4}',
      f(vol), f(arch ?? 0), f(staged + other), f(draft), f(rem));
  };
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
  /* ⚠️ 2026-10-09: блокгүй багцын (синтетик блок) Обьёмгүй мөр түгжээтэй — `synNoVol`-ийн ⚠️
     (барилгын блокт нөлөөгүй). `vol` нь сонголттой: дуудагч бүр `SheetRow` өгдөг. */
  const volMode = (r: { group: boolean; vol?: number | null }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]) && !synNoVol(sc, r);

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
    /* ⚠️ 2026-09-30: мөрийн Обьёмгүй бол ЗӨВХӨН одоогийн горимын хэсгийг (нөгөө хэсэг нь
       `commit`-д ХАДГАЛАГДАНА — `otherPart`-ийн ⚠️). Урьд нь холимог («15 %10») нэмэлтэд
       хоосон тавьдаг тул байгаа +15 ч харагддаггүй байв. */
    if (fillMode === "pct") {
      /* Обьёмын нэмэлтийг хувь руу — мөрийн Обьёмгүй бол илэрхийлэх аргагүй */
      if (vol == null) return d.p !== 0 ? String(Math.round(d.p * 1e6) / 1e4) : "";
      const p = d.p + (d.n !== 0 ? d.n / vol : 0);
      return String(Math.round(p * 1e6) / 1e4);
    }
    /* Хувийн нэмэлтийг обьём руу — мөрийн Обьёмгүй бол хоосон (бодох аргагүй) */
    if (vol == null) return d.n !== 0 ? qtyRaw(d.n) : "";
    return qtyRaw(d.n + (d.p !== 0 ? d.p * vol : 0));
  };
  /**
   * ОДООГИЙН ГОРИМД ИЛЭРХИЙЛЭГДЭХГҮЙ НӨГӨӨ ХЭСЭГ (2026-09-30) — мөрийн Обьёмгүй ажилд обьём
   * ба хувь ТУСДАА багана тул нэг нүдэнд хоёулаа хуримтлагдаж болно («15 %10»,
   * `bagtsSheet.parseInc`). Обьём горимд хувийн, Хувь горимд обьёмын хэсэг.
   * ⚠️ Урьд нь горим сольж тоо бичихэд `pending` бүхэлдээ шинэ утгаар солигдож тэр
   *    хэсэг (жиш. Хувь горимд бичсэн +10%) ЧИМЭЭГҮЙ арилдаг байв.
   */
  const otherPart = (r: SheetRow, key: string): { n: number; p: number } => {
    const vol = r.vol != null && r.vol > 0 ? r.vol : null;
    const d = parseInc(pending[key]);
    if (vol != null || !d) return { n: 0, p: 0 };
    return fillMode === "pct" ? { n: d.n, p: 0 } : { n: 0, p: d.p };
  };
  /** Оролтын `placeholder` — ӨМНӨХ нийт (одоогийн горимын нэгжээр). `null` бол «—» (0 БИШ). */
  const prevHint = (r: SheetRow, b: number): string => {
    /* ⚠️ 2026-10-09: блокгүй багц (`sc.synthetic`)-д обьёмгүй (`obyem_sum` null) нүдний хувь = null —
       `r.act` нь Excel загварын 0 (хэмжилт БИШ), «өмнөх: 0%» гэж худал харуулдаг байв (null ≠ 0). */
    const storedPct = r.vol != null && r.vol > 0 && r.obyem[b] != null
      ? r.obyem[b]! / r.vol
      : sc?.synthetic && r.obyem[b] == null ? null : r.act[b];
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
  const commitInner = (r: SheetRow, b: number, raw: string): boolean => {
    const key = cellKey(r.oid, b);
    /* ⚠️ БУУЛГАЛТТАЙ НЭГ ДҮРЭМ — `paste.normCell` (2026-09-25-ны аудит). Урьд нь
       энд эхний таслалыг ҮРГЭЛЖ аравтын цэг болгодог тул «1,250» (en-US
       мянгат) нь 1.25 болж 1000 дахин БАГА бичигддэг байв. Одоо `1,234.5` ·
       `1 234` зөв уншигдаж, `1,250` шиг ТОДОРХОЙГҮЙ бичлэгийг ил асууна.
       `null` = тоо биш (эсвэл тодорхойгүй); хоосон бол `""` (цэвэрлэх). */
    const t0 = raw.trim() === "" ? "" : normCell(raw);
    /* ⚠️ 2026-10-06: `setEdit(null)` ЭНДЭЭС `commit` руу зөөгдсөн (дээрх ⚠️) */
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
    /* ⚠️ 2026-09-30: нөгөө горимын хэсэг (`otherPart`-ийн ⚠️) — хадгалагдана */
    const keep = otherPart(r, key);
    const hasKeep = keep.n !== 0 || keep.p !== 0;
    if (incN === 0 && hasKeep) {
      /* Зөвхөн ОДООГИЙН горимын хэсгийг буцаана — нөгөө хэсэг үлдэнэ */
      setErr("");
      setPending((pv) => ({ ...pv, [key]: fmtInc(keep) }));
      mineRef.current.add(key);
      touchMine(key);
      return true;
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
    const nv = hasKeep
      ? fmtInc({ n: (isPct ? 0 : incN) + keep.n, p: (isPct ? incN / 100 : 0) + keep.p })
      : isPct ? `%${incN}` : String(incN);
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
       бичвэл гүйцэтгэл ул мөргүй унана — ил асууна.
       ⚠️ 2026-09-30: ХУВИАР жишнэ, ГОРИМООС үл хамааран. Урьд нь горимын нэгжээр
       (`before`/`after`) жишдэг тул АНХДАГЧ Обьём горимд `before = obyem = null`
       болж асуулт ХЭЗЭЭ Ч гардаггүй байв — «+10» бичихэд 50% → 10% чимээгүй
       буурдаг. Хувь горимд утга нь урьдынхтай ЯГ ижил (`before = storedPct`). */
    const pctAfter = res ? res.act : storedPct;
    if (
      incN > 0 &&
      pctAfter != null &&
      storedPct != null &&
      pctAfter < storedPct &&
      !window.confirm(
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн (хувиар) — нэмэлт бичихэд обьём 0-ээс эхэлж {3} болж БУУРНА.\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          pc(storedPct, 1),
          pc(pctAfter, 1),
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
      /* ⚠️ 2026-09-30: хөвөгч цэгийн хүлцэл (`overVol`) — 1.1 + 2.2 = 3.3000000000000003 */
      overVol(afterAll, vol) &&
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
    /* ⚠️ 2026-10-05: ХУВЬ горимд ч 100%-иас хэтрэхийг АСУУНА (хориглохгүй — дээрх 2026-09-06-ны
       ⚠️: хувь 100-аас давж БОЛНО). Урьд нь олон нүд буулгах зам (`pasteAt` — «100%-иас ХЭТЭРНЭ»)
       асуудаг атлаа гараас ганц нүд бичихэд чимээгүй өнгөрдөг байв (жиш. «+750» гэж андуурах).
       Буулгах замтай ИЖИЛ дүрэм: шинэ НИЙТ + өөр өдрийн хяналтад буй хувь, хөвөгч цэгийн хүлцэлтэй. */
    const revA = reviewInc.get(key)?.a ?? null;
    const pctAll = isPct && after != null ? after + (revA != null && revA > 0 ? revA : 0) : null;
    if (
      isPct &&
      incN > 0 &&
      pctAll != null &&
      overPct(pctAll) &&
      !window.confirm(
        tr(
          '{0} · {1}:\nнийт {2} болж 100%-иас ХЭТЭРЧ байна.\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          pc(pctAll, 1),
        ),
      )
    )
      return false;
    setErr("");
    /* ⚠️ 2026-10-05: ЗӨӨЛӨН САНУУЛГА (бичилтийг зогсоохгүй) — хувь горимд 0-ээс их, 1-ээс бага
       утга нь ихэвчлэн бутархайгаар бичсэн хувь (0.75 → 75 гэх гэсэн). Хувийг 0–100-аар бичнэ. */
    if (isPct && incN > 0 && incN < 1) {
      warn(tr('{0} · {1}: {2}% гэж бичигдлээ. {3}% гэх гэсэн бол засна уу — хувийг 0–100-аар бичнэ.',
        sc?.bld[b] ?? "", r.work, String(incN), String(parseFloat((incN * 100).toPrecision(12)))));
    }
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
  /* ⚠️ 2026-10-06: нүдийг ЗӨВХӨН утга хүлээн авагдсан (`true`) үед хаана. Урьд нь `setEdit(null)`
     шалгалтаас ӨМНӨ дуудагдаж, татгалзсан оролт («1,250» · тоо биш · асуултад «Цуцлах») дээр нүд
     хаагдаж бичсэн текст алдагддаг байв — одоо оролт текстээрээ нээлттэй үлдэж засна. Бүлгийн мөр
     (засагдахгүй) урьдын адил хаагдана. */
  const commit = (r: SheetRow, b: number, raw: string): boolean => {
    const ok = commitInner(r, b, raw);
    if (ok || r.group) setEdit(null);
    return ok;
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
      warn(locked ? RO.viewOnly : (perfWhy ?? RO.noPerf));
      return true;
    }
    /* ⚠️ «БӨГЛӨХ» ХААЛТ ба ИЛГЭЭЛТ ЯВЖ БАЙХ ҮЕ (2026-09-25-ны аудит): нүд нээх
       (`open`) нь `!editing`-ийг хаадаг атлаа буулгалт түүнийг ТОЙРЧ, «Бөглөх»
       дараагүй хүний Ctrl+V шууд `pending`-д бичигддэг байв. `busy` — илгээлтийн
       төгсгөлийн `setPending({})` завсарт бичсэн нүдийг арчина (`RO.busy`). */
    if (busy) { warn(RO.busy); return true; }
    /* ⚠️ 2026-10-01: ноорог сэргээж байхад буулгахгүй (`RO.restoring`) */
    if (restoring) { warn(RO.restoring); return true; }
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

    return runPaste(startI, startB, grid, false);
  };

  /** Урьдчилсан харагдацын «Бичих» — ОДООГИЙН мөр/шүүлтээр дахин төлөвлөж бичнэ */
  const confirmPaste = () => {
    const pv = pastePrev;
    setPastePrev?.(null);
    if (!pv) return;
    if (pv.rows !== rowsAll) { warn(tr('Хүснэгт шинэчлэгдсэн тул буулгалт цуцлагдлаа — дахин буулгана уу.')); return; }
    runPaste(pv.startI, pv.startB, pv.grid, true);
  };
  const cancelPaste = () => setPastePrev?.(null);

  const runPaste = (startI: number, startB: number, grid: string[][], confirmed: boolean): boolean => {
    if (!sc) return false;
    /* Шинэ буулгалт өмнөх урьдчилсан харагдацыг орлоно */
    if (!confirmed && pastePrev) setPastePrev?.(null);
    /* ⚠️ ЗӨВХӨН ХАРАГДАХ мөрүүд — шүүлт/эвхэлтээр нуугдсаныг алгасвал
       хэрэглэгчийн харж буй эгнээ ба бичигдэх эгнээ хоёр зөрнө. */
    const from = vis.indexOf(startI);
    if (from < 0) return false;

    /* ⚠️ Байрлалын логик нь `paste.ts`-д — эгнээ гулсах эрсдэлийг зөвхөн
       тестээр (`paste.check.mjs`) барина. */
    const { hits: raw, skipped, bad, badAt, rejAt } = planPaste(
      grid, vis, sc.bld.length, from, startB,
      (row, b) => volMode(rowsAll[row], b),
    );
    /* ⚠️ 2026-10-01: ТАТГАЛЗАХ нүд байвал ЭХЛЭЭД урьдчилан харуулна (`pastePrev`-ийн ⚠️) */
    if (!confirmed && setPastePrev && rejAt.length > 0 && raw.length > 0) {
      const why = (w: 'bad' | 'neg' | 'noWrite', row: number) =>
        w === 'neg'
          ? tr('сөрөг утга — буулгалтаар бууруулахгүй (нүд тус бүрээр залруулна)')
          : w === 'noWrite'
            /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөрийн шалтгаан (`synNoVol`) */
            ? (rowsAll[row]?.group ? RO.groupAct : rowsAll[row] && synNoVol(sc, rowsAll[row]) ? RO.synNoVol : RO.noObyemField)
            : tr('тоо гэж уншиж чадсангүй (тодорхойгүй таслал «1,250» эсвэл тоо биш)');
      setPastePrev({
        startI, startB, grid, rows: rowsAll,
        ok: new Set(raw.map((x) => cellKey(rowsAll[x.row].oid, x.b))),
        rej: new Map(rejAt.map((x) => [cellKey(rowsAll[x.row].oid, x.b), `«${x.raw}» — ${why(x.why, x.row)}`] as const)),
      });
      warn(tr('Буулгалт: {0} нүд бичигдэнэ, {1} нүд татгалзагдана (улаан ✕). Хүснэгтийн дээрх «Бичих» эсвэл «Болих»-ийг сонгоно уу.', String(raw.length), String(rejAt.length)));
      return true;
    }
    /* ⚠️ ГОРИМООР БУУЛГАНА (2026-09-06). Excel-ээс хуулсан багана нь
       обьём ч, хувь ч байж болно — аль болохыг ХУУДАСНЫ горим шийднэ,
       тоог нь таамаглахгүй. Хувь горимд утга бүрд `%` угтвар тавина
       (`bagtsSheet`-ийн дүрэм); харьцуулах «хадгалагдсан» нь мөн хувь. */
    /* ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ (`commit`-ийн ⚠️): буулгасан утга бүр ЭНЭ
       УДААГИЙН нэмэлт. `after` = суурь + нэмэлт (`incCell`) — «хэтэрсэн» асуултад. */
    const isPct = fillMode === "pct";
    const hits = raw.map((x) => {
      const r = rowsAll[x.row];
      /* ⚠️ 2026-09-30: нөгөө горимын хэсэг хадгалагдана (`otherPart`-ийн ⚠️) */
      const keep = otherPart(r, cellKey(r.oid, x.b));
      const hasKeep = keep.n !== 0 || keep.p !== 0;
      const v = hasKeep
        ? fmtInc({ n: (isPct ? 0 : Number(x.v)) + keep.n, p: (isPct ? Number(x.v) / 100 : 0) + keep.p })
        : isPct ? `%${Number(x.v)}` : x.v;
      const res = incCell(r, x.b, v, !!sc.obyem[x.b]);
      return {
        /** Тэг нэмэлт үед үлдэх нөгөө хэсэг (`""` = байхгүй) */
        keepStr: hasKeep ? fmtInc(keep) : "",
        key: cellKey(r.oid, x.b),
        /** `pending`-д бичигдэх ТҮҮХИЙ мөр (горимын дүрмээр) — НЭМЭЛТ */
        v,
        /** Нэмэлтийн ТОО (горимын нэгжээр); 0 = өөрчлөлтгүй */
        n: isPct ? Number(x.v) / 100 : Number(x.v),
        r,
        b: x.b,
        /** Шинэ НИЙТ (горимын нэгжээр) */
        after: isPct ? (res ? res.act : null) : (res ? res.obyem : null),
        /** Өмнөх ба шинэ ХУВЬ (0–1) — «БУУРНА» асуулт хоёр горимд ХУВИАР (`commit`-ийн
            2026-09-30 ⚠️: Обьём горимд `obyem = null` хуучин хувийн нүд асуултгүй буурдаг байв) */
        pBefore: r.vol != null && r.vol > 0 && r.obyem[x.b] != null ? r.obyem[x.b]! / r.vol : r.act[x.b],
        pAfter: res ? res.act : null,
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
    const down = hits.filter((x) => x.pAfter != null && x.pBefore != null && x.pAfter < x.pBefore);
    /* ⚠️ Хувь горимд «мөрийн Обьёмоос хэтэрсэн» гэдэг нь «100%-иас их» гэсэн үг;
       2026-09-25: харьцуулах нь шинэ НИЙТ (суурь + нэмэлт), нэмэлт өөрөө биш.
       ⚠️ 2026-09-30: өөр өдрийн ХЯНАЛТАД байгаа нэмэлтийг ч нэмнэ (`commit`-ийн
       `reviewInc`-тэй ИЖИЛ дүрэм) — урьд нь гараар бичихэд асуудаг хэтрэлт Excel-ээс
       буулгахад ЧИМЭЭГҮЙ өнгөрч, хоёр илгээлт батлагдвал Обьёмоос хэтэрдэг байв.
       Хөвөгч цэгийн хүлцэлтэй (`overVol`/`overPct`). */
    const revOf = (x: { key: string }) => {
      const ri = reviewInc.get(x.key);
      const v = isPct ? ri?.a : ri?.n;
      return v != null && v > 0 ? v : 0;
    };
    const over = isPct
      ? hits.filter((x) => x.after != null && overPct(x.after + revOf(x)))
      : hits.filter((x) => x.after != null && x.r.vol != null && (x.r.vol as number) > 0 && overVol(x.after + revOf(x), x.r.vol as number));
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
        /* ⚠️ 2026-09-30: тэг нэмэлт — нөгөө горимын хэсэг байвал ТҮҮНИЙГ үлдээнэ */
        if (same && x.keepStr) n[x.key] = x.keepStr;
        else if (same) delete n[x.key];
        else n[x.key] = x.v;
        /* ⚠️ ЭЗЭМШЛИЙГ ЭНД тэмдэглэнэ (2026-09-08): энэ бол нүдийг ГАРААС
           засах ЦОРЫН ГАНЦ зам. Нийлүүлэлтээр ирсэн бусдын нүд энд ордоггүй
           тул оролцогчийн жагсаалт зөв үлдэнэ. Хоосон болгосон (`same`) нүдийг
           ч тэмдэглэнэ — «би энэ нүдийг хөндсөн» гэдэг нь оролцоо мөн. */
        /* 2026-09-21: буцаасан бол tombstone, бичсэн бол агшин (`Draft.byAt`/`del`).
           Дахин аудит: pending-д (`pv`) байгаагүй нүдэнд ижил утга бичих нь
           буцаалт БИШ — `revert`-ийн тайлбар (Б-гийн ирээгүй бичилтийг хамгаална). */
        if (same && !x.keepStr) revert(x.key, x.key in pv);
        else { mineRef.current.add(x.key); touchMine(x.key); }
      }
      setPending(n);
    }
    setEdit(null);
    /* ⚠️ 2026-09-30: ТОО БИШ / ТОДОРХОЙГҮЙ («1,250») / СӨРӨГ утгыг ногоон «алгасав»-д
       хоосон нүдтэй НИЙЛҮҮЛЭХГҮЙ — шар анхааруулгаар, аль нүд болохыг нэрлэж хэлнэ
       (`paste.normCell`-ийн «ИЛ мэдэгдэнэ» дүрэм). Урьд нь хэрэглэгчийн Excel-ийн
       утга бичигдээгүй атлаа амжилтын мессежид «алгасав» гэж л харагддаг байв. */
    if (bad) {
      const ex = badAt
        .map((x) => `${sc.bld[x.b] ?? ""} · ${rowsAll[x.row]?.work ?? ""}: «${x.raw}»`)
        .join("; ");
      warn(tr('{0} нүд бичигдлээ · {1} утгыг тоо гэж уншиж чадсангүй (тодорхойгүй таслал «1,250», сөрөг эсвэл тоо биш) — бичигдсэнгүй: {2}', String(hits.length), String(bad), ex + (bad > badAt.length ? ' …' : '')));
    } else {
      done(skipped
        ? tr("{0} нүд бичигдлээ · {1} алгасав", String(hits.length), String(skipped))
        : tr("{0} нүд бичигдлээ", String(hits.length)));
    }
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
  return {
    volMode, pctOnly, cellSeed, prevHint, commit, pasteBlock, nextEditable, nextBlockEditable,
    /* 2026-10-01 */
    remainHint, confirmPaste, cancelPaste,
  };
}
