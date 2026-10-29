'use client';

/**
 * «MA — МАТЕРИАЛ БАТАЛГААЖУУЛАЛТ» (2026-10-09) — Чанарын 4 шатны (MA → MIR → FIC → М-акт)
 * ЭХНИЙ шат. Хуучин «Чанарын баримт» (`Chanar.tsx`)-аас ТУСДАА шинэ сэдэв (хэрэглэгч:
 * «одоо системд байгаа чанар, чанарын баримтаас гадна шинээр сэдэв болгон хий»).
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { askConfirm } from '@/lib/confirm';
import { useAsync } from '@/lib/useAsync';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { isAuthorFor, reviewerRolesFor, subscribeChanarAcl } from '@/lib/chanarAcl';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { fixCyr } from '@/lib/format';
import {
  ATT_TYPES, MA_URL, addMaAtt, attTypeLabel, chainOf, deleteMaAtt, ipcReady, isExpired, latestPerRespNo, listMaAtts, loadMa, type StageKey,
  maAttBlob, resubmitLinks, stageLabel, stageStateLabel, verdictLabel, type AttMeta, type AttType, type MaAtt, type MaRow, type Verdict,
  type ResubLink,
} from '@/lib/ma';
import { addFm, decideFm, fmByMa, fmVerdictFor, loadFm, FM_REASON_MAX, type FmKind, type FmRow } from '@/lib/ficMakt';
import { entPdfBlob } from '@/lib/entDocs';
import {
  addMirAtt, deleteMirAtt, listMirAtts, loadMir, loadMirPhotos, markLabel, mirCheckLabel, mirPhotoBlob, mirState, mirsByMa, mirVerdictFor,
  type MirPhoto, type MirRow,
} from '@/lib/mir';
import { maSheetHtml, mirSheetHtml, printHtml } from '@/lib/chanarSheets';
import { syncNoots } from '@/lib/materialNoots';
import { navDirtyLabels } from '@/lib/navGuard';
import { AjilMatTab, NootsTab, type NootsSync } from './MaMaterial';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useSyncRef } from '@/lib/useSyncRef';
import { useAuth } from '@/components/AuthGate';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { friendlyError, userError, Loading } from '@/components/ui';
import { Segmented } from '@/components/Switch';
import s from './ma.module.css';


const day = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleDateString('sv-SE'));
const kb = (n: number | null) =>
  n == null ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
/** FIC · М-акт баримтын харагдах нэр */
const d0 = (d: FmRow) => d.docNo || d.pdfName || tr('(дугааргүй)');

export function Ma() {
  const q = useAsync(loadMa, []);
  const mirQ = useAsync(loadMir, []);
  const mirMap = useMemo(() => (mirQ.state === 'ready' ? mirsByMa(mirQ.data) : null), [mirQ]);
  const { user, status } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const [chN, setChN] = useState(0);
  useEffect(() => subscribeChanarAcl(() => setChN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио (`BagtsHamaaral`-тай ижил)
  const canAttach = useMemo(() => hasCap(user?.username, 'chanarAuthor') || hasCap(user?.username, 'chanarReview'), [user, capN]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио
  const canAuthor = useMemo(() => hasCap(user?.username, 'chanarAuthor'), [user, capN]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио
  const canReview = useMemo(() => hasCap(user?.username, 'chanarReview'), [user, capN]);
  const attachFor = useCallback((pkgKey: string): boolean => {
    if (!canAttach) return false;
    if (status === 'off') return true;
    const me = user?.username;
    const bagts = PKGS.find((p) => p.key === pkgKey)?.group;
    if (!bagts) return false;
    return (canAuthor && isAuthorFor(me, bagts)) || (canReview && reviewerRolesFor(me, bagts).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chN` нь хуваарилалт өөрчлөгдсөн дохио
  }, [canAttach, canAuthor, canReview, status, user, chN]);
  const fmAuthorFor = useCallback((pkgKey: string): boolean => {
    if (!canAuthor) return false;
    if (status === 'off') return true;
    const bagts = PKGS.find((p) => p.key === pkgKey)?.group;
    return !!bagts && isAuthorFor(user?.username, bagts);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chN` нь хуваарилалт өөрчлөгдсөн дохио
  }, [canAuthor, status, user, chN]);
  const fmReviewFor = useCallback((pkgKey: string): boolean => {
    if (!canReview) return false;
    if (status === 'off') return true;
    const bagts = PKGS.find((p) => p.key === pkgKey)?.group;
    return !!bagts && reviewerRolesFor(user?.username, bagts).length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chN` нь хуваарилалт өөрчлөгдсөн дохио
  }, [canReview, status, user, chN]);

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
  const fmWhy = !ent ? tr('Нэвтэрч харна') : fm.rows ? '' : fm.err ? tr('Ачаалагдсангүй') : tr('Ачаалж байна…');
  const mirWhy = mirQ.state === 'ready' ? '' : mirQ.state === 'error' ? tr('Ачаалагдсангүй') : tr('Ачаалж байна…');

  const rows = useMemo(() => (q.state === 'ready' ? latestPerRespNo(q.data) : []), [q]);
  const links = useMemo(() => resubmitLinks(rows), [rows]);
  /* Нэг хариу бичгийн дугаартай илгээлтийн тоо — >1 бол картан дээр анхааруулна (автомат дугаар зэрэг олгогдсон · давхар илгээлт) */
  const dups = useMemo(() => {
    const m = new Map<string, number>();
    if (q.state === 'ready') for (const r of q.data) if (r.respNo) m.set(r.respNo, (m.get(r.respNo) ?? 0) + 1);
    return m;
  }, [q]);
  const ordered = useMemo(() => {
    const out: MaRow[] = [];
    for (const r of rows) {
      if (links.get(r.oid)?.next) continue; // шинэ хувилбарынхаа доор орно
      out.push(r);
      for (let p = links.get(r.oid)?.prev; p; p = links.get(p.oid)?.prev) out.push(p);
    }
    return out;
  }, [rows, links]);

  const [tab, setTab] = useState<'chain' | 'noots' | 'ajil'>('chain');
  const goTab = async (t: 'chain' | 'noots' | 'ajil') => {
    if (t !== tab) {
      const labels = navDirtyLabels();
      if (labels.length && !(await askConfirm(
        tr('{0}: хадгалаагүй засвар байна. Гарвал алдагдана. Гарах уу?', labels.join(' · ')),
        { danger: true, ok: tr('Хаяад гарах') },
      ))) return;
    }
    setTab(t);
  };
  const [nootsTick, setNootsTick] = useState(0);
  const [sync, setSync] = useState<NootsSync>({ state: 'idle' });
  const canSync = canAttach && q.state === 'ready' && mirQ.state === 'ready' && sync.state !== 'disabled';
  const runSync = useCallback(() => {
    if (q.state !== 'ready' || mirQ.state !== 'ready') return;
    setSync({ state: 'running' });
    Promise.all([loadMa(), loadMir()])
      .then(([ma, mir]) => syncNoots(ma, mir))
      .then((res) => setSync(res.disabled ? { state: 'disabled', reason: res.disabled } : { state: 'done', res }))
      .catch((e) => setSync({ state: 'error', error: userError(e) }))
      .finally(() => setNootsTick((n) => n + 1));
  }, [q, mirQ]);
  const autoRan = useRef(false);
  useEffect(() => {
    if (!canSync || autoRan.current) return;
    autoRan.current = true;
    /* setState нь promise дотор л (`react-hooks/set-state-in-effect`) — эхлэлийн «running»-ийг микро даалгаварт */
    void Promise.resolve().then(runSync);
  }, [canSync, runSync]);

  return (
    <div className={s.wrap}>
      <header className={s.hero}>
        <p className={s.eyebrow}>{tr('Чанар · 1-р шат')}</p>
        <h1>
          {tr('Материал баталгаажуулалт (MA)')}
          {q.state === 'ready' && <span className={s.total}>{rows.length}</span>}
        </h1>
        <p className={s.heroSub}>
          {tr('Survey123-аар бөглөгдсөн MA. Нэг MA = нэг материал, олон ажил. Батлагдаагүй (R эсвэл шийдвэргүй) MA-тай ажилд бөглөх хуудсанд гүйцэтгэл бичигдэхгүй.')}
        </p>
        {canAttach && <WorksCsvButton />}
        {!ent && (
          <div className={s.signBox}>
            <p className={s.note}>{tr('FIC · М-акт ба хавсралт геопорталд (gis.selbecity.mn) хадгалагддаг тул тэдгээрийг харах, оруулахад геопорталын дансаар нэвтэрнэ. MA · MIR порталын нэвтрэлтээр харагдана.')}</p>
            <EntSignIn compact />
          </div>
        )}
        <div className={s.tabs}>
          <Segmented value={tab} onChange={(t) => { void goTab(t); }} label={tr('Харагдац')}
            options={[
              { value: 'chain', label: tr('Баталгаажуулалт') },
              { value: 'noots', label: tr('Материалын нөөц') },
              { value: 'ajil', label: tr('Ажлын материал') },
            ]} />
        </div>
        {sync.state === 'disabled' && (
          <p className={s.failNote} role="status">{tr('Материалын нөөцийн автомат бүртгэл идэвхгүй: {0}', sync.reason)}</p>
        )}
        {ent && fm.err && (
          <p className={s.errNote} role="alert">
            {tr('FIC · М-акт ачаалагдсангүй: {0}', fm.err)}
            <button type="button" className={s.retryBtn} onClick={reloadFm}>{tr('Дахин оролдох')}</button>
          </p>
        )}
      </header>

      {tab === 'noots' ? (
        <NootsTab tick={nootsTick} sync={sync} onSync={canSync ? runSync : null} />
      ) : tab === 'ajil' ? (
        <AjilMatTab tick={nootsTick} />
      ) : !MA_URL ? (
        <p className={s.failNote}>{tr('MA үйлчилгээ тохируулаагүй.')}</p>
      ) : q.state === 'loading' ? (
        <Loading />
      ) : q.state === 'error' ? (
        <p className={s.failNote} role="alert">
          {friendlyError(q.error)}
          {q.retry && <button type="button" className={s.retryBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
        </p>
      ) : rows.length === 0 ? (
        <p className={s.emptyNote}>{tr('MA бүртгэгдээгүй байна')} — {tr('Survey123-ын MA маягтаар бөглөгдөхөд энд автоматаар гарна.')}</p>
      ) : (
        <div className={s.cards}>
          {mirQ.state === 'error' && (
            <p className={s.failNote} role="alert">
              {tr('MIR ачаалагдсангүй: {0}', friendlyError(mirQ.error))}
              {mirQ.retry && <button type="button" className={s.retryBtn} onClick={mirQ.retry}>{tr('Дахин оролдох')}</button>}
            </p>
          )}
          {ordered.map((r) => (
            <MaCard key={r.oid} r={r} mirs={mirMap ? mirMap.get(r.respNo) ?? [] : null}
              fm={fmMap ? fmMap.get(r.respNo) ?? { FIC: [], MAKT: [] } : null}
              link={links.get(r.oid)} mirWhy={mirWhy} fmWhy={fmWhy} dupN={dups.get(r.respNo) ?? 0}
              canAttach={attachFor(r.pkg)} canAuthor={fmAuthorFor(r.pkg)} canReview={fmReviewFor(r.pkg)}
              me={[user?.username ?? '', ent?.user ?? '']} onFmChanged={reloadFm}
              fmErr={ent ? fm.err : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SURVEY123-ЫН АЖЛЫН ЖАГСААЛТ ТАТАХ (`lib/maWorks.ts`) — порталын нэвтрэлтээр бөглөх хуудсуудыг
 * уншиж `works.csv` болгоно; хэрэглэгч Connect-ийн `media/`-д хуулж маягтаа дахин нийтэлнэ.
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
 */
type FmEntry = { FIC: FmRow[]; MAKT: FmRow[] };
type CardProps = {
  r: MaRow; mirs: MirRow[] | null; fm: FmEntry | null;
  canAttach: boolean; canAuthor: boolean; canReview: boolean; me: readonly string[]; onFmChanged: () => void;
  fmErr: string;
  link?: ResubLink;
  mirWhy: string; fmWhy: string;
  /** Энэ дугаартай илгээлтийн тоо (`latestPerRespNo` сүүлийнхийг л харуулдаг) */
  dupN?: number;
};
type PopKey = StageKey | 'IPC';

/**
 * НЭГ MA = НЭГ БҮТЭН ПРОЦЕСС = НЭГ МӨР (2026-10-09, хэрэглэгч): зөвхөн шатны товчлуурын эгнээ —
 *   MA → MIR → FIC → М-акт → IPC. Шат дээр ДАРАХАД цонх (popup) нээгдэж тэр шатны мэдээлэл гарна.
 */
function MaCard({ r, mirs, fm, canAttach, canAuthor, canReview, me, onFmChanged, fmErr, link, mirWhy, fmWhy, dupN = 0 }: CardProps) {
  const [pop, setPop] = useState<PopKey | null>(null);
  const chain = chainOf(r.verdict, {
    MIR: mirs ? mirVerdictFor(mirs) : undefined,
    FIC: fm ? fmVerdictFor(fm.FIC) : undefined,
    MAKT: fm ? fmVerdictFor(fm.MAKT) : undefined,
  });
  const ipc = ipcReady(chain);
  const unk = new Map<StageKey, string>();
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const own = chain[i].key === 'MIR' ? (mirs == null ? mirWhy : '') : (fm == null ? fmWhy : '');
    const inherited = unk.get(prev.key);
    if (inherited) unk.set(chain[i].key, inherited);
    else if (prev.state === 'done' && own) unk.set(chain[i].key, own);
  }
  const ipcWhy = unk.size ? [...unk.values()][0] : '';
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
    <article className={`${s.card} ${link?.next ? s.cardOld : ''}`}>
      {link?.next && (
        <p className={s.resubNote}>{tr('Буцаасан — засаж дахин ирүүлсэн: MA {0} (дээрх карт).', link.next.respNo || tr('(дугааргүй)'))}</p>
      )}
      {link?.prev && (
        <p className={s.resubNote}>{tr('Дахин ирүүлсэн — өмнөх MA {0}-г буцаасан (доорх карт).', link.prev.respNo || tr('(дугааргүй)'))}</p>
      )}
      {dupN > 1 && (
        <p className={s.failNote} role="status">
          {tr('«{0}» дугаартай {1} илгээлт байна — сүүлийнх нь харагдаж байна. Давхар дугаар (хоёр хүн зэрэг бөглөсөн) эсвэл засвар эсэхийг шалгана уу.', r.respNo, dupN)}
        </p>
      )}
      <div className={s.strip} role="group" aria-label={tr('Чанарын шатлал')}>
        {chain.map((st, i) => (
          <button key={st.key} type="button" onClick={() => setPop(st.key)}
            className={`${s.stage} ${s.stageBtn} ${unk.has(st.key) ? '' : s[`st_${st.state}`] ?? ''}`}>
            <span className={s.stageNo}>{i + 1}</span>
            <span className={s.stageText}>
              <b>{stageLabel(st.key)}</b>
              <small>{unk.get(st.key) ?? stageStateLabel(st.state)}</small>
              <small className={s.stageSum}>{summary(st.key)}</small>
              <small className={s.stageDate}>{day(dateOf(st.key))}</small>
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setPop('IPC')}
          className={`${s.stage} ${s.stageBtn} ${ipc ? s.st_done : ipcWhy ? '' : s.st_locked}`}>
          <span className={s.stageNo}>₮</span>
          <span className={s.stageText}><b>{tr('IPC')}</b><small>{ipc ? tr('Олгож болно') : ipcWhy || tr('Олгохгүй')}</small><small className={s.stageDate}>{day(dateOf('IPC'))}</small></span>
        </button>
      </div>

      {pop && (
        <Modal title={title(pop)} onClose={() => setPop(null)}>
          {pop === 'MA' ? <MaPop r={r} canAttach={canAttach} />
            : pop === 'MIR' ? <MirList mirs={mirs} canAttach={canAttach} />
              : pop === 'FIC' || pop === 'MAKT' ? (
                <FmColumn kind={pop === 'FIC' ? 'FIC' : 'MAKT'} maNo={r.respNo}
                  state={unk.has(pop) ? 'next' : chain[pop === 'FIC' ? 2 : 3].state}
                  rows={fm ? fm[pop === 'FIC' ? 'FIC' : 'MAKT'] : null}
                  canAuthor={canAuthor} canReview={canReview} me={me} onChanged={onFmChanged} loadErr={fmErr} />
              ) : (
                <p className={s.note}>{ipc ? tr('Дөрвөн шат батлагдсан — IPC олгож болно.')
                  : ipcWhy ? tr('Шатны төлөв бүрэн уншигдаагүй ({0}) — IPC олгох эсэх одоохондоо тодорхойгүй.', ipcWhy)
                    : tr('Дөрвөн шат бүгд батлагдахаас өмнө IPC олгохгүй.')}</p>
              )}
        </Modal>
      )}
    </article>
  );
}

/**
 * ЦОНХ (popup) — Esc / ар тал дарж хаана, фокус дотроо (`useFocusTrap`).
 */
type Lock = { busy: boolean; dirty: boolean };
const ModalLockCtx = createContext<((id: string, l: Lock | null) => void) | null>(null);
function useModalLock(busy: boolean, dirty: boolean) {
  const report = useContext(ModalLockCtx);
  const id = useId();
  useEffect(() => { report?.(id, { busy, dirty }); }, [report, id, busy, dirty]);
  useEffect(() => () => report?.(id, null), [report, id]);
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const downOnBack = useRef(false);
  const locks = useRef(new Map<string, Lock>());
  const asking = useRef(false);
  const [busy, setBusy] = useState(false);
  useFocusTrap(ref, true);
  const report = useCallback((id: string, l: Lock | null) => {
    if (l) locks.current.set(id, l); else locks.current.delete(id);
    setBusy([...locks.current.values()].some((x) => x.busy));
  }, []);
  const tryClose = useCallback(async () => {
    const all = [...locks.current.values()];
    if (asking.current || all.some((x) => x.busy)) return;
    if (all.some((x) => x.dirty)) {
      asking.current = true;
      const ok = await askConfirm(tr('Бичсэн боловч хадгалаагүй мэдээлэл байна. Цонхыг хаавал алдагдана. Хаах уу?'),
        { danger: true, ok: tr('Хаах') });
      asking.current = false;
      if (!ok) return;
    }
    onClose();
  }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') void tryClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tryClose]);
  return (
    <div className={s.overlay} role="presentation"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBack.current && e.target === e.currentTarget) void tryClose(); }}>
      <div ref={ref} className={s.modal} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}>
        <header className={s.modalHead}>
          <h2 className={s.modalTitle}>{title}</h2>
          <button type="button" className={s.closeBtn} onClick={() => { void tryClose(); }} aria-label={tr('Хаах')} disabled={busy}
            title={busy ? tr('Илгээж байна — дуустал хаах боломжгүй') : undefined}>✕</button>
        </header>
        <ModalLockCtx.Provider value={report}>
          <div className={s.modalBody}>{children}</div>
        </ModalLockCtx.Provider>
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
      <div>
        <Segmented value={mode} label={tr('Харагдац')}
          onChange={(v) => { if (v === 'doc') void showDoc(); else setMode('info'); }}
          options={[{ value: 'info', label: tr('Мэдээлэл') }, { value: 'doc', label: tr('Баримт (PDF)') }]} />
      </div>
      {mode === 'info' ? info : (
        <div className={s.block}>
          {html && (
            <div className={s.toolRow}>
              <button type="button" className={s.ghostBtn} onClick={() => printHtml(html)}>{tr('Хэвлэх / PDF хадгалах')}</button>
              <span className={s.note}>{tr('Хэвлэх цонхонд «Save as PDF» сонгож PDF болгоно.')}</span>
            </div>
          )}
          {err ? (
            <>
              <p className={s.errNote} role="alert">{err}</p>
              <button type="button" className={s.retryBtn} onClick={() => { void showDoc(); }}>{tr('Дахин оролдох')}</button>
            </>
          )
            : html ? <iframe className={s.sheet} srcDoc={html} title={tr('Баримт')} />
              : <Loading />}
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
 */
function FmColumn({ kind, maNo, state, rows, canAuthor, canReview, me, onChanged, loadErr = '' }: {
  kind: FmKind; maNo: string; state: string; rows: FmRow[] | null;
  canAuthor: boolean; canReview: boolean; me: readonly string[]; onChanged: () => void;
  loadErr?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState<Record<number, string>>({});
  const [okMsg, setOkMsg] = useState('');
  const [warnMsg, setWarnMsg] = useState('');
  const askingRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = state === 'locked';
  useModalLock(busy, !!(docNo.trim() || date || fileName || Object.values(reason).some((v) => v.trim())));

  if (rows == null && loadErr && !locked) {
    return (
      <p className={s.errNote} role="alert">
        {tr('FIC · М-акт ачаалагдсангүй: {0}', loadErr)}
        <button type="button" className={s.retryBtn} onClick={onChanged}>{tr('Дахин оролдох')}</button>
      </p>
    );
  }
  if (rows == null) return <p className={s.note}>{locked ? tr('Өмнөх шат батлагдсаны дараа нээгдэнэ.') : tr('Enterprise-д нэвтэрч харна.')}</p>;

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr(tr('PDF файл сонгоно уу.')); return; }
    setBusy(true); setErr(''); setOkMsg(''); setWarnMsg('');
    try {
      const { warn } = await addFm({ kind, maNo, docNo: docNo.trim(), docDate: date, file: f });
      setDocNo(''); setDate(''); setFileName(''); if (fileRef.current) fileRef.current.value = '';
      if (warn) setWarnMsg(warn);
      setOkMsg(tr('PDF оруулагдлаа — хянагч шийднэ.'));
      onChanged();
    } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };
  const decide = async (row: FmRow, v: Verdict) => {
    const why = (reason[row.oid] ?? '').trim();
    if (v !== 'A' && !why) { setErr(v === 'AN' ? tr('AN шийдвэрт саналаа бичнэ үү.') : tr('Буцаах шалтгаанаа бичнэ үү.')); return; }
    if (askingRef.current) return;
    askingRef.current = true;
    let yes = false;
    try {
      yes = await askConfirm(
        tr('«{0}» баримтад «{1}» шийдвэр гаргах уу? Шийдвэрийг дараа нь өөрчлөх, буцаах боломжгүй.', d0(row), verdictLabel(v)),
        { danger: v === 'R', ok: tr('Шийдвэрлэх') },
      );
    } finally { askingRef.current = false; }
    if (!yes) return;
    setBusy(true); setErr(''); setOkMsg(''); setWarnMsg('');
    try {
      await decideFm(row, v, why);
      setReason((m) => { const n = { ...m }; delete n[row.oid]; return n; });
      setOkMsg(tr('Шийдвэр хадгалагдлаа: {0}.', verdictLabel(v)));
      onChanged();
    } catch (e) {
      setErr(userError(e));
      onChanged();
    } finally { setBusy(false); }
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
        const mine = me.some((x) => !!x && d.uploadedBy.toLowerCase() === x.toLowerCase());
        const st = d.status === 'pending' ? 'pending' : d.status === 'R' ? 'rejected' : 'done';
        return (
          <div key={d.oid} className={`${s.mir} ${s[`st_${st}`] ?? ''}`}>
            <div className={s.mirHead}>
              <button type="button" className={s.rowBtn} onClick={() => { void open(d); }} title={d.pdfName}>
                {d0(d)}
              </button>
              {d.status === 'pending' ? <span className={`${s.vchip} ${s.vNone}`}>…</span> : <VerdictChip v={d.status} />}
            </div>
            <span className={s.cardNo}>{day(d.docDate)} · {d.uploadedBy}</span>
            {d.status !== 'pending' && <span className={s.cardNo}>{tr('Шийдвэрлэсэн: {0} · {1}', d.decidedBy, day(d.decidedAt))}</span>}
            {d.reason && <p className={s.pre}>{d.reason}</p>}
            {d.status === 'pending' && canReview && !mine && (() => {
              const noText = !(reason[d.oid] ?? '').trim();
              const vBtn = (v: Verdict) => (
                <button type="button" className={s.ghostBtn} disabled={busy || (v !== 'A' && noText)}
                  title={v !== 'A' && noText ? tr('{0} — эхлээд санал/шалтгаанаа бичнэ үү', verdictLabel(v)) : verdictLabel(v)}
                  aria-label={verdictLabel(v)} onClick={() => { void decide(d, v); }}>{v}</button>
              );
              return (
                <div className={s.addForm}>
                  <input className={s.input} value={reason[d.oid] ?? ''} onChange={(e) => setReason((m) => ({ ...m, [d.oid]: e.target.value }))}
                    placeholder={tr('Санал (AN) / буцаах шалтгаан (R)')} aria-label={tr('Санал (AN) / буцаах шалтгаан (R)')}
                    disabled={busy} maxLength={FM_REASON_MAX} />
                  {vBtn('A')}{vBtn('AN')}{vBtn('R')}
                </div>
              );
            })()}
            {d.status === 'pending' && mine && <span className={s.note}>{tr('Өөр хянагч батална.')}</span>}
          </div>
        );
      })}
      {canAuthor && !locked && (
        <div className={s.addForm}>
          <input className={s.input} value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder={tr('Баримтын дугаар')} disabled={busy} maxLength={60} />
          <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} aria-label={tr('Огноо')} />
          <input ref={fileRef} className={s.file} type="file" accept="application/pdf,.pdf" disabled={busy}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} aria-label={tr('PDF файл')} />
          <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void upload(); }}>
            {busy ? tr('Түр хүлээнэ үү…') : kind === 'FIC' ? tr('FIC PDF оруулах') : tr('М-акт PDF оруулах')}
          </button>
        </div>
      )}
      {okMsg && !err && <p className={s.okNote} role="status">{okMsg}</p>}
      {warnMsg && <p className={s.failNote} role="status">{warnMsg}</p>}
      {err && <p className={s.errNote} role="alert">{err}</p>}
    </div>
  );
}

/** Багцын ажлын нэрс (`des` → «№ · нэр») — works.csv-тэй ижил эх (бөглөх хуудас); багц тус бүр нэг удаа */
const workNames = new Map<string, Promise<Map<number, string>>>();
function loadWorkNames(pkgKey: string): Promise<Map<number, string>> {
  let p = workNames.get(pkgKey);
  if (!p) {
    p = (async () => {
      const pkg = PKGS.find((x) => x.key === pkgKey);
      const m = new Map<number, string>();
      if (!pkg) return m;
      const sc = await loadSchema(pkg);
      const { rows } = await loadRows(pkg, sc);
      for (const x of rows) {
        if (x.group || x.des == null || m.has(x.des)) continue;
        m.set(x.des, `${x.no ? `${x.no} · ` : ''}${fixCyr(x.work || '')}`.trim());
      }
      return m;
    })();
    p.catch(() => { if (workNames.get(pkgKey) === p) workNames.delete(pkgKey); });
    workNames.set(pkgKey, p);
  }
  return p;
}

function WorkChips({ pkg, works }: { pkg: string; works: readonly string[] }) {
  const q = useAsync(() => loadWorkNames(pkg), [pkg]);
  const nameOf = (w: string): string => {
    if (q.state !== 'ready') return w;
    const des = Number(w.slice(w.indexOf(':') + 1));
    return q.data.get(des) || w;
  };
  return (
    <>
      <div className={s.chips}>{works.map((w) => <span key={w} className={s.chip} title={w}>{nameOf(w)}</span>)}</div>
      {q.state === 'error' && <p className={s.note}>{tr('Ажлын нэр уншигдсангүй ({0}) — түлхүүрээр харуулав.', userError(q.error))}</p>}
    </>
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
          <WorkChips pkg={r.pkg} works={r.works} />
        ) : <p className={s.note}>{tr('Ажил сонгогдоогүй — энэ MA ямар ч ажилд хамаарахгүй.')}</p>}
      </div>
      <DocsPanel subject={{ kind: 'ma', ma: r }} canAttach={canAttach} />
    </div>
  );
}

/**
 * БАРИМТ (гэрчилгээ · лаб дүн · зураг) — геопорталын тусдаа item (`chanarDocs`): жагсаалт · нээх · нэмэх · устгах.
 * MA ба MIR хоёуланд нэг самбар; Enterprise сешнгүй бол жагсаалт ч уншигдахгүй (item хайлт нэвтрэлт шаардана).
 */
type DocSubject = { kind: 'ma'; ma: MaRow } | { kind: 'mir'; mir: MirRow };
function DocsPanel({ subject, canAttach }: { subject: DocSubject; canAttach: boolean }) {
  const sess = useEntSession();
  const [list, setList] = useState<MaAtt[] | null>(null);
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const subjectId = subject.kind === 'ma' ? `ma:${subject.ma.oid}` : `mir:${subject.mir.oid}`;
  const subjRef = useRef(subject);
  useSyncRef(subjRef, subject);
  const api = useMemo(() => ({
    list: () => { const sj = subjRef.current; return sj.kind === 'ma' ? listMaAtts(sj.ma) : listMirAtts(sj.mir); },
    add: (f: File, meta: AttMeta) => { const sj = subjRef.current; return sj.kind === 'ma' ? addMaAtt(sj.ma, f, meta) : addMirAtt(sj.mir, f, meta); },
    remove: (a: MaAtt) => { const sj = subjRef.current; return sj.kind === 'ma' ? deleteMaAtt(sj.ma, a) : deleteMirAtt(sj.mir, a); },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `subjectId` нь эзэн солигдсон дохио (функцууд ref-ээр уншина)
  }), [subjectId]);
  const [type, setType] = useState<AttType>('conf');
  const [title, setTitle] = useState('');
  const [no, setNo] = useState('');
  const [std, setStd] = useState('');
  const [valid, setValid] = useState('');
  const [picked, setPicked] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useModalLock(busy, !!(title.trim() || no.trim() || std.trim() || valid || picked));

  const reload = useCallback(async () => {
    setErr('');
    try {
      setList(await api.list());
    } catch (e) {
      setList([]); setErr(userError(e));
    }
  }, [api]);
  /* Анхны ачаалт — setState зөвхөн promise-ийн дотор (`react-hooks/set-state-in-effect`); дараагийн
     шинэчлэл үйлдлийн дараа `reload`-оор. Сешнгүй бол хайлт боломжгүй — хоосон жагсаалт, тайлбар доор. */
  useEffect(() => {
    let alive = true;
    if (!sess) { Promise.resolve().then(() => { if (alive) setList([]); }); return () => { alive = false; }; }
    api.list()
      .then((l) => { if (alive) setList(l); })
      .catch((e) => { if (alive) { setList([]); setErr(userError(e)); } });
    return () => { alive = false; };
  }, [api, sess]);

  const certLike = type === 'conf' || type === 'lab' || type === 'qual';

  const upload = async () => {
    const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
    if (!files.length) { setErr(tr('Файл сонгоно уу.')); return; }
    setBusy(true); setErr(''); setWarn('');
    const errs: string[] = [];
    const warns: string[] = [];
    const added: MaAtt[] = [];
    for (const f of files) {
      try {
        const r = await api.add(f, { type, title: title || undefined, no: certLike ? no : undefined, std: certLike ? std : undefined, valid: type === 'conf' || type === 'qual' ? valid : undefined });
        if (r.warn) warns.push(r.warn);
        added.push(r.doc);
      } catch (e) { errs.push(`${f.name}: ${userError(e)}`); }
    }
    if (warns.length) setWarn(warns.join('\n'));
    if (added.length) {
      if (fileRef.current) fileRef.current.value = '';
      setTitle(''); setNo(''); setStd(''); setValid(''); setPicked(0);
      /* Порталын хайлтын индекс хэдэн секунд хоцордог — шинэ item-ийг шууд жагсаалтад нэмнэ (дахин хайхгүй) */
      setList((l) => [...added, ...(l ?? []).filter((x) => !added.some((a) => a.id === x.id))]);
    }
    if (errs.length) setErr(errs.join('\n'));
    setBusy(false);
  };

  const remove = async (a: MaAtt) => {
    if (!(await askConfirm(tr('«{0}» хавсралтыг устгах уу?', a.name), { danger: true, ok: tr('Устгах') }))) return;
    setBusy(true); setErr('');
    /* Устгасныг жагсаалтаас шууд хасна — индексийн хоцрогдолд устсан item хайлтад хэсэг үлддэг */
    try { await api.remove(a); setList((l) => (l ?? []).filter((x) => x.id !== a.id)); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const openAtt = async (a: MaAtt) => {
    const w = window.open('', '_blank');
    try {
      const b = await maAttBlob(a);
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
      <h3 className={s.h3}>
        {tr('Хавсралт')}{list ? ` (${list.length})` : ''}
        {sess && list && (
          <button type="button" className={s.retryBtn} disabled={busy} onClick={() => { void reload(); }} title={tr('Жагсаалтыг порталаас дахин уншина')}>{tr('Шинэчлэх')}</button>
        )}
      </h3>
      {list == null ? <Loading /> : list.length === 0 ? (
        <p className={s.note}>{sess ? tr('Хавсралт алга.') : tr('Хавсралт геопорталын item тул нэвтэрсний дараа харагдана.')}</p>
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
                  {[a.meta.no && `№ ${a.meta.no}`, a.meta.std, kb(a.size), a.owner, day(a.modified || null)].filter(Boolean).join(' · ')}
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
        !sess ? (
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
            <input ref={fileRef} className={s.file} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple disabled={busy}
              onChange={(e) => setPicked(e.target.files?.length ?? 0)} aria-label={tr('Файл')} />
            <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void upload(); }}>
              {busy ? tr('Түр хүлээнэ үү…') : tr('Хавсаргах')}
            </button>
          </div>
        )
      )}
      {warn && <p className={s.failNote} role="status">{warn}</p>}
      {err && <p className={s.errNote} role="alert">{err}</p>}
    </div>
  );
}

/**
 * MIR ЖАГСААЛТ — MA-гийн доор (2-р шат). MIR бүр = талбайд ирсэн нэг ачааны үзлэг.
 */
function MirList({ mirs, canAttach }: { mirs: MirRow[] | null; canAttach: boolean }) {
  if (mirs == null) return null;
  return (
    <div className={s.mirBox}>
      <span className={s.cardNo}>{tr('{0} ачаа', mirs.length)}</span>
      {mirs.length === 0 ? (
        <p className={s.note}>{tr('Энэ MA-д MIR бүртгэгдээгүй — материал талбайд ирэхэд Survey123-аар бөглөнө.')}</p>
      ) : mirs.map((m) => <MirItem key={m.oid} m={m} canAttach={canAttach} />)}
    </div>
  );
}

function MirItem({ m, canAttach }: { m: MirRow; canAttach: boolean }) {
  const st = mirState(m);
  const sheet = async () => {
    const photos = await loadMirPhotos(m.rowId);
    const list: { url: string; note: string }[] = [];
    for (const ph of photos) {
      try { list.push({ url: trackUrl(URL.createObjectURL(await mirPhotoBlob(ph))), note: ph.note }); } catch { /* тэр зураг алгасна */ }
    }
    return mirSheetHtml(m, logoUrl(), list);
  };
  return <DocSwitch info={<MirInfo m={m} st={st} canAttach={canAttach} />} sheet={sheet} />;
}

/* objectURL-уудыг хуудаснаас гарахад чөлөөлнө (цонх бүрийн iframe/print цонх хэрэглэсний дараа) */
const liveUrls = new Set<string>();
const trackUrl = (u: string) => { liveUrls.add(u); return u; };
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { for (const u of liveUrls) URL.revokeObjectURL(u); liveUrls.clear(); });

function MirInfo({ m, st, canAttach }: { m: MirRow; st: string; canAttach: boolean }) {
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
      <DocsPanel subject={{ kind: 'mir', mir: m }} canAttach={canAttach} />
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
