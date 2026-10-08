/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн 4 мөрт толгой.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Schema } from "../bagts.pkg";
import type { seriesBands } from "../bagts.bands";
import type { useColWidths } from "../colWidths";
import { t as tr } from "@/lib/i18nCore";
import { RO, cls } from "./util";
import { extraCls, type ExtraCol } from "./extraCols";

export function SheetHead({ sc, nBld, bands, grip, extra = [] }: {
  sc: Schema; nBld: number; bands: ReturnType<typeof seriesBands>; grip: ReturnType<typeof useColWidths>['grip'];
  /** ⚠️ 2026-10-09: «Бусад талбар» — зөвхөн унших төгсгөлийн бүлэг (`extraCols.ts`); нуусан бол `[]` */
  extra?: ExtraCol[];
}) {
  /* ⚠️ 2026-10-09: блокгүй багцын синтетик блок — 2-р/3-р мөрийн блокийн нүд алга (1-р мөрөөс хамарсан) */
  const syn = sc.synthetic && nBld === 1;
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
                {/* ⚠️ 2026-10-09: БЛОКГҮЙ БАГЦЫН СИНТЕТИК НЭГ БЛОК (`fillSchema`) — «барилга»/«цуваа»
                    гэсэн үг утгагүй (дээрх 2026-09-23-ны шалтгаан) тул 3 мөрийг хамарсан энгийн
                    толгой: бөглөх «Обьём (нийт · +энэ удаа)» (нүдэнд нийлбэр + хувь), төлөвлөгөөт хувь,
                    хуваарийн Эхлэх/Дуусах (4-р мөр). Баганын тоо барилгын n = 1-тэй ЯГ ижил. */}
                {/* ⚠️ 2026-10-09 (хэрэглэгч: «хүснэгт эвдрэлтэй»): эхний хувилбар rowSpan=4 ба rowSpan=3-ыг
                    холиод 2-р/3-р мөрийг ХООСОН <tr> үлдээдэг байв — sticky толгойн мөр бүр тогтмол
                    өндөр/`top`-той тул хоосон мөр 0 өндөртэй болж «Эхлэх/Дуусах» биеийн мөр дээр унаж,
                    «Төлөвлөгөөт гүйцэтгэл» багана шахагдав. Одоо барилгын n = 1-тэй ЯГ ИЖИЛ 4 мөрийн
                    бүтэц (бүлэг → хоосон 2-р мөр → баганын нэр → Эхлэх/Дуусах), зөвхөн шошго өөр. */}
                {syn && (
                  <>
                    <th className={cls("band")}>{tr('Ажил гүйцэтгэл')}</th>
                    <th className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл')}</th>
                    <th colSpan={2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь')}</th>
                  </>
                )}
                {nBld > 0 && !syn && (
                  <>
                    <th colSpan={nBld} className={cls("band")}>{tr('Ажил гүйцэтгэл — обьём / хувь ({0} барилга)', nBld)}</th>
                    <th colSpan={nBld} className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл ({0} барилга)', nBld)}</th>
                    <th colSpan={nBld * 2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь ({0} барилга)', nBld)}</th>
                  </>
                )}
                <th rowSpan={4} className={cls("c-date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("date")} /></th>
                {/* ⚠️ Inspection Test Plan-ийн 9 багана ЭНД БАЙХГҮЙ
                    (2026-09-03) — «Чанар (QAQC)» тусдаа харагдацад. */}
                {/* ⚠️ 2026-10-09: «БУСАД ТАЛБАР» — 1-р мөрөнд бүлгийн гарчиг, 2-р мөрөөс баганын нэр
                    3 мөр хамарна (`rowSpan=3`, CSS `.xh`). Ингэснээр 2-р мөр ХЭЗЭЭ Ч хоосон үлдэхгүй
                    (хоосон <tr> sticky толгойг эвдсэн — дээрх 2026-10-09-ний ⚠️). */}
                {extra.length > 0 && (
                  <th colSpan={extra.length} className={cls("band xFirst")}>{tr('Бусад талбар')}</th>
                )}
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар) */}
              <tr>
                {syn && (
                  <>
                    <th className={cls("band2")} aria-hidden="true" />
                    <th className={cls("band2")} aria-hidden="true" />
                    <th colSpan={2} className={cls("band2")} aria-hidden="true" />
                  </>
                )}
                {!syn && bands.map((g, gi) => (
                  <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {!syn && bands.map((g, gi) => (
                  <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {!syn && bands.map((g, gi) => (
                  <th key={`bd${gi}`} colSpan={g.count * 2} className={cls("band2")}>{g.label}</th>
                ))}
                {/* ⚠️ 2026-10-09: бариул нь БАГАНА ТУС БҮРИЙН түлхүүр (`x.wKey`) — урьд нь төрлийн
                    (`--w-xd` г.м.) тул нэг баганыг чирэхэд ижил төрлийн бүх багана хамт өргөсдөг байв.
                    Өргөн нь inline `x.wStyle` (төрлийн анхдагч руу унана, `ExtraCol.wStyle`-ийн ⚠️). */}
                {extra.map((x, xi) => (
                  <th key={`x${x.key}`} rowSpan={3} className={cls(`xh ${extraCls(x.kind)}${xi === 0 ? " xFirst" : ""}`)}
                    style={x.wStyle} title={x.hint ? `${x.hint()} (${x.field})` : x.field}>
                    {x.label()}<i {...grip(x.wKey)} />
                  </th>
                ))}

              </tr>
              {/* 3-р мөр — блокийн код */}
              <tr>
                {syn && (
                  <>
                    {/* ⚠️ 2026-10-09: «Обьём (энэ удаа)» гэж нэрлэгдсэн байсан нь төөрөгдүүлдэг — нүдний ТОМ
                        тоо нь ХУРИМТЛАГДСАН нийт (`obyem_sum`), энэ удаагийн нэмэлт нь жижиг «+N». */}
                    <th rowSpan={2} className={cls("bld")}
                      title={tr('Нүдний том тоо — ХУРИМТЛАГДСАН нийт обьём; жижиг «+N» — энэ удаа нэмж буй обьём. Өмнөх бөглөлтөөс хойш хийсэн обьёмоо бичнэ — нийтэд нэмэгдэж, гүйцэтгэл = нийт ÷ Обьём.')}>
                      {tr('Обьём (нийт · +энэ удаа)')}<i {...grip("bld")} /></th>
                    <th rowSpan={2} className={cls("bld")} title={RO.blockPlan}>%<i {...grip("bld")} /></th>
                    <th colSpan={2} className={cls("c-date2")} aria-hidden="true" />
                  </>
                )}
                {!syn && sc.bld.map((b) => (
                  <th key={`a${b}`} rowSpan={2} className={cls("bld")}>{b}<i {...grip("bld")} /></th>
                ))}
                {!syn && sc.bld.map((b) => (
                  <th key={`p${b}`} rowSpan={2} className={cls("bld")}>{b} {tr('барилга')}<i {...grip("bld")} /></th>
                ))}
                {!syn && sc.bld.map((b) => (
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
