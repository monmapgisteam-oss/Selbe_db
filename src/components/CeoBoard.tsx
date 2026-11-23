'use client';

/**
 * CEO-ГИЙН ҮЗҮҮЛЭЛТИЙН ДЭЛГЭРЭНГҮЙ (`KpiDetail`) — `CeoScorecard`-д хэрэглэгдэнэ.
 * 2026-11-23 (аудит): хаана ч холбогдоогүй `CeoBoard` самбар (схемийн тор) хасагдав.
 */
import { useEffect, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { Loading } from '@/components/ui';
import type { Async } from '@/lib/useAsync';
import type { CeoKpiDef } from '@/lib/ceo/registry';
import { filterResult, issueNamesPkg, pkgColOf } from '@/lib/ceo/filter';
import type { Cell, DetailTable, KpiResult } from '@/lib/ceo/kpi';
import { LEVEL_MARK, LEVEL_TONE, levelLabel, type Level } from '@/lib/kpiLevels';
import { num, pct, mnt, date } from '@/lib/format';
import { shortError } from '@/lib/ceo/review';
import type { ViewKey } from '@/lib/services';
import s from './ceoBoard.module.css';

/* ══════════════ Ачаалалт ══════════════ */

export type Slot = Async<KpiResult>;

/* ══════════════ Туслах ══════════════ */

const levelOf = (x: Slot | undefined): Level => (
  !x ? 'loading' : x.state === 'ready' ? x.data.level : x.state === 'error' ? 'unknown' : 'loading'
);

/**
 * Хүснэгтийн нүд → текст.
 */
function cellText(c: Cell): string {
  if (c.v == null || c.v === '') return '—';
  if (typeof c.v !== 'number') return String(c.v);
  switch (c.kind) {
    case 'pct': return pct(c.v, 1);
    case 'mnt': return mnt(c.v);
    case 'ha': return `${num(c.v, 1)} ${tr('га')}`;
    case 'day': return tr('{0} хоног', num(c.v));
    default: return num(c.v, Number.isInteger(c.v) ? 0 : 1);
  }
}

/**
 * ЗАДАРГААНЫ ХҮСНЭГТ.
 */
/**
 * ТАСАЛСАН ТООНЫ МӨР мөн үү — `ceo/kpi.capRows` · `schemDetail`-ийн «… бас N мөр/ажил»:
 * эхний нүд «…»-ээр эхэлсэн текст, бусад нь хоосон.
 */
const isCapRow = (r: readonly Cell[] | undefined): boolean => {
  const head = r?.[0]?.v;
  return !!r && typeof head === 'string' && head.startsWith('…') && r.slice(1).every((c) => c.v === '' || c.v == null);
};

function Table({ t }: { t: DetailTable }) {
  if (t.rows.length === 0) return null;
  const count = t.rowsFull?.length ?? (isCapRow(t.rows[t.rows.length - 1]) ? t.rows.length - 1 : t.rows.length);
  return (
    <div className={s.tBox}>
      <div className={s.tTitle}>
        {t.title}
        <span className={`${s.tCount} num`}>{num(count)}</span>
      </div>
      <div className={s.tWrap}>
        <table className={s.tbl}>
          <thead>
            <tr>{t.cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={typeof c.v === 'number' ? `num ${s.tNum}` : undefined}>
                    {cellText(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ Дэлгэрэнгүй ══════════════ */

/**
 * Нэг үзүүлэлтийн бүрэн задаргаа.
 */
export function KpiDetail({
  def, slot, pkg, onView, onRetry, projectLabel = false,
}: {
  def: CeoKpiDef; slot: Slot; pkg: string;
  onView: (k: ViewKey) => void; onRetry: () => void;
  projectLabel?: boolean;
}) {
  const lv = levelOf(slot);
  const raw = slot.state === 'ready' ? slot.data : null;
  const d = raw && pkg ? filterResult(raw, pkg) : raw;
  /* Бүтэн алдаа консолд; дэлгэцэнд богино мөр (`shortError`) */
  useEffect(() => {
    if (slot.state === 'error') console.warn('[selbe] CEO KPI:', def.key, slot.error);
  }, [slot, def.key]);
  return (
    <section className={s.kpi} style={{ ['--h']: LEVEL_TONE[lv] } as CSSProperties}>
      <header className={s.kHead}>
        <span className={s.nIcon} aria-hidden><Icon name={def.icon} size={13} /></span>
        <b className={s.kTitle}>{def.title}</b>
        <span className={s.kTag}>{LEVEL_MARK[lv]} {levelLabel(lv)}</span>
        {d && (
          <span className={s.kValue}>
            {projectLabel && <i>{tr('Төслийн нийт:')}</i>}
            <b className="num">{d.value}</b>
            {d.unit && <i>{d.unit}</i>}
          </span>
        )}
        <button type="button" className={s.kGo} onClick={() => onView(def.view)}>
          {tr('Харагдац руу орох')}
          <span aria-hidden>→</span>
        </button>
      </header>

      {pkg && d && (
        <p className={s.dScope}>
          {d.tables.length === 0 || d.tables.some((t) => pkgColOf(t) >= 0)
            ? tr('Жагсаалт: {0} · дээрх тоо нь төслийн нийт', pkg)
            : tr('Жагсаалт багцаар шүүгдээгүй · дээрх тоо ба доорх жагсаалт нь төслийн нийт')}
        </p>
      )}

      {pkg && d && d.tables.length === 0 && !d.issues.some((is) => issueNamesPkg(is.text)) && raw && raw.tables.length > 0 && (
        <p className={s.dNote}>{tr('{0}-д энэ үзүүлэлтээр асуудалтай мөр алга.', pkg)}</p>
      )}

      {slot.state === 'error' ? (
        <p className={s.dNote}>
          {tr('Татагдсангүй.')}{' '}
          <button type="button" className={s.dRetry} onClick={onRetry}>{tr('Дахин оролдох')}</button>
          <span className={s.dErr}> {shortError(slot.error)}</span>
        </p>
      ) : !d ? (
        <Loading />
      ) : (
        <>
          {d.facts.length > 0 && (
            <ul className={s.dFacts}>
              {d.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}

          {/* АСУУДЛУУД — «юу нь болохгүй байна» гэдгийг НЭР ЗААЖ */}
          {d.issues.length > 0 && (
            <ul className={s.dIssues}>
              {d.issues.map((is, i) => (
                <li key={i} className={s.dIssue} style={{ ['--h']: LEVEL_TONE[is.tone] } as CSSProperties}>
                  {pkg && !issueNamesPkg(is.text) ? tr('{0} · төслийн нийт', is.text) : is.text}
                </li>
              ))}
            </ul>
          )}

          {/* ЗАДАРГАА — асуудалтай мөр БҮР нэрээрээ */}
          {d.tables.map((t) => (
            <Table key={t.title} t={pkg && pkgColOf(t) < 0 ? { ...t, title: tr('{0} · төслийн нийт', t.title) } : t} />
          ))}

          {/*
            * ЭХ СУРВАЛЖ — «—» нь ҮЙЛЧИЛГЭЭ УНАСНААС уу, үнэхээр байхгүйгээс үү
            * гэдгийг хэрэглэгч ТААХГҮЙ. Хэсэгчилсэн уналтыг ил хэлнэ.
            */}
          {(d.failedSources.length > 0 || d.asOf != null) && (
            <p className={s.dSrc}>
              {d.asOf != null && <span>{tr('Өгөгдөл: {0}', date(d.asOf))}</span>}
              {d.failedSources.length > 0 && (
                <span className={s.dSrcBad}>
                  {d.asOf != null && ' · '}
                  {tr('Татагдсангүй: {0}', d.failedSources.join(', '))}
                </span>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
