import { t as tr } from '@/lib/i18nCore';
import { ENT_PORTAL, entSession, entUploadPdf } from '@/lib/entDocs';
import type { Verdict } from '@/lib/ma';

/**
 * FIC · М-АКТ — Чанарын 3 ба 4-р шат (2026-10-09). Хэрэглэгчийн шийдвэр (`memory/chanar-redesign`):
 *   · FIC (ажлын явцын үзлэг) ба М-акт (ажил дууссаныг шалгах эцсийн акт) — PDF ХАВСАРГАЖ порталд БАТЛАНА.
 *   · PDF бүр Enterprise геопорталд ТУСДАА item (`entUploadPdf`, байгууллагад хуваалцсан) — feature service-ийн
 *     хавсралт БИШ (хэрэглэгч «attach-аар оруулах нь огт таалагдахгүй»).
 *   · Хатуу дараалал: MIR батлагдаагүй бол FIC-гүй, FIC батлагдаагүй бол М-акт-гүй (`chainOf`); 4 шат = IPC.
 *
 * ХАДГАЛАЛТ: Enterprise hosted хүснэгт `Selbe_Chanar_FIC_MAKT` (мөр бүр = нэг баримт: төрөл · MA дугаар ·
 * PDF item id · төлөв · батлагч). Анх хэрэгтэй үед зохиогч үүсгэнэ (`tableUrl(true)`), байгууллагад хуваалцана.
 * ⚠️ Нэр байгууллагад аль хэдийн эзлэгдсэн бол ҮҮСГЭХГҮЙ (`isServiceNameAvailable`) — давхар хүснэгт баримтыг хуваана
 *    (`chanarStore`-ын 2026-10-04 сургамж).
 * ⚠️ Бүх хандалт Enterprise токентой (`entSession`) — хүснэгт байгууллагад л нээлттэй; токен POST биеэр.
 * ⚠️ ArcGIS алдаа HTTP 200-аар `{error}`; `applyEdits`-ийн мөр бүрийн `success`-ийг шалгана.
 * ⚠️ Өөрийн оруулсан баримтыг өөрөө батлахгүй (`decideFm`).
 */
export const FM_TITLE = 'Selbe_Chanar_FIC_MAKT';
const TABLE_NAME = 'fic_makt';

export type FmKind = 'FIC' | 'MAKT';
export type FmStatus = 'pending' | Verdict;
export type FmRow = {
  oid: number;
  kind: FmKind;
  maNo: string;
  docNo: string;
  docDate: number | null;
  pdfItem: string;
  pdfName: string;
  status: FmStatus;
  reason: string;
  uploadedBy: string;
  uploadedAt: number | null;
  decidedBy: string;
  decidedAt: number | null;
};

const F = {
  kind: 'kind', maNo: 'ma_no', docNo: 'doc_no', docDate: 'doc_date', pdfItem: 'pdf_item', pdfName: 'pdf_name',
  status: 'status', reason: 'reason', uploadedBy: 'uploaded_by', uploadedAt: 'uploaded_at', decidedBy: 'decided_by', decidedAt: 'decided_at',
} as const;
export const FM_REASON_MAX = 2000;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function fmRowOf(a: Record<string, unknown>): FmRow {
  const k = str(a[F.kind]).toUpperCase();
  const s = str(a[F.status]);
  return {
    oid: Number(a.OBJECTID ?? a.objectid),
    kind: k === 'MAKT' ? 'MAKT' : 'FIC',
    maNo: str(a[F.maNo]),
    docNo: str(a[F.docNo]),
    docDate: num(a[F.docDate]),
    pdfItem: str(a[F.pdfItem]),
    pdfName: str(a[F.pdfName]),
    status: s === 'A' || s === 'AN' || s === 'R' ? s : 'pending',
    reason: str(a[F.reason]),
    uploadedBy: str(a[F.uploadedBy]),
    uploadedAt: num(a[F.uploadedAt]),
    decidedBy: str(a[F.decidedBy]),
    decidedAt: num(a[F.decidedAt]),
  };
}

/**
 * MA-гийн FIC эсвэл М-акт шат (`chainOf` оролт):
 *   · баримт алга → `undefined` (хүлээгдэж буй); аль нэг A/AN → 'A';
 *   · батлагдсан алга, шийдвэр хүлээж буй байгаа → `null`; бүгд R → 'R'.
 * ⚠️ Явцын үзлэг (FIC) олон удаа байж болно — НЭГ батлагдсан нь шатыг нээнэ.
 */
export function fmVerdictFor(rows: readonly FmRow[] | undefined): Verdict | null | undefined {
  if (!rows?.length) return undefined;
  if (rows.some((r) => r.status === 'A' || r.status === 'AN')) return 'A';
  if (rows.some((r) => r.status === 'pending')) return null;
  return 'R';
}

/** MA дугаар → {FIC, MAKT} баримтууд (сүүлийнх эхэнд) */
export function fmByMa(rows: readonly FmRow[]): Map<string, { FIC: FmRow[]; MAKT: FmRow[] }> {
  const m = new Map<string, { FIC: FmRow[]; MAKT: FmRow[] }>();
  for (const r of rows) {
    if (!r.maNo) continue;
    let e = m.get(r.maNo);
    if (!e) { e = { FIC: [], MAKT: [] }; m.set(r.maNo, e); }
    e[r.kind].push(r);
  }
  for (const e of m.values()) { e.FIC.sort((a, b) => b.oid - a.oid); e.MAKT.sort((a, b) => b.oid - a.oid); }
  return m;
}

/* ═══════════════ REST ═══════════════ */

type ArcErr = { error?: { code?: number; message?: string; details?: string[] } };
const rest = () => `${ENT_PORTAL}/sharing/rest`;

function sess() {
  const s = entSession();
  if (!s) throw new Error(tr('Enterprise-д нэвтрээгүй эсвэл сешн дууссан — дахин нэвтэрнэ үү.'));
  return s;
}
async function post<T>(url: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ f: 'json', ...params, token: sess().token });
  let r: Response;
  try { r = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(120_000) }); } catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new Error(tr('Enterprise хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.'));
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  let j: T & ArcErr;
  try { j = await r.json(); } catch { throw new Error(tr('Enterprise JSON биш хариу буцаав.')); }
  if (j?.error) throw new Error(`${j.error.message || tr('Enterprise алдаа')}${j.error.details?.length ? ` — ${j.error.details.join(' · ')}` : ''}`);
  return j;
}

let urlCache: string | null = null;

async function findTable(): Promise<string | null> {
  const j = await post<{ results?: { title?: string; url?: string; type?: string }[] }>(`${rest()}/search`, {
    q: `title:"${FM_TITLE}" AND type:"Feature Service"`, num: '20',
  });
  const hit = (j.results ?? []).find((x) => x.title === FM_TITLE && x.url);
  return hit?.url ? `${hit.url.replace(/\/+$/, '')}/0` : null;
}

async function createTable(): Promise<string> {
  const user = sess().user;
  const avail = await post<{ available?: boolean }>(`${rest()}/portals/self/isServiceNameAvailable`, { name: FM_TITLE, type: 'Feature Service' });
  if (avail.available !== true) throw new Error(tr('«{0}» хүснэгт байгууллагад бий боловч танд харагдахгүй байна — эзэмшигч нь байгууллагад хуваалцах ёстой.', FM_TITLE));
  const created = await post<{ encodedServiceURL?: string; serviceurl?: string; itemId?: string }>(
    `${rest()}/content/users/${encodeURIComponent(user)}/createService`, {
      outputType: 'featureService',
      createParameters: JSON.stringify({
        name: FM_TITLE, serviceDescription: 'Сэлбэ — чанарын FIC · М-акт баримт (PDF item холбоос)', hasStaticData: false,
        maxRecordCount: 2000, capabilities: 'Query,Editing,Create,Update,Delete', allowGeometryUpdates: false, units: 'esriMeters',
        spatialReference: { wkid: 102100 },
      }),
    });
  const svc = (created.encodedServiceURL || created.serviceurl || '').replace(/\/+$/, '');
  if (!svc || !created.itemId) throw new Error(tr('FIC · М-актын хүснэгт үүссэнгүй.'));
  const s = (name: string, length: number, nullable = true) => ({ name, type: 'esriFieldTypeString', length, nullable, editable: true });
  const d = (name: string) => ({ name, type: 'esriFieldTypeDate', nullable: true, editable: true });
  await post(`${svc.replace('/rest/services/', '/rest/admin/services/')}/addToDefinition`, {
    addToDefinition: JSON.stringify({
      tables: [{
        name: TABLE_NAME, type: 'Table', objectIdField: 'OBJECTID', hasAttachments: false,
        fields: [
          { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
          s(F.kind, 8, false), s(F.maNo, 40, false), s(F.docNo, 60), d(F.docDate), s(F.pdfItem, 64, false), s(F.pdfName, 255),
          s(F.status, 8, false), s(F.reason, FM_REASON_MAX), s(F.uploadedBy, 128), d(F.uploadedAt), s(F.decidedBy, 128), d(F.decidedAt),
        ],
      }],
    }),
  });
  await post(`${rest()}/content/users/${encodeURIComponent(user)}/items/${created.itemId}/share`, { org: 'true', everyone: 'false', groups: '' });
  return `${svc}/0`;
}

/** Хүснэгтийн хаяг — олдохгүй бол `canCreate` үед үүсгэнэ, эс бөгөөс `null` */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (urlCache) return urlCache;
  const found = await findTable();
  urlCache = found ?? (canCreate ? await createTable() : null);
  return urlCache;
}

/** Бүх FIC · М-акт. Хүснэгт хараахан үүсээгүй бол хоосон. Enterprise нэвтрэлт шаардана. */
export async function loadFm(): Promise<FmRow[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  const j = await post<{ features?: { attributes: Record<string, unknown> }[] }>(`${url}/query`, {
    where: '1=1', outFields: '*', orderByFields: 'OBJECTID DESC', resultRecordCount: '2000',
  });
  return (j.features ?? []).map((f) => fmRowOf(f.attributes));
}

/**
 * PDF оруулж баримт нэмнэ: 1) PDF → Enterprise item (байгууллагад хуваалцсан) 2) хүснэгтэд мөр (төлөв pending).
 * ⚠️ 2-р алхам унавал item үүссэн хэвээр — алдааны мессежид item-ийн ID-г хэлнэ (дахин оруулбал давхардана).
 */
export async function addFm(a: { kind: FmKind; maNo: string; docNo: string; docDate: string; file: File }): Promise<{ warn?: string }> {
  const s = sess();
  if (!a.maNo) throw new Error(tr('MA дугааргүй — баримт холбох боломжгүй.'));
  const url = await tableUrl(true);
  if (!url) throw new Error(tr('FIC · М-актын хүснэгт олдсонгүй.'));
  const title = `${a.kind === 'FIC' ? 'FIC' : 'М-акт'} · ${a.docNo || a.file.name.replace(/\.pdf$/i, '')} · ${a.maNo}`;
  const { item, warn } = await entUploadPdf(a.file, title);
  const dd = /^\d{4}-\d{2}-\d{2}$/.test(a.docDate) ? Date.parse(`${a.docDate}T00:00:00Z`) : null;
  try {
    const j = await post<{ addResults?: { success?: boolean; error?: { description?: string } }[] }>(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: {
        [F.kind]: a.kind, [F.maNo]: a.maNo, [F.docNo]: a.docNo.slice(0, 60) || null, [F.docDate]: dd,
        [F.pdfItem]: item.id, [F.pdfName]: a.file.name.slice(0, 255), [F.status]: 'pending',
        [F.uploadedBy]: s.user, [F.uploadedAt]: Date.now(),
      } }]),
    });
    const r = j.addResults?.[0];
    if (!r?.success) throw new Error(r?.error?.description || tr('Мөр нэмэгдсэнгүй.'));
  } catch (e) {
    throw new Error(tr('PDF item ({0}) үүссэн боловч бүртгэл нэмэгдсэнгүй: {1}. Дахин оруулахаас өмнө геопорталаас item-ийг устгана уу.', item.id, (e as Error).message));
  }
  return { warn };
}

/** Батлах / буцаах. ⚠️ Өөрийн оруулсныг батлахгүй; R бол шалтгаан заавал. */
export async function decideFm(row: FmRow, verdict: Verdict, reason: string): Promise<void> {
  const s = sess();
  if (row.uploadedBy && row.uploadedBy.toLowerCase() === s.user.toLowerCase()) throw new Error(tr('Өөрийн оруулсан баримтыг өөрөө батлах боломжгүй.'));
  if (verdict === 'R' && !reason.trim()) throw new Error(tr('Буцаах шалтгаанаа бичнэ үү.'));
  const url = await tableUrl(false);
  if (!url) throw new Error(tr('FIC · М-актын хүснэгт олдсонгүй.'));
  const j = await post<{ updateResults?: { success?: boolean; error?: { description?: string } }[] }>(`${url}/applyEdits`, {
    updates: JSON.stringify([{ attributes: {
      OBJECTID: row.oid, [F.status]: verdict, [F.reason]: reason.trim().slice(0, FM_REASON_MAX) || null,
      [F.decidedBy]: s.user, [F.decidedAt]: Date.now(),
    } }]),
  });
  const r = j.updateResults?.[0];
  if (!r?.success) throw new Error(r?.error?.description || tr('Шийдвэр хадгалагдсангүй.'));
}
