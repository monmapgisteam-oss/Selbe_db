/**
 * ӨГӨГДЛИЙН КАТАЛОГ — порталын уншдаг/бичдэг БҮХ эх сурвалж, давхарга/хүснэгт
 * тус бүрээр (2026-09-25, хэрэглэгчийн хүсэлт: «Системийн баримт»-ын оронд).
 *
 * ⚠️ 2026-09-25: НЭГ МӨР = НЭГ ДАВХАРГА/ХҮСНЭГТ. Олон давхаргатай үйлчилгээ
 *    (`SELBE_ALL_DATA_last_0917`, `Инженерийн_дэд_бүтэц__Сэлбэ_0916`, `QAQC`,
 *    `selbe_3D__0804_WFL1` …) дэд давхарга бүрээрээ задарна. Порталын хэд хэдэн
 *    id НЭГ физик давхарга руу заадаг (жиш. `sb:4` · `et:24` · `scene3d:4` →
 *    `SELBE_ALL_DATA_last_0917/108`) — тэдгээр нь НЭГ мөрөнд нийлж, id-ууд нь
 *    `aliases`-д жагсана. Эс бөгөөс нэг хүснэгт хоёр гурван удаа «өөр эх» мэт
 *    харагдана.
 *
 * ⚠️ 2026-09-25: РЕГИСТРЭЭС АВТОМАТААР. `LAYERS` (+ `IRGED_*_DEF`,
 *    `SCENE3D_LAYERS`), `PKGS` (Bagts_* 18 хуудас), `QAQC_TABLE`, `BIM`,
 *    `MESH_VERSIONS` зэргээс мөр үүснэ — давхарга нэмэгдэхэд каталог өөрөө
 *    дагана. Гараар бичсэн нь ЗӨВХӨН зориулалт ба шинэчлэлийн шатлал (кодын
 *    бичих замаас уншиж бичсэн: `hyanaltStore` · `negtgelWrite` ·
 *    `ipcAutoWrite` · `negtgelAuto` · `tableWrite` · `parcelEdit` ·
 *    `butetsEdit` · `zovshoorol` · `qaqc` · `chanarStore` · `huvaari*` ·
 *    `obyemBatlah` · `ajilBatlah/ajilApply` · `permsRemote` · `draftRemote`).
 *    Бичих зам өөрчлөгдвөл ЭНД мөн засна.
 *
 * ⚠️ 2026-09-25: ТЕКСТ ДУУДАХ АГШИНД `tr()` — модулийн түвшинд тогтмол БИШ
 *    (`purpose()`, `chain()`, `editors()` функц). `caps.ts`-ийн ⚠️-тэй ижил
 *    шалтгаан: i18n гаргагч үсгэн `tr('…')`-г л олно.
 *
 * ⚠️ React-гүй — `dataCatalog.check.mjs` шууд Node дээр ачаална.
 */

import { t as tr } from '@/lib/i18nCore';
import {
  LAYERS, VIEWS, CATALOG_LAYER_IDS, IRGED_TOILET_DEF, IRGED_BUILT_DEF,
  IMAGERY, IRGED_ROAD, SCENE, MESH_VERSIONS, IRGED_SCENE, BIM,
  ELEVATION_URL, HO_IPC, CASHFLOW_NEW, TUSUL_NEGTGEL, BAGTS_NEGTGEL,
  HABEA, HJ, layerUrl,
  type LayerDef, type ViewKey,
} from '@/lib/services';
import { HYANALT } from '@/lib/hyanalt';
import { URL as ZOV_URL } from '@/lib/zovshoorol';
import { HUVAARI_OBYEM } from '@/lib/huvaariObyem';
import { QAQC_TABLE, QAQC_SERVICES } from '@/lib/qaqc';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { SCENE3D_LAYERS } from '@/lib/scene3d';
import { BUTETS_PACKS, PACK_OF_LAYER } from '@/lib/butetsPacks';
import { ERSDEL_FS } from '@/lib/ersdel';

/* ══════════════════ Төрөл ══════════════════ */

export type CatGroup =
  | 'guits' | 'fin' | 'huvaari' | 'chanar' | 'zov' | 'gazar'
  | 'infra' | 'plan' | 'habea' | 'iot' | 'img' | 'sys';

/** давхарга · хүснэгт · 3D · зураг */
export type CatKind = 'layer' | 'table' | '3d' | 'image';

/** Шатлалын нэг алхам. `ref` нь өөр каталогийн мөрийн `id` — дарахад тийш үсэрнэ. */
export type StepPart = { label: string; ref?: string };
/** `with` — ЗЭРЭГ явагдах (нэг агшинд бичигддэг) хажуугийн алхам: «Нэгтгэл · IPC» */
export type Step = StepPart & { with?: StepPart[] };

/** Засах эрх — `cap` нь эрхийн түлхүүр/мөрийн угтвар (mono), `text` тайлбар */
export type Editor = { cap?: string; text: string };

/** Нэг хүснэгт дотор олон төрлийн мөр хадгалдаг бол (Selbe_Permissions г.м.) */
export type RowKind = { key: string; text: string };

export type CatEntry = {
  id: string;
  name: string;
  /** Үйлчилгээний нэр (URL-аас задалсан, кирилл нь decode хийгдсэн) */
  service: string;
  /** Дэд давхарга/хүснэгтийн дугаар (эсвэл кодоор үүсгэсэн хүснэгтийн нэр) */
  layer: string | null;
  /** Бүтэн хаяг — ажиллах үед олддог (кодоор үүсгэсэн) хүснэгтэд `null` */
  url: string | null;
  kind: CatKind;
  group: CatGroup;
  /** Энэ эх рүү заадаг порталын дотоод id-ууд (`LAYERS` · `scene3d:*` · `irged:*`) */
  aliases: string[];
  /** Хуучин үйлчилгээний хаяг — ЗӨВХӨН газрын зургийн загварын (webmap-style) түлхүүр */
  styleSrc: string[];
  /** Үйлчилгээний нэрийг өгдөг орчны хувьсагч (Survey123 г.м.) */
  env?: string;
  views: ViewKey[];
  /** Бүх газрын зурагтай харагдацын суурь (ортофото, меш, өндөр) */
  allMaps?: true;
  purpose: () => string;
  chain: () => Step[];
  editors: () => Editor[];
  rows?: () => RowKind[];
  note?: () => string;
  /** Үйлчилгээ ХААЛТТАЙ (499) */
  closed?: true;
};

export const CAT_GROUPS: { key: CatGroup; label: () => string }[] = [
  { key: 'guits', label: () => tr('Гүйцэтгэл') },
  { key: 'fin', label: () => tr('Санхүү') },
  { key: 'huvaari', label: () => tr('Хуваарь') },
  { key: 'chanar', label: () => tr('Чанар') },
  { key: 'zov', label: () => tr('Зөвшөөрөл') },
  { key: 'gazar', label: () => tr('Газар') },
  { key: 'infra', label: () => tr('Дэд бүтэц') },
  { key: 'plan', label: () => tr('Ерөнхий төлөвлөгөө') },
  { key: 'habea', label: () => tr('ХАБЭА') },
  { key: 'iot', label: () => tr('IoT') },
  { key: 'img', label: () => tr('3D/зураг') },
  { key: 'sys', label: () => tr('Эрх/систем') },
];

export const kindLabel = (k: CatKind): string =>
  k === 'layer' ? tr('давхарга')
    : k === 'table' ? tr('хүснэгт')
      : k === '3d' ? '3D'
        : tr('зураг');

/**
 * ХААЛТТАЙ (499) ҮЙЛЧИЛГЭЭНҮҮД — CLAUDE.md-ийн «ArcGIS REST-ийн занга».
 * ⚠️ Шалгуур (`dataCatalog.check.mjs`) эдгээрийг агуулсан мөр БҮР `closed`
 *    тугтай эсэхийг барина.
 */
export const CLOSED_SERVICES = ['Selbe_guitsetgel_consolidated', 'Selbe_ET_20260721'] as const;

/* ══════════════════ URL задлах ══════════════════ */

const SERVER_RE = /(FeatureServer|MapServer|ImageServer|SceneServer|VectorTileServer)/;

const dec = (u: string): string => {
  try { return decodeURIComponent(u); } catch { return u; }
};

/** `…/rest/services/[Hosted/]<нэр>/<Server>[/<n>]` → нэр ба дугаар */
export function parseUrl(url: string): { service: string; layer: string | null; server: string | null } {
  const u = dec(url).replace(/\/+$/, '');
  const m = /\/services\/(?:Hosted\/)?(.+?)\/(FeatureServer|MapServer|ImageServer|SceneServer|VectorTileServer)(?:\/(\d+))?/.exec(u);
  if (m) return { service: m[1], layer: m[3] ?? null, server: m[2] };
  /* Хэлбэр танигдаагүй (жиш. өндрийн загвар env-ээс) — сүүлийн хоёр хэсэг */
  const parts = u.split('/').filter(Boolean);
  const sm = SERVER_RE.exec(u);
  return { service: parts.slice(-2).join('/'), layer: null, server: sm ? sm[1] : null };
}

const keyOfUrl = (url: string) => dec(url).replace(/\/+$/, '').toLowerCase();

/** `SELBE_ALL_DATA_last_0917/108` гэх мэт богино бичиглэл */
export const shortRef = (e: Pick<CatEntry, 'service' | 'layer'>): string =>
  e.layer != null ? `${e.service}/${e.layer}` : e.service;

/* ══════════════════ Нийтлэг шатлал ══════════════════ */

const S = (label: string, ref?: string): Step => (ref ? { label, ref } : { label });

/** Гараар шинэчлэгддэг лавлах давхарга */
const refChain = (view: string = tr('Газрын зураг')): Step[] => [
  S(tr('ArcGIS Pro / AGOL-оор гараар шинэчилнэ')),
  S(tr('давхарга')),
  S(view),
];

/** Гүйцэтгэлийн 6 шатны хяналтын 5 хянагч (`hyanalt.REVIEW_STAGES`) */
const reviewSteps = (): Step[] => [
  S(tr('Хяналтын инженер'), 'hyanalt'),
  S(tr('Багцын менежер')),
  S(tr('Ерөнхий менежер')),
  S(tr('Хэлтсийн дарга')),
  S(tr('Газрын дарга батална')),
];

const flowEditors = (): Editor[] => [
  { cap: '__flow__', text: tr('Гүйцэтгэгч компани') },
  { cap: '__flow__', text: tr('Хяналтын инженер') },
  { cap: '__flow__', text: tr('Багцын менежер') },
  { cap: '__flow__', text: tr('Ерөнхий менежер') },
  { cap: '__flow__', text: tr('Хэлтсийн дарга') },
  { cap: '__flow__', text: tr('Газрын дарга') },
];

const NONE = (): Editor[] => [];

/* ══════════════════ Регистрийн давхаргууд ══════════════════ */

/** Порталын id-ийн угтвараар бүлэг */
function groupOfId(id: string): CatGroup {
  if (id.startsWith('infra:') || id.startsWith('src:') || id === 'source:eh'
    || id === 'usan-san' || id === 'bm146' || id === 'et:11') return 'infra';
  if (id.startsWith('habea:')) return 'habea';
  if (id.startsWith('iot:')) return 'iot';
  if (id.startsWith('gazar:') || id.startsWith('land:')) return 'gazar';
  if (id.startsWith('mon:')) return 'guits';
  return 'plan';
}

/** Тусгай зориулалт — id-аар. Үлдсэнд нь угтвараар ерөнхий өгүүлбэр. */
const PURPOSE_BY_ID: Record<string, (title: string) => string> = {
  zone: () => tr('Хот төлөвлөлтийн бүсийн хил — порталын бүсийн шүүлтийн суурь.'),
  'et:24': () => tr('Төлөвлөсөн барилгууд — төлөв, зориулалт, өрх, хүн ам, зогсоол.'),
  khil1: () => tr('Сэлбэ 1 төслийн талбайн хил — газрын зурагт үргэлж асна.'),
  'source:eh': () => tr('Дулаан, цахилгаан, усны эх үүсвэрийн байгууламж ба хэрэглэгч бүрд хуваарилсан хүчин чадал.'),
  'land:left': () => tr('Газар чөлөөлөлтийн нэгж талбар — эзэмшигч, төлөв, явцын мэдээ.'),
  'gazar:parcel': () => tr('Кадастрын нэгж талбар — газар чөлөөлөлтийн лавлах суурь.'),
  'gazar:building': () => tr('Чөлөөлөх талбайн одоогийн барилга ба үнэлгээ.'),
  'mon:building': () => tr('Орон сууцны барилгын блокийн хил — гүйцэтгэлийг Bagts_* хуудаснаас блокоор холбож будна.'),
  'habea:osol': () => tr('Осол, зөрчлийн бүртгэл — Survey123 маягтаар талбайгаас.'),
  'habea:uzV11': () => tr('Ажлын байрны ХАБЭА-ын үзлэг (V1.1) — Survey123 маягт.'),
  'habea:uzG': () => tr('Гүйцэтгэгчийн хийсэн ажлын байрны үзлэг — Survey123 маягт.'),
  'habea:uzZ': () => tr('Захиалагчийн хийсэн ажлын байрны үзлэг — Survey123 маягт.'),
  'habea:crane': () => tr('Цамхагт краны байршил ба төлөв (одоо байгаа / буусан).'),
  'habea:buffer': () => tr('Цамхагт краны аюулгүйн бүсийн полигон.'),
  'irged:toilet': () => tr('Гэр хорооллын нүхэн жорлон — иргэдэд хүрэх үр өгөөжийн «өмнө» байдал.'),
  'irged:built': () => tr('Гэр хорооллын одоогийн барилга (байшин · гэр) — «өмнө» байдал.'),
  'ersdel:sample': () => tr('Ус ба агаарын чанарын харуулын байршил — эрсдэлийн загварын цэгүүд.'),
};

function purposeOf(ids: string[], title: string): string {
  for (const id of ids) {
    const f = PURPOSE_BY_ID[id];
    if (f) return f(title);
  }
  const id = ids[0] ?? '';
  if (id.startsWith('src:')) return tr('Эх үүсвэрийн байгууламж — төрлөөр шүүсэн харагдац: {0}.', title);
  if (id.startsWith('infra:')) return tr('Инженерийн шугам сүлжээний давхарга: {0}.', title);
  if (id.startsWith('pkg:')) return tr('Багцын ажлын хамрах талбай: {0}.', title);
  if (id.startsWith('iot:')) return tr('IoT мэдрэгчийн байршил ба телеметр: {0}.', title);
  if (id.startsWith('sb:')) return tr('2D ерөнхий төлөвлөгөөний суурь давхарга: {0}.', title);
  if (id.startsWith('scene3d:')) return tr('3D горимын давхарга (webscene «selbe_3D_ 0804»): {0}.', title);
  return tr('Ерөнхий төлөвлөгөөний давхарга: {0}.', title);
}

const packName = (id: string): string | null => {
  const k = PACK_OF_LAYER[id];
  return k ? (BUTETS_PACKS.find((p) => p.key === k)?.name ?? k) : null;
};

function chainOf(ids: string[]): Step[] {
  const has = (p: string) => ids.some((x) => x === p || x.startsWith(p));
  if (ids.includes('land:left')) {
    return [
      S(tr('Газрын албаны ажилтан (gazar эрх) төлөв засна')),
      S(tr('давхарга (шууд, архивгүй)')),
      { label: tr('Газар чөлөөлөлт'), with: [{ label: tr('Нэгтгэл гүйцэтгэл (авто)'), ref: 'negtgel-tusul' }] },
      S(tr('Дашбоард · Тайлан')),
    ];
  }
  if (ids.some((x) => PACK_OF_LAYER[x])) {
    return [
      S(tr('ArcGIS Pro-оор нийтэлсэн (CAD)')),
      S(tr('Засварлагч (butets · багцаар) атрибут, хэлбэр засна')),
      S(tr('давхарга (шууд, батлах шатгүй)')),
      S(tr('Инженерийн дэд бүтэц · Газрын зураг')),
    ];
  }
  if (has('habea:osol') || has('habea:uz')) {
    return [
      S(tr('Талбайн ажилтан Survey123 маягт бөглөнө')),
      S(tr('давхарга')),
      S(tr('ХАБЭА · Дашбоард')),
    ];
  }
  if (has('iot:')) {
    return [S(tr('Мэдрэгч')), S(tr('IoT хүснэгт (real-time)')), S(tr('IoT хяналт'))];
  }
  if (ids.includes('mon:building')) {
    return [
      ...refChain(),
      { label: tr('Гүйцэтгэлийн өнгө — Bagts_* хуудаснаас блокоор'), ref: 'hyanalt' },
    ];
  }
  if (has('habea:')) return refChain(tr('ХАБЭА · Газрын зураг'));
  if (has('irged:')) return refChain(tr('Иргэдэд хүрэх үр өгөөж'));
  if (has('ersdel:')) return refChain(tr('Эрсдэлийн загвар'));
  if (ids.every((x) => x.startsWith('scene3d:'))) return refChain(tr('Газрын зураг (3D горим)'));
  return refChain();
}

function editorsOf(ids: string[]): Editor[] {
  const out: Editor[] = [];
  const packs = [...new Set(ids.map(packName).filter((x): x is string => !!x))];
  for (const p of packs) out.push({ cap: 'butets', text: tr('Засварлагч — {0}', p) });
  if (ids.includes('land:left')) out.push({ cap: 'gazar', text: tr('Газрын төлөв засах') });
  return out;
}

/** Код дотроос олдсон нэмэлт уншигч харагдацууд (VIEWS[].layers-д ороогүй) */
const EXTRA_VIEWS: Record<string, ViewKey[]> = {
  'land:left': ['gdash', 'dashboard', 'tailan', 'schem'],
  'mon:building': ['gdash', 'dashboard', 'tailan'],
  'source:eh': ['dashboard'],
  'habea:osol': ['gdash', 'tailan'],
  'habea:crane': ['gdash'],
  /* ⚠️ Үзлэгийн гурван давхарга `HABEA_LAYER_IDS`-д ороогүй — `habeaUzleg.tsx` уншина */
  'habea:uzV11': ['habea'],
  'habea:uzG': ['habea'],
  'habea:uzZ': ['habea'],
  'irged:toilet': ['irged'],
  'irged:built': ['irged'],
  'ersdel:sample': ['ersdel'],
};

const VIEW_ORDER = VIEWS.map((v) => v.key);
const sortViews = (vs: Iterable<ViewKey>): ViewKey[] =>
  [...new Set(vs)].sort((a, b) => VIEW_ORDER.indexOf(a) - VIEW_ORDER.indexOf(b));

function viewsOf(ids: string[]): ViewKey[] {
  const out = new Set<ViewKey>();
  for (const v of VIEWS) if (v.layers.some((l) => ids.includes(l))) out.add(v.key);
  for (const id of ids) for (const v of EXTRA_VIEWS[id] ?? []) out.add(v);
  /* ⚠️ Өөрийн `VIEWS[].layers`-д ороогүй ч газрын зургийн КАТАЛОГООС асдаг */
  if (!out.size && ids.some((id) => CATALOG_LAYER_IDS.includes(id))) out.add('plan');
  if (!out.size && ids.some((id) => id.startsWith('scene3d:'))) out.add('plan');
  return sortViews(out);
}

type RawSrc = { id: string; url: string; title: string; geom: LayerDef['geom'] | '3d'; styleUrl?: string };

function registryEntries(): CatEntry[] {
  const raw: RawSrc[] = [
    ...LAYERS.map((l) => ({ id: l.id, url: layerUrl(l), title: l.title, geom: l.geom, styleUrl: l.styleUrl })),
    { id: IRGED_TOILET_DEF.id, url: layerUrl(IRGED_TOILET_DEF), title: IRGED_TOILET_DEF.title, geom: IRGED_TOILET_DEF.geom },
    { id: IRGED_BUILT_DEF.id, url: layerUrl(IRGED_BUILT_DEF), title: IRGED_BUILT_DEF.title, geom: IRGED_BUILT_DEF.geom },
    { id: 'ersdel:sample', url: ERSDEL_FS.url, title: tr('Жишээ харуулын цэгүүд'), geom: 'point' },
    ...SCENE3D_LAYERS.map((l) => ({ id: l.id, url: l.url, title: l.title, geom: '3d' as const })),
  ];
  /* ⚠️ URL-аар нийлүүлнэ — нэг физик давхарга = нэг мөр (толгойн ⚠️) */
  const byUrl = new Map<string, RawSrc[]>();
  for (const r of raw) {
    const k = keyOfUrl(r.url);
    const list = byUrl.get(k);
    if (list) list.push(r); else byUrl.set(k, [r]);
  }
  const out: CatEntry[] = [];
  for (const list of byUrl.values()) {
    /* Үндсэн id: `sb:*` / `scene3d:*` биш нь түрүүлнэ (`et:24` > `sb:4`) */
    const rank = (id: string) => (id.startsWith('scene3d:') ? 2 : id.startsWith('sb:') ? 1 : 0);
    const sorted = [...list].sort((a, b) => rank(a.id) - rank(b.id));
    const main = sorted[0];
    const ids = sorted.map((r) => r.id);
    const titles = [...new Set(sorted.map((r) => r.title))];
    const p = parseUrl(main.url);
    const styleSrc = [...new Set(sorted
      .map((r) => r.styleUrl)
      .filter((u): u is string => !!u && keyOfUrl(u) !== keyOfUrl(main.url))
      .map((u) => shortRef(parseUrl(u))))];
    const allScene = sorted.every((r) => r.geom === '3d');
    const envOf = main.id.startsWith('habea:osol') ? 'NEXT_PUBLIC_HABEA_INCIDENT_SVC'
      : main.id === 'habea:uzV11' ? 'NEXT_PUBLIC_HABEA_UZLEG_V11_SVC'
        : main.id === 'habea:uzG' ? 'NEXT_PUBLIC_HABEA_UZLEG_G_SVC'
          : main.id === 'habea:uzZ' ? 'NEXT_PUBLIC_HABEA_UZLEG_ZAHIALAGCH_SVC'
            : main.id.startsWith('iot:') ? 'NEXT_PUBLIC_ARCGIS_IOT'
              : undefined;
    out.push({
      id: `lyr:${main.id}`,
      name: titles.join(' / '),
      service: p.service,
      layer: p.layer,
      url: main.url,
      kind: allScene ? '3d' : 'layer',
      group: allScene ? 'img' : groupOfId(main.id),
      aliases: ids,
      styleSrc,
      ...(envOf ? { env: envOf } : {}),
      views: viewsOf(ids),
      purpose: () => purposeOf(ids, titles[0]),
      chain: () => chainOf(ids),
      editors: () => editorsOf(ids),
      ...(sorted.some((r) => r.id.startsWith('src:') || r.id === 'source:eh')
        ? { note: () => tr('Нэг давхаргыг `torol` талбараар шүүж хэд хэдэн харагдац болгоно.') }
        : {}),
    });
  }
  return out;
}

/* ══════════════════ Гүйцэтгэл ══════════════════ */

const BAGTS_VIEWS: ViewKey[] = [
  'gdash', 'dashboard', 'pkgProg', 'huvaari', 'huvaariBatlah', 'ajilBatlah',
  'tailan', 'finance', 'guitsetgel', 'qaqc',
];

function bagtsEntries(): CatEntry[] {
  return PKGS.map((pkg) => {
    const p = parseUrl(pkg.url);
    return {
      id: `bagts:${pkg.key}`,
      name: tr('{0} — гүйцэтгэл бөглөх хуудас', pkg.label),
      service: p.service,
      layer: p.layer,
      url: pkg.url,
      kind: 'table' as const,
      group: 'guits' as const,
      aliases: [pkg.key],
      styleSrc: [],
      views: sortViews(BAGTS_VIEWS),
      purpose: () => tr('Багцын ажил × блокийн гүйцэтгэл, обьём, хуваарь — батлагдсан агшин бүр шинэ хуулбар болж архивлагдана.'),
      chain: () => [
        S(tr('Гүйцэтгэгч бөглөнө')),
        S(tr('Ноорог · илгээлт (Selbe_Guitsetgel_Draft)'), 'draft'),
        ...reviewSteps(),
        S(tr('Архивт шинэ хуулбар ({0})', p.service)),
        {
          label: tr('Нэгтгэл (selbe_bagts_guitsetgel_negtgel)'),
          ref: 'negtgel-bagts',
          with: [{ label: 'IPC', ref: 'ho-ipc' }],
        },
        S(tr('Дашбоард')),
      ],
      editors: () => [
        ...flowEditors(),
        { cap: 'planApprove', text: tr('Хуваарийн огноо — батлахад') },
        { cap: 'obyemApprove', text: tr('Инженерийн төлөвлөсөн обьём — батлахад') },
        { cap: 'ajilApprove', text: tr('Нэмэлт ажлын мөр — батлахад') },
      ],
      note: () => tr('Мөн хуваарийн огноо (Хуваарь батлах), инженерийн төлөвлөсөн обьём (Обьём батлах), нэмэлт ажлын мөр (Нэмэлт ажил батлах) батлагдахад энд бичигдэнэ.'),
    };
  });
}

function guitsEntries(): CatEntry[] {
  const hy = parseUrl(HYANALT.url);
  const ng = parseUrl(BAGTS_NEGTGEL.url);
  const tn = parseUrl(TUSUL_NEGTGEL.url);
  const cons = `${HJ}/Selbe_guitsetgel_consolidated/FeatureServer/0`;
  return [
    {
      id: 'draft',
      name: tr('Гүйцэтгэлийн ноорог ба илгээлт'),
      service: 'Selbe_Guitsetgel_Draft',
      layer: 'drafts',
      url: null,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: sortViews(['guitsetgel', 'huvaari']),
      purpose: () => tr('Бөглөж буй ноорог, хянагдаж буй илгээлт (diff) — үндсэн өгөгдөлд хүрэхээс өмнөх завсрын хадгалалт.'),
      chain: () => [
        S(tr('Гүйцэтгэгч бөглөнө (localStorage + хуулбар)')),
        S(tr('«Нийтлэх» = илгээлт (sub|багц|өдөр)')),
        ...reviewSteps(),
        S(tr('Батлагдахад done|… болж хөлдөнө')),
      ],
      editors: () => [...flowEditors(), { cap: 'plan', text: tr('Хуваарийн ноорог') }],
      rows: () => [
        { key: '<багц>', text: tr('Бөглөлтийн хуваалцсан ноорог (багц бүрд нэг)') },
        { key: 'sub|<багц>|<өдөр>', text: tr('Идэвхтэй илгээлт — багц × өдөр бүрд нэг') },
        { key: 'done|<багц>|<oid>', text: tr('Батлагдсан илгээлт (хөлдсөн)') },
        { key: 'plan:<төрөл>:<багц>', text: tr('Хуваарийн хуваалцсан ноорог') },
      ],
      note: () => tr('Хүснэгтийг super админы токеноор код өөрөө үүсгэнэ (createService).'),
    },
    {
      id: 'hyanalt',
      name: tr('Гүйцэтгэлийн хяналтын бүртгэл'),
      service: hy.service,
      layer: hy.layer,
      url: HYANALT.url,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: sortViews(['guitsetgel', 'schem']),
      purpose: () => tr('Илгээлт бүрийн 6 шатны хяналт — хэн, хэзээ, ямар шийдвэр, буцаасан шалтгаан.'),
      chain: () => [
        S(tr('Гүйцэтгэгч илгээнэ (шинэ мөр)'), 'draft'),
        S(tr('Хяналтын инженер')),
        S(tr('Багцын менежер')),
        S(tr('Ерөнхий менежер')),
        S(tr('Хэлтсийн дарга')),
        S(tr('Газрын дарга')),
        S(tr('Төлөв «Шилжүүлсэн» → архив (Bagts_*)')),
      ],
      editors: flowEditors,
      note: () => tr('Дахин илгээхэд хуучин мөрийг засахгүй — шинэ мөр үүснэ (буцаалтын түүх хадгалагдана).'),
    },
    {
      id: 'negtgel-bagts',
      name: tr('Багцын гүйцэтгэлийн нэгтгэл'),
      service: ng.service,
      layer: ng.layer,
      url: BAGTS_NEGTGEL.url,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: sortViews(['gdash', 'dashboard', 'tailan', 'schem']),
      purpose: () => tr('Багц бүрийн батлагдсан гүйцэтгэлийн хувь (агшин бүр нэг мөр) — төлөвлөгөө ба бодитын харьцуулалт.'),
      chain: () => [
        S(tr('Газрын дарга эцэслэн батална'), 'hyanalt'),
        S(tr('Архивын «Б.» мөрийн нэгдсэн хувь')),
        S(tr('Систем автоматаар бүртгэнэ (багц · огноо)')),
        S(tr('Ерөнхий дашбоард · Тайлан · Схем')),
      ],
      editors: () => [{ text: tr('Систем — эцсийн батлалтын үед (хүн засахгүй)') }],
    },
    {
      id: 'negtgel-tusul',
      name: tr('Төслийн нэгтгэл гүйцэтгэл'),
      service: tn.service,
      layer: tn.layer,
      url: TUSUL_NEGTGEL.url,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: sortViews(['guitsetgel', 'gdash', 'tailan']),
      purpose: () => tr('Ажлын задаргааны модоор төслийн нийт гүйцэтгэл ба төлөвлөгөө (0–1 бутархай).'),
      chain: () => [
        { label: 'Cashflow', ref: 'cashflow', with: [
          { label: tr('Газар чөлөөлөлт'), ref: 'lyr:land:left' },
          { label: tr('Багцын гүйцэтгэл'), ref: 'negtgel-bagts' },
          { label: tr('Хуваарь'), ref: 'huvaari-obyem' },
        ] },
        S(tr('Систем автоматаар бодно (super нээхэд, 10 мин тутамд ≤1)')),
        S(tr('Гүйцэтгэл (Нэгтгэл) · Ерөнхий дашбоард · Тайлан')),
      ],
      editors: () => [{ text: tr('Систем — super хэрэглэгчийн сешнээс (хүн засахгүй)') }],
      note: () => tr('Жин (HESEGT_EZLEH, TOSOLD_EZLEH_HUVI) ба эх сурвалжгүй навч мөрийг хэзээ ч дарж бичихгүй.'),
    },
    {
      id: 'obyem-batlah',
      name: tr('Инженерийн обьём батлах урсгал'),
      service: 'Selbe_Obyem_Batlah',
      layer: 'obyem_batlah',
      url: null,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: sortViews(['guitsetgel']),
      purpose: () => tr('Инженерийн төлөвлөсөн обьёмын засвар батлагдтал энд хүлээнэ.'),
      chain: () => [
        S(tr('Инженер (obyemEdit) Гүйцэтгэл бөглөх дээр засна')),
        S(tr('«Батлуулах» → энэ хүснэгт')),
        S(tr('Батлагч (obyemApprove) батална')),
        S(tr('Bagts_* «Инженерийн_төлөвлөсөн_обьём»'), 'bagts:b1_9f'),
      ],
      editors: () => [
        { cap: 'obyemEdit', text: tr('Инженерийн обьём засах') },
        { cap: 'obyemApprove', text: tr('Инженерийн обьём батлах') },
        { cap: '__obyem__', text: tr('Багцын хуваарилалт') },
      ],
      note: () => tr('Хүснэгтийг super админы токеноор код өөрөө үүсгэнэ (createService).'),
    },
    {
      id: 'consolidated',
      name: tr('Хуучин гүйцэтгэлийн нэгтгэсэн хүснэгт'),
      service: 'Selbe_guitsetgel_consolidated',
      layer: '0',
      url: cons,
      kind: 'table',
      group: 'guits',
      aliases: [],
      styleSrc: [],
      views: [],
      purpose: () => tr('2026-08-27-нд Bagts_* хуудас руу шилжсэн хуучин эх — порталд идэвхтэй уншигч байхгүй.'),
      chain: () => [S(tr('Хаагдсан (499)')), S(tr('Bagts_* хуудас руу шилжсэн'), 'bagts:b1_9f')],
      editors: NONE,
      closed: true,
    },
  ];
}

/* ══════════════════ Санхүү ══════════════════ */

function finEntries(): CatEntry[] {
  const cf = parseUrl(CASHFLOW_NEW.url);
  const ipc = parseUrl(HO_IPC.url);
  const finEditors = (): Editor[] => [
    { cap: 'finEdit', text: tr('Санхүүгийн бүртгэл — утга засах') },
    { cap: 'finRow', text: tr('Санхүүгийн бүртгэл — мөр нэмэх') },
  ];
  return [
    {
      id: 'cashflow',
      name: tr('Гэрээ ба хөрөнгө оруулалтын бүртгэл (Cashflow)'),
      service: cf.service,
      layer: cf.layer,
      url: CASHFLOW_NEW.url,
      kind: 'table',
      group: 'fin',
      aliases: [],
      styleSrc: [],
      views: sortViews(['finance', 'pkgFin', 'pkgProg', 'gdash', 'dashboard', 'tailan', 'schem']),
      purpose: () => tr('Гэрээ бүрийн төсөв, гэрээний дүн, шатны гүйцэтгэл ба сарын санхүүжилтийн төлөвлөгөө.'),
      chain: () => [
        S(tr('Санхүүгийн ажилтан (finEdit · finRow) засна')),
        /* ⚠️ 2026-09-25: үйлчилгээний нэр `.env`-ээс (`cf`) — хатуу бичвэл хаяг солигдоход хуучирна */
        S(`${cf.service}/${cf.layer} (${tr('шууд, архивгүй')})`),
        { label: tr('Санхүүжилт · Багцын санхүү'), with: [{ label: tr('Нэгтгэл гүйцэтгэл (авто)'), ref: 'negtgel-tusul' }] },
        S(tr('Дашбоард · Тайлан')),
      ],
      editors: finEditors,
      note: () => tr('Устгасан мөрийг порталаас буцаах арга байхгүй (хувилбарын түүх асаагүй).'),
    },
    {
      id: 'ho-ipc',
      name: tr('Олгосон санхүүжилт · IPC'),
      service: ipc.service,
      layer: ipc.layer,
      url: HO_IPC.url,
      kind: 'table',
      group: 'fin',
      aliases: [],
      styleSrc: [],
      views: sortViews(['finance', 'pkgFin', 'gdash', 'dashboard', 'tailan', 'schem']),
      purpose: () => tr('Гэрээ бүрийн урьдчилгаа ба гүйцэтгэлийн төлбөр (IPC) — дүн, огноо.'),
      chain: () => [
        { label: tr('Санхүүгийн ажилтан (finEdit · finRow) засна'), with: [
          { label: tr('Гүйцэтгэлийн эцсийн батлалт → IPC мөр (авто, багц · сар)'), ref: 'hyanalt' },
        ] },
        S(`${ipc.service}/${ipc.layer}`),
        S(tr('Санхүүжилт · Багцын санхүү · Дашбоард · Тайлан')),
      ],
      editors: () => [...finEditors(), { text: tr('Систем — гүйцэтгэл батлагдахад') }],
    },
  ];
}

/* ══════════════════ Хуваарь ══════════════════ */

function huvaariEntries(): CatEntry[] {
  const ob = parseUrl(HUVAARI_OBYEM);
  return [
    {
      id: 'huvaari-obyem',
      name: tr('Хуваарийн сарын обьём'),
      service: ob.service,
      layer: ob.layer,
      url: HUVAARI_OBYEM,
      kind: 'table',
      group: 'huvaari',
      aliases: [],
      styleSrc: [],
      views: sortViews(['huvaari', 'guitsetgel']),
      purpose: () => tr('Ажил × блок × сар бүрийн төлөвлөсөн обьём — нийлбэр нь төлөвлөсөн обьёмтой тэнцүү.'),
      chain: () => [
        S(tr('Гүйцэтгэгч (plan) хуанли дээр чирж, сарын обьём тохируулна')),
        S(tr('«Батлуулах»'), 'huvaari-batlah'),
        S(tr('Батлагч (planApprove) батална')),
        S(tr('энэ хүснэгт (сар × блок мөр)')),
        S(tr('Хуваарь · Гүйцэтгэл бөглөх (төлөвлөгөөт хувь)')),
      ],
      editors: () => [{ cap: 'planApprove', text: tr('Батлахад бичигдэнэ') }],
    },
    {
      id: 'huvaari-batlah',
      name: tr('Хуваарь батлах урсгал'),
      service: 'Selbe_Huvaari_Batlah',
      layer: 'huvaari_batlah',
      url: null,
      kind: 'table',
      group: 'huvaari',
      aliases: [],
      styleSrc: [],
      views: sortViews(['huvaari', 'huvaariBatlah']),
      purpose: () => tr('Батлагдаагүй хуваарийн санал — батлагдтал эх хуваарь хөдлөхгүй.'),
      chain: () => [
        S(tr('Гүйцэтгэгч (plan) зохионо')),
        S(tr('Ноорог (Selbe_Guitsetgel_Draft · plan:…)'), 'draft'),
        S(tr('«Батлуулах» → энэ хүснэгт (Хүлээгдэж буй)')),
        S(tr('Батлагч (planApprove) батлах / буцаах')),
        { label: tr('Bagts_* огноо'), ref: 'bagts:b1_9f', with: [{ label: tr('Сарын обьём'), ref: 'huvaari-obyem' }] },
      ],
      editors: () => [
        { cap: 'plan', text: tr('Хуваарь төлөвлөх') },
        { cap: 'planApprove', text: tr('Хуваарь батлах') },
        { cap: '__huvaari__', text: tr('Багцын хуваарилалт') },
      ],
      note: () => tr('Хүснэгтийг super админы токеноор код өөрөө үүсгэнэ (createService).'),
    },
    {
      id: 'ajil-batlah',
      name: tr('Нэмэлт ажил батлах урсгал'),
      service: 'Selbe_Ajil_Batlah_csv',
      layer: '219',
      url: null,
      kind: 'table',
      group: 'huvaari',
      aliases: [],
      styleSrc: [],
      views: sortViews(['huvaari', 'ajilBatlah', 'guitsetgel']),
      purpose: () => tr('Гэрээний хамрах хүрээнд шинээр нэмэх ажлын мөр — батлагдтал үндсэн өгөгдөлд орохгүй.'),
      chain: () => [
        S(tr('Менежер (addRow) Хуваарь дээр мөр нэмнэ')),
        S(tr('энэ хүснэгт (Хүлээгдэж буй)')),
        S(tr('Батлагч (ajilApprove) батална')),
        S(tr('Bagts_* шинэ жааз (бүх мөртэй хуулбар)'), 'bagts:b1_9f'),
      ],
      editors: () => [
        { cap: 'addRow', text: tr('Мөр нэмэх') },
        { cap: 'ajilApprove', text: tr('Нэмэлт ажил батлах') },
        { cap: '__ajil__', text: tr('Багцын хуваарилалт') },
      ],
      note: () => tr('Хэрэглэгч CSV-ээс AGOL дээр нийтэлсэн — код үүсгэхгүй, зөвхөн хайж олно.'),
    },
  ];
}

/* ══════════════════ Чанар ══════════════════ */

function chanarEntries(): CatEntry[] {
  const pkgLabel = (k: string) => PKGS.find((p) => p.key === k)?.label ?? k;
  const qaqc: CatEntry[] = Object.entries(QAQC_TABLE).map(([k, ref]) => {
    const url = `${QAQC_SERVICES[ref.svc]}/${ref.id}`;
    return {
      id: `qaqc:${k}`,
      name: tr('QAQC — {0}', pkgLabel(k)),
      service: ref.svc,
      layer: String(ref.id),
      url,
      kind: 'table' as const,
      group: 'chanar' as const,
      aliases: [k],
      styleSrc: [],
      views: sortViews(['qaqc']),
      purpose: () => tr('Inspection Test Plan — ажил бүрийн М-акт · FIC · MA · MIR баримтын дугаар, огноо.'),
      chain: () => [
        S(tr('Чанарын ажилтан (qaqc) бөглөнө')),
        S(tr('Ноорог (Selbe_QAQC_Draft)'), 'qaqc-draft'),
        S(tr('«Хадгалах» → мөрийг байрандаа засна (архивгүй)')),
        S(tr('Чанар (QAQC)')),
      ],
      editors: () => [
        { cap: 'qaqc', text: tr('QAQC — Inspection Test Plan') },
        { cap: '__qaqc__', text: tr('Багцын хуваарилалт') },
      ],
    };
  });
  return [
    ...qaqc,
    {
      id: 'qaqc-draft',
      name: tr('QAQC-ийн ноорог'),
      service: 'Selbe_QAQC_Draft',
      layer: 'drafts',
      url: null,
      kind: 'table',
      group: 'chanar',
      aliases: [],
      styleSrc: [],
      views: sortViews(['qaqc']),
      purpose: () => tr('Хадгалаагүй QAQC актын хуулбар — өөр төхөөрөмж дээр үргэлжлүүлэхэд.'),
      chain: () => [
        S(tr('Бөглөж буй акт (localStorage)')),
        S(tr('энэ хүснэгт (хэрэглэгч|багц мөр)')),
        S(tr('«Хадгалах»'), 'qaqc:b1_9f'),
      ],
      editors: () => [{ cap: 'qaqc', text: tr('QAQC — Inspection Test Plan') }],
      note: () => tr('Хүснэгтийг super админы токеноор код өөрөө үүсгэнэ (createService).'),
    },
    {
      id: 'chanar',
      name: tr('Чанарын баримт (MS · QMP · PRC · MA · MIR · FIC · NCR)'),
      service: 'Selbe_Chanar_Barimt',
      layer: 'chanar_barimt',
      url: null,
      kind: 'table',
      group: 'chanar',
      aliases: [],
      styleSrc: [],
      /* ⚠️ 2026-09-25: QAQC харагдац ч уншина — MA · MIR · FIC дугаарын нүдний сонголт */
      views: sortViews(['chanar', 'qaqc']),
      /* ⚠️ 2026-09-25: 7 төрөл (`turul`, `chanarMs.KINDS`) — MS · QMP · PRC · MA · MIR ·
         FIC · NCR. Хянагч төрлөөр (`REVIEWERS_OF` · `SEQUENTIAL_KINDS`): MS/QMP/PRC —
         ТУХ·Чанар·ХАБЭА зэрэг; MA — ЧХ инженер → Чанар → ТУГ ДАРААЛСАН; MIR/FIC —
         ТУХ → Чанар дараалсан; NCR — захиалагч (ТУХ/Чанар) нээж, гүйцэтгэгч залруулга
         илгээж, ТУХ·Чанар·ТУГ зэрэг хаана; дугаар STMCC-STMC-NCR-NNNN (төслийн хэмжээнд).
         Шийдвэр A/AN/R; approved/returned болмогц REP дугаар SLB-REP-<төрөл>-P<багц>-
         <NNNN>-<RR> (NNNN төслийн хэмжээний дараалал төрөл тус бүр, RR = хариуны тоо).
         `dataCatalog.check` энэ мөрийг `KINDS`/`REVIEWERS_OF`-той тулгана. */
      purpose: () => tr('Ажлын аргачлал (MS) · чанарын удирдлагын төлөвлөгөө (QMP) · процедур (PRC) · материал баталгаажуулалт (MA) · материалын/талбайн үзлэг (MIR · FIC) · үл тохирол (NCR) — ирүүлсэн хувилбар, хянагчдын A/AN/R шийдвэр, REP дугаар, хавсралт.'),
      chain: () => [
        S(tr('Гүйцэтгэгч (chanarAuthor) ирүүлнэ — NCR-ийг захиалагч (ТУХ/Чанар) нээнэ')),
        S(tr('Хянагчид төрлөөр (chanarReview): MS · QMP · PRC — ТУХ · Чанар · ХАБЭА зэрэг; MA — ЧХ инженер → Чанар → ТУГ дараалсан; MIR · FIC — ТУХ → Чанар дараалсан; NCR — залруулгын дараа ТУХ · Чанар · ТУГ зэрэг')),
        S(tr('Бүгд A/AN бол «Батлагдсан» · нэг R бол гүйцэтгэгчид буцна (rev+1; NCR-д rev үгүй) · хариу бүрд SLB-REP-<төрөл>-P<багц>-<NNNN>-<RR> дугаар (RR = хариуны тоо); NCR-ийн дугаар STMCC-STMC-NCR-NNNN')),
        S(tr('Чанарын баримт')),
        S(tr('Чанар (QAQC) — MA · MIR · FIC дугаарын нүдэнд батлагдсан баримтаас сонгоно'), 'qaqc:b1_9f'),
      ],
      editors: () => [
        { cap: 'chanarAuthor', text: tr('Чанарын баримт ирүүлэх (гүйцэтгэгч)') },
        { cap: 'chanarReview', text: tr('Чанарын баримт хянах (ТУХ · Чанар · ХАБЭА · ТУГ · ЧХ инженер)') },
        { cap: '__chanar__', text: tr('Багцын хуваарилалт') },
      ],
      note: () => tr('Хүснэгтийг super админы токеноор код өөрөө үүсгэнэ (createService). Схем 7 төрөлд нийтлэг — төрлийн нэмэлт өгөгдөл body/reviews JSON дотор.'),
    },
  ];
}

/* ══════════════════ Зөвшөөрөл · ХАБЭА · Эрх ══════════════════ */

function otherEntries(): CatEntry[] {
  const zv = parseUrl(ZOV_URL);
  const lb = parseUrl(HABEA.labor.url);
  const et = `${HJ}/Selbe_ET_20260721/FeatureServer`;
  return [
    {
      id: 'zovshoorol',
      name: tr('Багцын ажлын зөвшөөрлийн бүртгэл'),
      service: zv.service,
      layer: zv.layer,
      url: ZOV_URL,
      kind: 'table',
      group: 'zov',
      aliases: [],
      styleSrc: [],
      views: sortViews(['zovshoorol', 'schem', 'tailan']),
      purpose: () => tr('Багц бүрийн зөвшөөрөл — шат, төлөв, огноо, шийдвэрлэх байгууллага.'),
      chain: () => [
        S(tr('Зөвшөөрөл хариуцагч (zovshoorol эрх) бүртгэнэ · засна')),
        S(tr('энэ хүснэгт (шууд)')),
        S(tr('Зөвшөөрөл · Схем · Тайлан')),
      ],
      editors: () => [{ cap: 'zovshoorol', text: tr('Зөвшөөрөл засах') }],
    },
    {
      id: 'habea:labor',
      name: tr('Өдрийн ажилтан, техникийн тоо'),
      service: lb.service,
      layer: lb.layer,
      url: HABEA.labor.url,
      kind: 'layer',
      group: 'habea',
      aliases: [],
      styleSrc: [],
      env: 'NEXT_PUBLIC_HABEA_LABOR_SVC',
      views: sortViews(['habea', 'gdash', 'tailan']),
      purpose: () => tr('Гүйцэтгэгч бүрийн өдрийн ажилтан, хүн-цаг, техникийн тоо.'),
      chain: () => [
        S(tr('Талбайн ажилтан Survey123 маягт бөглөнө')),
        S(tr('давхарга')),
        S(tr('ХАБЭА · Дашбоард')),
      ],
      editors: NONE,
    },
    {
      id: 'perms',
      name: tr('Хэрэглэгчийн эрх ба хуваарилалт'),
      service: 'Selbe_Permissions',
      layer: 'permissions',
      url: null,
      kind: 'table',
      group: 'sys',
      aliases: [],
      styleSrc: [],
      views: [],
      purpose: () => tr('Хэн ямар харагдац, эрх, урсгалын шат, багцын хүрээтэй — нэвтрэх бүрд уншигдана.'),
      chain: () => [
        S(tr('Super админ «Хэрэглэгч ба эрх» самбараас засна')),
        S(tr('энэ хүснэгт (мөрийн төрлөөр)')),
        S(tr('Нэвтрэхэд эрх, харагдац, шат тогтоно')),
      ],
      editors: () => [{ text: tr('Super админ (кодын хатуу жагсаалт)') }],
      rows: () => [
        { key: '<хэрэглэгч>', text: tr('Үүрэг ба харагдах харагдацууд') },
        { key: '__flow__:', text: tr('Гүйцэтгэлийн урсгалын томилгоо — шат ба багц') },
        { key: '__cap__:', text: tr('Нэмэлт эрхүүд (finEdit, plan, gazar …)') },
        { key: '__qaqc__:', text: tr('QAQC-ийн багцын хуваарилалт') },
        { key: '__huvaari__:', text: tr('Хуваарийн багцын хуваарилалт') },
        { key: '__obyem__:', text: tr('Инженерийн обьёмын багцын хуваарилалт') },
        { key: '__chanar__:', text: tr('Чанарын баримтын багцын хуваарилалт') },
        { key: '__ajil__:', text: tr('Нэмэлт ажлын багцын хуваарилалт') },
        { key: '__butets__:', text: tr('Дэд бүтцийн засварын багцын хуваарилалт') },
        { key: '__type__:', text: tr('Эрхийн төрлийн загвар') },
      ],
      note: () => tr('Хүснэгтийг super админ анх нэвтрэхэд код өөрөө үүсгэнэ; бүх харагдац (нэвтрэлт) уншина.'),
    },
    {
      id: 'et-closed',
      name: tr('Хуучин ерөнхий төлөвлөгөөний үйлчилгээ (ЕТ 07-21)'),
      service: 'Selbe_ET_20260721',
      layer: null,
      url: et,
      kind: 'layer',
      group: 'plan',
      aliases: [],
      styleSrc: [],
      views: [],
      purpose: () => tr('Одоо зөвхөн газрын зургийн загварын (webmap-style) түлхүүр — өгөгдөл SELBE_ALL_DATA_last_0917-оос уншигдана.'),
      chain: () => [S(tr('Хаагдсан (499)')), S(tr('SELBE_ALL_DATA_last_0917 руу шилжсэн'), 'lyr:et:24')],
      editors: NONE,
      closed: true,
    },
  ];
}

/* ══════════════════ 3D ба зураг ══════════════════ */

function imgEntries(): CatEntry[] {
  type Src = { id: string; title: string; url: string; kind: CatKind; views: ViewKey[]; allMaps?: true; purpose: () => string };
  const list: Src[] = [
    /* ⚠️ 2026-10-04: ГАНЦ ортофото — `Selbe_September_tif`. Хуучин «img:ortho-old»
       (`Selbe_ortho`) хасагдсан (`services/scene.ts` IMAGERY-ийн ⚠️). */
    {
      id: 'img:ortho', title: IMAGERY.title, url: IMAGERY.url, kind: 'image', views: [], allMaps: true,
      purpose: () => tr('Агаарын зураг (ортофото) — 2D газрын зургийн суурь.'),
    },
    {
      id: 'img:road', title: IRGED_ROAD.title, url: IRGED_ROAD.url, kind: 'image', views: ['irged'],
      purpose: () => tr('Замын вектор тайл — иргэдэд хүрэх үр өгөөжийн суурь.'),
    },
    {
      id: 'img:elev', title: tr('Өндрийн загвар'), url: ELEVATION_URL, kind: 'image', views: [], allMaps: true,
      purpose: () => tr('Газрын гадаргын өндрийн загвар — 3D горимын суурь.'),
    },
    ...MESH_VERSIONS.new.layers.map((l) => ({
      id: `mesh:${l.key}`, title: l.title, url: l.url, kind: '3d' as const, views: [], allMaps: true as const,
      purpose: () => tr('Нисгэгчгүй онгоцны нислэгээр бүтээсэн 3D бодит загвар (меш).'),
    })),
    ...SCENE.layers.map((l) => ({
      id: `mesh:${l.key}`, title: l.title, url: l.url, kind: '3d' as const, views: [], allMaps: true as const,
      purpose: () => tr('Нисгэгчгүй онгоцны нислэгээр бүтээсэн 3D бодит загвар (меш).'),
    })),
    ...IRGED_SCENE.layers.map((l) => ({
      id: `mesh:${l.key}`, title: l.title, url: l.url, kind: '3d' as const, views: ['irged' as ViewKey],
      purpose: () => tr('Иргэдэд хүрэх үр өгөөжийн «өмнө» байдлын 3D бодит загвар.'),
    })),
    ...BIM.layers.map((l) => ({
      id: l.key, title: l.title, url: l.url, kind: '3d' as const, views: [], allMaps: true as const,
      purpose: () => tr('Барилгын BIM загвар (3D хавтан) — багц, блокоор.'),
    })),
  ];
  return list.map((x) => {
    const p = parseUrl(x.url);
    return {
      id: x.id,
      name: x.title,
      service: p.service,
      layer: p.layer,
      url: x.url,
      kind: x.kind,
      group: 'img' as const,
      aliases: [],
      styleSrc: [],
      ...(x.id === 'img:elev' ? { env: 'NEXT_PUBLIC_ELEVATION_URL' } : {}),
      views: sortViews(x.views),
      ...(x.allMaps ? { allMaps: true as const } : {}),
      purpose: x.purpose,
      chain: () => x.id === 'img:elev' ? [
        S(tr('Esri-гийн нийтийн өндрийн үйлчилгээ (гадаад)')),
        S(tr('3D горимын гадаргуу')),
      ] : [
        S(tr('Нислэг / загварчлал → ArcGIS Enterprise-д нийтэлнэ')),
        S(x.kind === '3d' ? tr('3D үйлчилгээ') : tr('зургийн үйлчилгээ')),
        S(x.allMaps ? tr('Бүх газрын зураг') : tr('Газрын зураг')),
      ],
      editors: NONE,
    };
  });
}

/* ══════════════════ Нийт ══════════════════ */

let cache: CatEntry[] | null = null;

/** Бүх мөр — бүлгийн дарааллаар. ⚠️ Хэл ачаалахад тогтдог тул нэг удаа бүтээнэ. */
export function dataCatalog(): CatEntry[] {
  if (cache) return cache;
  const all = [
    ...bagtsEntries(),
    ...guitsEntries(),
    ...finEntries(),
    ...huvaariEntries(),
    ...chanarEntries(),
    ...otherEntries(),
    ...registryEntries(),
    ...imgEntries(),
  ];
  const order = CAT_GROUPS.map((g) => g.key);
  cache = all
    .map((e, i) => ({ e, i }))
    .sort((a, b) => order.indexOf(a.e.group) - order.indexOf(b.e.group) || a.i - b.i)
    .map((x) => x.e);
  return cache;
}

/** Хайлтад орох бүх текст — нэр, хаяг, id, зориулалт, шатлал */
export function searchText(e: CatEntry): string {
  const steps = e.chain().flatMap((s) => [s.label, ...(s.with ?? []).map((w) => w.label)]);
  return [
    e.name, e.service, e.layer ?? '', e.id, ...e.aliases, ...e.styleSrc, e.env ?? '',
    e.purpose(), ...steps, ...e.editors().map((x) => `${x.cap ?? ''} ${x.text}`),
  ].join(' ').toLowerCase();
}
