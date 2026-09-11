'use client';

/**
 * CASHFLOW ХУВИАРЛАХ — ажил бүрийн сарын гүйцэтгэлийн төлөвлөгөө.
 *
 * ЯАГААД ТУСДАА ХАРАГДАЦ ВЭ: гэрээний бүртгэл нь 33 багана, 78 мөр, гурван
 * түвшний зурвастай. Тэнд 681 сарын мөр нэмээд хувь бөглөх нь хэрэглэгчийг
 * хэвтээ гүйлгүүр дээр сарууд хайхад хүргэдэг. Энэ панель нь ЯГ ТЭР НЭГ
 * ажилдаа төвлөрнө: зүүн талд ажлаа сонгоно, баруун талд түүний сарууд
 * босоо жагсаалтаар — өөр юу ч байхгүй.
 *
 * ⚠️ ӨГӨГДЛИЙН ХЭЛБЭР: сарын мөрүүд нь `Cashflow_final` хүснэгтийн ДОТОРХ
 * нэмэлт мөрүүд (тусдаа хүснэгт БИШ) бөгөөд `Cashflow_start` бөглөгдсөнөөр
 * ажлын мөрөөс ялгагдана. Дэлгэрэнгүйг `services.ts` → `CF_WORK_WHERE`.
 *
 * ⚠️ `Cashflow_dun` ГАРААР БИЧИГДЭХГҮЙ — хувиас бодогдоно. Хоёуланг нь гараар
 * бөглөвөл хэзээ нэгэн цагт зөрөх нь тодорхой.
 */

import { useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num } from '@/lib/format';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { FIN_XL_CODE, FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD } from '@/lib/finExcelLayout';
import c from '@/modules/cfplan.module.css';

type Row = Record<string, unknown>;

const sOf = (v: unknown) => String(v ?? '').trim();
const nOf = (v: unknown): number | null => {
  const t = String(v ?? '').trim();
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};

/**
 * ЗАДАРГААНЫ КОДООР ЭРЭМБЭЛЭХ — «4.2» нь «4.10»-аас ӨМНӨ.
 * ⚠️ Гэрээний бүртгэлийн эрэмбэтэй ЯГ ИЖИЛ дүрэм: хоёр газарт өөр дараалал
 * гарвал «хэддэх ажил» гэж ярихад ойлголцохгүй.
 */
const seg = (v: unknown): number[] => sOf(v).split('.').map((t) => {
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n : Infinity;
});
const cmpSeg = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return Number.isNaN(d) ? 0 : d;
  }
  return 0;
};

/** «2026-03» */
const monthKey = (ms: unknown): string => {
  const t = Number(ms);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Бөглөлтийн төлөв — өнгө ба шошго нь эндээс */
type Fill = 'none' | 'part' | 'done';

/**
 * ⚠️ ГУРВАН төлөв, хоёр биш. Даалгаварт «бөглөсөн ногоон, бөглөөгүй улаан»
 * гэсэн ч 30% бөглөсөн ажил «бөглөсөн» гэж ногоон болбол дутуу ажил дууссан
 * мэт харагдана. Тиймээс ДУНД төлөв (шар) нэмэв: ногоон = ЯГ 100%.
 */
const fillOf = (sum: number | null): Fill => {
  if (sum == null) return 'none';
  /* ⚠️ Хөвөгч таслалын алдааг тэвчинэ — 33.33×3 нь 99.99 гардаг */
  if (Math.abs(sum - 100) < 0.01) return 'done';
  return sum > 0 ? 'part' : 'none';
};

export function CashflowPlan({
  works, months, onSaved,
}: {
  /** Ажлын мөрүүд (78) — `Cashflow_start IS NULL` */
  works: Row[];
  /** Сарын мөрүүд (681) — `Cashflow_start IS NOT NULL` */
  months: Row[];
  onSaved: () => void;
}) {
  const oidField = CASHFLOW_NEW.oid;
  /** Засварласан хувь — `oid` → бичсэн текст */
  const [pend, setPend] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /** Ажил бүрийн сарууд — огноогоор эрэмбэлсэн */
  const byWork = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const r of months) {
      const id = Number(r[CF_MONTH.id]);
      if (!Number.isFinite(id)) continue;
      const arr = m.get(id) ?? [];
      arr.push(r);
      m.set(id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Number(a[CF_MONTH.start] ?? 0) - Number(b[CF_MONTH.start] ?? 0));
    }
    return m;
  }, [months]);

  /** Кодоор эрэмбэлсэн ажлууд — 4-р түвшний бүтэн жагсаалт */
  const sorted = useMemo(() => works.slice().sort((x, y) => {
    for (const f of FIN_XL_CODE) {
      const d = cmpSeg(seg(x[f]), seg(y[f]));
      if (d !== 0) return d;
    }
    return Number(x[oidField] ?? 0) - Number(y[oidField] ?? 0);
  }), [works, oidField]);

  /** Одоогийн (засвар оруулсан) хувийн нийлбэр — ажлаар */
  const sumOf = (id: number): number | null => {
    const arr = byWork.get(id);
    if (!arr || arr.length === 0) return null;
    let any = false;
    let s = 0;
    for (const r of arr) {
      const oid = Number(r[oidField]);
      const raw = oid in pend ? pend[oid] : r[CF_MONTH.pct];
      const v = nOf(raw);
      /* ⚠️ `null` ≠ 0: бөглөөгүй сар нийлбэрт ОРОХГҮЙ, гэхдээ ажил өөрөө
         «бөглөөгүй» эсэхийг тодорхойлоход хэрэгтэй. */
      if (v != null) { any = true; s += v; }
    }
    return any ? s : null;
  };

  /** Зүүн жагсаалтын мөрүүд — зурвас ба ажил хольсон */
  const listRows = useMemo(() => {
    const out: (
      { kind: 'band'; depth: number; code: string; label: string }
      | { kind: 'work'; row: Row; id: number }
    )[] = [];
    const NF = [FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD];
    let prev: string[] = [];
    for (const r of sorted) {
      const chain: string[] = [];
      for (let d = 0; d < NF.length; d += 1) {
        const n = sOf(r[NF[d]]);
        if (d > 0 && n === '') break;
        chain.push(n);
      }
      let d = 0;
      while (d < chain.length && d < prev.length && chain[d] === prev[d]) d += 1;
      for (; d < chain.length; d += 1) {
        out.push({ kind: 'band', depth: d, code: sOf(r[FIN_XL_CODE[d]]), label: chain[d] });
      }
      prev = chain;
      out.push({ kind: 'work', row: r, id: Number(r[CF_MONTH.id]) });
    }
    return out;
  }, [sorted]);

  const cur = sel == null ? null : sorted.find((r) => Number(r[CF_MONTH.id]) === sel) ?? null;
  const curMonths = sel == null ? [] : byWork.get(sel) ?? [];
  const curCost = Number(cur?.ho_dun_geree) || 0;
  const curSum = sel == null ? null : sumOf(sel);
  const dirty = Object.keys(pend).length;

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      /* Хувь → эцгийн ХО дүнгээр үржүүлж мөнгөн дүн */
      const costById = new Map<number, number>();
      for (const w of works) costById.set(Number(w[CF_MONTH.id]), Number(w.ho_dun_geree) || 0);
      const mById = new Map<number, Row>();
      for (const r of months) mById.set(Number(r[oidField]), r);

      const updates = Object.entries(pend).map(([k, v]) => {
        const oid = Number(k);
        const pct = nOf(v);
        const cost = costById.get(Number(mById.get(oid)?.[CF_MONTH.id])) ?? 0;
        return {
          [oidField]: oid,
          [CF_MONTH.pct]: pct,
          /* ⚠️ Хувийг АРИЛГАВАЛ дүн ч арилна (`null`), 0 болохгүй — «бөглөөгүй»
             ба «энэ сард гүйцэтгэл байхгүй» хоёр ӨӨР мэдэгдэл. */
          [CF_MONTH.amount]: pct == null ? null : (cost * pct) / 100,
        };
      });
      const { n } = await applyAll(CASHFLOW_NEW.url, oidField, { updates });
      invalidate('CASHFLOW_NEW');
      setPend({});
      setMsg(tr('{0} сар хадгалагдав', n));
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  /** Ажлын мөрийн бөглөлтийн цэг */
  const dot = (id: number) => {
    const s = sumOf(id);
    const st = fillOf(s);
    const title = s == null
      ? tr('Бөглөөгүй')
      : tr('Нийт {0}%', num(s, 2));
    return <i className={`${c.dot} ${c[st]}`} title={title} aria-label={title} />;
  };

  return (
    <div className={c.wrap}>
      <div className={c.side}>
        <div className={c.sideHd}>
          {tr('Ажлууд')}
          <span className={c.legend}>
            <i className={`${c.dot} ${c.done}`} />{tr('100%')}
            <i className={`${c.dot} ${c.part}`} />{tr('дутуу')}
            <i className={`${c.dot} ${c.none}`} />{tr('хоосон')}
          </span>
        </div>
        <ul className={c.list}>
          {listRows.map((it, i) => (it.kind === 'band' ? (
            <li
              key={`b${i}`}
              className={c.band}
              style={{ paddingLeft: 10 + it.depth * 12 }}
            >{it.code ? `${it.code} · ${it.label}` : it.label}</li>
          ) : (
            <li key={`w${it.id}`}>
              <button
                type="button"
                className={`${c.work} ${sel === it.id ? c.workOn : ''}`}
                onClick={() => setSel(it.id)}
              >
                {dot(it.id)}
                <span className={c.pkg}>{sOf(it.row.bagts) || '—'}</span>
                <span className={c.nm}>{sOf(it.row.ajil_uilchilgee)}</span>
              </button>
            </li>
          )))}
        </ul>
      </div>

      <div className={c.main}>
        {cur == null ? (
          <p className={c.hint}>{tr('Зүүн талаас ажил сонгоно уу.')}</p>
        ) : (
          <>
            <div className={c.hd}>
              <h3>{sOf(cur.ajil_uilchilgee)}</h3>
              <p className={c.sub}>
                {sOf(cur.bagts) || '—'}
                {' · '}
                {tr('ХО дүн: {0}', mnt(curCost))}
                {' · '}
                {tr('{0} сар', curMonths.length)}
              </p>
            </div>

            {curMonths.length === 0 ? (
              /* ⚠️ Огноогүй ажилд сарын мөр үүсдэггүй — шалтгааныг ХЭЛНЭ,
                 эс бөгөөс хүн хоосон дэлгэц хараад алдаа гэж бодно. */
              <p className={c.hint}>
                {tr('Төлөвлөгөөт хугацаа бөглөгдөөгүй тул сар үүсээгүй. Эхлэх/дуусах огноог гэрээний бүртгэлээс оруулна уу.')}
              </p>
            ) : (
              <>
                <table className={c.tbl}>
                  <thead>
                    <tr>
                      <th>{tr('Сар')}</th>
                      <th className={c.r}>{tr('Хувь, %')}</th>
                      <th className={c.r}>{tr('Дүн')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curMonths.map((r) => {
                      const oid = Number(r[oidField]);
                      const raw = oid in pend ? pend[oid] : (r[CF_MONTH.pct] == null ? '' : String(r[CF_MONTH.pct]));
                      const pct = nOf(raw);
                      return (
                        <tr key={oid} className={pct == null ? c.rowNone : c.rowDone}>
                          <td>{monthKey(r[CF_MONTH.start])}</td>
                          <td className={c.r}>
                            <input
                              className={c.inp}
                              value={raw}
                              inputMode="decimal"
                              aria-label={tr('{0}-ны хувь', monthKey(r[CF_MONTH.start]))}
                              onChange={(e) => setPend((p) => ({ ...p, [oid]: e.target.value }))}
                            />
                          </td>
                          {/* ⚠️ Дүн нь ЗӨВХӨН харагдац — хадгалахдаа дахин бодогдоно */}
                          <td className={c.r}>{pct == null ? '' : mnt((curCost * pct) / 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={c[fillOf(curSum)]}>
                      <td>{tr('НИЙТ')}</td>
                      <td className={c.r}>{curSum == null ? '—' : `${num(curSum, 2)}%`}</td>
                      <td className={c.r}>
                        {curSum == null ? '' : mnt((curCost * curSum) / 100)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {/* ⚠️ 100%-иас зөрсөн бол ЗААВАЛ хэлнэ: дутуу төлөвлөгөө нь
                    S-муруйг чимээгүй тэгшитгэдэг. */}
                {curSum != null && fillOf(curSum) === 'part' && (
                  <p className={c.warn}>
                    {tr('⚠ Нийлбэр 100% биш ({0}%) — үлдэгдэл нь S-муруйд орохгүй.', num(curSum, 2))}
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className={c.bar}>
          {err && <span className={c.err}>{err}</span>}
          {msg && <span className={c.ok}>{msg}</span>}
          {/*
            * ЦЭВЭРЛЭХ — сонгосон ажлын БҮХ сарын хувийг хоослоно.
            *
            * ⚠️ ШУУД БИЧИХГҮЙ: «Хадгалах» дармагц л үйлчилнэ. Ингэснээр буруу
            * дарсан хүн зүгээр л табаа солиод буцаж чадна — нэг товшилтоор
            * 28 сарын ажил алга болохгүй.
            * ⚠️ `null` бичнэ, 0 БИШ: «бөглөөгүй» ба «энэ сард гүйцэтгэл
            * байхгүй» хоёр ӨӨР мэдэгдэл.
            */}
          {cur != null && curMonths.length > 0 && (
            <button
              type="button"
              className={c.clear}
              disabled={busy || curSum == null}
              title={tr('Энэ ажлын бүх сарын хувийг хоослоно')}
              onClick={() => setPend((p) => {
                const nx = { ...p };
                for (const r of curMonths) nx[Number(r[oidField])] = '';
                return nx;
              })}
            >
              {tr('Цэвэрлэх')}
            </button>
          )}
          <button
            type="button"
            className={c.save}
            disabled={busy || !dirty}
            onClick={save}
          >
            {busy ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
          </button>
        </div>
      </div>
    </div>
  );
}
