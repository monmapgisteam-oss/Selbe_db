/**
 * IPC ХОЛБООСЫН АЧААЛАГЧ — сүлжээний тал. Цэвэр тооцоо нь `ipcLink.ts`-д.
 *
 * ⚠️ ЯАГААД ХОЁР ФАЙЛ ВЭ: `ipcLink.ts` нь Node дээр шууд ачаалагдаж
 * тестлэгддэг (сүлжээгүй, React-гүй). Энд ArcGIS-ийн дуудлага, `dataBus`,
 * кэш амьдарна. Хольбол тест нь амьд үйлчилгээнээс хамаарна.
 *
 * ⚠️ АГШНЫГ БАГЦААР цуглуулна. Бөглөх хуудас нь БАГЦ бүрд (заримд нь
 * давхрын хоёр хувилбар) тусдаа; IPC мөр нь БАГЦААР холбогдоно. Тиймээс
 * нэг багцын бүх хуудсын нэг өдрийн дүнг НИЙЛҮҮЛЖ нэг агшин болгоно —
 * Багц 1-ийн 9F ба 12F хоёулаа тэр багцын гэрээнд төлөгддөг.
 *
 * ⚠️ БҮТЭН АРХИВ ТАТАХГҮЙ. `loadRows` нь ЗӨВХӨН ХАМГИЙН СҮҮЛИЙН агшныг
 * татдаг тул түүхэн агшин бүрийг давтан дуудна. Багана нь ХЯЗГААРЛАГДСАН
 * (`obyem` + `unit` + жааз) — бүтэн мөр татвал 10-20МБ болно
 * (`bagtsSheet.loadRows`-ийн `fields` тайлбар).
 */
import { PKGS, loadSchema, type Pkg, type Schema } from '@/modules/sheet/bagts.pkg';
import { loadRows, msToDay } from '@/modules/sheet/bagtsSheet';
import { sheetDates } from '@/modules/sheet/sheetRows';
import { bagtsKey, HO_IPC } from '@/lib/services';
import { loadHoRows, groupHo } from '@/lib/ipc';
import { invalidate } from '@/lib/dataBus';
import {
  snapshotOf, linkContract, linkSummary, type LinkResult, type Snapshot,
} from '@/lib/ipcLink';

/**
 * `guilgee_ognoo` → `YYYY-MM-DD`.
 *
 * ⚠️ ArcGIS огноог ms epoch-оор буцаана; CSV-ээс ирсэн мөр хэлбэр ч байж
 * болно. Хоёуланг барина, танихгүй бол `null` — таамаглахгүй.
 */
export function payDay(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return msToDay(v);
  if (typeof v === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim());
    if (m) return m[1];
    const t = Date.parse(v);
    if (Number.isFinite(t)) return msToDay(t);
  }
  return null;
}

/**
 * Нэг хуудасны нэг агшныг татаж дүнг бодно. Уншигдаагүй бол `null`.
 *
 * ⚠️ Хуудас унасан ч БҮХ ажиллагаа зогсохгүй — тэр хуудас тухайн өдөр
 * оролцохгүй. Гэвч дуудагч тал алдааг ТООЛНО: чимээгүй дутуу дүн нь
 * «зөрүү их байна» гэсэн ХУДАЛ дүгнэлт төрүүлнэ.
 */
async function sheetDaySum(
  pkg: Pkg,
  sc: Schema,
  day: string,
): Promise<{ obyem: number | null; une: number | null } | null> {
  const cols = sc.obyem.filter((x): x is string => !!x);
  if (!cols.length) return null;
  const need = [sc.f.oid, sc.f.no, sc.f.wC, sc.f.vol, sc.f.unit, ...cols];
  const { rows } = await loadRows(pkg, sc, day, need).catch(() => ({ rows: [] }));
  if (!rows.length) return null;
  const s = snapshotOf(rows, day);
  return { obyem: s.obyem, une: s.une };
}

/**
 * БАГЦ бүрийн агшны цуваа — `bagtsKey(group)` → өдрөөр өссөн `Snapshot[]`.
 *
 * ⚠️ Түлхүүр нь `bagtsKey(pkg.group)`; IPC тал нь `pkgKeyOf(bagts)`.
 * Хоёул нэг нормчлолд тулгуурладаг тул таарна, ГЭВЧ IPC-ийн ДИАПАЗОН мөр
 * `''` болдог тул тэдгээр гэрээ энэ Map-аас ХЭЗЭЭ Ч агшин олохгүй —
 * `no-snapshot` болно. Энэ нь ЗӨВ: диапазон мөр аль багцын ажил болохыг
 * хэн ч мэдэхгүй тул түүнд зөрүү бодох ёсгүй.
 */
export async function loadSnapshots(days?: readonly string[]): Promise<Map<string, Snapshot[]>> {
  const all = days?.length ? [...days].sort() : await sheetDates();
  const out = new Map<string, Snapshot[]>();
  if (!all.length) return out;

  const schemas = new Map<string, Schema>();
  await Promise.all(PKGS.map(async (p) => {
    const sc = await loadSchema(p).catch(() => null);
    if (sc?.f.fillDate) schemas.set(p.key, sc);
  }));

  for (const day of all) {
    /* Нэг өдрийн бүх хуудсыг зэрэг татна; өдрүүд нь ДАРААЛЛААР —
       10 багц × N өдрийг бүхэлд нь зэрэг эхлүүлбэл ArcGIS татгалзана. */
    const parts = await Promise.all(PKGS.map(async (p) => {
      const sc = schemas.get(p.key);
      if (!sc) return null;
      const v = await sheetDaySum(p, sc, day);
      return v ? { key: bagtsKey(p.group), ...v } : null;
    }));

    /* ⚠️ Нэг багцын ХОЁР хуудсыг (9F + 12F) НИЙЛҮҮЛНЭ — гэрээ нь нэг. */
    const merged = new Map<string, { obyem: number | null; une: number | null }>();
    for (const p of parts) {
      if (!p) continue;
      const cur = merged.get(p.key) ?? { obyem: null, une: null };
      if (p.obyem != null) cur.obyem = (cur.obyem ?? 0) + p.obyem;
      if (p.une != null) cur.une = (cur.une ?? 0) + p.une;
      merged.set(p.key, cur);
    }
    for (const [key, v] of merged) {
      const arr = out.get(key) ?? [];
      arr.push({ day, obyem: v.obyem, une: v.une });
      out.set(key, arr);
    }
  }

  /* ⚠️ `snapAt` нь өсөх дараалал ШААРДАНА — өдрүүд эрэмбэлэгдсэн ч
     хамгаалалт болгож дахин баталгаажуулна. */
  for (const arr of out.values()) arr.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

/** Нэг гэрээний үр дүн — UI-д багцаар харуулахад. */
export type ContractLink = {
  /** `geree_kod` */
  code: string;
  /** `pkgKeyOf(bagts)` — ⚠️ диапазон мөрд `''` */
  key: string;
  /** Харагдах багцын нэр */
  pkg: string;
  rows: LinkResult[];
};

/**
 * БҮХ IPC мөрийн холбоосыг бодно — сүлжээнээс уншаад цэвэр функцээр бодоод
 * үр дүнг буцаана. ⚠️ ЮУ Ч БИЧИХГҮЙ; бичилт нь `writeLinks`.
 */
export async function computeLinks(): Promise<{
  contracts: ContractLink[];
  results: LinkResult[];
  summary: ReturnType<typeof linkSummary>;
}> {
  const [rows, snaps] = await Promise.all([loadHoRows(), loadSnapshots()]);
  const contracts: ContractLink[] = [];
  const results: LinkResult[] = [];
  for (const c of groupHo(rows)) {
    const list = snaps.get(c.key) ?? [];
    const rs = linkContract(c.pays, list, payDay);
    contracts.push({ code: c.code, key: c.key, pkg: c.pkg, rows: rs });
    results.push(...rs);
  }
  return { contracts, results, summary: linkSummary(results) };
}

/* ─────────────────────── ARCGIS-Д БИЧИХ ─────────────────────── */

/**
 * Бодогдсон утгыг HO үйлчилгээнд бичнэ.
 *
 * ⚠️ ЭНЭ ФУНКЦ ГАДНААС ДУУДАГДАХГҮЙ бол өгөгдөл шинэчлэгдэхгүй — бичилт нь
 * ХЭРЭГЛЭГЧИЙН үйлдэл байх ёстой (автоматаар бичвэл эзэн нь мэдэлгүй
 * үйлчилгээ өөрчлөгдөнө). Дуудагч тал зөвшөөрөл шалгана.
 *
 * ⚠️ 500-гийн багцаар — `rollbackOnFailure` нь ЗӨВХӨН нэг багц дотор
 * үйлчилнэ (`bagtsSheet.applyUpdates`-ийн сургамж). 45 мөр тул амьдаар
 * ганц багц, гэвч эх өгөгдөл ургавал хамгаалалт хэвээр.
 */
export async function writeLinks(
  updates: readonly Record<string, unknown>[],
  agsFetch: (url: string, body: Record<string, string>) => Promise<Record<string, unknown>>,
): Promise<number> {
  let written = 0;
  try {
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      const j = await agsFetch(`${HO_IPC.url}/applyEdits`, {
        updates: JSON.stringify(chunk.map((attributes) => ({ attributes }))),
        rollbackOnFailure: 'true',
      });
      /* ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — үр дүнгийн МӨР БҮРИЙГ шалгана. */
      const res = (j.updateResults ?? []) as { success?: boolean; error?: { description?: string } }[];
      const bad = res.find((r) => r.success === false);
      if (bad) throw new Error(bad.error?.description || 'Шинэчлэх амжилтгүй');
      written += chunk.length;
    }
  } finally {
    /*
     * ⚠️ ХЭСЭГЧЛЭН амжилттай байсан ч кэшийг хүчингүй болгоно
     * (`bagtsSheet.applyUpdates`-ийн ЯГ ижил хэлбэр). `rollbackOnFailure` нь
     * ЗӨВХӨН нэг багц дотор үйлчилдэг тул алдаа гарахаас өмнөх багцууд
     * серверт аль хэдийн бичигдсэн байж болно. «Бичигдсэн атлаа хуучин тоо
     * харуулах»-аас «бичигдээгүй атлаа дахин татах» нь хамаагүй хямд.
     */
    if (written) invalidate('HO_IPC');
  }
  return written;
}

