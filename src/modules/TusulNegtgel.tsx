'use client';

/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) модны хүснэгт.
 *
 * ⚠️ Мод нь `Tusul_guitsetgel/0`-оос (198 мөр), тоон утга нь `Cashflow_0904`-өөс
 * бодогдоно (`negtgel.ts`). Тэр үйлчилгээний тоон талбарууд ХООСОН тул хүснэгт
 * бүхэлдээ бодолтоор дүүрнэ.
 *
 * ⚠️ БОДОЛТ нь ҮЙЛЧИЛГЭЭНД БИЧИГДЭХГҮЙ. Тиймээс мөр бүрийн ард «яаж бодогдсон»
 * тайлбарыг ил гаргана: хүн харж буй тоо хаанаас гарсныг эргэлзэлгүй мэдэх
 * ёстой, ялангуяа эх хүснэгтэд тэр нүд хоосон байхад.
 */
import { useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { Data } from '@/components/ui';
import { pct as fmtPct } from '@/lib/format';
import { loadNegtgelFull, type NegtgelRow, type NegtgelCalc } from '@/lib/negtgel';
import n from './negtgel.module.css';

/** Гүн бүрийн нэмэлт догол (px) — мод нүдээр уншигдана */
const INDENT = 16;

/**
 * ⚠️ ГҮН 3-аас цааш догол НЭМЭГДЭХГҮЙ: 4 түвшинтэй мод 64px догол авбал
 * «Ажлын нэр» багана хоосон зайд идэгдэнэ. Гүнийг өнгө/зузаан ч заана.
 */
const indentOf = (depth: number) => Math.min(depth, 3) * INDENT;

export function TusulNegtgel() {
  const q = useAsync(loadNegtgelFull, []);
  return (
    <Data q={q} minH={320}>
      {(d) => <Tree rows={d.rows} calc={d.calc} />}
    </Data>
  );
}

function Tree({ rows, calc }: { rows: NegtgelRow[]; calc: Map<number, NegtgelCalc> }) {
  /**
   * ХАРАГДАХ ГҮН — Excel-ийн outline «1 2 3 4» товчтой ижил санаа.
   * ⚠️ 198 мөр нэг дэлгэцэнд багтахгүй тул эхлээд ГУРВАН түвшинг харуулна;
   * хамгийн доод (багц) түвшин нь хүсэлтээр нээгдэнэ.
   */
  const [maxDepth, setMaxDepth] = useState(3);
  const [q1, setQ1] = useState('');

  /**
   * ⚠️ ХАЙЛТ нь ЭЦГИЙГ ч авчирна: «Багц 2» гэж хайхад зөвхөн тэр мөр гарвал
   * аль хэсгийнх нь болох нь алдагдана. Тохирсон мөрийн БҮХ өвөг дээдсийг
   * кодоор нь (`1.2.1` → `1.2` → `1`) нэмнэ.
   */
  const list = useMemo(() => {
    const s = q1.trim().toLowerCase();
    if (s === '') return rows.filter((r) => r.depth <= maxDepth);
    const keep = new Set<string>();
    for (const r of rows) {
      if (!r.name.toLowerCase().includes(s) && !r.code.toLowerCase().includes(s)) continue;
      keep.add(r.code);
      const p = r.code.split('.');
      while (p.length > 1) { p.pop(); keep.add(p.join('.')); }
    }
    /* Төслийн толгой мөр (кодгүй) ҮРГЭЛЖ үлдэнэ — нийт дүнгийн мөр */
    return rows.filter((r) => r.depth === 0 || keep.has(r.code));
  }, [rows, q1, maxDepth]);

  /** Хэдэн мөр бодогдож чадсаныг ил хэлнэ — бөглөлт бүрэн бус гэдгийг нуухгүй */
  const filled = useMemo(
    () => rows.filter((r) => calc.get(r.oid)?.actPct != null).length,
    [rows, calc],
  );

  const cell = (v: number | null | undefined) => (
    v == null ? <span className={n.empty}>—</span> : fmtPct(v)
  );

  return (
    <div className={n.wrap}>
      <div className={n.bar}>
        <input
          className={n.search}
          placeholder={tr('Ажил, кодоор хайх…')}
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
        />
        {/* Excel-ийн outline товчтой ижил — харагдах ГҮНИЙГ сонгоно */}
        <span className={n.levels}>
          {[1, 2, 3, 4].map((d) => (
            <button
              key={d}
              type="button"
              className={maxDepth === d ? n.lvOn : ''}
              title={tr('{0}-р түвшин хүртэл харуулах', d)}
              onClick={() => setMaxDepth(d)}
            >{d}</button>
          ))}
        </span>
        <span className={n.spacer} />
        <span className={n.total}>
          {tr('{0} / {1} мөр бодогдов', String(filled), String(rows.length))}
        </span>
      </div>

      {/*
        * ⚠️ ТАЙЛБАРЫН МӨР ХАСАГДСАН (2026-09-08, хэрэглэгчийн заавар:
        * «delete, кодоо дээрээ бол хадгалаарай»). Агуулга нь энд үлдэв:
        *
        *   · ГҮЙЦЭТГЭЛ нь «Санхүүжилт» (гэрээний шатны хувь) ба «Газар
        *     чөлөөлөлт» хэсгээс ТӨСВӨӨР ЖИГНЭЖ бодогдоно.
        *   · «Төсөлд эзлэх хувь» нь ТОГТООСОН жин (ТЭЗҮ 5 · зураг төсөл 10 ·
        *     газар 3 · зөвшөөрөл 1 · сонгон шалгаруулалт 1 · барилга угсралт
        *     79 · улсын комисс 1), доод мөрүүдэд төсвөөр тарсан.
        *   · Эх хүснэгтэд (`Tusul_guitsetgel`) эдгээрийн аль нь ч БИЧИГДЭЭГҮЙ.
        *
        * Мөр бүрийн `title`-д «яаж бодогдсон» нь хэвээр байгаа тул мэдээлэл
        * бүрэн алдагдаагүй.
        */}
      <div className={n.scroll}>
        <table className={n.tbl}>
          {/*
            * ⚠️ БАГАНЫ БҮРЭЛДЭХҮҮН нь ЭХ ХҮСНЭГТИЙНХЭЭР (2026-09-08,
            * хэрэглэгчийн шүүмж: «хэлбэр яагаад өөрчлөгдчихөв, өөрчлөх ёсгүй»).
            * Урьд нь «Төлөвлөгөөт хувь» ба «Төлөвлөгөө биелэлт»-ийг эх
            * сурвалжгүй гэж ХАСААД, оронд нь «Эх сурвалж» багана нэмсэн байв —
            * тэр нь `Tusul_guitsetgel`-ийн бүтцийг эвдэж, хүн танихаа больжээ.
            * Эх сурвалжийн тайлбар нь одоо мөрийн `title`-д.
            */}
          <thead>
            <tr>
              <th className={n.thCode}>{tr('Д/Д')}</th>
              <th className={n.thName}>{tr('Ажлын нэр')}</th>
              <th className={n.thNum}>{tr('Хэсэгт эзлэх')}</th>
              <th className={n.thNum}>{tr('Төсөлд эзлэх хувь')}</th>
              <th className={n.thNum}>{tr('Төлөвлөгөөт хувь')}</th>
              <th className={n.thNum}>{tr('Гүйцэтгэлийн хувь')}</th>
              <th className={n.thNum}>{tr('Төлөвлөгөө биелэлт')}</th>
              {/* ⚠️ «Нийт төсөлд оруулж буй хувь» багана ХАСАГДСАН (2026-09-08,
                  хэрэглэгчийн заавар). Тооцоо нь `NegtgelCalc.share`-д ХЭВЭЭР —
                  түүнээс л төслийн нийт (33.87%) гардаг бөгөөд ерөнхий
                  дашбоардын индикатор ч түүнийг уншина. Багана нь эх
                  хүснэгтэд байхгүй тул харагдацад гаргахгүй. */}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const c = calc.get(r.oid);
              return (
                <tr
                  key={r.oid}
                  className={r.depth <= 1 ? n.rowTop : ''}
                  /* Тоо хаанаас гарсныг хулганаар — тусдаа багана эзлэхгүйгээр */
                  title={c && c.n > 0 ? tr('{0} · {1} гэрээ', c.how, String(c.n)) : c?.how}
                >
                  <td className={n.code}>{r.code}</td>
                  <td className={n.name} style={{ paddingLeft: 10 + indentOf(r.depth) }}>
                    {r.name}
                  </td>
                  <td className={n.num}>{cell(c?.inSection)}</td>
                  <td className={n.num}>{cell(c?.inProject)}</td>
                  {/* ⚠️ Төлөвлөгөөт хувь — эх сурвалж БАЙХГҮЙ тул ХООСОН.
                      0 гэж бичвэл «төлөвлөгөөгүй» ажил мэт худал уншигдана. */}
                  <td className={n.num}>{cell(c?.planPct)}</td>
                  <td className={`${n.num} ${c?.actPct != null ? n.auto : ''}`}>
                    {cell(c?.actPct)}
                  </td>
                  {/* ⚠️ Биелэлт = гүйцэтгэл ÷ төлөвлөгөө — төлөвлөгөө байхгүй
                      тул одоохондоо ХООСОН. */}
                  <td className={n.num}>{cell(c?.perf)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
