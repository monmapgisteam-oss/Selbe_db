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
  SOURCE_NAME, TH, ageDays, fin, grade, reviewCounts, samePkg, toWork,
  type BagtsLite, type Health, type Metric, type MetricKind,
  type SchemId, type SchemSources, type SourceKey,
} from '@/lib/schem';
import { GROUP_ROOT, type FineId } from '@/lib/schemFine';

/* ══════════════════ Төрөл ══════════════════ */

/**
 * Хүснэгтийн нэг нүд.
 * ⚠️ `kind` өгвөл дэлгэц дээр МЕТРИКИЙН адил (`show()`) хэлбэржинэ; өгөөгүй бол
 *    түүхий текст. `v === null` нь ҮРГЭЛЖ «—», хэзээ ч 0 биш.
 */
export type Cell = { v: string | number | null; kind?: MetricKind };

export type DetailTable = { title: string; cols: string[]; rows: Cell[][] };

/**
 * Анхаарал татах нэг мөр — өнгө нь `Health`-ийн ижил хэлээр.
 *
 * ⚠️ `at` нь НАРИЙН схемийн аль картад буухыг заана (2026-09-02). Заагаагүй бол
 * бүлгийн үндсэн картад (`GROUP_ROOT`) буна — «үйлчилгээ татагдсангүй» гэх мэт
 * бүлэг бүхэлдээ хамаарах анхааруулга. Ерөнхий схемд (бүлэг бүр ганц карттай)
 * энэ талбар хэрэглэгдэхгүй.
 */
export type Issue = { text: string; tone: Health; at?: FineId };

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
      at: 'zovNo',
    });
  }
  const waitNoDate = mine.filter((z) => z.tolov === TOLOV.wait && z.ognoo == null);
  if (waitNoDate.length) {
    p.issues.push({
      text: tr('{0} хүлээгдэж буй зөвшөөрөлд огноо алга.', waitNoDate.length),
      tone: 'warn',
      at: 'zovWait',
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
      at: 'gazLeft',
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
        at: 'barNo',
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
    p.issues.push({ text: tr('{0} блок зогссон.', stalled), tone: 'warn', at: 'bar' });
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
        at: 'hyCo',
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
    p.issues.push({ text: tr('{0} осол, зөрчил бүртгэгдсэн.', inc), tone: 'bad', at: 'habInc' });
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
    p.issues.push({ text: tr('Олгосон дүн төсөвт өртгөөс давсан.'), tone: 'bad', at: 'finPaid' });
  }
  if (contract != null && budget != null && contract > budget) {
    p.issues.push({ text: tr('Гэрээний дүн төсөвт өртгөөс их байна.'), tone: 'warn', at: 'finContract' });
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

/* ══════════════════ Картын ҮР ДҮН ══════════════════ */

/**
 * НАРИЙН КАРТ БҮРИЙН ҮР ДҮН — «энэ ажиллагаа хаана хүрсэн бэ».
 *
 * ⚠️ ЯАГААД (2026-09-02, хэрэглэгч: «карт болгон дээр үр дүнгийн alert
 * харагдана»). Урьд нь ЗӨВХӨН асуудалтай 6 картад дохио гардаг байсан тул
 * үлдсэн 18 карт нь «шалгагдсан ч хэвийн» юу, «огт тооцоологдоогүй» юу гэдэг
 * нь ЯЛГАГДАХГҮЙ байв — хоёулаа ижилхэн хоосон харагдана. Одоо карт бүр
 * өөрийн тоог төлөвтэйгээ хамт харуулна.
 *
 * ⚠️ ЭНЭ НЬ `schemFine.ts`-ийн «карт дээр тоо гарахгүй» гэсэн 2026-09-01-ний
 * шийдвэрийг ОРЛОВ (хэрэглэгчийн шинэ заавар). Тэр үед карт бүрд 2–3 метрик
 * гардаг байсныг хассан; одоо ЯГ НЭГ тоо гарна — зураг дүүрэхгүй, гэхдээ
 * «юу болсон» нь уншигдана.
 *
 * ⚠️ `null` ≠ 0 хэвээр: тооцоологдоогүй бол «—» ба `none` (саарал) төлөв.
 */
export type CardStat = { label: string; value: number | null; kind: MetricKind; tone: Health };

/** Тоо байвал `good`, эс бөгөөс `none` — «мэдээлэлгүй»-г «хэвийн» гэж уншуулахгүй */
const known = (v: number | null): Health => (v == null ? 'none' : 'good');

/** Их нь МУУ (үлдсэн талбар, тайлангүй блок, буцаалт) — 0 бол сайн */
const fewer = (v: number | null): Health => (v == null ? 'none' : v > 0 ? 'warn' : 'good');

const statOf = (
  label: string, value: number | null, kind: MetricKind, tone: Health,
): CardStat => ({ label, value, kind, tone });

export function cardStat(
  src: SchemSources,
  pkg: string | null,
  id: FineId,
): CardStat | null {
  const zov = src.zov ? pickPkg(src.zov, pkg, (z) => z.bagts) : null;
  const zn = (t: string) => (zov ? zov.filter((z) => z.tolov === t).length : null);
  const rows: BagtsLite[] | null = src.bagts;
  const row = pkg && rows
    ? rows.find((b) => samePkg(b.label, pkg) || samePkg(b.key, pkg)) ?? null
    : null;
  const sum = (of: (b: BagtsLite) => number) => (rows ? rows.reduce((s, b) => s + of(b), 0) : null);
  const rc = src.review ? reviewCounts(src.review) : null;
  const c = src.clearance;
  const fi = src.finance;

  switch (id) {
    case 'plan':
      return statOf(tr('Талбай'), fin(src.headline?.areaHa), 'ha', known(fin(src.headline?.areaHa)));
    case 'zov':
      return statOf(tr('Нийт зөвшөөрөл'), zov ? zov.length : null, 'count', known(zov ? zov.length : null));
    case 'zovOk':
      return statOf(tr('Зөвшөөрсөн'), zn(TOLOV.ok), 'count', known(zn(TOLOV.ok)));
    case 'zovWait':
      return statOf(tr('Хүлээгдэж буй'), zn(TOLOV.wait), 'count', fewer(zn(TOLOV.wait)));
    case 'zovNo': {
      /* ⚠️ Татгалзсан БА танигдаагүйг НЭГТГЭНЭ — карт хоёуланг нь нэрлэдэг */
      const bad = zov ? zov.filter((z) => z.tolov === TOLOV.no || z.tolov === 'unknown').length : null;
      return statOf(tr('Зөвшөөрөөгүй'), bad, 'count', fewer(bad));
    }
    case 'gaz': {
      const pctV = fin(c?.pct);
      return statOf(tr('Чөлөөлсөн'), pctV, 'pct', grade(pctV, TH.gazarPct.good, TH.gazarPct.warn));
    }
    case 'gazOk':
      return statOf(tr('Чөлөөлсөн талбар'), fin(c?.cleared), 'count', known(fin(c?.cleared)));
    case 'gazLeft':
      return statOf(tr('Үлдсэн талбар'), fin(c?.remaining), 'count', fewer(fin(c?.remaining)));
    case 'huv':
      /* ⚠️ Хуваарь амьд эх сурвалжгүй (`schem.ts`-ийн шийдвэр) — ҮРГЭЛЖ «—» */
      return statOf(tr('Хамралт'), null, 'pct', 'none');
    case 'bar': {
      const v = row ? fin(row.progress) : fin(src.overall?.pct);
      return statOf(tr('Гүйцэтгэл'), v, 'pct', grade(v, TH.barilgaPct.good, TH.barilgaPct.warn));
    }
    case 'barOk': {
      /* Тайлагнасан = нийт блок − тайлангүй */
      const blocks = row ? row.blocks : fin(src.progress?.blocks);
      const missing = row ? row.missing : sum((b) => b.missing);
      const v = blocks != null && missing != null ? blocks - missing : null;
      return statOf(tr('Тайлагнасан блок'), v, 'count', known(v));
    }
    case 'barNo': {
      const v = row ? row.missing : sum((b) => b.missing);
      return statOf(tr('Тайлангүй блок'), v, 'count', fewer(v));
    }
    case 'ers': {
      const v = fin(src.progress?.stalled);
      return statOf(tr('Зогссон блок'), v, 'count', fewer(v));
    }
    case 'hab':
      return statOf(tr('Ажилтан'), fin(src.habea?.workers), 'count', known(fin(src.habea?.workers)));
    case 'habInc': {
      const v = fin(src.habea?.incidents);
      /* ⚠️ Осол нь `warn` БИШ `bad` — хүний аюулгүй байдал бусад хоцрогдолтой нэг зэрэгт орохгүй */
      return statOf(tr('Осол, зөрчил'), v, 'count', v == null ? 'none' : v > 0 ? 'bad' : 'good');
    }
    case 'hyCo':
      return statOf(tr('Гүйцэтгэгч дээр'), rc ? rc.byStage.company : null, 'count', known(rc ? rc.byStage.company : null));
    case 'hyEng':
      return statOf(tr('Инженер дээр'), rc ? rc.byStage.engineer : null, 'count', known(rc ? rc.byStage.engineer : null));
    case 'hyMgr':
      return statOf(tr('Багцын менежер дээр'), rc ? rc.byStage.manager : null, 'count', known(rc ? rc.byStage.manager : null));
    case 'hyDir':
      return statOf(tr('Ерөнхий менежер дээр'), rc ? rc.byStage.director : null, 'count', known(rc ? rc.byStage.director : null));
    case 'hyDone':
      return statOf(tr('Шилжүүлсэн'), rc ? rc.done : null, 'count', known(rc ? rc.done : null));
    case 'finBudget':
      return statOf(tr('Төсөвт өртөг'), fin(fi?.budget), 'mnt', known(fin(fi?.budget)));
    case 'finContract':
      return statOf(tr('Гэрээний дүн'), fin(fi?.contractAmount), 'mnt', known(fin(fi?.contractAmount)));
    case 'finPaid': {
      const paid = fin(fi?.paid);
      const budget = fin(fi?.budget);
      /* ⚠️ Олголтыг ТӨСӨВТЭЙГӨӨ харьцуулж дүгнэнэ — дан тоо ганцаараа сайн ч муу ч биш */
      const share = paid != null && budget != null && budget > 0 ? (paid / budget) * 100 : null;
      return statOf(tr('Олгосон'), paid, 'mnt', grade(share, TH.paidPct.good, TH.paidPct.warn));
    }
    case 'tailan': {
      const age = ageDays(src.progress?.date);
      /* ⚠️ УРВУУ босго: их нь МУУ (хуучирсан тайлан) */
      const tone: Health = age == null ? 'none'
        : age >= TH.reportAgeD.bad ? 'bad'
          : age >= TH.reportAgeD.warn ? 'warn' : 'good';
      return statOf(tr('Тайлангийн нас'), age, 'day', tone);
    }
    default:
      return null;
  }
}

/* ══════════════════ Картын анхааруулга ══════════════════ */

/**
 * ⚠️ ХАМГИЙН НОЦТОЙ нь эхэнд — карт дээр ганцхан өнгө, ганцхан тоо гарах тул
 *    аль нь ноцтойг эрэмбээр шийднэ. `none` («мэдээлэлгүй») нь `good`-оос
 *    ДЭЭГҮҮР: тоо нь тодорхойгүй байгааг «хэвийн» гэж уншуулж болохгүй.
 */
const TONE_RANK: Record<Health, number> = { bad: 3, warn: 2, none: 1, good: 0 };

/** Жагсаалтын хамгийн ноцтой өнгө. Хоосон бол `null`. */
export function worstTone(list: readonly Issue[]): Health | null {
  let out: Health | null = null;
  for (const is of list) {
    if (out == null || TONE_RANK[is.tone] > TONE_RANK[out]) out = is.tone;
  }
  return out;
}

/**
 * СХЕМИЙН БҮХ КАРТЫН АНХААРУУЛГА — карт бүрд аль анхааруулга буухыг шийднэ.
 *
 * ⚠️ ЯАГААД (2026-09-02, хэрэглэгч: «процессын үед ямар alert байгааг
 * харуулна»). Анхааруулга нь урьд нь ЗӨВХӨН карт дарж нээсэн самбарт харагддаг
 * байсан тул «аль процесс дээр асуудал байна вэ» гэдгийг мэдэхийн тулд 24
 * картыг ээлжлэн дарж үзэх шаардлагатай байв. Одоо зурган дээрээс шууд
 * уншигдана.
 *
 * ⚠️ АНХААРУУЛГЫГ ДАВХАРДУУЛАХГҮЙ. Нарийн схемд нэг бүлэг 2–5 картад задардаг;
 * бүлгийн бүх анхааруулгыг тэдгээрт давтвал «Зөвшөөрсөн» гэсэн ногоон карт
 * дээр «төлөв танигдсангүй» гэсэн улаан дохио гарна. Тиймээс анхааруулга бүр
 * `Issue.at`-аар өөрийн картаа заана; заагаагүй нь бүлгийн үндсэн картад
 * (`GROUP_ROOT`) буна.
 *
 * @param fine `true` бол нарийн схемийн `FineId`-аар, эс бөгөөс `SchemId`-аар
 *             түлхүүрлэнэ (ерөнхий схемд бүлэг бүр ганц карттай).
 */
export function alertsByCard(
  src: SchemSources,
  pkg: string | null,
  fine: boolean,
): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const id of Object.keys(PART) as SchemId[]) {
    for (const is of PART[id](src, pkg).issues) {
      /* ⚠️ Ерөнхий схемд `at`-ыг ҮЛ ТООНО: тэнд «Тайлангүй блок» гэсэн карт
         байхгүй тул түүний анхааруулга хаана ч буухгүй алга болно. */
      const key = fine ? (is.at ?? GROUP_ROOT[id]) : id;
      const list = out.get(key);
      if (list) list.push(is); else out.set(key, [is]);
    }
  }
  return out;
}
