/**
 * «Гүйцэтгэл» харагдацын ТАЙЛАН — шат бүрээр задалсан ажлын жагсаалт (.docx).
 *
 * ⚠️ 2026-10-19 (хэрэглэгч): ерөнхий DOM цуглуулагч (`viewReport.collect`) энэ хуудсаас
 *    «27 · 3 · 4 · 5 · 6 · Шилжүүлсэн» гэх мэт тасархай мөрүүд гаргаж байсан — тайлан уншигдахгүй.
 *    Хэрэглэгчийн шаардлага:
 *      1. Гүйцэтгэгч компани — батлагдсан · илгээсэн боловч хянагдаж буй · буцаагдсан (засах) ажил;
 *      2. Хяналтын инженер — менежерт шилжүүлсэн · хүлээгдэж буй гэх мэт үе шатаар задлах.
 *    Тиймээс өгөгдлөөс (`Work[]`) шууд угсарна; дээд шатууд (менежер → газрын дарга) инженертэй
 *    ИЖИЛ дөрвөн хэсэгтэй (хүлээгдэж буй · буцаагдаж ирсэн · дээш шилжүүлсэн · доош буцаасан).
 *
 * ⚠️ ЦЭВЭР функц — `now`-ыг гаднаас авна (`pendingAging`-тай ижил), тестлэх боломжтой.
 * ⚠️ Ажлын ОДООГИЙН тойрог (`Work.current`) л тооцогдоно — хуучин тойргийн шийдвэр нь түүх.
 */

import { t as tr } from './i18nCore';
import type { DocBlock } from './docx';
import {
  DECISION, F, OWNER, RETURNED_STATUS, REVIEW_STAGES, REVIEW_STATUS, SF, STAGE_ORDER, STATUS,
  nextReview, prevReview, type ReviewStage, type Row,
} from './hyanalt';
import { pendingAging, STAGE_LABEL, type Work } from './hyanaltGroup';

const p2 = (x: number) => String(x).padStart(2, '0');
/** ISO → YYYY-MM-DD (огноогүй бол хоосон) */
const day = (v: string | null | undefined): string => {
  const n = v ? Date.parse(v) : NaN;
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const txt = (v: unknown): string => String(v ?? '').trim();
const rank = (w: Work) => STAGE_ORDER.indexOf(OWNER[w.status] ?? 'company');

/** Шатны хэсгийн ГАРЧИГ — монгол хэлний тийн ялгалын улмаас параметрээр биш, шууд бичнэ */
/* ⚠️ 2026-10-27 (main-тай тэнцүүлэв): 7 шат — `planner` (төлөвлөлтийн инженер) нэмэгдэж, шатны нэр солигдсон (`STAGE_LABEL`) */
const UP_TITLE: Record<ReviewStage, () => string> = {
  engineer: () => tr('Багцын ахлах инженерт шилжүүлсэн ажил'),
  manager: () => tr('Төлөвлөлтийн инженерт шилжүүлсэн ажил'),
  planner: () => tr('Төлөвлөлтийн ахлах инженерт шилжүүлсэн ажил'),
  director: () => tr('Хэлтсийн даргад шилжүүлсэн ажил'),
  head: () => tr('Газрын даргад шилжүүлсэн ажил'),
  chief: () => tr('Баталж бүртгэсэн ажил'),
};
const DOWN_TITLE: Record<ReviewStage, () => string> = {
  engineer: () => tr('Гүйцэтгэгч компанид буцаасан ажил'),
  manager: () => tr('Хяналтын инженерт буцаасан ажил'),
  planner: () => tr('Багцын ахлах инженерт буцаасан ажил'),
  director: () => tr('Төлөвлөлтийн инженерт буцаасан ажил'),
  head: () => tr('Төлөвлөлтийн ахлах инженерт буцаасан ажил'),
  chief: () => tr('Хэлтсийн даргад буцаасан ажил'),
};

/** Өмнөх шат ИЛГЭЭСЭН огноо — тухайн шатанд ирсэн агшин */
const arrived = (r: Row, s: ReviewStage): string | null => {
  const p = prevReview(s);
  return p ? r[SF[p].sent as keyof Row] as string | null : r[F.companySent];
};

type Col = { head: string; cell: (w: Work, i: number) => string };

/** Нэг хэсэг: H2 гарчиг (тоотой) + хүснэгт, ажилгүй бол «ажил алга» (⚠️ 2026-10-19: 0 бол тоо бичихгүй — хэрэглэгч) */
function section(out: DocBlock[], title: string, list: Work[], cols: Col[]): void {
  out.push({ kind: 'h', level: 2, text: list.length ? `${title}: ${list.length}` : title });
  if (!list.length) {
    out.push({ kind: 'p', text: tr('Ажил алга.'), italic: true, color: '777777' });
    return;
  }
  out.push({
    kind: 'table',
    head: [cols.map((c) => c.head)],
    rows: list.map((w, i) => cols.map((c) => c.cell(w, i))),
  });
}

export function guitsetgelBlocks(works: Work[], now: number): DocBlock[] {
  const wait = new Map(pendingAging(works, now).map((p) => [p.work.key, p.days]));
  const days = (w: Work) => { const d = wait.get(w.key); return d == null ? '' : String(d); };

  const NO: Col = { head: '№', cell: (_w, i) => String(i + 1) };
  const BASE: Col[] = [
    NO,
    { head: tr('Багц'), cell: (w) => txt(w.bagts) },
    { head: tr('Ажил'), cell: (w) => txt(w.ajil) },
    { head: tr('Гүйцэтгэгч компани'), cell: (w) => txt(w.company) },
  ];
  const stageNow = (w: Work) => (w.status === STATUS.transferred ? tr('Батлагдсан') : STAGE_LABEL[OWNER[w.status] ?? 'company']);

  /* ── Гүйцэтгэгч компани ── */
  const approved = works.filter((w) => w.status === STATUS.transferred);
  const inReview = works.filter((w) => w.status !== STATUS.transferred && w.status !== STATUS.engineerReturned);
  const toFix = works.filter((w) => w.status === STATUS.engineerReturned);

  /* ── Хянах шат бүр ── */
  const per = REVIEW_STAGES.map((s) => {
    const next = nextReview(s);
    const me = STAGE_ORDER.indexOf(s);
    return {
      s,
      next,
      pending: works.filter((w) => w.status === REVIEW_STATUS[s]),
      back: next ? works.filter((w) => w.status === RETURNED_STATUS[next]) : [],
      /* ⚠️ Одоогийн тойрогт зөвшөөрсөн БА ажил дээд шатанд (эсвэл батлагдсан) — дээд шат буцаавал
         ажил энэ шатны «буцаагдаж ирсэн» хэсэгт шилжинэ, энд давхар тоологдохгүй. */
      up: works.filter((w) => w.current[SF[s].decision as keyof Row] === DECISION.approve
        && (w.status === STATUS.transferred || rank(w) > me)),
      down: works.filter((w) => w.status === RETURNED_STATUS[s]),
    };
  });

  const out: DocBlock[] = [];

  /* Нэгтгэл — дугаарлагдахгүй (H2), шатны хэсгүүд 1, 2, … */
  out.push(
    { kind: 'h', level: 2, text: tr('Нэгтгэл') },
    { kind: 'p', text: tr('Нийт {0} ажил · батлагдсан {1} · хянагдаж буй {2} · засах шаардлагатай {3}',
      String(works.length), String(approved.length), String(inReview.length), String(toFix.length)) },
    {
      kind: 'table',
      head: [[tr('Шат'), tr('Хүлээгдэж буй'), tr('Буцаагдаж ирсэн'), tr('Дээш шилжүүлсэн'), tr('Доош буцаасан')]],
      rows: [
        [STAGE_LABEL.company, '', String(toFix.length), String(approved.length + inReview.length), ''],
        ...per.map((p) => [STAGE_LABEL[p.s], String(p.pending.length), p.next ? String(p.back.length) : '',
          String(p.up.length), String(p.down.length)]),
      ],
    },
  );

  out.push({ kind: 'h', level: 1, text: STAGE_LABEL.company });
  section(out, tr('Батлагдсан ажил'), approved, [
    ...BASE,
    { head: tr('Илгээсэн'), cell: (w) => day(w.current[F.companySent]) },
    { head: tr('Батлагдсан'), cell: (w) => day(w.current[F.chiefSent]) },
  ]);
  section(out, tr('Илгээсэн, хянагдаж буй ажил'), inReview, [
    ...BASE,
    { head: tr('Илгээсэн'), cell: (w) => day(w.current[F.companySent]) },
    { head: tr('Одоогийн шат'), cell: stageNow },
    { head: tr('Хүлээсэн хоног'), cell: days },
  ]);
  section(out, tr('Буцаагдсан, засах шаардлагатай ажил'), toFix, [
    ...BASE,
    { head: tr('Буцаасан'), cell: (w) => day(w.current[F.engineerReturned]) },
    { head: tr('Шалтгаан'), cell: (w) => txt(w.current[F.engineerReason]) },
  ]);

  for (const p of per) {
    out.push({ kind: 'h', level: 1, text: STAGE_LABEL[p.s] });
    section(out, tr('Хүлээгдэж буй ажил'), p.pending, [
      ...BASE,
      { head: tr('Ирсэн'), cell: (w) => day(arrived(w.current, p.s)) },
      { head: tr('Хүлээсэн хоног'), cell: days },
      { head: tr('Хариуцагч'), cell: (w) => txt(w.current[SF[p.s].who as keyof Row]) },
    ]);
    if (p.next) {
      const n = p.next;
      section(out, tr('{0} буцааж ирүүлсэн, дахин шалгах', STAGE_LABEL[n]), p.back, [
        ...BASE,
        { head: tr('Буцаасан'), cell: (w) => day(w.current[SF[n].returned as keyof Row] as string | null) },
        { head: tr('Шалтгаан'), cell: (w) => txt(w.current[SF[n].reason as keyof Row]) },
      ]);
    }
    section(out, UP_TITLE[p.s](), p.up, [
      ...BASE,
      { head: tr('Илгээсэн'), cell: (w) => day(w.current[SF[p.s].sent as keyof Row] as string | null) },
      { head: tr('Одоогийн шат'), cell: stageNow },
    ]);
    section(out, DOWN_TITLE[p.s](), p.down, [
      ...BASE,
      { head: tr('Буцаасан'), cell: (w) => day(w.current[SF[p.s].returned as keyof Row] as string | null) },
      { head: tr('Шалтгаан'), cell: (w) => txt(w.current[SF[p.s].reason as keyof Row]) },
    ]);
  }
  return out;
}
