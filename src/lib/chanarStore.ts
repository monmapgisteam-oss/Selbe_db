'use client';

/**
 * ЧАНАРЫН БАРИМТЫН ХАДГАЛАЛТ — ArcGIS хүснэгт `Selbe_Chanar_Barimt`.
 * Цэвэр урсгалын логик нь `chanarMs.ts`-д; энд ЗӨВХӨН унших, бичих.
 *
 * ⚠️ НЭГ ХҮСНЭГТ, ДОЛООН ТӨРӨЛ (`kind`: MS · MA · MIR · FIC · NCR · QMP · PRC). Зураглалын
 *    таван процесс бие биетэйгээ холбогддог (MA нь MS-ийг иш татна, FIC нь
 *    NCR үүсгэнэ) тул нэг хүснэгтэд байвал холбоос нь `OBJECTID` — өөр
 *    хүснэгт хооронд SQL-ээр нэгтгэх боломжгүй (`hyanalt.ts`-ийн сургамж).
 *    Одоогоор ЗӨВХӨН MS хэрэгжсэн; бусад нь ижил хүснэгтэд, ижил `docNo`
 *    хэвээр нэмэгдэнэ.
 *
 * ⚠️ `huvaariBatlah.ts`-ИЙН ЗАГВАР: хүснэгтийг эхний хэрэгцээнд super
 *    админы токеноор ӨӨРӨӨ үүсгэнэ; эзнийг шалгана; `null` URL кэшлэхгүй;
 *    ArcGIS-ийн HTTP-200 алдааг биеэр нь барина. Тэр файлын ⚠️-үүд энд
 *    бүгд хүчинтэй — давтахгүй.
 *
 * ⚠️ ХЯНАГЧДЫН БҮРТГЭЛ (`reviews`) нь JSON — гурван хянагч × (хэн·хэзээ·
 *    шийдвэр·санал) 12 талбар болох тул баганаар задлахгүй. Гэхдээ `status`,
 *    `author`, `bagts`, `seq`, `rev` нь ТУСДАА БАГАНА — жагсаалт, шүүлт,
 *    «миний хянах» асуулга SQL-ээр явна.
 *
 * ⚠️ ХАВСРАЛТ (`addAttachment`) — маягтын 7-р хэсэг (гэрчилгээ, лаборатори,
 *    фото). ArcGIS-ийн attachment нь мөр бүрд, 267МБ хүртэлх PDF ч багтана
 *    (жишээ материалын хамгийн том нь). `hasAttachments: true`-г үүсгэхдээ
 *    асаана — дараа нь асаах нь admin REST шаарддаг.
 *
 * ⚠️ FAIL-CLOSED: хүснэгт уншигдахгүй бол «батлагдсан» гэж ҮЗЭХГҮЙ.
 */

import { AUTH, ROLE_BY_USER } from './services';
import { t as tr } from '@/lib/i18nCore';
import {
  MS_STATUS, ALL_REVIEWERS, REVIEWERS_OF, isMsStatus, isKind, isVerdict, emptyReviews, docNo, nextSeq, orgCode,
  repNo, repSeqFor, repFrom, parseBodyOf, normalizeNcr, normalizeInsp, normalizeMa, normalizeMeta, normalizeBounce,
  parseCommon, ncrClosure, nextRevisionBody, applyRepToMaterials,
  review as reviewPure, submit as submitPure, submitCorrection as correctionPure, reopen as reopenPure,
  bounce as bouncePure, ackRep as ackPure, closeAn as closeAnPure, newRevision as newRevisionPure, closeNcr as closeNcrPure,
  type MsDoc, type MsBody, type Reviewer, type Review, type Reviews, type Rep, type Verdict, type VerdictCode,
  type DocKind, type AnyBody, type NcrCorrection, type InspBody, type InspCheck, type Meta, type Bounce, type BounceReason,
  type NcrCloser, type NcrClosure, type NcrClosureDocType, type NcrClosureResult, type NcrProposed, EMPTY_BODY,
  type MaBody, type NcrBody, EMPTY_COMMON, DISCIPLINES, isInspCheck,
} from './chanarMs';
import { isAuthorFor, reviewerRolesFor } from './chanarAcl';
import { tokenParam, authToken } from '@/lib/authToken';
import { currentUser, requireCap } from './who';
import type { CapKey } from './caps';

const TITLE = 'Selbe_Chanar_Barimt';
const TABLE_NAME = 'chanar_barimt';

/** Баримтын төрөл — `chanarMs.KINDS` (2026-09-28: тавуулаа хэрэгжсэн) */
export type { DocKind };

/** Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно (латин, ArcGIS-д аюулгүй) */
export const F = {
  oid: 'OBJECTID',
  kind: 'turul',
  docNo: 'dugaar',
  org: 'org',
  bagts: 'bagts',
  seq: 'seq',
  rev: 'rev',
  title: 'ner',
  status: 'toloh',
  author: 'zohiogch',
  sentAt: 'ilgeesen_ognoo',
  reviews: 'hyanalt',
  decidedAt: 'shiidver_ognoo',
  body: 'aguulga',
} as const;

/* ══════════════════════ ArcGIS давхарга ══════════════════════ */

async function getToken(): Promise<{ token: string; user: string } | null> {
  try {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    const cred = esriId.findCredential(`${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`);
    if (!cred?.token) return null;
    return { token: cred.token, user: (cred.userId as string) ?? '' };
  } catch {
    return null;
  }
}

/** ⚠️ ArcGIS алдаагаа HTTP 200 + `{error}` биеэр буцаадаг — заавал шалгана */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  /* ⚠️ Хүснэгт Organization-only — нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ (2026-09-17). */
  const body = new URLSearchParams({ f: 'json', ...tokenParam(), ...params });
  const r = await fetch(url, { method: 'POST', body });
  if (!r.ok) throw new Error(`ArcGIS HTTP ${r.status}`);
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);
/** Хуучин эзэд — `huvaariBatlah.FORMER_TABLE_OWNERS`-ийн ижил шалтгаан */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([...SUPER_OWNERS, ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase())]);

let tableUrlCache: string | undefined;
let ownerMismatch = false;

async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  if (String(hit?.access ?? '') === 'public') {
    console.error(`[selbe] ${TITLE} хүснэгт НИЙТЭД нээлттэй — AGOL дээр Share-ийг «Organization» болгоно уу.`);
  }
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(`[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй:`, same.map((x) => x.owner).join(', '));
  }
  return hit?.url ? `${hit.url}/0` : null;
}

async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын чанарын баримт — MS · MA · MIR · FIC · NCR'),
    hasStaticData: false,
    maxRecordCount: 10000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await req(
    `${restBase()}/content/users/${encodeURIComponent(user)}/createService`,
    { token, createParameters: JSON.stringify(createParameters), outputType: 'featureService' },
  );
  const serviceUrl = created.encodedServiceURL as string | undefined;
  const itemId = created.itemId as string | undefined;
  if (!serviceUrl || !itemId) return null;

  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const str = (name: string, length: number, nullable = true) =>
    ({ name, type: 'esriFieldTypeString', length, nullable, editable: true });
  const table = {
    tables: [{
      name: TABLE_NAME,
      type: 'Table',
      objectIdField: 'OBJECTID',
      /* ⚠️ Хавсралт — маягтын гэрчилгээ, лаборатори, фото. ҮҮСГЭХДЭЭ асаана. */
      hasAttachments: true,
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
        str(F.kind, 8, false),
        str(F.docNo, 64, false),
        str(F.org, 16),
        str(F.bagts, 128, false),
        { name: F.seq, type: 'esriFieldTypeInteger', nullable: false, editable: true },
        { name: F.rev, type: 'esriFieldTypeInteger', nullable: false, editable: true },
        str(F.title, 512),
        str(F.status, 32, false),
        str(F.author, 256),
        { name: F.sentAt, type: 'esriFieldTypeDate', nullable: true, editable: true },
        str(F.reviews, 8000),
        { name: F.decidedAt, type: 'esriFieldTypeDate', nullable: true, editable: true },
        str(F.body, 1048576),
      ],
    }],
  };
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  await req(
    `${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`,
    { token, org: 'true', everyone: 'false' },
  );
  return `${serviceUrl}/0`;
}

async function tableUrl(canCreate: boolean): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  if (!url && canCreate && !ownerMismatch && TABLE_OWNERS.has(auth.user.toLowerCase())) {
    url = await createTable(auth.token, auth.user);
  }
  if (url) tableUrlCache = url;
  return url;
}

export type TableState = {
  ok: boolean;
  /** auth · owner · none · error — `huvaariBatlah.PlanTableState`-тэй ижил утга */
  why: 'ok' | 'auth' | 'owner' | 'none' | 'error';
  detail?: string;
};

export async function chanarTableState(canCreate = false): Promise<TableState> {
  try {
    if (!(await getToken())) return { ok: false, why: 'auth' };
    const url = await tableUrl(canCreate);
    if (url) return { ok: true, why: 'ok' };
    return { ok: false, why: ownerMismatch ? 'owner' : 'none' };
  } catch (e) {
    return { ok: false, why: 'error', detail: String((e as Error)?.message ?? e) };
  }
}

/* ══════════════════════ Хавсралт ══════════════════════ */

export type Attachment = { id: number; name: string; size: number; url: string };

/**
 * Мөрийн хавсралтууд — маягтын 7-р хэсэг (гэрчилгээ · лаборатори · фото).
 * ⚠️ `ags.ts`-ийн туслахууд ТОГТМОЛ `base`-д уягдсан тул энд өөрийн fetch.
 */
export async function listAttachments(oid: number): Promise<Attachment[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  const j = await req(`${url}/${Number(oid)}/attachments`, {});
  const infos = (j.attachmentInfos as { id: number; name: string; size: number }[]) ?? [];
  /* ⚠️ ТОКЕН ХОЛБООСОНД (2026-09-16 аудит): хүснэгт зөвхөн байгууллагад
     нээлттэй тул токенгүй `<a href>` шинэ табд нэвтрэлт шаардаж эсвэл хоосон
     буцаадаг. `habeaUzleg`-ийн ижил шийдэл — хэрэглэгчийн ӨӨРИЙН богино
     хугацаат токен; хугацаа нь дуусахаар холбоос хүчингүй болно. */
  const tok = await getToken();
  const q = tok ? `?token=${encodeURIComponent(tok.token)}` : '';
  return infos.map((a) => ({
    id: a.id, name: a.name, size: a.size, url: `${url}/${Number(oid)}/attachments/${a.id}${q}`,
  }));
}

export async function addAttachment(oid: number, file: File): Promise<{ ok: boolean; error?: string }> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const deny = await attachDeny(oid);
  if (deny) return { ok: false, error: deny };
  try {
    const fd = new FormData();
    fd.append('f', 'json');
    const tok = authToken();
    if (tok) fd.append('token', tok); // ⚠️ org-only хүснэгт (2026-09-17)
    fd.append('attachment', file, file.name);
    const r = await fetch(`${url}/${Number(oid)}/addAttachment`, { method: 'POST', body: fd });
    if (!r.ok) return { ok: false, error: `ArcGIS HTTP ${r.status}` };
    const j = (await r.json()) as { error?: { message?: string }; addAttachmentResult?: { success?: boolean } };
    if (j.error) return { ok: false, error: j.error.message || 'ArcGIS error' };
    return j.addAttachmentResult?.success ? { ok: true } : { ok: false, error: tr('Хавсралт хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

export async function deleteAttachment(oid: number, id: number): Promise<boolean> {
  const url = await tableUrl(false);
  if (!url) return false;
  if (await attachDeny(oid)) return false;
  try {
    const j = await req(`${url}/${Number(oid)}/deleteAttachments`, { attachmentIds: String(id) });
    const rs = (j.deleteAttachmentResults as { success?: boolean }[]) ?? [];
    return rs.length > 0 && rs.every((x) => x.success === true);
  } catch {
    return false;
  }
}

/* ══════════════════════ Мөр ↔ баримт ══════════════════════ */

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

/**
 * Хянагчдын JSON → бүтэц. Эвдэрсэн бол ХООСОН (fail-closed: «хянасан» гэж
 * үзэхгүй). Танигдахгүй хянагч, танигдахгүй шийдвэрийг хаяна.
 */
export function parseReviews(raw: unknown): Reviews {
  const out = emptyReviews();
  try {
    const j = JSON.parse(String(raw ?? '{}')) as Record<string, Partial<Review>>;
    if (!j || typeof j !== 'object') return out;
    /* ⚠️ 2026-09-28: дөрвөн үүрэг (tug нэмэгдсэн), гурван шийдвэр (AN нэмэгдсэн);
       хуучин 2 утга хэвээр уншигдана.
       ⚠️ 2026-09-25: ТҮЛХҮҮР ОГТ БАЙХГҮЙ (хуучин мөр, тэр үүрэг урсгалд ороогүй үед
       илгээгдсэн) → `undefined`; байгаа ч шийдвэргүй → `null`. `requiredReviewers`
       дараалсан төрөлд `undefined`-ийг шаардахгүй (шийдвэргүй хуучин MA cheng хүлээхгүй). */
    for (const r of ALL_REVIEWERS) {
      if (!Object.hasOwn(j, r)) { out[r] = undefined; continue; }
      const v = j[r];
      if (!v || typeof v !== 'object') continue;
      const who = s(v.who)?.toLowerCase();
      const at = n(v.at);
      if (!who || !at || !isVerdict(v.verdict)) continue;
      const rec: Review = { who, at, verdict: v.verdict as Verdict, note: s(v.note) };
      const per = perMaterialOf(v.perMaterial);
      if (per) rec.perMaterial = per;
      const dl = n(v.anDeadline);
      if (dl) rec.anDeadline = dl;
      out[r] = rec;
    }
  } catch { /* эвдэрсэн → хоосон */ }
  return out;
}

const perMaterialOf = (pm: unknown): Record<string, VerdictCode> | null => {
  if (!pm || typeof pm !== 'object') return null;
  const per: Record<string, VerdictCode> = {};
  for (const [k, c] of Object.entries(pm as Record<string, unknown>)) {
    if (c === 'A' || c === 'AN' || c === 'R') per[k] = c;
  }
  return Object.keys(per).length ? per : null;
};

/** `hyanalt` JSON-ийн `rep` түлхүүр — захиалагчийн хариу. Эвдэрсэн/байхгүй → null */
export function parseRep(raw: unknown): Rep | null {
  try {
    const j = JSON.parse(String(raw ?? '{}')) as { rep?: Partial<Rep> };
    const r = j?.rep;
    if (!r || typeof r !== 'object') return null;
    const no = s(r.no); const at = n(r.at);
    const verdict = r.verdict === 'A' || r.verdict === 'AN' || r.verdict === 'R' ? r.verdict : null;
    if (!no || !at || !verdict) return null;
    const out: Rep = { no, at, verdict };
    const an = s(r.anText);
    if (an) out.anText = an;
    if (Array.isArray(r.rReasons)) {
      const rr = r.rReasons.filter((x): x is string => typeof x === 'string' && !!x.trim());
      if (rr.length) out.rReasons = rr;
    }
    const per = perMaterialOf(r.perMaterial);
    if (per) out.perMaterial = per;
    /* 2026-09-28 (2-р үе шат): боловсруулсан · AN хугацаа · хүлээн авсан · AN хаалт */
    const pb = s(r.preparedBy); if (pb) out.preparedBy = pb.toLowerCase();
    const dl = n(r.anDeadline); if (dl) out.anDeadline = dl;
    const ra = n(r.receivedAt); if (ra) { out.receivedAt = ra; out.receivedBy = (s(r.receivedBy) ?? '').toLowerCase(); }
    const ca = n(r.anClosedAt); if (ca) { out.anClosedAt = ca; out.anClosedBy = (s(r.anClosedBy) ?? '').toLowerCase(); }
    return out;
  } catch { return null; }
}

/** `hyanalt` JSON-ийн `bounce` түлхүүр — «хянахгүй буцаасан» тэмдэг (2026-09-28) */
export function parseBounce(raw: unknown): Bounce | null {
  try {
    const j = JSON.parse(String(raw ?? '{}')) as { bounce?: unknown };
    return normalizeBounce(j?.bounce);
  } catch { return null; }
}

/** `hyanalt` баганын урт — `createTable`-ийн `str(F.reviews, 8000)`-той ижил */
const HYANALT_MAX = 8000;

/** `hyanalt` баганы JSON — хянагчид + хариу + буцаалтын тэмдэг нэг дор */
const reviewsJson = (reviews: Reviews, rep: Rep | null, bounce: Bounce | null = null): string => {
  const json = JSON.stringify({ ...reviews, ...(rep ? { rep } : {}), ...(bounce ? { bounce } : {}) });
  if (json.length <= HYANALT_MAX || !rep) return json;
  /* ⚠️ 2026-09-25: `hyanalt` 8000 тэмдэгт — `chanarMs.NOTE_MAX`/`REP_NOTE_MAX` хязгаараар
     хэвийн үед багтана; сүүлийн хамгаалалт: хариун дахь саналын ХУВИЛБАРЫГ (anText ·
     rReasons — бүтэн текст `reviews[r].note`-д хэвээр) хаяж, бичилтийг унагахгүй. */
  const { anText: _a, rReasons: _r, ...slim } = rep;
  void _a; void _r;
  return JSON.stringify({ ...reviews, rep: slim, ...(bounce ? { bounce } : {}) });
};

function toDoc(a: Attrs): MsDoc | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const st = s(a[F.status]);
  if (!isMsStatus(st)) return null;
  const bagts = s(a[F.bagts]);
  const seq = Number(a[F.seq]);
  const rev = Number(a[F.rev]);
  if (!bagts || !Number.isInteger(seq) || !Number.isInteger(rev)) return null;
  const kind = s(a[F.kind]);
  return {
    oid,
    kind: isKind(kind) ? kind : 'MS',
    docNo: s(a[F.docNo]) ?? '',
    org: s(a[F.org]) ?? '',
    bagts,
    seq,
    rev,
    title: s(a[F.title]) ?? '',
    status: st,
    author: (s(a[F.author]) ?? '').toLowerCase(),
    sentAt: n(a[F.sentAt]),
    reviews: parseReviews(a[F.reviews]),
    decidedAt: n(a[F.decidedAt]),
    rep: parseRep(a[F.reviews]),
    bounce: parseBounce(a[F.reviews]),
  };
}

export function parseBody(raw: unknown): MsBody {
  try {
    const j = JSON.parse(String(raw ?? '{}')) as Partial<MsBody>;
    if (!j || typeof j !== 'object') return { ...EMPTY_BODY };
    const g = (k: keyof MsBody) => (typeof j[k] === 'string' ? j[k] : '');
    return {
      general: g('general'), scope: g('scope'), materials: g('materials'),
      sequence: g('sequence'), quality: g('quality'), safety: g('safety'),
    };
  } catch {
    return { ...EMPTY_BODY };
  }
}

async function query(where: string, outFields: string): Promise<Attrs[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  const out: Attrs[] = [];
  for (let off = 0; ; off += 1000) {
    const j = await req(`${url}/query`, {
      where,
      outFields,
      returnGeometry: 'false',
      /* ⚠️ Хуудаслалтад `orderByFields` ЗААВАЛ */
      orderByFields: `${F.oid} ASC`,
      resultOffset: String(off),
      resultRecordCount: '1000',
    });
    const fs = (j.features as { attributes: Attrs }[]) ?? [];
    out.push(...fs.map((f) => f.attributes));
    if (fs.length < 1000) break;
  }
  return out;
}

/** Жагсаалтын багана — `body`-гүй (хөнгөн) */
const HEAD = [
  F.oid, F.kind, F.docNo, F.org, F.bagts, F.seq, F.rev, F.title,
  F.status, F.author, F.sentAt, F.reviews, F.decidedAt,
].join(',');

/**
 * (kind, bagts, seq)-д `rev`-ээс дээш эсвэл тэнцүү хувилбар аль хэдийн бий юу.
 * ⚠️ 2026-09-25: ТӨРЛӨӨР шүүнэ — урьд нь `kind`-гүй тул нэг багцын MS-0003 rev1
 *    байхад MA-0003-ийн буцаагдсанаас засварлах/дахин илгээх/хавсралт солих
 *    бүгд «шинэ хувилбар бий» гэж хаагддаг байв (`seq` төрөл тутамд тусдаа тоологддог).
 */
async function newerExists(kind: DocKind, bagts: string, seq: number, rev: number): Promise<boolean> {
  const rows = await query(
    `${F.kind} = '${kind}' AND ${F.bagts} = N'${bagts.replace(/'/g, "''")}' AND ${F.seq} = ${Number(seq)} AND ${F.rev} >= ${Number(rev)}`,
    F.oid,
  );
  return rows.length > 0;
}

/**
 * ХАВСРАЛТ засах эрх — СЕРВЕРИЙН мөрөөр (2026-09-17): урьд нь зөвхөн UI (`canAct.edit`)
 * тул батлагдсан баримтын хавсралтыг консолоос солих боломжтой байв. Зөвхөн
 * ноорог/буцаагдсан төлөвт, зөвхөн зохиогч. `null` = зөвшөөрнө.
 */
async function attachDeny(oid: number): Promise<string | null> {
  const cur = await query(`${F.oid} = ${Number(oid)}`, HEAD);
  const doc = cur.length ? toDoc(cur[0]) : null;
  if (!doc) return tr('Баримт олдсонгүй — устгагдсан байж магадгүй.');
  const me = currentUser();
  const strict = typeof window !== 'undefined' && !!AUTH.appId;
  /* ⚠️ NCR (2026-09-28): ноорогт нээгч (захиалагч), «илгээсэн/дахин засах»
     төлөвт ГҮЙЦЭТГЭГЧ (залруулгын нотолгоо) хавсаргана. */
  if (doc.kind === 'NCR') {
    if (doc.status === MS_STATUS.draft) {
      try { requireCap('chanarReview'); } catch (e) { return String((e as Error).message || e); }
      if (strict && doc.author.trim().toLowerCase() !== me) return tr('Зөвхөн зохиогч хавсралт өөрчилнө.');
      return null;
    }
    if (doc.status === MS_STATUS.review || doc.status === MS_STATUS.returned) {
      try { requireCap('chanarAuthor'); } catch (e) { return String((e as Error).message || e); }
      if (strict && !isAuthorFor(me, doc.bagts)) return tr('Энэ багцад гүйцэтгэгчийн эрхгүй.');
      return null;
    }
    return tr('Хаагдсан үл тохирлын хавсралтыг өөрчлөхгүй.');
  }
  /* ⚠️ 2026-09-25: хавсралт ч зохиогчийн бичилт — `actor`-ийн ижил эрх. */
  try { requireCap('chanarAuthor'); } catch (e) { return String((e as Error).message || e); }
  if (doc.status !== MS_STATUS.draft && doc.status !== MS_STATUS.returned) return tr('Зөвхөн ноорог эсвэл буцаагдсан баримтын хавсралтыг өөрчилнө.');
  if (strict && doc.author.trim().toLowerCase() !== me) return tr('Зөвхөн зохиогч хавсралт өөрчилнө.');
  /* ⚠️ ХУУЧИН ХУВИЛБАР ХААЛТТАЙ (2026-09-25 аудит): `Chanar.tsx` хавсралтыг
     БҮХ хувилбараас цуглуулж харуулдаг тул rev0 (буцаагдсан) дээрх гэрчилгээг
     rev1 батлагдсаны ДАРАА солих боломжтой байв — батлагдсан баримтын нотолгоо
     чимээгүй өөрчлөгдөнө. Шинэ хувилбар байвал зөвхөн сүүлийнх нь засагдана. */
  if (await newerExists(doc.kind, doc.bagts, doc.seq, doc.rev + 1)) return tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.');
  return null;
}

/** Тухайн төрлийн БҮХ баримт (бүх хувилбар) — `chanarMs.latest`-ээр нурааж болно */
export async function loadDocs(kind: DocKind = 'MS'): Promise<MsDoc[]> {
  const rows = await query(`${F.kind} = '${kind}'`, HEAD);
  return rows.map(toDoc).filter((x): x is MsDoc => x != null);
}

/** ТАВАН төрлийн бүх баримт — хураангуй, REP дараалал (2026-09-28) */
export async function loadAllDocs(): Promise<MsDoc[]> {
  const rows = await query('1=1', HEAD);
  return rows.map(toDoc).filter((x): x is MsDoc => x != null);
}

/** Нэг баримтын БИЕ (MS-ийн 6 хэсэг) — засах/харахад л татна */
export async function loadBody(oid: number): Promise<MsBody | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.body}`);
  if (!rows.length) return null;
  return parseBody(rows[0][F.body]);
}

/**
 * Нэг баримтын БИЕ — ТӨРЛӨӨР (`MaBody` · `InspBody` · `NcrBody`, MS бол
 * `MsBody & {meta}`). Мөрийн `turul` баганаас төрлийг авна.
 */
export async function loadBodyOf(oid: number): Promise<{ kind: DocKind; body: AnyBody } | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.kind},${F.body}`);
  if (!rows.length) return null;
  const k = s(rows[0][F.kind]);
  const kind: DocKind = isKind(k) ? k : 'MS';
  return { kind, body: parseBodyOf(kind, rows[0][F.body]) };
}

/** Аль ч баримтын `meta` — жагсаалтын карт (хариуцсан ажилтан, ангилал) */
export async function loadMeta(oid: number): Promise<Meta | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.body}`);
  if (!rows.length) return null;
  try { return normalizeMeta((JSON.parse(String(rows[0][F.body] ?? '{}')) as { meta?: unknown }).meta); } catch { return normalizeMeta(null); }
}

/** Төрөл бүрийн бичих эрх: NCR-ийг ЗАХИАЛАГЧ (хянагч) нээнэ, бусдыг гүйцэтгэгч */
const authorCap = (kind: DocKind): CapKey => (kind === 'NCR' ? 'chanarReview' : 'chanarAuthor');

/**
 * Зохиогчийн БАГЦЫН эрх — NCR: тухайн багцад NCR-ийн хянагч (`REVIEWERS_OF.NCR`:
 * tuh · chanar · tug); бусад: гүйцэтгэгч (`isAuthorFor`). `null` = зөвшөөрнө, мөр = алдаа.
 * ⚠️ 2026-09-25: tug (ТМ) нэмэгдсэн — `Chanar.tsx` (`ncrOpener`) ба `reopenDoc`
 *    `REVIEWERS_OF.NCR`-оор зөвшөөрдөг атал энд tuh|chanar л байсан тул ТМ-д
 *    «+ Шинэ үл тохирол» товч гарч, хадгалахад татгалздаг байв. Нэг эх сурвалж.
 */
const NCR_OPEN_DENY = () => tr('Энэ багцад үл тохирол нээх эрхгүй — ТУХ, Чанарын хянагч эсвэл ТУГ л нээнэ.');
function authorDeny(kind: DocKind, who: string, bagts: string): string | null {
  if (kind === 'NCR') {
    const roles = reviewerRolesFor(who, bagts);
    return REVIEWERS_OF.NCR.some((r) => roles.includes(r)) ? null : NCR_OPEN_DENY();
  }
  return isAuthorFor(who, bagts) ? null : tr('Энэ багцад аргачлал ирүүлэх эрхгүй.');
}

/**
 * ⚠️ 2026-09-25: КЛИЕНТИЙН БИЕЭС СЕРВЕРИЙН ЭЗЭМШИЛТЭЙ ТАЛБАРЫГ ХУУЛНА. Урьд нь
 *    `createDraft`/`saveDraft` дамжуулсан биеийг шууд бичдэг тул консолоос
 *    MA материалыг `locked: true, verdict: 'A'` (дахин хянагдахгүй), NCR-д
 *    `correctionAt`/`closure`/`reopened`, `revHistory`/`bounces`-ийг дурын
 *    утгаар бичих боломжтой байв. Одоо:
 *      · `revHistory` · `bounces` — ЗӨВХӨН серверийн мөрөөс (append-only, шинэ мөрд хоосон)
 *      · MA `materials[i].locked/verdict` — серверийн ТҮГЖИГДСЭН материалаас (индекс,
 *        эс бол нэрээр тулгана — зохиогч түгжигдээгүй мөр хасахад индекс шилждэг);
 *        бусад нь `locked:false, verdict:null`
 *      · NCR `correction` · `correctionAt` · `closure` · `reopened` — серверээс
 *        (`initialVerdict`/`initialReviewedBy` нээгчийн маягтын талбар хэвээр)
 *    `server` = null бол шинэ мөр (createDraft).
 */
function ownClientBody(kind: DocKind, client: AnyBody, server: AnyBody | null): AnyBody {
  const sc = server ? parseCommon(server) : structuredClone(EMPTY_COMMON);
  const passed = client as Partial<typeof sc>;
  const out: AnyBody = {
    ...client,
    revHistory: sc.revHistory,
    bounces: sc.bounces,
    revNote: passed.revNote ?? sc.revNote,
  } as AnyBody;
  if (kind === 'MA') {
    const cm = (out as MaBody).materials ?? [];
    const sm = server ? (server as MaBody).materials ?? [] : [];
    const used = new Set<number>();
    (out as MaBody).materials = cm.map((m, i) => {
      let j = sm[i]?.locked && !used.has(i) && sm[i].name.trim() === m.name.trim() ? i : -1;
      if (j < 0) j = sm.findIndex((x, k) => x.locked && !used.has(k) && x.name.trim() === m.name.trim());
      if (j < 0) return { ...m, locked: false, verdict: null };
      used.add(j);
      return { ...m, locked: true, verdict: sm[j].verdict };
    });
  }
  if (kind === 'NCR') {
    const sn = server ? (server as NcrBody) : null;
    const n = out as NcrBody;
    n.correction = sn?.correction ?? { text: '', completedAt: null, steps: [] };
    n.correctionAt = sn?.correctionAt ?? null;
    n.closure = sn?.closure ?? null;
    n.reopened = sn?.reopened ?? 0;
  }
  return out;
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

type Result = { ok: true; oid: number } | { ok: false; error: string };

/**
 * ⚠️ 2026-09-25: БИЧИГЧИЙГ СЕШНД УЯХ. Урьд нь `author`/`who`-г дуудагчаас
 *    хүлээн авдаг байсан тул консолоос `reviewDoc({ who: 'бусдын нэр' })`
 *    дуудаж ХУУРАМЧ хяналт/зохиогч бичих боломжтой байв. Одоо нэвтрэлт асаалттай
 *    хөтөчид (`attachDeny`-ийн ижил `AUTH.appId` хамгаалалт) дамжуулсан нэр нь
 *    `currentUser()`-тэй ЯГ ТААРАХ ёстой; эрх (`requireCap`) мөн энд шалгагдана.
 *    Node тест/`tools/` скрипт (window байхгүй) ба нэвтрэлт унтраалттай дев
 *    орчинд дамжуулсан нэрээр хэвээр ажиллана.
 */
function actor(passed: string, cap: CapKey): { who: string } | { ok: false; error: string } {
  const who = String(passed ?? '').trim().toLowerCase();
  try {
    requireCap(cap);
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
  if (typeof window !== 'undefined' && AUTH.appId) {
    const me = currentUser();
    if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (who !== me) return { ok: false, error: tr('Өөр хэрэглэгчийн нэрээр бичих боломжгүй.') };
    return { who: me };
  }
  if (!who) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  return { who };
}

/* ══════════════════════ Бичих ══════════════════════ */

/**
 * ШИНЭ НООРОГ — гүйцэтгэгч эхлүүлнэ (1-р алхам). `seq` автомат.
 * ⚠️ `docNo` нь `chanarMs.docNo`-оос — гараар өгөх боломж ОГТ БАЙХГҮЙ.
 */
export async function createDraft(args: {
  kind?: DocKind; bagts: string; title: string; author: string; body: AnyBody;
}): Promise<Result> {
  const kind = args.kind ?? 'MS';
  /* ⚠️ 2026-09-28: NCR-ийг ЗАХИАЛАГЧ нээнэ (`chanarReview` + tuh|chanar үүрэг);
     гүйцэтгэгч (`chanarAuthor`) нээхгүй. Бусад төрөл гүйцэтгэгчийнх хэвээр. */
  const act = actor(args.author, authorCap(kind));
  if (!('who' in act)) return act;
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй — админд хандана уу.') };
  /* ⚠️ NCR (2026-09-28): дугаар `STMCC-STMC-NCR-NNNN` — гүйцэтгэгчийн код ШААРДАХГҮЙ,
     `seq` ТӨСЛИЙН хэмжээнд (`nextSeq(…, null)`). Бусад төрөл багцаар хэвээр. */
  const org = orgCode(args.bagts);
  if (!org && kind !== 'NCR') return { ok: false, error: tr('«{0}» багцын гүйцэтгэгчийн код тодорхойгүй.', args.bagts) };
  /* ⚠️ ЭРХИЙГ ЭНД Ч ШАЛГАНА (2026-09-16 аудит): урьд нь зөвхөн UI (`canAct`)
     шалгадаг байв — консолоос дуудсан хэн ч мөр үүсгэж чаддаг байлаа. */
  const deny = authorDeny(kind, act.who, args.bagts);
  if (deny) return { ok: false, error: deny };
  /* Боловсруулсан огноо — анхдагч үүсгэсэн өдөр */
  const meta = normalizeMeta((args.body as { meta?: unknown }).meta);
  const body: AnyBody = { ...ownClientBody(kind, args.body, null), meta: { ...meta, preparedAt: meta.preparedAt ?? Date.now() } };
  const existing = await loadDocs(kind);
  const seqScope = kind === 'NCR' ? null : args.bagts;
  const seq = nextSeq(existing, seqScope);
  const no = docNo(args.bagts, seq, 0, kind);
  if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
  const attrs: Attrs = {
    [F.kind]: kind,
    [F.docNo]: no,
    [F.org]: org ?? '',
    [F.bagts]: args.bagts,
    [F.seq]: seq,
    [F.rev]: 0,
    [F.title]: args.title.trim(),
    [F.status]: MS_STATUS.draft,
    [F.author]: act.who,
    [F.reviews]: JSON.stringify(emptyReviews()),
    [F.body]: JSON.stringify(body),
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true',
    });
    const r = (j.addResults as { success?: boolean; objectId?: number }[])?.[0];
    if (!(r?.success && r.objectId != null)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    const oid = r.objectId;
    /* ⚠️ 2026-09-25: МӨР ҮҮССЭН БОЛ АМЖИЛТ. Доорх давхардлын засвар алдвал урьд нь
       `ok:false` буцааж, хэрэглэгч «Үүсгэх»-ийг дахин дарахад ХОЁР ДАХЬ мөр
       үүсдэг байв. Одоо дугаар засалт нь хамгийн сайн оролдлого — алдвал
       консолд анхааруулаад үүссэн мөрийг буцаана. */
    try {
      /* ⚠️ ДУГААРЫН ДАВХАРДАЛ (2026-09-16 аудит): `nextSeq` клиентэд бодогддог,
         ArcGIS-д unique хязгаар ҮГҮЙ. Хоёр зохиогч нэг багцад зэрэг үүсгэвэл ижил
         `seq` → `latest()` нэгийг нь ЖАГСААЛТААС НУУДАГ. Бичсэний ДАРАА тулгаж,
         ХОЖУУ (их OBJECTID) нь дараагийн дугаарт шилжинэ — эхнийх хөндөгдөхгүй. */
      const after = await loadDocs(kind);
      const twins = after.filter((d) => (seqScope === null || d.bagts === args.bagts) && d.seq === seq && d.rev === 0);
      if (twins.length > 1 && Math.min(...twins.map((d) => d.oid)) !== oid) {
        const seq2 = nextSeq(after, seqScope);
        const no2 = docNo(args.bagts, seq2, 0, kind);
        if (no2) {
          const j2 = await req(`${url}/applyEdits`, {
            updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.seq]: seq2, [F.docNo]: no2 } }]),
            rollbackOnFailure: 'true',
          });
          if (!editOk(j2.updateResults)) console.warn('[selbe] chanar: давхардсан дугаарыг засаж чадсангүй', oid);
        }
      }
    } catch (e) {
      console.warn('[selbe] chanar: дугаарын тулгалт алдлаа', oid, e);
    }
    return { ok: true, oid };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * НООРОГ ЗАСАХ — гарчиг, бие. Зөвхөн `draft`/`returned` төлөвт, зөвхөн зохиогч.
 * ⚠️ Серверийн мөрөөс шалгана — дуудагчийн өгсөн төлөвт найдахгүй.
 */
export async function saveDraft(args: {
  oid: number; who: string; title: string; body: AnyBody;
  /** Буцаагдсанаас rev+1 ноорог үүсгэхэд ЗААВАЛ (`body.revNote` ч болно) */
  revNote?: string;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  const act = actor(args.who, authorCap(doc.kind));
  if (!('who' in act)) return act;
  if (doc.author.trim().toLowerCase() !== act.who) return { ok: false, error: tr('Зөвхөн зохиогч засна.') };
  /* ⚠️ 2026-09-25: багцын эрх хасагдсан зохиогч хуучин ноорогоо засаж/ирүүлэхгүй. */
  const deny = authorDeny(doc.kind, act.who, doc.bagts);
  if (deny) return { ok: false, error: deny };
  /* ⚠️ NCR (2026-09-28): нээгч ЗӨВХӨН ноорогт засна — буцаагдсан («Дахин
     засах») нь гүйцэтгэгчийн залруулгын ээлж, захиалагчийн засвар биш. */
  const editable = doc.kind === 'NCR'
    ? doc.status === MS_STATUS.draft
    : doc.status === MS_STATUS.draft || doc.status === MS_STATUS.returned;
  if (!editable) {
    return { ok: false, error: tr('Хянагдаж буй эсвэл батлагдсан баримтыг засах боломжгүй.') };
  }
  /* ⚠️ 2026-09-28: `revHistory` · `bounces` СЕРВЕРИЙН мөрөөс хадгална.
     ⚠️ 2026-09-25: дамжуулсан ч ХАЯГДАНА (append-only) — MA түгжээ, NCR-ийн серверийн
     талбарууд мөн (`ownClientBody`). */
  const body = ownClientBody(doc.kind, args.body, parseBodyOf(doc.kind, cur[0][F.body]));
  try {
    if (doc.status === MS_STATUS.draft) {
      /* Ноорог — ижил мөрийг шинэчилнэ */
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: {
          [F.oid]: args.oid, [F.title]: args.title.trim(), [F.body]: JSON.stringify(body),
        } }]),
        rollbackOnFailure: 'true',
      });
      return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    }
    /*
     * ⚠️ БУЦААГДСАН мөрийг ГАЗАР ДЭЭР НЬ ЗАСАХГҮЙ (2026-09-16 аудит). Урьд нь
     *    засдаг байсан тул rev N-ийн бие нь хянагчдын ТАТГАЛЗСАН агуулга биш,
     *    засварласны дараах болж, «Өөрчлөлтийн түүх» өөрөө өөрийгөө няцаадаг
     *    байв. Одоо буцаагдсан мөр ХЭВЭЭР үлдэж, засвар нь rev+1 ШИНЭ НООРОГ
     *    болно; `submitDoc` тэр ноорогийг (draft → ижил мөр) илгээнэ.
     */
    const kind = doc.kind;
    const rev = doc.rev + 1;
    /* ⚠️ ХУУЧИН буцаагдсан мөрөөс дахин засварлахыг хориглоно (2026-09-17): түүхээс
       rev N-ийг сонгоод засвал rev N+1 ДАВХАР үүсч, `latest()` нэгийг нь нуудаг байв. */
    if (await newerExists(doc.kind, doc.bagts, doc.seq, rev)) return { ok: false, error: tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.') };
    const no = docNo(doc.bagts, doc.seq, rev, kind);
    if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
    /* ⚠️ 2026-09-28: rev+1 ноорогт хувилбарын шалтгаан ЗААВАЛ; MA-д A/AN материал түгжигдэнэ */
    const reason = (args.revNote ?? (body as { revNote?: string }).revNote ?? '').trim();
    if (!reason) return { ok: false, error: tr('Хувилбарын шалтгаанаа бичнэ үү (rev {0})', String(rev)) };
    /* ⚠️ 2026-09-29 (аудит 10): ТҮГЖЭЭГ ЭХЛЭЭД серверийн (буцаагдсан rev N) биед тавина.
       Урьд нь `ownClientBody` → `nextRevisionBody` дараалалтай байв: rev N-ийн материал
       `applyRepToMaterials`-аар A/AN шийдвэртэй ч `locked:false` тул `ownClientBody`
       бүгдийг `{verdict:null, locked:false}` болгож, дараа нь түгжих юм үлддэггүй —
       rev+1 БҮХ материалыг дахин хянуулдаг байлаа («Дахин илгээх»-ийн засваргүй зам
       `submitDoc` зөв түгждэг). Одоо `nextRevisionBody` серверийн биеэс A/AN-ийг түгжиж
       (түүх · revNote ч энд), `ownClientBody` клиентийн материалыг НЭРЭЭР нь тэр
       түгжээтэй тулгана — дахин түгжих шаардлагагүй. */
    const locked = nextRevisionBody(kind, parseBodyOf(kind, cur[0][F.body]), { rev, reason, by: act.who });
    const nextBody = { ...ownClientBody(kind, args.body, locked), revNote: reason } as AnyBody;
    const attrs: Attrs = {
      [F.kind]: kind, [F.docNo]: no, [F.org]: doc.org, [F.bagts]: doc.bagts,
      [F.seq]: doc.seq, [F.rev]: rev, [F.title]: args.title.trim(),
      [F.status]: MS_STATUS.draft, [F.author]: doc.author,
      [F.reviews]: JSON.stringify(emptyReviews()), [F.body]: JSON.stringify(nextBody),
    };
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true',
    });
    const a = (j.addResults as { success?: boolean; objectId?: number }[])?.[0];
    return a?.success && a.objectId != null
      ? { ok: true, oid: a.objectId }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
/**
 * ИРҮҮЛЭХ — 2-р алхам. Буцаагдсанаас дахин ирүүлбэл ШИНЭ МӨР (`rev+1`),
 * хуучин мөр ТҮҮХ болж үлдэнэ.
 *
 * ⚠️ ХУУЧИН МӨРИЙГ ХӨНДӨХГҮЙ — «Өөрчлөлтийн түүх» хүснэгт хуучин
 *    хувилбаруудаас гарна; засвал түүх устана. Гэхдээ дахин ирүүлэхэд
 *    хуучин мөрийн `returned` төлөв хэвээр тул `latest()` шинийг л харуулна.
 */
export async function submitDoc(args: {
  oid: number; who: string;
  /** rev > 0 илгээлтэд ЗААВАЛ (өгөөгүй бол `body.revNote`) — 2026-09-28 */
  revNote?: string;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  const act = actor(args.who, authorCap(doc.kind));
  if (!('who' in act)) return act;
  const deny = authorDeny(doc.kind, act.who, doc.bagts);
  if (deny) return { ok: false, error: deny };
  const common = parseCommon(cur[0][F.body]);
  const revNote = (args.revNote ?? common.revNote).trim();
  const r = submitPure(doc, { who: act.who, revNote });
  if (!r.ok) return r;

  try {
    /* Ноорог (rev>0) дээр шалтгаан өгсөн бол биед хадгална — түүхийн мөр аль хэдийн
       `saveDraft`/`newRevisionDoc`-оос; байхгүй бол энд нэмнэ */
    let bodyJson = cur[0][F.body] ?? '{}';
    if (r.rev === doc.rev && r.rev > 0 && (args.revNote?.trim() || !common.revHistory.some((h) => h.rev === r.rev))) {
      const cb = parseBodyOf(doc.kind, bodyJson);
      const has = common.revHistory.some((h) => h.rev === r.rev);
      /* ⚠️ 2026-09-25: түүхийн мөр аль хэдийн байвал ШАЛТГААНЫГ нь ч шинэчилнэ — урьд нь
         зөвхөн `revNote` солигдож, «Өөрчлөлтийн түүх» хуучин шалтгаанаа харуулдаг байв. */
      const nb = has
        ? { ...cb, revNote, revHistory: common.revHistory.map((h) => (h.rev === r.rev ? { ...h, reason: revNote } : h)) }
        : nextRevisionBody(doc.kind, cb, { rev: r.rev, reason: revNote, by: act.who });
      bodyJson = JSON.stringify(nb);
    }
    if (r.rev === doc.rev) {
      /* Анхны илгээлт — ижил мөрийг шинэчилнэ (NCR: үргэлж энэ зам, rev үгүй) */
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: {
          [F.oid]: args.oid, [F.status]: r.status, [F.sentAt]: r.sentAt,
          [F.reviews]: JSON.stringify(r.reviews), [F.decidedAt]: null, [F.body]: bodyJson,
        } }]),
        rollbackOnFailure: 'true',
      });
      return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    }
    /* Дахин илгээлт — ШИНЭ мөр, шинэ дугаар (rev+1); бие `nextRevisionBody` (MA түгжээ, түүх) */
    const kind = doc.kind;
    if (await newerExists(doc.kind, doc.bagts, doc.seq, r.rev)) return { ok: false, error: tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.') };
    const no = docNo(doc.bagts, doc.seq, r.rev, kind);
    if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
    const nextBody = nextRevisionBody(kind, parseBodyOf(kind, cur[0][F.body]), { rev: r.rev, reason: revNote, by: act.who });
    const attrs: Attrs = {
      [F.kind]: kind, [F.docNo]: no, [F.org]: doc.org, [F.bagts]: doc.bagts,
      [F.seq]: doc.seq, [F.rev]: r.rev, [F.title]: doc.title,
      [F.status]: r.status, [F.author]: doc.author, [F.sentAt]: r.sentAt,
      [F.reviews]: JSON.stringify(r.reviews), [F.body]: JSON.stringify(nextBody),
    };
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true',
    });
    const a = (j.addResults as { success?: boolean; objectId?: number }[])?.[0];
    return a?.success && a.objectId != null
      ? { ok: true, oid: a.objectId }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** Зэрэгцээ бичигч манай слотыг дарсан эсэхийг шалгах хүлээлт (мс) */
const REVIEW_SETTLE_MS = 1500;

/** Серверийн мөрөнд `as` слотод МАНАЙ шийдвэр байгаа эсэх */
async function mineSurvives(oid: number, as: Reviewer, me: string): Promise<boolean> {
  const after = await query(`${F.oid} = ${Number(oid)}`, HEAD);
  const fresh = after.length ? toDoc(after[0]) : null;
  const mine = fresh?.reviews[as];
  return !!mine && mine.who === me;
}

/**
 * ХЯНАГЧИЙН ШИЙДВЭР — 3 · 4а · 4б алхам. Дүрмүүд `chanarMs.review`-д.
 *
 * ⚠️ СЕРВЕРИЙН МӨРӨӨС дахин уншиж шалгана (`huvaariBatlah.decidePlan`-ийн
 *    «хоёр батлагч зэрэг нээсэн» ба «зохиогч серверээс» хоёр сургамж).
 *    Дэлгэц дээрх `doc` хуучирсан байж болно — өөр хянагч аль хэдийн
 *    татгалзсан бол энэ шийдвэр `returned` мөр дээр бичигдэх ёсгүй.
 */
export async function reviewDoc(args: {
  oid: number; as: Reviewer; who: string; verdict: Verdict; note?: string;
  /** MA: материал бүрийн шийдвэр (индекс → A/AN/R); түгжигдсэн индекс хаягдана */
  perMaterial?: Record<string, VerdictCode>;
  /** AN: нөхцөл биелэх хугацаа (epoch мс) — сонголтоор */
  anDeadline?: number | null;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const me = act.who;
  /*
   * ⚠️ ЗЭРЭГЦЭЭ ХЯНАГЧДЫН RACE (2026-09-16 аудит). `hyanalt` JSON нь НЭГ талбар
   *    бөгөөд ArcGIS-д «зөвхөн өөрчлөгдсөн бол бич» (CAS) байхгүй: ТУХ ба Чанар
   *    нэг секундэд дарвал хоёулаа `{}` уншиж, хоёр дахь бичилт эхнийхийг
   *    ЧИМЭЭГҮЙ АРИЛГАДАГ байв — муу хувилбарт 3/3 «Батлагдсан» нь 1 бүртгэлтэй
   *    «Буцаагдсан»-аар дарагддаг. Одоо бичсэний ДАРАА дахин уншиж ӨӨРИЙН
   *    шийдвэр байгаа эсэхийг тулгана; алга бол (дарагдсан) шинэ мөр дээр
   *    дахин нийлүүлж бичнэ. Хоёр бичигчийн аль дарагдсан нь дахин оролдох тул
   *    гурван оролдлогод нийлдэг. Өөр хянагчийн шийдвэр ТӨЛӨВИЙГ хааж амжсан
   *    бол `reviewPure` тэр шалтгаанаар татгалзана — энэ нь зөв.
   * ⚠️ 2026-09-28: ХАРИУНЫ ДУГААР (REP). approved/returned болмогц
   *    `SLB-REP-<KIND>-…-<NNNN>-<RR>` дугаар авна — NNNN нь ТӨСЛИЙН ХЭМЖЭЭНИЙ
   *    дараалал (`nextRepNo`, тухайн төрлийн бүх мөрөөс). `seq`-ийн ижил
   *    загвар: клиентэд бодогдож ArcGIS-д unique хязгаар үгүй тул бичсэний
   *    ДАРАА тулгаж, давхардвал ХОЖУУ (их OBJECTID) нь дараагийн дугаарт.
   * ⚠️ NCR approved → `body.closure` автоматаар (хаагдсан огноо, баталгаажуулагч).
   */
  let last: Result = { ok: false, error: tr('Шийдвэр хадгалагдсангүй.') };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
    if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй — устгагдсан байж магадгүй.') };
    const doc = toDoc(cur[0]);
    if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
    /* ⚠️ ҮҮРГИЙГ ЭНД Ч ШАЛГАНА — `canAct`-ийн «консолоос дуудсан ч энэ л барина»
       гэсэн амлалт ACL-ийн хувьд UI-д л үнэн байв. */
    if (!reviewerRolesFor(me, doc.bagts).includes(args.as)) {
      return { ok: false, error: tr('Энэ багцад «{0}» үүргээр хянах эрхгүй.', args.as) };
    }
    const ncrBody = doc.kind === 'NCR' ? normalizeNcr(safeJson(cur[0][F.body])) : null;
    const maBody = doc.kind === 'MA' ? normalizeMa(safeJson(cur[0][F.body])) : null;
    const r = reviewPure(
      { ...doc, correctionAt: ncrBody?.correctionAt ?? null },
      {
        as: args.as, who: me, verdict: args.verdict, note: args.note, perMaterial: args.perMaterial,
        materials: maBody?.materials, anDeadline: args.anDeadline,
      },
    );
    if (!r.ok) return r;
    const decided = r.status === MS_STATUS.approved || r.status === MS_STATUS.returned;
    const now = Date.now();
    let rep: Rep | null = null;
    if (decided) {
      /* ⚠️ 2026-09-28: REP дугаар LINEAGE-ээр — ижил (kind,bagts,seq)-ийн өмнөх хариу
         байвал NNNN өвлөж RR+1; байхгүй бол max+1, RR=00 (`repSeqFor`). */
      const { n, rr } = repSeqFor(await loadDocs(doc.kind), doc.kind, doc.bagts, doc.seq);
      const no = repNo(doc.kind, doc.bagts, n, rr);
      if (!no) return { ok: false, error: tr('Хариуны дугаар үүсгэж чадсангүй.') };
      rep = { no, at: now, ...repFrom(r.reviews, doc.kind, maBody?.materials) };
    }
    const attrs: Attrs = {
      [F.oid]: args.oid,
      [F.status]: r.status,
      [F.reviews]: reviewsJson(r.reviews, rep),
      [F.decidedAt]: decided ? now : null,
    };
    if (ncrBody && r.status === MS_STATUS.approved) attrs[F.body] = JSON.stringify(ncrClosure(ncrBody, me, now));
    /* ⚠️ MA (2026-09-28): хариуг материал бүрд бичнэ — дараагийн хувилбарт A/AN түгжигдэнэ */
    if (maBody && rep) attrs[F.body] = JSON.stringify(applyRepToMaterials(maBody, rep));
    try {
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: attrs }]),
        rollbackOnFailure: 'true',
      });
      if (!editOk(j.updateResults)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    } catch (e) {
      return { ok: false, error: String((e as Error).message || e) };
    }
    /* Бичсэний дараа тулгах */
    if (await mineSurvives(args.oid, args.as, me)) {
      /* ⚠️ ТОГТОХ ХҮЛЭЭЛТ (2026-09-25 аудит): шууд тулгалт хангалтгүй — манайхаас
         ӨМНӨ `{}` уншсан удаан бичигч манай тулгалт давсны ДАРАА бичиж, манай
         шийдвэрийг арилгадаг байв (бид «хадгалагдлаа» гэж хэлчихсэн). CAS
         байхгүй тул богино хүлээлтийн дараа ДАХИН тулгана; арилсан бол дахин
         нийлүүлж бичнэ (`reviewPure` нөгөөгийн слотыг шинэ мөрөөс авна). Цонх
         бүрэн хаагдахгүй — зөвхөн `REVIEW_SETTLE_MS`-ээс удаан сүлжээнд үлдэнэ. */
      await new Promise((res) => setTimeout(res, REVIEW_SETTLE_MS));
      if (await mineSurvives(args.oid, args.as, me)) {
        if (rep) await fixRepDuplicate(url, doc.kind, args.oid, doc.bagts, doc.seq, rep, r.reviews);
        return { ok: true, oid: args.oid };
      }
    }
    last = { ok: false, error: tr('Өөр хянагч зэрэг бичсэн тул шийдвэр дахин хадгалагдаж чадсангүй — дахин оролдоно уу.') };
  }
  return last;
}

const safeJson = (raw: unknown): unknown => {
  try { return JSON.parse(String(raw ?? '{}')); } catch { return {}; }
};

/**
 * REP ДУГААРЫН ДАВХАРДАЛ — бичсэний дараа тулгана (`createDraft`-ийн `seq`
 * засвартай ижил). Хоёр баримт зэрэг шийдвэрлэгдвэл ижил NNNN; ХОЖУУ (их
 * OBJECTID) нь дараагийн дугаарт. Алдвал консолд — шийдвэр аль хэдийн
 * хадгалагдсан тул `ok:false` буцаахгүй.
 */
async function fixRepDuplicate(
  url: string, kind: DocKind, oid: number, bagts: string, seq: number, rep: Rep, reviews: Reviews,
): Promise<void> {
  try {
    const all = await loadDocs(kind);
    const twins = all.filter((d) => d.rep?.no === rep.no && d.oid !== oid);
    if (twins.length > 0 && Math.min(...twins.map((d) => d.oid)) < oid) {
      /* ⚠️ Өөрийн мөрийг хасаад lineage-ээр дахин бодно (ижил lineage бол RR, өөр бол NNNN шинэ) */
      const { n, rr } = repSeqFor(all.filter((d) => d.oid !== oid), kind, bagts, seq);
      const no2 = repNo(kind, bagts, n, rr);
      if (!no2 || no2 === rep.no) return;
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.reviews]: reviewsJson(reviews, { ...rep, no: no2 }) } }]),
        rollbackOnFailure: 'true',
      });
      if (!editOk(j.updateResults)) console.warn('[selbe] chanar: давхардсан REP дугаарыг засаж чадсангүй', oid);
    }
  } catch (e) {
    console.warn('[selbe] chanar: REP дугаарын тулгалт алдлаа', oid, e);
  }
}

/* ══════════════════════ MIR · FIC — захиалагчийн багана ══════════════════════ */

/**
 * ЗАХИАЛАГЧИЙН OK/NA/X БАГАНА — зөвхөн `tuh` хянагч, зөвхөн `review` төлөвт,
 * зөвхөн MIR/FIC, `tuh` шийдвэр өгөхөөс ӨМНӨ. `client` нь мөрийн индексээр
 * (`items[i].client`); бусад талбар ХӨНДӨГДӨХГҮЙ (гүйцэтгэгчийн багана,
 * тайлбар зохиогчийнх).
 */
export async function saveClientChecks(args: {
  oid: number; who: string; client: (InspCheck | null)[];
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  if (doc.kind !== 'MIR' && doc.kind !== 'FIC') return { ok: false, error: tr('Зөвхөн үзлэгийн хуудсанд захиалагчийн багана бий.') };
  if (doc.status !== MS_STATUS.review) return { ok: false, error: tr('Баримт хянагдаж буй төлөвт биш — шийдвэр өгөх боломжгүй') };
  if (!reviewerRolesFor(act.who, doc.bagts).includes('tuh')) return { ok: false, error: tr('Захиалагчийн баганыг зөвхөн ТУХ-ийн хяналтын инженер бөглөнө.') };
  if (doc.author.trim().toLowerCase() === act.who) return { ok: false, error: tr('Зохиогч өөрийн аргачлалыг хянах боломжгүй') };
  if (doc.reviews.tuh) return { ok: false, error: tr('ТУХ шийдвэр өгсний дараа багана өөрчлөгдөхгүй.') };
  /* ⚠️ 2026-09-25: утгыг ШАЛГАНА — урьд нь дурын мөр `client`-д бичигдэж, дараагийн
     уншилтад (`normalizeInsp`) чимээгүй null болдог байв. */
  if (!Array.isArray(args.client) || args.client.some((c) => c !== null && !isInspCheck(c))) {
    return { ok: false, error: tr('Захиалагчийн баганын утга танигдсангүй (OK · NA · X)') };
  }
  const body: InspBody = normalizeInsp(safeJson(cur[0][F.body]), doc.kind);
  if (args.client.length > body.items.length) return { ok: false, error: tr('Захиалагчийн багана мөрийн тооноос олон.') };
  const items = body.items.map((it, i) => ({ ...it, client: i < args.client.length ? args.client[i] : it.client }));
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.body]: JSON.stringify({ ...body, items }) } }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/* ══════════════════════ NCR — залруулга · дахин нээх ══════════════════════ */

/**
 * ГҮЙЦЭТГЭГЧ ЗАЛРУУЛГЫН ТАЙЛАН ИЛГЭЭХ — тухайн багцын гүйцэтгэгч
 * (`chanarAuthor` + `isAuthorFor`), NCR `review`/`returned` төлөвт. Ижил мөр
 * дээр: бие (`correction`, `correctionAt`), төлөв `review`, хянагчид цэвэр.
 */
export async function submitCorrection(args: {
  oid: number; who: string; correction: NcrCorrection;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const act = actor(args.who, 'chanarAuthor');
  if (!('who' in act)) return act;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  if (!isAuthorFor(act.who, doc.bagts)) return { ok: false, error: tr('Энэ багцад гүйцэтгэгчийн эрхгүй.') };
  const body = normalizeNcr(safeJson(cur[0][F.body]));
  const r = correctionPure(doc, body, { who: act.who, correction: args.correction });
  if (!r.ok) return r;
  try {
    /* ⚠️ 2026-09-29 (аудит 10): ӨМНӨХ ХАРИУГ (`rep`) ХАДГАЛНА. NCR нь НЭГ мөртэй (rev үгүй)
       тул `JSON.stringify(r.reviews)` нь өмнөх REP дугаарыг арилгадаг байв → `nextRepNo`
       тэр NNNN-ийг өөр баримтад ДАХИН олгож (төслийн хэмжээнд давхардал), `repSeqFor`
       lineage-ээ алдана (0005-01 байх ёстой нь 0006-00). Хянагдаж буй төлөвт шийдвэрийн
       тэмдэг гаргахгүй байх нь `chanarUi.docVerdict`-д. */
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid, [F.status]: r.status, [F.reviews]: reviewsJson(r.reviews, doc.rep),
        [F.decidedAt]: null, [F.body]: JSON.stringify(r.body),
      } }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** ХААГДСАН NCR ДАХИН НЭЭХ — tuh/chanar хянагч (тухайн багцад) */
export async function reopenDoc(args: { oid: number; who: string }): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  const roles = reviewerRolesFor(act.who, doc.bagts);
  if (!REVIEWERS_OF.NCR.some((r) => roles.includes(r))) return { ok: false, error: NCR_OPEN_DENY() };
  const body = normalizeNcr(safeJson(cur[0][F.body]));
  const r = reopenPure(doc, body);
  if (!r.ok) return r;
  try {
    /* ⚠️ 2026-09-29 (аудит 10): өмнөх хариуг (`rep`) хадгална — `submitCorrection`-ийн тайлбар */
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: {
        [F.oid]: args.oid, [F.status]: r.status, [F.reviews]: reviewsJson(r.reviews, doc.rep),
        [F.decidedAt]: null, [F.body]: JSON.stringify(r.body),
      } }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/* ══════════════ 2-р үе шат (2026-09-28): буцаах · хүлээн авах · AN хаах · шинэ хувилбар · NCR хаах ══════════════ */

/** Нэг мөрийг бүх баганатай уншина (`'*'`) — доорх үйлдлүүдийн нийтлэг эхлэл */
async function loadRow(oid: number): Promise<{ url: string; row: Attrs; doc: MsDoc } | { ok: false; error: string }> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const cur = await query(`${F.oid} = ${Number(oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  return { url, row: cur[0], doc };
}

async function update(url: string, attrs: Attrs): Promise<Result> {
  try {
    const j = await req(`${url}/applyEdits`, { updates: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true' });
    return editOk(j.updateResults) ? { ok: true, oid: Number(attrs[F.oid]) } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * «ХЯНАХГҮЙ БУЦААХ» — Чанарын хэлтсийн хянагч (`chanar`/`cheng`, тухайн багцад),
 * `review` төлөвт: returned, REP ҮГҮЙ, хянагчид цэвэр, `hyanalt.bounce` тэмдэг,
 * `body.bounces[]` түүх. Дүрэм `chanarMs.bounce`.
 */
export async function bounceDoc(args: {
  oid: number; who: string; as: Reviewer; reason: BounceReason; note?: string;
}): Promise<Result> {
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const ld = await loadRow(args.oid);
  if ('ok' in ld) return ld;
  const { url, row, doc } = ld;
  if (!reviewerRolesFor(act.who, doc.bagts).includes(args.as)) return { ok: false, error: tr('Энэ багцад «{0}» үүргээр хянах эрхгүй.', args.as) };
  const r = bouncePure(doc, { as: args.as, who: act.who, reason: args.reason, note: args.note });
  if (!r.ok) return r;
  const body = parseBodyOf(doc.kind, row[F.body]) as AnyBody & { bounces?: Bounce[] };
  const nb = { ...body, bounces: [...(body.bounces ?? []), r.bounce] };
  return update(url, {
    [F.oid]: args.oid, [F.status]: r.status, [F.reviews]: reviewsJson(r.reviews, null, r.bounce),
    [F.decidedAt]: r.bounce.at, [F.body]: JSON.stringify(nb),
  });
}

/** ГҮЙЦЭТГЭГЧ «ХАРИУ ХҮЛЭЭН АВЛАА» — зохиогч, REP-тэй баримтад (`chanarMs.ackRep`) */
export async function ackRepDoc(args: { oid: number; who: string }): Promise<Result> {
  const ld = await loadRow(args.oid);
  if ('ok' in ld) return ld;
  const { url, doc } = ld;
  const act = actor(args.who, authorCap(doc.kind));
  if (!('who' in act)) return act;
  /* ⚠️ 2026-09-25: багцын эрх хасагдсан зохиогч хариу хүлээн авахгүй — `saveDraft`-ийн ижил */
  const deny = authorDeny(doc.kind, act.who, doc.bagts);
  if (deny) return { ok: false, error: deny };
  const r = ackPure(doc, { who: act.who });
  if (!r.ok) return r;
  return update(url, { [F.oid]: args.oid, [F.reviews]: reviewsJson(doc.reviews, r.rep, doc.bounce ?? null) });
}

/**
 * AN ХААХ — тухайн төрлийн хянагч (тухайн багцад), approved + AN баримт:
 * REP ижил NNNN, RR+1 (`repSeqFor`), verdict A; MA-д AN материал → A.
 */
export async function closeAnDoc(args: { oid: number; who: string; as: Reviewer; note?: string }): Promise<Result> {
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const ld = await loadRow(args.oid);
  if ('ok' in ld) return ld;
  const { url, row, doc } = ld;
  if (!reviewerRolesFor(act.who, doc.bagts).includes(args.as)) return { ok: false, error: tr('Энэ багцад «{0}» үүргээр хянах эрхгүй.', args.as) };
  const { n, rr } = repSeqFor(await loadDocs(doc.kind), doc.kind, doc.bagts, doc.seq);
  const no = repNo(doc.kind, doc.bagts, n, rr);
  if (!no) return { ok: false, error: tr('Хариуны дугаар үүсгэж чадсангүй.') };
  const r = closeAnPure(doc, { as: args.as, who: act.who, note: args.note, no });
  if (!r.ok) return r;
  const attrs: Attrs = { [F.oid]: args.oid, [F.reviews]: reviewsJson(doc.reviews, r.rep, doc.bounce ?? null) };
  if (doc.kind === 'MA') attrs[F.body] = JSON.stringify(applyRepToMaterials(normalizeMa(safeJson(row[F.body])), r.rep));
  return update(url, attrs);
}

/**
 * ШИНЭ ХУВИЛБАР — зохиогч, approved/returned баримтаас rev+1 НООРОГ (шинэ мөр).
 * Бие `nextRevisionBody` (MA түгжээ, `revHistory`). Буцаасан `oid` = шинэ мөр.
 */
export async function newRevisionDoc(args: { oid: number; who: string; reason: string }): Promise<Result> {
  const ld = await loadRow(args.oid);
  if ('ok' in ld) return ld;
  const { url, row, doc } = ld;
  const act = actor(args.who, authorCap(doc.kind));
  if (!('who' in act)) return act;
  const deny = authorDeny(doc.kind, act.who, doc.bagts);
  if (deny) return { ok: false, error: deny };
  const r = newRevisionPure(doc, { who: act.who, reason: args.reason });
  if (!r.ok) return r;
  if (await newerExists(doc.kind, doc.bagts, doc.seq, r.rev)) return { ok: false, error: tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.') };
  const no = docNo(doc.bagts, doc.seq, r.rev, doc.kind);
  if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
  const nextBody = nextRevisionBody(doc.kind, parseBodyOf(doc.kind, row[F.body]), { rev: r.rev, reason: r.reason, by: act.who });
  const attrs: Attrs = {
    [F.kind]: doc.kind, [F.docNo]: no, [F.org]: doc.org, [F.bagts]: doc.bagts,
    [F.seq]: doc.seq, [F.rev]: r.rev, [F.title]: doc.title,
    [F.status]: r.status, [F.author]: doc.author,
    [F.reviews]: JSON.stringify(r.reviews), [F.body]: JSON.stringify(nextBody),
  };
  try {
    const j = await req(`${url}/applyEdits`, { adds: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true' });
    const a = (j.addResults as { success?: boolean; objectId?: number }[])?.[0];
    return a?.success && a.objectId != null ? { ok: true, oid: a.objectId } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** NCR — ГҮЙЦЭТГЭГЧ «ХААСАН» мөр (approved NCR, тухайн багцын гүйцэтгэгч; `chanarMs.closeNcr`) */
export async function closeNcrDoc(args: {
  oid: number; who: string; closedByContractor: NcrCloser[];
  docType?: NcrClosureDocType | null; action?: NcrProposed | null; result?: NcrClosureResult | null;
  archive?: Partial<NcrClosure['archive']>;
}): Promise<Result> {
  const act = actor(args.who, 'chanarAuthor');
  if (!('who' in act)) return act;
  const ld = await loadRow(args.oid);
  if ('ok' in ld) return ld;
  const { url, row, doc } = ld;
  if (!isAuthorFor(act.who, doc.bagts)) return { ok: false, error: tr('Энэ багцад гүйцэтгэгчийн эрхгүй.') };
  const body = normalizeNcr(safeJson(row[F.body]));
  const r = closeNcrPure(doc, body, { who: act.who, closedByContractor: args.closedByContractor, docType: args.docType, action: args.action, result: args.result, archive: args.archive });
  if (!r.ok) return r;
  return update(url, { [F.oid]: args.oid, [F.body]: JSON.stringify(r.body) });
}

/* ══════════════════════ Мета — хариуцсан ажилтан ══════════════════════ */

/**
 * ХАРИУЦСАН АЖИЛТАН · АНГИЛАЛ · бусад мета — захиалагчийн хянагч (тухайн багцад
 * аль нэг үүрэгтэй) аль ч төлөвт засна; зохиогч бол `saveDraft`-аар (бие дотор).
 * Зөвхөн өгөгдсөн `meta` талбарууд — бусад хөндөгдөхгүй.
 * ⚠️ 2026-09-28: `owners[]` (1–2) — хуучин `owner` аргумент = `owners: [owner]`;
 *    бичихдээ `owner` (=owners[0]) ч бичигдэнэ (хуучин уншигч).
 */
export async function saveMeta(args: {
  oid: number; who: string; owner?: string | null; owners?: string[]; category?: string;
  meta?: Partial<Pick<Meta, 'pageCount' | 'projectTitle' | 'contractNo' | 'discipline' | 'note' | 'preparedAt' | 'workType'>>;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const act = actor(args.who, 'chanarReview');
  if (!('who' in act)) return act;
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  if (!reviewerRolesFor(act.who, doc.bagts).length) return { ok: false, error: tr('Энэ багцад хянагчийн эрхгүй.') };
  /* ⚠️ 2026-09-25: ТАЛБАРУУДЫГ ШАЛГАНА — урьд нь `Object.assign(meta, args.meta)` дурын
     утгыг (pageCount: -1 / 'abc', preparedAt: мөр, note: объект) шууд бичдэг байв;
     дараагийн `normalizeMeta` чимээгүй хаядаг тул хэрэглэгч «хадгалагдлаа» гэж хардаг. */
  const m = args.meta ?? {};
  const patch: Partial<Meta> = {};
  if (m.pageCount !== undefined) {
    if (m.pageCount !== null && !(Number.isInteger(m.pageCount) && m.pageCount >= 0)) return { ok: false, error: tr('Хуудасны тоо 0-ээс багагүй бүхэл тоо байна.') };
    patch.pageCount = m.pageCount || null;
  }
  if (m.preparedAt !== undefined) {
    if (m.preparedAt !== null && !(Number.isFinite(m.preparedAt) && m.preparedAt > 0)) return { ok: false, error: tr('Боловсруулсан огноо буруу.') };
    patch.preparedAt = m.preparedAt;
  }
  for (const k of ['projectTitle', 'contractNo', 'note'] as const) {
    if (m[k] === undefined) continue;
    if (typeof m[k] !== 'string') return { ok: false, error: tr('«{0}» талбар текст байх ёстой.', k) };
    patch[k] = m[k];
  }
  if (m.workType !== undefined) {
    if (m.workType !== null && typeof m.workType !== 'string') return { ok: false, error: tr('«{0}» талбар текст байх ёстой.', 'workType') };
    patch.workType = m.workType?.trim() || null;
  }
  if (m.discipline !== undefined) {
    if (!Array.isArray(m.discipline) || m.discipline.some((d) => !(DISCIPLINES as readonly string[]).includes(d))) return { ok: false, error: tr('Мэргэжлийн чиглэл танигдсангүй.') };
    patch.discipline = [...new Set(m.discipline)];
  }
  if (args.category !== undefined && typeof args.category !== 'string') return { ok: false, error: tr('«{0}» талбар текст байх ёстой.', 'category') };
  /* ⚠️ 2026-09-25: биеийг БИЧИХИЙН ӨМНӨХӨН дахин уншина — эрхийн шалгалт, баталгаажуулалтын
     хооронд зохиогч/хянагч биеийг (материал, залруулга) өөрчилсөн бол хуучин `base`
     дээр `meta` наагаад тэр өөрчлөлтийг дардаг байв. Зөвхөн `meta` түлхүүр солигдоно;
     `hyanalt` (хянагчид) энэ бичилтэд ОГТ ОРОХГҮЙ. */
  const fresh = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.body}`);
  if (!fresh.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const raw = safeJson(fresh[0][F.body]);
  const base = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const meta = normalizeMeta(base.meta);
  if (args.owners !== undefined) {
    meta.owners = [...new Set(args.owners.map((o) => o.trim().toLowerCase()).filter(Boolean))].slice(0, 2);
    meta.owner = meta.owners[0] ?? null;
  } else if (args.owner !== undefined) {
    const o = args.owner?.trim().toLowerCase() || null;
    meta.owner = o;
    meta.owners = o ? [o, ...meta.owners.filter((x) => x !== o)].slice(0, 2) : meta.owners.slice(1);
  }
  if (args.category !== undefined) meta.category = args.category;
  Object.assign(meta, patch);
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: args.oid, [F.body]: JSON.stringify({ ...base, meta: normalizeMeta(meta) }) } }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
