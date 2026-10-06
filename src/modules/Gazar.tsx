'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr, perLocale } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { Stats, Stat, Donut, Bars, Ring, Empty, Loading, Data, userError } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, queryFeatures, groups, groupWhere, count, sum, avg, sqlStr,
  type Aoi, type Row,
} from '@/lib/query';
import {
  GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_CLEARED, parcelLeftWhere, parcelOidsWhere,
  PKG_FAMILY_BY_BAGTS,
  layerUrl, ZONE_LAYER, ZONE_FIELDS, zoneType,
} from '@/lib/services';
import { loadPkgOverlaps, type PkgOverlap } from '@/lib/pkgSaad';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { PARCEL_OID, parcelWhere, findParcelsByNo, type ParcelHit } from '@/lib/parcelEdit';
import { statusKey, isClearedStatus, parcelAltAreaWhere } from '@/lib/land';
import { GazarEdit } from './GazarEdit';
import { Section } from '@/components/ui';
import { num, text, shades, CAT_LIGHT, NO_DATA } from '@/lib/format';
import o from './gazarOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { setNavDirty } from '@/lib/navGuard';
import g from './gazar.module.css';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — газрын зураг ТӨВД, 2 талд нь багана:
 *
 *   ┌───────────┬──────────────────┬───────────────┐
 *   │ ЧӨЛӨӨЛӨЛТ  │   ГАЗРЫН ЗУРАГ    │  БАРИЛГА       │
 *   │ үзүүлэлт + │   + Полигон      │  ─────────────│
 *   │ явц (нэг   │                  │  КАДАСТР       │
 *   │ панелд)    │                  │  (нэгтгэсэн)   │
 *   └───────────┴──────────────────┴───────────────┘
 *
 * ⚠️ Полигон зурахад 3 service ижил талбайгаар шүүгдэнэ (`aoi`), гаднахыг
 * featureEffect-ээр бүдгэрүүлнэ. Полигонгүй үед service бүрийн нийт дүн.
 */

/* ══════════════════ СААД — БАГЦААР ══════════════════ */

/** Газар чөлөөлөлтийн нэгж талбарын давхарга — саадыг үүн дээр тэмдэглэнэ */
const PARCEL_LAYER_ID = 'land:left';

/* ⚠️ Ачаалагч нь `@/lib/pkgSaad`-д — «Ерөнхий дашбоард» ч хуваалцана. */

/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР — газрын зургийн ДООД зурвас.
 *
 * ⚠️ ЯАГААД ЭНЭ ХАРАГДАЦАД: «үлдсэн нэгж талбар» нь ГАЗРЫН сэдэв. Багцын
 *    гүйцэтгэлийн цонхонд байрлуулах оролдлого 2026-08-27-нд хийгдээд
 *    хэрэглэгчийн шийдвэрээр ЭНД шилжсэн — тэнд газрын өгөгдөл нь харь
 *    зочин байсан бөгөөд 55 багцын огтлолцол тэр цонхны бусад картыг
 *    хойшлуулж байв.
 *
 * ⚠️ ЗӨВХӨН СААДТАЙ багц жагсаана (`loadPkgOverlaps` шүүсэн): 55 багцын
 *    дийлэнх нь 0 тул бүгдийг зурвал жинхэнэ саад тэг баганын дунд алга болно.
 *
 * ⚠️ Мөр дарахад ЗУРАГ тэр багцын талбарууд руу очиж, багцын ӨӨРИЙН давхарга
 *    хамт асна — «хаана» гэдгээс гадна «ЮУНД саад болж байгааг» харуулна.
 */
/**
 * СААДЫН ЧАРТЫН БҮЛГҮҮД (2026-09-15) — «Багцын гүйцэтгэл»-ийн `PACK_CATS`-тай
 * ИЖИЛ ангилал, ижил дараалал.
 * ⚠️ Нэрийг render үед `tr()`-ээр авна (хэл солиход дагана).
 */
const OV_GROUPS: { key: string; label: () => string }[] = [
  { key: 'build', label: () => tr('Барилга угсралт') },
  { key: 'infra', label: () => tr('Инженерийн дэд бүтэц') },
  { key: 'soc', label: () => tr('Нийгмийн барилга') },
  { key: 'site', label: () => tr('Өндөржилт') },
  { key: 'other', label: () => tr('Бусад') },
];

/**
 * Багцын түлхүүр → бүлэг. `PKG_FAMILY_BY_BAGTS` нь дэд бүтцийн гэр бүлийг
 * (net/pow/src/com → инженер, soc → нийгмийн, site → өндөржилт) хэлнэ;
 * барилгын багц тэнд БАЙХГҮЙ тул блокийн нэрээр (`БАГЦ1`…`БАГЦ42`) танина.
 */
const ovGroupOf = (key: string): string => {
  const fam = PKG_FAMILY_BY_BAGTS[key];
  if (fam === 'soc') return 'soc';
  if (fam === 'site') return 'site';
  if (fam) return 'infra';
  /* ⚠️ Орон сууцны багц: `БАГЦ1`…`БАГЦ42` — цэвэр тоон дагавартай */
  if (/^БАГЦ[0-9]{1,2}$/.test(key)) return 'build';
  return 'other';
};

/**
 * ⚠️ ТООН ТЭМДЭГЛЭГЭЭ («N багц · N талбар») ХАСАГДСАН (2026-09-15,
 * хэрэглэгчийн заавар). Бүлэг бүрийн толгой («Инженерийн дэд бүтэц ·
 * 103 талбар») ба зурвас бүрийн тоо нь тэр мэдээллийг аль хэдийн өгдөг.
 *
 * ⚠️ ТАТАГДААГҮЙ БАГЦЫН ДОХИО АЛДАГДААГҮЙ: зурвас тус бүр «татагдсангүй»
 * гэж шар өнгөөр бичигддэг (`pkgSaad.ts`-ийн `failed` туг) — «0 талбар»
 * гэж зурвал жинхэнэ саадгүй багцаас ялгагдахгүй болох тул тэр зам ХЭВЭЭР.
 */
function OverlapBars({
  q,
  selected,
  onPick,
}: {
  q: ReturnType<typeof useAsync<PkgOverlap[]>>;
  selected: string | null;
  onPick: (pk: PkgOverlap | null) => void;
}) {
  /**
   * ХУРААСАН БҮЛГҮҮД (2026-09-15, хэрэглэгчийн заавар: «hide/unhide дотоод
   * сэдвүүдээр»). Түлхүүр нь бүлгийн `key`, утга нь ХААЛТТАЙ эсэх.
   *
   * ⚠️ Hook нь ЭРТ БУЦААЛТУУДААС ДЭЭР — доор нь `loading`/`error`/хоосон гурван
   * `return` бий тул энд бичихгүй бол hook-ийн дараалал рендер бүрт өөрчлөгдөж
   * React унана.
   * ⚠️ САНАДАГГҮЙ (`Section collapsible`-тэй ижил зарчим): дахин ороход бүх
   * бүлэг НЭЭЛТТЭЙ эхэлнэ — нуусан бүлэг мартагдаад «багц алга болжээ» гэсэн
   * дүгнэлт төрүүлэхгүй.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  if (q.state === 'loading') {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Loading label={tr('Давхцлыг тоолж байна…')} />
      </Section>
    );
  }
  if (q.state !== 'ready') {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Empty label={tr('Давхцлыг тоолж чадсангүй.')} onRetry={q.retry} />
      </Section>
    );
  }
  const rows = q.data;
  if (!rows.length) {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
      </Section>
    );
  }
  /**
   * БАГЦЫН АНГИЛАЛ — «Багцын гүйцэтгэл» хуудасны бүлэглэлттэй ИЖИЛ
   * (`PKG_FAMILY_BY_BAGTS`: барилга · инженер · нийгмийн · өндөржилт).
   * ⚠️ Гэр бүл олдоогүй багц «Бусад»-д — чимээгүй алга болох ёсгүй.
   */
  const grouped = OV_GROUPS.map((gr) => {
    const list = rows.filter((r) => ovGroupOf(r.key) === gr.key);
    return {
      key: gr.key,
      label: gr.label(),
      rows: list.slice().sort((a, b) => b.oids.length - a.oids.length),
      total: new Set(list.flatMap((r) => r.oids)).size,
    };
  }).filter((gr) => gr.rows.length > 0);
  return (
    /* ⚠️ КАРТЫН ГАРЧИГ ЭНД БАЙХГҮЙ (2026-09-15, хэрэглэгчийн заавар):
       баганын гарчиг нь «Багц бүрийн чөлөөлөгдөөгүй талбар» болсон тул
       картад давтвал хоёр давхар нэр болно. Тоон тэмдэглэгээ нь мэдээлэл
       тул ҮЛДЭНЭ — эхний мөрөнд. */
    <Section>
      {/*
        * ⚠️ БҮЛЭГЛЭСЭН (2026-09-15, хэрэглэгчийн заавар: «саад багц чартыг
        * бүлэглэмээр байна — багцын гүйцэтгэлийн баруун панелийн доорх чарт
        * шиг»). 40 гаруй багц нэг урт жагсаалт байхад «аль төрлийн ажил
        * саадтай вэ» гэдэг нь уншигдахгүй байв.
        * ⚠️ Ангилал нь «Багцын гүйцэтгэл»-ийнхтэй ЯГ ИЖИЛ эхээс
        * (`PKG_FAMILY_BY_BAGTS`) — хоёр хуудас нэг л бүлэглэлт харуулна.
        * ⚠️ Хоосон бүлэг ОГТ гарахгүй; эрэмбэ нь саадын хэмжээгээр.
        */}
      {grouped.map((grp) => {
        const off = !!shut[grp.key];
        return (
        <div key={grp.key} className={g.ovGroup}>
          {/* ⚠️ Толгой нь БҮХЭЛДЭЭ товч — жижиг сум онилохоос хялбар
              (`ui.tsx`-ийн `Section collapsible`-тэй ижил шийдэл). */}
          <button
            type="button"
            className={g.ovGroupHd}
            aria-expanded={!off}
            onClick={() => setShut((m) => ({ ...m, [grp.key]: !off }))}
            title={off ? tr('Дэлгэх') : tr('Хураах')}
          >
            <span className={g.ovGroupCaret} aria-hidden>{off ? '▸' : '▾'}</span>
            <span className={g.ovGroupName}>{grp.label}</span>
            <span className={`${g.ovGroupNum} num`}>{tr('{0} талбар', num(grp.total))}</span>
          </button>
          {!off && (
          <Bars
            color="var(--bad)"
            max={Math.max(1, ...rows.map((r) => r.oids.length))}
            selected={selected}
            onSelect={(k) => {
              const r = rows.find((x) => x.key === k);
              onPick(r && r.key !== selected ? r : null);
            }}
            items={grp.rows.map((r) => ({
              key: r.key,
              label: tr(r.name),
              value: r.oids.length,
              /* ⚠️ Татагдаагүй багц «0 талбар» гэж БИЧИГДЭХГҮЙ (дээрх тайлбарыг үз) */
              display: r.failed ? tr('татагдсангүй') : tr('{0} талбар', num(r.oids.length)),
              ...(r.failed ? { color: 'var(--warn)' } : {}),
            }))}
          />
          )}
        </div>
        );
      })}
    </Section>
  );
}

/**
 * Нэг бүсийн ангиллын үлдсэн талбарууд.
 * `where` нь БҮСИЙН давхаргын шүүлт (түүхий `Angilal` утгууд) — чарт
 * товшиход зурагт тэр бүсийг өөрийг нь харуулахад хэрэглэгдэнэ.
 */
type ZoneLeft = {
  key: string; label: string; where: string; oids: number[];
  /** Огтлолцол унасан эсвэл ХАГАС (`Overlap.failed`) — тоо БҮРЭН БИШ */
  failed?: boolean;
};

/**
 * ҮЛДСЭН НЭГЖ ТАЛБАР — ХОТ ТӨЛӨВЛӨЛТИЙН БҮСИЙН АНГИЛЛААР (2026-09-15,
 * хэрэглэгчийн заавар: «бүсийн мэдээлэл final-ийн «Олон нийтийн бүс» гэх
 * мэт ангиллаар шүүнэ — тэр бүсэд ямар газар чөлөөлөгдөөгүй байгааг харна»).
 *
 * ⚠️ АТРИБУТААР ХОЛБОХ БОЛОМЖГҮЙ: нэгж талбарын давхаргад бүсийн код
 * (`ZONE_ID` / `RefName_1`) талбар БАЙХГҮЙ. Тиймээс «Саад — багцаар»
 * чарттай ЯГ ИЖИЛ замаар — ОРОН ЗАЙН огтлолцлоор (`overlapLeftParcels`)
 * тоолно. Тэр туслах нь давхаргын геометрийг кэшлэдэг тул ангилал бүрийн
 * хүсэлт нэг л удаа явна.
 *
 * ⚠️ Түүхий `Angilal` утгууд нэг ангиллыг ХЭД ХЭДЭН бичлэгээр илэрхийлдэг
 * («нийгмийн дэд бүтэц» ~ «нийгмийн дэд бүтцийн бүс»). `zoneType()`-оор
 * каноник болгож НЭГТГЭЭД, SQL-д түүхий утгуудыг нь `IN`-ээр өгнө —
 * каноник нэрээр шүүвэл нэг ч бүс таарахгүй.
 *
 * ⚠️ Нэг талбар ХОЁР бүсэд давхцаж болно (бүсийн зааг дээр) — баганы
 * нийлбэр «Үлдсэн»-ээс ИХ гарч болно. Саадын чарттай ижил шинж.
 */
function useZoneLeft() {
  return useAsync<ZoneLeft[]>(async () => {
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), {
      outFields: [ZONE_FIELDS.type],
    });
    /* каноник ангилал → түүхий утгууд */
    const by = new Map<string, Set<string>>();
    for (const r of rows) {
      const raw = String(r[ZONE_FIELDS.type] ?? '').trim();
      if (!raw) continue;
      const canon = zoneType(raw);
      if (!by.has(canon)) by.set(canon, new Set());
      by.get(canon)!.add(raw);
    }
    /* ⚠️ Ангилал бүр ТУСДАА огтлолцол; нэг нь унавал бусад нь үлдэнэ */
    const list = [...by].map(([canon, raws]) => ({
      canon,
      where: `${ZONE_FIELDS.type} IN (${[...raws].map((v) => `N'${sq(v)}'`).join(', ')})`,
    }));
    const res = await Promise.allSettled(list.map((z) => overlapLeftParcels([{
      layerId: ZONE_LAYER.id,
      where: z.where,
    }])));
    return list
      .map((z, i) => {
        const r = res[i];
        return {
          key: z.canon,
          label: z.canon,
          where: z.where,
          oids: r.status === 'fulfilled' ? r.value.oids : [],
          /* ⚠️ Унасан/хагас огтлолцлыг «үлдсэн талбаргүй» бүсээс ЯЛГАНА (2026-09-25
             аудит): урьд нь `[]` болгоод доорх шүүлтээр хаядаг тул тоологдоогүй
             бүс «чөлөөлөгдөөгүй талбар алга» гэж уншигддаг байв. */
          failed: r.status !== 'fulfilled' || (r.value.failed?.length ?? 0) > 0,
        };
      })
      /* ⚠️ Үлдсэн талбаргүй бүс ОГТ гарахгүй — «0» зурвас мэдээлэл өгөхгүй
         атлаа жагсаалтыг л уртасгана. Татагдаагүй бүс ҮЛДЭНЭ («татагдсангүй»). */
      .filter((x) => x.oids.length > 0 || x.failed)
      .sort((a, b) => b.oids.length - a.oids.length);
  }, []);
}

/** Газрын зурагт харагдах давхаргууд — чөлөөлөлт + барилга/кадастр.
 *  (Хил `khil1` нь `ALWAYS_ON_IDS`-ээр автоматаар ил тул энд бичихгүй; `khil2` 2026-09-17-нд хасагдсан.) */
const VISIBLE_IDS = ['gazar:parcel', 'gazar:building', 'land:left'];
/**
 * ⚠️ ТООЦООЛООГҮЙ ҮЕИЙН давхаргууд (2026-09-15, хэрэглэгчийн заавар:
 * «Сэлбэгээс гаднах parcel идэвхгүй байх — газар чөлөөлөлт тооцоолол дээр
 * харагдана»).
 *
 * Кадастрын нэгж ба үнэлгээний барилга нь ТӨСЛИЙН ТАЛБАЙГААС ГАДУУР бүх
 * хотыг хамардаг тул анхнаасаа асаалттай байхад зураг бүхэлдээ будагдаж,
 * гол сэдэв болох ҮЛДСЭН НЭГЖ ТАЛБАР (`land:left`) дотор нь алга болдог
 * байв. Одоо полигон зурж тооцоолмогц л нэмэгдэнэ.
 */
const BASE_IDS = ['land:left'];
/** Полигоноор ШҮҮГДЭХ давхаргууд — featureEffect (бүдгэрүүлэлт) зөвхөн эдгээрт */
const FILTER_IDS = ['land:left', 'gazar:building', 'gazar:parcel'];

/**
 * Төлөв → өнгө ба нэр.
 *
 * ⚠️ 2026-09-06: ГУРВААС НЭГ болов. Шинэ эх (`Selbe_parcel_20260906`) нь
 * «Цэвэрлэсэн нэгж талбар» ба «Үлдсэн нэгж талбар» ангиллыг АГУУЛАХГҮЙ —
 * тэдгээр түлхүүрийг үлдээвэл `smap`-д хэзээ ч таарахгүй, харин жинхэнэ 8
 * шалтгаан нэргүй/өнгөгүй үлдэнэ. Одоо ЗӨВХӨН «Бүрэн чөлөөлсөн» нь нэрлэгдсэн
 * САЙН төлөв; бусад БҮГД нь барилга эхлүүлэхэд саад тул доорх fallback-аар
 * var(--bad) болно.
 *
 * ⚠️ value = өгөгдлийн ТҮҮХИЙ утга — tr()-ээр ОРЧУУЛАХГҮЙ: `smap`-ийн түлхүүр
 * түүхий тул EN горимд tr() утгаар хайвал таарахгүй, чөлөөлөлт 0% болдог байв.
 * Зөвхөн шошго (label) орчуулагдана.
 */
const STATUS_META = [
  { value: PARCEL_CLEARED, get label() { return tr('Бүрэн чөлөөлсөн'); }, color: 'var(--good)' },
] as const;

/**
 * ⚠️ Статус баганыг ХАТУУ 3-аар БИШ, өгөгдлөөс ШУУД угсарна. Эх сервист
 * мэдэгдэж буй 3-аас ГАДНА төлөв (жишээ нь «Гэрээлсэн») эсвэл хоосон утга гарч
 * ирвэл тэдгээр талбарууд «Нийт»-д тоологдоод график дээр АЛГА болж, баганы
 * нийлбэр нийт дүнд хүрэхгүй байв. Эдгээр map нь мэдэгдэж буй төлөвүүдэд тогтмол
 * нэр/өнгө/дараалал өгч, бусдыг нь автоматаар доор нэмнэ — баганууд «Нийт»-тэй
 * ҮРГЭЛЖ тэнцэнэ (шинэ/устсан төлөвт өөрөө зохицно). */
const STATUS_ORDER: string[] = STATUS_META.map((m) => m.value);
/* ⚠️ 2026-09-30: хэл бүрд дахин бодогдоно — `label` нь getter тул энд агшинд авбал хөлдөнө */
const STATUS_LABEL = perLocale((): Record<string, string> => Object.fromEntries(STATUS_META.map((m) => [m.value, m.label])));
const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.color]));

/** Donut-ийн зүсмэгийн палитр — ГАНЦ өгөгдлийн өнгөний (Сэлбэ teal) сүүдэр */
/**
 * ⚠️ envhub: өгөгдлийн ГАНЦ өнгө (var(--data)). Урьд нь энэ харагдацын НОГООН
 * identity-ийн (CAT_LIGHT[3]) уусгалт байсныг --data-гийн эх болох Сэлбэ teal
 * (CAT_LIGHT[0]) руу шилжүүлэв — Dashboard-ын `shade(ACCENT…)`-тэй ижил хэв.
 * Зүсмэгүүд утга ялгаагүй тул нэг өнгөний сүүдрээр (зөвхөн Donut-д) зааглагдана;
 * Bars нь бүр ганц var(--data)-гаар зурагдана.
 */
const PALETTE = shades(CAT_LIGHT[0], 10);

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/**
 * ₮ дүн — БҮТНЭЭР, мянгатын таслалтай. `Stat` нь утга/нэгжийг тусад нь
 * байрлуулдаг тул хос буцаана.
 * ⚠️ 2026-09-01: урьд нь «их наяд / тэрбум / сая» гэж товчилдог байв —
 *    хэрэглэгчийн шийдвэрээр бүх мөнгөн дүн бүтнээр. Товчлолыг бүү сэргээ.
 */
const money = (v: number): { v: string; unit: string } => ({ v: num(v), unit: '₮' });

/**
 * Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар, тоо НЭГЖТЭЙ).
 *
 * ⚠️ `where`-ийг ЭНД, `groupWhere`-ээр бүтээнэ (2026-09-15-ны аудит).
 *    Урьд нь зүсмэгийн ШОШГЫГ (`grp.label`) `eqOrNull`-д дамжуулдаг байв:
 *    шошго нь `tr('Тодорхойгүй')`-ээс гардаг тул АНГЛИ горимд «Unspecified»
 *    болж, `label === 'Тодорхойгүй'` салаа ХЭЗЭЭ Ч ажиллахгүй — «Zoriulalt =
 *    'Unspecified'» гэсэн WHERE явж, ArcGIS 0 мөр буцааж, давхарга бүтнээрээ
 *    алга болдог байлаа. `groupWhere` нь ТҮҮХИЙ утгуудаар (`raws`) шүүдэг тул
 *    орчуулгаас бүрэн хамааралгүй, мөн зайтай хувилбарыг ч зөв хамарна.
 */
function toItems(rows: Row[], field: string, valueKey: string, unit = tr('ш')) {
  return groups(rows, field, tr('Тодорхойгүй'), [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    display: `${num(grp.values[valueKey] ?? 0)} ${unit}`,
    color: PALETTE[i % PALETTE.length],
    where: groupWhere(field, grp),
  }));
}

/**
 * Зүсмэгийн түлхүүрээс түүний БЭЛЭН WHERE-ийг олно.
 *
 * ⚠️ Олдохгүй бол `1=0` — БҮХ мөр таарах `1=1` БИШ. Шүүлт нь «энэ зүсмэгийг
 *    л үзүүл» гэсэн утгатай тул алдаа гарвал хоосон харагдах нь зөв; эсрэгээр
 *    бол хэрэглэгч шүүсэн гэж бодоод бүх өгөгдлийг хардаг.
 */
const whereOf = (items: { key: string; where: string }[], k: string): string =>
  items.find((x) => x.key === k)?.where ?? '1=0';

type StatusBars = { key: string; label: string; value: number; color: string; where: string }[];
type ReasonItems = {
  key: string; label: string; n: number; pct: number; area: number; color: string;
  /** Түүхий утгуудаас урьдчилан бүтээсэн WHERE — дарж зурагт шүүхэд */
  where: string;
}[];

/* ── Чарт дарж газрын зурагт шүүх (дашбоардтай ИЖИЛ механизм) ── */

type GFlt = { grp: string; key: string; label: string; where: string; only: string[] };

/** SQL string literal — дан хашилтыг давхарлана */
const sq = (v: string) => v.replace(/'/g, "''");

/*
 * ⚠️ `eqOrNull` УСТГАВ (2026-09-15-ны аудит). Тэр нь зүсмэгийн ОРЧУУЛСАН
 *    шошгыг (`tr('Тодорхойгүй')`) түүхий утгатай жишдэг байсан тул англи
 *    горимд «Unspecified» болж салаа нь хэзээ ч ажиллахгүй, мөн Юникод
 *    утгад `N'…'` угтваргүй тул шүүлт 0 мөр буцаадаг байв. Одоо `toItems`
 *    нь `groupWhere`-ээр ТҮҮХИЙ утгуудаас WHERE бүтээнэ (`whereOf`).
 */

type GazarData = {
  /** `Tuluv` төлөвөөс: чөлөөлсөн (бүрэн+цэвэрлэсэн) ба үлдсэн */
  left: { n: number; area: number; cleared: number; cleaned: number; remaining: number; resolved: number };
  /** Төлөв бүрийн ТАЛБАЙ (га) — газрын зурагтай ижил өнгөөр */
  statusAreaBy: StatusBars;
  /** Үлдсэн талбарын ШАЛТГААН (явцын_мэдээ) — тоо/хувь/талбайг тус тусад нь */
  reasons: ReasonItems;
  /** ⚠️ area устсан — test_data [96]-д area_m2 талбар байхгүй */
  /** ⚠️ 2026-09-29 (аудит 10): `value` нь `null` = үнэлгээгүй (SUM = null), 0 биш */
  b: { n: number; value: number | null; floors: number; unitPrice: number };
  bType: ReturnType<typeof toItems>;
  bMat: ReturnType<typeof toItems>;
  p: { n: number; area: number };
  pRight: ReturnType<typeof toItems>;
  pUse: ReturnType<typeof toItems>;
};

export function Gazar({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  /* ⚠️ 2026-09-30: `hostRef`-ийг ТУСАД НЬ задална — React Compiler нь `*Ref` нэртэй
     талбар агуулсан обьектыг бүхэлд нь ref гэж үзэж, `side.style`/`side.left`
     хандалт бүрийг «render үеийн ref хандалт» гэж анхааруулдаг байв. */
  const { hostRef: sideHostRef, ...side } = useSideResize('gazar');
  const { setHighlight, zoomToWhere, refreshLayer } = useMap();

  /**
   * ЗАСВАРЫН ГОРИМ — «Талбар засах» товчоор асна.
   *
   * ⚠️ ГОРИМТОЙ БОЛГОСОН ШАЛТГААН: газрын зураг дээр товших нь энэ харагдацад
   *    ердийн үйлдэл (полигон зурах, багц сонгох). Товшилт бүрд маягт нээвэл
   *    зүгээр л газар харж байгаа хүнд саад болно. Горим асаалттай үед л
   *    товшилт маягт нээнэ.
   *
   * ⚠️ 2026-09-30: СЭРГЭЭВ. 2026-09-15-ны `tailan` нэгтгэлд «талбар засах
   *    хэрэггүй шүү» гэж хасагдсан байсныг хэрэглэгч «төлөв солих хэсэг алга
   *    болсон» гэж дахин шаардсан тул орох цэгийг бүхэлд нь буцаав
   *    (горим · товшилт · маягт · хадгалаагүй маягтын хамгаалалт · CSS · i18n ·
   *    `viewEdit.check.mjs` §5).
   */
  const [editMode, setEditMode] = useState(false);
  const [editOid, setEditOid] = useState<number | null>(null);
  const [saved, setSaved] = useState('');
  /**
   * КАДАСТРЫН ДУГААРААР ХАЙХ (засварын горимд).
   *
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь талбарыг ЗӨВХӨН зураг дээр
   *    олж дарах замтай байв — 2,000 гаруй жижиг полигоны дундаас дугаараар нь
   *    хайх арга байгаагүй. Дугаар бичээд Enter → олдвол зураг тэр рүү очиж,
   *    тодруулж, маягтыг нээнэ. Амьдаар нэг дугаар ХОЁР мөрд байх тохиолдол бий
   *    (2026-10-01: 3 дугаар × 2 мөр) тул олон олдвол ЖАГСААЖ сонгуулна —
   *    эхнийхийг нь чимээгүй нээвэл буруу мөрийг засна.
   */
  const [findNo, setFindNo] = useState('');
  const [finding, setFinding] = useState(false);
  const [findMsg, setFindMsg] = useState('');
  const [hits, setHits] = useState<ParcelHit[]>([]);

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  /**
   * ⚠️ ЗАСАХ ЭРХ ТУСДАА (`caps` → `gazar`). Газар чөлөөлөлтийг ХАРАХ нь
   *    төлөвийг нь СОЛИХ эрх биш: нэг талбарын төлөв солиход чөлөөлөлтийн хувь,
   *    давхцлын тооцоо, дашбоард, тайлан бүгд дагаж өөрчлөгдөнө.
   */
  const canEdit = useMemo(
    () => authStatus === 'off' || hasCap(user?.username, 'gazar'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );

  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [drawToken, setDrawToken] = useState(0);
  /**
   * ПОЛИГОН ЗУРАХ ГОРИМ АСААЛТТАЙ ЭСЭХ (2026-09-15).
   * ⚠️ `drawToken` нь зөвхөн ӨДӨӨГЧ (тоолуур) тул «одоо зурж байна уу»
   * гэдгийг хэлж чадахгүй — заавар харуулахад тусдаа төлөв хэрэгтэй.
   */
  const [drawing, setDrawing] = useState(false);
  const [clearToken, setClearToken] = useState(0);
  /**
   * Кадастрын гурван давхарга нь СУУРЬ; каталогоос порталын аль ч давхаргыг
   * дээр нь нэмнэ (`useLayerPicks`).
   */
  /* ⚠️ Суурь нь ТООЦООЛЛООС хамаарна (`BASE_IDS`-ийн тайлбарыг үз).
     `useLayerPicks` нь хэрэглэгчийн өөрийн сонголтыг суурь солигдоход ч
     хадгалдаг тул гараар нэмсэн давхарга алга болохгүй. */
  /* ⚠️ ТОВЧ ДАРМАГЦ (`drawing`) — полигон дуустал хүлээхгүй: хэрэглэгч
     Сэлбэгийн ГАДНАХ нэгж талбар, барилгыг ХАРЖ байж полигоноо зурна
     (2026-09-15, хэрэглэгчийн заавар). */
  const [visible, setVisible] = useLayerPicks(aoi || drawing ? VISIBLE_IDS : BASE_IDS);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  /**
   * СААД — БАГЦААР (доод зурвас). Сонголт нь ЗУРГИЙГ удирдана: тэр багцын
   * давхарга асаж, парселийн давхарга түүний талбаруудаар нарийсна.
   */
  const ovQ = useAsync(loadPkgOverlaps, []);

  /** Бүсийн ангилал бүрийн үлдсэн талбар — `useZoneLeft`-ийн тайлбарыг үз */
  const zoneQ = useZoneLeft();
  const [ovPick, setOvPick] = useState<PkgOverlap | null>(null);


  /**
   * Сонгосон багцын давхаргууд зурагт НЭМЭГДЭНЭ.
   * ⚠️ `setVisible` рүү БИЧИХГҮЙ — тэр нь хэрэглэгчийн каталогийн сонголт;
   *    сонголт солигдох бүрд бохирдоно. Зөвхөн ГАРАЛТ дээр давхарлана.
   */
  const mapVisible = useMemo(
    () => {
      /* ⚠️ Засварын горимд ЗӨВХӨН нэгж талбарын давхарга — бусад давхарга
         товшилтыг булааж, парсел биш объект сонгогдоно. */
      if (editMode) return [PARCEL_LAYER_ID];
      return ovPick ? [...new Set([...visible, ...ovPick.layerIds])] : visible;
    },
    [visible, ovPick, editMode],
  );

  /**
   * ДАВХАРГА БҮРИЙН ШҮҮЛТ — зөвхөн багц сонгосон үед.
   * ⚠️ `layerWhere` өгөгдмөгц MapCanvas нь бүсийн (zone) fallback-ийг БҮХ
   *    давхаргад алгасдаг тул сонголтгүй үед ОГТ өгөхгүй (`undefined`) —
   *    эс бөгөөс бүсээр шүүх нь чимээгүй унтарна.
   */
  const ovWhere = useMemo<Record<string, string | null> | undefined>(() => {
    if (!ovPick) return undefined;
    const w: Record<string, string | null> = {};
    for (const id of ovPick.layerIds) w[id] = ovPick.where;
    /* Газар чөлөөлөлтийн давхаргаас ЗӨВХӨН саад болж буй талбарууд.
       ⚠️ 2026-09-08: ХООСОН OID-Д `1=0`. `parcelOidsWhere([])` нь `FID IN ()`
       гэсэн БУРУУ SQL үүсгэдэг бөгөөд ArcGIS түүнд HTTP 200 + `{error}`
       («'where' parameter is invalid») буцаана — тэр үед давхаргын
       `definitionExpression` эвдэрч, нэгж талбарын давхарга ЧИМЭЭГҮЙ бүрмөсөн
       зурагдахаа болино («зураг эвдэрлээ» гэж уншигдана). Татагдаагүй
       (`failed`) багцын `oids` нь хоосон тул энэ зам БОДИТООР тохиолддог.
       `1=0` нь давхаргыг ЗОРИУДААР хоослоно — буруу SQL биш. */
    w[PARCEL_LAYER_ID] = ovPick.oids.length ? parcelOidsWhere(ovPick.oids) : '1=0';
    return w;
  }, [ovPick]);

  /**
   * Сонгосон багцын саадууд УЛААНААР ялгарна.
   *
   * ⚠️ ЗААВАЛ мемолно. `MapCanvas` нь `memo()` бөгөөд түүний хамгийн хүнд
   * эффект (127 давхаргын renderer-ийг дахин угсардаг) `layerStyle`-ыг
   * хамааралдаа авдаг. Inline объект байхад рендер бүрд шинэ лавлагаа болж
   * memo эвдэрдэг: «Тунгалаг» гулсуурыг чирэхэд pointermove бүрд 2,119
   * объекттой нэгж талбарын renderer дахин оноогдож, зураг анивчин чирэлт
   * гацдаг байв. `ovWhere` дээрх мемо ижил зорилготой (мөн PkgProg.tsx /
   * Bagts.tsx-ийн `parcelStyle`).
   *
   * ⚠️ АНИВЧИЛТ ХАСАГДСАН (2026-08-28, хэрэглэгчийн заавар): пульс нь
   * талбаруудыг тасралтгүй томруулж жижигрүүлдэг тул хэлбэр, хэмжээг нь
   * нүдээр уншиж болохгүй болно. Улаан өнгө өөрөө хангалттай ялгана.
   */
  const parcelStyle = useMemo(
    () => (ovPick ? { [PARCEL_LAYER_ID]: { hue: '#dc2626', fill: 0.3, width: 2.1 } } : undefined),
    [ovPick],
  );

  /**
   * Чарт-шүүлт — бар/зүсмэг дарахад холбогдох давхаргад тодруулга тавина.
   * Ижил мөрийг дахин дарвал арилна. Полигон (AOI) шүүлттэй ЗЭРЭГ биш —
   * сүүлд хийсэн үйлдэл нь тодруулгыг эзэмшинэ.
   */
  const [flt, setFlt] = useState<GFlt | null>(null);
  /* Сонголт хийхэд зураг тэр талбарууд руу очно */
  const pickOverlap = useCallback((r: PkgOverlap | null) => {
    setOvPick(r);
    /* ⚠️ Анимацигүй — багц дараалан товшиход гөлгөр нислэг нь
       хойшлол мэт мэдрэгддэг (2026-08-28, хэрэглэгчийн заавар). */
    /* ⚠️ 2026-09-08: ХООСОН OID-Д НИСЭХГҮЙ — `FID IN ()` нь буруу SQL тул
       `extentOf` алдаа буцааж, зураг хөдөлгөөнгүй үлддэг (татагдаагүй багц). */
    if (r?.oids.length) zoomToWhere(PARCEL_LAYER_ID, parcelOidsWhere(r.oids), { animate: false });
  }, [zoomToWhere]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  /**
   * ⚠️ AOI-ийн ТҮҮХИЙ геометр — `pickFlt` (deps-гүй useCallback) дотор state
   * биш ref-ээс уншина. `setHighlight` нь тодруулгыг БҮРЭН орлуулдаг тул
   * геометргүй дуудвал полигоны орон зайн бүдгэрүүлэлт алга болж, самбарын тоо
   * полигоноор шүүгдсэн атал зураг бүх талбайг тодоор харуулна.
   */
  const aoiGeomRef = useRef<__esri.Geometry | null>(null);
  /** «Цуцлах»-ын дараах `onSketch(null)`-д өмнөх AOI-г хадгалах туг (2026-09-21) */
  const keepAoiRef = useRef(false);

  /** Sketch-ээс ирсэн геометр — бүдгэрүүлэлт ба REST шүүлтийг ЗЭРЭГ тохируулна */
  const onSketch = useCallback((geom: __esri.Geometry | null) => {
    setDrawing(false);
    /* ⚠️ 2026-09-21: «Дахин тооцоолох → Цуцлах» — MapCanvas `clearToken`-д
       `onSketch(null)` дууддаг тул урьд нь ЦУЦЛАХАД л тооцоолсон AOI/үр дүн
       алга болдог байв (:564 «зөвхөн полигон зураагүй үед» гэсэн амлалт
       зөрчигдөж). Одоо зөвхөн зурж буй ноорог хаягдана: өмнөх AOI ХЭВЭЭР,
       бүдгэрүүлэлтийг (sketch давхарга цэвэрлэгдсэн тул) дахин тавина. */
    if (!geom && keepAoiRef.current) {
      keepAoiRef.current = false;
      const prev = aoiGeomRef.current;
      if (prev) { setHighlight(null, FILTER_IDS, prev); return; }
    }
    setFlt(null); // полигон шүүлт тодруулгыг эзэмшинэ — чарт-шүүлтийг цэвэрлэнэ
    aoiGeomRef.current = geom;
    if (!geom) {
      setAoi(null);
      setHighlight(null);
      return;
    }
    const poly = geom as unknown as { rings: number[][][]; spatialReference?: { wkid?: number } };
    const wkid = poly.spatialReference?.wkid ?? 102100;
    setAoi({
      geometry: { rings: poly.rings, spatialReference: { wkid } },
      wkid,
      type: 'polygon',
      rel: 'intersects',
    });
    setHighlight(null, FILTER_IDS, geom);
  }, [setHighlight]);

  /**
   * «ЧӨЛӨӨЛӨЛТ ТООЦООЛОХ» — ДАРААС ДАРАХАД ЦУЦЛАНА (2026-09-15, хэрэглэгчийн
   * заавар: «дараад баруун панел гарч ирнэ, дахиад дархад нөгөө панел гарч
   * ирнэ»).
   *
   * ⚠️ ЗӨВХӨН ПОЛИГОН ЗУРААГҮЙ БАЙХАД цуцлана. Полигон зурж дуусмагц
   * `drawing` унтарч `aoi` асдаг тул тэр үед энэ товч «Дахин тооцоолох»
   * хэвээрээ — тооцоог хаяхыг «Цэвэрлэх» товч хийнэ.
   */

  /*
   * ПОЛИГОН ЗУРАХ — эхлүүлэх / зогсоох.
   *
   * ⚠️ 2026-09-15-ны нэгтгэлд ЭНД байсан «хадгалаагүй маягтыг хамгаалах»
   *    блок (`editDirty` · `askDrop` · `onMapPick` · `closeEdit`) ХАСАГДСАН:
   *    `tailan` салбар нь энэ харагдацаас нэгж талбар засах ОРОХ ЦЭГИЙГ
   *    бүхэлд нь авсан (хэрэглэгч: «талбар засах хэрэггүй шүү») тул
   *    хамгаалах маягт үлдээгүй. `GazarEdit`, `parcelEdit`, `gazar` эрх нь
   *    ХЭВЭЭР — сэргээвэл тэр хамгаалалтыг ч буцааж нэмнэ.
   */
  const startDraw = useCallback(() => {
    if (drawing) {
      setDrawing(false);
      /* Зурж эхэлсэн хагас полигоныг зургаас арилгана.
         ⚠️ 2026-09-21: AOI байгаа бол түүнийг ХАДГАЛНА (`onSketch`-ийн туг) —
         «Цуцлах» нь ноорогийг л хаяна, тооцоог «Цэвэрлэх» хаяна. */
      keepAoiRef.current = aoiGeomRef.current != null;
      setClearToken((t) => t + 1);
      return;
    }
    /* ⚠️ 2026-09-29 (аудит 10): багцын сонголтыг ЦЭВЭРЛЭНЭ — `OverlapBars`
       зурж эхлэхэд нуугддаг ч `ovPick` үлдэж, зураг тэр багцын саадын
       талбаруудаар шүүгдсэн хэвээр, зүүн/баруун самбар харин полигон доторх
       БҮХ талбарыг тоолдог байв (зураг ба тоо зөрнө). */
    setOvPick(null);
    setDrawToken((t) => t + 1);
    setDrawing(true);
  }, [drawing]);

  /*
   * ⚠️ ХАДГАЛААГҮЙ МАЯГТЫГ ХАМГААЛНА (2026-09-15-ны хэрэглээний аудит).
   *
   *    `GazarEdit` дотор «Хадгалаагүй өөрчлөлт байна. Хаах уу?» баталгаа бий
   *    (`tryClose`), гэвч ЭНЭ файлын `exitEdit`/`onMapPick` нь `editOid`-ыг
   *    `null` болгож компонентыг ШУУД салгадаг тул тэр баталгаа ХЭЗЭЭ Ч
   *    дуудагддаггүй байв. Одоо маягт нь `onDirty`-гээр төлөвөө мэдэгдэж,
   *    энд гурван замд (дахин товших · «Хаах» · өөр парсел) бүгдэд нь асууна.
   */
  const editDirty = useRef(false);
  /* ⚠️ 2026-09-30: тугийг `navGuard`-д ч тэмдэглэнэ — харагдац солих, лого, «Гарах», F5
     үед `Portal.confirmLeave` / хөтөч асууна (урьд нь зөвхөн энэ харагдац доторх 3 замд). */
  const markDirty = useCallback((v: boolean) => {
    editDirty.current = v;
    setNavDirty('gazar', v, tr('Газар чөлөөлөлт'));
  }, []);
  useEffect(() => () => setNavDirty('gazar', false), []);
  const askDrop = useCallback((): boolean => {
    if (!editDirty.current) return true;
    if (!window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаях уу?'))) return false;
    markDirty(false);
    return true;
  }, [markDirty]);

  /**
   * ГАЗРЫН ЗУРАГ ДЭЭР ТАЛБАР ТОВШИХ.
   *
   * ⚠️ `useCallback` ЗААВАЛ: inline функц нь `memo(MapCanvas)`-ийн пропс
   *    өөрчлөгдсөн гэж үзүүлж, товшилт бүрд газрын зураг бүхэлдээ дахин
   *    баригдана (`PkgProg.onMapPick`-ийн тайлбар).
   * ⚠️ ХООСОН ГАЗАР товшиход `(null, null)` ирнэ — сонголтыг ЦЭВЭРЛЭНЭ.
   * ⚠️ ЗӨВХӨН OID-г авна. `onPick`-ийн атрибут нь давхаргын `outFields`-д
   *    ачаалагдсанаар хязгаарлагдах тул маягт нь мөрөө ӨӨРӨӨ бүтнээр татна.
   */
  const onMapPick = useCallback((a: Record<string, unknown> | null, id: string | null) => {
    if (!editMode) return;
    if (!askDrop()) return;
    if (!a || id !== PARCEL_LAYER_ID) { setEditOid(null); setHighlight(null); return; }
    const oid = Number(a[PARCEL_OID]);
    if (!Number.isFinite(oid)) { setEditOid(null); return; }
    setEditOid(oid);
    setHighlight(parcelWhere(oid), PARCEL_LAYER_ID);
  }, [editMode, setHighlight, askDrop]);

  /**
   * ДУГААРААР ОЛСОН ТАЛБАРЫГ НЭЭНЭ — зураг дээр дарсантай ИЖИЛ үр дүн
   * (тодруулга + маягт), нэмээд зураг тэр талбар руу очно.
   * ⚠️ Хадгалаагүй маягт байвал `onMapPick`-ийн адил ЭХЛЭЭД асууна.
   */
  const openParcel = useCallback((oid: number) => {
    if (!askDrop()) return;
    setHits([]);
    setFindMsg('');
    setEditOid(oid);
    setHighlight(parcelWhere(oid), PARCEL_LAYER_ID);
    /* ⚠️ Анимацигүй — `pickOverlap`-ийн 2026-08-28-ны шийдвэртэй ижил */
    zoomToWhere(PARCEL_LAYER_ID, parcelWhere(oid), { animate: false });
  }, [askDrop, setHighlight, zoomToWhere]);

  const findParcel = useCallback(async () => {
    const no = findNo.trim();
    if (!no) return;
    setFinding(true);
    setFindMsg('');
    setHits([]);
    try {
      const list = await findParcelsByNo(no);
      if (!list.length) setFindMsg(tr('«{0}» дугаартай нэгж талбар олдсонгүй', no));
      else if (list.length === 1) openParcel(list[0].oid);
      else {
        setHits(list);
        setFindMsg(tr('{0} нэгж талбар олдлоо — сонгоно уу', num(list.length)));
      }
    } catch (e) {
      /* ⚠️ Алдааг НУУХГҮЙ — «олдсонгүй» гэж худал хэлэхгүй */
      setFindMsg(userError(e));
    } finally {
      setFinding(false);
    }
  }, [findNo, openParcel]);

  const closeEdit = useCallback(() => {
    markDirty(false);
    setEditOid(null);
    setHighlight(null);
  }, [setHighlight, markDirty]);

  /** Засварын горимоос бүрэн гарах — маягт, тодруулга хоёулаа цэвэрлэгдэнэ */
  const exitEdit = useCallback(() => {
    if (!askDrop()) return;
    setEditMode(false);
    setEditOid(null);
    setHighlight(null);
    /* ⚠️ 2026-10-01: хайлтын үр дүн дараагийн удаа хуучирч харагдахгүй */
    setFindMsg('');
    setHits([]);
  }, [setHighlight, askDrop]);

  /**
   * ЗУРААЛТЫГ Esc-ЭЭР ЦУЦЛАВ (`MapCanvas.onSketchCancel`).
   *
   * ⚠️ 2026-09-29 (аудит 10): Esc-ийн цуцлалт `onSketch`-д ИРДЭГГҮЙ тул `drawing`
   *    асаалттай гацаж, товч «Цуцлах» хэвээр, баруун багана бүх талбайн дүнг
   *    «тооцоолсон» мэт харуулдаг байв (`DedButets`-ийн 09-25-ны засвартай ижил).
   * ⚠️ Зөвхөн горимыг унтраана — тооцоолсон AOI-г ХӨНДӨХГҮЙ (`onSketch(null)` биш).
   */
  const onSketchCancel = useCallback(() => setDrawing(false), []);
  /* ⚠️ 2026-09-29 (аудит 10): 2D-ээс гарахад `MapCanvas` SketchViewModel-ийг
     устгадаг ба тэр үед `cancel` үйл явдал ИРЭХГҮЙ — горимыг энд унтраана
     (товч 3D-д идэвхгүй тул хэрэглэгч өөрөө цуцалж чадахгүй). */
  /* ⚠️ 2026-09-30: эффект биш, RENDER дунд — `dim` солигдсон (ба эхний) render-т л. */
  const [drawDim, setDrawDim] = useState<typeof dim | null>(null);
  if (drawDim !== dim) {
    setDrawDim(dim);
    if (dim !== '2d') setDrawing(false);
  }

  // Шүүлт солигдоход зураг тэр объектууд руу нисэнэ
  useZoomToFilter({ zone, layerId: flt?.only?.[0] ?? null, where: flt?.where ?? null });
  const fltRef = useRef<GFlt | null>(null);
  useSyncRef(fltRef, flt);
  // ⚠️ setState-ийн updater ДОТОР setHighlight дуудаж болохгүй (React render
  //    дундуур өөр компонент шинэчилнэ) — тул ref-ээс уншиж ГАДНА нь дуудна.

  /**
   * ЗАСВАРЫН ГОРИМД ОРОХ.
   *
   * ⚠️ ИДЭВХТЭЙ ШҮҮЛТҮҮДИЙГ ЗААВАЛ ЦЭВЭРЛЭНЭ. Багц сонгосон байхад
   * `ovWhere` нь `land:left` давхаргыг «OBJECTID IN (…)» гэж НАРИЙСГАДАГ —
   * тэр үед засварын горимд ЗӨВХӨН тэр багцын саад болж буй талбарууд
   * зурагдаж, бусад талбар дээр товшиход ЮУ Ч БОЛОХГҮЙ. Хэрэглэгч «засвар
   * ажиллахгүй байна» гэж дүгнэнэ. Чартын шүүлт ба полигоны бүдгэрүүлэлт
   * мөн адил төөрөгдүүлнэ — AOI-г ч `clear`-ээр хаяна.
   */
  const enterEdit = useCallback(() => {
    setOvPick(null);
    setFlt(null);
    fltRef.current = null;
    /* ⚠️ 2026-09-30: AOI-г ЖИНХЭНЭЭР хаяна — дээрх тайлбарын амлалт кодод
       байгаагүй. Урьд нь зөвхөн `setHighlight(null)` дуудагдаж бүдгэрүүлэлт
       алга болдог ч `aoi` ХЭВЭЭР үлддэг байв: горимоос гарахад самбарууд
       «Сонгосон талбай · полигоноор шүүсэн» тоо харуулж байхад зураг БҮХ
       талбайг тодоор харуулна (`pickFlt`-ийн ⚠️-д хориглосон зөрүү). Мөн
       засварын горимд полигон зурагт үлдсэн тул түүн дотор товшиход
       SketchViewModel полигоныг ЗАСАХ горимд оруулж, чирэлт нь AOI-г
       чимээгүй өөрчилдөг байв. `clear()`-тэй ижил алхмууд (тэр нь доор
       зарлагддаг тул энд давтав). */
    keepAoiRef.current = false;
    aoiGeomRef.current = null;
    setAoi(null);
    setDrawing(false);
    setClearToken((t) => t + 1);
    setHighlight(null);
    setEditOid(null);
    setEditMode(true);
  }, [setHighlight]);

  const pickFlt = useCallback((next: GFlt) => {
    const cur = fltRef.current;
    const val = cur && cur.grp === next.grp && cur.key === next.key ? null : next;
    setFlt(val);
    // ⚠️ AOI идэвхтэй бол геометрийг ҮРГЭЛЖ хамт дамжуулна: сонгоход SQL +
    //    орон зайн шүүлт AND-ээр хослоно (MapCanvas-ийн featureEffect тэгж
    //    хослуулдаг), цуцлахад полигоны бүдгэрүүлэлт сэргэнэ.
    const geom = aoiGeomRef.current ?? undefined;
    setHighlight(
      val ? val.where : null,
      val ? val.only : (geom ? FILTER_IDS : undefined),
      geom,
    );
  }, [setHighlight]);

  /**
   * СОНГОСОН БҮСИЙН АНГИЛАЛ (2026-09-15, хэрэглэгчийн заавар: «давхарга
   * цэснээс бүсийг идэвхжүүлбэл мап дээр харагдана — ингэж чарттайгаа
   * холбомоор байна»).
   *
   * Чартын бар нь нэгж талбаруудыг тодруулаад зогсохгүй, БҮСИЙН давхаргыг
   * өөрийг нь зурагт асааж, тэр ангиллаараа нарийсгана — хэрэглэгч давхаргын
   * цэс рүү орж гараар асаах шаардлагагүй.
   */
  const zonePick = useMemo(
    () => (flt?.grp === 'zoneCat' && zoneQ.state === 'ready'
      ? zoneQ.data.find((z) => z.key === flt.key) ?? null
      : null),
    [flt, zoneQ],
  );

  /**
   * ЗУРГИЙН ЭЦСИЙН ДАВХАРГА / ШҮҮЛТ — багцын давхцал (`ovPick`) дээр бүсийн
   * сонголтыг давхарлана.
   *
   * ⚠️ `setVisible` рүү БИЧИХГҮЙ: тэр нь хэрэглэгчийн каталогийн сонголт.
   * Чарт цуцлахад бүсийн давхарга өөрөө унтарна, гараар асаасан давхарга
   * хөндөгдөхгүй.
   */
  const mapLayers = useMemo(
    () => (zonePick ? [...new Set([...mapVisible, ZONE_LAYER.id])] : mapVisible),
    [mapVisible, zonePick],
  );
  const mapWhere = useMemo<Record<string, string | null> | undefined>(
    () => (zonePick ? { ...(ovWhere ?? {}), [ZONE_LAYER.id]: zonePick.where } : ovWhere),
    [ovWhere, zonePick],
  );

  const clear = useCallback(() => {
    keepAoiRef.current = false; // ⚠️ «Цэвэрлэх» нь AOI-г ЖИНХЭНЭ хаяна
    setClearToken((t) => t + 1);
    setDrawing(false);
    setAoi(null);
    aoiGeomRef.current = null; // ⚠️ хоцорсон геометр pickFlt-д дахин орох ёсгүй
    setFlt(null);
    setHighlight(null);
  }, [setHighlight]);

  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const L = PARCEL_LEFT;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    /* ⚠️ 2026-10-01: төлөв ба шалтгаан НЭГ талбар уу (`services.ts`-ийн 2026-09-06 шийдвэр) */
    const sameField = L.fields.status === L.fields.progress;
    const [lStat, lStatus, lReason, bStat, bType, bMat, pStat, pRight, pUse, lAlt, lAltReason] = await Promise.all([
      queryStats(L.url, [count(L.oid, 'n'), sum(L.fields.area, 'area')], '1=1', area),
      // ТӨЛӨВ (Tuluv) бүрд ТОО ба ТАЛБАЙ — нэгтгэсэн үйлчилгээний гол ангилал
      queryGroup(L.url, L.fields.status, [count(L.oid, 'n'), sum(L.fields.area, 'a')], '1=1', area),
      /* ҮЛДСЭН талбарын ШАЛТГААН.
         ⚠️ 2026-09-06: шинэ эхэд `status` ба `progress` нь НЭГ талбар тул энэ
         асуулга нь «Бүрэн чөлөөлсөн»-өөс бусад мөрүүдийг өөрсдийнх нь утгаар
         бүлэглэнэ — өөрөөр хэлбэл шалтгаан нь төлөв нь өөрөө. */
      queryGroup(
        L.url, L.fields.progress, [count(L.oid, 'n'), sum(L.fields.area, 'a')],
        parcelLeftWhere(), area,
      ),
      // ⚠️ area_m2 талбар test_data [96]-д устсан тул талбайн нийлбэр асуухгүй
      queryStats(B.url, [
        count(B.oid, 'n'), sum(B.fields.value, 'val'),
        avg(B.fields.floors, 'fl'), avg(B.fields.unitPrice, 'up'),
      ], '1=1', area),
      queryGroup(B.url, B.fields.type, [count(B.oid, 'n')], '1=1', area),
      queryGroup(B.url, B.fields.material, [count(B.oid, 'n')], '1=1', area),
      queryStats(P.url, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.right, [count(P.oid, 'n')], '1=1', area),
      queryGroup(P.url, P.fields.landuse, [count(P.oid, 'n')], '1=1', area),
      /*
       * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ТАЛБАЙН НӨХӨЛТ — `area_m2 ?? Талб_1`.
       * Урьд нь энэ харагдац ЗӨВХӨН `SUM(area_m2)` авдаг байсан бол дашбоардын эх
       * (`land.ts`) гараар бичсэн `Талб_1`-ийг НӨХДӨГ тул «Нийт талбай» хоёр газар
       * ЗӨРӨХ замтай байв. Одоо ИЖИЛ нөхцөлөөр (`parcelAltAreaWhere`) нэмнэ —
       * нийт, төлөв бүр, шалтгаан бүрд. Полигон (AOI) ч мөн адил хэрэглэгдэнэ.
       */
      queryGroup(L.url, L.fields.status, [sum(L.fields.areaAlt, 'a')], parcelAltAreaWhere(), area),
      /* Шалтгаан нь ТУСДАА талбар бол л тусад нь асууна — нэг талбар бол дээрхээс */
      sameField
        ? Promise.resolve(null)
        : queryGroup(
          L.url, L.fields.progress, [sum(L.fields.areaAlt, 'a')],
          `${parcelLeftWhere()} AND ${parcelAltAreaWhere()}`, area,
        ),
    ]);
    /** Нөхөлтийн талбайг ТӨЛӨВӨӨР — `smap`-д нэмэхэд */
    const altArea = (r: Row) => Number(r.a ?? 0);
    // ТӨЛӨВ бүрийг ӨГӨГДЛӨӨС нэгтгэнэ (арын зай арилгаж, хоосон/null = «Тодорхойгүй»).
    // Хатуу 3 биш тул нэг ч талбар графикаас гээгдэхгүй — баганууд «Нийт»-тэй тэнцэнэ.
    /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): түлхүүрийг `land.statusKey`-ээр —
       «Бүрэн чөлөөлсөн»-ийн бүх бичиглэл («…лсөн.», давхар зай, жижиг үсэг) НЭГ
       бүлэгт нийлж, `cleared`-д ТООЛОГДОНО. Дашбоардын эх (`land.ts`) ЯГ ижил
       функцээр бүлэглэдэг тул хоёр газрын тоо зөрөхгүй. Түүхий утгууд `raws`-д
       ХЭВЭЭР — чарт дарж шүүхэд бүх бичиглэл WHERE-д орно. */
    const smap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    const addStatus = (r: Row, n: number, a: number) => {
      const raw = String(r[L.fields.status] ?? ''); // түүхий утга — WHERE-д яг таарна
      const k = statusKey(r[L.fields.status]) || 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = smap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += n;
      cur.a += a;
      if (raw.trim() !== '') cur.raws.add(raw);
      smap.set(k, cur);
    };
    for (const r of lStatus) addStatus(r, Number(r.n ?? 0), Number(r.a ?? 0));
    /* Нөхөлт: мөрийн тоо эхний асуулгаас (давхар тоолохгүй), зөвхөн талбай нэмэгдэнэ */
    for (const r of lAlt) if (altArea(r)) addStatus(r, 0, altArea(r));
    const altTotal = lAlt.reduce((s, r) => s + altArea(r), 0);
    const st = (value: string) => smap.get(value) ?? { n: 0, a: 0, raws: new Set<string>() };
    const cleared = st(PARCEL_CLEARED);
    /* ⚠️ «Цэвэрлэсэн нэгж талбар» ангилал шинэ эхэд БАЙХГҮЙ — 0 хэвээр
       (`land.ts`-тэй ижил шийдэл; талбарыг хасаагүй нь дуудагчийг эвдэхгүйн тулд). */
    const cleaned = { n: 0, a: 0, raws: new Set<string>() };
    /* ⚠️ ҮЛДСЭН нь НИЙТЭЭС ХАСАЖ гарна, нэрлэсэн төлөвөөр БИШ: шалтгаан бүр
       өөрөө нэг «төлөв» тул гараар жагсаавал шинэ шалтгаан нэмэгдэхэд
       чимээгүй тоологдохгүй үлдэнэ. */
    const remaining = [...smap.entries()].reduce(
      (acc, [k, v]) => (k === PARCEL_CLEARED ? acc : { n: acc.n + v.n, a: acc.a + v.a }),
      { n: 0, a: 0 },
    );
    // Мэдэгдэж буй 3 төлөв ЭХЭНД (тогтмол өнгө/дараалал), бусад нь тоогоор нь араас.
    const statusAreaBy: StatusBars = [...smap.entries()]
      .sort((x, y) => {
        const ox = STATUS_ORDER.indexOf(x[0]);
        const oy = STATUS_ORDER.indexOf(y[0]);
        if (ox !== -1 || oy !== -1) return (ox === -1 ? 99 : ox) - (oy === -1 ? 99 : oy);
        return y[1].n - x[1].n;
      })
      .map(([value, s]) => {
        const ha2 = Math.round(s.a / 100) / 100;
        // ⚠️ Дарж шүүхэд WHERE-ийг ТҮҮХИЙ утгуудаас (шалтгааны шүүлттэй ижил) угсарна:
        //    түлхүүр нь арын зай арилгасан хувилбар тул `Tuluv = '<trim>'` нь зай-мэдрэг
        //    сан дээр таарахгүй байж болзошгүй. Тодорхойгүй = NULL/хоосон.
        const eq = [...s.raws].filter((x) => x.trim() !== '')
          /* ⚠️ 2026-09-21: `sqlStr` (`N'…'` угтвар) — угтваргүй кирилл харьцуулалт
             зарим үйлчилгээнд 0 мөр буцаадаг (дээрх :404 ба `query.ts` `sqlStr`). */
          .map((x) => `${L.fields.status} = ${sqlStr(x)}`);
        const where = value === 'Тодорхойгүй'
          ? `(${L.fields.status} IS NULL OR ${L.fields.status} = '')`
          : eq.length ? `(${eq.join(' OR ')})` : `${L.fields.status} = ${sqlStr(value)}`;
        // Тоо ба нэгж (га) ХАМТ — «1,703 талбар · 78.08 га»
        return {
          key: value,
          label: STATUS_LABEL()[value] ?? tr(value),
          value: ha2,
          display: tr('{0} талбар · {1} га', num(s.n), num(ha2, 2)),
          /* ⚠️ Нэрлэгдээгүй БҮХ төлөв = ЧӨЛӨӨЛӨГДӨӨГҮЙ (зөвшилцөх · татгалзсан ·
             маргаантай …) тул var(--bad). Урьд нь var(--data) байсан нь гурван
             төлөвт схемийн үлдэгдэл — одоо тэдгээр нь «саад» гэсэн утгатай. */
          color: STATUS_COLOR[value] ?? (value === 'Тодорхойгүй' ? NO_DATA : 'var(--bad)'),
          where,
        };
      });
    // Шалтгааны нэрийг цэвэрлэж (арын зай, төгсгөлийн «.») нэгтгэнэ.
    // ⚠️ Түүхий утгуудыг мөн хадгална — дарж шүүхэд WHERE яг таарах ёстой.
    const rmap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    const addReason = (r: Row, n: number, a: number) => {
      /* ⚠️ 2026-10-01: SQL-ийн `parcelLeftWhere` нь ЗӨВХӨН яг «Бүрэн чөлөөлсөн»-ийг
         хасдаг — «…лсөн.» мэт бичиглэл энд «шалтгаан» болж орж ирэх тул НЭГ талбар
         үед клиент талд хасна (`smap`-ийн `statusKey`-тэй нийцүүлэв). */
      if (sameField && isClearedStatus(r[L.fields.progress])) return;
      const raw = String(r[L.fields.progress] ?? '');
      let k = text(r[L.fields.progress]).trim().replace(/\.$/, '').trim();
      if (!k || k === '—') k = 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = rmap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += n;
      cur.a += a;
      cur.raws.add(raw);
      rmap.set(k, cur);
    };
    for (const r of lReason) addReason(r, Number(r.n ?? 0), Number(r.a ?? 0));
    /* Нөхөлтийн талбай — шалтгаан нь төлөвтэй НЭГ талбар бол `lAlt`-аас (чөлөөлсөнийг
       `addReason` хасна), эс бөгөөс тусдаа асуулгаас. */
    for (const r of lAltReason ?? lAlt) if (altArea(r)) addReason(r, 0, altArea(r));
    const remN = remaining.n || 1;
    const reasons: ReasonItems = [...rmap.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .map(([label, v]) => {
        const eq = [...v.raws].filter((x) => x.trim() !== '')
          /* ⚠️ 2026-09-21: `N'…'` угтвар — төлөвийн шүүлттэй ижил шалтгаан. */
          .map((x) => `${L.fields.progress} = ${sqlStr(x)}`);
        if (label === 'Тодорхойгүй') eq.push(`${L.fields.progress} IS NULL`, `${L.fields.progress} = ''`);
        return {
          key: label,
          label,
          n: v.n,
          pct: Math.round((v.n / remN) * 100),
          area: Math.round(v.a / 100) / 100,
          // ⚠️ envhub: шалтгаанууд бүгд «үлдсэн» бүлгийн ДОТООД ангилал — сайн/муу
          //    утга заахгүй тул ганц өгөгдлийн өнгө; «Тодорхойгүй» нь саарал бэх.
          //    (Урьдын PARCEL_PROGRESS_HUES солонго нь чимэглэл болж байсан.)
          color: label === 'Тодорхойгүй' ? NO_DATA : 'var(--data)',
          /* ⚠️ Төлөвийн нэмэлт нөхцөл ХЭРЭГГҮЙ: `status` ба `progress` нэг
             талбар тул шалтгааны утга нь өөрөө «чөлөөлөгдөөгүй»-г заана.
             ⚠️ `eq` ХООСОН бол `()` гэсэн ХҮЧИНГҮЙ SQL үүсэхээс сэргийлж
             `1=0` (2026-09-15-ны аудит): ArcGIS түүнд HTTP 200 + «'where'
             parameter is invalid» буцаадаг тул `definitionExpression`
             эвдэрч, `land:left` давхарга бүрмөсөн зурагдахаа болино. */
          where: eq.length ? `(${eq.join(' OR ')})` : '1=0',
        };
      });
    return {
      left: {
        n: Number(lStat.n ?? 0),
        /* ⚠️ 2026-10-01: `area_m2` + нөхөлт (`altTotal`) — `land.ts`-ийн `areaM2`-тэй ИЖИЛ */
        area: Number(lStat.area ?? 0) + altTotal,
        cleared: cleared.n,
        cleaned: cleaned.n,
        remaining: remaining.n,
        resolved: cleared.n + cleaned.n,
      },
      statusAreaBy,
      reasons,
      b: {
        n: Number(bStat.n ?? 0),
        /* ⚠️ 2026-09-29 (аудит 10): null ≠ 0 — үнэлгээгүй барилгуудын SUM нь
           `null` ирдэг бөгөөд урьд нь «Нийт үнэлгээ 0 ₮» гэж ХУДАЛ харуулдаг байв. */
        value: bStat.val == null ? null : Number(bStat.val), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n', tr('барилга')),
      bMat: toItems(bMat, B.fields.material, 'n', tr('барилга')),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n', tr('нэгж')),
      pUse: toItems(pUse, P.fields.landuse, 'n', tr('нэгж')),
    };
  }, [aoiKey]);

  const d = q.state === 'ready' ? q.data : null;
  const err = q.state === 'error';
  const pct = d && d.left.n ? (d.left.resolved / d.left.n) * 100 : null;

  /* ⚠️ 2026-09-30: IIFE-ийн ГАДНА зарлана — IIFE дотор үүссэн closure-ын `pickFlt`
     (ref уншдаг) дуудлагыг React Compiler render үеийн ref хандалт гэж үздэг байв. */
  const pickReason = (k: string) => {
    const r = d?.reasons.find((x) => x.key === k);
    if (r) pickFlt({ grp: 'reason', key: k, label: tr('Шалтгаан: {0}', k), where: r.where, only: ['land:left'] });
  };

  /** Панелийн агуулгыг ачаалал/алдаа/хоосонтой хамт зурна */
  /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): алдааны үед урьд нь шалтгаангүй «Алдаа
     гарлаа» л гардаг байв — одоо `Data`-гийн алдааны блок (ойлгомжтой тайлбар · эвхмэл
     техникийн мөр · «Дахин оролдох» = `useAsync`-ийн retry). */
  const guard = (ready: boolean, body: React.ReactNode) =>
    d ? (ready ? body : <Empty label={tr('Мэдээлэл алга')} />)
      : err ? <Data q={q}>{() => null}</Data> : <Loading label={tr('Татаж байна…')} />;

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={sideHostRef}
      className={`${g.frame} ${editMode ? g.frameEdit : ''} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ── ЗҮҮН: Чөлөөлөлт (үлдсэн нэгж талбар) — үзүүлэлт + явц бүгд энд ── */}
      {!editMode && (
      <div className={g.left}>
        {/* Баганын толгой — envhub eyebrow: өнгөгүй; багана нь БАЙРЛАЛААРАА ялгарна */}
        <h3 className={g.colHd}>
          {tr('Төслийн талбайн чөлөөлөх нэгж талбар')}
        </h3>
        <section className={`${g.panel} ${g.panelPrimary}`} aria-label={tr('Төслийн талбайн чөлөөлөх нэгж талбар')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Газар чөлөөлөлт')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} үлдсэн', num(d.left.remaining)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.left.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.left.n)} unit={tr('талбар')} label={tr('Нийт нэгж талбар')} />
                  <Stat value={ha(d.left.area)} unit={tr('га')} label={tr('Нийт талбай')} />
                  <Stat value={num(d.left.cleared)} unit={tr('талбар')} label={tr('Бүрэн чөлөөлсөн')} />
                  <Stat value={num(d.left.remaining)} unit={tr('талбар')} label={tr('Үлдсэн')} />
                </Stats>
                <div className={g.ringBox}>
                  {/* «Чөлөөлсөн» — жинхэнэ САЙН төлөв тул var(--good) (нүүрний ижил цагирагтай нэг өнгө) */}
                  <Ring value={pct} size={148} width={14} color="var(--good)" label={tr('чөлөөлсөн')} />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> {tr('талбар')}
                    <span className={g.ringSub}>{tr('бүрэн чөлөөлсөн')}</span>
                  </p>
                </div>
                {/*
                  * ХОТ ТӨЛӨВЛӨЛТИЙН БҮСИЙН АНГИЛЛААР — `useZoneLeft`-ийн
                  * тайлбарыг үз (2026-09-15, хэрэглэгчийн заавар).
                  */}
                {/* ⚠️ 2026-09-29 (аудит 10): унасан үед блок ЧИМЭЭГҮЙ алга болдог байв —
                    «бүсийн давхцал алга» гэж уншигдана. Алдааг ил гаргаж, дахин оролдуулна
                    (`OverlapBars`-ийн ижил дүрэм). */}
                {zoneQ.state === 'error' && (
                  <>
                    <p className={g.subHead}>
                      {tr('Үлдсэн талбар бүсийн ангиллаар')}
                    </p>
                    <Empty label={tr('Бүсийн давхцлыг тоолж чадсангүй.')} onRetry={zoneQ.retry} />
                  </>
                )}
                {zoneQ.state === 'ready' && zoneQ.data.length > 0 && (
                  <>
                    <p className={g.subHead}>
                      {tr('Үлдсэн талбар бүсийн ангиллаар')}
                    </p>
                    <Bars
                      items={zoneQ.data.map((z) => ({
                        key: z.key,
                        label: tr(z.label),
                        value: z.oids.length,
                        /* ⚠️ Татагдаагүй бүс «0 талбар» гэж БИЧИГДЭХГҮЙ — `OverlapBars`-ийн ижил дүрэм */
                        display: z.failed ? tr('татагдсангүй') : tr('{0} талбар', num(z.oids.length)),
                        /* ⚠️ Бүх багана НЭГ өнгө (cyan, 2026-09-15 хэрэглэгчийн
                           заавар): ангиллын өнгө нь бүсийн ДАВХАРГЫН палитр
                           бөгөөд энэ чарт нь тэр биш, ҮЛДСЭН ТАЛБАРЫН тоог
                           хэмждэг. Татагдаагүй нь л шар. */
                        color: z.failed ? 'var(--warn)' : 'var(--data)',
                      }))}
                      selected={flt?.grp === 'zoneCat' ? flt.key : null}
                      onSelect={(k) => {
                        const z = zoneQ.data.find((x) => x.key === k);
                        /* ⚠️ Татагдаагүй бүсээр шүүхгүй — дутуу/хоосон OID-оор (`FID IN ()`
                           буруу SQL) давхарга эвдэрнэ эсвэл хагас дүр зураг өгнө. */
                        if (!z || z.failed) return;
                        pickFlt({
                          grp: 'zoneCat', key: k, label: tr('Бүс: {0}', tr(z.label)),
                          where: parcelOidsWhere(z.oids),
                          only: ['land:left'],
                        });
                      }}
                    />
                  </>
                )}
                <p className={g.subHead}>{tr('Талбай (га) төлөвөөр')}</p>
                {/* limit БАЙХГҮЙ — бүх төлөв харагдаж, баганы нийлбэр «Нийт»-тэй тэнцэнэ */}
                <Bars
                  items={d.statusAreaBy}
                  selected={flt?.grp === 'status' ? flt.key : null}
                  onSelect={(k) => {
                    // Шалтгааны шүүлттэй ижил — item-ийн урьдчилан угсарсан (түүхий утгат) WHERE-ийг авна
                    const it = d.statusAreaBy.find((x) => x.key === k);
                    if (it) pickFlt({ grp: 'status', key: k, label: tr('Төлөв: {0}', k), where: it.where, only: ['land:left'] });
                  }}
                />
                {d.reasons.length > 0 && (() => {
                  const selReason = flt?.grp === 'reason' ? flt.key : null;
                  return (
                  <>
                    {/* ГУРВАН график ХЭВЭЭР (тоо / хувь / талбай) — мөр бүрийн
                        тэмдэглэгээнд нэгж ба тоо ХАМТ (хэрэглэгчийн хүсэлт). */}
                    <p className={g.subHead}>
                      {tr('Үлдсэн')} {num(d.left.remaining)} {tr('талбарын шалтгаан')}
                      <span className={g.subNote}> {tr('· тоогоор')}</span>
                    </p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: tr(r.label), value: r.n,
                        display: tr('{0} талбар · {1}%', num(r.n), r.pct), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· хувиар')}</span></p>
                    <Bars
                      limit={8}
                      max={100}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: tr(r.label), value: r.pct,
                        display: tr('{0}% · {1} талбар', r.pct, num(r.n)), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· талбайгаар (га)')}</span></p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={[...d.reasons]
                        .sort((a, b) => b.area - a.area)
                        .map((r) => ({
                          key: r.key, label: tr(r.label), value: r.area,
                          display: tr('{0} га · {1} талбар', num(r.area, 2), num(r.n)), color: r.color,
                        }))}
                    />
                  </>
                  );
                })()}
              </>
            ))}
          </div>
        </section>
      </div>
      )}

      {/* ── ТӨВ: Газрын зураг + Полигон ── */}
      <main className={g.map}>
        <MapCanvas
          dim={dim}
          visible={mapLayers}
          opacity={opacity}
          zone={zone}
          layerWhere={mapWhere}
          layerStyle={parcelStyle}
          uniform
          sketch
          onSketch={onSketch}
          onSketchCancel={onSketchCancel}
          drawToken={drawToken}
          clearToken={clearToken}
          onPick={onMapPick}
        />

        {/* ⚠️ ТАЛБАР ЗАСАХ ОРОХ ЦЭГ — 2026-09-15-нд хасагдаж, 2026-09-30-нд
            сэргээгдсэн (дээрх `editMode`-ийн тайлбарыг үз). */}
        {editOid != null && (
          <GazarEdit
            /* ⚠️ 2026-10-06 (аудит): парсел солигдоход маягтыг ШИНЭЭР mount
               хийнэ — өмнөх парселийн ноорог/`dirty` үлдэхгүй (`GazarEdit`-ийн ⚠️) */
            key={editOid}
            oid={editOid}
            canEdit={canEdit}
            /* ⚠️ Маягтын «хадгалаагүй» төлөвийг энд барина — `exitEdit` ба
               `onMapPick` хоёул түүнийг шалгаж баталгаа асууна (дээрх ⚠️) */
            onDirty={markDirty}
            onCancel={closeEdit}
            onDone={(n) => {
              closeEdit();
              /**
               * ⚠️ ДАВХАРГЫГ ДАХИН УНШУУЛНА. FeatureLayer нь татсан объектоо
               * клиент дээрээ кэшлэдэг бөгөөд бичилт нь SDK-аар биш ШУУД
               * REST-ээр явсан тул зассан талбар ХУУЧИН ӨНГӨӨРӨӨ үлдэнэ.
               */
              if (n > 0) refreshLayer(PARCEL_LAYER_ID);
              /* ⚠️ 0 нь АМЖИЛТГҮЙ биш — юу ч өөрчлөөгүй гэсэн үг.
                 ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): `n` нь НЭГЖ ТАЛБАРЫН тоо
                 (`saveParcel`-ийн буцаалт). Урьд нь баганын тоо байсан тул нэг
                 талбарын 3 багана засахад «3 талбар хадгалагдлаа» гэж бичиж, 3
                 нэгж талбар засагдсан мэт уншигддаг байв. */
              setSaved(n > 0
                ? tr('{0} нэгж талбар хадгалагдлаа', num(n))
                : tr('Өөрчлөлт байсангүй'));
              window.setTimeout(() => setSaved(''), 4000);
            }}
          />
        )}

        {/* ⚠️ 2026-08-20: Урьд нь ЭНД зөвхөн 2D/3D/BIM + «Полигон зурах» байв —
            Давхарга ч, Тунгалаг ч, Бүс ч байхгүй тул кадастрын гурван давхаргаас
            цааш юу ч нэмж харах боломжгүй байлаа. Одоо нэгдсэн зурвас, зурах
            товчнууд нь түүний ДОТОР (`children`) ижил загвараар. */}
        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        >
          <MapToolBtn
            icon="polygon"
            onClick={startDraw}
            /* ⚠️ 2026-09-30: засварын горимд ИДЭВХГҮЙ — тэнд товшилт бүр маягт
               нээдэг тул зурах цэг бүр нэгж талбарын цонх нээж, дуусмагц
               AOI-ийн бүдгэрүүлэлт маягтын тодруулгаар дарагдаж зөрдөг байв
               (`enterEdit`-ийн ⚠️). */
            disabled={dim !== '2d' || editMode}
            title={dim !== '2d'
              ? tr('Полигоныг зөвхөн 2D дээр зурна')
              : editMode
                ? tr('Засварын горимоос гарсны дараа полигон зурна')
                : tr('Газар дээр полигон зурах')}
          >
            {/* ⚠️ Зурж байх үед ЦУЦЛАХ гэж хэлнэ — тэр товшилт нь зурахыг
                эхлүүлэхгүй, буцаана (`startDraw`-ийн тайлбарыг үз). */}
            {drawing ? tr('Цуцлах') : aoi ? tr('Дахин тооцоолох') : tr('Чөлөөлөлт тооцоолох')}
          </MapToolBtn>
          {aoi && <MapToolBtn onClick={clear}>{tr('Цэвэрлэх')}</MapToolBtn>}
          {/* ⚠️ Эрхгүй хүнд ОГТ харагдахгүй — идэвхгүй товч нь «яагаад
              болохгүй байна» гэсэн асуулт төрүүлээд хариулахгүй. */}
          {canEdit && (
            <MapToolBtn
              icon="pen"
              on={editMode}
              disabled={dim !== '2d' || drawing}
              onClick={() => (editMode ? exitEdit() : enterEdit())}
              title={dim !== '2d'
                ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                : tr('Зөвхөн газрын зураг үлдэж, талбар дарахад төлөв солих цонх нээгдэнэ')}
            >
              {tr('Талбар засах')}
            </MapToolBtn>
          )}
        </MapTools>

        {/* ЗАСВАРЫН АЖЛЫН ЗУРВАС — «энэ бол тусдаа цонх» гэдгийг хэлнэ.
            Хажуугийн баганууд unmount болсон тул зөвхөн зураг үлдэж,
            энэ зурвас нь гарчиг ба гарах замыг өгнө. */}
        {editMode && (
          <div className={g.editBar}>
            <span className={g.editTitle}>{tr('Нэгж талбар засах')}</span>
            <span className={g.editHint}>
              {tr('Газрын зураг дээр нэгж талбар дарна уу')}
            </span>
            {/* ⚠️ 2026-10-01: кадастрын дугаараар хайх (`findNo`-ийн тайлбарыг үз) */}
            <form
              className={g.editFind}
              role="search"
              onSubmit={(e) => { e.preventDefault(); void findParcel(); }}
            >
              <input
                className={g.editFindInput}
                value={findNo}
                onChange={(e) => { setFindNo(e.target.value); setFindMsg(''); }}
                placeholder={tr('Кадастрын дугаар')}
                aria-label={tr('Кадастрын дугаараар хайх')}
                maxLength={40}
                disabled={finding}
              />
              <button type="submit" className={g.editClose} disabled={finding || !findNo.trim()}>
                {finding ? tr('Хайж байна…') : tr('Хайх')}
              </button>
            </form>
            <button type="button" className={g.editClose} onClick={exitEdit}>
              {tr('Хаах')}
            </button>
          </div>
        )}
        {editMode && (findMsg || hits.length > 0) && (
          <div className={g.findPop} role="status">
            {findMsg && <span className={g.findMsg}>{findMsg}</span>}
            {hits.map((h) => (
              <button key={h.oid} type="button" className={g.findHit} onClick={() => openParcel(h.oid)}>
                <b>{h.parcelNo.trim() || `#${h.oid}`}</b>
                <span>{[h.owner, h.status].filter((x) => x.trim()).join(' · ') || '—'}</span>
              </button>
            ))}
          </div>
        )}
        {saved && <p className={g.saved} role="status">{saved}</p>}


        {catOpen && (
          /* ⚠️ Баруун талд — `gazar.module.css` §catPanelRight-ийн тайлбарыг үз */
          <div className={g.catPanelRight}>
            <LayerCatalog
              view="gazar"
              totals={catTotals}
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={zone}
              embedded
            />
          </div>
        )}

        {opOpen && (
          <OpacityPanel
            visible={visible}
            opacity={opacity}
            setOpacity={setOpacity}
            onClose={() => setOpOpen(false)}
          />
        )}

        {/* ⚠️ 2026-09-30: засварын горимд НУУНА — полигон тэнд зурагдахгүй (товч
            идэвхгүй) тул «полигон зурж шүүнэ» зөвлөгөө худал болно; мөн ижил
            байрлалтай «хадгалагдлаа» мэдэгдлийг (`.saved`) халхалж байв. */}
        {!editMode && (
        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>{aoi ? tr('Сонгосон талбай') : tr('Бүх талбай')}</span>
          <span className={g.scopeHint}>{aoi ? tr('полигоноор шүүсэн') : tr('полигон зурж шүүнэ')}</span>
        </div>
        )}

        {/* Чарт-шүүлтийн чип — дашбоардтай ижил, ×-ээр цуцлана */}
        {flt && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>{flt.label}</span>
              <button type="button" className={o.filterClear} onClick={() => pickFlt(flt)} aria-label={tr('Цуцлах')}>×</button>
            </div>
          </div>
        )}
      </main>

      {/* ⚠️ ЗУРГИЙН ДООД ЗУРВАС ХАСАГДСАН (2026-09-15) — «Саад — багцаар»
          чарт нь БАРУУН панел руу шилжсэн (доорх тайлбарыг үз). */}

      {/*
        * ── БАРУУН БАГАНА — ДИНАМИК (2026-09-15, хэрэглэгчийн заавар) ──
        *
        * «Газар чөлөөлөлт тооцоолох» дараагүй үед энэ багана нь
        * «Саад — багцаар» чартыг харуулна; полигон зурмагц тооцооллын
        * үр дүн (Барилга · Кадастр) руу СОЛИГДОНО.
        *
        * ⚠️ Урьд нь Барилга/Кадастр нь полигон зураагүй үед ч зогсож,
        * «төслийн талбайгаас гаднах БҮХ» гэсэн утгагүй тоо харуулдаг байв
        * (5-р заавар ч үүнтэй холбоотой). Одоо тэдгээр нь ЗӨВХӨН
        * тооцооллын үр дүн.
        */}
      {!editMode && (
      <div className={g.right}>
        <h3 className={g.colHd}>
          {/* ⚠️ Товч ДАРМАГЦ солигдоно (`aoi || drawing`) — полигон дуустал
              хүлээвэл «товч ажиллаагүй» гэж уншигдана (хэрэглэгчийн заавар). */}
          {aoi || drawing
            ? tr('Тооцоолсон талбай — нэгж талбар, барилга')
            : tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}
        </h3>
        {!aoi && !drawing && (
          <OverlapBars q={ovQ} selected={ovPick?.key ?? null} onPick={pickOverlap} />
        )}
        {/* ⚠️ Товч ДАРМАГЦ (`aoi || drawing`) Барилга/Кадастр ил гарна —
            эхлээд БҮХ талбайн тоогоор, полигон зурмагц зөвхөн тэр талбайнхаар
            ШИНЭЧЛЭГДЭНЭ (2026-09-15, хэрэглэгчийн заавар). Полигон дуустал
            хоосон байлгавал «товч ажиллаагүй» гэж уншигдана. */}
        {(aoi || drawing) && (<>
        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Барилга')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Барилга')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} барилга', num(d.b.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.b.n > 0, d && (
              <>
                {/* «Талбай» stat 2026-08-13-нд хасагдав — area_m2 талбар test_data-д алга */}
                <Stats cols={2}>
                  <Stat value={num(d.b.n)} unit={tr('барилга')} label={tr('Тоо')} />
                  {/* ⚠️ 2026-09-29 (аудит 10): үнэлгээгүй (`null`) бол «—», 0 ₮ биш */}
                  <Stat value={d.b.value == null ? '—' : money(d.b.value).v}
                    unit={d.b.value == null ? undefined : money(d.b.value).unit} label={tr('Нийт үнэлгээ')} />
                  <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit={tr('давхар')} label={tr('Дундаж өндөр')} />
                  <Stat value={d.b.unitPrice ? money(d.b.unitPrice).v : '—'} unit={d.b.unitPrice ? tr('{0}/м²', money(d.b.unitPrice).unit) : ''} label={tr('Дундаж м² үнэ')} />
                </Stats>
                {d.bType.length > 0 && (
                  <Donut
                    items={d.bType} size={112} width={17} center={num(d.b.n)} centerLabel={tr('барилга')} stack
                    selected={flt?.grp === 'bType' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'bType', key: k, label: tr('Барилга: {0}', k),
                      where: whereOf(d.bType, k), only: ['gazar:building'],
                    })}
                  />
                )}
                {d.bMat.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Материалаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.bMat.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'bMat' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'bMat', key: k, label: tr('Материал: {0}', k),
                        where: whereOf(d.bMat, k), only: ['gazar:building'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>

        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Кадастрын нэгж')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Кадастрын нэгж')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} нэгж', num(d.p.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.p.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.p.n)} unit={tr('нэгж')} label={tr('Нэгжийн тоо')} />
                  <Stat value={ha(d.p.area)} unit={tr('га')} label={tr('Талбай')} />
                </Stats>
                {d.pRight.length > 0 && (
                  <Donut
                    items={d.pRight} size={112} width={17} center={num(d.p.n)} centerLabel={tr('нэгж')} stack
                    selected={flt?.grp === 'pRight' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'pRight', key: k, label: tr('Эрх: {0}', k),
                      where: whereOf(d.pRight, k), only: ['gazar:parcel'],
                    })}
                  />
                )}
                {d.pUse.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Зориулалтаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.pUse.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'pUse' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'pUse', key: k, label: tr('Зориулалт: {0}', k),
                        where: whereOf(d.pUse, k), only: ['gazar:parcel'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>
        </>)}
      </div>
      )}
    </div>
  );
}
