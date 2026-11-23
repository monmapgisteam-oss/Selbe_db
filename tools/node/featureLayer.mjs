/* `@arcgis/core/layers/FeatureLayer`-ийн REST орлуулагч (Node: tools/sync-all.mjs) — `draftRemote.layer()`-д хэрэглэгдэх хэсэг л */
const post = async (u, p) => {
  const j = await (await fetch(u, { method: 'POST', body: new URLSearchParams({ f: 'json', ...p }) })).json();
  if (j.error) { const e = new Error(`${j.error.code} ${j.error.message} ${JSON.stringify(j.error.details ?? '')}`); e.details = j.error; throw e; }
  return j;
};
const fieldsStr = (v) => (Array.isArray(v) ? v.join(',') : v ?? '*');
export default class FeatureLayer {
  constructor({ url }) { this.url = String(url).replace(/\/+$/, ''); this.loaded = false; }
  async load() { const i = await post(this.url, {}); this.fields = i.fields; this.objectIdField = i.objectIdField; this.loaded = true; return this; }
  async when() { return this.load(); }
  createQuery() { return { where: '1=1', outFields: ['*'], returnGeometry: false }; }
  async queryFeatures(q = {}) {
    const p = { where: q.where ?? '1=1', outFields: fieldsStr(q.outFields), returnGeometry: 'false' };
    if (q.orderByFields) p.orderByFields = fieldsStr(q.orderByFields);
    if (q.num != null) p.resultRecordCount = String(q.num);
    if (q.start != null) p.resultOffset = String(q.start);
    if (q.objectIds) p.objectIds = q.objectIds.join(',');
    const j = await post(`${this.url}/query`, p);
    return { features: (j.features ?? []).map((f) => ({ attributes: f.attributes })), exceededTransferLimit: !!j.exceededTransferLimit };
  }
  async queryFeatureCount(q = {}) { return (await post(`${this.url}/query`, { where: q.where ?? '1=1', returnCountOnly: 'true' })).count; }
  async queryObjectIds(q = {}) { return (await post(`${this.url}/query`, { where: q.where ?? '1=1', returnIdsOnly: 'true' })).objectIds ?? []; }
  async applyEdits(e = {}) {
    const att = (x) => ({ attributes: x.attributes ?? x });
    const p = {};
    if (e.addFeatures?.length) p.adds = JSON.stringify(e.addFeatures.map(att));
    if (e.updateFeatures?.length) p.updates = JSON.stringify(e.updateFeatures.map(att));
    if (e.deleteFeatures?.length) p.deletes = e.deleteFeatures.map((d) => (typeof d === 'number' ? d : d.objectId ?? d.attributes?.objectid)).join(',');
    const j = await post(`${this.url}/applyEdits`, p);
    const m = (l) => (l ?? []).map((r) => ({ objectId: r.success ? r.objectId : null, globalId: r.globalId ?? null, error: r.success ? null : (r.error ?? { message: 'failed' }) }));
    return { addFeatureResults: m(j.addResults), updateFeatureResults: m(j.updateResults), deleteFeatureResults: m(j.deleteResults) };
  }
}
