'use client';

/**
 * ДЭД БҮТЭЦ — МЭДЭЭЛЛИЙН ТӨЛӨВИЙН ШҮҮЛТҮҮРҮҮД (2026-10-14, хэрэглэгчийн хүсэлт: «атрибутын
 * мэдээлэл бөглөөгүйг шүүж хардаг · өөрчлөлт орсон/ороогүйг шүүж хардаг, төлөвөөр өнгө нь
 * өөрчлөгддөг» · «дууссан, эхэлсэн гэх төлөвөөр шүүдэг»). ⚠️ Бөглөх/засах хэсэгт
 * (`DedButetsEdit`, `DedButetsBatch`) ХҮРЭХГҮЙ — зөвхөн харагдац.
 *
 *   · «Мэдээлэл бүрдүүлэлт» — засагдах талбар (`LayerMeta.fields`, системийн талбаргүй) АЛЬ НЭГ
 *     нь хоосон (null эсвэл '') бол «Дутуу», бүгд бөглөгдсөн бол «Бөглөсөн».
 *   · «Өөрчлөлт орсон эсэх» — ДАТАН ДАХЬ өөрчлөлтийн талбар (нэр/alias «өөрчлөлт»/«хувилбар»…;
 *     сонголт нь «Өөрчлөлт орсон» · «Өөрчлөлт ороогүй» · «Эцсийн хувилбар»).
 *     ⚠️ 2026-10-14 (хэрэглэгч: «датаны сонголтууд нь тийм байгаа»): урьд нь ArcGIS-ийн засварын
 *     тэмдэглэлээр (EditDate > CreationDate) бодож байсныг ХАСАВ — хэрэглэгчийн бөглөдөг утга эх.
 *   · «Гүйцэтгэлийн төлөв» — ТӨЛӨВИЙН талбар (нэр/alias «төлөв»/«tuluv»/«status»).
 *
 *   Хоёр «утгын» шүүлтүүрийн сонголт нь кодлогдсон домэйноос (ДАРААЛЛААР нь), домэйнгүй бол
 *   үйлчилгээний ялгаатай утгаас (`returnDistinctValues`). ⚠️ Талбарын нэрийг ГАРААР бичээгүй —
 *   74 давхарга өөр өөр схемтэй байж болно. Талбаргүй давхарга тодорхой утга сонгоход зурагдахгүй.
 *
 * ⚠️ ЯАГААД renderer (Arcade), SQL шүүлт БИШ: давхарга бүр өөр (кирилл) талбартай, 2D-ийн
 *    `FeatureLayerView.filter` нь клиент талын SQL-ээр кирилл нэрийг найдвартай задлахгүй.
 *    Arcade-ийн \`$feature["нэр"]\` ямар ч нэрийг уншина; ТААРАХГҮЙ утга (\`x\`) симболгүй тул
 *    зурагдахгүй — шүүлт ба өнгө НЭГ механизмаар (`MapCanvas.layerStyle.classes`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { arcgisPost } from '@/lib/query';
import { loadLayerMeta, type FieldDef, type LayerMeta } from '@/lib/butetsEdit';
import { Section } from '@/components/ui';
import { Segmented } from '@/components/Switch';
import d from './dedButets.module.css';

export type StatusPick = 'off' | 'all' | 'yes' | 'no';
/** Утгын шүүлтүүр — 'off' эсвэл `v:` + ШОШГО (датаас) */
export type StatPick = string;
export type ColorBy = 'fill' | 'edit' | 'stat';
export type StatusClasses = { expression: string; hues: Record<string, string> };
type ValKind = 'stat' | 'chg';

/** Төлөвийн өнгө — сайн/муу/анхаарах ЗААЛТ (өгөгдлийн ангиллын өнгө биш) */
const HUE = {
  ok: '#16a34a',
  miss: '#dc2626',
  unk: '#a8a29e',
} as const;
const PALETTE = ['#2563eb', '#9333ea', '#0d9488', '#db2777', '#ca8a04', '#4f46e5'];
/** Утгын өнгө — нэрээр танигдвал утгатай өнгө, эс бөгөөс ялгах палитр */
function hueOf(kind: ValKind, label: string, i: number): string {
  if (kind === 'chg') {
    if (/эцсийн|final/i.test(label)) return '#16a34a';
    if (/ороогүй|орсонгүй|байхгүй|unchanged|no\b/i.test(label)) return '#64748b';
    if (/орсон|changed|өөрчлөгдсөн/i.test(label)) return '#f59e0b';
  } else {
    /* ⚠️ 2026-10-14: «Үргэлжилж байгаа» ба «Эхэлсэн» ИЖИЛ өнгөтэй байсан — салгав */
    if (/дуус|гүйцэт|бэлэн|complete|done|finish/i.test(label)) return '#16a34a';
    if (/эхлээгүй|хүлээ|төлөвл|not|plan|pending/i.test(label)) return '#475569'; // ⚠️ 2026-10-14 (хэрэглэгч): бараан саарал-цэнхэр — цайвар «Төлөв ороогүй»-ээс ялгарна, улаан шиг тод биш
    if (/үргэлж|явагд|хийгд|progress|ongoing/i.test(label)) return '#2563eb';
    if (/эхэл|start/i.test(label)) return '#f59e0b';
    if (/зогс|саат|цуцл|stop|hold|cancel/i.test(label)) return '#7f1d1d';
  }
  return PALETTE[i % PALETTE.length];
}

const FIELD_RE: Record<ValKind, RegExp> = {
  stat: /төлөв|tuluv|tolov|status|state/i,
  chg: /өөрчлөлт|uurchlult|oorchlolt|хувилбар|huvilbar|change|version/i,
};
/** Төлөвийн талбарт орсон ч гүйцэтгэлийн төлөв БИШ утгууд (шугамын чиглэл) */
const NOT_STATUS = /^(өгөх|буцах)$/i;

/** Давхаргын утгын талбар — кодлогдсон домэйнтэйг эрхэмлэнэ; «өөрчлөлт» нь төлөвийн талбартай ДАВХАРДАХГҮЙ */
export function valFieldOf(meta: LayerMeta, kind: ValKind): FieldDef | null {
  const all = [...meta.fields, ...meta.readOnly].filter((f) => f.kind === 'text' || f.codes);
  const re = FIELD_RE[kind];
  let hit = all.filter((f) => re.test(f.name) || re.test(f.alias));
  if (kind === 'chg') {
    const st = valFieldOf(meta, 'stat');
    hit = hit.filter((f) => f.name !== st?.name);
  } else {
    hit = hit.filter((f) => !FIELD_RE.chg.test(f.name) && !FIELD_RE.chg.test(f.alias));
  }
  return hit.find((f) => f.codes?.length) ?? hit[0] ?? null;
}

const q = (s: string) => JSON.stringify(s);

/** Arcade — утгын ШОШГО (домэйнтэй бол `DomainName`, эс бөгөөс утга өөрөө; Trim) */
const valExpr = (name: string, sf: FieldDef | null) => (sf
  ? `var ${name} = IIF(IsEmpty(f[${q(sf.name)}]), '', Trim(${sf.codes?.length
    ? `DomainName(f, ${q(sf.name)})`
    : `Text(f[${q(sf.name)}])`}));`
  : `var ${name} = '';`);

/** Нэг давхаргын Arcade илэрхийлэл — шүүлт (`x` = нуух) ба өнгөний ангилал */
function classesOf(
  meta: LayerMeta, fill: StatusPick, edit: StatPick, stat: StatPick, colorBy: ColorBy,
  hues: Record<ValKind, Record<string, string>>,
): StatusClasses {
  const empty = meta.fields.map((f) => `IsEmpty(f[${q(f.name)}])`);
  const lines = [
    'var f = $feature;',
    /* Засагдах талбаргүй давхарга — «дутуу» гэж үзэх үндэсгүй */
    `var miss = ${empty.length ? empty.join(' || ') : 'false'};`,
    /* ⚠️ 2026-10-14 (хэрэглэгч: «зарим нь 2 харагдаад байна»): ШОШГООР нь (код биш) —
       давхарга бүрийн домэйн ижил «Дууссан»-д өөр код өгдөг тул кодоор бүлэглэвэл давхарддаг байв. */
    valExpr('st', valFieldOf(meta, 'stat')),
    valExpr('cg', valFieldOf(meta, 'chg')),
  ];
  if (fill === 'yes') lines.push("if (miss) { return 'x'; }");
  if (fill === 'no') lines.push("if (!miss) { return 'x'; }");
  if (edit.startsWith('v:')) lines.push(`if (cg != ${q(edit.slice(2))}) { return 'x'; }`);
  if (stat.startsWith('v:')) lines.push(`if (st != ${q(stat.slice(2))}) { return 'x'; }`);
  if (colorBy === 'fill') {
    lines.push("return IIF(miss, 'miss', 'ok');");
    return { expression: lines.join('\n'), hues: { miss: HUE.miss, ok: HUE.ok } };
  }
  /* Утгагүй / жагсаалтад ороогүй утга — саарал «тодорхойгүй» */
  const kind: ValKind = colorBy === 'edit' ? 'chg' : 'stat';
  const v = kind === 'chg' ? 'cg' : 'st';
  const known = Object.keys(hues[kind]).map((k) => `${v} == ${q(k)}`);
  lines.push(known.length ? `return IIF(${known.join(' || ')}, 's:' + ${v}, 'unk');` : "return 'unk';");
  return {
    expression: lines.join('\n'),
    hues: { unk: HUE.unk, ...Object.fromEntries(Object.entries(hues[kind]).map(([k, h]) => [`s:${k}`, h])) },
  };
}

/**
 * Ялгаатай утгууд — домэйнгүй талбарт үйлчилгээнээс.
 * ⚠️ МОДУЛИЙН кэш БАЙХГҮЙ (`dataBus.invariant`): засварын дараа шинэ утга гарч болох тул
 *    бүрэлдэхүүний state-д (`vals`) — хуудас дахин нээгдэхэд шинээр уншина.
 */
function distinctOf(meta: LayerMeta, field: string): Promise<string[]> {
  return arcgisPost<{ features?: { attributes?: Record<string, unknown> }[] }>(`${meta.url}/query`, {
    f: 'json', where: '1=1', outFields: field, returnDistinctValues: 'true', returnGeometry: 'false',
  }).then((j) => [...new Set((j.features ?? [])
    .map((x) => x.attributes?.[field])
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v)))]);
}

export type StatOption = { code: string; label: string; hue: string };

/**
 * ⚠️ 2026-10-21: АТРИБУТ ЗАСАГДСАН ДОХИО — давхаргын ялгаатай утгыг (`vals`) дахин уншуулна. Засвар нь
 *    dataBus-ийн түлхүүргүй (давхаргыг `refreshLayer`-ээр л шинэчилдэг) тул урьд нь шинэ төлөвийн утга
 *    сешн дуустал шүүлтүүр/өнгөнд гардаггүй байв. Засагч (`DedButetsEdit` хадгалалт) дуудна.
 */
const valSubs = new Set<(layerId: string) => void>();
export function statusValsChanged(layerId: string): void {
  for (const fn of valSubs) fn(layerId);
}
/** Түр алдааны дараах дахин оролдлого — хоцрол (мс) ба дээд тоо */
const RETRY_MS = 15_000;
const RETRY_MAX = 3;

/**
 * Харагдаж буй засагдах давхарга бүрийн renderer дарлага. Шүүлтүүр бүгд унтраалттай бол `null`
 * (давхарга өөрийн анхны загвартаа).
 */
export function useStatusClasses(
  ids: readonly string[], fill: StatusPick, edit: StatPick, stat: StatPick, colorBy: ColorBy,
  /**
   * ⚠️ 2026-10-14 (хэрэглэгч: «жагсаалтад датан дээрх төлөвүүд гарахгүй байна»): шүүлтүүр
   * СОНГОГДООГҮЙ үед ч метадата + утгыг урьдчилан татна — эс бөгөөс жагсаалт хоосон гарч байв.
   * `false` = шүүлтүүр харагдахгүй хэрэглэгч.
   */
  preload = true,
  /**
   * ⚠️ 2026-10-14 (хэрэглэгч: «газрын зураг 2 төрлөөр харагддаг — инженерийн ба гүйцэтгэлээр»):
   * `true` = «Гүйцэтгэлээр» харагдац — шүүлтгүй ч БҮХ засагдах давхарга гүйцэтгэлийн төлөвийн
   * өнгөөр будагдана (өнгө үргэлж `stat`); шүүлтүүрүүд нь дээрээс нь шүүнэ.
   */
  perf = false,
) {
  const on = fill !== 'off' || edit !== 'off' || stat !== 'off' || perf;
  const by: ColorBy = perf ? 'stat' : colorBy;
  const [metas, setMetas] = useState<Record<string, LayerMeta | null>>({});
  /** Домэйнгүй талбарын ялгаатай утгууд — `kind|id`-аар */
  const [vals, setVals] = useState<Record<string, string[]>>({});
  /**
   * ⚠️ 2026-10-19: ХҮСЭЛТ ТҮЛХҮҮР БҮРД НЭГ УДАА, цуцлалт зөвхөн UNMOUNT-д (`mounted`). Урьд нь эффект бүр
   *    өөрийн `alive`-тай бөгөөд `metas`/`vals` deps-д байсан тул ЭХНИЙ хариу ирж төлөв өөрчлөгдөхөд
   *    өмнөх ажиллалтын `alive` унтарч, явж буй БУСАД хүсэлтийн хариу ХАЯГДДАГ байв; утгын хүсэлтийн
   *    `asked` нь `finally`-д арилдаг ч эффектийг дахин сэдээх зүйлгүй тул тэр давхаргын утга ХЭЗЭЭ Ч
   *    дахин хүсэгдэхгүй — жагсаалтад төлөвүүд дутуу гарна. Одоо хариу бүр төлөвт НЭГТГЭГДЭНЭ.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  /** Хүсэлт илгээсэн давхарга (метадата) — давхар илгээхгүй */
  const askedMeta = useRef(new Set<string>());
  /** Хүсэлт илгээсэн ялгаатай утга (`kind|id`) — давхар илгээхгүй */
  const asked = useRef(new Set<string>());
  /**
   * ⚠️ 2026-10-21: ДАХИН ОРОЛДЛОГО ба ЗАСВАРЫН ДАРААХ ШИНЭЧЛЭЛ. Урьд нь метадата/утга түлхүүр бүрд НЭГ л
   *    удаа хүсэгдэж, нэг түр алдаа давхаргыг сешн турш будаггүй үлдээдэг, засвараар нэмэгдсэн шинэ
   *    төлөвийн утга жагсаалтад гардаггүй байв. Алдаанд `asked*`-аас хасаж `RETRY_MS`-ийн дараа (дээд
   *    `RETRY_MAX`) эффектийг `rev`-ээр сэдээнэ; `statusValsChanged` ирэхэд тэр давхаргын утгыг шинээр.
   */
  const [rev, setRev] = useState(0);
  const fails = useRef(new Map<string, number>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  const retryLater = (k: string, drop: () => void) => {
    const n = (fails.current.get(k) ?? 0) + 1;
    fails.current.set(k, n);
    if (n > RETRY_MAX) return;
    const t = setTimeout(() => {
      timers.current.delete(t);
      if (!mounted.current) return;
      drop();
      setRev((x) => x + 1);
    }, RETRY_MS);
    timers.current.add(t);
  };
  useEffect(() => {
    const fn = (layerId: string) => {
      if (!mounted.current) return;
      asked.current.delete(`stat|${layerId}`);
      asked.current.delete(`chg|${layerId}`);
      setRev((x) => x + 1);
    };
    valSubs.add(fn);
    return () => { valSubs.delete(fn); };
  }, []);
  const key = ids.join(',');
  useEffect(() => {
    if (!on && !preload) return;
    for (const id of key ? key.split(',') : []) {
      if (askedMeta.current.has(id)) continue;
      askedMeta.current.add(id);
      /* ⚠️ Уншиж чадаагүй давхарга `null` — ангилагдахгүй, анхны загвартаа үлдэнэ (дахин оролдоно — дээрх ⚠️) */
      loadLayerMeta(id)
        .then((m) => { if (mounted.current) { fails.current.delete(`m|${id}`); setMetas((p) => ({ ...p, [id]: m })); } })
        .catch(() => {
          if (!mounted.current) return;
          setMetas((p) => ({ ...p, [id]: null }));
          retryLater(`m|${id}`, () => askedMeta.current.delete(id));
        });
    }
  }, [on, preload, key, rev]);
  useEffect(() => {
    if (!on && !preload) return;
    for (const [id, m] of Object.entries(metas)) {
      if (!m) continue;
      for (const kind of ['stat', 'chg'] as const) {
        const k = `${kind}|${id}`;
        if (asked.current.has(k)) continue;
        const sf = valFieldOf(m, kind);
        if (!sf || sf.codes?.length) continue;
        asked.current.add(k);
        distinctOf(m, sf.name)
          .then((v) => { if (mounted.current) { fails.current.delete(k); setVals((p) => ({ ...p, [k]: v })); } })
          .catch(() => {
            if (!mounted.current) return;
            /* ⚠️ 2026-10-21: өмнө ирсэн утга байвал ХАДГАЛНА (засварын дараах шинэчлэл унасан) — хоосон болгохгүй */
            setVals((p) => (k in p ? p : { ...p, [k]: [] }));
            retryLater(k, () => asked.current.delete(k));
          });
      }
    }
  }, [on, preload, metas, rev]);

  /**
   * Сонголтууд — ШОШГООР нэгтгэнэ (`code` = хэвшүүлсэн шошго).
   * ⚠️ 2026-10-14 (хэрэглэгч: «нэршлүүдийг дата доторх сонголтуудтай адилхан болго»): домэйны
   * ДАРААЛЛААР (цагаан толгойгоор БИШ), домэйнтэй давхаргууд ЭХЭНД; домэйнгүйн утгууд араас нь.
   */
  const optionsOf = (kind: ValKind): StatOption[] => {
    const seen = new Map<string, string>();
    const add = (raw: string) => {
      const k = raw.trim();
      /* ⚠️ 2026-10-14 (хэрэглэгч): «Өгөх», «Буцах» — шугамын ЧИГЛЭЛ, гүйцэтгэлийн төлөв биш */
      if (k && !(kind === 'stat' && NOT_STATUS.test(k)) && !seen.has(k)) seen.set(k, k);
    };
    const fields = ids.flatMap((id) => {
      const m = metas[id];
      const sf = m ? valFieldOf(m, kind) : null;
      return sf ? [{ id, sf }] : [];
    });
    for (const { sf } of fields) if (sf.codes?.length) for (const c of sf.codes) add(c.label || c.code);
    for (const { id, sf } of fields) if (!sf.codes?.length) for (const v of vals[`${kind}|${id}`] ?? []) add(v);
    return [...seen.keys()].map((label, i): StatOption => ({ code: label, label, hue: hueOf(kind, label, i) }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- optionsOf нь ids/metas/vals-аас л хамаарна
  const statOptions = useMemo(() => optionsOf('stat'), [ids, metas, vals]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- дээрхтэй ижил
  const chgOptions = useMemo(() => optionsOf('chg'), [ids, metas, vals]);

  const out = useMemo(() => {
    if (!on) return { style: null, noStat: [] as string[], noChg: [] as string[], pending: 0 };
    const hues = {
      stat: Object.fromEntries(statOptions.map((o) => [o.code, o.hue])),
      chg: Object.fromEntries(chgOptions.map((o) => [o.code, o.hue])),
    };
    const style: Record<string, { classes: StatusClasses }> = {};
    /* ⚠️ 2026-10-14 (хэрэглэгч: «ямар 8 давхарга вэ»): тоо биш НЭРС — самбарт жагсаана */
    const noStat: string[] = [];
    const noChg: string[] = [];
    let pending = 0;
    for (const id of ids) {
      const m = metas[id];
      if (m === undefined) { pending += 1; continue; }
      if (!m) continue;
      if (!valFieldOf(m, 'stat')) noStat.push(m.title);
      if (!valFieldOf(m, 'chg')) noChg.push(m.title);
      style[id] = { classes: classesOf(m, fill, edit, stat, by, hues) };
    }
    return { style, noStat, noChg, pending };
  }, [on, ids, metas, fill, edit, stat, by, statOptions, chgOptions]);

  return { ...out, statOptions, chgOptions };
}

/* ⚠️ 2026-10-14 (хэрэглэгч: «дизайныг сайжруул»): порталын шүүлтийн КАПСУЛ-тай ижил хэв
   (`multiSelect.module.css .pill`) — шошго дээд жижиг үсгээр, идэвхтэй үед өнгөт хүрээ, `▾` заагч.
   Натив `select` хэвээр (гар, дэлгэц уншигч, гар утсанд бэлэн). */
function Pick<T extends string>({ label, value, onChange, opts }: {
  label: string; value: T; onChange: (v: T) => void; opts: [T, string][];
}) {
  return (
    <label className={`${d.stPick} ${value !== 'off' ? d.stPickOn : ''}`}>
      <span className={d.stPickLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <i className={d.stCaret} aria-hidden>▾</i>
    </label>
  );
}

const vOpts = (list: StatOption[]): [string, string][] => list.map((o) => [`v:${o.code}`, o.label]);

/** Гурван сонгогч + идэвхтэй ангиллын тайлбар (`inline` — хажуугийн самбарын карт) */
export function StatusBar({
  fill, edit, stat, colorBy, onFill, onEdit, onStat, statOptions, chgOptions, noStat, noChg, pending, inline = false,
  perf = false, onPerf,
}: {
  /** «Гүйцэтгэлээр» харагдац (`useStatusClasses.perf`) ба түүнийг солих */
  perf?: boolean;
  onPerf?: (v: boolean) => void;
  /* ⚠️ 2026-10-14 (хэрэглэгч): шүүлтүүрийн нэрс — «Мэдээлэл бүрдүүлэлт» · «Өөрчлөлт орсон эсэх» ·
     «Гүйцэтгэлийн төлөв» (талбарын alias-аас БИШ). */
  /** Хажуугийн самбарт (газрын зургийн дээр давхарлахгүй) — 2026-10-14 */
  inline?: boolean;
  fill: StatusPick; edit: StatPick; stat: StatPick; colorBy: ColorBy;
  onFill: (v: StatusPick) => void; onEdit: (v: StatPick) => void; onStat: (v: StatPick) => void;
  statOptions: StatOption[]; chgOptions: StatOption[];
  noStat: readonly string[]; noChg: readonly string[]; pending: number;
}) {
  const on = fill !== 'off' || edit !== 'off' || stat !== 'off' || perf;
  const by: ColorBy = perf ? 'stat' : colorBy;
  const missing = by === 'edit'
    ? { list: noChg, label: tr('{0} давхаргад өөрчлөлтийн талбар алга', noChg.length) }
    : by === 'stat'
      ? { list: noStat, label: tr('{0} давхаргад төлөвийн талбар алга', noStat.length) }
      : null;
  const reset = () => { onFill('off'); onEdit('off'); onStat('off'); };
  const nOn = [fill, edit, stat].filter((v) => v !== 'off').length;
  const fillOpts: [StatusPick, string][] = [['off', tr('Шүүхгүй')], ['yes', tr('Бөглөсөн')], ['no', tr('Дутуу')]];
  const editOpts: [string, string][] = [['off', tr('Шүүхгүй')], ...vOpts(chgOptions)];
  const statOpts: [string, string][] = [['off', tr('Шүүхгүй')], ...vOpts(statOptions)];
  /* ⚠️ 2026-10-14 (хэрэглэгч: «байгаад байх шаардлагагүй, хас»): өнгөний тайлбар (чипүүд) ХАСАГДАВ —
     зөвхөн ачаалал ба «N давхаргад … талбар алга» тэмдэглэл үлдэнэ. */
  const legendEl = on && (pending > 0 || (missing && missing.list.length > 0))
    && <Legend pending={pending} missing={missing} />;
  /* ⚠️ 2026-10-14 (хэрэглэгч: «дизайн сайжруул»): хажуугийн самбарт «Дэд бүтэц»-тэй ИЖИЛ карт
     (`Section`) — гарчиг, идэвхтэй шүүлтийн тоо, «Арилгах» нь гарчгийн мөрөнд. */
  if (inline) {
    return (
      <Section
        title={tr('Мэдээллийн төлөв')}
        note={nOn
          ? <>{tr('{0} шүүлт', nOn)} · <button type="button" className={d.stLink} onClick={reset}>{tr('Арилгах')}</button></>
          : undefined}
      >
        {/* ⚠️ 2026-10-14 (хэрэглэгч): ГАЗРЫН ЗУРГИЙН ХАРАГДАЦ — «Инженерийн» (давхаргын өөрийн
            өнгө) · «Гүйцэтгэлээр» (гүйцэтгэлийн төлөвийн өнгө). Тайлбар нь ЗӨВХӨН «Гүйцэтгэлээр»-т —
            шүүлтүүрийн доорх тайлбарыг хэрэглэгч хасуулсан тул тэнд биш. */}
        {onPerf && (
          /* ⚠️ 2026-10-26 (хэрэглэгч: «нэг загвар»): нийтлэг `Segmented` капсул (бүтэн өргөн — `.stView`) */
          <div className={d.stView}>
            <Segmented value={perf ? 'perf' : 'eng'} onChange={(v) => onPerf(v === 'perf')}
              label={tr('Газрын зургийн харагдац')}
              options={[{ value: 'eng', label: tr('Инженер') }, { value: 'perf', label: tr('Гүйцэтгэл') }]} />
          </div>
        )}
        {perf && statOptions.length > 0 && (
          <div className={d.stKey}>
            {statOptions.map((o) => (
              <span key={o.code}><i style={{ background: o.hue }} aria-hidden />{o.label}</span>
            ))}
            <span><i style={{ background: HUE.unk }} aria-hidden />{tr('Төлөв ороогүй')}</span>
          </div>
        )}
        <div className={d.stForm} role="group" aria-label={tr('Мэдээллийн төлөв')}>
          <Field label={tr('Мэдээлэл бүрдүүлэлт')} value={fill} onChange={onFill} opts={fillOpts} />
          {/* ⚠️ 2026-10-14 (хэрэглэгч): ДАТАН дахь сонголт — «Өөрчлөлт орсон» · «Өөрчлөлт ороогүй» · «Эцсийн хувилбар» */}
          <Field label={tr('Өөрчлөлт орсон эсэх')} value={edit} onChange={onEdit} opts={editOpts} />
          {/* ⚠️ 2026-10-14 (хэрэглэгч): дата дахь төлөвүүд («Өгөх», «Буцах»-гүй); «Бүгд (өнгөөр)» хасагдсан */}
          <Field label={tr('Гүйцэтгэлийн төлөв')} value={stat} onChange={onStat} opts={statOpts} />
        </div>
        {legendEl}
      </Section>
    );
  }
  return (
    <div className={d.stBar} role="group" aria-label={tr('Мэдээллийн төлөв')}>
      <div className={d.stRow}>
        <Pick label={tr('Мэдээлэл бүрдүүлэлт')} value={fill} onChange={onFill} opts={fillOpts} />
        <Pick label={tr('Өөрчлөлт орсон эсэх')} value={edit} onChange={onEdit} opts={editOpts} />
        <Pick label={tr('Гүйцэтгэлийн төлөв')} value={stat} onChange={onStat} opts={statOpts} />
        {on && <button type="button" className={d.stReset} onClick={reset}>{tr('Арилгах')}</button>}
      </div>
      {legendEl}
    </div>
  );
}

/** Тэмдэглэлүүд (ачаалал, талбаргүй давхарга) — хоёр байрлалд ижил */
function Legend({ pending, missing }: {
  pending: number; missing: { list: readonly string[]; label: string } | null;
}) {
  return (
    <div className={d.stLegend}>
      {pending > 0 && <em>{tr('Ачаалж байна…')}</em>}
      {missing && missing.list.length > 0 && (
        <details className={d.stMore}>
          <summary>{missing.label}</summary>
          <ul>{missing.list.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Хажуугийн самбарын мөр — шошго | сонгогч (бүтэн өргөн, `▾` заагчтай) | цуцлах */
function Field<T extends string>({ label, value, onChange, opts }: {
  label: string; value: T; onChange: (v: T) => void; opts: [T, string][];
}) {
  return (
    <label className={`${d.stField} ${value !== 'off' ? d.stFieldOn : ''}`}>
      <span>{label}</span>
      <span className={d.stSel}>
        {/* ⚠️ 2026-10-14 (хэрэглэгч): сонгоогүй үед «Шүүхгүй» биш саарал «Сонгоно…» (placeholder);
            жагсаалтад ч тэр мөр нь сонголтыг цуцлах зам хэвээр */}
        <select value={value} onChange={(e) => onChange(e.target.value as T)}
          className={value === 'off' ? d.stPlaceholder : undefined}>
          {opts.map(([k, l]) => <option key={k} value={k}>{k === 'off' ? tr('Сонгоно…') : l}</option>)}
        </select>
        <i aria-hidden>▾</i>
      </span>
      {/* ⚠️ 2026-10-14 (хэрэглэгч): шүүлтүүр тус бүрд жижиг «шинэчлэх» — тухайн шүүлтийг цуцална */}
      <button type="button" className={d.stClear} disabled={value === 'off'}
        onClick={(e) => { e.preventDefault(); onChange('off' as T); }}
        title={tr('Шүүлтийг цуцлах')} aria-label={`${label}: ${tr('Шүүлтийг цуцлах')}`}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <path d="M13 8a5 5 0 1 1-1.46-3.54M13 3v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </label>
  );
}
