'use client';

/**
 * АГЕНТЫН ХАРИУЛТЫГ ЗУРАХ — жижигхэн markdown хөрвүүлэгч.
 */

import type { ReactNode } from 'react';
import { isNumeric } from '@/lib/agent/format';
import { parseBlocks, type MdBlock } from '@/lib/agent/blocks';
import { AgentChart } from '@/components/AgentChart';
import { AgentPlan } from '@/components/AgentPlan';
import { AgentReport } from '@/components/AgentReport';
import s from '@/components/agent.module.css';

/** `**тод**` ба `` `код` `` — мөрийн дотоод тэмдэглэгээ */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Хоёуланг НЭГ алхамд салгана — эс бөгөөс код доторх `**` тодоор орно
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      const body = p.slice(2, -2);
      out.push(
        <strong key={`${key}-${i}`} className={isNumeric(body) ? s.num : undefined}>
          {body}
        </strong>,
      );
    } else if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      out.push(<code key={`${key}-${i}`}>{p.slice(1, -1)}</code>);
    } else {
      out.push(<span key={`${key}-${i}`}>{p}</span>);
    }
  });
  return out;
}

/** Нэг блокийг зурна — дараалал нь `parseBlocks`-ийнхтэй ижил */
function block(b: MdBlock, k: number, source: string): ReactNode {
  if (b.kind === 'chart') return <AgentChart key={`ch${k}`} raw={b.raw} />;

  if (b.kind === 'plan') return <AgentPlan key={`pl${k}`} raw={b.raw} />;

  if (b.kind === 'report') return <AgentReport key={`rp${k}`} raw={b.raw} source={source} />;

  if (b.kind === 'table') {
    return (
      <div key={`t${k}`} className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>{b.head.map((c, n) => <th key={n}>{inline(c, `h${k}${n}`)}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, n) => <td key={n}>{inline(c, `c${k}${ri}${n}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (b.kind === 'list') {
    const List = b.ordered ? 'ol' : 'ul';
    return (
      <List key={`l${k}`} className={s.list}>
        {b.items.map((it, n) => <li key={n}>{inline(it, `li${k}${n}`)}</li>)}
      </List>
    );
  }

  return <p key={`p${k}`} className={s.para}>{inline(b.text, `pi${k}`)}</p>;
}

export function AgentMarkdown({ text }: { text: string }) {
  return <>{parseBlocks(text).map((b, k) => block(b, k, text))}</>;
}
