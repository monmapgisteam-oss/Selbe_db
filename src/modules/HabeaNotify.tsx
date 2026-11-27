'use client';

/**
 * ГҮЙЦЭТГЭГЧИЙН ҮЛ НИЙЦЛИЙН МЭДЭГДЭЛ — UI (2026-11-21, хэрэглэгчийн хүсэлт). Дүрэм ба хадгалалт: `lib/habeaNotify.ts`.
 *
 *   · `useHabeaNotify` — өөрийн багцын нээлттэй үл нийцлүүд шатаар, «шинэ»-ийн тоо, уншсан болгох;
 *   · `NotifyBell`     — «Мэдээлэл · Тайлан татах»-ын хажууд тоотой хонх, дарахад самбар;
 *   · `NotifyDialog`   — нэвтэрч орох үед (сешнд НЭГ удаа, шинэ мэдэгдэл байвал) гарах цонх.
 *
 * 2026-11-21 (хэрэглэгч: «илүү харагдахаар, ойлгомжтой»): дээр нь нийт · шинэ · хариуцлагын шатны ТОМ тоо;
 * 4 шат нь ӨНГӨТ КАРТ (1→4), сонгосон шатанд «юу болох вэ» гэсэн тайлбар ба тэр шатны үл нийцлийн карт
 * (төлөв · ноцтой · шинэ · ›). Карт дарахад «Үл нийцлийн мэдээлэл» фокус нээгдэж тэр мөр задарна, газрын зураг
 * тэр цэг рүү очно (`Habea.openNotice`); «Газрын зураг дээр харах» нь сонгосон шатыг бүхэлд нь (`Habea.openStage`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronRight, MapPinned, X } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { num, date } from '@/lib/format';
import { ESCALATION, ubDaysSince } from '@/lib/habeaStage';
import {
  notifyItems, isNewItem, markSeenItems, pruneSeen, readSeen, writeSeen,
  type NotifyItem, type NotifySeen,
} from '@/lib/habeaNotify';
import { loadActions, actValueLabel, type ActionRow } from './HabeaAction';
import { habeaPkgLabel } from './habeaUzleg';
import h from './habea.module.css';

export type ActNotice = NotifyItem<ActionRow>;
export type NoticeGroup = { stage: number; items: ActNotice[]; newN: number };

/** Шат бүрт «юу болох вэ» — шатлалын дүрэм (2026-11-03) гүйцэтгэгчийн хэлээр */
const STAGE_ADVICE: (() => string)[] = [
  () => tr('Үл нийцэл системд бүртгэгдсэн — 7 хоногийн дотор арилгана уу.'),
  () => tr('7 хоног өнгөрсөн — талбайн зааварчилгаа өгөгдөнө.'),
  () => tr('14 хоног өнгөрсөн — сануулах хуудас өгөгдөнө.'),
  () => tr('21 хоногоос дээш — хариуцлага тооцогдоно. Яаралтай арилгана уу.'),
];

/** «1-р долоо хоног — системд үүссэн» → [«1-р долоо хоног», «системд үүссэн»] (англи орчуулгад ч « — ») */
const splitStage = (label: string): [string, string] => {
  const i = label.indexOf(' — ');
  return i < 0 ? [label, ''] : [label.slice(0, i), label.slice(i + 3)];
};

/**
 * Өөрийн багцын мэдэгдэл. `scope` хоосон биш массив үед л ачаална (бусад аккаунтад `enabled: false`).
 * `tick` — хуудасны давтан шинэчлэл (`Habea`), `now` — дуудагчийн цаг (render-ийн `Date.now()` биш).
 */
export function useHabeaNotify(user: string | null | undefined, scope: readonly string[] | null, tick: number, now: number) {
  const enabled = !!user && !!scope?.length;
  const st = useAsync<ActionRow[] | null>(() => (enabled ? loadActions() : Promise.resolve(null)), [enabled, tick], { keepOn: [tick] });
  const [seen, setSeen] = useState<NotifySeen>(() => readSeen(user));
  /* Хэрэглэгч солигдвол тэр хүний тэмдэглэл */
  const [seenFor, setSeenFor] = useState(user);
  if (seenFor !== user) { setSeenFor(user); setSeen(readSeen(user)); }

  const items = useMemo<ActNotice[]>(
    () => (enabled && st.state === 'ready' && st.data ? notifyItems(st.data, scope, now) : []),
    [enabled, st, scope, now],
  );
  const groups = useMemo<NoticeGroup[]>(() => ESCALATION.map((_, stage) => {
    const list = items.filter((it) => it.stage === stage);
    return { stage, items: list, newN: list.filter((it) => isNewItem(it, seen)).length };
  }), [items, seen]);
  const newN = groups.reduce((a, g) => a + g.newN, 0);

  const markSeen = useCallback((list: readonly ActNotice[]) => {
    setSeen((prev) => {
      const next = pruneSeen(markSeenItems(prev, list), items);
      writeSeen(user, next);
      return next;
    });
  }, [items, user]);

  return {
    enabled,
    ready: enabled && st.state === 'ready',
    failed: enabled && st.state === 'error',
    items, groups, seen, newN, markSeen,
  };
}
export type HabeaNotify = ReturnType<typeof useHabeaNotify>;

/** Анх нээгдэх шат — шинэ мэдэгдэлтэй ХАМГИЙН ӨНДӨР, эс бөгөөс үл нийцэлтэй хамгийн өндөр шат */
const defaultStage = (groups: readonly NoticeGroup[]): number =>
  [...groups].reverse().find((g) => g.newN > 0)?.stage
  ?? [...groups].reverse().find((g) => g.items.length > 0)?.stage
  ?? 0;

/** Нэг үл нийцлийн карт — шатны өнгөт зураас · асуулт · чипүүд · › */
function NoticeCard({ it, isNew, now, onOpen }: { it: ActNotice; isNew: boolean; now: number; onOpen: (it: ActNotice) => void }) {
  const r = it.row;
  /* 2026-11-27: шатлал (`stageOf`) ба тайлантай НЭГ тоолол — Улаанбаатарын хуанлийн өдрөөр (24 цагаар биш) */
  const days = r.d != null ? Math.max(0, ubDaysSince(r.d, now)) : null;
  return (
    <li>
      <button type="button" className={`${h.ntCard} ${isNew ? h.ntCardNew : ''}`} onClick={() => onOpen(it)}
        title={tr('Дарж дэлгэрэнгүйг харна')}>
        <span className={h.ntCardBody}>
          <span className={h.ntCardQ}>{r.question || r.qCode || tr('Үл нийцэл #{0}', num(r.oid))}</span>
          <span className={h.ntCardMeta}>
            {isNew && <span className={`${h.ntChip} ${h.ntChipNew}`}>{tr('шинэ')}</span>}
            {r.major && <span className={`${h.ntChip} ${h.ntChipBad}`}>{tr('ноцтой')}</span>}
            {r.status != null && <span className={h.ntChip}>{actValueLabel('status', String(r.status))}</span>}
            <span className={h.ntCardSub}>
              {[r.site ? tr(habeaPkgLabel(r.site)) : '', r.d ? date(r.d) : '', days != null ? tr('{0} хоног нээлттэй', num(days)) : '']
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
        <ChevronRight className={h.ntCardGo} size={16} strokeWidth={2} aria-hidden />
      </button>
    </li>
  );
}

/**
 * МЭДЭГДЛИЙН САМБАР — 4 шатны өнгөт карт (1→4, «Нээлттэй үл нийцэл — шатлалаар» чарттай ижил өнгө) · сонгосон
 * шатны тайлбар · тэр шатны үл нийцлийн картууд. Нарийн хонхны цэсэнд картууд 2×2, цонхонд 4 зэрэгцээ.
 */
function NoticeBoard({ n, now, stage, onStage, onOpen }: {
  n: HabeaNotify; now: number; stage: number; onStage: (s: number) => void; onOpen: (it: ActNotice) => void;
}) {
  if (n.failed) return <p className={h.ntEmpty} role="alert">{tr('Үл нийцлийн мэдээлэл татагдсангүй — дараа дахин оролдоно.')}</p>;
  if (!n.ready) return <p className={h.ntEmpty}>{tr('Ачаалж байна…')}</p>;
  if (!n.items.length) return <p className={h.ntEmpty}>{tr('Таны багцад нээлттэй үл нийцэл алга.')}</p>;
  const g = n.groups[stage];
  const s = ESCALATION[stage];
  return (
    <div className={h.ntBoard} style={{ ['--st' as string]: s.color }}>
      <div className={h.ntStages} role="tablist" aria-label={tr('Шатлал')}>
        {n.groups.map((x) => {
          const e = ESCALATION[x.stage];
          const [week, act] = splitStage(e.label());
          const on = x.stage === stage;
          return (
            <button key={e.key} type="button" role="tab" aria-selected={on}
              className={`${h.ntStage} ${on ? h.ntStageOn : ''} ${x.items.length ? '' : h.ntStageNone}`}
              style={{ ['--st' as string]: e.color }} onClick={() => onStage(x.stage)}
              title={`${e.label()} · ${e.hint()}`}>
              <span className={h.ntStageTop}>
                <span className={h.ntStageWeek}>{week}</span>
                {x.newN > 0 && <span className={h.ntStageNew}>{tr('шинэ {0}', num(x.newN))}</span>}
              </span>
              <b className={`${h.ntStageCount} num`}>{num(x.items.length)}</b>
              <span className={h.ntStageAct}>{act}</span>
            </button>
          );
        })}
      </div>
      <div className={h.ntAdvice} role="note">
        <b>{s.label()}</b>
        <span>{STAGE_ADVICE[stage]()}</span>
      </div>
      {g.items.length
        ? (
          <ul className={h.ntCards}>
            {g.items.map((it) => <NoticeCard key={it.row.oid} it={it} isNew={isNewItem(it, n.seen)} now={now} onOpen={onOpen} />)}
          </ul>
        )
        : <p className={h.ntEmpty}>{tr('Энэ шатанд үл нийцэл алга.')}</p>}
    </div>
  );
}

/** Дээд талын гурван тоо — нээлттэй · шинэ · хариуцлагын шат */
function NoticeStats({ n }: { n: HabeaNotify }) {
  const w4 = n.groups[3]?.items.length ?? 0;
  return (
    <div className={h.ntStats}>
      <span className={h.ntStat}><b className="num">{num(n.items.length)}</b>{tr('нээлттэй')}</span>
      <span className={`${h.ntStat} ${n.newN ? h.ntStatNew : ''}`}><b className="num">{num(n.newN)}</b>{tr('шинэ')}</span>
      <span className={`${h.ntStat} ${w4 ? h.ntStatBad : ''}`}><b className="num">{num(w4)}</b>{tr('хариуцлага тооцох шатанд')}</span>
    </div>
  );
}

/** «Бүгдийг уншсан болгох» — шинэ мэдэгдэлгүй бол идэвхгүй */
function MarkAll({ n }: { n: HabeaNotify }) {
  return (
    <button type="button" className={h.linkBtn} disabled={!n.newN} onClick={() => n.markSeen(n.items)}>
      {tr('Бүгдийг уншсан болгох')}
    </button>
  );
}

/** «Газрын зураг дээр харах» — сонгосон шатыг «Үл нийцлийн мэдээлэл» фокуст бүхэлд нь */
function OpenStage({ n, stage, onOpenStage }: { n: HabeaNotify; stage: number; onOpenStage: (s: number) => void }) {
  return (
    <button type="button" className={h.ntPrimary} disabled={!n.groups[stage]?.items.length} onClick={() => onOpenStage(stage)}>
      <MapPinned size={14} strokeWidth={2} aria-hidden />
      {tr('Газрын зураг дээр харах')}
    </button>
  );
}

type NotifyProps = { n: HabeaNotify; now: number; onOpen: (it: ActNotice) => void; onOpenStage: (stage: number) => void };

/**
 * ХОНХ — тоо нь ШИНЭ мэдэгдэл (улаан); шинэгүй ч нээлттэй байвал тэмдэггүй, гарчигт нийт тоо.
 * Самбар нь шүүлтийн мөрийн (`.infoBar`) өргөнтэй — нарийн баганаас хальдаггүй.
 */
export function NotifyBell({ n, now, onOpen, onOpenStage }: NotifyProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const cur = stage ?? defaultStage(n.groups);
  const title = n.newN
    ? tr('Үл нийцлийн мэдэгдэл — шинэ {0} · нээлттэй {1}', num(n.newN), num(n.items.length))
    : tr('Үл нийцлийн мэдэгдэл — нээлттэй {0}', num(n.items.length));
  return (
    <div className={h.ntWrap} ref={ref}>
      <button type="button" className={`${h.ntBell} ${n.newN ? h.ntBellOn : ''}`} aria-haspopup="dialog" aria-expanded={open}
        title={title} aria-label={title} onClick={() => { setOpen((v) => !v); setStage(null); }}>
        <Bell size={15} strokeWidth={1.9} aria-hidden />
        {n.newN > 0 && <b className={`${h.ntBadge} num`}>{n.newN > 99 ? '99+' : num(n.newN)}</b>}
      </button>
      {open && (
        <div className={h.ntMenu} role="dialog" aria-label={tr('Үл нийцлийн мэдэгдэл')}>
          <div className={h.ntMenuHead}>
            <span>{tr('Үл нийцлийн мэдэгдэл')}</span>
            <MarkAll n={n} />
          </div>
          {n.ready && n.items.length > 0 && <NoticeStats n={n} />}
          <NoticeBoard n={n} now={now} stage={cur} onStage={setStage} onOpen={(it) => { setOpen(false); onOpen(it); }} />
          {n.ready && n.items.length > 0 && (
            <div className={h.ntMenuFoot}>
              <OpenStage n={n} stage={cur} onOpenStage={(s) => { setOpen(false); onOpenStage(s); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * НЭВТРЭХ ҮЕИЙН ЦОНХ. Esc · арын дэвсгэр · × · «Хаах»-аар хаагдана; хаах нь уншсан болгохгүй (хонхны тоо үлдэнэ) —
 * «Бүгдийг уншсан болгох» эсвэл карт бүрийг дарж уншина.
 */
export function NotifyDialog({ n, now, pkgLabel, onOpen, onOpenStage, onClose }: NotifyProps & { pkgLabel: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<number | null>(null);
  const cur = stage ?? defaultStage(n.groups);
  /* Фокус НЭГ удаа (нээгдэхэд) — `onClose` солигдох бүрд дахин фокуславал гараар шилжсэн фокусыг булаана */
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  /* `document.body` руу — багана (`overflow`, containment) `position: fixed`-ийг барьж авахгүй */
  return createPortal(
    <div className={h.ntBackdrop} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={h.ntDialog} role="dialog" aria-modal="true" aria-labelledby="hab-nt-title" tabIndex={-1} ref={box}>
        <header className={h.ntDialogHead}>
          <span className={h.ntDialogIcon} aria-hidden><Bell size={20} strokeWidth={2} /></span>
          <div className={h.ntDialogTitle}>
            <h2 id="hab-nt-title">{tr('Үл нийцлийн мэдэгдэл')}</h2>
            <p>{tr('{0} — таны багцын арилгаагүй үл нийцлүүд, үзлэгийн огнооноос хойшх шатлалаар', pkgLabel)}</p>
          </div>
          <button type="button" className={h.ntX} onClick={onClose} aria-label={tr('Хаах')}><X size={16} strokeWidth={2} /></button>
        </header>
        {n.ready && n.items.length > 0 && <NoticeStats n={n} />}
        <div className={h.ntDialogBody}>
          <NoticeBoard n={n} now={now} stage={cur} onStage={setStage} onOpen={onOpen} />
        </div>
        <footer className={h.ntDialogFoot}>
          <MarkAll n={n} />
          <span className={h.ntFootBtns}>
            <button type="button" className={h.ntClose} onClick={onClose}>{tr('Хаах')}</button>
            {n.ready && n.items.length > 0 && <OpenStage n={n} stage={cur} onOpenStage={onOpenStage} />}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
