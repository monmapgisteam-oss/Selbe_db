'use client';

/**
 * ХҮЛЭЭН АВАГЧИЙН ТАЙЛАН — «Тайлан» харагдацын ГУРАВ ДАХЬ горим (2026-11-05). ЗӨВХӨН PDF (хэрэглэгч: «дэлгэцэд харуулахгүй,
 * шууд PDF татдаг болго»): хүлээн авагч · хугацаа · «PDF татах». Хотын дарга · Иргэдийн Төлөөлөгчдийн Хурал ·
 * Төлөөлөн удирдах зөвлөл — нэг тооцооноос (`audienceReport.buildReport`). Гараар оруулах талбаргүй.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Switch';
import { useAuth } from '@/components/AuthGate';
import { invalidateAll } from '@/lib/dataBus';
import { dateTime } from '@/lib/format';
import { periodOf, PERIOD_KEYS, periodLabel, type ExecPeriodKey } from '@/lib/execPeriodCalc';
import { AUDIENCES, audienceLabel, buildReport, type Audience } from '@/lib/audienceReport';
import { loadAudienceInputs } from '@/lib/audienceReportLoad';
import { downloadAudiencePdf } from '@/lib/audiencePdf';
import r from './report.module.css';
import e from './execReport.module.css';

/** Уншигдаагүй эх сурвалжийн нэр — тайлбарт */
const failedLabel = (k: string): string => ({
  deltas: tr('хугацааны өөрчлөлт'), plan: tr('Төсөл төлөвлөгөө биелэлт'), ipc: tr('IPC-ийн төлөв'), lag: tr('хуваарийн хоцрогдол'),
  saad: tr('багцын саад'), hse: tr('Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй'), cashflow: tr('сарын төлөвлөгөө'),
})[k] ?? k;

export function AudienceReport() {
  const auth = useAuth();
  const user = auth.user?.fullName || auth.user?.username || '';
  const [aud, setAud] = useState<Audience>('mayor');
  const [pkey, setPkey] = useState<ExecPeriodKey>('prevMonth');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  /** Огноо — ЗӨВХӨН клиент дээр (`ExecReport`-той ижил: hydration зөрөхөөс сэргийлнэ) */
  const [now, setNow] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(Date.now()); }, []);
  const period = useMemo(() => (now == null ? null : periodOf(pkey, now, custom)), [pkey, now, custom]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'fail'; text: string } | null>(null);

  /** Дарахад л татна: эх сурвалжуудыг нэгтгэж (кэштэй), тайланг бодож, PDF үүсгэнэ */
  const savePdf = useCallback(async () => {
    if (!period || now == null || busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const inputs = await loadAudienceInputs(period, user, now);
      const report = buildReport(aud, inputs);
      await downloadAudiencePdf(report, dateTime(Date.now()));
      setMsg({
        tone: 'ok',
        text: inputs.failed?.length
          ? tr('PDF үүсгэв. Уншигдаагүй эх сурвалж: {0} — холбогдох хэсэг мэдээлэлгүй.', inputs.failed.map(failedLabel).join(', '))
          : tr('PDF үүсгэв — {0}, {1} → {2}.', audienceLabel(aud), period.from, period.to),
      });
    } catch (err) {
      console.error('[selbe] хүлээн авагчийн тайлан:', err);
      setMsg({ tone: 'fail', text: tr('PDF үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.') });
    } finally {
      setBusy(false);
    }
  }, [period, now, busy, user, aud]);
  /** Шинэчлэх — бүх кэшийг хаяж дараагийн PDF-ийг шинэ өгөгдлөөр үүсгэнэ */
  const refresh = useCallback(() => { setNow(Date.now()); invalidateAll(); setMsg(null); }, []);

  return (
    <>
      <div className={r.toolbar}>
        <div className={r.tools}>
          <Segmented value={aud} onChange={setAud} label={tr('Хүлээн авагч')}
            options={AUDIENCES.map((k) => ({ value: k, label: audienceLabel(k) }))} />
          <button type="button" className={r.btn} disabled={!period || busy} onClick={savePdf} title={tr('Сонгосон хүлээн авагчийн тайланг PDF хэлбэрээр татах')}>
            <Icon name="file" size={15} />
            {busy ? tr('Бэлтгэж байна…') : tr('PDF татах')}
          </button>
          <button type="button" className={r.btn} disabled={busy} onClick={refresh}
            title={tr('Тайлангийн түр санах ойг хаяж өгөгдлийг дахин татна')}>
            <Icon name="chart" size={15} />
            {tr('Шинэчлэх')}
          </button>
        </div>
        <div className={e.period} role="group" aria-label={tr('Тайлангийн хугацаа')}>
          <span className={e.periodLabel}>{tr('Хугацаа:')}</span>
          {PERIOD_KEYS.map((k) => (
            <button key={k} type="button" className={`${r.btn} ${pkey === k ? e.periodOn : ''}`} aria-pressed={pkey === k} onClick={() => setPkey(k)}>
              {periodLabel(k)}
            </button>
          ))}
          {pkey === 'custom' && (
            <>
              <input type="date" className={e.periodInput} value={custom.from} max={custom.to || undefined} aria-label={tr('Эхлэх огноо')}
                onChange={(ev) => setCustom((c) => ({ ...c, from: ev.target.value }))} />
              <span aria-hidden>→</span>
              <input type="date" className={e.periodInput} value={custom.to} min={custom.from || undefined} aria-label={tr('Дуусах огноо')}
                onChange={(ev) => setCustom((c) => ({ ...c, to: ev.target.value }))} />
            </>
          )}
          {period && <span className={e.periodRange}>{period.from} → {period.to}</span>}
        </div>
        {msg && <p className={msg.tone === 'fail' ? r.fail : r.note} role={msg.tone === 'fail' ? 'alert' : 'status'}>{msg.text}</p>}
      </div>
      <article className={r.paper}>
        <p className={r.note}>
          {tr('Тайлан дэлгэцэд харагдахгүй — «PDF татах» дарахад сонгосон хүлээн авагч, хугацаагаар автоматаар үүснэ. Хотын дарга: дэлгэрэнгүй (9 бүлэг, хавсралт хүснэгттэй); Иргэдийн Төлөөлөгчдийн Хурал: хураангуй (5 хэсэг); Төлөөлөн удирдах зөвлөл: хураангуй (7 хэсэг, хавсралт хүснэгттэй). Гараар оруулах мэдээлэлгүй.')}
        </p>
      </article>
    </>
  );
}
