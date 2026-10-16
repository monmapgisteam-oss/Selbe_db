'use client';

/**
 * АЖЛЫН ТӨЛӨВЛӨГӨӨ — агент өгөгдөл татахаасаа ӨМНӨ юу хийхээ хэлнэ.
 *
 * ⚠️ ЯАГААД: олон эх сурвалжтай асуултад агент 2-4 алхам явдаг бөгөөд хэрэглэгч
 * 10-20 секунд «Бодож байна…» гэсэн мөр хараад юу болж байгааг мэдэхгүй байв.
 * Төлөвлөгөө нь (1) хүлээлтийг ойлгомжтой болгоно, (2) буруу зам сонгосныг
 * хэрэглэгч ШУУД хардаг (ил тод байдал).
 *
 * ⚠️ НЭМЭЛТ ЭРГЭЛТ ЗАРЦУУЛАХГҮЙ: төлөвлөгөө нь хэрэгсэл дуудаж буй ЯГ ТЭР
 * эргэлтийн текстээр ирнэ (`client.ask`-ийн `onPlan`) — хэрэглэгчээс
 * зөвшөөрөл асуудаггүй тул хариулт удаашрахгүй.
 */

import { planSteps } from '@/lib/agent/plan';
import { t as tr } from '@/lib/i18nCore';
import s from '@/components/agent.module.css';

/**
 * @param done Гүйцэтгэсэн алхмын тоо. `undefined` — ажил дууссан (тэмдэггүй).
 */
export function AgentPlan({ raw, done }: { raw: string; done?: number }) {
  const steps = planSteps(raw);
  if (!steps.length) return null;
  return (
    <div className={s.plan}>
      <p className={s.planTitle}>{tr('Төлөвлөгөө')}</p>
      <ol className={s.planList}>
        {steps.map((st, i) => {
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
