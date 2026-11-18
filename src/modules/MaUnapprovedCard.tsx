'use client';

/**
 * «МАТЕРИАЛ БАТЛАГДААГҮЙ ХИЙГДСЭН АЖИЛ» — «Багцын гүйцэтгэл» хуудасны карт (2026-11-18, хэрэглэгч).
 *
 * Материал баталгаажуулалт нь батлагдаагүй (буцаасан · шийдвэр хүлээж буй) атлаа гүйцэтгэл бөглөгдсөн ажлыг багцаар
 * харуулна: нийт тоо → багцын зурвас (улаан = буцаасан, шар = хүлээж буй) → багц дарахад ажлын жагсаалт.
 * Тооцоо — `lib/maUnapproved`. «Гүйцэтгэл» бөглөх хуудсанд энэ талаар юу ч харагдахгүй (түгжээ авсан).
 */
import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { num } from '@/lib/format';
import { loadUnapproved, type UnPkg, type UnWork } from '@/lib/maUnapproved';
import s from './maUnapproved.module.css';

const pp = (v: number): string => (v >= 0.05 ? num(v, 1) : v > 0 ? '<0.1' : '0');
const vol = (v: number | null): string => (v == null ? '—' : num(v, v >= 100 ? 0 : 2));
const stateLabel = (st: UnWork['state']): string => (st === 'rejected' ? tr('Буцаасан') : tr('Шийдвэр хүлээж буй'));

export function MaUnapprovedCard() {
  const q = useAsync(loadUnapproved, []);
  const [open, setOpen] = useState<string | null>(null);
  const title = tr('Материал батлагдаагүй хийгдсэн ажил');
  if (q.state === 'loading') return <Section title={title}><Loading /></Section>;
  if (q.state === 'error') {
    return <Section title={title}><p className={s.muted} role="alert">{tr('Материал баталгаажуулалтын мэдээлэл уншигдсангүй.')}</p></Section>;
  }
  const d = q.data;
  const max = Math.max(1, ...d.pkgs.map((p) => p.works.length));
  const sel: UnPkg | null = d.pkgs.find((p) => p.group === open) ?? null;
  return (
    <Section title={title} note={d.works ? tr('{0} ажил · {1} багц', num(d.works), num(d.pkgs.length)) : undefined}>
      {d.works === 0 ? (
        <p className={s.ok}><i className={s.dotOk} aria-hidden />{tr('Материал батлагдаагүй хийгдсэн ажил алга')}</p>
      ) : (
        <>
          <p className={s.head}>
            <b className="num">{num(d.works)}</b> {tr('ажил')}
            <span className={s.sep}>·</span>
            {tr('гүйцэтгэлийн {0} нэгж хувь', pp(d.pp))}
          </p>
          <p className={s.key}>
            <span><i className={s.swBad} aria-hidden />{tr('Буцаасан')} {num(d.rejected)}</span>
            <span><i className={s.swWarn} aria-hidden />{tr('Шийдвэр хүлээж буй')} {num(d.pending)}</span>
          </p>
          <ul className={s.bars}>
            {d.pkgs.map((p) => (
              <li key={p.group}>
                <button
                  type="button"
                  className={s.bar}
                  aria-expanded={open === p.group}
                  onClick={() => setOpen((v) => (v === p.group ? null : p.group))}
                  title={tr('{0}: буцаасан {1}, шийдвэр хүлээж буй {2}', tr(p.group), num(p.rejected), num(p.pending))}
                >
                  <span className={s.barName}>{tr(p.group)}</span>
                  <span className={s.track}>
                    <i className={s.segBad} style={{ width: `${(p.rejected / max) * 100}%` }} />
                    <i className={s.segWarn} style={{ width: `${(p.pending / max) * 100}%` }} />
                  </span>
                  <span className={`${s.barVal} num`}>{tr('{0} ажил · {1} н.х', num(p.works.length), pp(p.pp))}</span>
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <div className={s.detail}>
              <div className={s.detailHead}>{tr('{0} — {1} ажил', tr(sel.group), num(sel.works.length))}</div>
              <div className={s.scroll} tabIndex={0} role="region" aria-label={tr('Материал батлагдаагүй ажлын жагсаалт')}>
                <table className={s.tbl}>
                  <thead>
                    <tr>
                      <th>{tr('Ажил')}</th>
                      <th>{tr('Материал')}</th>
                      <th>{tr('Хүсэлт №')}</th>
                      <th>{tr('Төлөв')}</th>
                      <th className={s.r}>{tr('Хийгдсэн')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.works.map((w) => (
                      <tr key={`${w.pkgKey}:${w.des}`}>
                        <td>{w.name || `№${w.des}`}</td>
                        <td>{w.mas.map((m) => m.material || '—').join(', ')}</td>
                        <td>
                          {w.mas.map((m, k) => (
                            <span key={m.oid}>
                              {k > 0 && ', '}
                              {m.respNo
                                ? <a className={s.link} href={`?v=ma&ma=${encodeURIComponent(m.respNo)}`} title={tr('«Материал баталгаажуулалт» хуудсанд энэ хүсэлтийг нээх')}>{m.respNo}</a>
                                : tr('(дугааргүй)')}
                            </span>
                          ))}
                        </td>
                        <td><span className={w.state === 'rejected' ? s.tagBad : s.tagWarn}>{stateLabel(w.state)}</span></td>
                        <td className={`${s.r} num`}>
                          {w.done != null && w.total != null ? `${vol(w.done)} / ${vol(w.total)}` : vol(w.done)}
                          {w.pct != null && <small> · {num(w.pct, 1)}%</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {d.failed.length > 0 && (
        <p className={s.muted} role="status">{tr('{0} хуудас уншигдаагүй — жагсаалт дутуу байж болно.', num(d.failed.length))}</p>
      )}
    </Section>
  );
}
