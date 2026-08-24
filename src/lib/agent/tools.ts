'use client';

/**
 * АГЕНТЫН ХЭРЭГСЛҮҮД — зөвхөн ДӨРӨВ.
 *
 * ⚠️ ЯАГААД ЦӨӨН ВЭ: фичер бүрт нэг tool бичвэл 131 эх сурвалжид 131 tool болно —
 * загвар удаан бөгөөд эргэлзээтэй болж, давхарга нэмэх бүрт агентын код засагдана.
 * Эдгээр ерөнхий хэрэгслүүд эх сурвалжийн тоо хэдээр ч өсөхөд ХЭВЭЭР үлдэнэ:
 *   · `describe_feature` — талбаруудыг мэдэх
 *   · `query_feature`    — НЭГ эх сурвалжаас асуух
 *   · `zone_overview`    — НЭГ бүсээр БҮХ эх сурвалжийг нэг дор шүүх
 *   · `compute`          — ArcGIS дээр БАЙХГҮЙ, кодод бодогддог үзүүлэлт
 *
 * ⚠️ Гүйцэтгэл нь порталтай ИЖИЛ `query.ts`-ээр явна: хурдны хязгаарлалт,
 * дахин оролдлого, зэрэг хүсэлтийн тоо (6) бүгд дундаа. Тусдаа асуулгын
 * логик бичвэл агентын тоо дэлгэц дээрх тооноос зөрж, итгэл алдагдана.
 */

import {
  ArcGISError,
  avg,
  count,
  queryFeatures,
  queryGroup,
  queryStats,
  sum,
  type Row,
  type Stat,
} from '@/lib/query';
import { agsToken } from '@/lib/agsToken';
import { resolveSource, type AgentScope, type AgentSource } from './registry';
import { t as tr } from '@/lib/i18nCore';
import { zoneOverview } from './overview';
import { buildingProgress } from './compute';

/** Anthropic-ийн tool тодорхойлолт (реле руу энэ хэлбэрээр явна) */
export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * ⚠️ Мөрийн ДЭЭД тоо. Агент «бүх барилгыг жагсаа» гэж дуудвал 5000 мөр
 * контекстэд цутгаж, хариулт удаан ба үнэтэй болно. Жагсаалт нь зөвхөн
 * жишээ харах зориулалттай — нийлбэр/тоолол нь `stats`-аар явна.
 */
const MAX_ROWS = 40;

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'describe_feature',
    description:
      tr('Давхаргын БОДИТ талбаруудыг ArcGIS үйлчилгээнээс шууд татна (нэр, төрөл, алиас). ') +
      tr('Каталогт заагаагүй талбар хэрэгтэй үед, эсвэл талбарын нэрэнд эргэлзэж байвал ЭНЭ ХЭРЭГСЛИЙГ ЭХЛЭЭД дууд. ') +
      tr('Талбарын нэрийг таамаглаж `query_feature` дуудвал хүсэлт бүхэлдээ унана.'),
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: tr('Давхаргын id — каталогийн жагсаалтаас (жиш. "et:24")') },
      },
      required: ['id'],
    },
  },
  {
    name: 'query_feature',
    description:
      tr('Давхаргаас өгөгдөл асууна. Хоёр горим: ') +
      tr('(1) НЭГТГЭЛ — `stats` өгвөл ArcGIS дээр тоолол/нийлбэр/дундаж бодогдоно (`groupBy` өгвөл ангиллаар задарна). ') +
      tr('(2) ЖАГСААЛТ — `stats` өгөхгүй бол бодит мөрүүд буцна (дээд тал нь ') + MAX_ROWS + '). ' +
      tr('Тоон хариулт шаардвал ҮРГЭЛЖ нэгтгэл горимыг ашигла — мөрүүдийг татаад өөрөө нэмэх нь удаан ба алдаатай.'),
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: tr('Давхаргын id (жиш. "et:24")') },
        where: {
          type: 'string',
          description:
            'SQL шүүлт (ArcGIS). Анхдагч "1=1". Текст утгыг нэг хашилтад бич. Жиш: ZONE_ID = \'Багц-1\'',
        },
        stats: {
          type: 'array',
          description: tr('Нэгтгэлүүд. Байвал НЭГТГЭЛ горим ажиллана.'),
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['count', 'sum', 'avg'], description: tr('Үйлдэл') },
              field: { type: 'string', description: tr('Талбарын нэр (count-д OID-г ашиглаж болно)') },
              as: { type: 'string', description: tr('Үр дүнгийн баганын нэр (заавал биш)') },
            },
            required: ['op', 'field'],
          },
        },
        groupBy: { type: 'string', description: tr('Ангиллаар задлах талбар (зөвхөн нэгтгэл горимд)') },
        outFields: {
          type: 'array',
          items: { type: 'string' },
          description: tr('Жагсаалт горимд буцаах талбарууд. Заавал зааж өг — бүгдийг татах нь үрэлгэн.'),
        },
        orderBy: { type: 'string', description: tr('Эрэмбэ, жиш. "Population DESC" (жагсаалт горимд)') },
        limit: { type: 'number', description: tr('Мөрийн тоо (дээд тал нь {0})', MAX_ROWS) },
      },
      required: ['id'],
    },
  },
  {
    name: 'zone_overview',
    description:
      tr('НЭГ БҮС/БАГЦЫН нэгдсэн тойм — БҮХ эх сурвалжийг нэг дор шүүж, тус бүрийн тоо, хэмжээ, ӨРТГИЙГ буцаана. ') +
      tr('Хэрэглэгч «Багц 1-ийн мэдээллийг дэлгэрэнгүй», «Багц-3.2-т юу байна вэ», «энэ бүсийн бүх мэдээлэл» гэх мэтээр ') +
      tr('НЭГ бүсийн ЕРӨНХИЙ дүр зургийг асуувал ЭНЭ ХЭРЭГСЛИЙГ дууд — `query_feature`-ээр давхарга бүрийг тусад нь ') +
      tr('асуувал эргэлт хүрэлцэхгүй, хариулт хагас дутуу гарна. ') +
      tr('Өртөг нь порталын каталогтой ижил загвараар бодогдоно. Тодруулга хэрэгтэй бол дараа нь `query_feature` дууд.'),
    input_schema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: tr('Бүс/багцын нэр — «Багц-1», «Багц 1», «Багц-3.2». Бичиглэлийн зөрөөг систем өөрөө зохицуулна.'),
        },
      },
      required: ['zone'],
    },
  },
  {
    name: 'compute',
    description:
      tr('ArcGIS дээр БАЙХГҮЙ, кодод ТООЦООЛОГДДОГ үзүүлэлтүүд. ') +
      tr('`building_progress` — «Барилгын хяналт» дашбоардын БОДИТ гүйцэтгэл: нийт хувь, багц бүрийн ') +
      tr('задаргаа, хамгийн хоцорсон блокууд, гүйцэтгэгч компани. ') +
      tr('⚠️ Барилгын НИЙТ гүйцэтгэлийг асуувал ЭНЭ ХЭРЭГСЛИЙГ ашигла — `mon:building`-ийн `GUITS_HV`-ийн ') +
      tr('дундаж нь дашбоардын тоотой ТААРАХГҮЙ (өөр аргаар бодогддог).'),
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['building_progress'],
          description: tr('Тооцооллын төрөл'),
        },
      },
      required: ['kind'],
    },
  },
];

/* ── Талбарын мета — ArcGIS-ээс ── */

type FieldMeta = { name: string; alias?: string; type?: string };
type ServiceMeta = { fields?: FieldMeta[]; maxRecordCount?: number; error?: { message?: string } };

/**
 * ⚠️ Талбарын мета КЭШ — нэг ярианд дахин дахин татахгүйн тулд.
 *
 * ⚠️ ХУГАЦААТАЙ (5 мин): үйлчилгээ ажлын явцад шинэчлэгдэж талбар нэмэгдэх/өөрчлөгдөх
 * боломжтой. Хугацаагүй кэш нь агентыг ХУУЧИН схемд түгжиж, «бодит мөчийн мэдээлэл»
 * гэсэн зарчмыг зөрчинө.
 */
const META_TTL = 5 * 60 * 1000;
const metaCache = new Map<string, { at: number; fields: FieldMeta[] }>();

async function fieldsOf(url: string): Promise<FieldMeta[]> {
  const hit = metaCache.get(url);
  if (hit && Date.now() - hit.at < META_TTL) return hit.fields;
  // ⚠️ 2026-08-24 «Organization» хуваалцалт — token-гүй бол давхаргын мета 499 болж,
  //    агент талбарын нэрээ шалгаж чадахгүй болно.
  const t = await agsToken();
  const res = await fetch(`${url}?f=json${t ? `&token=${encodeURIComponent(t)}` : ''}`);
  if (!res.ok) throw new ArcGISError(`HTTP ${res.status}`, url);
  const body = (await res.json()) as ServiceMeta;
  if (body.error) throw new ArcGISError(body.error.message ?? tr('Мета уншигдсангүй'), url);
  const fields = body.fields ?? [];
  metaCache.set(url, { at: Date.now(), fields });
  return fields;
}

/* ── Гүйцэтгэл ── */

const STAT_FN = { count, sum, avg } as const;

type StatIn = { op: keyof typeof STAT_FN; field: string; as?: string };
type QueryIn = {
  id?: string;
  where?: string;
  stats?: StatIn[];
  groupBy?: string;
  outFields?: string[];
  orderBy?: string;
  limit?: number;
};

/** Агентын хэрэгслийн үр дүн — `is_error` нь загварт алдааг ойлгуулж, өөрөө засах боломж өгнө */
export type ToolOutcome = { text: string; isError: boolean };

const ok = (v: unknown): ToolOutcome => ({ text: JSON.stringify(v), isError: false });
const fail = (msg: string): ToolOutcome => ({ text: msg, isError: true });

const notFound = (id?: string) =>
  fail(tr('`{0}` гэсэн эх сурвалж байхгүй эсвэл танд үзэх эрх алга.', id));

async function runDescribe(input: { id?: string }, scope: AgentScope): Promise<ToolOutcome> {
  const src: AgentSource | null = input.id ? resolveSource(input.id, scope) : null;
  if (!src) return notFound(input.id);

  const fields = await fieldsOf(src.url);
  return ok({
    id: src.id,
    title: src.title,
    kind: src.kind,
    oidField: src.oidField,
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type?.replace('esriFieldType', ''),
      // Хүний ойлгох утга: манай тайлбар нь ArcGIS-ийн алиасаас ДЭЭГҮҮР
      meaning: src.fields?.[f.name] ?? f.alias,
    })),
    warn: src.warn,
    note: src.note,
  });
}

async function runQuery(input: QueryIn, scope: AgentScope): Promise<ToolOutcome> {
  const src = input.id ? resolveSource(input.id, scope) : null;
  if (!src) return notFound(input.id);

  const url = src.url;
  const where = input.where?.trim() || '1=1';

  // ⚠️ Талбарын нэрийг УРЬДЧИЛЖ шалгана. ArcGIS буруу нэр дээр «Unable to perform
  //    query» гэсэн ерөнхий алдаа буцаадаг тул агент юу буруу болсныг ойлгохгүй,
  //    ижил алдааг дахин дахин давтдаг. Энд яг аль нэр буруугий нь хэлж өгнө.
  const known = new Set((await fieldsOf(url)).map((f) => f.name));
  // orderBy бас шалгах талбар — «талбар [ASC|DESC], …» тул талбарын нэрсийг л салгана.
  // (Өмнө нь шалгагдахгүй тул хуурмаг нэр ArcGIS-ийн ерөнхий алдаа руу шууд оруулдаг байв.)
  const orderFields = (input.orderBy ?? '')
    .split(',')
    .map((t) => t.trim().split(/\s+/)[0])
    .filter(Boolean);
  const used = [
    ...(input.stats?.map((s) => s.field) ?? []),
    ...(input.groupBy ? [input.groupBy] : []),
    ...(input.outFields ?? []),
    ...orderFields,
  ];
  const bad = used.filter((f) => f && f !== '*' && !known.has(f));
  if (bad.length) {
    return fail(
      tr('Ийм талбар алга: {0}. ', bad.join(', ')) +
        tr('Байгаа талбарууд: {0}', [...known].slice(0, 60).join(', ')),
    );
  }

  try {
    if (input.stats?.length) {
      const stats: Stat[] = input.stats.map((s, i) => {
        const fn = STAT_FN[s.op];
        if (!fn) throw new Error(tr('Танихгүй үйлдэл: {0}', s.op));
        return fn(s.field, s.as || `${s.op}_${i}`);
      });
      const rows: Row[] = input.groupBy
        ? await queryGroup(url, input.groupBy, stats, where)
        : [await queryStats(url, stats, where)];
      return ok({ source: src.id, where, groupBy: input.groupBy, rows });
    }

    const limit = Math.min(Math.max(1, input.limit ?? 10), MAX_ROWS);
    const rows = await queryFeatures(url, {
      where,
      outFields: input.outFields?.length ? input.outFields : undefined,
      orderBy: input.orderBy,
      limit,
    });
    return ok({ source: src.id, where, count: rows.length, limit, rows });
  } catch (e) {
    if (e instanceof ArcGISError) return fail(tr('ArcGIS алдаа: {0} ({1})', e.message, e.url));
    return fail(tr('Асуулга амжилтгүй: {0}', e instanceof Error ? e.message : String(e)));
  }
}

/** Нэг tool дуудлагыг гүйцэтгэнэ — алдааг ХЭЗЭЭ Ч чимээгүй залгихгүй */
export async function runTool(
  name: string,
  input: unknown,
  scope: AgentScope,
): Promise<ToolOutcome> {
  try {
    if (name === 'describe_feature') return await runDescribe(input as { id?: string }, scope);
    if (name === 'query_feature') return await runQuery(input as QueryIn, scope);
    if (name === 'zone_overview') {
      const zone = (input as { zone?: string })?.zone?.trim();
      if (!zone) return fail(tr('`zone` заагаагүй байна.'));
      const ov = await zoneOverview(zone, scope);
      if (!ov.sources.length) {
        return fail(
          tr('«{0}» бүсээс өгөгдөл олдсонгүй. Бүсийн нэр зөв эсэхийг шалгана уу ', zone) +
            tr('(жиш. «Багц-1», «Багц-3.2»). Бүсийн жагсаалтыг `query_feature`-ээр ') +
            tr('`zone` дээрээс groupBy хийж авч болно.'),
        );
      }
      return ok(ov);
    }
    if (name === 'compute') {
      const kind = (input as { kind?: string })?.kind;
      if (kind === 'building_progress') return ok(await buildingProgress(scope));
      return fail(tr('Танихгүй тооцоолол: {0}', kind));
    }
    return fail(tr('Танихгүй хэрэгсэл: {0}', name));
  } catch (e) {
    if (e instanceof ArcGISError) return fail(tr('ArcGIS алдаа: {0} ({1})', e.message, e.url));
    return fail(tr('Хэрэгсэл унав: {0}', e instanceof Error ? e.message : String(e)));
  }
}

/** Явцын мөрд харуулах товч тайлбар — хэрэглэгч агент юу хийж байгааг хардаг */
export function describeCall(name: string, input: unknown): string {
  const i = (input ?? {}) as QueryIn & { zone?: string };
  if (name === 'zone_overview') return tr('{0} — бүх эх сурвалжийг шалгаж байна…', i.zone);
  if (name === 'compute') return tr('Гүйцэтгэлийг тооцоолж байна…');
  if (name === 'describe_feature') return tr('{0} давхаргын талбаруудыг шалгаж байна…', i.id);
  if (name === 'query_feature') {
    return i.stats?.length
      ? tr('{0} дээр тооцоо хийж байна…', i.id)
      : tr('{0}-аас мэдээлэл татаж байна…', i.id);
  }
  return tr('Ажиллаж байна…');
}
