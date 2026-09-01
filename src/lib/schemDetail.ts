/**
 * ЗАНГИЛААНЫ ДЭЛГЭРЭНГҮЙ — «системийг нэг бүрчлэн хянах» самбарын ЦЭВЭР ЗАГВАР.
 *
 * ⚠️ REACT Ч, СҮЛЖЭЭ Ч ЭНД ОРОХГҮЙ (`schem.ts`-тэй ижил гэрээ) — тиймээс
 * `schemDetail.check.mjs` түүнийг шууд импортлон шалгана.
 *
 * ⚠️ ШИНЭ ArcGIS QUERY ГАРАХГҮЙ. Энд гарах БҮХ хүснэгт нь `schemData.ts` аль
 * хэдийн татсан `SchemSources`-оос гарна. Дэлгэрэнгүй нь өгөгдөл ДУТУУ
 * байснаас биш, дэлгэцэд ГАРААГҮЙ байснаас дутуу байсан: `zov` нь зөвшөөрлийн
 * БҮХ мөр, `review` нь хяналтын БҮХ мөр, `bagts` нь багц бүрийн гүйцэтгэл,
 * блок, гүйцэтгэгч, `finance.byBagts` нь багц бүрийн төсвийг аль хэдийн
 * авчирдаг байсан ч зангилаанд ердөө 1–3 тоо л харагддаг байв.
 *
 * ⚠️ `null` ≠ 0. Задаргааны нүд ч мөн адил: тооцоологдоогүй нүд `null` хэвээр
 * үлдэж «—» болно. Энэ репогийн хамгийн олон давтагдсан алдаа.
 *
 * ⚠️ ДҮРМИЙГ ДАВХАРДУУЛАХГҮЙ. Багцын шүүлт (`samePkg`), ажлаар бүлэглэх
 * (`groupWorks`), NaN цэвэрлэх (`fin`), босго (`TH`) — бүгд НЭГ эх сурвалжаас
 * импортлогдоно. Хуулбарлавал схемийн зангилаа ба самбар нь ижил агшинд ӨӨР
 * тоо харуулж эхэлнэ.
 */

import { t as tr } from '@/lib/i18nCore';
import { TOLOV, type Zov } from '@/lib/zovshoorol';
import { groupWorks, STAGE_LABEL } from '@/lib/hyanaltGroup';
import { STAGE_ORDER, F as HF } from '@/lib/hyanalt';
import {
  SOURCE_NAME, TH, ageDays, fin, reviewCounts, samePkg, toWork,
  type BagtsLite, type Health, type Metric, type MetricKind,
  type SchemId, type SchemSources, type SourceKey,
} from '@/lib/schem';

/* ══════════════════ Төрөл ══════════════════ */

/**
 * Хүснэгтийн нэг нүд.
 * ⚠️ `kind` өгвөл дэлгэц дээр МЕТРИКИЙН адил (`show()`) хэлбэржинэ; өгөөгүй бол
 *    түүхий текст. `v === null` нь ҮРГЭЛЖ «—», хэзээ ч 0 биш.
 */
export type Cell = { v: string | number | null; kind?: MetricKind };

export type DetailTable = { title: string; cols: string[]; rows: Cell[][] };

/** Анхаарал татах нэг мөр — өнгө нь `Health`-ийн ижил хэлээр */
export type Issue = { text: string; tone: Health };

export type SchemDetail = {
  /** Зангилаанд БАГТААГҮЙ метрикүүдийг Ч агуулсан бүрэн жагсаалт */
  metrics: Metric[];
  tables: DetailTable[];
  issues: Issue[];
  /** ЭНЭ зангилаа аль эх сурвалжаас гарав, тэдгээр нь татагдсан уу */
  sources: { name: string; ok: boolean }[];
};

/**
 * ЗАНГИЛАА ↔ ЭХ СУРВАЛЖ.
 *
 * ⚠️ Энэ бол «нэг бүрчлэн хянах»-ын ГОЛ хэсэг: тоо нь «—» байхад «үйлчилгээ
 * унасан уу, эсвэл үнэхээр өгөгдөл байхгүй юү» гэдгийг хэрэглэгч ТААХГҮЙ.
 * `huvaari` нь ЗОРИУДААР хоосон — тэр зангилаа амьд эх сурвалжгүй
 * (`schem.ts`-ийн баримтжуулсан шийдвэр).
 */
export const NODE_SOURCE: Record<SchemId, readonly SourceKey[]> = {
  tolovlolt: ['headline'],
  zovshoorol: ['zov'],
  gazar: ['clearance'],
  huvaari: [],
  barilga: ['overall', 'progress', 'bagts'],
  hyanalt: ['review'],
  habea: ['habea'],
  ersdel: ['progress'],
  sankhuu: ['finance', 'bagts'],
  tailan: ['overall', 'progress'],
};

/* ══════════════════ Туслах ══════════════════ */

const cell = (v: string | number | null, kind?: MetricKind): Cell => ({ v, kind });

/** ms → «YYYY-MM-DD». ⚠️ UTC-гээр — орон нутгийн бүсээр огноо нэг хоног ухарна. */
const dayText = (ms: number | null): string => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return new Date(ms).toISOString().slice(0, 10);
};

const noName = (): string => tr('нэргүй');

/**
 * ⚠️ ЖАГСААЛТЫГ ЧИМЭЭГҮЙ ТАСЛАХГҮЙ. Хяналтын хүснэгтэд мянган мөр байж болно;
 * бүгдийг зурвал самбар ашиглагдахаа болино. Гэвч таслалыг НУУВАЛ хэрэглэгч
 * «эдгээр нь бүгд» гэж уншина — тиймээс тасалсан тоог мөр болгож ил үлдээнэ.
 */
const CAP = 40;
function capped<T>(list: T[]): { shown: T[]; hidden: number } {
  return { shown: list.slice(0, CAP), hidden: Math.max(0, list.length - CAP) };
}

/** Багцаар шүүх — ЗӨВХӨН `samePkg` (бичиглэлийн зөрүүний занга) */
const pickPkg = <T>(list: T[], pkg: string | null, of: (x: T) => unknown): T[] => (
  pkg ? list.filter((x) => samePkg(of(x), pkg)) : list
);

/* ══════════════════ Зангилаа тус бүр ══════════════════ */

type Part = { metrics: Metric[]; tables: DetailTable[]; issues: Issue[] };
const emptyPart = (): Part => ({ metrics: [], tables: [], issues: [] });

/* ── Ерөнхий төлөвлөгөө ── */
function tolovloltPart(src: SchemSources): Part {
  const p = emptyPart();
  const area = fin(src.headline?.areaHa);
  const pop = fin(src.headline?.population);
  p.metrics.push(
    { label: tr('Төслийн талбай'), value: area, kind: 'ha' },
    { label: tr('Хүн ам'), value: pop, kind: 'count' },
    { label: tr('Төсөвт өртөг'), value: fin(src.headline?.investTotal), kind: 'mnt' },
    {
      label: tr('Нягтрал (хүн/га)'),
      value: area != null && pop != null && area > 0 ? pop / area : null,
      kind: 'count',
      why: tr('Талбай ба хүн амын аль нэг нь мэдэгдэхгүй бол тооцохгүй'),
    },
  );
  if (src.headline == null) {
    p.issues.push({
      text: tr('Ерөнхий үзүүлэлт татагдсангүй — дөрвөн тоо тооцоологдоогүй.'),
      tone: 'none',
    });
  }
  return p;
}

/* ── Зөвшөөрөл ── */
function zovPart(src: SchemSources, pkg: string | null): Part {
  const p = emptyPart();
  const all = src.zov;
  if (!all) {
    p.metrics.push({
      label: tr('Нийт зөвшөөрөл'),
      value: null,
      kind: 'count',
      why: tr('Үйлчилгээ татагдсангүй'),
    });
    p.issues.push({ text: tr('Зөвшөөрлийн үйлчилгээ татагдсангүй.'), tone: 'none' });
    return p;
  }
  const mine = pickPkg(all, pkg, (z) => z.bagts);
  const n = (list: Zov[], tolov: string) => list.filter((z) => z.tolov === tolov).length;
  const unknown = mine.filter((z) => z.tolov === 'unknown');
  p.metrics.push(
    { label: tr('Нийт зөвшөөрөл'), value: mine.length, kind: 'count' },
    { label: tr('Зөвшөөрсөн'), value: n(mine, TOLOV.ok), kind: 'count' },
    { label: tr('Хүлээгдэж буй'), value: n(mine, TOLOV.wait), kind: 'count' },
    { label: tr('Зөвшөөрөөгүй'), value: n(mine, TOLOV.no), kind: 'count' },
    { label: tr('Танигдаагүй төлөв'), value: unknown.length, kind: 'count' },
  );

  /* Багцаар — багц сонгосон ч БҮХ багц харагдана (харьцуулах боломж) */
  const by = new Map<string, Zov[]>();
  for (const z of all) {
    const k = z.bagts || tr('Тодорхойгүй');
    const a = by.get(k) ?? [];
    a.push(z);
    by.set(k, a);
  }
  p.tables.push({
    title: tr('Багцаар'),
    cols: [tr('Багц'), tr('Зөвшөөрсөн'), tr('Хүлээгдэж буй'), tr('Зөвшөөрөөгүй'), tr('Танигдаагүй')],
    rows: [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'mn'))
      .map(([k, list]) => [
        cell(k),
        cell(n(list, TOLOV.ok), 'count'),
        cell(n(list, TOLOV.wait), 'count'),
        cell(n(list, TOLOV.no), 'count'),
        cell(list.filter((z) => z.tolov === 'unknown').length, 'count'),
      ]),
  });

  /* Мөр тус бүр — ЗӨВХӨН багц сонгосон үед (эс тэгвээс хэдэн зуун мөр) */
  if (pkg) {
    const { shown, hidden } = capped(mine.slice().sort((a, b) => a.shat - b.shat));
    p.tables.push({
      title: tr('Зөвшөөрөл тус бүрээр'),
      cols: [tr('Шат'), tr('Нэр'), tr('Төлөв'), tr('Огноо'), tr('Байгууллага')],
      rows: [
        ...shown.map((z) => [
          cell(z.shat, 'count'),
          cell(z.ner || noName()),
          cell(z.tolov === 'unknown' ? tr('танигдаагүй') : z.tolov),
          cell(dayText(z.ognoo)),
          cell(z.baiguullaga || '—'),
        ]),
        ...(hidden > 0
          ? [[cell(tr('… бас {0} мөр', hidden)), cell(''), cell(''), cell(''), cell('')]]
          : []),
      ],
    });
  }

  /**
   * ⚠️ ТАНИГДААГҮЙ ТӨЛӨВИЙГ НЭР ЗААЖ ЖАГСААНА. Тэдгээр нь `zovshoorol.ts`-ийн
   * баримтжуулсан занга — толинд байхгүй утга чимээгүй «зөвшөөрөгдсөн» мэт
   * ногоон болж болзошгүй. Аль мөр болохыг мэдэхгүй бол засах ч боломжгүй.
   */
  for (const z of capped(unknown).shown) {
    p.issues.push({
      text: tr('«{0}» ({1}) — төлөв танигдсангүй: «{2}»', z.ner || noName(), z.bagts, String(z.tolov)),
      tone: 'bad',
    });
  }
  const waitNoDate = mine.filter((z) => z.tolov === TOLOV.wait && z.ognoo == null);
  if (waitNoDate.length) {
    p.issues.push({
      text: tr('{0} хүлээгдэж буй зөвшөөрөлд огноо алга.', waitNoDate.length),
      tone: 'warn',
    });
  }
  return p;
}

/* ── Газар чөлөөлөлт ── */
function gazarPart(src: SchemSources): Part {
  const p = emptyPart();
  const c = src.clearance;
  const clr = fin(c?.pct);
  p.metrics.push(
    { label: tr('Чөлөөлсөн'), value: clr, kind: 'pct' },
    { label: tr('Нийт нэгж талбар'), value: fin(c?.total), kind: 'count' },
    { label: tr('Чөлөөлсөн нэгж талбар'), value: fin(c?.cleared), kind: 'count' },
    { label: tr('Үлдсэн нэгж талбар'), value: fin(c?.remaining), kind: 'count' },
    { label: tr('Үлдсэн талбай'), value: fin(c?.remainingHa), kind: 'ha' },
  );
  if (c == null) {
    p.issues.push({ text: tr('Газар чөлөөлөлтийн эх сурвалж татагдсангүй.'), tone: 'none' });
  } else if (clr != null && clr < TH.gazarPct.warn) {
    p.issues.push({
      text: tr('Чөлөөлөлт {0}% — барилга эхлүүлэх нөхцөл бүрдээгүй.', clr.toFixed(0)),
      tone: 'bad',
    });
  }
  return p;
}

/* ── Хуваарь ── */
function huvaariPart(): Part {
  const p = emptyPart();
  p.metrics.push({
    label: tr('Хуваарийн хамралт'),
    value: null,
    kind: 'pct',
    why: tr('Хуваарь багц бүрээр ачаалагддаг — схемд амьд тоо гаргахгүй'),
  });
  /**
   * ⚠️ ШАЛТГААНЫГ ИЛ БИЧНЭ. Урьд нь зөвхөн tooltip-д нуугдсан байсан тул «энэ
   * тоо яагаад үргэлж — байдаг юм бэ» гэсэн асуулт хариултгүй үлддэг байв.
   */
  p.issues.push({
    text: tr('Хуваарийн хамралт нь багц тус бүрийн бүх мөрийг татаж байж бодогддог. Схем нээх бүрд тэр хүсэлтийг явуулбал бусад тоо ч удаашрах тул энд ЗОРИУДААР тооцохгүй — «Хуваарь» харагдацаас үзнэ үү.'),
    tone: 'none',
  });
  return p;
}

/* ── Барилга угсралт ── */
function barilgaPart(src: SchemSources, pkg: string | null): Part {
  const p = emptyPart();
  const rows: BagtsLite[] = src.bagts ?? [];
  const row = pkg
    ? rows.find((b) => samePkg(b.label, pkg) || samePkg(b.key, pkg)) ?? null
    : null;
  const weightSum = fin(src.overall?.weightSum);
  const sum = (of: (b: BagtsLite) => number) => (
    src.bagts ? rows.reduce((s, b) => s + of(b), 0) : null
  );

  p.metrics.push(
    { label: tr('Гүйцэтгэл'), value: row ? fin(row.progress) : fin(src.overall?.pct), kind: 'pct' },
    { label: tr('Блок'), value: row ? row.blocks : fin(src.progress?.blocks), kind: 'count' },
    { label: tr('Тайлангүй блок'), value: row ? row.missing : sum((b) => b.missing), kind: 'count' },
    { label: tr('Айлын тоо'), value: row ? row.ail : sum((b) => b.ail), kind: 'count' },
    { label: tr('Төсвийн жингийн хамралт'), value: weightSum, kind: 'pct' },
    { label: tr('Бүртгэгдсэн блок'), value: fin(src.overall?.rows), kind: 'count' },
  );

  if (src.bagts) {
    p.tables.push({
      title: tr('Багцаар'),
      cols: [tr('Багц'), tr('Гүйцэтгэл'), tr('Блок'), tr('Тайлангүй'), tr('Айл'), tr('Гүйцэтгэгч')],
      rows: rows.map((b) => [
        cell(b.label),
        cell(fin(b.progress), 'pct'),
        cell(b.blocks, 'count'),
        cell(b.missing, 'count'),
        cell(b.ail, 'count'),
        cell(b.contractor || '—'),
      ]),
    });
    /* ⚠️ ТАЙЛАНГҮЙ БЛОК нь гүйцэтгэлийг ЧИМЭЭГҮЙ доошлуулна — 0%-аар ордог */
    for (const b of capped(rows.filter((x) => x.missing > 0)).shown) {
      p.issues.push({
        text: tr('«{0}» — {1} блок тайлангүй ({2} блокоос).', b.label, b.missing, b.blocks),
        tone: 'warn',
      });
    }
  }
  if (weightSum != null && weightSum < 100) {
    p.issues.push({
      text: tr('Төсвийн жингийн {0}% л бүртгэгдсэн — нийт гүйцэтгэл дутуу хамралт дээр бодогдож байна.', weightSum.toFixed(0)),
      tone: 'warn',
    });
  }
  const stalled = fin(src.progress?.stalled);
  if (stalled != null && stalled > 0) {
    p.issues.push({ text: tr('{0} блок зогссон.', stalled), tone: 'warn' });
  }
  return p;
}

/* ── Гүйцэтгэлийн хяналт ── */
function hyanaltPart(src: SchemSources, pkg: string | null): Part {
  const p = emptyPart();
  const review = src.review;
  if (!review) {
    p.metrics.push({
      label: tr('Хүлээгдэж буй'),
      value: null,
      kind: 'count',
      why: tr('Үйлчилгээ татагдсангүй'),
    });
    p.issues.push({ text: tr('Гүйцэтгэлийн хяналтын хүснэгт татагдсангүй.'), tone: 'none' });
    return p;
  }
  const mine = pickPkg(review, pkg, (r) => r[HF.bagts]);
  const rc = reviewCounts(mine);
  const works = groupWorks(mine.map(toWork));
  p.metrics.push(
    { label: tr('Хүлээгдэж буй'), value: rc.pending, kind: 'count' },
    { label: tr('Буцаасан'), value: rc.returned, kind: 'count' },
    /* ⚠️ АЖИЛ vs МӨР — мөр бүр НЭГ ТОЙРОГ. Хоёуланг нь үзүүлбэл зөрүү ойлгомжтой. */
    { label: tr('Нийт ажил'), value: works.length, kind: 'count' },
    { label: tr('Нийт тойрог (мөр)'), value: mine.length, kind: 'count' },
  );

  p.tables.push({
    title: tr('Шатаар'),
    cols: [tr('Шат'), tr('Хүлээгдэж буй ажил')],
    rows: STAGE_ORDER.map((s) => [cell(STAGE_LABEL[s]), cell(rc.byStage[s], 'count')]),
  });

  /* Багцаар — багц сонгосон ч бүх багц (аль нь гацсаныг харьцуулна) */
  const pkgs = [...new Set(review.map((r) => String(r[HF.bagts] ?? '')))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'mn'));
  p.tables.push({
    title: tr('Багцаар'),
    cols: [tr('Багц'), tr('Хүлээгдэж буй'), tr('Буцаасан')],
    rows: pkgs.map((k) => {
      const c = reviewCounts(review.filter((r) => samePkg(r[HF.bagts], k)));
      return [cell(k), cell(c.pending, 'count'), cell(c.returned, 'count')];
    }),
  });

  /**
   * БУЦААГДСАН АЖЛУУД — «нэг бүрчлэн хянах»-ын гол хүснэгт.
   * ⚠️ `groupWorks`-ээр НЭГ ажил = НЭГ мөр. Түүхий мөрөөр жагсаавал 8 ажил 30
   *    мөр болж, зангилааны тоотой зөрнө.
   */
  const back = (w: (typeof works)[number]) => (
    w.engineerReturns + w.managerReturns + w.directorReturns
  );
  const stuck = works.filter((w) => back(w) > 0).sort((a, b) => back(b) - back(a));
  if (stuck.length) {
    const { shown, hidden } = capped(stuck);
    p.tables.push({
      title: tr('Буцаагдсан ажлууд'),
      cols: [tr('Багц'), tr('Ажил'), tr('Компани'), tr('Буцаалт'), tr('Тойрог')],
      rows: [
        ...shown.map((w) => [
          cell(w.bagts),
          cell(w.ajil),
          cell(w.company || '—'),
          cell(back(w), 'count'),
          cell(w.cycles.length, 'count'),
        ]),
        ...(hidden > 0
          ? [[cell(tr('… бас {0} ажил', hidden)), cell(''), cell(''), cell(''), cell('')]]
          : []),
      ],
    });
    for (const w of capped(stuck.filter((x) => back(x) >= 2)).shown) {
      p.issues.push({
        text: tr('«{0}» ({1}) — {2} удаа буцаагдсан.', w.ajil, w.bagts, back(w)),
        tone: 'bad',
      });
    }
  }
  return p;
}

/* ── ХАБЭА ── */
function habeaPart(src: SchemSources): Part {
  const p = emptyPart();
  const inc = fin(src.habea?.incidents);
  const workers = fin(src.habea?.workers);
  p.metrics.push(
    { label: tr('Ажилтан'), value: workers, kind: 'count' },
    { label: tr('Техник'), value: fin(src.habea?.tehnik), kind: 'count' },
    { label: tr('Осол, зөрчил'), value: inc, kind: 'count' },
    {
      label: tr('1000 ажилтанд ногдох осол'),
      value: inc != null && workers != null && workers > 0 ? (inc / workers) * 1000 : null,
      kind: 'count',
      why: tr('Ажилтны тоо мэдэгдэхгүй бол тооцохгүй'),
    },
  );
  if (src.habea == null) {
    p.issues.push({ text: tr('ХАБЭА-гийн эх сурвалж татагдсангүй.'), tone: 'none' });
  } else if (inc != null && inc > 0) {
    p.issues.push({ text: tr('{0} осол, зөрчил бүртгэгдсэн.', inc), tone: 'bad' });
  }
  return p;
}

/* ── Эрсдэл ── */
function ersdelPart(src: SchemSources): Part {
  const p = emptyPart();
  const stalled = fin(src.progress?.stalled);
  const blocks = fin(src.progress?.blocks);
  p.metrics.push(
    { label: tr('Зогссон блок'), value: stalled, kind: 'count' },
    { label: tr('Нийт блок'), value: blocks, kind: 'count' },
    {
      label: tr('Зогссоны эзлэх хувь'),
      value: stalled != null && blocks != null && blocks > 0 ? (stalled / blocks) * 100 : null,
      kind: 'pct',
    },
  );
  if (src.progress == null) {
    p.issues.push({ text: tr('Блокийн гүйцэтгэлийн эх сурвалж татагдсангүй.'), tone: 'none' });
  } else if (stalled != null && stalled > 0) {
    p.issues.push({ text: tr('{0} блок дээр хөдөлгөөн зогссон.', stalled), tone: 'warn' });
  }
  return p;
}

/* ── Санхүүжилт ── */
function sankhuuPart(src: SchemSources, pkg: string | null): Part {
  const p = emptyPart();
  const rows: BagtsLite[] = src.bagts ?? [];
  const fi = src.finance;
  const row = pkg
    ? rows.find((b) => samePkg(b.label, pkg) || samePkg(b.key, pkg)) ?? null
    : null;
  const budget = row && fi ? fin(fi.byBagts[row.key]) : fin(fi?.budget);
  /* ⚠️ Олголт нь БАГЦААР задардаггүй — багц сонгосон үед харьцаа гаргахгүй */
  const paid = row ? null : fin(fi?.paid);
  const contract = row ? null : fin(fi?.contractAmount);
  p.metrics.push(
    { label: tr('Төсөвт өртөг'), value: budget, kind: 'mnt' },
    {
      label: tr('Гэрээний дүн'),
      value: contract,
      kind: 'mnt',
      why: row ? tr('Гэрээ багцаар задардаггүй') : undefined,
    },
    {
      label: tr('Олгосон'),
      value: paid,
      kind: 'mnt',
      why: row ? tr('Олголт багцаар задардаггүй') : undefined,
    },
    {
      label: tr('Олголтын хувь'),
      value: paid != null && budget != null && budget > 0 ? (paid / budget) * 100 : null,
      kind: 'pct',
    },
    {
      label: tr('Үлдэгдэл'),
      value: paid != null && budget != null ? budget - paid : null,
      kind: 'mnt',
    },
  );

  if (src.bagts && fi) {
    p.tables.push({
      title: tr('Багцаар'),
      cols: [tr('Багц'), tr('Төсөвт өртөг'), tr('Гүйцэтгэл')],
      /* ⚠️ `byBagts`-д БАЙХГҮЙ багцын нүд `null` — 0 БИШ. «Төсөв тэг» гэж
         худал хэлбэл тэр багц санхүүжилтгүй мэт харагдана. */
      rows: rows.map((b) => [
        cell(b.label),
        cell(fin(fi.byBagts[b.key]), 'mnt'),
        cell(fin(b.progress), 'pct'),
      ]),
    });
  }
  if (fi == null) {
    p.issues.push({ text: tr('Санхүүгийн эх сурвалж татагдсангүй.'), tone: 'none' });
  }
  if (paid != null && budget != null && paid > budget) {
    p.issues.push({ text: tr('Олгосон дүн төсөвт өртгөөс давсан.'), tone: 'bad' });
  }
  if (contract != null && budget != null && contract > budget) {
    p.issues.push({ text: tr('Гэрээний дүн төсөвт өртгөөс их байна.'), tone: 'warn' });
  }
  return p;
}

/* ── Тайлан ── */
function tailanPart(src: SchemSources): Part {
  const p = emptyPart();
  const ageD = ageDays(src.progress?.date);
  p.metrics.push(
    { label: tr('Сүүлийн тайлангийн нас'), value: ageD, kind: 'day' },
    { label: tr('Бүртгэгдсэн блок'), value: fin(src.overall?.rows), kind: 'count' },
    { label: tr('Нийт гүйцэтгэл'), value: fin(src.overall?.pct), kind: 'pct' },
  );
  if (src.progress?.date) {
    p.tables.push({
      title: tr('Сүүлийн тайлан'),
      cols: [tr('Талбар'), tr('Утга')],
      rows: [[cell(tr('Огноо')), cell(src.progress.date)]],
    });
  }
  if (ageD == null) {
    p.issues.push({ text: tr('Сүүлийн тайлангийн огноо мэдэгдэхгүй.'), tone: 'none' });
  } else if (ageD >= TH.reportAgeD.bad) {
    p.issues.push({
      text: tr('Сүүлийн тайлан {0} хоногийн өмнөх — шинэчлэгдээгүй.', ageD),
      tone: 'bad',
    });
  } else if (ageD >= TH.reportAgeD.warn) {
    p.issues.push({ text: tr('Сүүлийн тайлан {0} хоногийн өмнөх.', ageD), tone: 'warn' });
  }
  return p;
}

/* ══════════════════ Нийтийн орц ══════════════════ */

const PART: Record<SchemId, (src: SchemSources, pkg: string | null) => Part> = {
  tolovlolt: (s) => tolovloltPart(s),
  zovshoorol: (s, p) => zovPart(s, p),
  gazar: (s) => gazarPart(s),
  huvaari: () => huvaariPart(),
  barilga: (s, p) => barilgaPart(s, p),
  hyanalt: (s, p) => hyanaltPart(s, p),
  habea: (s) => habeaPart(s),
  ersdel: (s) => ersdelPart(s),
  sankhuu: (s, p) => sankhuuPart(s, p),
  tailan: (s) => tailanPart(s),
};

/**
 * НЭГ ЗАНГИЛААНЫ ДЭЛГЭРЭНГҮЙ.
 *
 * @param pkg Багцын нэр. `null` бол төслийн нийт.
 *
 * ⚠️ Багцаар ЗАДАРДАГГҮЙ зангилаа (`tolovlolt`, `gazar`, `habea`, `ersdel`,
 *    `tailan`) нь багц сонгосон ч төслийн тоогоо хэвээр барина — `buildSchem`-ийн
 *    `projectWide` дүрэмтэй ИЖИЛ. Хоёр газар өөр дүгнэвэл зангилаа ба самбар
 *    ижил агшинд ӨӨР тоо харуулна.
 */
export function nodeDetail(
  src: SchemSources,
  id: SchemId,
  pkg: string | null = null,
): SchemDetail {
  const part = PART[id](src, pkg);
  const failed = new Set(src.failed);
  return {
    ...part,
    sources: NODE_SOURCE[id].map((k) => ({
      name: SOURCE_NAME[k],
      ok: !failed.has(SOURCE_NAME[k]),
    })),
  };
}
