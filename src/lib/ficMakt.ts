import { t as tr } from '@/lib/i18nCore';
import { ENT_PORTAL, entExactUser, entSession, entStamp, entUploadPdf } from '@/lib/entDocs';
/** ⚠️ 2026-10-23: FIC · М-актын PDF item-ийн таг — баримт бичгийн сангаас ялгана (`docLib.isFmPdf`) */
export const FM_TAG = 'selbe-fm';
import { ENT_DATA } from '@/lib/services/entMap';
import { chainOf, latestPerRespNo, loadMa, type MaRow, type Verdict } from '@/lib/ma';
import { loadMir, mirVerdictFor, mirsByMa } from '@/lib/mir';
import { isAuthorFor, reviewerRolesFor } from '@/lib/chanarAcl';
import { currentUser, requireCap } from '@/lib/who';
import { AUTH } from '@/lib/services';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { fromDateInput } from '@/modules/chanar/chanarUi';

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
  await entStamp(body);
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

/**
 * ⚠️ 2026-10-21 (Enterprise руу бүрэн шилжилт): ЭХЛЭЭД ШУУД ХАЯГААР — Enterprise hosted үйлчилгээний нэр нь item-ийн
 *    нэртэй ижил (`createTable`-ийн `name`), хүснэгт `/0`. Урьд нь зөвхөн порталын ХАЙЛТААР олдог тул хүснэгт
 *    үүссэний дараах хайлтын индексийн хоцролтын үед өөр хэрэглэгч «олдсонгүй» → `createTable` → «нэр эзлэгдсэн»
 *    алдаа авдаг байв. Шууд хаяг олдохгүй (404 · хуучин нэртэй) бол хайлт руу шилжинэ.
 */
async function directTable(): Promise<string | null> {
  if (!ENT_DATA) return null;
  const url = `${ENT_DATA}/${FM_TITLE}/FeatureServer/0`;
  try {
    const m = await post<{ fields?: unknown[] }>(url, {});
    return Array.isArray(m.fields) ? url : null;
  } catch {
    return null;
  }
}

async function findTable(): Promise<string | null> {
  const direct = await directTable();
  if (direct) return direct;
  const j = await post<{ results?: { title?: string; url?: string; type?: string }[] }>(`${rest()}/search`, {
    q: `title:"${FM_TITLE}" AND type:"Feature Service"`, num: '20',
  });
  const hit = (j.results ?? []).find((x) => x.title === FM_TITLE && x.url);
  return hit?.url ? `${hit.url.replace(/\/+$/, '')}/0` : null;
}

async function createTable(): Promise<string> {
  /* ⚠️ 2026-10-21: `content/users/{u}/…` нь порталын ЯГ нэрийг шаарддаг — `sess().user` (`currentUser`) жижиг үсэгт
     хөрвүүлэгдсэн тул том үсэгтэй нэртэй зохиогчид `createService`/`share` зөрдөг байв (`entDocs.exactUser`-ийн ⚠️). */
  const user = await entExactUser();
  const avail = await post<{ available?: boolean }>(`${rest()}/portals/self/isServiceNameAvailable`, { name: FM_TITLE, type: 'Feature Service' });
  if (avail.available !== true) throw new Error(tr('«{0}» хүснэгт байгууллагад бий боловч танд харагдахгүй байна — админд мэдэгдэнэ үү (эзэмшигч нь байгууллагад хуваалцах ёстой).', FM_TITLE));
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
        name: TABLE_NAME, type: 'Table', objectIdField: 'objectid', hasAttachments: false,
        fields: [
          { name: 'objectid', type: 'esriFieldTypeOID', nullable: false, editable: false },
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

/* ⚠️ 2026-10-21: OID нь Enterprise-д `objectid` (ЖИЖИГ үсэг) — энэ модуль query.ts-ийн хөрвүүлэгчийг тойрч шууд fetch хийдэг тул
   `OBJECTID` гэж илгээвэл 500 «Field name 'OBJECTID' does not exist» (FIC · М-акт буюу чанарын 3–4-р шат огт ажиллахгүй байв).
   Хүснэгтийг ч `objectid`-тэй үүсгэнэ; уншихдаа хоёр хэлбэрийг хүлээнэ (`fmRowOf`). */
/** Хүснэгтийн мөрүүд — `where`-ээр, хуудаслалттай (`fmRowOf`) */
async function queryFm(url: string, where: string): Promise<FmRow[]> {
  const out: FmRow[] = [];
  /* ⚠️ 2026-10-09 (аудит №6): ХУУДАСЛАЛТ — урьд нь `resultRecordCount: 2000` НЭГ хүсэлт байв: 2000-аас дээш
     баримт (эсвэл үйлчилгээний `maxRecordCount` бага бол түүнээс дээш) чимээгүй алга болж, FIC/М-акт шат
     «хүлээгдэж буй» гэж худал гардаг. `chanarStore.query`-ийн загвар: `resultOffset` давталт, `orderByFields`
     ЗААВАЛ, `exceededTransferLimit`-ээр таслана (`fs.length`-ээр БИШ). */
  for (let off = 0; ; ) {
    const j = await post<{ features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean }>(`${url}/query`, {
      where, outFields: '*', orderByFields: 'objectid DESC', resultOffset: String(off), resultRecordCount: '1000',
    });
    const fs = j.features ?? [];
    out.push(...fs.map((f) => fmRowOf(f.attributes)));
    if (!j.exceededTransferLimit || fs.length === 0) break;
    off += fs.length;
  }
  return out;
}

/** Бүх FIC · М-акт. Хүснэгт хараахан үүсээгүй бол хоосон. Enterprise нэвтрэлт шаардана. */
export async function loadFm(): Promise<FmRow[]> {
  const url = await tableUrl(false);
  if (!url) return [];
  return queryFm(url, '1=1');
}

/* ═══════════════ ЭРХ · ХҮРЭЭ · ГИНЖ (серверийн өгөгдлөөр) ═══════════════ */

/**
 * ⚠️ 2026-10-09 (аудит №6): БИЧИХ ЗАМЫН ЭРХ LIB-Д. Урьд нь `addFm` · `decideFm` зөвхөн `entSession()` ба
 *    «өөрийн оруулсныг биш»-ийг шалгадаг, `chanarAuthor`/`chanarReview` эрх, багцын хүрээ, өмнөх шатны
 *    батлагдсан эсэх (`locked`) ба `pending` төлөв нь ЗӨВХӨН UI (`Ma.tsx` → `FmColumn`) байв — консолоос
 *    хэн ч батлагдсан мөрийг R болгож, хаалттай шатанд PDF оруулж чаддаг. `chanarStore.actor`/`authorDeny`
 *    ба `attachDeny`-ийн загвар: эрх `requireCap`, хүрээ `chanarAcl` (нэвтрэлт асаалттай хөтөчид л — `strict`),
 *    төлөв/гинж СЕРВЕРИЙН мөрөөс.
 * ⚠️ MA мөрийн `pkg` нь хуудасны түлхүүр («b1_9f»), чанарын ACL нь багцын бүлэг («Багц 1») — `PKGS`-ээр хөрвүүлнэ;
 *    танигдахгүй бол FAIL-CLOSED.
 */
const strict = (): boolean => typeof window !== 'undefined' && !!AUTH.appId;

async function maOf(maNo: string): Promise<{ ma: MaRow; bagts: string }> {
  const ma = latestPerRespNo(await loadMa()).find((r) => r.respNo === maNo);
  if (!ma) throw new Error(tr('«{0}» дугаартай MA олдсонгүй — баримт холбох боломжгүй.', maNo));
  const bagts = PKGS.find((p) => p.key === ma.pkg)?.group ?? '';
  if (!bagts) throw new Error(tr('MA-гийн багц ({0}) танигдсангүй — багцын хүрээг шалгах боломжгүй.', ma.pkg || '—'));
  return { ma, bagts };
}

/**
 * ⚠️ 2026-10-19 (аудит): ӨӨРИЙГӨӨ БАТЛАХ ШАЛГУУРЫН ХЭН — AGOL хэрэглэгчийн нэр (`currentUser`), эрх · хүрээтэй (`requireCap` ·
 *    `chanarAcl`) НЭГ таних тэмдэг. Урьд нь `uploaded_by`/`decided_by` нь Enterprise сешний нэр (`s.user`) байсан тул
 *    нэг хүн AGOL дээр ирүүлэгч, Enterprise-д өөр дансаар (эсвэл өөр хүний Enterprise сешнээр) нэвтэрвэл өөрийн
 *    оруулсныг батлах боломжтой байв. Enterprise нь зөвхөн ТЭЭВЭР (PDF item · хүснэгтийн токен).
 *    `currentUser` хоосон (Node / нэвтрэлт унтраалттай) бол Enterprise нэр — урьдын зан.
 */
const actorOf = (s: { user: string }): string => (currentUser() ?? s.user).trim().toLowerCase();
/** Өөрийн оруулсан мөр үү — AGOL нэр, эсвэл ХУУЧИН мөрийн Enterprise нэр (2026-10-19-нөөс өмнө бичигдсэн) */
export const isOwnUpload = (uploadedBy: string, actor: string, entUser: string): boolean => {
  const u = uploadedBy.trim().toLowerCase();
  return !!u && (u === actor.trim().toLowerCase() || u === entUser.trim().toLowerCase());
};

function scopeDeny(role: 'author' | 'review', bagts: string): void {
  if (!strict()) return;
  const me = currentUser();
  if (role === 'author' ? !isAuthorFor(me, bagts) : reviewerRolesFor(me, bagts).length === 0) {
    throw new Error(role === 'author'
      ? tr('«{0}» багцад гүйцэтгэгчийн эрхгүй — FIC · М-акт оруулах боломжгүй.', bagts)
      : tr('«{0}» багцад хянагчийн эрхгүй — FIC · М-акт батлах боломжгүй.', bagts));
  }
}

/**
 * PDF оруулж баримт нэмнэ: 1) PDF → Enterprise item (байгууллагад хуваалцсан) 2) хүснэгтэд мөр (төлөв pending).
 * ⚠️ 2-р алхам унавал item үүссэн хэвээр — алдааны мессежид item-ийн ID-г хэлнэ (дахин оруулбал давхардана).
 * ⚠️ 2026-10-09 (аудит №6): `chanarAuthor` + багцын хүрээ + ӨМНӨХ ШАТ (MA → MIR → FIC) серверийн өгөгдлөөр —
 *    `chainOf` тухайн шатыг `locked` гэвэл татгалзана (UI-ийн `locked`-той ИЖИЛ дүрэм, PDF item үүсэхээс ӨМНӨ).
 */
export async function addFm(a: { kind: FmKind; maNo: string; docNo: string; docDate: string; file: File }): Promise<{ warn?: string }> {
  const s = sess();
  requireCap('chanarAuthor');
  if (!a.maNo) throw new Error(tr('MA дугааргүй — баримт холбох боломжгүй.'));
  const { ma, bagts } = await maOf(a.maNo);
  scopeDeny('author', bagts);
  const url = await tableUrl(true);
  if (!url) throw new Error(tr('FIC · М-актын хүснэгт олдсонгүй.'));
  const [mirs, fm] = await Promise.all([loadMir(), queryFm(url, `${F.maNo} = N'${a.maNo.replace(/'/g, "''")}'`)]);
  const stage = chainOf(ma.verdict, {
    MIR: mirVerdictFor(mirsByMa(mirs).get(a.maNo)),
    FIC: fmVerdictFor(fm.filter((r) => r.kind === 'FIC')),
    MAKT: fmVerdictFor(fm.filter((r) => r.kind === 'MAKT')),
  }).find((st) => st.key === a.kind);
  if (!stage || stage.state === 'locked') {
    throw new Error(tr('Өмнөх шат батлагдаагүй — {0} оруулах боломжгүй.', a.kind === 'FIC' ? 'FIC' : tr('М-акт')));
  }
  const title = `${a.kind === 'FIC' ? 'FIC' : 'М-акт'} · ${a.docNo || a.file.name.replace(/\.pdf$/i, '')} · ${a.maNo}`;
  /* ⚠️ 2026-10-23 (хэрэглэгч: «PDF оруулах Enterprise-ийн folder-ууд»): FIC → «FIC pdf», М-акт → «m-akt pdf» хавтас; `selbe-fm` таг —
     баримт бичгийн сан (`docLib.listPdfs`) эдгээрийг ялгаж ХАРУУЛАХГҮЙ */
  const { item, warn } = await entUploadPdf(a.file, title, [FM_TAG], a.kind === 'FIC' ? 'FIC pdf' : 'm-akt pdf');
  /* ⚠️ 2026-10-09 (аудит №6): ОРОН НУТГИЙН шөнө дунд (`fromDateInput`) — урьд нь `T00:00:00Z` (UTC) тул
     бусад чанарын огноотой (`chanarUi`) 8 цагаар зөрж, өдөр хойшилж харагддаг байв. */
  const dd = fromDateInput(a.docDate);
  try {
    const j = await post<{ addResults?: { success?: boolean; error?: { description?: string } }[] }>(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: {
        [F.kind]: a.kind, [F.maNo]: a.maNo, [F.docNo]: a.docNo.slice(0, 60) || null, [F.docDate]: dd,
        [F.pdfItem]: item.id, [F.pdfName]: a.file.name.slice(0, 255), [F.status]: 'pending',
        /* ⚠️ 2026-10-19 (аудит): AGOL нэр (`actorOf`) — Enterprise сешний нэр биш */
        [F.uploadedBy]: actorOf(s), [F.uploadedAt]: Date.now(),
      } }]),
    });
    const r = j.addResults?.[0];
    if (!r?.success) throw new Error(r?.error?.description || tr('Мөр нэмэгдсэнгүй.'));
  } catch (e) {
    /* ⚠️ 2026-10-23 (UX аудит X2 · X3): хэрэглэгч геопорталын item устгах эрхгүй — «админд мэдэгдэнэ үү», ID нь админд */
    throw new Error(tr('PDF хадгалагдсан боловч бүртгэл нэмэгдсэнгүй: {1}. Дахин оруулбал давхардана — админд мэдэгдэнэ үү (файлын дугаар: {0}).', item.id, (e as Error).message));
  }
  return { warn };
}

/**
 * Батлах / буцаах. ⚠️ Өөрийн оруулсныг батлахгүй; R бол шалтгаан заавал.
 * ⚠️ 2026-10-09 (аудит №6): `chanarReview` + багцын хүрээ; мөрийг СЕРВЕРЭЭС дахин уншиж `pending` биш бол
 *    татгалзана — урьд нь батлагдсан (A) мөрийг дуудагчийн хуучин `row`-оор R болгож дахин бичих боломжтой байв.
 *    «Өөрийн оруулсныг биш»-ийг ч серверийн `uploaded_by`-оор шалгана.
 */
export async function decideFm(row: FmRow, verdict: Verdict, reason: string): Promise<void> {
  const s = sess();
  requireCap('chanarReview');
  if (verdict === 'R' && !reason.trim()) throw new Error(tr('Буцаах шалтгаанаа бичнэ үү.'));
  /* ⚠️ 2026-10-23 (UX аудит Q1): AN = «саналтай зөвшөөрсөн» — санал нь шийдвэрийн утга тул заавал (урьд нь
     хоосон саналтай AN хадгалагддаг байв). UI товчийг хаадаг ч сервер рүү бичихийн өмнө энд дахин шалгана. */
  if (verdict === 'AN' && !reason.trim()) throw new Error(tr('AN шийдвэрт саналаа бичнэ үү.'));
  const url = await tableUrl(false);
  if (!url) throw new Error(tr('FIC · М-актын хүснэгт олдсонгүй.'));
  /* Багцын хүрээ ба өмнөх шатыг шалгасны дараа мөрийг дахин уншина. Эцсийн бичилт нь
     доорх /calculate-ийн WHERE-ээр сервер дээр тэр төлөвийг нэг UPDATE дотор шалгана. */
  const { ma, bagts } = await maOf(row.maNo);
  scopeDeny('review', bagts);
  /* ⚠️ 2026-10-12 (дарааллын аудит): ГИНЖИЙН ШАТ ХААЛТТАЙ бол ШИЙДВЭР ГАРГАХГҮЙ (`addFm`-ийн ижил `chainOf` шалгалт).
     Урьд нь зөвхөн оруулахад шалгадаг тул оруулсны ДАРАА өмнөх шат буцаагдсан (MIR R → FIC `locked`, FIC R → М-акт
     `locked`) бол хянагч хаалттай шатны баримтыг батлаж, `ipcReady` гинжийг дундуур нь нөхөх боломжтой байв. Хүлээж
     буй шат (`next`/`pending`) — шийдвэрлэж болно. Уншилт `pending` уншилтаас ӨМНӨ (дээрх 2026-10-11-ний завсрын дүрэм). */
  const [mirs, fmAll] = await Promise.all([loadMir(), queryFm(url, `${F.maNo} = N'${row.maNo.replace(/'/g, "''")}'`)]);
  const stage = chainOf(ma.verdict, {
    MIR: mirVerdictFor(mirsByMa(mirs).get(row.maNo)),
    FIC: fmVerdictFor(fmAll.filter((r) => r.kind === 'FIC')),
    MAKT: fmVerdictFor(fmAll.filter((r) => r.kind === 'MAKT')),
  }).find((st) => st.key === row.kind);
  if (!stage || stage.state === 'locked') {
    throw new Error(tr('Өмнөх шат батлагдаагүй — {0} шийдвэрлэх боломжгүй.', row.kind === 'FIC' ? 'FIC' : tr('М-акт')));
  }
  if (!Number.isSafeInteger(row.oid) || row.oid <= 0) throw new Error(tr('Баримт олдсонгүй — устгагдсан байж магадгүй.'));
  const fresh = (await queryFm(url, `objectid = ${Number(row.oid)}`))[0];
  if (!fresh) throw new Error(tr('Баримт олдсонгүй — устгагдсан байж магадгүй.'));
  /* ⚠️ 2026-10-19 (аудит): AGOL нэрээр (`actorOf`) — хуучин мөрийн Enterprise нэртэй ч тулгана (`isOwnUpload`) */
  const actor = actorOf(s);
  if (isOwnUpload(fresh.uploadedBy, actor, s.user)) throw new Error(tr('Өөрийн оруулсан баримтыг өөрөө батлах боломжгүй.'));
  if (fresh.status !== 'pending') throw new Error(tr('Баримт аль хэдийн шийдвэрлэгдсэн ({0}) — дахин шийдвэрлэхгүй.', fresh.status));
  if (fresh.maNo !== row.maNo || fresh.kind !== row.kind) {
    throw new Error(tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу'));
  }
  /* Never publish a claim into decided_by/decided_at: a delayed claim can overwrite
     an already completed decision's attribution. No unconditional fallback. */
  const meta = await post<{ supportsCalculate?: boolean; fields?: { name?: string }[] }>(url, {});
  const fields = new Set((meta.fields ?? []).map((f) => f.name?.toLowerCase()));
  const guarded = [F.status, F.reason, F.decidedBy, F.decidedAt, F.kind, F.maNo, F.uploadedBy];
  if (meta.supportsCalculate !== true || !['objectid', ...guarded].every((f) => fields.has(f))) {
    throw new Error(tr('Зэрэг өөрчлөлтийг хамгаалах бичилт дэмжигдээгүй — админд мэдэгдэнэ үү.'));
  }
  const quote = (v: string) => `N'${v.replace(/'/g, "''")}'`;
  const textIs = (field: string, value: string) => value === ''
    ? `(${field} IS NULL OR ${field} = '')` : `${field} = ${quote(value)}`;
  const where = [
    `objectid = ${fresh.oid}`, `${F.status} = 'pending'`,
    textIs(F.reason, fresh.reason), textIs(F.decidedBy, fresh.decidedBy),
    textIs(F.kind, fresh.kind), textIs(F.maNo, fresh.maNo), textIs(F.uploadedBy, fresh.uploadedBy),
    fresh.decidedAt == null ? `${F.decidedAt} IS NULL`
      : `${F.decidedAt} = timestamp '${new Date(fresh.decidedAt).toISOString().replace('T', ' ').replace('Z', '')}'`,
  ].join(' AND ');
  const patch = {
    [F.status]: verdict, [F.reason]: reason.trim().slice(0, FM_REASON_MAX) || null,
    [F.decidedBy]: actor, [F.decidedAt]: Date.now(),
  };
  const result = await post<{ success?: boolean; updatedFeatureCount?: number }>(`${url}/calculate`, {
    where, sqlFormat: 'standard',
    calcExpression: JSON.stringify(Object.entries(patch).map(([field, value]) => ({ field, value }))),
  });
  if (result.success !== true || !Number.isInteger(result.updatedFeatureCount)
    || Number(result.updatedFeatureCount) < 0 || Number(result.updatedFeatureCount) > 1) {
    throw new Error(tr('Шийдвэр хадгалагдсан эсэх тодорхойгүй — серверээс үр дүн дутуу ирлээ. Жагсаалт шинэчлэгдсэний дараа шалгана уу.'));
  }
  if (result.updatedFeatureCount === 0) throw new Error(tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу'));
}
