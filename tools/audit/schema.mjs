/**
 * СХЕМИЙН АУДИТ (2026-11-04): кодод нэрлэсэн талбар ↔ Enterprise-ийн амьд мета. Зөвхөн `?f=json` мета уншина.
 *   · missing   — кодод бий, үйлчилгээнд алга (уншилт хоосон · бичилт 500);
 *   · caseDiff  — зөвхөн том/жижиг үсгээр зөрнө (`attributes[нэр]` undefined болно);
 *   · typeDiff  — баримтжсан төрөлтэй зөрнө (`targets.EXPECT_TYPE`);
 *   · undeclared— үйлчилгээнд бий, кодод нэрлээгүй (тоо л, ихэнх нь `*`-аар уншигддаг);
 *   · root scan — бүртгэлгүй давхарга (warn), бүртгэлтэй атлаа үндэст алга (fail).
 */
import { arcgisPost } from '../../src/lib/query.ts';
import { ENT_HOSTED } from '../../src/lib/services.ts';
import { IGNORED_LAYERS, normLayerName } from '../../src/lib/agent/driftLib.ts';
import { PKGS, loadSchema } from '../../src/modules/sheet/bagts.pkg.ts';
import { EXPECT_TYPE, buildTargets } from './targets.mjs';

const CONCURRENCY = 6;
const TIMEOUT = 20000;
const shortType = (t) => String(t ?? '').replace(/^esriFieldType/, '');

/** Цэвэр тулгалт — `liveFields`: `{ name, type }[]`. `expect`: `{ талбар: төрөл | төрөл[] }` */
export function compareFields(want, liveFields, expect = {}) {
  const live = new Map(liveFields.map((f) => [String(f.name), shortType(f.type)]));
  const lower = new Map(liveFields.map((f) => [String(f.name).toLowerCase(), String(f.name)]));
  const missing = [];
  const caseDiff = [];
  for (const f of new Set(want)) {
    if (live.has(f)) continue;
    const alt = lower.get(String(f).toLowerCase());
    if (alt) caseDiff.push({ code: f, live: alt });
    else missing.push(f);
  }
  const typeDiff = [];
  for (const [f, t] of Object.entries(expect)) {
    if (!live.has(f)) continue;
    const ok = Array.isArray(t) ? t : [t];
    if (!ok.includes(live.get(f))) typeDiff.push({ field: f, expected: ok.join('|'), live: live.get(f) });
  }
  const wantSet = new Set(want);
  const undeclared = [...live.keys()].filter((f) => !wantSet.has(f));
  return { missing, caseDiff, typeDiff, undeclared };
}

const isNoPerm = (e) => e?.code === 403 || e?.code === 499
  || /does not have permissions|\b(403|499)\b|not authorized/i.test(e?.message ?? '');
const isGone = (e) => e?.code === 400 || e?.code === 404
  || /\b(400|404)\b|does not exist|not found|invalid url/i.test(e?.message ?? '');

async function metaOf(url) {
  const j = await arcgisPost(url, {}, { timeoutMs: TIMEOUT });
  if (j?.error) throw Object.assign(new Error(j.error.message ?? 'ArcGIS алдаа'), { code: j.error.code });
  return j;
}

async function pool(items, worker) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

const rootOf = (url) => /^(.*\/FeatureServer)\/\d+\/?$/.exec(url)?.[1] ?? null;

/**
 * ҮЙЛЧИЛГЭЭНИЙ КАТАЛОГ — токены эзэн метад эрхгүй ч хавтасны жагсаалтад үйлчилгээ харагддаг. «Эрхгүй» (403) нь «алга» гэсэн
 * үг БИШ: каталогт байвал оршин байгаа нь батлагдана. Хэлбэр: `Хавтас/нэр/Төрөл` — бүгд жижиг үсгээр.
 */
async function loadCatalog() {
  const out = new Set();
  const rest = ENT_HOSTED.replace(/\/Hosted\/?$/i, '');
  for (const base of [rest, ENT_HOSTED]) {
    const j = await metaOf(base);
    for (const s of j.services ?? []) out.add(`${s.name}/${s.type}`.toLowerCase());
  }
  return out;
}

/** Хаяг → каталогийн түлхүүр. Хавтасгүй/эс таарах бол `null` */
export function catalogKey(url, rest) {
  const clean = decodeURIComponent(String(url)).replace(/\/\d+\/?$/, '').replace(/\/+$/, '');
  if (!clean.startsWith(`${rest}/`)) return null;
  return clean.slice(rest.length + 1).toLowerCase();
}

let catalog = null;
const inCatalog = (url) => {
  const k = catalogKey(url, decodeURIComponent(ENT_HOSTED.replace(/\/Hosted\/?$/i, '')));
  return !!(catalog && k && catalog.has(k));
};

async function checkTarget(t) {
  const r = { id: t.id, group: t.group, url: t.url, kind: t.kind };
  let url = t.url;
  try {
    /* `material_noots` — хүснэгтийн дугаар үндсээс тодорно (`materialNoots.ts`-тэй ижил) */
    if (t.tableIdFromRoot) {
      const root = await metaOf(t.tableIdFromRoot);
      const id = root.tables?.[0]?.id ?? root.layers?.[0]?.id;
      if (id == null) return { ...r, status: 'fail', note: 'үйлчилгээнд хүснэгт алга' };
      url = `${t.tableIdFromRoot}/${id}`;
      r.url = url;
    }
    const meta = await metaOf(url);
    if (t.kind !== 'feature') return { ...r, status: 'ok' };
    if (!Array.isArray(meta.fields) || !meta.fields.length) return { ...r, status: 'fail', note: 'талбар ирсэнгүй' };
    const c = compareFields(t.fields, meta.fields, EXPECT_TYPE[t.id] ?? {});
    /* Код өөрөө сонголттой гэж зарласан талбар (`UZ_OPTIONAL`) — дэлгэц хоосон харуулна, алдаа биш */
    const soft = new Set(t.softFields ?? []);
    const optionalMissing = c.missing.filter((f) => soft.has(f));
    const missing = c.missing.filter((f) => !soft.has(f));
    return {
      ...r,
      status: missing.length ? 'fail' : optionalMissing.length || c.caseDiff.length || c.typeDiff.length ? 'warn' : 'ok',
      checked: t.fields.length,
      name: meta.name,
      ...c,
      missing,
      optionalMissing,
    };
  } catch (e) {
    if (isNoPerm(e)) {
      const seen = inCatalog(url);
      if (t.kind !== 'feature' && seen) return { ...r, status: 'ok', note: 'каталогт бий, мета уншихад токен эрхгүй' };
      if (seen) return { ...r, status: 'skip', note: 'каталогт бий, мета уншихад токен эрхгүй — талбар шалгагдсангүй' };
      if (t.optional) return { ...r, status: 'skip', note: 'сонголттой үйлчилгээ — нийтлэгдээгүй' };
      return { ...r, status: 'fail', note: 'каталогт алга — үйлчилгээ байхгүй эсвэл хаяг буруу' };
    }
    if (t.optional && isGone(e)) return { ...r, status: 'skip', note: 'сонголттой үйлчилгээ — нийтлэгдээгүй' };
    return { ...r, status: 'fail', note: `хүрэхгүй: ${e.message}` };
  }
}

/** Багцын хуудас: талбарын нэрс амьд метагаас тодордог тул шалгуур нь «ЗААВАЛ slot бүгд олдсон уу» */
async function checkPkg(p) {
  const r = { id: `sheet:${p.key}`, group: 'sheet', url: p.url, kind: 'feature' };
  try {
    const sc = await loadSchema(p, { fill: true });
    const slots = ['fillDate', 'gun', 'des', 'vol', 'unit', 'obyemSum', 'hunHuch', 'mashin', 'ham'];
    const nullSlots = slots.filter((k) => sc.f[k] == null);
    const issues = [];
    if (p.floors != null) {
      if (!sc.bld.length) issues.push('блок олдсонгүй');
      for (const k of ['obyem', 'gStart', 'gEnd', 'aStart', 'aEnd']) {
        const miss = sc.bld.filter((_, i) => sc[k][i] == null);
        if (miss.length) issues.push(`${k}: ${miss.join(', ')}`);
      }
    } else if (!sc.synthetic) issues.push('блокгүй хуудас синтетик болсонгүй');
    const meta = await metaOf(p.url);
    const types = new Map((meta.fields ?? []).map((f) => [f.name, shortType(f.type)]));
    const typeDiff = [];
    const chk = (f, want) => { if (f && types.has(f) && !want.includes(types.get(f))) typeDiff.push({ field: f, expected: want.join('|'), live: types.get(f) }); };
    chk(sc.f.fillDate, ['Date']);
    chk(sc.f.gun, ['SmallInteger', 'Integer']);
    chk(sc.f.ham, ['String']);
    return { ...r, status: issues.length ? 'fail' : nullSlots.length || typeDiff.length ? 'warn' : 'ok', blocks: sc.bld.length, nullSlots, issues, typeDiff };
  } catch (e) {
    return { ...r, status: isNoPerm(e) ? 'skip' : 'fail', note: e.message };
  }
}

/** Үндсэн скан — бүртгэлгүй давхарга (warn), бүртгэлтэй атлаа алга (fail) */
async function scanRoots(targets, titleSet) {
  const known = new Set(targets.map((t) => t.url));
  const roots = [...new Set(targets.map((t) => rootOf(t.url)).filter((u) => u && u.startsWith(`${ENT_HOSTED}/`)))];
  const out = [];
  await pool(roots, async (root) => {
    try {
      const m = await metaOf(root);
      const live = [...(m.layers ?? []), ...(m.tables ?? [])];
      const ids = new Set(live.map((x) => x.id));
      const absent = targets.filter((t) => rootOf(t.url) === root).filter((t) => {
        const n = Number(/\/(\d+)\/?$/.exec(t.url)?.[1]);
        return Number.isFinite(n) && !ids.has(n);
      }).map((t) => t.id);
      const extra = live
        .filter((x) => !known.has(`${root}/${x.id}`) && !titleSet.has(normLayerName(x.name)) && !IGNORED_LAYERS.has(normLayerName(x.name)))
        .map((x) => `${x.id}:${x.name}`);
      out.push({ root, status: absent.length ? 'fail' : extra.length ? 'warn' : 'ok', total: live.length, absent, extra });
    } catch (e) {
      out.push({ root, status: isNoPerm(e) ? 'skip' : 'fail', note: e.message, total: 0, absent: [], extra: [] });
    }
  });
  return out.sort((a, b) => a.root.localeCompare(b.root));
}

export async function runSchema({ log = () => {} } = {}) {
  const base = buildTargets();
  catalog = await loadCatalog().catch((e) => { log(`  ⚠️ каталог уншигдсангүй: ${e?.message ?? e}`); return null; });
  const results = [];
  await pool(base, async (t) => {
    results.push(await checkTarget(t));
    if (results.length % 50 === 0) log(`  … схем ${results.length}/${base.length}`);
  });
  const sheets = [];
  await pool(PKGS, async (p) => { sheets.push(await checkPkg(p)); });
  const { LAYER_BY_ID } = await import('../../src/lib/services.ts');
  const titles = new Set(Object.values(LAYER_BY_ID).map((l) => normLayerName(l.title)));
  const roots = await scanRoots([...base, ...PKGS.map((p) => ({ id: `sheet:${p.key}`, url: p.url }))], titles);
  const byId = (a, b) => a.id.localeCompare(b.id);
  return { targets: results.sort(byId), sheets: sheets.sort(byId), roots };
}
