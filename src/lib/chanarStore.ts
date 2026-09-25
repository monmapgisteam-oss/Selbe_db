'use client';

/**
 * ЧАНАРЫН БАРИМТЫН ХАДГАЛАЛТ — ArcGIS хүснэгт `Selbe_Chanar_Barimt`.
 * Цэвэр урсгалын логик нь `chanarMs.ts`-д; энд ЗӨВХӨН унших, бичих.
 *
 * ⚠️ НЭГ ХҮСНЭГТ, ТАВАН ТӨРӨЛ (`kind`: MS · MA · MIR · FIC · NCR). Зураглалын
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
  MS_STATUS, REVIEWERS, isMsStatus, emptyReviews, docNo, nextSeq, orgCode,
  review as reviewPure, submit as submitPure,
  type MsDoc, type MsBody, type Reviewer, type Review, type Verdict, EMPTY_BODY,
} from './chanarMs';
import { isAuthorFor, reviewerRolesFor } from './chanarAcl';
import { tokenParam, authToken } from '@/lib/authToken';
import { currentUser } from './who';

const TITLE = 'Selbe_Chanar_Barimt';
const TABLE_NAME = 'chanar_barimt';

/** Баримтын төрөл — одоо MS, дараа нь бусад */
export type DocKind = 'MS' | 'MA' | 'MIR' | 'FIC' | 'NCR';

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
export function parseReviews(raw: unknown): Record<Reviewer, Review | null> {
  const out = emptyReviews();
  try {
    const j = JSON.parse(String(raw ?? '{}')) as Record<string, Partial<Review>>;
    if (!j || typeof j !== 'object') return out;
    for (const r of REVIEWERS) {
      const v = j[r];
      if (!v || typeof v !== 'object') continue;
      const who = s(v.who)?.toLowerCase();
      const at = n(v.at);
      const verdict = v.verdict === 'Зөвшөөрсөн' || v.verdict === 'Татгалзсан' ? v.verdict : null;
      if (!who || !at || !verdict) continue;
      out[r] = { who, at, verdict: verdict as Verdict, note: s(v.note) };
    }
  } catch { /* эвдэрсэн → хоосон */ }
  return out;
}

function toDoc(a: Attrs): MsDoc | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const st = s(a[F.status]);
  if (!isMsStatus(st)) return null;
  const bagts = s(a[F.bagts]);
  const seq = Number(a[F.seq]);
  const rev = Number(a[F.rev]);
  if (!bagts || !Number.isInteger(seq) || !Number.isInteger(rev)) return null;
  return {
    oid,
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

/** (bagts, seq)-д `rev`-ээс дээш эсвэл тэнцүү хувилбар аль хэдийн бий юу */
async function newerExists(bagts: string, seq: number, rev: number): Promise<boolean> {
  const rows = await query(`${F.bagts} = N'${bagts.replace(/'/g, "''")}' AND ${F.seq} = ${Number(seq)} AND ${F.rev} >= ${Number(rev)}`, F.oid);
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
  if (doc.status !== MS_STATUS.draft && doc.status !== MS_STATUS.returned) return tr('Зөвхөн ноорог эсвэл буцаагдсан баримтын хавсралтыг өөрчилнө.');
  const me = currentUser();
  if (typeof window !== 'undefined' && AUTH.appId && doc.author.trim().toLowerCase() !== me) return tr('Зөвхөн зохиогч хавсралт өөрчилнө.');
  /* ⚠️ ХУУЧИН ХУВИЛБАР ХААЛТТАЙ (2026-09-25 аудит): `Chanar.tsx` хавсралтыг
     БҮХ хувилбараас цуглуулж харуулдаг тул rev0 (буцаагдсан) дээрх гэрчилгээг
     rev1 батлагдсаны ДАРАА солих боломжтой байв — батлагдсан баримтын нотолгоо
     чимээгүй өөрчлөгдөнө. Шинэ хувилбар байвал зөвхөн сүүлийнх нь засагдана. */
  if (await newerExists(doc.bagts, doc.seq, doc.rev + 1)) return tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.');
  return null;
}

/** Тухайн төрлийн БҮХ баримт (бүх хувилбар) — `chanarMs.latest`-ээр нурааж болно */
export async function loadDocs(kind: DocKind = 'MS'): Promise<MsDoc[]> {
  const rows = await query(`${F.kind} = '${kind}'`, HEAD);
  return rows.map(toDoc).filter((x): x is MsDoc => x != null);
}

/** Нэг баримтын БИЕ — засах/харахад л татна */
export async function loadBody(oid: number): Promise<MsBody | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.body}`);
  if (!rows.length) return null;
  return parseBody(rows[0][F.body]);
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

type Result = { ok: true; oid: number } | { ok: false; error: string };

/* ══════════════════════ Бичих ══════════════════════ */

/**
 * ШИНЭ НООРОГ — гүйцэтгэгч эхлүүлнэ (1-р алхам). `seq` автомат.
 * ⚠️ `docNo` нь `chanarMs.docNo`-оос — гараар өгөх боломж ОГТ БАЙХГҮЙ.
 */
export async function createDraft(args: {
  kind?: DocKind; bagts: string; title: string; author: string; body: MsBody;
}): Promise<Result> {
  const kind = args.kind ?? 'MS';
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй — админд хандана уу.') };
  const org = orgCode(args.bagts);
  if (!org) return { ok: false, error: tr('«{0}» багцын гүйцэтгэгчийн код тодорхойгүй.', args.bagts) };
  /* ⚠️ ЭРХИЙГ ЭНД Ч ШАЛГАНА (2026-09-16 аудит): урьд нь зөвхөн UI (`canAct`)
     шалгадаг байв — консолоос дуудсан хэн ч мөр үүсгэж чаддаг байлаа. */
  if (!isAuthorFor(args.author, args.bagts)) return { ok: false, error: tr('Энэ багцад аргачлал ирүүлэх эрхгүй.') };
  const existing = await loadDocs(kind);
  const seq = nextSeq(existing, args.bagts);
  const no = docNo(args.bagts, seq, 0, kind);
  if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
  const attrs: Attrs = {
    [F.kind]: kind,
    [F.docNo]: no,
    [F.org]: org,
    [F.bagts]: args.bagts,
    [F.seq]: seq,
    [F.rev]: 0,
    [F.title]: args.title.trim(),
    [F.status]: MS_STATUS.draft,
    [F.author]: args.author.trim().toLowerCase(),
    [F.reviews]: JSON.stringify(emptyReviews()),
    [F.body]: JSON.stringify(args.body),
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]), rollbackOnFailure: 'true',
    });
    const r = (j.addResults as { success?: boolean; objectId?: number }[])?.[0];
    if (!(r?.success && r.objectId != null)) return { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    /* ⚠️ ДУГААРЫН ДАВХАРДАЛ (2026-09-16 аудит): `nextSeq` клиентэд бодогддог,
       ArcGIS-д unique хязгаар ҮГҮЙ. Хоёр зохиогч нэг багцад зэрэг үүсгэвэл ижил
       `seq` → `latest()` нэгийг нь ЖАГСААЛТААС НУУДАГ. Бичсэний ДАРАА тулгаж,
       ХОЖУУ (их OBJECTID) нь дараагийн дугаарт шилжинэ — эхнийх хөндөгдөхгүй. */
    const after = await loadDocs(kind);
    const twins = after.filter((d) => d.bagts === args.bagts && d.seq === seq && d.rev === 0);
    if (twins.length > 1 && Math.min(...twins.map((d) => d.oid)) !== r.objectId) {
      const seq2 = nextSeq(after, args.bagts);
      const no2 = docNo(args.bagts, seq2, 0, kind);
      if (no2) {
        const j2 = await req(`${url}/applyEdits`, {
          updates: JSON.stringify([{ attributes: { [F.oid]: r.objectId, [F.seq]: seq2, [F.docNo]: no2 } }]),
          rollbackOnFailure: 'true',
        });
        if (!editOk(j2.updateResults)) return { ok: false, error: tr('Давхардсан дугаарыг засаж чадсангүй — дахин оролдоно уу.') };
      }
    }
    return { ok: true, oid: r.objectId };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * НООРОГ ЗАСАХ — гарчиг, бие. Зөвхөн `draft`/`returned` төлөвт, зөвхөн зохиогч.
 * ⚠️ Серверийн мөрөөс шалгана — дуудагчийн өгсөн төлөвт найдахгүй.
 */
export async function saveDraft(args: {
  oid: number; who: string; title: string; body: MsBody;
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  if (doc.author.trim().toLowerCase() !== args.who.trim().toLowerCase()) return { ok: false, error: tr('Зөвхөн зохиогч засна.') };
  if (doc.status !== MS_STATUS.draft && doc.status !== MS_STATUS.returned) {
    return { ok: false, error: tr('Хянагдаж буй эсвэл батлагдсан баримтыг засах боломжгүй.') };
  }
  try {
    if (doc.status === MS_STATUS.draft) {
      /* Ноорог — ижил мөрийг шинэчилнэ */
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: {
          [F.oid]: args.oid, [F.title]: args.title.trim(), [F.body]: JSON.stringify(args.body),
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
    const kind = (s(cur[0][F.kind]) ?? 'MS') as DocKind;
    const rev = doc.rev + 1;
    /* ⚠️ ХУУЧИН буцаагдсан мөрөөс дахин засварлахыг хориглоно (2026-09-17): түүхээс
       rev N-ийг сонгоод засвал rev N+1 ДАВХАР үүсч, `latest()` нэгийг нь нуудаг байв. */
    if (await newerExists(doc.bagts, doc.seq, rev)) return { ok: false, error: tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.') };
    const no = docNo(doc.bagts, doc.seq, rev, kind);
    if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
    const attrs: Attrs = {
      [F.kind]: kind, [F.docNo]: no, [F.org]: doc.org, [F.bagts]: doc.bagts,
      [F.seq]: doc.seq, [F.rev]: rev, [F.title]: args.title.trim(),
      [F.status]: MS_STATUS.draft, [F.author]: doc.author,
      [F.reviews]: JSON.stringify(emptyReviews()), [F.body]: JSON.stringify(args.body),
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
export async function submitDoc(args: { oid: number; who: string }): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, '*');
  if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй.') };
  const doc = toDoc(cur[0]);
  if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
  const r = submitPure(doc, { who: args.who });
  if (!r.ok) return r;

  try {
    if (r.rev === doc.rev) {
      /* Анхны илгээлт — ижил мөрийг шинэчилнэ */
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: {
          [F.oid]: args.oid, [F.status]: r.status, [F.sentAt]: r.sentAt,
          [F.reviews]: JSON.stringify(r.reviews), [F.decidedAt]: null,
        } }]),
        rollbackOnFailure: 'true',
      });
      return editOk(j.updateResults) ? { ok: true, oid: args.oid } : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
    }
    /* Дахин илгээлт — ШИНЭ мөр, шинэ дугаар (rev+1) */
    const kind = (s(cur[0][F.kind]) ?? 'MS') as DocKind;
    if (await newerExists(doc.bagts, doc.seq, r.rev)) return { ok: false, error: tr('Энэ баримтын шинэ хувилбар аль хэдийн бий — жагсаалтаас сүүлийн хувилбарыг нээнэ үү.') };
    const no = docNo(doc.bagts, doc.seq, r.rev, kind);
    if (!no) return { ok: false, error: tr('Баримтын дугаар үүсгэж чадсангүй.') };
    const attrs: Attrs = {
      [F.kind]: kind, [F.docNo]: no, [F.org]: doc.org, [F.bagts]: doc.bagts,
      [F.seq]: doc.seq, [F.rev]: r.rev, [F.title]: doc.title,
      [F.status]: r.status, [F.author]: doc.author, [F.sentAt]: r.sentAt,
      [F.reviews]: JSON.stringify(r.reviews), [F.body]: cur[0][F.body] ?? '{}',
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
}): Promise<Result> {
  const url = await tableUrl(false);
  if (!url) return { ok: false, error: tr('Чанарын баримтын хүснэгт олдсонгүй.') };
  const me = args.who.trim().toLowerCase();
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
   */
  let last: Result = { ok: false, error: tr('Шийдвэр хадгалагдсангүй.') };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cur = await query(`${F.oid} = ${Number(args.oid)}`, HEAD);
    if (!cur.length) return { ok: false, error: tr('Баримт олдсонгүй — устгагдсан байж магадгүй.') };
    const doc = toDoc(cur[0]);
    if (!doc) return { ok: false, error: tr('Баримтын мөр эвдэрсэн.') };
    /* ⚠️ ҮҮРГИЙГ ЭНД Ч ШАЛГАНА — `canAct`-ийн «консолоос дуудсан ч энэ л барина»
       гэсэн амлалт ACL-ийн хувьд UI-д л үнэн байв. */
    if (!reviewerRolesFor(args.who, doc.bagts).includes(args.as)) {
      return { ok: false, error: tr('Энэ багцад «{0}» үүргээр хянах эрхгүй.', args.as) };
    }
    const r = reviewPure(doc, { as: args.as, who: args.who, verdict: args.verdict, note: args.note });
    if (!r.ok) return r;
    const decided = r.status === MS_STATUS.approved || r.status === MS_STATUS.returned;
    try {
      const j = await req(`${url}/applyEdits`, {
        updates: JSON.stringify([{ attributes: {
          [F.oid]: args.oid,
          [F.status]: r.status,
          [F.reviews]: JSON.stringify(r.reviews),
          [F.decidedAt]: decided ? Date.now() : null,
        } }]),
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
      if (await mineSurvives(args.oid, args.as, me)) return { ok: true, oid: args.oid };
    }
    last = { ok: false, error: tr('Өөр хянагч зэрэг бичсэн тул шийдвэр дахин хадгалагдаж чадсангүй — дахин оролдоно уу.') };
  }
  return last;
}
