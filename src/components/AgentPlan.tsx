'use client';

/**
 * АЖЛЫН ТӨЛӨВЛӨГӨӨ — агент өгөгдөл татахаасаа ӨМНӨ юу хийхээ хэлнэ.
 */

import { planSteps } from '@/lib/agent/plan';
import { t as tr } from '@/lib/i18nCore';
import s from '@/components/agent.module.css';

/**
 * @param done Гүйцэтгэсэн алхмын тоо. `undefined` — тэмдэггүй (дугаартай).
 * @param running 2026-10-19: ажил ЯВЖ байна — алхмуудыг «▸» (гүйцэтгэж байна) гэж тэмдэглэнэ, ✓ тавихгүй.
 *    Хэрэгслийн багцын тоо нь алхмын тоо биш тул явцад нэг нэгээр ✓ тавих нь худал байв (`AgentChat`).
 * @param complete 2026-10-19: эргэлт АМЖИЛТТАЙ дууссан — бүх алхам ✓.
 */
export function AgentPlan({ raw, done, running, complete }: { raw: string; done?: number; running?: boolean; complete?: boolean }) {
  const steps = planSteps(raw);
  if (!steps.length) return null;
  return (
    <div className={s.plan}>
      <p className={s.planTitle}>{tr('Төлөвлөгөө')}</p>
      <ol className={s.planList}>
        {steps.map((st, i) => {
          if (complete || running) {
            return (
              <li key={i} className={complete ? s.planDone : s.planNow}>
                <span className={s.planMark} aria-hidden="true">{complete ? '✓' : '▸'}</span>
                {st}
              </li>
            );
          }
          const state = done == null ? '' : i < done ? s.planDone : i === done ? s.planNow : '';
          return (
            <li key={i} className={state || undefined}>
              <span className={s.planMark} aria-hidden="true">
                {done == null ? `${i + 1}.` : i < done ? '✓' : i === done ? '▸' : '○'}
              </span>
              {st}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
