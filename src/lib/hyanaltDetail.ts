'use client';

/**
 * НИЙТЭЛСЭН ГҮЙЦЭТГЭЛИЙГ ХЯНАГЧИД ХАРУУЛАХ.
 *
 * ⚠️ Хяналтын бүртгэл ганцаараа «юу хийсэн» гэдгийг ХЭЛДЭГГҮЙ — зөвхөн хэн,
 * хэзээ илгээснийг л хэлнэ. Инженер юуг зөвшөөрч байгаагаа мэдэхгүй бол
 * хяналт нь ёсорхуу дарах товч болж хувирна. Тиймээс архивын агшнаас
 * бөглөсөн ажлуудыг татаж үзүүлнэ.
 *
 * ⚠️ АГШНЫГ ОГНООГООР БИШ, ЭХ МӨРӨӨР олно. `Компани_илгээсэн_огноо` нь
 * илгээсэн ЯГ АГШИН (UTC), архивын `buglusun_ognoo` нь БӨГЛӨСӨН ӨДӨР
 * (нутгийн цагаар шөнө дунд) — хоёр нь цагийн бүсээс хамаарч ӨӨР өдөрт
 * унаж болно. Эх мөрийн OBJECTID нь тэр агшинд ЯГ хамаарна.
 */

import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';

/** Нэг мөр — «Гүйцэтгэл бөглөх» хуудасны багануудтай ижил бүрэлдэхүүн */
export type Filled = {
  no: string;
  work: string;
  /** Мөрийн ЭХ обьём (эх хүснэгтээс) */
  vol: number | null;
  /** Блокуудад бөглөсөн обьёмын нийлбэр */
  sum: number | null;
  unit: number | null;
  money: number | null;
  plan: number | null;
  act: number | null;
  ratio: number | null;
  /** Блок бүрийн бөглөсөн обьём — `blocks` шошготой ижил дараалалтай */
  cells: (number | null)[];
  /**
   * Тухайн нүд ӨМНӨХ АГШНААС ӨӨРЧЛӨГДСӨН эсэх.
   * ⚠️ Өмнөх агшин байхгүй (анхны нийтлэл) бол утгатай нүд бүр өөрчлөлт.
   */
  changed: boolean[];
};

export type Submission = {
  /** Аль үйлчилгээнээс — «Багц 1 · 9 давхар» */
  pkgLabel: string;
  /** Блокийн шошго — «5/1», «5/2» г.м. */
  blocks: string[];
  /** Өмнөх агшинтай жишсэн эсэх (анхны нийтлэлд `false`) */
  compared: boolean;
  /** Архивт нэмэгдсэн нийт мөр */
  rows: number;
  /** Обьём бөглөгдсөн ажлууд (буурах эрэмбээр, дээд талын хэсэг) */
  filled: Filled[];
  /** Бөглөгдсөн ажлын НИЙТ тоо (`filled` нь тайрагдсан байж болно) */
  filledCount: number;
};

/**
 * Огноог SQL-д бичих.
 *
 * ⚠️ ТҮҮХИЙ EPOCH ТООГООР харьцуулж БОЛОХГҮЙ. `buglusun_ognoo = 1787270400000`
 * гэж бичвэл энэ үйлчилгээ «Unable to perform query» гэж унана. ArcGIS-ийн
 * стандарт хэлбэр нь `timestamp 'YYYY-MM-DD HH:MM:SS'` (UTC).
 */
const ts = (ms: number) => `timestamp '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

const post = async (url: string, body: Record<string, string>) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...body }).toString(),
  });
  const j = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  // ⚠️ ArcGIS алдааг HTTP 200-гаар буцаадаг
  if (j.error) throw new Error(j.error.message || 'Асуулга амжилтгүй');
  return j;
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Тухайн хянуулалтын АРХИВЫН АГШНЫГ олж, бөглөсөн ажлуудыг буцаана.
 *
 * @param bagts    хяналтын бүртгэл дэх «Багц» (жиш. «Багц 1»)
 * @param sheetOid `Эх_мөрийн_дугаар` — архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID
 */
export async function loadSubmission(bagts: string, sheetOid: number): Promise<Submission | null> {
  // Нэг багцад 9 ба 12 давхрын ХОЁР үйлчилгээ байж болно — аль нь болохыг эх мөрөөр нь тогтооно
  const cands = PKGS.filter((p) => p.group === bagts);
  if (!cands.length || !sheetOid) return null;
  let last = '';

  for (const p of cands) {
    try {
      /*
       * ⚠️ Талбарын нэрийг ЭНД дахин таамаглахгүй — «Гүйцэтгэл бөглөх»-ийн
       * схемийг ЯГ ТЭР ЛОГИКООР ачаална. Эс бөгөөс `Обьём` ба `Обьём__Шинэ`,
       * `Бодит_гүйцэтгэл` ба `…_гүйцэтгэлийн_хувь` мэт багц бүрийн зөрүү энд
       * дахин гараар бичигдэж, нэг нь хоцорвол чимээгүй хоосон харагдана.
       */
      const sc = await loadSchema(p);
      const fill = sc.f.fillDate;
      if (!fill) continue;

      const head = (await post(p.url, {
        where: `OBJECTID = ${sheetOid}`,
        outFields: fill,
        returnGeometry: 'false',
      })) as { features?: { attributes: Record<string, unknown> }[] };

      const at = head.features?.[0]?.attributes?.[fill];
      if (typeof at !== 'number') continue;         // энэ үйлчилгээнд тэр мөр алга

      const where = `${fill} = ${ts(at)}`;
      const cnt = (await post(p.url, { where, returnCountOnly: 'true' })) as { count?: number };

      /*
       * ӨМНӨХ АГШНЫГ олно — өөрчлөлтийг зөвхөн түүнтэй жишиж мэдэж болно.
       * ⚠️ Обьём нь ХУРИМТЛАГДДАГ тул «утгатай = шинэ» гэж үзэж БОЛОХГҮЙ:
       * өчигдрийн 1300 өнөөдөр ч 1300 хэвээр байвал өөрчлөлт БИШ.
       */
      const prevQ = (await post(p.url, {
        where: `${fill} < ${ts(at)}`,
        groupByFieldsForStatistics: fill,
        outStatistics: JSON.stringify([
          { statisticType: 'max', onStatisticField: fill, outStatisticFieldName: 'm' },
        ]),
        orderByFields: `${fill} DESC`,
        resultRecordCount: '1',
      }).catch(() => ({}))) as { features?: { attributes: Record<string, unknown> }[] };
      const prevAt = num(prevQ.features?.[0]?.attributes?.[fill]);

      let filled: Filled[] = [];
      let filledCount = 0;
      const sum = sc.f.obyemSum;
      if (sum) {
        // ⚠️ ЗӨВХӨН бөглөгдсөн мөр. Бүх 1370 мөрийг татвал хянагч хайх болно.
        const w2 = `${where} AND ${sum} > 0`;
        const c2 = (await post(p.url, { where: w2, returnCountOnly: 'true' })) as { count?: number };
        filledCount = c2.count ?? 0;
        if (filledCount) {
          const obs = sc.obyem.filter(Boolean) as string[];
          const cols = [sc.f.no, sc.f.work, sc.f.vol, sum, sc.f.unit, sc.f.money,
            sc.f.plan, sc.f.act, sc.f.ratio, ...obs].filter(Boolean) as string[];
          const q = (await post(p.url, {
            where: w2,
            outFields: [...new Set(cols)].join(','),
            returnGeometry: 'false',
            orderByFields: `${sum} DESC`,
            resultRecordCount: '200',
          })) as { features?: { attributes: Record<string, unknown> }[] };
          /*
           * ӨМНӨХ АГШНЫ ижил мөрүүд — `№`-ээр индекслэнэ.
           * ⚠️ OBJECTID-аар холбож БОЛОХГҮЙ: агшин бүрд мөр ДАХИН хуулагддаг
           * тул дугаар нь өөр байна. `№` нь багц дотроо тогтвортой.
           */
          const before = new Map<string, Record<string, unknown>>();
          if (prevAt != null) {
            const pv = (await post(p.url, {
              where: `${fill} = ${ts(prevAt)} AND ${sum} > 0`,
              outFields: [sc.f.no, ...obs].join(','),
              returnGeometry: 'false',
              resultRecordCount: '2000',
            }).catch(() => ({}))) as { features?: { attributes: Record<string, unknown> }[] };
            for (const x of pv.features ?? []) {
              before.set(String(x.attributes[sc.f.no] ?? ''), x.attributes);
            }
          }

          filled = (q.features ?? []).map((x) => {
            const a = x.attributes;
            const prev = before.get(String(a[sc.f.no] ?? ''));
            const cells = obs.map((n) => num(a[n]));
            const changed = obs.map((n, k) => {
              const now = cells[k];
              if (now == null) return false;
              // Анхны нийтлэлд өмнөх агшин алга — утгатай нүд бүр ШИНЭ
              if (!prev) return true;
              return num(prev[n]) !== now;
            });
            return {
              cells,
              changed,
              no: String(a[sc.f.no] ?? '').trim(),
              work: String(a[sc.f.work] ?? '').trim() || '—',
              vol: num(a[sc.f.vol]),
              sum: num(a[sum]),
              unit: sc.f.unit ? num(a[sc.f.unit]) : null,
              money: sc.f.money ? num(a[sc.f.money]) : null,
              plan: sc.f.plan ? num(a[sc.f.plan]) : null,
              act: sc.f.act ? num(a[sc.f.act]) : null,
              ratio: sc.f.ratio ? num(a[sc.f.ratio]) : null,
            };
          });
        }
      }

      return {
        pkgLabel: p.label,
        blocks: sc.bld.filter((_, i) => sc.obyem[i]),
        compared: prevAt != null,
        rows: cnt.count ?? 0,
        filled,
        filledCount,
      };
    } catch (e) {
      /*
       * ⚠️ Алдааг ЗАЛГИХГҮЙ — нөгөө үйлчилгээг шалгасаар байгаад бүгд унавал
       * шалтгааныг нь дуудагчид хэлнэ.
       */
      last = String((e as Error)?.message ?? e);
      continue;
    }
  }
  if (last) throw new Error(last);
  return null;
}
