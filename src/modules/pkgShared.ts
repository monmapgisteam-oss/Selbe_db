/**
 * «Багцын гүйцэтгэл» (PkgProg) ба «Багцын санхүү» (PkgFin) хоёрын НИЙТЛЭГ
 * цэвэр логик — ГАНЦ эх сурвалж.
 *
 * ⚠️ ЯАГААД (2026-09-17-ны аудит): хоёр харагдац нэг загвараас салаалсан тул
 *    ангилал (`catOf`), блокийн өнгө (`HUE`), сарын нэгтгэл (`aggregateMonths`)
 *    хоёр файлд ЯГ ИЖИЛ хуулбарлагдсан байв (~245 мөр давхардал). Нэг талд
 *    засаад нөгөөг мартвал хоёр дэлгэц зөрж, хэрэглэгч санхүүгийн тоог
 *    гүйцэтгэл гэж уншина. Хуулбар нь дараа гарвал ЭНД нэмнэ.
 *
 * ⚠️ Зөвхөн хуучин-биш, сүлжээгүй, React-гүй логик — hook/JSX энд орохгүй.
 */
import { LAYER_BY_ID, PKG_FAMILY_BY_BAGTS, cfMonthAxis } from '@/lib/services';
import { BLOCK_LAYER, type Pack } from '@/modules/Bagts';
import type { FinData } from '@/modules/Finance';

/** Блокийн давхаргын өнгө — хоёр харагдацын карт/легенд ижил өнгөтэй байна */
export const HUE = LAYER_BY_ID[BLOCK_LAYER].hue;

/**
 * БАГЦЫН АНГИЛАЛ (2026-08-21, хэрэглэгчийн хүсэлт) — жагсаалт, «Төслийн
 * төрөл» chart, «Блокийн төлөв»-ийн асуудалтай талбарын тоолол гурвуулаа
 * ЭНЭ нэг ангиллыг хэрэглэнэ. Блоктой багц = барилга угсралт; бусад нь
 * PKG_TABLE-ийн гэр бүлээс: soc = нийгмийн барилга, site = өндөржилт,
 * үлдсэн (net/pow/src/com) = дэд бүтэц.
 */
export type PackCat = 'build' | 'infra' | 'soc' | 'site';
export const catOf = (p: Pack): PackCat => {
  if (p.kind === 'build') return 'build';
  const fam = PKG_FAMILY_BY_BAGTS[p.key];
  return fam === 'soc' ? 'soc' : fam === 'site' ? 'site' : 'infra';
};

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд.
 *
 * ⚠️ 2026-09-06: САРЫН ТӨЛӨВЛӨГӨӨ (`amount`/`amountCum`/`cumPct`)
 *    ХАСАГДСАН — `cashflow_0813`-ийн «САР» мөрүүд байхгүй болсон. Үлдсэн
 *    хоёр цуваа хоёулаа БОДИТ хэмжилт: IPC олголт ба биет гүйцэтгэл.
 */
/**
 * ТӨСЛИЙН БИЕТ ГҮЙЦЭТГЭЛ «ОДОО» — `aggregateMonths`-ийн одоогийн сар хүртэлх
 * СҮҮЛИЙН хэмжигдсэн сарын блок-жигнэсэн %.
 *
 * ⚠️ 2026-09-22 (өгөгдлийн аудит): Дашбоардын `pkgPhys` (багц бүрийн ӨӨРИЙН
 *    сүүлийн сар, дараа нь жигнэх) ба PkgProg `TsKpi`/ExecReport (`aggregateMonths`
 *    — НЭГ сүүлийн сар) хоёр өөр тоо гаргаж, Dashboard «05-тэй ижил» гэж
 *    ХУДАЛ бичиж байв. Одоо дөрвүүлээ ЭНЭ туслахаас — нэг үзүүлэлт, нэг тоо.
 *    Тайлагнаагүй бол `null` («мэдээлэлгүй», 0 биш).
 */
export function physNow(d: FinData, nowYm: string): number | null {
  let actual: number | null = null;
  for (const m of aggregateMonths(d)) {
    if (m.label > nowYm) continue;
    if (m.phys != null) actual = m.phys;
  }
  return actual;
}

export function aggregateMonths(d: FinData) {
  /* ⚠️ Тэнхлэгийг өгөгдөлд БАЙГАА саруудаас угсрахгүй — хэмжилтгүй сар
     (2026-01) мөр ҮҮСГЭДЭГГҮЙ тул график нэг нүд шилжинэ. */
  const labels = cfMonthAxis();
  return labels.map((label) => {
    let given = 0;
    d.given.forEach((byMon) => { given += byMon.get(label) ?? 0; });
    // ⚠️ Төслийн сарын биет гүйцэтгэл — багцуудын дунджийн ДУНДАЖ БИШ. Давхар
    //    дундаж нь блок цөөтэй багцыг том багцтай ижил жинтэй болгож гажуудуулж,
    //    мөн дэлгэц дээрх PackKpi-ийн блок-жигнэсэн дүнтэй зөрдөг. Багц бүрийг
    //    блокийнх нь тоогоор жигнэнэ: Σ(pct_p · blocks_p) / Σ blocks_p.
    let physW = 0, physN = 0;
    d.phys.forEach((byMon, k) => {
      const v = byMon.get(label);
      if (v == null) return;
      const w = d.physCnt.get(k)?.get(label) ?? 1;
      physW += v * w;
      physN += w;
    });
    return {
      label,
      given,
      // ⚠️ Хэмжилт огт байхгүй сар — `null`. 0 гэж буцаавал график дээр
      //    «биет гүйцэтгэл тэг» гэсэн худал шугам зурагдана.
      phys: physN > 0 ? physW / physN : null,
    };
  });
}
