'use client';

/**
 * «MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТ» (2026-10-09) — Чанарын 4 шатны (MA → MIR → FIC → М-акт)
 * ЭХНИЙ шат. Хуучин «Чанарын баримт» (`Chanar.tsx`)-аас ТУСДАА шинэ сэдэв (хэрэглэгч:
 * «одоо системд байгаа чанар, чанарын баримтаас гадна шинээр сэдэв болгон хий»).
 *
 * ⚠️ Өгөгдөл Survey123-аас (`lib/ma.ts`) — портал БӨГЛӨХГҮЙ, зөвхөн уншиж харуулна.
 * ⚠️ Хавсралт (скан) ЭНДЭЭС нэмэгдэнэ — Survey123 маягтад файл асуулт БАЙХГҮЙ (хэрэглэгчийн
 *    шийдвэр, 2026-10-09). Скан OCR-дохгүй; зөвхөн төрөл · гэрчилгээний № · стандарт ·
 *    хүчинтэй хугацааг гараар (`keywords`). Бичилт Enterprise токентой (`EntSignIn`).
 * ⚠️ Хавсаргах эрх — `chanarAuthor` эсвэл `chanarReview`. Эрхгүй хүн ХАРНА, засахгүй.
 * ⚠️ Загвар нь «Багцын хамаарал»-ынх (ТУХ хүснэгт) — `ma.module.css` ХУУЛБАР.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { hasCap, subscribeCaps } from '@/lib/caps';
import {
  ATT_TYPES, MA_URL, addMaAtt, attTypeLabel, chainOf, deleteMaAtt, ipcReady, isExpired, latestPerRespNo, listMaAtts, loadMa, type StageKey,
  maAttBlob, maHasAttachments, stageLabel, stageStateLabel, verdictLabel, type AttType, type MaAtt, type MaRow, type Verdict,
} from '@/lib/ma';
import { addFm, decideFm, fmByMa, fmVerdictFor, loadFm, FM_REASON_MAX, type FmKind, type FmRow } from '@/lib/ficMakt';
import { entPdfBlob } from '@/lib/entDocs';
import { loadMir, loadMirPhotos, markLabel, mirCheckLabel, mirPhotoBlob, mirState, mirsByMa, mirVerdictFor, type MirPhoto, type MirRow } from '@/lib/mir';
import { maSheetHtml, mirSheetHtml, printHtml } from '@/lib/chanarSheets';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useAuth } from '@/components/AuthGate';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { friendlyError, userError } from '@/components/ui';
import s from './ma.module.css';


const day = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleDateString('sv-SE'));
const kb = (n: number | null) =>
  n == null ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function Ma() {
  const q = useAsync(loadMa, []);
  /* ⚠️ 2026-10-09: MIR (2-р шат) — MA карт бүрийн доор, гинжийн MIR шат. Унасан ч MA харагдсаар (`mirQ` тусдаа) */
  const mirQ = useAsync(loadMir, []);
  const mirMap = useMemo(() => (mirQ.state === 'ready' ? mirsByMa(mirQ.data) : null), [mirQ]);
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио (`BagtsHamaaral`-тай ижил)
  const canAttach = useMemo(() => hasCap(user?.username, 'chanarAuthor') || hasCap(user?.username, 'chanarReview'), [user, capN]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио
  const canAuthor = useMemo(() => hasCap(user?.username, 'chanarAuthor'), [user, capN]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио
  const canReview = useMemo(() => hasCap(user?.username, 'chanarReview'), [user, capN]);

  /* ⚠️ 2026-10-09: FIC · М-акт (3–4-р шат) — Enterprise хүснэгт, ЗӨВХӨН Enterprise нэвтрэлттэй уншигдана
     (`lib/ficMakt.ts`). Нэвтрээгүй бол `fmMap` = null → тэр шатууд «нэвтэрч харна» гэж гарна. */
  const ent = useEntSession();
  const [fmTick, setFmTick] = useState(0);
  const [fm, setFm] = useState<{ rows: FmRow[] | null; err: string }>({ rows: null, err: '' });
  useEffect(() => {
    if (!ent) return;
    let alive = true;
    loadFm()
      .then((rows) => { if (alive) setFm({ rows, err: '' }); })
      .catch((e) => { if (alive) setFm({ rows: null, err: userError(e) }); });
    return () => { alive = false; };
  }, [ent, fmTick]);
  const fmMap = useMemo(() => (ent && fm.rows ? fmByMa(fm.rows) : null), [ent, fm]);
  const reloadFm = useCallback(() => setFmTick((n) => n + 1), []);

  /* ⚠️ 2026-10-09 (хэрэглэгч: «нэг бүртгэл бүхэлдээ харагдана, filter хэрэггүй»): шүүлтүүр ·
     хураасан хүснэгт ХАСАГДСАН — MA бүр бүтэн карт (толгой + дэлгэрэнгүй + хавсралт). Буцааж бүү нэм. */
  /* ⚠️ Нэг хариу бичгийн дугаар олон удаа илгээгдвэл СҮҮЛИЙНХ л хүчинтэй (`latestPerRespNo`) */
  const rows = useMemo(() => (q.state === 'ready' ? latestPerRespNo(q.data) : []), [q]);

  return (
    <div className={s.wrap}>
      <header className={s.hero}>
        <p className={s.eyebrow}>{tr('Чанар · 1-р шат')}</p>
        <h1>
          {tr('Материал баталгаажуулалт (MA)')}
          {q.state === 'ready' && <span className={s.total}>{rows.length}</span>}
        </h1>
        <p className={s.heroSub}>
          {tr('Survey123-аар бөглөгдсөн MA. Нэг MA = нэг материал, олон ажил. Батлагдаагүй (R эсвэл шийдвэргүй) MA-тай ажил эхлэхгүй.')}
        </p>
        {canAttach && <WorksCsvButton />}
        {!ent && (
          <div className={s.signBox}>
            <p className={s.note}>{tr('FIC · М-акт харах, PDF оруулах, хавсралт нэмэхэд Enterprise-д нэвтэрнэ.')}</p>
            <EntSignIn compact />
          </div>
        )}
        {fm.err && <p className={s.errNote} role="alert">{tr('FIC · М-акт ачаалагдсангүй: {0}', fm.err)}</p>}
      </header>

      {!MA_URL ? (
        <p className={s.failNote}>{tr('MA үйлчилгээ тохируулаагүй (NEXT_PUBLIC_CHANAR_MA_SVC).')}</p>
      ) : q.state === 'loading' ? (
        <div className={s.loading}>{tr('Ачаалж байна…')}</div>
      ) : q.state === 'error' ? (
        <p className={s.failNote} role="alert">
          {friendlyError(q.error)}
          {q.retry && <button type="button" className={s.retryBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
        </p>
      ) : rows.length === 0 ? (
        <p className={s.emptyNote}>{tr('MA бүртгэгдээгүй байна')}</p>
      ) : (
        <div className={s.cards}>
          {mirQ.state === 'error' && (
            <p className={s.failNote} role="alert">
              {tr('MIR ачаалагдсангүй: {0}', friendlyError(mirQ.error))}
              {mirQ.retry && <button type="button" className={s.retryBtn} onClick={mirQ.retry}>{tr('Дахин оролдох')}</button>}
            </p>
          )}
          {rows.map((r) => (
            <MaCard key={r.oid} r={r} mirs={mirMap ? mirMap.get(r.respNo) ?? [] : null}
              fm={fmMap ? fmMap.get(r.respNo) ?? { FIC: [], MAKT: [] } : null}
              canAttach={canAttach} canAuthor={canAuthor} canReview={canReview} me={ent?.user ?? ''} onFmChanged={reloadFm} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SURVEY123-ЫН АЖЛЫН ЖАГСААЛТ ТАТАХ (`lib/maWorks.ts`) — порталын нэвтрэлтээр бөглөх хуудсуудыг
 * уншиж `works.csv` болгоно; хэрэглэгч Connect-ийн `media/`-д хуулж маягтаа дахин нийтэлнэ.
 * ⚠️ Тусдаа токен ХЭРЭГГҮЙ — survey (Enterprise) хаалттай хуудсуудыг (AGOL) өөрөө уншиж чадахгүй тул.
 */
function WorksCsvButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true); setMsg(tr('Бөглөх хуудсуудыг уншиж байна…'));
    try {
      const { buildWorksCsv } = await import('@/lib/maWorks');
      const { csv, count, failed } = await buildWorksCsv((d, t, p) => setMsg(tr('Уншиж байна {0}/{1} · {2}', d, t, p)));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'works.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMsg(tr('works.csv татагдлаа — {0} ажил.', count)
        + (failed.length ? ` ${tr('Уншигдаагүй багц: {0}', failed.join(', '))}` : '')
        + ` ${tr('Survey123 Connect → маягтын хавтас → media/ дотор сольж, дахин Publish хийнэ.')}`);
    } catch (e) {
      setMsg(userError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.toolRow}>
      <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void run(); }}>
        {busy ? tr('Түр хүлээнэ үү…') : tr('Survey123-ын ажлын жагсаалт (works.csv) татах')}
      </button>
      {msg && <span className={s.note}>{msg}</span>}
    </div>
  );
}

function VerdictChip({ v }: { v: Verdict | null }) {
  const cls = v === 'A' ? s.vA : v === 'AN' ? s.vAN : v === 'R' ? s.vR : s.vNone;
  return <span className={`${s.vchip} ${cls}`} title={verdictLabel(v)}>{v ?? '—'}</span>;
}

/** Нэг MA — бүтэн карт: толгой (дугаар · материал · шийдвэр) + бүх талбар + ажлууд + хавсралт */
/**
 * НЭГ MA = НЭГ БҮТЭН ПРОЦЕСС = НЭГ МӨР (2026-10-09, хэрэглэгч: «MIR · FIC · М-акт араас нь (ард талд нь) орно,
 * доор нь харагдаж байгаа нь буруу», «нэг бүтэн процесс нэг мөр»). Зүүнээс баруун тийш:
 *   MA → MIR → FIC → М-акт → IPC — дээд эгнээнд шатны төлөв, доор нь ТЭР шатны агуулга (баганаар).
 * ⚠️ Багана бүр өөрийн шатны доор — MIR-ийг MA-гийн ДООР бүү тавь. Нарийн дэлгэцэд хэвтээ гүйлгэнэ.
 * ⚠️ MIR ачаалагдаж байх үед (`mirs == null`) MIR шат «хүлээгдэж буй» (undefined).
 */
type FmEntry = { FIC: FmRow[]; MAKT: FmRow[] };
type CardProps = {
  r: MaRow; mirs: MirRow[] | null; fm: FmEntry | null;
  canAttach: boolean; canAuthor: boolean; canReview: boolean; me: string; onFmChanged: () => void;
};
type PopKey = StageKey | 'IPC';

/**
 * НЭГ MA = НЭГ БҮТЭН ПРОЦЕСС = НЭГ МӨР (2026-10-09, хэрэглэгч): зөвхөн шатны товчлуурын эгнээ —
 *   MA → MIR → FIC → М-акт → IPC. Шат дээр ДАРАХАД цонх (popup) нээгдэж тэр шатны мэдээлэл гарна.
 * ⚠️ Мэдээллийг мөрөнд дэлгэхгүй (хэрэглэгч: «нэг бүтэн процесс харагдах UI үнэхээр тэнэг») — цонхонд.
 * ⚠️ MIR ачаалагдаж байх үед (`mirs == null`) MIR шат «хүлээгдэж буй»; FIC · М-акт нь Enterprise нэвтрэлттэй үед.
 */
function MaCard({ r, mirs, fm, canAttach, canAuthor, canReview, me, onFmChanged }: CardProps) {
  const [pop, setPop] = useState<PopKey | null>(null);
  const chain = chainOf(r.verdict, {
    MIR: mirs ? mirVerdictFor(mirs) : undefined,
    FIC: fm ? fmVerdictFor(fm.FIC) : undefined,
    MAKT: fm ? fmVerdictFor(fm.MAKT) : undefined,
  });
  const ipc = ipcReady(chain);
  const summary = (k: StageKey): string =>
    k === 'MA' ? `${r.material || '—'} · ${r.respNo || tr('(дугааргүй)')}`
      : k === 'MIR' ? (mirs ? tr('{0} ачаа', mirs.length) : '…')
        : fm ? tr('{0} баримт', (k === 'FIC' ? fm.FIC : fm.MAKT).length) : '—';
  /**
   * ШАТ БҮРИЙН ОГНОО (2026-10-09, хэрэглэгч: «шатлал болгоны огноо харагдах ёстой»):
   *   MA — хариу бичгийн огноо; MIR — сүүлийн үзлэгийн огноо; FIC · М-акт — сүүлийн баримтын огноо
   *   (байхгүй бол оруулсан огноо); IPC — М-акт батлагдсан огноо. Огноогүй бол «—».
   */
  const latest = (xs: (number | null)[]): number | null => xs.reduce<number | null>((m, x) => (x != null && (m == null || x > m) ? x : m), null);
  const fmDate = (rows: FmRow[]) => latest(rows.map((d) => d.docDate ?? d.uploadedAt));
  const dateOf = (k: PopKey): number | null =>
    k === 'MA' ? r.respDate
      : k === 'MIR' ? latest((mirs ?? []).map((m) => m.date))
        : k === 'FIC' ? (fm ? fmDate(fm.FIC) : null)
          : k === 'MAKT' ? (fm ? fmDate(fm.MAKT) : null)
            : (ipc && fm ? latest(fm.MAKT.filter((d) => d.status === 'A' || d.status === 'AN').map((d) => d.decidedAt)) : null);
  const title = (k: PopKey) => (k === 'IPC' ? tr('IPC') : `${stageLabel(k)} — ${r.material || r.respNo}`);

  return (
    <article className={s.card}>
      <div className={s.strip} role="list" aria-label={tr('Чанарын шатлал')}>
        {chain.map((st, i) => (
          <button key={st.key} type="button" role="listitem" onClick={() => setPop(st.key)}
            className={`${s.stage} ${s.stageBtn} ${s[`st_${st.state}`] ?? ''}`}>
            <span className={s.stageNo}>{i + 1}</span>
            <span className={s.stageText}>
              <b>{stageLabel(st.key)}</b>
              <small>{stageStateLabel(st.state)}</small>
              <small className={s.stageSum}>{summary(st.key)}</small>
              <small className={s.stageDate}>{day(dateOf(st.key))}</small>
            </span>
          </button>
        ))}
        <button type="button" role="listitem" onClick={() => setPop('IPC')}
          className={`${s.stage} ${s.stageBtn} ${ipc ? s.st_done : s.st_locked}`}>
          <span className={s.stageNo}>₮</span>
          <span className={s.stageText}><b>{tr('IPC')}</b><small>{ipc ? tr('Олгож болно') : tr('Олгохгүй')}</small><small className={s.stageDate}>{day(dateOf('IPC'))}</small></span>
        </button>
      </div>

      {pop && (
        <Modal title={title(pop)} onClose={() => setPop(null)}>
          {pop === 'MA' ? <MaPop r={r} canAttach={canAttach} />
            : pop === 'MIR' ? <MirList mirs={mirs} />
              : pop === 'FIC' || pop === 'MAKT' ? (
                <FmColumn kind={pop === 'FIC' ? 'FIC' : 'MAKT'} maNo={r.respNo} state={chain[pop === 'FIC' ? 2 : 3].state}
                  rows={fm ? fm[pop === 'FIC' ? 'FIC' : 'MAKT'] : null}
                  canAuthor={canAuthor} canReview={canReview} me={me} onChanged={onFmChanged} />
              ) : (
                <p className={s.note}>{ipc ? tr('Дөрвөн шат батлагдсан — IPC олгож болно.') : tr('Дөрвөн шат бүгд батлагдахаас өмнө IPC олгохгүй.')}</p>
              )}
        </Modal>
      )}
    </article>
  );
}

/**
 * ЦОНХ (popup) — Esc / ар тал дарж хаана, фокус дотроо (`useFocusTrap`).
 * ⚠️ Ар талын товшилт зөвхөн ар тал дээр ЭХЭЛСЭН бол хаана — цонх доторх сонголт чирэхэд хаагдахгүй.
 */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const downOnBack = useRef(false);
  useFocusTrap(ref, true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={s.overlay} role="presentation"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBack.current && e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={s.modal} role="dialog" aria-modal="true" aria-label={title}>
        <header className={s.modalHead}>
          <h2 className={s.modalTitle}>{title}</h2>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
        </header>
        <div className={s.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/** «Мэдээлэл» ↔ «Баримт» сэлгэгч — баримт нь цаасан маягттай ЯГ ижил A4 (`chanarSheets`), хэвлэнэ */
function DocSwitch({ info, sheet }: { info: React.ReactNode; sheet: () => Promise<string> | string }) {
  const [mode, setMode] = useState<'info' | 'doc'>('info');
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const showDoc = async () => {
    setMode('doc'); setErr('');
    if (html) return;
    try { setHtml(await sheet()); } catch (e) { setErr(userError(e)); }
  };
  return (
    <div className={s.block}>
      <div className={s.seg} role="group" aria-label={tr('Харагдац')}>
        <button type="button" className={s.segBtn} aria-pressed={mode === 'info'} onClick={() => setMode('info')}>{tr('Мэдээлэл')}</button>
        <button type="button" className={s.segBtn} aria-pressed={mode === 'doc'} onClick={() => { void showDoc(); }}>{tr('Баримт (PDF)')}</button>
      </div>
      {mode === 'info' ? info : (
        <div className={s.block}>
          {html && (
            <div className={s.toolRow}>
              <button type="button" className={s.ghostBtn} onClick={() => printHtml(html)}>{tr('Хэвлэх / PDF хадгалах')}</button>
              <span className={s.note}>{tr('Хэвлэх цонхонд «Save as PDF» сонгож PDF болгоно.')}</span>
            </div>
          )}
          {err ? <p className={s.errNote} role="alert">{err}</p>
            : html ? <iframe className={s.sheet} srcDoc={html} title={tr('Баримт')} />
              : <p className={s.note}>{tr('Ачаалж байна…')}</p>}
        </div>
      )}
    </div>
  );
}

const logoUrl = () => `${window.location.origin}/logo.svg`;

function MaPop({ r, canAttach }: { r: MaRow; canAttach: boolean }) {
  return (
    <DocSwitch
      info={<MaDetail r={r} canAttach={canAttach} />}
      sheet={() => maSheetHtml(r, logoUrl())} />
  );
}

/**
 * FIC / М-АКТ БАГАНА — баримтын жагсаалт (PDF нээх · батлах/буцаах) + PDF оруулах.
 * ⚠️ Өмнөх шат батлагдаагүй (`locked`) бол оруулах ХААЛТТАЙ — хатуу дараалал (хэрэглэгчийн шийдвэр).
 * ⚠️ Оруулах — `chanarAuthor`; батлах — `chanarReview`, өөрийн оруулсныг БИШ.
 * ⚠️ 2026-10-09 (аудит №6): энд зөвхөн ТОВЧ нуух — эрх · багцын хүрээ · `locked` гинж · `pending` төлөвийг
 *    `ficMakt.addFm`/`decideFm` СЕРВЕРИЙН өгөгдлөөр дахин шалгаж, `tr()`-тэй алдаа шиднэ (`userError`-оор гарна).
 */
function FmColumn({ kind, maNo, state, rows, canAuthor, canReview, me, onChanged }: {
  kind: FmKind; maNo: string; state: string; rows: FmRow[] | null;
  canAuthor: boolean; canReview: boolean; me: string; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = state === 'locked';

  if (rows == null) return <p className={s.note}>{locked ? tr('Өмнөх шат батлагдсаны дараа нээгдэнэ.') : tr('Enterprise-д нэвтэрч харна.')}</p>;

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr(tr('PDF файл сонгоно уу.')); return; }
    setBusy(true); setErr('');
    try {
      const { warn } = await addFm({ kind, maNo, docNo: docNo.trim(), docDate: date, file: f });
      setDocNo(''); setDate(''); if (fileRef.current) fileRef.current.value = '';
      if (warn) setErr(warn);
      onChanged();
    } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };
  const decide = async (row: FmRow, v: Verdict) => {
    setBusy(true); setErr('');
    try { await decideFm(row, v, reason[row.oid] ?? ''); onChanged(); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };
  const open = async (row: FmRow) => {
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await entPdfBlob(row.pdfItem));
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { w?.close(); setErr(userError(e)); }
  };

  return (
    <div className={s.block}>
      {rows.length === 0 ? (
        <p className={s.note}>{locked ? tr('Өмнөх шат батлагдсаны дараа нээгдэнэ.') : kind === 'FIC'
          ? tr('Ажлын явцын үзлэг — PDF хавсаргаж батална.') : tr('Ажил дууссаныг шалгах эцсийн акт — PDF хавсаргаж батална.')}</p>
      ) : rows.map((d) => {
        const mine = !!me && d.uploadedBy.toLowerCase() === me.toLowerCase();
        const st = d.status === 'pending' ? 'pending' : d.status === 'R' ? 'rejected' : 'done';
        return (
          <div key={d.oid} className={`${s.mir} ${s[`st_${st}`] ?? ''}`}>
            <div className={s.mirHead}>
              <button type="button" className={s.rowBtn} onClick={() => { void open(d); }} title={d.pdfName}>
                {d.docNo || d.pdfName || tr('(дугааргүй)')}
              </button>
              {d.status === 'pending' ? <span className={`${s.vchip} ${s.vNone}`}>…</span> : <VerdictChip v={d.status} />}
            </div>
            <span className={s.cardNo}>{day(d.docDate)} · {d.uploadedBy}</span>
            {d.status !== 'pending' && <span className={s.cardNo}>{tr('Шийдвэрлэсэн: {0} · {1}', d.decidedBy, day(d.decidedAt))}</span>}
            {d.reason && <p className={s.pre}>{d.reason}</p>}
            {d.status === 'pending' && canReview && !mine && (
              <div className={s.addForm}>
                <input className={s.input} value={reason[d.oid] ?? ''} onChange={(e) => setReason((m) => ({ ...m, [d.oid]: e.target.value }))}
                  placeholder={tr('Санал / буцаах шалтгаан')} disabled={busy} maxLength={FM_REASON_MAX} />
                <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void decide(d, 'A'); }}>A</button>
                <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void decide(d, 'AN'); }}>AN</button>
                <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void decide(d, 'R'); }}>R</button>
              </div>
            )}
            {d.status === 'pending' && mine && <span className={s.note}>{tr('Өөр хянагч батална.')}</span>}
          </div>
        );
      })}
      {canAuthor && !locked && (
        <div className={s.addForm}>
          <input className={s.input} value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder={tr('Баримтын дугаар')} disabled={busy} maxLength={60} />
          <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} aria-label={tr('Огноо')} />
          <input ref={fileRef} className={s.file} type="file" accept="application/pdf,.pdf" disabled={busy} />
          <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void upload(); }}>
            {busy ? tr('Түр хүлээнэ үү…') : kind === 'FIC' ? tr('FIC PDF оруулах') : tr('М-акт PDF оруулах')}
          </button>
        </div>
      )}
      {err && <p className={s.errNote} role="alert">{err}</p>}
    </div>
  );
}

function MaDetail({ r, canAttach }: { r: MaRow; canAttach: boolean }) {
  return (
    <div className={s.detail}>
      <dl className={s.kv}>
        <dt>{tr('Багц')}</dt><dd>{r.pkgLabel || '—'}</dd>
        <dt>{tr('Гүйцэтгэгч')}</dt><dd>{r.contractor || '—'}</dd>
        <dt>{tr('Гүйцэтгэгчийн баримт №')}</dt><dd>{r.subDocNo || '—'}</dd>
        <dt>{tr('Захиалагчид ирсэн')}</dt><dd>{day(r.recvDate)}</dd>
        <dt>{tr('Шийдвэр')}</dt><dd>{verdictLabel(r.verdict)}</dd>
        {r.anNote && (<><dt>{tr('AN санал')}</dt><dd className={s.pre}>{r.anNote}</dd></>)}
        {r.rReason && (<><dt>{tr('R шалтгаан')}</dt><dd className={s.pre}>{r.rReason}</dd></>)}
        <dt>{tr('Зөвшөөрсөн')}</dt><dd>{r.apprName || '—'}</dd>
        <dt>{tr('Боловсруулсан')}</dt><dd>{r.prepName || '—'}</dd>
      </dl>
      <div className={s.block}>
        <h3 className={s.h3}>{tr('Хамаарах ажлууд ({0})', r.works.length)}</h3>
        {r.works.length ? (
          <div className={s.chips}>{r.works.map((w) => <span key={w} className={s.chip}>{w}</span>)}</div>
        ) : <p className={s.note}>{tr('Ажил сонгогдоогүй — энэ MA ямар ч ажилд хамаарахгүй.')}</p>}
      </div>
      <MaAttachments oid={r.oid} canAttach={canAttach} />
    </div>
  );
}

/**
 * ХАВСРАЛТ — жагсаалт · нээх · нэмэх · устгах.
 * ⚠️ Нээх нь токентой POST → Blob → objectURL (токен URL-д орохгүй); шинэ таб-д.
 * ⚠️ Давхарга хавсралт идэвхгүй бол (`hasAttachments:false`) нэмэх товч гаргахгүй, шалтгааныг хэлнэ.
 */
function MaAttachments({ oid, canAttach }: { oid: number; canAttach: boolean }) {
  const sess = useEntSession();
  const [list, setList] = useState<MaAtt[] | null>(null);
  const [hasAtt, setHasAtt] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<AttType>('conf');
  const [title, setTitle] = useState('');
  const [no, setNo] = useState('');
  const [std, setStd] = useState('');
  const [valid, setValid] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setErr('');
    try {
      const h = await maHasAttachments();
      setList(h ? await listMaAtts(oid) : []); setHasAtt(h);
    } catch (e) {
      setList([]); setErr(userError(e));
    }
  }, [oid]);
  /* Анхны ачаалт — setState зөвхөн promise-ийн дотор (`react-hooks/set-state-in-effect`); дараагийн
     шинэчлэл үйлдлийн дараа `reload`-оор */
  useEffect(() => {
    let alive = true;
    /* ⚠️ Давхаргад хавсралт идэвхгүй бол `/attachments` алдаа өгдөг — эхлээд шалгаад тэр үед жагсаалт татахгүй */
    maHasAttachments()
      .then(async (h) => { const l = h ? await listMaAtts(oid) : []; if (alive) { setList(l); setHasAtt(h); } })
      .catch((e) => { if (alive) { setList([]); setErr(userError(e)); } });
    return () => { alive = false; };
  }, [oid]);

  const certLike = type === 'conf' || type === 'lab' || type === 'qual';

  const upload = async () => {
    const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
    if (!files.length) { setErr(tr('Файл сонгоно уу.')); return; }
    setBusy(true); setErr('');
    const errs: string[] = [];
    for (const f of files) {
      try {
        await addMaAtt(oid, f, { type, title: title || undefined, no: certLike ? no : undefined, std: certLike ? std : undefined, valid: type === 'conf' || type === 'qual' ? valid : undefined });
      } catch (e) { errs.push(`${f.name}: ${userError(e)}`); }
    }
    if (fileRef.current) fileRef.current.value = '';
    setTitle(''); setNo(''); setStd(''); setValid('');
    await reload();
    if (errs.length) setErr(errs.join('\n'));
    setBusy(false);
  };

  const remove = async (a: MaAtt) => {
    if (!window.confirm(tr('«{0}» хавсралтыг устгах уу?', a.name))) return;
    setBusy(true); setErr('');
    try { await deleteMaAtt(oid, a.id); await reload(); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const openAtt = async (a: MaAtt) => {
    /* ⚠️ Попап хаагдахаас сэргийлж цонхыг товшилтын агшинд нээгээд дараа нь хаягийг тавина */
    const w = window.open('', '_blank');
    try {
      const b = await maAttBlob(oid, a.id);
      const url = URL.createObjectURL(b);
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      w?.close();
      setErr(userError(e));
    }
  };

  return (
    <div className={s.block}>
      <h3 className={s.h3}>{tr('Хавсралт')}{list ? ` (${list.length})` : ''}</h3>
      {list == null ? <p className={s.note}>{tr('Ачаалж байна…')}</p> : list.length === 0 ? (
        <p className={s.note}>{tr('Хавсралт алга.')}</p>
      ) : (
        <ul className={s.attList}>
          {list.map((a) => {
            const exp = isExpired(a.meta.valid);
            return (
              <li key={a.id} className={s.att}>
                <button type="button" className={s.attOpen} onClick={() => { void openAtt(a); }} title={tr('Нээх')}>
                  <b>{attTypeLabel(a.meta.type)}</b>
                  <span>{a.meta.title || a.name}</span>
                </button>
                <span className={s.attMeta}>
                  {[a.meta.no && `№ ${a.meta.no}`, a.meta.std, kb(a.size)].filter(Boolean).join(' · ')}
                  {a.meta.valid && (
                    <span className={exp ? s.expired : s.valid}>
                      {exp ? tr('хугацаа дууссан {0}', a.meta.valid) : tr('хүчинтэй {0} хүртэл', a.meta.valid)}
                    </span>
                  )}
                </span>
                {canAttach && sess && (
                  <button type="button" className={s.chipX} disabled={busy} onClick={() => { void remove(a); }} aria-label={tr('Устгах')}>✕</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canAttach && (
        hasAtt === false ? (
          <p className={s.failNote}>{tr('Энэ MA давхаргад хавсралт идэвхгүй — геопорталын item → Settings → «Enable attachments»-ыг асаана уу.')}</p>
        ) : !sess ? (
          <div className={s.signBox}>
            <p className={s.note}>{tr('Хавсралт нэмэхийн тулд Enterprise-д нэвтэрнэ.')}</p>
            <EntSignIn compact />
          </div>
        ) : (
          <div className={s.addForm}>
            <select className={s.select} value={type} onChange={(e) => setType(e.target.value as AttType)} aria-label={tr('Төрөл')} disabled={busy}>
              {ATT_TYPES.map((t) => <option key={t} value={t}>{attTypeLabel(t)}</option>)}
            </select>
            <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Нэр / тайлбар')} disabled={busy} />
            {certLike && (
              <>
                <input className={s.input} value={no} onChange={(e) => setNo(e.target.value)} placeholder={tr('Гэрчилгээ / протоколын №')} disabled={busy} />
                <input className={s.input} value={std} onChange={(e) => setStd(e.target.value)} placeholder={tr('Стандарт (MNS … / GB … / EN …)')} disabled={busy} />
              </>
            )}
            {(type === 'conf' || type === 'qual') && (
              <label className={s.dateLbl}>
                {tr('Хүчинтэй хугацаа')}
                <input className={s.input} type="date" value={valid} onChange={(e) => setValid(e.target.value)} disabled={busy} />
              </label>
            )}
            <input ref={fileRef} className={s.file} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple disabled={busy} />
            <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void upload(); }}>
              {busy ? tr('Түр хүлээнэ үү…') : tr('Хавсаргах')}
            </button>
          </div>
        )
      )}
      {err && <p className={s.errNote} role="alert">{err}</p>}
    </div>
  );
}

/**
 * MIR ЖАГСААЛТ — MA-гийн доор (2-р шат). MIR бүр = талбайд ирсэн нэг ачааны үзлэг.
 * ⚠️ Бүтэн харагдана (хураалтгүй — MA картын дүрэм); зураг дарж ачаална (олон хүсэлтээс сэргийлж).
 */
function MirList({ mirs }: { mirs: MirRow[] | null }) {
  if (mirs == null) return null;
  return (
    <div className={s.mirBox}>
      <span className={s.cardNo}>{tr('{0} ачаа', mirs.length)}</span>
      {mirs.length === 0 ? (
        <p className={s.note}>{tr('Энэ MA-д MIR бүртгэгдээгүй — материал талбайд ирэхэд Survey123-аар бөглөнө.')}</p>
      ) : mirs.map((m) => <MirItem key={m.oid} m={m} />)}
    </div>
  );
}

function MirItem({ m }: { m: MirRow }) {
  const st = mirState(m);
  /* ⚠️ Баримтын хуудсанд зураг — blob objectURL (цонх хаагдахад `MirSheetUrls` санах ойг чөлөөлнө) */
  const sheet = async () => {
    const photos = await loadMirPhotos(m.rowId);
    const list: { url: string; note: string }[] = [];
    for (const ph of photos) {
      try { list.push({ url: trackUrl(URL.createObjectURL(await mirPhotoBlob(ph))), note: ph.note }); } catch { /* тэр зураг алгасна */ }
    }
    return mirSheetHtml(m, logoUrl(), list);
  };
  return <DocSwitch info={<MirInfo m={m} st={st} />} sheet={sheet} />;
}

/* objectURL-уудыг хуудаснаас гарахад чөлөөлнө (цонх бүрийн iframe/print цонх хэрэглэсний дараа) */
const liveUrls = new Set<string>();
const trackUrl = (u: string) => { liveUrls.add(u); return u; };
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { for (const u of liveUrls) URL.revokeObjectURL(u); liveUrls.clear(); });

function MirInfo({ m, st }: { m: MirRow; st: string }) {
  return (
    <div className={`${s.mir} ${s[`st_${st}`] ?? ''}`}>
      <div className={s.mirHead}>
        <b>{m.docNo || tr('(дугааргүй)')}</b>
        <span className={s.cardNo}>{day(m.date)}{m.building ? ` · ${m.building}` : ''}{m.qty != null ? ` · ${m.qty} ${m.unit}` : ''}</span>
        <VerdictChip v={m.verdict} />
        {m.xCount > 0 && <span className={s.expired}>{tr('«X» {0}', m.xCount)}</span>}
      </div>
      <table className={s.chk}>
        <thead><tr><th>{tr('Шалгах')}</th><th>{tr('Гүйцэтгэгч')}</th><th>{tr('Захиалагч')}</th></tr></thead>
        <tbody>
          {m.checks.map(([con, cli], i) => (
            <tr key={i}>
              <td>{i + 1}. {mirCheckLabel(i)}</td>
              <td className={con === 'X' ? s.expired : ''}>{markLabel(con)}</td>
              <td className={cli === 'X' ? s.expired : ''}>{markLabel(cli)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.remarks && <p className={s.pre}><b>{tr('Тайлбар')}:</b> {m.remarks}</p>}
      <p className={s.note}>
        {[m.conQ && tr('Гүйцэтгэгчийн чанарын инженер: {0}', m.conQ), m.cliSup && tr('Хяналтын инженер: {0}', m.cliSup), m.cliQ && tr('Захиалагчийн чанарын инженер: {0}', m.cliQ)].filter(Boolean).join(' · ')}
      </p>
      <MirPhotos rowId={m.rowId} />
    </div>
  );
}

function MirPhotos({ rowId }: { rowId: string }) {
  const [list, setList] = useState<MirPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => {
    setBusy(true); setErr('');
    try { setList(await loadMirPhotos(rowId)); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };
  const open = async (p: MirPhoto) => {
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await mirPhotoBlob(p));
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { w?.close(); setErr(userError(e)); }
  };
  return (
    <div className={s.block}>
      {list == null ? (
        <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void load(); }}>
          {busy ? tr('Түр хүлээнэ үү…') : tr('Зургууд харах')}
        </button>
      ) : list.length === 0 ? <p className={s.note}>{tr('Зураг алга.')}</p> : (
        <div className={s.chips}>
          {list.map((p) => (
            <button key={`${p.rowOid}:${p.attId}`} type="button" className={s.ghostBtn} onClick={() => { void open(p); }} title={p.name}>
              {p.note || p.name}
            </button>
          ))}
        </div>
      )}
      {err && <p className={s.errNote} role="alert">{err}</p>}
    </div>
  );
}
