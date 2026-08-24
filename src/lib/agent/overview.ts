'use client';

/**
 * БҮС/БАГЦЫН НЭГДСЭН ТОЙМ — БҮХ эх сурвалжийг нэг дор шүүнэ.
 *
 * ⚠️ ЯАГААД ТУСДАА ХЭРЭГСЭЛ ВЭ: «Багц 1-ийн мэдээллийг дэлгэрэнгүй» гэсэн асуулт
 * нэг давхаргаар хариулагдахгүй — барилга, зам, инженерийн шугам, ажлын хуудас,
 * ХАБЭА бүгдэд тархсан. Агент 100 давхаргыг нэг нэгээр асуувал эргэлтийн
 * хязгаарт мөргөж, хагас дутуу хариулна. Энэ хэрэгсэл БҮГДИЙГ нэг дуудлагаар
 * цуглуулна.
 *
 * ⚠️ ТООГ ӨӨРӨӨ БОДОХГҮЙ: `totals.ts`-ийн `layerTotals()`-ыг дууддаг. Тэр нь
 * порталын каталог, дашбоард хоёрын ашигладаг ЯГ ИЖИЛ тоо/хэмжээний асуулга.
 * Тусдаа тооцоо бичвэл агентын дүн дэлгэц дээрхээс зөрж, итгэл алдагдана.
 *
 * ⚠️ БИЧИГЛЭЛИЙН ЗӨРӨӨ: «Багц-1» / «Багц -1» / «БАГЦ-1» / «Багц 1-1» гэж дөрвөн
 * эх сурвалжид дөрвөн янз бичигдсэн. Давхаргад `zoneWhere()` (порталынх) шийднэ;
 * өгөгдлийн эх сурвалжид утгуудыг ТАТАЖ АВААД `bagtsKey()`-ээр жишнэ.
 */

import { count, queryGroup, queryStats, sqlStr, type Stat } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { PKG_BY_BAGTS, bagtsKey, zoneWhere, type LayerDef } from '@/lib/services';
import { layerTotals, qtyText, whereFor } from '@/lib/totals';
import { allowedDatasets, allowedLayers, type AgentScope } from './registry';
import type { Dataset } from './datasets';

/** Нэг эх сурвалжийн мөр */
export type OverviewRow = {
  id: string;
  title: string;
  /** Олдсон бичлэгийн тоо */
  n: number;
  /** Хэмжээ — хүн уншихад тохирсон нэгжээр («2.4 км», «1.3 га») */
  qty?: string;
  /**
   * Давхарга БҮТНЭЭРЭЭ энэ багцынх (мөрөөр шүүгээгүй).
   * ⚠️ CAD-аас гарсан багцын давхаргууд бүсийн атрибутгүй ч БҮХЭЛДЭЭ нэг багцад
   * харьяалагддаг — шүүх шаардлагагүй, нийт дүн нь тэр багцынх.
   */
  whole?: boolean;
};

export type Overview = {
  zone: string;
  sources: OverviewRow[];
  /** Өгөгдөлгүй байсан эх сурвалжийн ТОО — жагсаалт нь контекст дүүргэнэ */
  emptyCount: number;
  /** Бүсээр шүүх боломжгүй (талбаргүй) эх сурвалжийн тоо */
  skippedCount: number;
  note: string;
};

/**
 * ⚠️ ХҮСЭЛТИЙН ДЭЭД ТОО. Бүсээр шүүгддэг давхарга ~100 бий; бүгдийг асуувал
 * `query.ts`-ийн 6 зэрэгцээ хязгаараар ~10 секунд болно. Хариултын хурд гол
 * шаардлага тул тоог хязгаарлаж, хэтэрвэл хэрэглэгчид ИЛЭН ДАЛАНГҮЙ хэлнэ.
 */
const MAX_SOURCES = 110;

/* ── Латин бичиглэлийг кирилл болгох ── */

/**
 * «bagts 3.2» → «Багц-3.2».
 *
 * ⚠️ Хэрэглэгч монголоо ЛАТИНААР бичдэг нь энэ порталд түгээмэл. Өгөгдөл дэх
 * утгууд кирилл тул хөрвүүлэхгүй бол `bagtsKey('bagts 1')` = «BAGTS1» болж,
 * «БАГЦ1»-тэй ХЭЗЭЭ Ч таарахгүй — тойм чимээгүй хоосон буцна.
 *
 * ⚠️ Бүтэн галиг хөрвүүлэгч бичихгүй: зөвхөн БАГЦ/БҮС гэсэн хоёр үг л
 * шүүлтэд оролцдог. Илүү өргөн хөрвүүлэлт нь буруу таарц үүсгэх эрсдэлтэй.
 */
export function normalizeZone(input: string): string {
  const s = String(input).trim();
  // Кирилл үсэг аль хэдийн байвал хөрвүүлэх шаардлагагүй
  if (/[А-Яа-яӨөҮү]/.test(s)) return s;
  const num = s.match(/([0-9][0-9.\-]*)/)?.[1];
  if (!num) return s;
  if (/^\s*(bagts|bagc|bags|bagt)/i.test(s)) return tr('Багц-{0}', num);
  if (/^\s*(bus|bvs|buus)/i.test(s)) return tr('Багц-{0}', num);
  return s;
}

/* ── Өгөгдлийн эх сурвалжийн багцын утгыг тааруулах ── */

/**
 * Датасетын багцын баганаас тухайн бүстэй ТААРАХ утгуудыг олно.
 *
 * ⚠️ SQL дотор `bagtsKey()`-г дуудах боломжгүй тул: ялгаатай утгуудыг НЭГ
 * хүсэлтээр татаж аваад, кодоор жишиж, таарсныг нь `IN (...)` болгоно.
 */
async function datasetWhere(d: Dataset, zone: string): Promise<string | null> {
  if (!d.zoneField) return null;
  const key = bagtsKey(zone);
  if (!key) return null;

  const rows = await queryGroup(d.url, d.zoneField, [count(d.oid ?? 'OBJECTID', 'n')], '1=1');
  const hits = rows
    .map((r) => String(r[d.zoneField!] ?? ''))
    .filter((v) => v && bagtsKey(v) === key);

  if (!hits.length) return null;
  return `${d.zoneField} IN (${hits.map(sqlStr).join(', ')})`;
}

/* ── Нэгдсэн тойм ── */

export async function zoneOverview(input: string, scope: AgentScope): Promise<Overview> {
  // ⚠️ Латинаар ирсэн бол эхлээд кирилл болгоно — эс бөгөөс бүх таарц унана
  const zone = normalizeZone(input);
  const layers = allowedLayers(scope);
  const datasets = allowedDatasets(scope);

  const key = bagtsKey(zone);

  /**
   * ⚠️ АЖЛЫН БАГЦЫН давхаргууд — эдгээр нь `noZone` (CAD-аас гарсан, бүсийн
   * атрибутгүй) БОЛОВЧ давхарга нь БҮХЭЛДЭЭ нэг багцад харьяалагддаг. Тиймээс
   * шүүх шаардлагагүй — нийт дүн нь тэр багцынх. Үүнийг оруулаагүйгээс «Багц 5.1»
   * гэж асуухад 0 ₮ гарч байсан.
   */
  const pkgIds = new Set(PKG_BY_BAGTS[key] ?? []);

  /**
   * ⚠️ ГАРЧИГТ шингэсэн холбоос: «Багц 5.1 · Гадна дулаан… (Багц 1)» — тэр
   * давхарга бүхэлдээ БАРИЛГЫН Багц 1-ийн ажил. Атрибут байхгүй ч гарчигт бий.
   */
  const titleRef = /\(\s*багц\s*[-\s]*([0-9][0-9.\-]*)\s*\)/i;

  // Бүсээр шүүгдэх боломжтой давхаргууд
  const filterable: { l: LayerDef; where: string; whole?: boolean }[] = [];
  let skipped = 0;
  for (const l of layers) {
    /**
     * ⚠️ ЭНЭ ШАЛГАЛТ ХАМГИЙН ТҮРҮҮНД. Ажлын багцын давхарга нь `ZONE_ID`-тэй ч
     * байж болох бөгөөд тэр талбар нь БАРИЛГЫН бүсийг («Багц-1») заадаг. Иймд
     * «Багц 6.1» гэж асуухад бүсээр шүүвэл 0 мөр гарч, давхарга бүхэлдээ алга
     * болно. Багцын харьяалал бүсийн шүүлтээс ДЭЭГҮҮР.
     */
    const m = l.title.match(titleRef);
    if (pkgIds.has(l.id) || (m && bagtsKey(tr('Багц-{0}', m[1])) === key)) {
      filterable.push({ l, where: '1=1', whole: true });
      continue;
    }

    const w = zoneWhere(l, zone);
    if (w != null) { filterable.push({ l, where: whereFor(l, zone) }); continue; }
    skipped++;
  }

  const capped = filterable.slice(0, MAX_SOURCES);
  const overflow = filterable.length - capped.length;

  /**
   * ⚠️ Бүгдийг ЗЭРЭГ явуулна — `query.ts` өөрөө 6-аар хязгаарлаж дараалуулна.
   * Энд дахин хязгаарлавал хоёр дараалал үүсч, удаан болно.
   * ⚠️ Нэг давхарга унасан ч БУСДЫГ зогсоохгүй (`allSettled`) — нэг хуучин
   * үйлчилгээний алдаанаас болж бүх тойм алга болох нь буруу.
   */
  const layerResults = await Promise.allSettled(
    capped.map(async ({ l, where, whole }) => ({ l, whole, t: await layerTotals(l, where) })),
  );

  const sources: OverviewRow[] = [];
  let empty = 0;
  let failed = 0;

  for (const r of layerResults) {
    if (r.status === 'rejected') { failed++; continue; }
    const { l, t, whole } = r.value;
    if (!t.n) { empty++; continue; }
    sources.push({
      id: l.id,
      title: l.title,
      n: t.n,
      ...(qtyText(l, t.q) ? { qty: qtyText(l, t.q)! } : {}),
      ...(whole ? { whole: true } : {}),
    });
  }

  // Өгөгдлийн эх сурвалжууд (ажлын хуудас, ХАБЭА…)
  const dsResults = await Promise.allSettled(
    datasets.map(async (d) => {
      const where = await datasetWhere(d, zone);
      if (!where) return null;
      const stats: Stat[] = [count(d.oid ?? 'OBJECTID', 'n')];
      const row = await queryStats(d.url, stats, where);
      return { d, n: Number(row.n ?? 0) };
    }),
  );
  for (const r of dsResults) {
    if (r.status === 'rejected') { failed++; continue; }
    if (!r.value) continue;
    if (!r.value.n) { empty++; continue; }
    sources.push({ id: r.value.d.id, title: r.value.d.title, n: r.value.n });
  }

  // Хамгийн олон объекттойг эхэнд — агент юуг түрүүлж дурдахаа мэдэхэд
  sources.sort((a, b) => b.n - a.n);

  const notes: string[] = [];
  if (overflow) notes.push(tr('⚠️ {0} эх сурвалж хязгаараас хэтэрсэн тул шалгаагүй.', overflow));
  if (failed) notes.push(tr('⚠️ {0} эх сурвалж алдаа өгсөн.', failed));
  if (sources.some((x) => x.whole)) {
    notes.push(
      tr('`whole: true` тэмдэгтэй эх сурвалж нь БҮХЭЛДЭЭ энэ багцынх — мөрөөр шүүгээгүй, ') +
        tr('давхаргын нийт дүн нь тэр багцынх.'),
    );
  }

  return {
    zone,
    sources,
    emptyCount: empty,
    skippedCount: skipped,
    note: notes.join(' '),
  };
}
