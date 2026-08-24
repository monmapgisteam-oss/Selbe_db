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
import { TREES } from '@/modules/sheet/bagts.trees';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { agsParams } from './agsToken';

/** Нэг мөр — «Гүйцэтгэл бөглөх» хуудасны багануудтай ижил бүрэлдэхүүн */
export type Filled = {
  no: string;
  work: string;
  /** Хувийн жин — дээд мөрд эзлэх (excel C) */
  wC: number | null;
  /** Хувийн жин — үе шатанд эзлэх (excel D) */
  wD: number | null;
  /** Одоо байгаа хувийн жин (excel E) */
  wE: number | null;
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
  /** Блок бүрийн ГҮЙЦЭТГЭЛИЙН ХУВЬ — бөглөх хуудасны нүдтэй ижил хоёр дахь мөр */
  acts: (number | null)[];
  /**
   * Тухайн нүд ӨМНӨХ АГШНААС ӨӨРЧЛӨГДСӨН эсэх.
   * ⚠️ Өмнөх агшин байхгүй (анхны нийтлэл) бол утгатай нүд бүр өөрчлөлт.
   */
  changed: boolean[];
  /** Өмнөх агшны утга — өөрчлөлтийг «юунаас юу болсон» гэж харуулахад. */
  before: (number | null)[];
  /** Модны гүн (0–4). Бүлгийн мөр эсэхийг `group`-оос. */
  depth: number;
  /** Бүлгийн мөр үү — дэд мөрүүдээсээ бодогддог, бөглөгддөггүй. */
  group: boolean;
};

/** Нэг ӨӨРЧЛӨГДСӨН нүд — жагсаалтаас дарж хүснэгт рүү үсрэхэд. */
export type Change = {
  /** `rows` доторх мөрийн индекс */
  row: number;
  /** Блокийн индекс (`blocks`-той ижил дараалалтай) */
  col: number;
  no: string;
  work: string;
  block: string;
  from: number | null;
  to: number | null;
};

export type Submission = {
  /** Аль үйлчилгээнээс — «Багц 1 · 9 давхар» */
  pkgLabel: string;
  /** `PKGS`-ийн түлхүүр — бөглөх хуудсыг ЯГ ТЭР багцаар нээхэд. */
  pkgKey: string;
  /**
   * Аль АГШИН (`YYYY-MM-DD`) — хянагчид бөглөх хуудсыг ЭНЭ өдрөөр нээнэ.
   * ⚠️ Хамгийн сүүлийн агшнаар нээвэл гүйцэтгэгч дараа нь дахин бөглөсөн
   *    тохиолдолд хянагч огт өөр тоо хараад батална.
   */
  day: string;
  /** Блокийн шошго — «5/1», «5/2» г.м. */
  blocks: string[];
  /** Өмнөх агшинтай жишсэн эсэх (анхны нийтлэлд `false`) */
  compared: boolean;
  /** Архивт нэмэгдсэн нийт мөр */
  rows: number;
  /**
   * Агшны БҮХ мөр — хуудасны дараалалаар (бүлэг + ажил).
   *
   * ⚠️ Урьд нь зөвхөн обьём бөглөгдсөн мөрийг татдаг байсан нь хянагчийг
   *    «сонгосон хэсгийг» л харуулж, контекстээс салгадаг байв. Хянагч бүтэн
   *    хүснэгтийг хараад дүгнэх ёстой.
   */
  filled: Filled[];
  /** Обьём бөглөгдсөн ажлын тоо */
  filledCount: number;
  /** Өөрчлөгдсөн нүднүүд — дарж хүснэгт рүү үсрэх жагсаалт */
  changes: Change[];
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
    // ⚠️ 2026-08-24 «Organization» хуваалцалт — нэвтэрсэн бол token хавсаргана
    body: new URLSearchParams(await agsParams({ f: 'json', ...body })).toString(),
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
      const changes: Change[] = [];
      const sum = sc.f.obyemSum;
      if (sum) {
        const w2 = where;
        const c2 = (await post(p.url, { where: `${where} AND ${sum} > 0`, returnCountOnly: 'true' })) as { count?: number };
        filledCount = c2.count ?? 0;
        {
          const obs = sc.obyem.filter(Boolean) as string[];
          /*
           * ⚠️ Блокийн ХУВЬ нь обьёмын хажууд ЗААВАЛ хэрэгтэй — «Гүйцэтгэл
           *    бөглөх» хуудсанд нүд бүр хоёр тоо (обьём + хувь) харуулдаг.
           *    Зөвхөн обьём үзүүлбэл хянагчийн харж буй хүснэгт бөглөгчийнхөөс
           *    өөр болж, хоёулаа өөр зүйл ярина.
           */
          const acts = sc.obyem.map((o, i) => (o ? sc.act[i] : null)).filter(Boolean) as string[];
          const cols = [sc.f.no, sc.f.work, sc.f.wC, sc.f.wD, sc.f.wE, sc.f.vol, sum,
            sc.f.unit, sc.f.money, sc.f.plan, sc.f.act, sc.f.ratio, ...obs, ...acts]
            .filter(Boolean) as string[];
          /*
           * ⚠️ БҮХ мөрийг ХУУДАСНЫ ДАРААЛЛААР (`OBJECTID ASC`). Эрэмбийг
           *    обьёмоор солибол бүлэг ба ажлын шатлал холилдож, хүснэгт нь
           *    «Гүйцэтгэл бөглөх»-тэй танигдахаа болино.
           * ⚠️ 2,000-ийн хязгаараас давдаг тул хуудаслана.
           */
          const feats: { attributes: Record<string, unknown> }[] = [];
          for (let off = 0; ; ) {
            const page = (await post(p.url, {
              where: w2,
              outFields: [...new Set(cols)].join(','),
              returnGeometry: 'false',
              orderByFields: 'OBJECTID ASC',
              resultOffset: String(off),
              resultRecordCount: '2000',
            })) as { features?: { attributes: Record<string, unknown> }[] };
            const got = page.features ?? [];
            feats.push(...got);
            if (got.length < 2000) break;
            off += got.length;
          }
          /*
           * ⚠️ НЭГ АГШИНД ХОЁР ХУУЛБАР БАЙЖ БОЛНО — санамсаргүй давхар
           *    нийтлэл эсвэл алдаа засаад дахин нийтэлсэн үед. Тэгвэл
           *    хуудас ХОЁР ДАХИН урт болж, мөрийн индекс нь «Гүйцэтгэл
           *    бөглөх»-ийнхтэй ЗӨРНӨ: өөрчлөлтийн жагсаалт хоёр дахин
           *    үржиж, дарахад нь хүснэгтэд тохирох нүд олдохгүй болно.
           *
           *    `bagtsSheet.loadRows` ЯГ ижил зүйл хийдэг (`feats2`) — хоёр
           *    тал НЭГ дүрмээр таслаж байж л индекс нь тэнцэнэ.
           */
          const expect = (TREES[p.key] ?? '').length;
          const feats2 = expect > 0 && feats.length > expect ? feats.slice(-expect) : feats;
          const q = { features: feats2 };
          /*
           * ӨМНӨХ АГШНЫ ижил мөрүүд — `№`-ээр индекслэнэ.
           * ⚠️ OBJECTID-аар холбож БОЛОХГҮЙ: агшин бүрд мөр ДАХИН хуулагддаг
           * тул дугаар нь өөр байна. `№` нь багц дотроо тогтвортой.
           */
          const before = new Map<string, Record<string, unknown>>();
          if (prevAt != null) {
            const prevFeats: { attributes: Record<string, unknown> }[] = [];
            for (let off = 0; ; ) {
              const pv = (await post(p.url, {
                where: `${fill} = ${ts(prevAt)}`,
                outFields: [sc.f.no, sc.f.work, ...obs].join(','),
                returnGeometry: 'false',
                orderByFields: 'OBJECTID ASC',
                resultOffset: String(off),
                resultRecordCount: '2000',
              }).catch(() => ({}))) as { features?: { attributes: Record<string, unknown> }[] };
              const got = pv.features ?? [];
              /*
               * ⚠️ Түлхүүр нь № ГАНЦААРАА БИШ — «1», «2» гэсэн дугаар хуудсанд
               *    хэдэн ч удаа давтагддаг (бүлэг бүрд шинээр эхэлдэг). Тиймээс
               *    БАЙРЛАЛААР индекслэнэ: агшин бүр хуудсыг бүтнээр, ижил
               *    дараалалаар агуулдаг тул байрлал тогтвортой.
               */
              prevFeats.push(...got);
              if (got.length < 2000) break;
              off += got.length;
            }
            // ⚠️ Өмнөх агшныг ч ИЖИЛ дүрмээр таслана — эс бөгөөс жишилт нь
            //    өөр хуулбартай харьцуулж, байхгүй өөрчлөлт «олдоно».
            const pExpect = (TREES[p.key] ?? '').length;
            const prev2 = pExpect > 0 && prevFeats.length > pExpect
              ? prevFeats.slice(-pExpect)
              : prevFeats;
            prev2.forEach((x, i) => before.set(String(i), x.attributes));
          }

          const tree = TREES[p.key] ?? '';
          const blkLabels = sc.bld.filter((_, i) => sc.obyem[i]);
          filled = (q.features ?? []).map((x, ri) => {
            const a = x.attributes;
            const prev = before.get(String(ri));
            const cells = obs.map((n) => num(a[n]));
            const beforeVals = obs.map((n) => (prev ? num(prev[n]) : null));
            const changed = obs.map((n, k) => {
              const now = cells[k];
              if (now == null) return false;
              // Анхны нийтлэлд өмнөх агшин алга — утгатай нүд бүр ШИНЭ
              if (!prev) return true;
              return num(prev[n]) !== now;
            });
            const ch = tree[ri] ?? '0';
            const group = ch >= 'A' && ch <= 'E';
            changed.forEach((yes, k) => {
              if (!yes) return;
              changes.push({
                row: ri,
                col: k,
                no: String(a[sc.f.no] ?? '').trim(),
                work: String(a[sc.f.work] ?? '').trim() || '—',
                block: blkLabels[k] ?? String(k + 1),
                from: beforeVals[k],
                to: cells[k],
              });
            });
            return {
              cells,
              acts: acts.map((n) => num(a[n])),
              changed,
              before: beforeVals,
              depth: group ? ch.charCodeAt(0) - 65 : Number(ch),
              group,
              no: String(a[sc.f.no] ?? '').trim(),
              work: String(a[sc.f.work] ?? '').trim() || '—',
              wC: sc.f.wC ? num(a[sc.f.wC]) : null,
              wD: sc.f.wD ? num(a[sc.f.wD]) : null,
              wE: sc.f.wE ? num(a[sc.f.wE]) : null,
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
        pkgKey: p.key,
        day: msToDay(at),
        blocks: sc.bld.filter((_, i) => sc.obyem[i]),
        compared: prevAt != null,
        rows: cnt.count ?? 0,
        filled,
        filledCount,
        changes,
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
