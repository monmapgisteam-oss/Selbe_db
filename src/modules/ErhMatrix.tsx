'use client';

/**
 * БАГЦ × СИСТЕМИЙН МАТРИЦ — «Тойм»-ын анхдагч дэлгэц (2026-09-25).
 *
 * ⚠️ ЯАГААД (баталсан төлөвлөгөө). Урьд нь багц бүр ТУСДАА хөзөр байсан тул
 *    «Багц 3-ын хуваарийн батлагч хэн бэ, Багц 5-д байна уу» гэж харьцуулахад
 *    10 хөзрийг гүйлгэх шаардлагатай байв. Мөр = багц (`PKG_GROUPS`), багана =
 *    19 үүрэг/шат (`erhOverview.MATRIX_COLS`; 2026-09-28: + ТУГ, + ЧХ инженер);
 *    нүд нь эзэд, дарвал засна.
 *
 * ⚠️ ӨНГӨ ЗӨВХӨН `erhOverview.pkgIssues`-ИЙН `cols`-оос — гацааны дүрмийг энд
 *    ДАХИН бичихгүй (`pkgMatrix`). «Зөвхөн харна» саарал, эзэн биш.
 * ⚠️ Хатуу super нүд бүрд ГАРАХГҮЙ — зөвхөн доорх тайлбарт («Админ N — бүх
 *    багцад»): тэдэнд хуваарилалт үйлчилдэггүй, 7 нэр 170 нүдийг дүүргэнэ.
 * ⚠️ Дэд бүтэц ТУСДАА хүснэгт — багц нь `BUTETS_PACKS` (25), `PKG_GROUPS` биш.
 * ⚠️ Засвар `allAclReady()` хүртэл хаалттай — уншигдаагүй эх сурвалжийн `[]`
 *    дээр бичвэл хүний бүх мөрийг нэг багцаар дарна (панелуудын ⚠️).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import {
  MATRIX_COLS, butetsRows, pkgMatrix, type ErhSource, type MatrixCol, type MatrixSys,
} from '@/lib/erhOverview';
import { useAclRunner } from './useAclRunner';
import { colLabel, roleLabel, sysTitle } from './erhLabels';
import { ErhCellEditor, type EditCol } from './ErhCellEditor';
import s from './guitsetgel.module.css';

/** Баганын бүлгүүд — толгойн эхний мөр */
const groupsOf = (cols: MatrixCol[]): { sys: MatrixSys; n: number }[] => {
  const out: { sys: MatrixSys; n: number }[] = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (last && last.sys === c.sys) last.n += 1; else out.push({ sys: c.sys, n: 1 });
  }
  return out;
};

export function ErhMatrix({
  src, locked, drafts,
}: {
  src: ErhSource;
  locked: boolean;
  /** `UserAdmin`-ы хадгалаагүй ноорог — картын хамгаалалтыг матриц ч мөрдөнө */
  drafts: ReadonlyMap<string, { remove?: boolean; isNew?: boolean }>;
}) {
  const rows = pkgMatrix(src);
  const bRows = butetsRows(src, BUTETS_PACKS);
  const supers = src.supers ?? [];
  /** Нээлттэй нүд — `pkg` + баганын `id` (дэд бүтцэд `butets:editor`) */
  const [open, setOpen] = useState<{ pkg: string; col: string } | null>(null);
  /* ⚠️ НЭГ busy — матриц бүхэлдээ нэг бичилтийг л зэрэг явуулна (давхар товшилт) */
  const { busy, err, setErr, run } = useAclRunner();

  /*
   * ⚠️ Esc — CAPTURE фазад, нүд нээлттэй үед л (2026-09-25). `UserAdmin`-ы
   *    `window` keydown сонсогч (bubble) Esc-ээр БҮХ админ порталыг хаадаг;
   *    фокус `body` руу унасан ч (✕ / «Нэмэх»-ийн дараа) энэ нь түрүүлж барина.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const toggle = (pkg: string, col: string) => {
    setErr('');
    setOpen((cur) => (cur && cur.pkg === pkg && cur.col === col ? null : { pkg, col }));
  };
  const isOpen = (pkg: string, col: string) => !!open && open.pkg === pkg && open.col === col;

  /*
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): УСТГАГДСАН ба АДМИН аккаунтыг ИЛ тэмдэглэнэ.
   *    Урьд нь нүдэнд энгийн эзэн шиг харагддаг тул устгагдсан батлагчийн хуучин мөрийг «багц
   *    томилогдсон» гэж андуурах (гацааны шалгуур тэднийг тоолдоггүй — `ErhSource.gone`), эсвэл
   *    super-ийн хуучин мөрийг жирийн хуваарилалт гэж ойлгох эрсдэлтэй байв.
   */
  const gone = new Set((src.gone ?? []).map((x) => x.toLowerCase()));
  const adm = new Set(supers.map((x) => x.toLowerCase()));
  const person = (u: string, view: boolean) => {
    const k = u.toLowerCase();
    const isGone = gone.has(k);
    const isAdm = !isGone && adm.has(k);
    const notes = [
      view ? tr('зөвхөн харна') : '',
      isGone ? tr('устгагдсан аккаунт — тухайн эрхийн хуудсанд «Цэвэрлэх»') : '',
      isAdm ? tr('админ — багцын хязгаар үйлчлэхгүй') : '',
    ].filter(Boolean);
    const cls = [s.mxName, view ? s.mxView : '', isGone ? s.aclGoneName : '', isAdm ? s.aclAdminName : ''].filter(Boolean).join(' ');
    return (
      <span key={`${view ? 'v' : 'o'}-${u}`} className={cls} title={notes.join(' · ') || undefined}>
        {u}
        {isGone && <span className={s.aclMarkTag}>{tr('устгагдсан')}</span>}
        {isAdm && <span className={s.aclMarkTag}>{tr('админ')}</span>}
      </span>
    );
  };
  const names = (owners: string[], viewers: string[]) => (
    owners.length || viewers.length ? (
      <>
        {owners.map((u) => person(u, false))}
        {viewers.map((u) => person(u, true))}
      </>
    ) : <span className={s.mxNone}>—</span>
  );

  const editor = (pkg: string, title: string, col: EditCol, owners: string[], viewers: string[]) => (
    <ErhCellEditor
      pkg={pkg}
      title={title}
      col={col}
      owners={owners}
      viewers={viewers}
      locked={locked}
      busy={busy}
      err={err}
      run={run}
      drafts={drafts}
      onClose={() => setOpen(null)}
    />
  );

  return (
    <>
      <div className={s.mxWrap}>
        <table className={s.mx}>
          <thead>
            <tr>
              <th className={s.mxCorner} rowSpan={2}>{tr('Багц')}</th>
              {groupsOf(MATRIX_COLS).map((g) => (
                <th key={g.sys} colSpan={g.n} className={s.mxGroup}>{sysTitle(g.sys)}</th>
              ))}
            </tr>
            <tr>
              {MATRIX_COLS.map((c) => <th key={c.id} className={s.mxHead}>{colLabel(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bagts}>
                <th className={s.mxRow} scope="row">{r.bagts}</th>
                {MATRIX_COLS.map((c) => {
                  const cell = r.cells[c.id];
                  const tone = cell.tone === 'bad' ? s.mxBad : cell.tone === 'warn' ? s.mxWarn : '';
                  return (
                    <td key={c.id} className={`${s.mxCell} ${tone}`}>
                      <button
                        type="button"
                        className={s.mxBtn}
                        aria-expanded={isOpen(r.bagts, c.id)}
                        title={tr('Дарж засна')}
                        onClick={() => toggle(r.bagts, c.id)}
                      >
                        {names(cell.owners, cell.viewers)}
                      </button>
                      {isOpen(r.bagts, c.id) && editor(
                        r.bagts, `${r.bagts} · ${colLabel(c)}`,
                        { sys: c.sys, role: c.role }, cell.owners, cell.viewers,
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={s.aclEmpty}>
        {tr('Улаан нүд — ажил гацна (дээрх «Анхаарах»). Саарал нэр — зөвхөн харна, шатны эзэн биш.')}
        {supers.length > 0 && <>{' '}{tr('Админ {0} — бүх багцад (хуваарилалт үйлчлэхгүй).', String(supers.length))}</>}
        {' '}{tr('«устгагдсан» — порталд байхгүй аккаунтын үлдсэн мөр (гацааны шалгуурт тоологдохгүй; тухайн эрхийн хуудсанд «Цэвэрлэх»). «админ» — хатуу super-ийн хуучин мөр.')}
      </p>

      <div className={s.mxWrap}>
        <table className={s.mx}>
          <thead>
            <tr>
              <th className={s.mxCorner}>{sysTitle('butets')}</th>
              <th className={s.mxHead}>{roleLabel('butets', 'editor')}</th>
            </tr>
          </thead>
          <tbody>
            {bRows.map((r) => (
                <tr key={r.key}>
                  <th className={s.mxRow} scope="row">{r.name}</th>
                  <td className={s.mxCell}>
                    <button
                      type="button"
                      className={s.mxBtn}
                      aria-expanded={isOpen(r.key, 'butets:editor')}
                      title={tr('Дарж засна')}
                      onClick={() => toggle(r.key, 'butets:editor')}
                    >
                      {names(r.editors, [])}
                    </button>
                    {isOpen(r.key, 'butets:editor') && editor(
                      r.key, `${r.name} · ${roleLabel('butets', 'editor')}`,
                      { sys: 'butets', role: 'editor' }, r.editors, [],
                    )}
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
