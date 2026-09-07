/**
 * СААД — БАГЦААР: багц бүр дээр давхцаж буй ҮЛДСЭН нэгж талбар.
 *
 * ⚠️ `Gazar.tsx`-ЭЭС ЗӨӨГДСӨН (2026-09-06). Хоёр харагдац хэрэглэдэг болсон —
 * «Газар чөлөөлөлт» ба «Ерөнхий дашбоард». Хоёуланд нь нэг ба ЯГ НЭГ кэштэй
 * байх ёстой: тус тусдаа хуулбар байвал 55 багцын огтлолцол ХОЁР ДАХИН явна.
 *
 * React ОРООГҮЙ — цэвэр өгөгдлийн давхарга.
 */
import { queryFeatures } from '@/lib/query';
import { BUILDING, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey } from '@/lib/services';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { cached } from '@/lib/live';
import { text } from '@/lib/format';


/** Чартын нэг мөр: багц, түүний давхаргууд, давхцсан талбарын OID-ууд */
export type PkgOverlap = {
  key: string;
  name: string;
  layerIds: string[];
  /** Барилгын багцад блокийн OID шүүлт; дэд бүтцийн багцад `null` */
  where: string | null;
  oids: number[];
  /**
   * ⚠️ Энэ багцын огтлолцол ТАТАГДСАНГҮЙ (2026-09-03-ны аудит). Хоосон
   * `oids` нь «давхцал алга» ГЭСЭН УТГАТАЙ тул уналтыг тусад нь тэмдэглэнэ —
   * эс бөгөөс сүлжээний саат «цэвэр» гэсэн баталгаа болно.
   */
  failed: boolean;
};

/** Барилгын блокийн давхарга — багц бүрийн блокууд эндээс */
const BLOCK_LAYER = 'mon:building';
/**
 * БАГЦУУДЫН ХӨНГӨН БҮРТГЭЛ — нэр, давхарга, шүүлт. ГҮЙЦЭТГЭЛГҮЙ.
 *
 * ⚠️ `Bagts.buildPacks` ЭНД ХЭРЭГЛЭХГҮЙ санаатай: тэр нь блок бүрийн
 *    гүйцэтгэл, айлын тоо, дундажийг шаарддаг тул `useBuildings()` дамжин
 *    10 бөглөх хуудасны түүхийг (`loadBlockProgress`) татна. Газрын
 *    харагдацад биет явц ОГТ хэрэггүй — багцын нэр, давхарга л хэрэгтэй.
 *    Тиймээс барилгын давхаргаас ганц хөнгөн асуулгаар угсарна.
 *
 * ⚠️ Дэд бүтцийн багц нь давхаргын бүртгэлээс (`PKG_BY_BAGTS`) шууд гарна —
 *    сүлжээний хүсэлт огт шаардлагагүй.
 */
export const loadPkgOverlaps = cached<PkgOverlap[]>(loadPkgOverlapsRaw, undefined, ['PARCEL_LEFT']);

/**
 * ⚠️ КЭШЛЭГДСЭН (2026-08-31, гүйцэтгэлийн засвар). Энэ функц 55 багц бүрд
 * геометрийн ОГТЛОЛЦЛЫН хүсэлт явуулдаг — харагдацын хамгийн үнэтэй ажил.
 * Урьд нь `useAsync(loadPkgOverlaps, [])` гэж шууд дамжуулагдсан тул:
 *   · харагдац руу ОРОХ БҮРД (өөр рүү очоод буцахад ч) бүхэлдээ дахин ажиллана;
 *   · нэгж талбар хадгалах бүрд `useAsync`-ийн `bus` шинэчлэгдэж дахин ажиллана.
 * Одоо кэш нь `PARCEL_LEFT` түлхүүрт бүртгэгдсэн: дахин орох нь ҮНЭГҮЙ, харин
 * төлөв өөрчлөгдөхөд л шинэчлэгдэнэ — яг хэрэгтэй үедээ.
 */
async function loadPkgOverlapsRaw(): Promise<PkgOverlap[]> {
  const F = BUILDING.fields;
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, F.bagts],
    limit: 2000,
  /* ⚠️ УНАЛТЫГ ХООСОН ЖАГСААЛТ БОЛГОХГҮЙ (2026-09-03-ны аудит): урьд нь
     `.catch(() => [])` байсан тул сүлжээ саатахад дэлгэц «Аль ч багц дээр
     давхцсан нэгж талбар алга» гэсэн БАТАЛГААТАЙ мэдэгдэл гаргадаг байв.
     `parcelOverlap.ts`-ийн ⚠️ сэрэмжлүүлэг яг үүнийг хориглосон. Одоо
     алдааг цааш дамжуулж, `useAsync` түүнийг ил харуулна. */
  });

  /* Барилгын багц — блокуудыг багцаар нь бүлэглэж OID шүүлт болгоно */
  const byName = new Map<string, number[]>();
  for (const r of rows) {
    const name = text(r[F.bagts], '').trim();
    const oid = Number(r[BUILDING.oid]);
    if (!name || !Number.isFinite(oid)) continue;
    const a = byName.get(name);
    if (a) a.push(oid); else byName.set(name, [oid]);
  }
  const build: Omit<PkgOverlap, 'oids' | 'failed'>[] = [...byName].map(([name, oids]) => ({
    key: bagtsKey(name),
    name,
    layerIds: [BLOCK_LAYER],
    where: `${BUILDING.oid} IN (${oids.join(',')})`,
  }));

  /* Дэд бүтцийн багц — давхаргын гарчгуудын НИЙТЛЭГ хэсгийг нэр болгоно */
  const infra: Omit<PkgOverlap, 'oids' | 'failed'>[] = Object.entries(PKG_BY_BAGTS).map(([key, ids]) => ({
    key,
    name: ids.length ? (LAYER_BY_ID[ids[0]]?.title ?? key) : key,
    layerIds: ids,
    where: null,
  }));

  const all = [...build, ...infra];
  /* ⚠️ Багц бүрд ТУСДАА огтлолцол; нэг нь унавал бусад нь үлдэнэ (allSettled) */
  const res = await Promise.allSettled(
    all.map((pk) => overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where })))),
  );
  return all
    .map((pk, i) => {
      const r = res[i];
      /* ⚠️ Нэг багцын огтлолцол унасныг «давхцалгүй» гэж бүү ойлго —
         `failed` тугаар тэмдэглээд дэлгэц дээр ил хэлнэ. */
      return r.status === 'fulfilled'
        ? { ...pk, oids: r.value.oids, failed: false }
        : { ...pk, oids: [] as number[], failed: true };
    })
    .filter((x) => x.oids.length > 0 || x.failed)
    .sort((a, b) => b.oids.length - a.oids.length
      || a.name.localeCompare(b.name, 'mn', { numeric: true }));
}
