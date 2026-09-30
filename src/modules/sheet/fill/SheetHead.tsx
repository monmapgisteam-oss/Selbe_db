/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн 4 мөрт толгой.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Schema } from "../bagts.pkg";
import type { seriesBands } from "../bagts.bands";
import type { useColWidths } from "../colWidths";
import { t as tr } from "@/lib/i18nCore";
import { cls } from "./util";

export function SheetHead({ sc, nBld, bands, grip }: {
  sc: Schema; nBld: number; bands: ReturnType<typeof seriesBands>; grip: ReturnType<typeof useColWidths>['grip'];
}) {
  return (
    <>
            {/* ТОЛГОЙ нь `*_final_system` хуудасны бүтэц: 4 мөрт бүлэглэсэн.
                Мөр ба багана нь `*_final_publish`-тэйгээ ижил тул тооцоо
                хөндөгдөхгүй — зөвхөн дүрслэл. */}
            <thead>
              <tr>
                <th rowSpan={4} className={cls("fz c-no")}>№<i {...grip("no")} /></th>
                <th rowSpan={4} className={cls("fz c-ajil")}>{tr('Ажил')}<i {...grip("ajil")} /></th>
                {/* Excel-д C1:D4 — «Хувийн жин» хоёр баганыг бүрэн хамарна.
                    ⚠️ Энд `c-w` өргөний ангилал ТАВИХГҮЙ: 72px нь хоёр баганын
                    НИЙЛБЭР болж уншигдаж, хоёуланг нь шахна. Өргөнийг мөрийн
                    нүднүүд өөрсдөө заана. */}
                <th rowSpan={4} colSpan={2} className={cls("c-wspan")}>{tr('Хувийн жин')}<i {...grip("w")} /></th>
                <th rowSpan={4} className={cls("c-now")}>{tr('Одоо байгаа хувийн жин')}<i {...grip("now")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьём')}<i {...grip("vol")} /></th>
                {/* ⚠️ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — гэрээний «Обьём»-ын ХАЖУУД
                    зориуд байрлуулав: хоёрын ЗӨРҮҮ нь өөрөө мэдээлэл
                    (төсөв ба талбайн бодит тооцоо). Засвар нь батлагдаж
                    байж бичигдэнэ (`obyemBatlah`). */}
                <th rowSpan={4} className={cls("c-vol")}>{tr('Инж. төлөвлөсөн обьём')}<i {...grip("vol")} /></th>
                {/* ⚠️ «Нэгж өртөг» ба «Мөнгөн дүн» нь ӨГӨГДӨЛД БАЙСАН ч
                    хүснэгтэд огт зурагддаггүй байв. Хувийн жин бүхэлдээ
                    Мөнгөн дүнгээс бодогддог тул түүнийг харуулахгүй бол
                    жин хаанаас гарсныг шалгах арга үгүй болно. */}
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьёмын нийлбэр')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Нэгж өртөг')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-money")}>{tr('Мөнгөн дүн')}<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөөт гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Бодит гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөө биелэлт')}<i {...grip("calc")} /></th>
                {/* Обьём (бөглөгддөг) ба түүнээс бодогдсон хувь — ТУСДАА хоёр
                    бүлэг. Нэг нүдэнд хамт байрлуулж байсныг болив: аль тоо нь
                    бичигддэг, аль нь бодогддог нь ялгарахгүй байв. */}
                {/* ⚠️ БЛОКГҮЙ БАГЦАД (nBld = 0) ЭДГЭЭР БҮЛЭГ ГАРАХГҮЙ (2026-09-23, хэрэглэгч:
                    «инженерийн шугам сүлжээнд угаас барилга байхгүй — "0 барилга" гэж бичих
                    утгагүй»). Урьд нь colSpan=0 хоосон толгой «(0 барилга)» гэж зурагддаг байв. */}
                {nBld > 0 && (
                  <>
                    <th colSpan={nBld} className={cls("band")}>{tr('Ажил гүйцэтгэл — обьём / хувь ({0} барилга)', nBld)}</th>
                    <th colSpan={nBld} className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл ({0} барилга)', nBld)}</th>
                    <th colSpan={nBld * 2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь ({0} барилга)', nBld)}</th>
                  </>
                )}
                <th rowSpan={4} className={cls("c-date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("date")} /></th>
                {/* ⚠️ Inspection Test Plan-ийн 9 багана ЭНД БАЙХГҮЙ
                    (2026-09-03) — «Чанар (QAQC)» тусдаа харагдацад. */}
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар) */}
              <tr>
                {bands.map((g, gi) => (
                  <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bd${gi}`} colSpan={g.count * 2} className={cls("band2")}>{g.label}</th>
                ))}

              </tr>
              {/* 3-р мөр — блокийн код */}
              <tr>
                {sc.bld.map((b) => (
                  <th key={`a${b}`} rowSpan={2} className={cls("bld")}>{b}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`p${b}`} rowSpan={2} className={cls("bld")}>{b} {tr('барилга')}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} {tr('барилга')}</th>
                ))}

              </tr>
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах */}
              <tr>
                {sc.bld.map((b) => [
                  <th key={`s${b}`} className={cls("c-date")}>{tr('Эхлэх')}<i {...grip("date")} /></th>,
                  <th key={`e${b}`} className={cls("c-date")}>{tr('Дуусах')}<i {...grip("date")} /></th>,
                ])}
              </tr>
            </thead>
    </>
  );
}
