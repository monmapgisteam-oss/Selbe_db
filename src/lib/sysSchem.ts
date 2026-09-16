/**
 * СИСТЕМИЙН СХЕМИЙН ТОПОЛОГИ — порталын БҮХНИЙГ НЭГ зурагт.
 *
 * ⚠️ «Үйл ажиллагааны схем» (`schem.ts`)-ТЭЙ ХОЛИХГҮЙ. Тэр нь БАРИЛГЫН
 * ТӨСЛИЙН урсгал (Төлөвлөлт → … → Тайлан); энэ нь ПРОГРАМЫН бүтэц:
 * өгөгдөл хаанаас ирж, хэрхэн боловсрогдож, хаашаа буцаж бичигддэг.
 *
 * ⚠️ БАЙРЛАЛЫГ ГАРААР ТОГТООНО (`col`/`row`) — автомат байрлуулагч нь
 * утга учрын дарааллыг мэдэхгүй тул «эх сурвалж зүүнд, дэлгэц баруунд»
 * гэсэн уншигдах чиглэлийг алдагдуулна. `schem.ts` ч ижил шийдвэртэй.
 *
 * ⚠️ ЗУРАХ ЛОГИК ЭНД БАЙХГҮЙ — `layoutOf`/`edgePath` нь `schem.ts`-д.
 * Хоёр схем НЭГ тооцоо хэрэглэнэ: хоёр газар бичвэл нэгийг нь зассан үед
 * нөгөө нь чимээгүй зөрж, ирмэг зангилаанаасаа тасарна.
 */

import { t as tr } from '@/lib/i18nCore';
import type { EdgeKind, Geo } from '@/lib/schem';
import type { ViewKey } from '@/lib/services';

export type SysId =
  /* ── Эх сурвалж (баганa 0) ── */
  | 'agsSpace' | 'agsFin' | 'agsProg' | 'agsCtrl' | 'agsIot'
  /* ── Дамжуулах давхарга (баганa 1) ── */
  | 'query' | 'cache'
  /* ── Бодолт (баганa 2) ── */
  | 'calc' | 'kpi'
  /* ── Дэлгэц (баганa 3) ── */
  | 'viewOv' | 'viewFin' | 'viewProg' | 'viewGeo' | 'viewCtrl'
  /* ── Буцах урсгал (баганa 4) ── */
  | 'fill' | 'approve' | 'write'
  /* ── Хөндлөн огтлол ── */
  | 'acl' | 'ext';

export type SysNode = {
  id: SysId;
  title: string;
  /** Нэг мөрийн тайлбар — картан дээр */
  desc: string;
  /** Дарахад нээгдэх харагдац; `null` бол дарагдахгүй */
  view: ViewKey | null;
  /** Баримтын бүлэг (`sysDocs.ts`-ийн `id`) — «дэлгэрэнгүй» товч */
  doc: string | null;
  icon: string;
  col: number;
  row: number;
  /** Бүлгийн өнгө */
  tone: 'src' | 'flow' | 'calc' | 'view' | 'write' | 'cross';
};

export type SysEdge = { from: SysId; to: SysId; kind: EdgeKind };

/**
 * ⚠️ ХЭМЖЭЭ нь `schem.ts`-ийнхээс НАРИЙН (220 → 190): 5 багана × 5 мөр тул
 * ижил өргөнд илүү олон карт багтаана. Өндөр нь бага (140 → 104) — энд
 * картан дээр ТОО гарахгүй, зөвхөн нэр ба нэг мөр тайлбар.
 */
export const SYS_GEO: Geo = { w: 190, h: 104, gapX: 64, gapY: 34, pad: 28 };

export const SYS_NODES: readonly SysNode[] = [
  /* ══ Багана 0 · ЭХ СУРВАЛЖ ══ */
  {
    id: 'agsSpace', title: tr('Орон зайн үйлчилгээ'),
    desc: tr('174 давхарга · зам, шугам, барилга'),
    view: 'plan', doc: '02-ogogdliin-esurvalj', icon: 'layers', col: 0, row: 0, tone: 'src',
  },
  {
    id: 'agsFin', title: tr('Санхүүгийн хүснэгт'),
    desc: tr('Төсөв, гэрээ · олгосон санхүүжилт'),
    view: 'finance', doc: '02-ogogdliin-esurvalj', icon: 'calc', col: 0, row: 1, tone: 'src',
  },
  {
    id: 'agsProg', title: tr('Гүйцэтгэлийн хүснэгт'),
    desc: tr('10 бөглөх хуудас · батлагдсан нэгтгэл'),
    view: 'pkgProg', doc: '02-ogogdliin-esurvalj', icon: 'grid', col: 0, row: 2, tone: 'src',
  },
  {
    id: 'agsCtrl', title: tr('Хяналт ба зөвшөөрөл'),
    desc: tr('Чанар · ХАБЭА · хяналт · зөвшөөрөл'),
    view: 'guitsetgel', doc: '02-ogogdliin-esurvalj', icon: 'shield', col: 0, row: 3, tone: 'src',
  },
  {
    id: 'agsIot', title: tr('Мэдрэгч'),
    desc: tr('5 төрөл · амьд заалт'),
    view: 'iot', doc: '02-ogogdliin-esurvalj', icon: 'radio', col: 0, row: 4, tone: 'src',
  },

  /* ══ Багана 1 · ДАМЖУУЛАХ ══ */
  {
    id: 'query', title: tr('Асуулгын давхарга'),
    desc: tr('Хязгаар · дахин оролдлого · хуудаслалт'),
    view: null, doc: '03-ogogdliin-zam', icon: 'reset', col: 1, row: 1, tone: 'flow',
  },
  {
    id: 'cache', title: tr('Кэш'),
    desc: tr('11 хүснэгтийн түлхүүр · хүчингүй болголт'),
    view: null, doc: '03-ogogdliin-zam', icon: 'layers', col: 1, row: 2, tone: 'flow',
  },

  /* ══ Багана 2 · БОДОЛТ ══ */
  {
    id: 'calc', title: tr('Цэвэр бодолт'),
    desc: tr('Сүлжээгүй · тестээр хамгаалсан'),
    view: null, doc: '03-ogogdliin-zam', icon: 'chart', col: 2, row: 1, tone: 'calc',
  },
  {
    id: 'kpi', title: tr('Удирдлагын үзүүлэлт'),
    desc: tr('13 KPI · төслийн мөчлөгөөр'),
    view: 'gdash', doc: '03-ogogdliin-zam', icon: 'target', col: 2, row: 3, tone: 'calc',
  },

  /* ══ Багана 3 · ДЭЛГЭЦ ══ */
  {
    id: 'viewOv', title: tr('Тойм'),
    desc: tr('Дашбоард · тайлан · схем'),
    view: 'gdash', doc: '04-haragdac', icon: 'frame', col: 3, row: 0, tone: 'view',
  },
  {
    id: 'viewFin', title: tr('Санхүү'),
    desc: tr('Багцын санхүү · санхүүжилт'),
    view: 'pkgFin', doc: '04-haragdac', icon: 'calc', col: 3, row: 1, tone: 'view',
  },
  {
    id: 'viewProg', title: tr('Гүйцэтгэл ба хуваарь'),
    desc: tr('Багцын гүйцэтгэл · хуваарь'),
    view: 'pkgProg', doc: '04-haragdac', icon: 'calendar', col: 3, row: 2, tone: 'view',
  },
  {
    id: 'viewCtrl', title: tr('Хяналт ба чанар'),
    desc: tr('Гүйцэтгэл · чанар · ХАБЭА'),
    view: 'qaqc', doc: '04-haragdac', icon: 'shield', col: 3, row: 3, tone: 'view',
  },
  {
    id: 'viewGeo', title: tr('Газар ба төлөвлөгөө'),
    desc: tr('Газар чөлөөлөлт · дэд бүтэц'),
    view: 'gazar', doc: '04-haragdac', icon: 'polygon', col: 3, row: 4, tone: 'view',
  },

  /* ══ Багана 4 · БУЦАХ УРСГАЛ ══ */
  {
    id: 'fill', title: tr('Бөглөх'),
    desc: tr('Гүйцэтгэл · хуваарь · чанар'),
    view: 'guitsetgel', doc: '05-erh-batlah', icon: 'pen', col: 4, row: 1, tone: 'write',
  },
  {
    id: 'approve', title: tr('Батлах'),
    desc: tr('4 шат · зохиогч өөрийгөө батлахгүй'),
    view: 'guitsetgel', doc: '05-erh-batlah', icon: 'target', col: 4, row: 2, tone: 'write',
  },
  {
    id: 'write', title: tr('ArcGIS руу бичих'),
    desc: tr('500-гийн багц · кэш хуучирна'),
    view: null, doc: '05-erh-batlah', icon: 'reset', col: 4, row: 3, tone: 'write',
  },

  /* ══ Хөндлөн огтлол ══ */
  {
    id: 'acl', title: tr('Эрх'),
    desc: tr('Ганц хүснэгт · хаалттай бол татгалзана'),
    /* ⚠️ (4,0) — `fill`-ийн ШУУД ДЭЭР (2026-09-16): урьд нь (2,4)-өөс диагонал
       ирмэг col 3-ын дөрвөн картыг огтолж байв. Одоо босоо салбараар шууд. */
    view: null, doc: '05-erh-batlah', icon: 'users', col: 4, row: 0, tone: 'cross',
  },
  {
    id: 'ext', title: tr('Гадаад холболт'),
    desc: tr('Асистент · Telegram · мэдрэгч'),
    view: null, doc: '07-gadaad-erschim', icon: 'network', col: 2, row: 0, tone: 'cross',
  },
];

/**
 * ⚠️ ИРМЭГИЙН ГУРВАН ТӨРӨЛ (`schem.ts`-ийн зарчмыг дагав):
 *   `main` — өгөгдлийн ҮНДСЭН урсгал (эх сурвалж → дэлгэц)
 *   `feed` — тэжээх холбоо: дараалал БИШ, хамаарал
 *   `back` — БУЦАХ урсгал: хэрэглэгчээс ArcGIS руу
 *
 * Нэг сумаар зурвал «эрх нь дэлгэцийн ДАРАА ирдэг» гэсэн худал ойлголт
 * төрнө — эрх нь дэлгэц бүрийг ЗЭРЭГ хязгаарладаг.
 */
export const SYS_EDGES: readonly SysEdge[] = [
  /* Эх сурвалж → асуулга */
  { from: 'agsSpace', to: 'query', kind: 'main' },
  { from: 'agsFin', to: 'query', kind: 'main' },
  { from: 'agsProg', to: 'query', kind: 'main' },
  { from: 'agsCtrl', to: 'query', kind: 'main' },
  { from: 'agsIot', to: 'query', kind: 'main' },

  /* Асуулга → кэш → бодолт */
  { from: 'query', to: 'cache', kind: 'main' },
  { from: 'cache', to: 'calc', kind: 'main' },
  { from: 'calc', to: 'kpi', kind: 'feed' },

  /* Бодолт → дэлгэц */
  { from: 'calc', to: 'viewOv', kind: 'main' },
  { from: 'calc', to: 'viewFin', kind: 'main' },
  { from: 'calc', to: 'viewProg', kind: 'main' },
  { from: 'calc', to: 'viewCtrl', kind: 'main' },
  { from: 'calc', to: 'viewGeo', kind: 'main' },
  { from: 'kpi', to: 'viewOv', kind: 'feed' },

  /* Дэлгэц → бөглөх → батлах → бичих */
  { from: 'viewProg', to: 'fill', kind: 'main' },
  { from: 'viewCtrl', to: 'fill', kind: 'main' },
  { from: 'fill', to: 'approve', kind: 'main' },
  { from: 'approve', to: 'write', kind: 'main' },

  /* Бичилт → эх сурвалж руу БУЦНА, кэш хуучирна */
  { from: 'write', to: 'agsProg', kind: 'back' },
  { from: 'write', to: 'cache', kind: 'back' },

  /* Хөндлөн огтлол */
  { from: 'acl', to: 'fill', kind: 'feed' },
  { from: 'ext', to: 'query', kind: 'feed' },
];

/** Бүлгийн тайлбар — тайлбарын зурвасад */
export const SYS_LEGEND: readonly { tone: SysNode['tone']; label: string }[] = [
  { tone: 'src', label: tr('Эх сурвалж') },
  { tone: 'flow', label: tr('Дамжуулах') },
  { tone: 'calc', label: tr('Бодолт') },
  { tone: 'view', label: tr('Дэлгэц') },
  { tone: 'write', label: tr('Буцах бичилт') },
  { tone: 'cross', label: tr('Хөндлөн') },
];
