/**
 * САНХҮҮЖИЛТИЙН БҮРТГЭЛИЙГ БАГЦААР БҮТЭЦЛЭХ — цэвэр логик, React-гүй.
 *
 * ⚠️ 2026-09-01, хэрэглэгчийн зурсан бүтэц: багцын нэр нь ХӨНДЛӨН ЗУРВАС, түүн
 * доор тухайн багцын БҮХ мөр доошоо. Багцууд нь араагшаа (баруун тийш)
 * дараалан үргэлжилнэ.
 *
 * ⚠️ ОНООР БҮЛЭГЛЭХГҮЙ. Түр зуур он нь merge нүд болж байсныг хэрэглэгч
 * ХАССАН: «заавал он бүлэглэх шаардлагагүй». Мөрүүд ЭХ ДАРААЛАЛААРАА урсана.
 *
 * ⚠️ БҮХ МЭДЭЭЛЭЛ ХЭВЭЭР. Энэ модуль нь баганыг хасдаггүй, мөрийг нэгтгэдэггүй
 * — зөвхөн ЭРЭМБЭЛЖ БҮЛЭГЛЭНЭ. Нэг эх мөр = нэг харагдах мөр; тиймээс засвар
 * (`oid:талбар`) яг хэвээр ажиллана. Нэгтгэсэн нүдийг буцааж бичих арга
 * байхгүй тул НИЙЛБЭР бодохыг санаатайгаар ХИЙХГҮЙ.
 *
 * ⚠️ React импортлохгүй — `finGroup.check.mjs` шууд Node дээр ачаална.
 */
import { CASHFLOW_NEW, HO_IPC, bagtsKey, isPkgRange } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';

export type Row = Record<string, unknown>;

const CF = CASHFLOW_NEW.fields;
const HO = HO_IPC.contractFields;

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Багцад хуваарилагдаагүй мөрүүдийн түлхүүр */
export const NO_PKG = ' nopkg';

export type GroupRow = { row: Row; oid: number | null };
export type PkgBlock = { key: string; pkg: string; rows: GroupRow[]; count: number };

/**
 * Аль үйлчилгээ вэ — багц ба оны талбар нь өөр.
 * ⚠️ `flat` нь `Cashflow_0904` (гэрээний шинэ бүртгэл): талбарын нэр `CF0xx`
 * код БИШ, мөн ГЭРЭЭ/САР гэсэн мөрийн төрөл байхгүй тул паспорт+хуваарь болгож
 * хуваахгүй, ердийн хавтгай хүснэгтээр зурна.
 */
/**
 * ⚠️ 2026-09-06: 'cf' (хуучин `cashflow_0813` — паспорт+сарын хуваарь)
 * ХАСАГДСАН. Гэрээний шинэ бүртгэл нь 'flat'.
 *
 * ⚠️ 2026-09-09: 'ipc' (`ipc_0813/172` актын лог, ТЕСТ өгөгдөл) → 'ho'
 * (`HO_guitsetgel_arcgis_csv/196` — олгосон ТӨЛБӨР). Мөр = НЭГ ГҮЙЛГЭЭ;
 * гэрээний талбар `geree_kod` бүрд ДАВТАГДАНА (45 мөр = 22 гэрээ).
 * ⚠️ ЭНЭ МОДУЛЬД ТЭР НЬ ХАМГИЙН ТОМ ЭРСДЭЛ: доорх «мөр нэгтгэдэггүй,
 * НИЙЛБЭР бодохыг САНААТАЙГААР хийхгүй» дүрмийг зөрчиж хэн нэг нь «энд
 * багц тутмын төсөв нэмье» гэвэл Багц-4.1 (7 мөр) -ийн төсөв 7 ДАХИН
 * давхардана. Гэрээний нийлбэрийг ЗӨВХӨН `ipc.ts`-ийн `hoTotals()` бодно.
 */
export type FinKind = 'ho' | 'flat';

/**
 * Мөрийн багц — дэд багц (навч) эхэлж.
 *
 * ⚠️ ДИАПАЗОН мөрийг («БАГЦ 1-4») ХАСНА: `bagtsKey` нь зураасыг хаядаг тул
 *    «БАГЦ14» болж, бодит «Багц 14»-т наалддаг (services.ts-ийн `isPkgRange`
 *    тайлбар). Тэдгээр нь «хуваарилагдаагүй» бүлэгт очно — алдагдахгүй, гэвч
 *    БУРУУ эзэнд ч очихгүй.
 *
 * ⚠️ 2026-09-09: ЭНЭ ХАМГААЛАЛТ ОДОО 'ho'-д ч ЖИНХЭНЭЭР ажиллаж байна.
 *    Хуучин IPC_LOG-д диапазон мөр БАЙГААГҮЙ тул зөвхөн CASHFLOW-д
 *    хэрэгтэй байв; HO-д ХОЁР бий — «Багц-1-4» (876,465,164 ₮) ба
 *    «БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15» (5,094,952,269 ₮), нийт 5.97
 *    тэрбум ₮. Хамгаалалтыг хасвал эхнийх нь бодит «Багц 14»-т наалдана.
 */
function pkgOf(r: Row, f2: string, f1: string): { key: string; label: string } {
  for (const fld of [f2, f1]) {
    const raw = r[fld];
    if (s(raw) === '') continue;
    if (isPkgRange(raw)) continue;
    const k = bagtsKey(raw);
    if (k && k !== '0') return { key: k, label: s(raw) };
  }
  return { key: NO_PKG, label: NO_PKG };
}

const oidOf = (r: Row, field: string): number | null => {
  const v = r[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Мөрүүдийг БАГЦААР бүтэцлэнэ.
 *
 * ⚠️ Мөрийн ЭХ ДАРААЛАЛ багц дотроо ХАДГАЛАГДАНА. Бүртгэл нь OID-ийн
 *    дарааллаар татагддаг бөгөөд хэрэглэгч тэр дарааллаар нь уншиж дассан —
 *    зөвхөн БҮЛЭГЛЭЛТ нэмэгдэнэ, эрэмбэ нь өөрчлөгдөхгүй.
 * ⚠️ ОНООР ДЭД БҮЛЭГ ҮҮСГЭХГҮЙ (хэрэглэгчийн заавар). Он нь ердийн багана
 *    хэвээр — merge нүд, дэд толгой аль нь ч байхгүй.
 * ⚠️ «Хуваарилагдаагүй» багц нь ҮРГЭЛЖ хамгийн сүүлд — жинхэнэ багцуудын
 *    дунд орвол жагсаалт санамсаргүй тасарна.
 */
export function buildGroups(rows: Row[], kind: FinKind): PkgBlock[] {
  const oidField = kind === 'ho' ? HO_IPC.oid : CASHFLOW_NEW.oid;
  /* ⚠️ HO-д ДЭД БАГЦЫН тусдаа талбар БАЙХГҮЙ — bagts өөрөө «Багц-3.1» гэсэн
     дэд түвшнийг агуулна. Тиймээс f2 === f1: pkgOf нь нэг талбарыг хоёр удаа
     шалгах ч үр дүн ижил, харин ДИАПАЗОН хамгаалалт хэвээр ажиллана. */
  const f2 = kind === 'ho' ? HO.pkg : CF.pkg2;
  const f1 = kind === 'ho' ? HO.pkg : CF.pkg;

  const byPkg = new Map<string, { label: string; rows: GroupRow[] }>();
  for (const r of rows) {
    const p = pkgOf(r, f2, f1);
    let bucket = byPkg.get(p.key);
    if (!bucket) { bucket = { label: p.label, rows: [] }; byPkg.set(p.key, bucket); }
    bucket.rows.push({ row: r, oid: oidOf(r, oidField) });
  }

  const keys = [...byPkg.keys()].sort((a, b) => {
    const d = (a === NO_PKG ? 1 : 0) - (b === NO_PKG ? 1 : 0);
    if (d !== 0) return d;
    return (byPkg.get(a)?.label ?? '').localeCompare(byPkg.get(b)?.label ?? '', 'mn', { numeric: true });
  });

  return keys.map((k) => {
    const b = byPkg.get(k) as { label: string; rows: GroupRow[] };
    return {
      key: k,
      pkg: k === NO_PKG ? tr('Багцад хуваарилагдаагүй') : b.label,
      rows: b.rows,
      count: b.rows.length,
    };
  });
}
