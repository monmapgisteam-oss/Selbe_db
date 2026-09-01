/**
 * ҮЙЛ АЖИЛЛАГААНЫ НАРИЙВЧИЛСАН СХЕМ — АЖИЛЛАГАА БҮР ӨӨРИЙН КАРТТАЙ.
 *
 * ⚠️ ЯАГААД (2026-09-01, хэрэглэгч: «схем хэт ерөнхий байна … үйл ажиллагааг
 * илүү нарийн, нэг бүрчлэн харуулдаг ОЛОН КАРТТАЙ схем болго»). «Ерөнхий»
 * схем нь 10 карттай — нэг карт бүхэл шатыг төлөөлдөг тул «зөвшөөрлийн аль
 * хэсэгт гацсан юм бэ», «хяналт хэний гар дээр байна» гэдгийг зурган дээрээс
 * харах боломжгүй байв.
 *
 * ЭНД 24 КАРТ: ажиллагаа бүр (зөвшөөрсөн · хүлээгдэж буй · татгалзсан ·
 * чөлөөлсөн · үлдсэн · тайлагнасан блок · тайлангүй блок · хяналтын 4 шат ·
 * шилжүүлсэн · төсөв · гэрээ · олголт …) тус тусдаа хайрцаг.
 *
 * ⚠️ «ЕРӨНХИЙ» СХЕМ ХЭВЭЭР ҮЛДЭНЭ. Түүний тор гараар зохиогдсон, шалтгаанууд
 * нь `schem.ts`-д баримтжуулсан тул ХӨНДӨӨГҮЙ. Энэ бол ХОЁР ДАХЬ топологи;
 * хэрэглэгч толгойн товчоор сольж хардаг.
 *
 * ⚠️ ХАМГИЙН ЧУХАЛ ДҮРЭМ ЭНД Ч ХҮЧИНТЭЙ — БАЙХГҮЙ ПРОЦЕССЫГ БАЙГАА МЭТ
 * ЗУРАХГҮЙ. Карт олон болсон ч сумны утга өөрчлөгдөөгүй:
 *   main — үе шатны ХАМААРАЛ · feed — ТЭЖЭЭХ холбоо (дараалал БИШ) ·
 *   back — жинхэнэ БУЦААЛТ (зөвхөн хяналтын шатанд, кодод бичигдсэн)
 * Зөвшөөрлийн гурван төлөв, газрын хоёр төлөв, блокийн ангилал нь ДАРААЛАЛ
 * БИШ тул эх картаасаа САЛАА болж гарна — гинжин сумаар холбоогүй.
 *
 * ⚠️ КАРТ ДЭЭР ТОО ГАРАХГҮЙ (2026-09-01, хэрэглэгч: «үр дүн харуулах огт
 * хэрэггүй, зөвхөн ямар ажиллагаа хийгддэг тайлбар байхад л болно»). Энэ файл
 * нь ЗӨВХӨН топологи — юу хийгддэг, юу нь юунаас хамаардаг. Амьд тоо нь карт
 * дарахад нээгдэх дэлгэрэнгүй самбарт (`schemDetail.ts`) бүрэн хэвээр.
 *
 * ⚠️ ТИЙМЭЭС ЭНД `buildFine`-ТАЙ ТӨСТЭЙ ЗҮЙЛ ДАХИН НЭМЭХГҮЙ. Тоо буцаагаад
 * зурган дээр тавибал 24 карт дахин дүүрч, «схем хэт дүүрэн» гэсэн асуудал
 * буцаж ирнэ. Шинэ тоо хэрэгтэй бол `schemDetail.ts` руу нэм.
 */

import { t as tr } from '@/lib/i18nCore';
import type { ViewKey } from '@/lib/services';
import type { EdgeKind, Geo, SchemId } from '@/lib/schem';

/* ══════════════════ Топологи ══════════════════ */

export type FineId =
  | 'plan'
  | 'zov' | 'zovOk' | 'zovWait' | 'zovNo'
  | 'gaz' | 'gazOk' | 'gazLeft'
  | 'huv'
  | 'bar' | 'barOk' | 'barNo'
  | 'ers' | 'hab' | 'habInc'
  | 'hyCo' | 'hyEng' | 'hyMgr' | 'hyDir' | 'hyDone'
  | 'finBudget' | 'finContract' | 'finPaid'
  | 'tailan';

export type FineNode = {
  id: FineId;
  /**
   * Дэлгэрэнгүй самбар АЛЬ бүлгийнхийг нээх вэ.
   * ⚠️ Самбар нь `SchemId`-аар ажилладаг (`nodeDetail`) — нарийн карт бүрд
   * тусдаа самбар бичвэл нэг л дүрэм хоёр газар давхардана.
   */
  group: SchemId;
  title: string;
  desc: string;
  view: ViewKey | null;
  icon: string;
  col: number;
  row: number;
};

export type FineEdge = { from: FineId; to: FineId; kind: EdgeKind; label?: string };

/**
 * ⚠️ БАГАНА = ЦАГ ХУГАЦААНЫ УРСГАЛ, МӨР = ЗЭРЭГ ЯВАХ САЛАА.
 *
 *   багана 0  төлөвлөх
 *   багана 1–2 нөхцөл бүрдүүлэх (зөвшөөрөл · газар) ба тэдгээрийн ТӨЛӨВҮҮД
 *   багана 3–4 хуваарь → барилга угсралт
 *   багана 5  барилгын үр дүн (блокийн ангилал · ХАБЭА · эрсдэл)
 *   багана 6  ГҮЙЦЭТГЭЛИЙН ХЯНАЛТЫН 4 ШАТ — цорын ганц жинхэнэ төлөвийн машин
 *   багана 7  батлагдсан ажил ба санхүүгийн хэмжүүрүүд
 *   багана 8  тайлан
 */
export const FINE_NODES: readonly FineNode[] = [
  {
    id: 'plan', group: 'tolovlolt', col: 0, row: 2, view: 'plan', icon: 'layers',
    title: tr('Ерөнхий төлөвлөгөө'),
    desc: tr('Төслийн суурь тоо: нийт талбай, хүн ам, батлагдсан төсөвт өртөг'),
  },

  /* ── Зөвшөөрөл ба түүний ТӨЛӨВҮҮД ── */
  {
    id: 'zov', group: 'zovshoorol', col: 1, row: 0, view: 'zovshoorol', icon: 'shield',
    title: tr('Зөвшөөрөл авах'),
    desc: tr('Багц бүрд шаардагдах зөвшөөрлийн бүртгэл. «Бүрдэлт» нь зөвшөөрөгдсөн нь нийтэд эзлэх хувь'),
  },
  {
    id: 'zovOk', group: 'zovshoorol', col: 2, row: 0, view: 'zovshoorol', icon: 'shield',
    title: tr('Зөвшөөрсөн'),
    desc: tr('Эрх бүхий байгууллага «Зөвшөөрсөн» гэж шийдвэрлэсэн бичиг баримтын тоо'),
  },
  {
    id: 'zovWait', group: 'zovshoorol', col: 2, row: 1, view: 'zovshoorol', icon: 'shield',
    title: tr('Хүлээгдэж буй зөвшөөрөл'),
    desc: tr('Хүсэлт өгсөн ч шийдвэр гараагүй — гадны байгууллагад хүлээгдэж буй зөвшөөрөл'),
  },
  {
    id: 'zovNo', group: 'zovshoorol', col: 2, row: 2, view: 'zovshoorol', icon: 'shield',
    title: tr('Татгалзсан / танигдаагүй'),
    desc: tr('Зөвшөөрөөгүй, эсвэл төлөвийн утга нь толинд байхгүй тул баталгаажсан гэж үзэх боломжгүй'),
  },

  /* ── Газар чөлөөлөлт ба түүний ангилал ── */
  {
    id: 'gaz', group: 'gazar', col: 1, row: 4, view: 'gazar', icon: 'frame',
    title: tr('Газар чөлөөлөх'),
    desc: tr('Барилга эхлүүлэхийн өмнөх нөхцөл: нэгж талбар бүрийн чөлөөлөлтийн төлөв'),
  },
  {
    id: 'gazOk', group: 'gazar', col: 2, row: 4, view: 'gazar', icon: 'frame',
    title: tr('Чөлөөлсөн талбар'),
    desc: tr('Эзэмшигчтэй тооцоо дууссан, барилга угсралт эхлэх боломжтой нэгж талбарууд'),
  },
  {
    id: 'gazLeft', group: 'gazar', col: 2, row: 5, view: 'gazar', icon: 'frame',
    title: tr('Үлдсэн талбар'),
    desc: tr('Хараахан чөлөөлөгдөөгүй нэгж талбар ба тэдгээрийн талбай — барилгыг хойшлуулж буй хүчин зүйл'),
  },

  {
    id: 'huv', group: 'huvaari', col: 3, row: 2, view: 'huvaari', icon: 'calendar',
    title: tr('Хуваарь төлөвлөх'),
    desc: tr('Ажил бүрийн эхлэх, дуусах огноо. Хамралтын хувь нь багц бүрийг бүтнээр татдаг тул схемд бодогдохгүй'),
  },
  {
    id: 'bar', group: 'barilga', col: 4, row: 2, view: 'pkgProg', icon: 'building',
    title: tr('Барилга угсралт'),
    desc: tr('Блокуудын биет гүйцэтгэл — «Гүйцэтгэл бөглөх» хуудсын мэдээллийг төсвийн жингээр жигнэсэн дундаж'),
  },

  /* ── Барилгын үр дүн ── */
  {
    id: 'barOk', group: 'barilga', col: 5, row: 0, view: 'pkgProg', icon: 'building',
    title: tr('Тайлагнасан блок'),
    desc: tr('Гүйцэтгэлийн хуудас нь бөглөгдсөн блокууд = нийт блок хасах тайлангүй блок'),
  },
  {
    id: 'barNo', group: 'barilga', col: 5, row: 1, view: 'pkgProg', icon: 'building',
    title: tr('Тайлангүй блок'),
    desc: tr('Гүйцэтгэл нь огт бөглөгдөөгүй блокууд. Нийт дүнд 0%-аар ордог тул гүйцэтгэлийг доошлуулна'),
  },
  {
    id: 'ers', group: 'ersdel', col: 5, row: 3, view: 'ersdel', icon: 'waves',
    title: tr('Зогссон блок'),
    desc: tr('Сүүлийн тайлангаас хойш гүйцэтгэл нь ахиагүй блокууд — эрсдэлийн дохио'),
  },
  {
    id: 'hab', group: 'habea', col: 5, row: 4, view: 'habea', icon: 'flame',
    title: tr('Хүн хүч, техник'),
    desc: tr('ХАБЭА-гийн бүртгэлээр талбай дээр ажиллаж буй ажилтан ба техникийн тоо'),
  },
  {
    id: 'habInc', group: 'habea', col: 5, row: 5, view: 'habea', icon: 'flame',
    title: tr('Осол, зөрчил'),
    desc: tr('ХАБЭА-д бүртгэгдсэн осол ба аюулгүй байдлын зөрчлийн тоо'),
  },

  /* ── ХЯНАЛТЫН 4 ШАТ — цорын ганц жинхэнэ төлөвийн машин ── */
  {
    id: 'hyCo', group: 'hyanalt', col: 6, row: 0, view: 'guitsetgel', icon: 'pen',
    title: tr('Гүйцэтгэгч компани'),
    desc: tr('Гүйцэтгэлээ бөглөж хяналтад илгээх ЭХНИЙ шат. Буцаагдсан ажил энд эргэж ирнэ'),
  },
  {
    id: 'hyEng', group: 'hyanalt', col: 6, row: 1, view: 'guitsetgel', icon: 'pen',
    title: tr('Хяналтын инженер'),
    desc: tr('Талбай дээр шалгаж зөвшөөрөх эсвэл гүйцэтгэгч рүү буцаах ХОЁР дахь шат'),
  },
  {
    id: 'hyMgr', group: 'hyanalt', col: 6, row: 2, view: 'guitsetgel', icon: 'pen',
    title: tr('Багцын менежер'),
    desc: tr('Багцын хэмжээнд баталгаажуулах ГУРАВ дахь шат — буцаавал инженер рүү очно'),
  },
  {
    id: 'hyDir', group: 'hyanalt', col: 6, row: 3, view: 'guitsetgel', icon: 'pen',
    title: tr('Ерөнхий менежер'),
    desc: tr('ЭЦСИЙН дөрөв дэх шат. Зөвшөөрсний дараа л ажил эх хүснэгтэд бүртгэгдэнэ'),
  },
  {
    id: 'hyDone', group: 'hyanalt', col: 7, row: 0, view: 'guitsetgel', icon: 'pen',
    title: tr('Шилжүүлсэн'),
    desc: tr('Дөрвөн шатыг бүрэн давж баталгаажсан ажил — хяналтад хүлээгдэхээ больсон'),
  },

  /* ── Санхүү — ХЭМЖҮҮР, дараалал БИШ ── */
  {
    id: 'finBudget', group: 'sankhuu', col: 7, row: 2, view: 'pkgFin', icon: 'calc',
    title: tr('Төсөвт өртөг'),
    desc: tr('Батлагдсан төсөв. Блокийн гүйцэтгэлийн жин ч мөн эндээс тооцогдоно'),
  },
  {
    id: 'finContract', group: 'sankhuu', col: 7, row: 3, view: 'pkgFin', icon: 'calc',
    title: tr('Гэрээний дүн'),
    desc: tr('Гүйцэтгэгчидтэй байгуулсан гэрээнүүдийн нийлбэр ба төсөвт эзлэх хувь'),
  },
  {
    id: 'finPaid', group: 'sankhuu', col: 7, row: 4, view: 'pkgFin', icon: 'calc',
    title: tr('Олгосон санхүүжилт'),
    desc: tr('IPC актаар бодитоор олгогдсон дүн ба төсөвт эзлэх хувь'),
  },

  {
    id: 'tailan', group: 'tailan', col: 8, row: 3, view: 'tailan', icon: 'chart',
    title: tr('Тайлан'),
    desc: tr('Нэгтгэсэн үзүүлэлт. «Сүүлийн тайлангийн нас» нь мэдээлэл хэр шинэ болохыг хэлнэ'),
  },
];

export const FINE_EDGES: readonly FineEdge[] = [
  { from: 'plan', to: 'zov', kind: 'main' },
  { from: 'plan', to: 'gaz', kind: 'main' },

  /* ⚠️ САЛАА, ГИНЖ БИШ. Гурван төлөв нь дараалсан шат БИШ — нэг зөвшөөрөл
     эдгээрийн ЯГ НЭГЭНД байна. Гинжээр холбовол «хүлээгдэж буй нь татгалзсан
     болж хувирдаг» гэсэн худал ойлголт төрнө. */
  { from: 'zov', to: 'zovOk', kind: 'main' },
  { from: 'zov', to: 'zovWait', kind: 'feed' },
  { from: 'zov', to: 'zovNo', kind: 'feed' },

  { from: 'gaz', to: 'gazOk', kind: 'main' },
  { from: 'gaz', to: 'gazLeft', kind: 'feed' },

  /* Нийлэлт — ЗӨВШӨӨРСӨН ба ЧӨЛӨӨЛСӨН хоёул бүрдсэн үед хуваарь утгатай */
  { from: 'zovOk', to: 'huv', kind: 'main' },
  { from: 'gazOk', to: 'huv', kind: 'main' },
  { from: 'huv', to: 'bar', kind: 'main' },

  { from: 'bar', to: 'barOk', kind: 'main' },
  { from: 'bar', to: 'barNo', kind: 'feed' },
  { from: 'bar', to: 'ers', kind: 'feed' },
  { from: 'bar', to: 'hab', kind: 'feed' },
  { from: 'hab', to: 'habInc', kind: 'feed' },

  /* ── Хяналтын гинж — ЖИНХЭНЭ дараалал ── */
  { from: 'barOk', to: 'hyCo', kind: 'main' },
  { from: 'hyCo', to: 'hyEng', kind: 'main' },
  { from: 'hyEng', to: 'hyMgr', kind: 'main' },
  { from: 'hyMgr', to: 'hyDir', kind: 'main' },
  { from: 'hyDir', to: 'hyDone', kind: 'main' },
  /**
   * ⚠️ БУЦААЛТ НЬ ЯВСАН ЗАМААРАА, НЭГ АЛХМААР (`hyanalt.ts`-ийн баримтжуулсан
   * дүрэм). Бүгдийг нь гүйцэтгэгч рүү шууд татвал «менежер буцаахад инженерийн
   * шалгалт алгасагдана» гэсэн худал зураг гарна.
   */
  { from: 'hyEng', to: 'hyCo', kind: 'back', label: tr('Буцаасан') },
  { from: 'hyMgr', to: 'hyEng', kind: 'back' },
  { from: 'hyDir', to: 'hyMgr', kind: 'back' },

  /* ── Санхүү — БҮГД `feed`. Кодод төлөвийн машин байхгүй тул `main` болговол
     «гэрээ байгуулмагц олголт автоматаар явна» гэж уншигдана. ── */
  { from: 'plan', to: 'finBudget', kind: 'feed' },
  { from: 'finBudget', to: 'finContract', kind: 'feed' },
  { from: 'finContract', to: 'finPaid', kind: 'feed' },
  { from: 'hyDone', to: 'finPaid', kind: 'feed' },

  { from: 'finPaid', to: 'tailan', kind: 'main' },
];

export const FINE_BY_ID: Record<FineId, FineNode> = Object.fromEntries(
  FINE_NODES.map((n) => [n.id, n]),
) as Record<FineId, FineNode>;

/** ⚠️ Нарийн карт нь бага ч уншигдахуйц — 24 хайрцаг нэг дэлгэцэнд багтана */
export const GEO_FINE: Geo = { w: 196, h: 104, gapX: 40, gapY: 22, pad: 28 };

/**
 * Топологийн дараалал (`back` ирмэгийг үл тооно).
 * ⚠️ DOM-д ЭНЭ дарааллаар байрлана — Tab дарахад хэрэглэгч төслийн мөчлөгөөр
 *    алхана, дэлгэц дээрх байрлалаар биш.
 */
export function fineOrder(): FineId[] {
  const indeg = new Map<FineId, number>(FINE_NODES.map((n) => [n.id, 0]));
  const next = new Map<FineId, FineId[]>(FINE_NODES.map((n) => [n.id, []]));
  for (const e of FINE_EDGES) {
    if (e.kind === 'back') continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    next.get(e.from)!.push(e.to);
  }
  const rank = (a: FineId, b: FineId) => {
    const x = FINE_BY_ID[a]; const y = FINE_BY_ID[b];
    return x.col - y.col || x.row - y.row;
  };
  const q = FINE_NODES.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort(rank);
  const out: FineId[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const to of next.get(id)!) {
      const d = (indeg.get(to) ?? 0) - 1;
      indeg.set(to, d);
      if (d === 0) { q.push(to); q.sort(rank); }
    }
  }
  return out;
}
