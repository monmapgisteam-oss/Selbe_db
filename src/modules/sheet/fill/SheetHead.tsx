import type { Schema } from "../bagts.pkg";
import type { seriesBands } from "../bagts.bands";
import { cw, type useColWidths } from "../colWidths";
import { t as tr } from "@/lib/i18nCore";
import { RO, cls } from "./util";
import { extraCls, type ExtraCol } from "./extraCols";

export function SheetHead({ sc, nBld, bands, grip, extra = [], compact = false }: {
  sc: Schema; nBld: number; bands: ReturnType<typeof seriesBands>; grip: ReturnType<typeof useColWidths>['grip'];
  extra?: ExtraCol[];
  compact?: boolean;
}) {
  const syn = sc.synthetic && nBld === 1;
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
                {/* Excel-д C1:D4 — «Хувийн жин» хоёр баганыг бүрэн хамарна. */}
                {!compact && (<>
                <th rowSpan={4} className={cls("c-w")} style={cw("wc", "w")}>{tr('Хувийн жин')}<i {...grip("wc")} /></th>
                <th rowSpan={4} className={cls("c-w")} style={cw("wd", "w")}>{tr('Хувийн жин (нийт)')}<i {...grip("wd")} /></th>
                <th rowSpan={4} className={cls("c-now")} style={cw("now", "now")}>{tr('Одоо байгаа хувийн жин')}<i {...grip("now")} /></th>
                </>)}
                <th rowSpan={4} className={cls("c-vol")} style={cw("ob", "vol")}>{tr('Обьём')}<i {...grip("ob")} /></th>
                <th rowSpan={4} className={cls("c-vol")} style={cw("pvol", "vol")}>{tr('Инж. төлөвлөсөн обьём')}<i {...grip("pvol")} /></th>
                {!compact && (<>
                <th rowSpan={4} className={cls("c-vol")} style={cw("vsum", "vol")}>{tr('Обьёмын нийлбэр')}<i {...grip("vsum")} /></th>
                <th rowSpan={4} className={cls("c-vol")} style={cw("unit", "vol")}>{tr('Нэгж өртөг')}<i {...grip("unit")} /></th>
                <th rowSpan={4} className={cls("c-money")} style={cw("money", "money")}>{tr('Мөнгөн дүн')}<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("ci", "calc")}>{tr('Төлөвлөгөөт гүйцэтгэл')}<i {...grip("ci")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("cj", "calc")}>{tr('Бодит гүйцэтгэл')}<i {...grip("cj")} /></th>
                <th rowSpan={4} className={cls("c-calc")} style={cw("ck", "calc")}>{tr('Төлөвлөгөө биелэлт')}<i {...grip("ck")} /></th>
                </>)}
                {/* Обьём (бөглөгддөг) ба түүнээс бодогдсон хувь — ТУСДАА хоёр
                    бүлэг. Нэг нүдэнд хамт байрлуулж байсныг болив: аль тоо нь
                    бичигддэг, аль нь бодогддог нь ялгарахгүй байв. */}
                {syn && (
                  <>
                    <th className={cls("band")}>{tr('Ажил гүйцэтгэл')}</th>
                    <th className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл')}</th>
                    {!compact && <th colSpan={2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь')}</th>}
                  </>
                )}
                {nBld > 0 && !syn && (
                  <>
                    <th colSpan={nBld} className={cls("band")}>{tr('Ажил гүйцэтгэл — обьём / хувь ({0} барилга)', nBld)}</th>
                    <th colSpan={nBld} className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл ({0} барилга)', nBld)}</th>
                    {!compact && <th colSpan={nBld * 2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь ({0} барилга)', nBld)}</th>}
                  </>
                )}
                {!compact && <th rowSpan={4} className={cls("c-date")} style={cw("asof", "date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("asof")} /></th>}
                {extra.length > 0 && (
                  <th colSpan={extra.length} className={cls("band xFirst")}>{tr('Бусад талбар')}</th>
                )}
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар); синтетикт баганын нэр + Эхлэх/Дуусах */}
              {row2 && (
                <tr>
                  {syn && (
                    <>
                      <th className={cls("bld synH")} style={cw("a0", "bld")}
                        title={tr('Нүдний том тоо — ХУРИМТЛАГДСАН нийт обьём; жижиг «+N» — энэ удаа нэмж буй обьём. Өмнөх бөглөлтөөс хойш хийсэн обьёмоо бичнэ — нийтэд нэмэгдэж, гүйцэтгэл = нийт ÷ Обьём.')}>
                        {tr('Обьём (нийт · +энэ удаа)')}<i {...grip("a0")} /></th>
                      <th className={cls("bld synH")} style={cw("p0", "bld")} title={RO.blockPlan}>%<i {...grip("p0")} /></th>
                      {!compact && <th className={cls("c-date synH")} style={cw("s0", "date")}>{tr('Эхлэх')}<i {...grip("s0")} /></th>}
                      {!compact && <th className={cls("c-date synH")} style={cw("e0", "date")}>{tr('Дуусах')}<i {...grip("e0")} /></th>}
                    </>
                  )}
                  {tall && bands.map((g, gi) => (
                    <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                  ))}
                  {tall && bands.map((g, gi) => (
                    <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                  ))}
                  {tall && !compact && bands.map((g, gi) => (
                    <th key={`bd${gi}`} colSpan={g.count * 2} className={cls("band2")}>{g.label}</th>
                  ))}
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
                    <th key={`a${b}`} rowSpan={compact ? 1 : 2} className={cls("bld")} style={cw(`a${bi}`, "bld")}>{b}<i {...grip(`a${bi}`)} /></th>
                  ))}
                  {sc.bld.map((b, bi) => (
                    <th key={`p${b}`} rowSpan={compact ? 1 : 2} className={cls("bld")} style={cw(`p${bi}`, "bld")}>{b} {tr('барилга')}<i {...grip(`p${bi}`)} /></th>
                  ))}
                  {!compact && sc.bld.map((b) => (
                    <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} {tr('барилга')}</th>
                  ))}
                </tr>
              )}
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах (зөвхөн блоктой багц; хураангуйд алга) */}
              {tall && !compact && (
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
