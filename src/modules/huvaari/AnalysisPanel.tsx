'use client';

/**
 * ХУВААРИЙН ШИНЖИЛГЭЭНИЙ САМБАР (2026-10-29, хэрэглэгч: «асуудлын самбар · эгзэгтэй зам · батлагдсантай харьцуулах ·
 * нөөцийн график · экспорт»). Тооцоо нь цэвэр функцууд (`lib/planAnalysis.ts`) — энд зөвхөн харуулна; мөр дээр дарахад
 * `onJump`-аар хуанли дахь мөр рүү үсэрнэ. Самбар нь хуваарийн өгөгдлийг ХЭЗЭЭ Ч өөрчлөхгүй.
 */
import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { fixCyr, num } from '@/lib/format';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import type { PlanRow } from '@/lib/plan';
import type { Delay, Issue, IssueKind } from '@/lib/planAnalysis';
import h from '../huvaari.module.css';

export type AnaTab = 'issues' | 'crit' | 'delay' | 'res' | 'export';

const TABS: { k: AnaTab; label: () => string }[] = [
  { k: 'issues', label: () => tr('Асуудал') },
  { k: 'crit', label: () => tr('Эгзэгтэй зам') },
  { k: 'delay', label: () => tr('Хоцролт') },
  { k: 'res', label: () => tr('Нөөц') },
  { k: 'export', label: () => tr('Экспорт') },
];

/** Төрлийн дараалал — ноцтой нь эхэнд; «огноогүй» нь төлөвлөгдөөгүй блокт олон тул сүүлд */
const KIND_ORDER: IssueKind[] = ['dep', 'geree', 'unbal', 'nodate'];
const kindLabel = (k: IssueKind): string => (k === 'dep' ? tr('Уялдааны зөрчил') : k === 'geree' ? tr('Гэрээнээс гарсан')
  : k === 'unbal' ? tr('Сар тэнцээгүй') : tr('Огноогүй'));
/** Жагсаалтын дээд хэмжээ — олон мянган мөр зурахгүй */
const LIST_MAX = 300;

const issueText = (x: Issue): string => {
  switch (x.kind) {
    case 'unbal': return tr('Сарын обьём нийт обьёмтой тэнцээгүй');
    case 'dep': return tr('Уялдаанаас {0} хоногоор эрт эхэлсэн', num(x.days ?? 0));
    case 'geree': return tr('Гэрээний хугацаанаас {0} хоног гарсан', num(x.days ?? 0));
    case 'nodate': return tr('Обьёмтой атлаа огноогүй');
    default: return '';
  }
};

export function AnalysisPanel({
  tab, onTab, onClose, plan, blocks, blk, issues, crit, delays, res, onJump, onExport, exportBusy,
}: {
  tab: AnaTab;
  onTab: (t: AnaTab) => void;
  onClose: () => void;
  plan: PlanRow[];
  blocks: string[];
  blk: number;
  issues: Issue[] | null;
  crit: Map<number, number> | null;
  delays: Delay[] | null;
  res: Map<string, { hun: number; mashin: number }> | null;
  onJump: (oid: number, b: number) => void;
  onExport: () => void;
  exportBusy?: boolean;
}) {
  const counts = new Map<IssueKind, number>();
  for (const x of issues ?? []) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  const [kindSel, setKindSel] = useState<IssueKind | null>(null);
  const kind = kindSel && counts.get(kindSel) ? kindSel : KIND_ORDER.find((k) => counts.get(k)) ?? null;
  const shown = (issues ?? []).filter((x) => x.kind === kind);
  const lab = (i: number) => `${plan[i]?.no ?? ''} ${fixCyr(plan[i]?.work ?? '')}`.trim();
  const blkName = blocks[blk] ?? '';
  const critList = crit ? [...crit].filter(([, f]) => f <= 0).map(([i]) => i).sort((a, b) => (plan[a].spans[blk]!.start - plan[b].spans[blk]!.start) || a - b) : [];
  const resMax = res ? Math.max(1, ...[...res.values()].map((v) => Math.max(v.hun, v.mashin))) : 1;
  return (
    <aside className={h.chgPanel} role="region" aria-label={tr('Шинжилгээ')}>
      <header className={h.mdHead}>
        <b className={h.mdWork}>{tr('Шинжилгээ')}</b>
        <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
      </header>
      <div className={h.anaTabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
            className={`${h.anaTab} ${tab === t.k ? h.anaTabOn : ''}`} onClick={() => onTab(t.k)}>
            {t.label()}
            {t.k === 'issues' && issues && issues.length > 0 && ` (${num(issues.length)})`}
          </button>
        ))}
      </div>

      {tab === 'issues' && (
        issues == null ? null : issues.length === 0 ? (
          <p className={h.muted}>{tr('{0} блокт асуудал алга.', blkName)}</p>
        ) : (
          <>
            <p className={h.muted}>{tr('{0} блок · сарын обьём бүх блокоор', blkName)}</p>
            <div className={h.anaTabs}>
              {KIND_ORDER.filter((k) => counts.get(k)).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} className={`${h.anaTab} ${kind === k ? h.anaTabOn : ''}`}
                  onClick={() => setKindSel(k)}>
                  {kindLabel(k)} {num(counts.get(k) ?? 0)}
                </button>
              ))}
            </div>
            {shown.slice(0, LIST_MAX).map((x, k) => (
              <button key={k} type="button" className={h.anaItem} onClick={() => onJump(plan[x.i].oid, x.b)}>
                <b>{lab(x.i)}</b>
                <span className={h.muted}>{issueText(x)}{x.kind === 'unbal' && blocks[x.b] ? ` · ${blocks[x.b]}` : ''}</span>
              </button>
            ))}
            {shown.length > LIST_MAX && <p className={h.muted}>{tr('… ба {0}', num(shown.length - LIST_MAX))}</p>}
          </>
        )
      )}

      {tab === 'crit' && crit && (
        <>
          <p className={h.muted}>
            {tr('{0} блок — уялдаагаар хамгийн урт гинж. Эгзэгтэй ажил (нөөцгүй) хуанли дээр улаан хүрээтэй; нэг хоног хоцорвол төсөл хоцорно.', blkName)}
          </p>
          {critList.length === 0 ? <p className={h.muted}>{tr('Огноотой ажил алга.')}</p> : critList.map((i) => (
            <button key={i} type="button" className={h.anaItem} onClick={() => onJump(plan[i].oid, blk)}>
              <b>{lab(i)}</b>
              <span className={`${h.muted} num`}>{msToDay(plan[i].spans[blk]!.start)} → {msToDay(plan[i].spans[blk]!.end)}</span>
            </button>
          ))}
          <p className={h.muted}>{tr('Нөөцтэй ажил: {0}', num(crit.size - critList.length))}</p>
        </>
      )}

      {tab === 'delay' && delays && (
        delays.length === 0 ? <p className={h.muted}>{tr('Батлагдсан хуваарьтай ижил — өөрчлөлт алга.')}</p> : (
          <>
            <p className={h.muted}>{tr('{0} блок — батлагдсан → одоогийн (+ хоног = хойшилсон)', blkName)}</p>
            {[...delays].sort((a, b) => (b.end ?? 0) - (a.end ?? 0)).map((x) => (
              <button key={x.i} type="button" className={h.anaItem} onClick={() => onJump(plan[x.i].oid, blk)}>
                <b>{lab(x.i)}</b>
                <span className={`${h.muted} num`}>
                  {x.was ? `${msToDay(x.was.start)}–${msToDay(x.was.end)}` : tr('огноогүй')}
                  {' → '}
                  {x.now ? `${msToDay(x.now.start)}–${msToDay(x.now.end)}` : tr('огноогүй')}
                  {x.end != null && x.end !== 0 && <b className={x.end > 0 ? h.anaLate : h.anaEarly}> {x.end > 0 ? '+' : '−'}{num(Math.abs(x.end))}{tr('х')}</b>}
                </span>
              </button>
            ))}
          </>
        )
      )}

      {tab === 'res' && res && (
        res.size === 0 ? <p className={h.muted}>{tr('Сарын хүн хүч, машин механизм оруулаагүй байна.')}</p> : (
          <>
            <p className={h.muted}>{tr('Багцын бүх ажил, бүх блокийн сарын нийлбэр')}</p>
            <div className={h.anaRes}>
              {[...res].map(([k, v]) => (
                <div key={k} className={h.anaResRow} title={`${k}: ${tr('хүн хүч')} ${num(v.hun)} · ${tr('машин')} ${num(v.mashin)}`}>
                  <span className={h.mdMonth}>{k}</span>
                  <span className={h.anaBars}>
                    <span className={h.anaBarHun} style={{ width: `${(v.hun / resMax) * 100}%` }} />
                    <span className={h.anaBarMash} style={{ width: `${(v.mashin / resMax) * 100}%` }} />
                  </span>
                  <span className="num">{num(v.hun)} / {num(v.mashin)}</span>
                </div>
              ))}
            </div>
            <p className={h.muted}><span className={h.anaKeyHun} /> {tr('хүн хүч')} · <span className={h.anaKeyMash} /> {tr('машин механизм')}</p>
          </>
        )
      )}

      {tab === 'export' && (
        <>
          <p className={h.muted}>{tr('Хуваарийг Excel файлаар татна: ажил × блок бүрийн огноо, үргэлжлэх хоног, обьём, сарын обьём (ноорог орсон).')}</p>
          <button type="button" className={h.save} disabled={exportBusy} onClick={onExport}>{tr('Excel татах')}</button>
        </>
      )}
    </aside>
  );
}
