/**
 * ХЯНАЛТЫН ХУГАЦАА — илгээлт одоогийн эзэн дээрээ хэд хоносон, шатны хугацаанаас (`STAGE_LIMIT_DAYS`) хэтэрсэн эсэх.
 * Цэвэр — `hyanaltWait.check.mjs`.
 */
import { F, OWNER, REVIEW_STAGES, SF, STATUS, prevReview, type ReviewStage, type Row, type Stage, type Status } from './hyanalt';

/** Шат бүрийн шийдвэрлэх хугацаа (хоног) */
export const STAGE_LIMIT_DAYS = 2;
const DAY = 86_400_000;

const ms = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

/** Хянаж буй шат → тэр шатанд ИРСЭН агшин (өмнөх шатны илгээсэн огноо; эхний шатанд компанийн илгээсэн огноо) */
function arrivedAt(r: Row, stage: ReviewStage): number | null {
  const pv = prevReview(stage);
  const rec = r as unknown as Record<string, unknown>;
  return ms(pv ? rec[SF[pv].sent] : rec[F.companySent]);
}

export type Wait = {
  /** Одоо хэний гар дээр */
  owner: Stage;
  /** Буцаагдаж ирсэн үү (эзэн нь засах ёстой) */
  returned: boolean;
  /** Эзэн дээрээ ирсэн агшин (ms) — тодорхойгүй бол null */
  since: number | null;
  /** Хүлээгдсэн хоног (бутархайтай) */
  days: number | null;
  overdue: boolean;
};

/** Дууссан («Шилжүүлсэн») илгээлтэд null */
export function waitOf(r: Row, status: Status, now: number): Wait | null {
  if (status === STATUS.transferred) return null;
  const owner = OWNER[status];
  if (!owner) return null;
  const rec = r as unknown as Record<string, unknown>;
  const reviewing = REVIEW_OF[status];
  let since: number | null;
  if (reviewing) since = arrivedAt(r, reviewing);
  else {
    /* Буцаасан: буцаасан шат = эзний ДАРААГИЙН шат */
    const i = owner === 'company' ? 0 : REVIEW_STAGES.indexOf(owner as ReviewStage) + 1;
    const by = REVIEW_STAGES[i];
    since = by ? ms(rec[SF[by].returned]) : null;
  }
  const days = since == null ? null : Math.max(0, (now - since) / DAY);
  return { owner, returned: !reviewing, since, days, overdue: days != null && days > STAGE_LIMIT_DAYS };
}

const REVIEW_OF: Partial<Record<Status, ReviewStage>> = {
  [STATUS.engineerReview]: 'engineer', [STATUS.managerReview]: 'manager', [STATUS.plannerReview]: 'planner',
  [STATUS.directorReview]: 'director', [STATUS.headReview]: 'head', [STATUS.chiefReview]: 'chief',
};

/** Шат бүрээр: хүлээгдэж буй ба хугацаа хэтэрсэн тоо */
export function waitSummary(ws: readonly Wait[]): Record<Stage, { n: number; overdue: number }> {
  const out = {} as Record<Stage, { n: number; overdue: number }>;
  for (const w of ws) {
    const o = (out[w.owner] ??= { n: 0, overdue: 0 });
    o.n += 1;
    if (w.overdue) o.overdue += 1;
  }
  return out;
}
