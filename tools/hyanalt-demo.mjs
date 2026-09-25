/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — ТҮР ЖИШЭЭ ӨГӨГДӨЛ.
 *
 * ⚠️ ЗӨВХӨН урсгалыг нүдээр харах зорилготой. Бодит ажлын өгөгдөл БИШ.
 * ⚠️ Ажлын нэр бүр «ЖИШЭЭ —» гэж эхэлдэг тул цэвэрлэлт нь ЯГ эдгээрийг л
 *    олно — бодит бүртгэлд хүрэхгүй.
 *
 *   үүсгэх :  node --experimental-transform-types --import ./tools/ts-alias.mjs tools/hyanalt-demo.mjs --target=<HYANALT.url> --i-know-this-is-production
 *   устгах :  … tools/hyanalt-demo.mjs --target=<HYANALT.url> --i-know-this-is-production --clean
 *
 * ⚠️ 2026-09-25: PRODUCTION ХАМГААЛАЛТ. `HYANALT.url` нь `.env`-ийн HJ-ээс
 *    гардаг ганц prod хүснэгт (өөр орчин алга), урьд нь loader admin токеныг
 *    чимээгүй залгадаг байв. Одоо `--target` (ЯГ `HYANALT.url`-тэй тэнцүү —
 *    скрипт бичих хаягаа өөрчилж чадахгүй тул таарахгүй бол татгалзана) БА
 *    `--i-know-this-is-production` хоёулаа байхгүй бол юу ч бичихгүй.
 *    Loader токен залгахаа больсон (зөвхөн `*.check.mjs`).
 */
import { addRows, queryAll, HYANALT, F, STATUS, DECISION } from '@/lib/hyanalt';

{
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === '--target' || a.startsWith('--target='));
  const target = i < 0 ? '' : (argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1] ?? '').trim();
  const norm = (u) => String(u).replace(/\/+$/, '').toLowerCase();
  if (!target || norm(target) !== norm(HYANALT.url)) {
    console.error(`⛔ Зорилтыг ил өг: --target=${HYANALT.url}  (скрипт ЗӨВХӨН энэ хаяг руу бичнэ)`);
    process.exit(1);
  }
  if (!argv.includes('--i-know-this-is-production')) {
    console.error('⛔ Энэ бол production хүснэгт. Итгэлтэй бол --i-know-this-is-production нэм.');
    process.exit(1);
  }
}

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
