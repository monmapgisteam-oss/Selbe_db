/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — хүснэгтийн 4 мөрт толгой.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import type { Schema } from "../bagts.pkg";
import type { seriesBands } from "../bagts.bands";
import { cw, type useColWidths } from "../colWidths";
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
  /* ⚠️ 2026-10-08 (хэрэглэгч: «хүснэгтийн эвдрэлийг зас»): 4 мөрт бүтэц ЗӨВХӨН блоктой багцад (`tall`).
     Синтетик блокт 2-р мөр (барилгын төрөл) ба 3-р мөрийн Эхлэх/Дуусахын дээрх нүд утгагүй ХООСОН
     зурвас болж харагддаг байв. Одоо: синтетик → 2 мөр (бүлэг → баганын нэр + Эхлэх/Дуусах);
     блокгүй, синтетик ч биш → 1 мөр (+ «Бусад талбар» байвал 2-р мөр). Байхгүй мөрийг ОГТ зурахгүй
     тул хоосон <tr> үүсэхгүй (2026-10-09-ний sticky эвдрэлийн шалтгаан); № г.м. `rowSpan=4` нь
     толгойн бүлгийн төгсгөлд хөтөч өөрөө хумина, `th[rowspan="4"] { top: 0 }` хэвээр үйлчилнэ. */
  const tall = nBld > 0 && !syn;
  const row2 = tall || syn || extra.length > 0;
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
                {/* ⚠️ 2026-10-09 (хэрэглэгч: «багана бүрээр тусдаа хийгдэхгүй байна»): ХОЁР гарчигт салгав — нэг
                    гарчиг нэг л бариултай тул C ба D-г тусад нь тохируулах аргагүй байв. D нь нийт төсөлд
                    эзлэх жин (`RO.wD`).
                    ⚠️ Багана БҮР өөрийн түлхүүртэй (`grip(k)` + `cw(k, ангилал)`) — `FillRows`-ийн нүдтэй
                    ИЖИЛ түлхүүр (`colWidths.cw`-ийн ⚠️); урьд нь ангиллаар (`vol` ×4 · `calc` ×3 · бүх
                    блок · бүх огноо) нэгийг чирэхэд бүгд хамт өргөсдөг байв. */}
                <th rowSpan={4} className={cls("c-w")} style={cw("wc", "w")}>{tr('Хувийн жин')}<i {...grip("wc")} /></th>
                <th rowSpan={4} className={cls("c-w")} style={cw("wd", "w")}>{tr('Хувийн жин (нийт)')}<i {...grip("wd")} /></th>
                <th rowSpan={4} className={cls("c-now")} style={cw("now", "now")}>{tr('Одоо байгаа хувийн жин')}<i {...grip("now")} /></th>
                <th rowSpan={4} className={cls("c-vol")} style={cw("ob", "vol")}>{tr('Обьём')}<i {...grip("ob")} /></th>
                {/* ⚠️ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ — гэрээний «Обьём»-ын ХАЖУУД
                    зориуд байрлуулав: хоёрын ЗӨРҮҮ нь өөрөө мэдээлэл
                    (төсөв ба талбайн бодит тооцоо). Засвар нь батлагдаж
                    байж бичигдэнэ (`obyemBatlah`). */}
                <th rowSpan={4} className={cls("c-vol")} style={cw("pvol", "vol")}>{tr('Инж. төлөвлөсөн обьём')}<i {...grip("pvol")} /></th>
                {/* ⚠️ «Нэгж өртөг» ба «Мөнгөн дүн» нь ӨГӨГДӨЛД БАЙСАН ч
                    хүснэгтэд огт зурагддаггүй байв. Хувийн жин бүхэлдээ
                    Мөнгөн дүнгээс бодогддог тул түүнийг харуулахгүй бол
                    жин хаанаас гарсныг шалгах арга үгүй болно. */}
                <th rowSpan={4} className={cls("c-vol")} style={cw("vsum", "vol")}>{tr('Обьёмын нийлбэр')}<i {...grip("vsum")} /></th>
                <th rowSpan={4} className={cls("c-vol")} style={cw("unit", "vol")}>{tr('Нэгж өртөг')}<i {...grip("unit")} /></th>
                <th rowSpan={4} className={cls("c-money")} style={cw("money", "money")}>{tr('Мөнгөн дүн')}<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("ci", "calc")}>{tr('Төлөвлөгөөт гүйцэтгэл')}<i {...grip("ci")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("cj", "calc")}>{tr('Бодит гүйцэтгэл')}<i {...grip("cj")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("ck", "calc")}>{tr('Төлөвлөгөө биелэлт')}<i {...grip("ck")} /></th>
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
                <th rowSpan={4} className={cls("c-date")} style={cw("asof", "date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("asof")} /></th>
                {/* ⚠️ Inspection Test Plan-ийн 9 багана ЭНД БАЙХГҮЙ
                    (2026-09-03) — «Чанар (QAQC)» тусдаа харагдацад. */}
                {/* ⚠️ 2026-10-09: «БУСАД ТАЛБАР» — 1-р мөрөнд бүлгийн гарчиг, 2-р мөрөөс баганын нэр
                    3 мөр хамарна (`rowSpan=3`, CSS `.xh`). Ингэснээр 2-р мөр ХЭЗЭЭ Ч хоосон үлдэхгүй
                    (хоосон <tr> sticky толгойг эвдсэн — дээрх 2026-10-09-ний ⚠️). */}
                {extra.length > 0 && (
                  <th colSpan={extra.length} className={cls("band xFirst")}>{tr('Бусад талбар')}</th>
                )}
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар); синтетикт баганын нэр + Эхлэх/Дуусах */}
              {row2 && (
                <tr>
                  {/* ⚠️ 2026-10-08: синтетик — бүлгийн гарчгийн ШУУД доор баганын нэр (`synH` — өндөр 40px) */}
                  {syn && (
                    <>
                      {/* ⚠️ 2026-10-09: «Обьём (энэ удаа)» гэж нэрлэгдсэн байсан нь төөрөгдүүлдэг — нүдний ТОМ
                          тоо нь ХУРИМТЛАГДСАН нийт (`obyem_sum`), энэ удаагийн нэмэлт нь жижиг «+N». */}
                      <th className={cls("bld synH")} style={cw("a0", "bld")}
                        title={tr('Нүдний том тоо — ХУРИМТЛАГДСАН нийт обьём; жижиг «+N» — энэ удаа нэмж буй обьём. Өмнөх бөглөлтөөс хойш хийсэн обьёмоо бичнэ — нийтэд нэмэгдэж, гүйцэтгэл = нийт ÷ Обьём.')}>
                        {tr('Обьём (нийт · +энэ удаа)')}<i {...grip("a0")} /></th>
                      <th className={cls("bld synH")} style={cw("p0", "bld")} title={RO.blockPlan}>%<i {...grip("p0")} /></th>
                      <th className={cls("c-date synH")} style={cw("s0", "date")}>{tr('Эхлэх')}<i {...grip("s0")} /></th>
                      <th className={cls("c-date synH")} style={cw("e0", "date")}>{tr('Дуусах')}<i {...grip("e0")} /></th>
                    </>
                  )}
                  {tall && bands.map((g, gi) => (
                    <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                  ))}
                  {tall && bands.map((g, gi) => (
                    <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                  ))}
                  {tall && bands.map((g, gi) => (
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
              )}
              {/* 3-р мөр — блокийн код (зөвхөн блоктой багц) */}
              {tall && (
                <tr>
                  {sc.bld.map((b, bi) => (
                    <th key={`a${b}`} rowSpan={2} className={cls("bld")} style={cw(`a${bi}`, "bld")}>{b}<i {...grip(`a${bi}`)} /></th>
                  ))}
                  {sc.bld.map((b, bi) => (
                    <th key={`p${b}`} rowSpan={2} className={cls("bld")} style={cw(`p${bi}`, "bld")}>{b} {tr('барилга')}<i {...grip(`p${bi}`)} /></th>
                  ))}
                  {sc.bld.map((b) => (
                    <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} {tr('барилга')}</th>
                  ))}
                </tr>
              )}
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах (зөвхөн блоктой багц) */}
              {tall && (
                <tr>
                  {sc.bld.map((b, bi) => [
                    <th key={`s${b}`} className={cls("c-date")} style={cw(`s${bi}`, "date")}>{tr('Эхлэх')}<i {...grip(`s${bi}`)} /></th>,
                    <th key={`e${b}`} className={cls("c-date")} style={cw(`e${bi}`, "date")}>{tr('Дуусах')}<i {...grip(`e${bi}`)} /></th>,
                  ])}
                </tr>
              )}
            </thead>
    </>
  );
}
