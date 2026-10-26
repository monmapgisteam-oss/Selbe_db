'use client';

/**
 * ҮЛ НИЙЦЛИЙН АРИЛГАЛТ — `HSE_Action` (2026-10-26, хэрэглэгчийн хүсэлт: «Захиалагчийн ажлын байрны үзлэг»
 * фокусын БАРУУН талд HSE_Action-ий өгөгдлөөр чартууд; V1.1 энэ фокусаас хасагдав).
 *
 * `HSE_Action` (Enterprise `Hosted/HSE_Action/FeatureServer/2`) — үзлэгийн үл нийцэл бүр нэг ажил (Workforce-ийн
 * `esritask_*` талбартай): асуумж (`survey`) · багц (`site`) · хэсэг (`section`) · зэрэг (`severity_code`) ·
 * төлөв (`esritask_status`) · дуусах хугацаа (`esritask_duedate`). Амьд метадата 2026-10-26: 1041 мөр
 * (V1.1 866 · захиалагчийн 175).
 *
 * ⚠️ ЗӨВХӨН захиалагчийн маягтын мөрүүд (`HABEA.action.survey`) — фокус нь тэр маягтынх.
 * ⚠️ Төлөвийн нэр ба өнгө нь метадатын домэйноос (0–5) ЯГ хуулав — домэйн өөрчлөгдвөл энд солино;
 *    танихгүй код нь кодоороо харагдана (чимээгүй хаягдахгүй).
 * ⚠️ Нэвтэрсэн хэрэглэгчийн токеноор (`getAuth`) — нэвтрээгүй бол хоосон биш ИЛ алдаа (`habeaUzleg.loadPrivate`-ийн дүрэм).
 */

import { useMemo } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, type Row } from '@/lib/query';
import { getAuth } from '@/lib/draftRemote';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { HABEA } from '@/lib/services';
import { Section, Bars, Donut, Loading, Empty, friendlyError } from '@/components/ui';
import { num, pct } from '@/lib/format';
import { habeaPkgKey, habeaPkgLabel } from './habeaUzleg';

const A = HABEA.action;

/** `esritask_status` домэйн (амьд метадата) → нэр ба өнгө. Дараалал нь ажлын урсгалын дараалал. */
const STATUS: { code: number; label: () => string; color: string }[] = [
  { code: 0, label: () => tr('Хуваарилаагүй'), color: '#94a3b8' },
  { code: 1, label: () => tr('Хуваарилсан'), color: '#f59e0b' },
  { code: 2, label: () => tr('Гүйцэтгэж байна'), color: '#3b82f6' },
  { code: 4, label: () => tr('Шалгуулах'), color: '#8b5cf6' },
  { code: 5, label: () => tr('Засвар шаардлагатай'), color: '#dc2626' },
  { code: 3, label: () => tr('Дууссан'), color: '#16a34a' },
];
const DONE = 3;
/**
 * ⚠️ 2026-10-26 (хэрэглэгч: «сүүлийн сарын дата харагддаг»): ҮЗЛЭГИЙН ОГНООГООР (`insp_datetime`) сүүлийн 30 хоног —
 *    `now`-оос хойш гулсах цонх. Огноогүй мөр ОРОХГҮЙ (аль сард хамаарахыг мэдэхгүй).
 */
const WINDOW_DAYS = 30;

type ActionRow = { site: string; pkgK: string; section: string; status: number | null; due: number | null; major: boolean; d: number | null };

const toRow = (r: Row): ActionRow => {
  const site = String(r.site ?? '').trim();
  const st = r.esritask_status;
  const due = r.esritask_duedate;
  return {
    site,
    pkgK: site ? habeaPkgKey(site) : '',
    section: String(r.section ?? '').trim(),
    /* ⚠️ null ≠ 0: хоосон төлөв «Хуваарилаагүй» (0) гэж ТООЦОГДОХГҮЙ */
    status: st == null || st === '' ? null : Number(st),
    due: typeof due === 'number' && due > 0 ? due : null,
    major: r.severity_code === 'major',
    d: typeof r.insp_datetime === 'number' && r.insp_datetime > 0 ? r.insp_datetime : null,
  };
};

/* ⚠️ Таг (`HABEA`) — ХАБЭА-гийн бусад кэштэй хамт хүчингүй болно; 5 мин TTL (`habeaUzleg.loaders`-тэй ижил) */
const loadActions = cached(async (): Promise<ActionRow[]> => {
  const auth = await getAuth();
  if (!auth) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  const rows = await queryFeatures(A.url, {
    where: `survey = N'${A.survey.replace(/'/g, "''")}'`,
    outFields: ['objectid', 'site', 'section', 'severity_code', 'esritask_status', 'esritask_duedate', 'insp_datetime'],
    orderBy: 'objectid',
  });
  return rows.map(toRow);
}, 5 * 60_000, ['HABEA']);

export function HseActionPanel({ pkgs, onPkg, now, tick }: {
  /** Хуудасны «Багц» шүүлт (`habeaPkgKey`) — хоосон = бүгд */
  pkgs: string[];
  onPkg: (key: string) => void;
  /** Хугацаа хэтэрсэн эсэхийн цаг — дуудагчийн `now` (render-ийн `Date.now()` биш) */
  now: number;
  /** Хуудасны давтан шинэчлэлийн тоолуур (`Habea`-ийн `tick`, HABEA_POLL_MS) */
  tick: number;
}) {
  /* ⚠️ 2026-10-26: бусад ХАБЭА-гийн ачаалагчтай ИЖИЛ `tick`-ээр дахин татна (Habea-ийн 2026-10-06-ны ⚠️) — HSE_Action-д
     портал бичдэггүй тул dataBus-ийн invalidate ирэхгүй; урьд нээлттэй табд Workforce-ийн төлөв солигдсон ч тоо хуучин
     үлдэж, `now` гулсахад хуучин өгөгдлөөс мөр хасагдсаар байв. 5 минутын кэш (`cached`) нь poll-оос богино. */
  const st = useAsync(() => loadActions(), [tick], { keepOn: [tick] });

  const view = useMemo(() => {
    if (st.state !== 'ready') return null;
    const from = now - WINDOW_DAYS * 86_400_000;
    const all = st.data.filter((r) => r.d != null && r.d >= from && r.d <= now);
    const rows = pkgs.length ? all.filter((r) => pkgs.includes(r.pkgK)) : all;
    const known = rows.filter((r) => r.status != null);
    const done = known.filter((r) => r.status === DONE).length;
    const status = STATUS
      .map((s) => ({ key: String(s.code), label: s.label(), value: known.filter((r) => r.status === s.code).length, color: s.color }))
      .filter((x) => x.value > 0);
    /* Багцаар — ӨӨРИЙН сонголтоор шүүгдэхгүй (ArcGIS Dashboard-ын зан, `habeaUzleg.uzPass`-ийн ⚠️) */
    const byPkg = new Map<string, { label: string; open: number; total: number }>();
    for (const r of all) {
      if (!r.pkgK) continue;
      const cur = byPkg.get(r.pkgK) ?? { label: tr(habeaPkgLabel(r.site)), open: 0, total: 0 };
      cur.total += 1;
      if (r.status != null && r.status !== DONE) cur.open += 1;
      byPkg.set(r.pkgK, cur);
    }
    const pkgBars = [...byPkg.entries()]
      .map(([key, v]) => ({ key, label: v.label, value: v.open, display: `${num(v.open)} / ${num(v.total)}` }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'mn'));
    const bySec = new Map<string, { open: number; total: number }>();
    /* ⚠️ 2026-10-26 (аудит): хэсэггүй мөр (амьд 30 хоногт 90-ийн 23) ЧИМЭЭГҮЙ хаягдаж төлөвийн донаттай (90) тоо таардаггүй байв
       (файлын ⚠️ «чимээгүй хаягдахгүй») — «Хэсэг заагаагүй» тусдаа баар (түлхүүр `''`). */
    for (const r of rows) {
      const sec = r.section || '';
      const cur = bySec.get(sec) ?? { open: 0, total: 0 };
      cur.total += 1;
      if (r.status != null && r.status !== DONE) cur.open += 1;
      bySec.set(sec, cur);
    }
    const secBars = [...bySec.entries()]
      .map(([key, v]) => ({ key: key || '__none__', label: key || tr('Хэсэг заагаагүй'), value: v.total, display: `${num(v.total)} · ${tr('{0} нээлттэй', num(v.open))}` }))
      .sort((a, b) => b.value - a.value);
    return { known: known.length, done, status, pkgBars, secBars };
  }, [st, pkgs, now]);

  if (st.state === 'loading') return <Section title={tr('Үл нийцлийн арилгалт')}><Loading /></Section>;
  if (st.state === 'error') {
    return (
      <Section title={tr('Үл нийцлийн арилгалт')}>
        <Empty label={tr('Татагдсангүй: {0}', friendlyError(st.error))} />
      </Section>
    );
  }
  if (!view) return null;

  const donePct = view.known > 0 ? (view.done / view.known) * 100 : null;
  return (
    <>
      <Section
        title={tr('Үл нийцлийн арилгалт — төлөв')}
        note={tr('сүүлийн {0} хоног', num(WINDOW_DAYS))}
        tone="primary"
      >
        {view.status.length
          ? <Donut items={view.status} stack size="md" center={donePct == null ? '—' : pct(donePct, 0)} centerLabel={tr('дууссан')} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Багцаар — нээлттэй үл нийцэл')} note={view.pkgBars.length ? tr('нээлттэй / нийт · дарж шүүнэ') : undefined}>
        {view.pkgBars.length
          ? <Bars items={view.pkgBars} selected={pkgs} onSelect={onPkg} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Хэсгээр — үл нийцэл')}>
        {view.secBars.length ? <Bars items={view.secBars} /> : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}
