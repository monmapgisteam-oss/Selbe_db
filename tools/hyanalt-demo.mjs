/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — ТҮР ЖИШЭЭ ӨГӨГДӨЛ.
 *
 * ⚠️ ЗӨВХӨН урсгалыг нүдээр харах зорилготой. Бодит ажлын өгөгдөл БИШ.
 * ⚠️ Ажлын нэр бүр «ЖИШЭЭ —» гэж эхэлдэг тул цэвэрлэлт нь ЯГ эдгээрийг л
 *    олно — бодит бүртгэлд хүрэхгүй.
 *
 *   үүсгэх :  node --experimental-transform-types --import ./tools/ts-alias.mjs tools/hyanalt-demo.mjs
 *   устгах :  node --experimental-transform-types --import ./tools/ts-alias.mjs tools/hyanalt-demo.mjs --clean
 */
import { addRows, queryAll, HYANALT, F, STATUS, DECISION } from '@/lib/hyanalt';

const D = (s) => Date.parse(s);
const MARK = 'ЖИШЭЭ — ';

if (process.argv.includes('--clean')) {
  const rows = await queryAll();
  const oids = rows.filter((r) => String(r[F.ajil] ?? '').startsWith(MARK)).map((r) => r[HYANALT.oid]);
  if (!oids.length) { console.log('Жишээ мөр алга'); process.exit(0); }
  const r = await fetch(`${HYANALT.url}/applyEdits`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', deletes: oids.join(',') }).toString(),
  });
  const j = await r.json();
  console.log('Устгав:', (j.deleteResults ?? []).filter((x) => x.success).length, 'мөр');
  process.exit(0);
}

const base = (n, o) => ({
  [F.id]: `G-${String(n).padStart(6, '0')}`,
  [F.sheetOid]: 900000 + n,
  [F.ergelt]: o.n,
  [F.bagts]: o.bagts,
  [F.ajil]: MARK + o.ajil,
  [F.company]: o.company,
  [F.companySent]: D(o.sent),
  [F.engineer]: o.eng ? 'Б.Болд' : '',
  [F.engineerDecision]: o.eng ?? '',
  [F.engineerReason]: o.engWhy ?? '',
  [F.engineerReturned]: o.eng === DECISION.return ? D(o.engAt) : null,
  [F.engineerSent]: o.eng === DECISION.approve ? D(o.engAt) : null,
  [F.manager]: o.mgr ? 'С.Отгоо' : '',
  [F.managerDecision]: o.mgr ?? '',
  [F.managerReason]: o.mgrWhy ?? '',
  [F.managerReturned]: o.mgr === DECISION.return ? D(o.mgrAt) : null,
  [F.managerSent]: o.mgr === DECISION.approve ? D(o.mgrAt) : null,
  [F.status]: o.status,
});

const A = { bagts: 'Багц 2', ajil: 'Гүйцэтгэл · 2026.08.19', company: 'Хятадын барилгын 6-р инженерийн товчоо' };
const rows = [
  /* ── А ажил: 3 тойрог, одоо МЕНЕЖЕР дээр ── */
  base(1, { ...A, n: 1, sent: '2026-08-17T09:15', eng: DECISION.return, engAt: '2026-08-17T11:40',
    engWhy: 'Хэмжилтийн акт хавсаргаагүй байна.', status: STATUS.engineerReturned }),
  base(2, { ...A, n: 2, sent: '2026-08-19T08:05', eng: DECISION.approve, engAt: '2026-08-19T09:26',
    mgr: DECISION.return, mgrAt: '2026-08-20T14:45',
    mgrWhy: 'Актын дугаар болон хүлээлгэн өгсөн огноо дутуу.', status: STATUS.managerReturned }),
  // ⚠️ Компани ДАХИН ИЛГЭЭГЭЭГҮЙ — огноо өмнөхтэй ижил тул «дахин шалгалт» болно
  base(3, { ...A, n: 3, sent: '2026-08-19T08:05', eng: DECISION.approve, engAt: '2026-08-21T10:12',
    status: STATUS.managerReview }),

  /* ── Б ажил: ИНЖЕНЕРийн дараалалд ── */
  base(4, { bagts: 'Багц 3.2', ajil: 'Гүйцэтгэл · 2026.08.21', company: 'Морин сувд ХХК',
    n: 1, sent: '2026-08-21T08:40', status: STATUS.engineerReview }),

  /* ── В ажил: КОМПАНИйн дараалалд ── */
  base(5, { bagts: 'Багц 1', ajil: 'Гүйцэтгэл · 2026.08.20',
    company: 'Хятадын 2 дахь металлурги групп корпорац',
    n: 1, sent: '2026-08-20T10:00', eng: DECISION.return, engAt: '2026-08-20T15:30',
    engWhy: 'Бөглөсөн гүйцэтгэлийн хувь талбайн бодит байдалтай тохирохгүй.',
    status: STATUS.engineerReturned }),
];

await addRows(rows);
console.log('Нэмэв:', rows.length, 'мөр');
const all = await queryAll();
console.log('Хүснэгтэд:', all.length, 'мөр');
