/**
 * НООРОГИЙН ХҮСНЭГТ (191) — ХУУРАМЧ ENTERPRISE ДАВХАРГА (2026-10-26, `draftRows.check.mjs`).
 *
 * ⚠️ АМЬД ArcGIS РУУ НЭГ Ч ХҮСЭЛТ ЯВАХГҮЙ: `draftRowsRemote.rowsTestHooks({ post, url })`-оор тээвэр бүрэн солигдоно.
 * ⚠️ ENTERPRISE-ИЙН ЗАН (CLAUDE.md) ЯГ: алдаа шидэгдэнэ (`arcgisPost`-ын HTTP 200 + `{error}` хувиргалт), мөр бүрийн `success`
 *    (200-тай), `rollbackOnFailure` НЭГ дуудлагад л, 2000 мөрийн хуудаслалт (`orderByFields` заавал), талбарын нэр Enterprise-ийн
 *    ЖИЖИГ үсгээр (кирилл ч — өөр/том үсэг → 500 «Field name does not exist»), `where`-д КИРИЛЛ багана → 500, `last_edited_date`
 *    серверийн цаг (мс), статистикийн асуулга (`groupByFieldsForStatistics`). Нэгдмэл индекс БАЙХГҮЙ (191-ийнх шиг).
 */
import { ROW_FIELDS } from './draftRows.ts';

const SYS = ['objectid', 'globalid', 'created_user', 'created_date', 'last_edited_user', 'last_edited_date', 'dkey', 'usr', 'pkg', 'at', 'payload'];

export function makeFake(url, opt = {}) {
  const fields = [...SYS, ...(opt.noColumns ? [] : opt.partial ? ROW_FIELDS.slice(0, 10) : ROW_FIELDS)];
  const fake = {
    url,
    rows: new Map(),
    oid: 1,
    edits: [],
    queries: [],
    /** Дараагийн N дахь applyEdits-ийг 200 + мөрийн `success:false`-аар унагана */
    failAfter: 0,
    /** Мета асуулгыг сүлжээний алдаагаар унагана */
    metaDown: false,
    clock: 1_800_000_000_000,
    fields,
    now() { this.clock += 7; return this.clock; },
    all() { return [...this.rows.values()]; },
    /** Шууд нэмэх (хуучин JSON мөр г.м.) */
    seed(a) { const oid = this.oid++; const t = this.now(); this.rows.set(oid, { ...a, objectid: oid, created_date: t, last_edited_date: t }); return oid; },
  };
  const fail = (msg, code = 500) => { const e = new Error(msg); e.code = code; throw e; };
  const isCyr = (s) => /[Ѐ-ӿ]/.test(s);
  const lit = (v) => (v.startsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : Number(v));

  function evalWhere(where) {
    if (isCyr(where.replace(/'(?:[^']|'')*'/g, "''"))) fail('Database error has occurred (кирилл багана where-д)');
    const parts = where.split(/\s+AND\s+/);
    const preds = parts.map((c0) => {
      const t = c0.trim();
      const c = t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t;
      let m;
      if ((m = /^(\w+) = ('(?:[^']|'')*'|-?\d+(?:\.\d+)?)$/.exec(c))) { const v = lit(m[2]); return (a) => a[m[1]] === v; }
      if ((m = /^(\w+) IN \((.*)\)$/.exec(c))) {
        const vs = m[2].match(/'(?:[^']|'')*'|-?\d+(?:\.\d+)?/g).map(lit);
        return (a) => vs.includes(a[m[1]]);
      }
      if ((m = /^(\w+) IS NULL$/.exec(c))) return (a) => a[m[1]] == null;
      if ((m = /^(\w+) >= timestamp '(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'$/.exec(c))) {
        const t = Date.parse(`${m[2].replace(' ', 'T')}Z`);
        return (a) => typeof a[m[1]] === 'number' && a[m[1]] >= t;
      }
      return fail(`where хэлбэр танигдсангүй: ${c}`, 400);
    });
    return (a) => preds.every((p) => p(a));
  }
  const checkField = (k) => { if (k !== k.toLowerCase() || Buffer.byteLength(k) > 63 || !fields.includes(k)) fail(`Field name '${k}' does not exist`); };

  async function post(u, params) {
    if (u === url) {
      if (fake.metaDown) fail('Failed to fetch', 0);
      return { name: 'GU_Selbe_Guitsetgel_Draft', type: 'Table', fields: fields.map((name) => ({ name })) };
    }
    if (u === `${url}/query`) {
      fake.queries.push(params.where);
      const pred = evalWhere(params.where);
      const sel = fake.all().filter(pred);
      if (params.outStatistics) {
        const st = JSON.parse(params.outStatistics);
        const g = params.groupByFieldsForStatistics;
        const groups = new Map();
        for (const a of sel) { const k = a[g]; const l = groups.get(k); if (l) l.push(a); else groups.set(k, [a]); }
        const feats = [];
        for (const [k, l] of groups) {
          const at = { [g]: k };
          for (const s of st) {
            checkField(s.onStatisticField);
            const vs = l.map((a) => a[s.onStatisticField]).filter((x) => typeof x === 'number');
            at[s.outStatisticFieldName] = s.statisticType === 'count' ? l.length : !vs.length ? null : s.statisticType === 'max' ? Math.max(...vs) : Math.min(...vs);
          }
          feats.push({ attributes: at });
        }
        return { features: feats };
      }
      if (params.orderByFields !== 'objectid ASC') fail('orderByFields алга — хуудаслалт давхардана');
      const fl = params.outFields.split(',');
      for (const f of fl) checkField(f);
      const all = sel.sort((x, y) => x.objectid - y.objectid);
      const off = Number(params.resultOffset ?? 0);
      const cnt = Math.min(2000, Number(params.resultRecordCount ?? 2000));
      const page = all.slice(off, off + cnt);
      return { features: page.map((a) => ({ attributes: Object.fromEntries(fl.map((f) => [f, a[f] ?? null])) })), ...(off + cnt < all.length ? { exceededTransferLimit: true } : {}) };
    }
    if (u === `${url}/applyEdits`) {
      const adds = params.adds ? JSON.parse(params.adds) : [];
      const ups = params.updates ? JSON.parse(params.updates) : [];
      const dels = params.deletes ? params.deletes.split(',').map(Number) : [];
      const n = adds.length + ups.length + dels.length;
      if (n > 500) fail(`нэг applyEdits-д ${n} засвар (> 500)`);
      const rollback = params.rollbackOnFailure === 'true';
      fake.edits.push({ rollback, adds, ups, dels });
      let forceFail = false;
      if (fake.failAfter > 0) { fake.failAfter -= 1; if (fake.failAfter === 0) forceFail = true; }
      const snap = new Map([...fake.rows].map(([o, a]) => [o, { ...a }]));
      const oid0 = fake.oid;
      const r = { addResults: [], updateResults: [], deleteResults: [] };
      let anyFail = false;
      for (const ad of adds) {
        for (const k of Object.keys(ad.attributes)) checkField(k);
        if (forceFail) { anyFail = true; r.addResults.push({ success: false, error: { code: 1000, description: 'Database error has occurred' } }); continue; }
        const oid = fake.oid++;
        const t = fake.now();
        fake.rows.set(oid, { ...ad.attributes, objectid: oid, created_date: t, last_edited_date: t });
        r.addResults.push({ success: true, objectId: oid });
      }
      for (const up of ups) {
        const { objectid, ...rest } = up.attributes;
        for (const k of Object.keys(rest)) checkField(k);
        const cur = fake.rows.get(objectid);
        if (!cur || forceFail) { anyFail = true; r.updateResults.push({ success: false, objectId: objectid, error: { code: 1019, description: 'not found' } }); continue; }
        fake.rows.set(objectid, { ...cur, ...rest, last_edited_date: fake.now() });
        r.updateResults.push({ success: true, objectId: objectid });
      }
      for (const oid of dels) {
        if (!fake.rows.has(oid)) { anyFail = true; r.deleteResults.push({ success: false, objectId: oid }); continue; }
        fake.rows.delete(oid);
        r.deleteResults.push({ success: true, objectId: oid });
      }
      if (anyFail && rollback) {
        fake.rows = snap;
        fake.oid = oid0;
        for (const l of [r.addResults, r.updateResults, r.deleteResults]) for (const x of l) x.success = false;
      }
      return r;
    }
    if (/\/query$/.test(u) && params.objectIds) {
      const ids = params.objectIds.split(',').map(Number);
      return { features: ids.filter((o) => opt.sheet?.has(o)).map((o) => ({ attributes: { objectid: o, ...opt.sheet.get(o) } })) };
    }
    return fail(`хүлээгээгүй хүсэлт: ${u}`);
  }
  fake.post = post;
  return fake;
}
