'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАТЛАХ УРСГАЛ — менежер мөр нэмнэ, батлагч батална.
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ БОЛОВ (2026-09-22, хэрэглэгчийн шийдвэр): «Гүйцэтгэл
 * бөглөх» хуудсанд `addRow` эрхтэй хүн ШИНЭ АЖЛЫН МӨР нэмж чаддаг бөгөөд тэр
 * мөр нь гүйцэтгэлийн илгээлттэй ХАМТ (`SubmissionPayload.adds`) явж, 4 шатат
 * урсгалаар батлагддаг байв. Гэвч тэр урсгал нь ГҮЙЦЭТГЭЛИЙН ТООГ хэмждэг —
 * «энэ ажил гэрээнд ЕРӨӨС байх ёстой юу» гэдгийг ХЭН Ч тусад нь шийддэггүй.
 * Үр дүнд нь шинэ ажил гүйцэтгэлийн тоонуудын хамт чимээгүй батлагдаж,
 * гэрээний хамрах хүрээ өөрөө хянагдалгүй өсдөг байлаа.
 *
 * ⚠️ ТИЙМЭЭС ТУСДАА УРСГАЛ: мөр нэмэгч илгээнэ → батлагч хараад батална →
 * тэр үед л үндсэн өгөгдөлд мөр үүснэ. Хүртэл мөр нь ЗӨВХӨН энэ хүснэгтэд
 * хүлээнэ, дашбоард/тайлан/тооцоонд ОГТ нөлөөлөхгүй.
 *
 * ⚠️ ГҮЙЦЭТГЭЛИЙН УРСГАЛААС (`hyanalt.ts`) ТУСДАА. Тэр нь БОДИТ гүйцэтгэлийн
 * 4 шатат урсгал (компани → инженер → менежер → захирал), энэ нь ГЭРЭЭНИЙ
 * ХАМРАХ ХҮРЭЭНИЙ 2 шатат урсгал. Хольвол «тоог зөвшөөрсөн» нь «шинэ ажлыг
 * зөвшөөрсөн» гэж уншигдаж, хариуцлага замхарна.
 *
 * ⚠️ ОБЬЁМЫН УРСГАЛААС (`obyemBatlah.ts`) МӨН ТУСДАА. Тэр нь БАЙГАА мөрийн
 * төлөвлөсөн обьёмыг («хэр их»), энэ нь мөр ӨӨРӨӨ байх эсэхийг («юу») шийднэ.
 * Мөн `obyemBatlah` нь багц бүрд ЗӨВХӨН НЭГ хүлээгдэж буй илгээлт зөвшөөрдөг
 * тул хоёрыг нийлүүлбэл обьём буцаагдахад шинэ ажил ч гацна.
 *
 * ⚠️ ХАДГАЛАЛТ: ӨӨРИЙН ArcGIS хүснэгт (`Selbe_Ajil_Batlah_csv`). Хэрэглэгч
 * CSV-ээс AGOL дээр ӨӨРӨӨ нийтэлсэн (2026-09-22) тул энэ модуль хүснэгт
 * ҮҮСГЭХГҮЙ — зөвхөн олж ашиглана. Давхаргын дугаар нь `0` БИШ (доорх
 * `LAYER_ID`-ийн ⚠️-г үз).
 *
 * ⚠️ FAIL-CLOSED: хүснэгт уншигдахгүй бол «батлагдсан» гэж ҮЗЭХГҮЙ.
 */

import { AUTH, ROLE_BY_USER } from './services';
import { ajilScope } from './ajilAcl';
import { t as tr } from '@/lib/i18nCore';
import { tokenParam } from '@/lib/authToken';
import { currentUser, requireCap } from './who';
import type { NewRow } from './submission';

/** Илгээлтийн төлөв */
export const AJIL_STATUS = {
  /** Мөр нэмэгч илгээсэн — батлагчийг хүлээж байна */
  pending: 'Хүлээгдэж буй',
  approved: 'Батлагдсан',
  returned: 'Буцаагдсан',
  /** Зохиогч өөрөө буцааж авсан — `withdrawAjil` */
  withdrawn: 'Татсан',
  /**
   * Батлагдсан БА «Гүйцэтгэл бөглөх» хуудас мөрүүдийг аль хэдийн
   * буулгасан.
   *
   * ⚠️ `approved`-ООС ЯЛГААТАЙ БАЙХ ЁСТОЙ: хуудас нээгдэх бүрд
   *    `loadApproved` нь батлагдсан илгээлтийг татдаг тул тэмдэглэхгүй
   *    бол ИЖИЛ мөрүүд дахин дахин нэмэгдэнэ. Локал тэмдэглэгээ
   *    хангалтгүй — өөр компьютер дээр дахин буух тул төлөв нь
   *    СЕРВЕРТ байна.
   */
  applied: 'Буулгасан',
} as const;
export type AjilStatus = (typeof AJIL_STATUS)[keyof typeof AJIL_STATUS];

/**
 * НЭГ ИЛГЭЭЛТИЙН АГУУЛГА — нэмэхээр хүлээж буй мөрүүд.
 *
 * ⚠️ `adds` нь `submission.NewRow[]` — «Гүйцэтгэл бөглөх» хуудасны нэмсэн
 *    мөртэй ЯГ ИЖИЛ хэлбэр. Өөрийн төрөл зохиовол хоёр тал зөрж, батлагдсан
 *    мөрийг эх хуудсанд буулгах үед эцэг нь олдохоо болино.
 * ⚠️ Эцгийг ObjectID-гаар БИШ, (№ + ажлын нэр) хосоор санана — батлахад
 *    хуудас хуулбарлагдаж бүх мөр ШИНЭ ObjectID авдаг (`NewRow`-ийн ⚠️).
 */
export type AjilPayload = {
  v: 1;
  pkgKey: string;
  adds: NewRow[];
};

/** НЭГ ИЛГЭЭЛТ — нэг багцад нэмэх мөрүүдийн багц */
export type AjilSubmission = {
  oid: number;
  /** Багцын түлхүүр (`Pkg.key`) — жишээ нь `b2_9f` */
  pkgKey: string;
  /** Багцын БҮЛЭГ (`Pkg.group`) — эрхийн хүрээ үүгээр шалгагдана */
  pkgGroup: string;
  status: AjilStatus;
  /** Илгээсэн хүн (ArcGIS-ийн нэр, жижиг үсгээр) */
  author: string;
  authorSent: number | null;
  approver: string | null;
  approverAt: number | null;
  reason: string | null;
  note: string | null;
  /** Хэдэн мөр нэмэгдэх — жагсаалтад харуулах */
  rowCount: number;
  /** Түүхий JSON — `parsePayload`-аар задарна */
  payload: string;
};

const TITLE = 'Selbe_Ajil_Batlah_csv';

/**
 * ⚠️ ДАВХАРГЫН ДУГААР 219, `0` БИШ (2026-09-22). Бусад батлах модулиуд
 *    хүснэгтээ ӨӨРСДӨӨ `createService`-ээр үүсгэдэг тул давхарга нь үргэлж
 *    `/0` байдаг. Энэ хүснэгтийг хэрэглэгч CSV-ээс AGOL дээр нийтэлсэн
 *    бөгөөд тэр үйлчилгээнд давхаргын дугаарыг AGOL өөрөө өгсөн. `/0` гэж
 *    таамаглавал «Layer not found» гарна.
 */
const LAYER_ID = 219;

/**
 * Талбарын нэр — амьд үйлчилгээтэй ЯГ тохирно.
 * ⚠️ `docs/csv/Selbe_Ajil_Batlah.csv`-ийн толгойтой ижил байх ЁСТОЙ —
 *    хүснэгт тэр файлаас нийтлэгдсэн.
 */
export const F = {
  oid: 'OBJECTID',
  pkgKey: 'bagts_key',
  pkgGroup: 'bagts_group',
  status: 'toloh',
  author: 'zohiogch',
  authorSent: 'ilgeesen_ognoo',
  approver: 'batlagch',
  approverAt: 'shiidver_ognoo',
  reason: 'butsaasan_shaltgaan',
  note: 'tailbar',
  rowCount: 'mor_too',
  payload: 'aguulga',
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

/**
 * ArcGIS REST дуудлага.
 * ⚠️ ArcGIS алдаагаа HTTP 200 + `{error:{…}}` биеэр буцаадаг — шалгахгүй бол
 * «амжилттай хадгаллаа» гэж ХУДЛААР мэдээлнэ.
 */
async function req(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  /* ⚠️ Хүснэгт Organization-only — нэвтэрсэн хэрэглэгчийн токен ЗААВАЛ. */
  const body = new URLSearchParams({ f: 'json', ...tokenParam(), ...params });
  const r = await fetch(url, { method: 'POST', body });
  if (!r.ok) throw new Error(`ArcGIS HTTP ${r.status}`);
  const j = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || 'ArcGIS error');
  return j;
}

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u.toLowerCase()),
);

/**
 * ХУУЧИН ЭЗЭД — `ROLE_BY_USER`-ээс хасагдсан ч хүснэгтийг үүсгэсэн байж
 * болох аккаунтууд (`obyemBatlah.FORMER_TABLE_OWNERS`-ийн загвар).
 *
 * ⚠️ Энд нэмэх нь ЗӨВХӨН УНШИХ эрхийг нээнэ: хүснэгт өөрөө AGOL дээр
 *    хуваалцагдсан хэвээр, бичих эрх нь тэндээс хамаарна.
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([
  ...SUPER_OWNERS,
  ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase()),
]);

let tableUrlCache: string | undefined;
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт — анхааруулга */
let ownerMismatch = false;

/**
 * ⚠️ ЭЗНИЙГ ШАЛГАНА: title хайлт нь org доторх ХЭНИЙ Ч үүсгэсэн ижил нэртэй
 * item-ыг буцааж болно. Хуурамч хүснэгт үүсгэсэн хүн бүх багцад шинэ ажил
 * батлах зам нээх байлаа.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /* ⚠️ 100 — хэн нэгэн 10+ хуурамч item үүсгэвэл ЖИНХЭНЭ хүснэгт эхний
       10-т багтахаа больж, бүх клиентийн урсгал УНТАРНА (`permsRemote`). */
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  /* ⚠️ Нийтэд нээлттэй эсэхийг ЭНД барина — `access` нь хайлтын хариунд
     хамт ирдэг тул нэмэлт хүсэлт хэрэггүй. */
  if (String(hit?.access ?? '') === 'public') {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч`,
      'батлах мөрийг засаж чадна. AGOL дээр Share-ийг «Organization» болгоно уу.',
    );
  }
  ownerMismatch = !hit && same.length > 0;
  if (ownerMismatch) {
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй:`,
      same.map((x) => x.owner).join(', '), '— super-т reassign хийнэ үү',
    );
  }
  return hit?.url ? `${hit.url}/${LAYER_ID}` : null;
}

/**
 * Хүснэгтийн URL.
 *
 * ⚠️ ҮҮСГЭХ ЗАМ БАЙХГҮЙ (2026-09-22) — `obyemBatlah`/`huvaariBatlah`-аас
 *    ялгаатай. Хүснэгтийг хэрэглэгч AGOL дээр ӨӨРӨӨ нийтэлсэн бөгөөд
 *    давхаргын дугаар (219), талбарын төрөл (`aguulga` 1,048,576 ·
 *    `shiidver_ognoo` Date) нь тэнд тохируулагдсан. Энэ модулиас дахин
 *    үүсгэвэл `/0` давхаргатай ХОЁР ДАХЬ ижил нэртэй үйлчилгээ гарч,
 *    `findTableUrl` аль нэгийг санамсаргүй сонгоно.
 * ⚠️ Зөвхөн ОЛДСОН URL-ыг кэшлэнэ: `null`-ыг кэшлэвэл порталын search-ийн
 *    түр зуурын алдаа сешн даяар тогтмолжино.
 */
async function tableUrl(): Promise<string | null> {
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  const url = await findTableUrl(auth.token);
  if (url) tableUrlCache = url;
  return url;
}

/**
 * ХҮСНЭГТ БЭЛЭН ҮҮ — ба ҮГҮЙ бол ЯАГААД.
 *
 * ⚠️ `huvaariBatlah.planTableState`-ийн загвар: зөвхөн `boolean` буцаавал
 *    гурван огт өөр шалтгаан нэг л «олдсонгүй» мессеж болж нийлж, админ
 *    юуг засахаа мэдэхгүй болно (2026-09-11-ний сургамж).
 * ⚠️ `none` нь ЭНД ӨӨР УТГАТАЙ: бусад батлах модульд «super нэвтрэхэд
 *    автоматаар үүснэ» гэсэн үг, харин энэ хүснэгтийг хэрэглэгч AGOL дээр
 *    ӨӨРӨӨ нийтэлсэн тул үүсгэх зам БАЙХГҮЙ — админд өөр зөвлөгөө хэрэгтэй.
 */
export type AjilTableState = {
  ok: boolean;
  /**
   * `auth`   — ArcGIS-д нэвтрээгүй (токен алга)
   * `owner`  — ижил нэртэй хүснэгт бий ч эзэн нь танигдахгүй
   * `none`   — хүснэгт олдсонгүй (AGOL дээр нийтлэх шаардлагатай)
   * `error`  — порталын хайлт алдаа өгсөн (мессеж нь `detail`-д)
   */
  why: 'ok' | 'auth' | 'owner' | 'none' | 'error';
  detail?: string;
};

export async function ajilTableState(): Promise<AjilTableState> {
  try {
    /* ⚠️ Токеныг ТУСАД НЬ шалгана: `tableUrl` нь токенгүй үед ч зүгээр
       `null` буцаадаг тул «нэвтрээгүй» ба «олдсонгүй» хоёр ялгагдахгүй. */
    if (!(await getToken())) return { ok: false, why: 'auth' };
    const url = await tableUrl();
    if (url) return { ok: true, why: 'ok' };
    return { ok: false, why: ownerMismatch ? 'owner' : 'none' };
  } catch (e) {
    return { ok: false, why: 'error', detail: String((e as Error)?.message ?? e) };
  }
}

/** Хүснэгт бэлэн эсэх — нимгэн бүрхүүл */
export async function ajilTableReady(): Promise<boolean> {
  return (await ajilTableState()).ok;
}

type Attrs = Record<string, unknown>;

const s = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

function toSubmission(a: Attrs): AjilSubmission | null {
  const oid = Number(a[F.oid]);
  if (!Number.isInteger(oid)) return null;
  const pkgKey = s(a[F.pkgKey]);
  if (!pkgKey) return null;
  const st = s(a[F.status]);
  const known = Object.values(AJIL_STATUS).find((x) => x === st);
  if (!known) return null;
  const n = (v: unknown): number | null => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return {
    oid,
    pkgKey,
    pkgGroup: s(a[F.pkgGroup]) ?? '',
    status: known,
    author: (s(a[F.author]) ?? '').toLowerCase(),
    authorSent: n(a[F.authorSent]),
    approver: s(a[F.approver])?.toLowerCase() ?? null,
    approverAt: n(a[F.approverAt]),
    reason: s(a[F.reason]),
    note: s(a[F.note]),
    rowCount: Number(a[F.rowCount]) || 0,
    payload: String(a[F.payload] ?? ''),
  };
}

async function query(where: string, outFields: string): Promise<Attrs[]> {
  const url = await tableUrl();
  if (!url) return [];
  const out: Attrs[] = [];
  for (let off = 0; ; off += 1000) {
    const j = await req(`${url}/query`, {
      where,
      outFields,
      returnGeometry: 'false',
      /* ⚠️ Хуудаслалтад `orderByFields` ЗААВАЛ — эс бөгөөс ArcGIS хуудас
         хооронд мөр давхардуулах/алгасах эрхтэй. */
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

/** Бүх илгээлтийн ТОЛГОЙ — `payload`-гүй (жагсаалт хөнгөн байх ёстой) */
const HEAD_FIELDS = [
  F.oid, F.pkgKey, F.pkgGroup, F.status, F.author, F.authorSent,
  F.approver, F.approverAt, F.reason, F.note, F.rowCount,
].join(',');

/**
 * Багцын хүлээгдэж буй илгээлт.
 *
 * ⚠️ Зөвхөн `pending` нь шинэ илгээлтийг ТҮГЖИНЭ. `approved`/`returned`/
 *    `withdrawn` нь түүх тул дахин илгээж болно.
 */
export async function loadPending(pkgKey: string): Promise<AjilSubmission | null> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${AJIL_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
  /* ⚠️ Хэд хэдэн pending үүссэн бол (зэрэгцээ илгээлтийн race) СҮҮЛИЙНХ ялна */
  return list.length ? list[list.length - 1] : null;
}

/** Батлагчийн жагсаалт — хүлээгдэж буй БҮХ илгээлт */
export async function loadAllPending(): Promise<AjilSubmission[]> {
  const rows = await query(`${F.status} = N'${AJIL_STATUS.pending}'`, HEAD_FIELDS);
  return rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
}

/** Багцын түүх — сүүлийн шийдвэрүүд (батлагдсан · буцаагдсан · татсан) */
export async function loadHistory(pkgKey: string, limit = 20): Promise<AjilSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} <> N'${AJIL_STATUS.pending}'`,
    HEAD_FIELDS,
  );
  const list = rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
  return list.slice(-limit).reverse();
}

/**
 * БАТЛАГДСАН, гэвч хуудсанд хараахан БУУГААГҮЙ илгээлтүүд.
 *
 * ⚠️ «Гүйцэтгэл бөглөх» хуудас нээгдэхдээ дуудна: батлах нь ТУСДАА
 *    хуудсанд болдог бөгөөд тэр хуудас `FillNew`-ийн `adds` төлөвт
 *    хүрч чадахгүй (React state). Тиймээс энэ тал нь ӨӨРӨӨ татна.
 * ⚠️ Олон байж БОЛНО: батлагч хэд хэдэн илгээлтийг дараалан баталсан
 *    байж мэднэ — бүгдийг нь буулгана.
 */
export async function loadApproved(pkgKey: string): Promise<AjilSubmission[]> {
  const esc = pkgKey.replace(/'/g, "''");
  const rows = await query(
    `${F.pkgKey} = '${esc}' AND ${F.status} = N'${AJIL_STATUS.approved}'`,
    HEAD_FIELDS,
  );
  return rows.map(toSubmission).filter((x): x is AjilSubmission => x != null);
}

/**
 * БУУЛГАСАН гэж тэмдэглэх — `loadApproved` дахин буцаахгүй болно.
 *
 * ⚠️ ЗӨВХӨН мөрүүд `adds`-д ОРСНЫ ДАРАА дуудна. Эсрэгээр хийвэл
 *    тэмдэглэгээ амжилттай болоод буулт нь унасан үед мөрүүд БҮРМӨСӨН
 *    алга болно — `applied` нь буцаах замгүй.
 * ⚠️ Төлвийг ШАЛГАНА: зөвхөн `approved` мөрийг `applied` болгоно. Эс
 *    бөгөөс хоцорсон дуудлага `returned`/`withdrawn` мөрийг дарж,
 *    буцаагдсан ажил «буулгасан» болж харагдана.
 */
export async function markApplied(oid: number): Promise<{ ok: boolean; error?: string }> {
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.status}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (s(cur[0][F.status]) !== AJIL_STATUS.approved) {
    /* ⚠️ Аль хэдийн `applied` бол АМЖИЛТ гэж үзнэ: хоёр таб зэрэг
       буулгавал хоёр дахь нь алдаа заах ёсгүй (идемпотент). */
    return s(cur[0][F.status]) === AJIL_STATUS.applied
      ? { ok: true }
      : { ok: false, error: tr('Энэ илгээлт энэ хооронд өөрчлөгдлөө — хуудсаа шинэчилнэ үү.') };
  }
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: { [F.oid]: oid, [F.status]: AJIL_STATUS.applied } }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** Нэг илгээлтийн АГУУЛГА — батлахад л хэрэгтэй тул тусад нь татна */
export async function loadPayload(oid: number): Promise<AjilPayload | null> {
  const rows = await query(`${F.oid} = ${Number(oid)}`, `${F.oid},${F.payload}`);
  if (!rows.length) return null;
  return parsePayload(String(rows[0][F.payload] ?? ''));
}

/**
 * Агуулгыг задлах — эвдэрсэн бол `null`.
 *
 * ⚠️ Хагас задарсан агуулга хэрэглэвэл мөр ЧИМЭЭГҮЙ алга болно. Тиймээс
 *    танигдахгүй элементийг ХАЯХГҮЙ, харин БҮТЭН агуулгыг татгалзана —
 *    хагас батлагдсан илгээлт нь батлагдаагүйгээс дор.
 * ⚠️ `vol`/`unit` нь `null` байж БОЛНО («хэмжилтгүй»), гэхдээ `undefined`
 *    БИШ — `null ≠ 0` дүрмийн үргэлжлэл (`format.ts`).
 */
export function parsePayload(raw: string): AjilPayload | null {
  try {
    const j = JSON.parse(raw) as Partial<AjilPayload>;
    if (!j || typeof j !== 'object') return null;
    if (!Array.isArray(j.adds)) return null;
    const num = (v: unknown): v is number | null =>
      v === null || (typeof v === 'number' && Number.isFinite(v));
    const adds: NewRow[] = [];
    for (const a of j.adds) {
      if (!a || typeof a !== 'object') return null;
      const r = a as Partial<NewRow>;
      /* ⚠️ Түр oid нь СӨРӨГ бүхэл тоо — эерэг байвал серверийн жинхэнэ
         ObjectID-тай мөргөлдөж, БАЙГАА мөрийг дарах эрсдэлтэй. */
      if (!Number.isInteger(r.oid) || (r.oid as number) >= 0) return null;
      if (typeof r.no !== 'string' || typeof r.work !== 'string') return null;
      if (typeof r.parentNo !== 'string' || typeof r.parentWork !== 'string') return null;
      if (!Number.isInteger(r.parentIdx)) return null;
      if (!num(r.vol) || !num(r.unit)) return null;
      adds.push({
        oid: r.oid as number,
        parentNo: r.parentNo,
        parentWork: r.parentWork,
        parentIdx: r.parentIdx as number,
        no: r.no,
        work: r.work,
        vol: r.vol as number | null,
        unit: r.unit as number | null,
      });
    }
    return { v: 1, pkgKey: String(j.pkgKey ?? ''), adds };
  } catch {
    return null;
  }
}

const editOk = (res: unknown): boolean => {
  const arr = (res as { success?: boolean }[]) ?? [];
  return arr.length > 0 && arr.every((r) => r.success === true);
};

/**
 * ИЛГЭЭХ — мөр нэмэгчийн «Батлуулах».
 *
 * ⚠️ Эх өгөгдөлд ЮУ Ч бичихгүй. Зөвхөн энэ хүснэгтэд хүлээнэ.
 * ⚠️ Тухайн багцад хүлээгдэж буй илгээлт БАЙВАЛ татгалзана — хоёр санал
 *    зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн хоёулаа
 *    батлагдвал ижил мөр ХОЁР УДАА үүснэ.
 */
export async function submitAjil(args: {
  pkgKey: string;
  pkgGroup: string;
  author: string;
  note?: string;
  payload: AjilPayload;
}): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ Дүрэм СҮЛЖЭЭНЭЭС ӨМНӨ — ArcGIS уншигдахгүй орчинд «хүснэгт олдсонгүй»
     гэсэн буруу шалтгаанаар дүрэм чимээгүй алга болохоос сэргийлнэ. */
  requireCap('addRow');
  if (!args.payload.adds.length) {
    return { ok: false, error: tr('Нэмсэн мөр алга.') };
  }
  /* ⚠️ ХҮРЭЭГ lib-д ШАЛГАНА: `null` = хязгааргүй. */
  if (AUTH.appId) {
    /* ⚠️ НЭВТЭРСЭН хэрэглэгчээр (дуудагчийн `author` БИШ) — консолоос
       super-ийн нэр дамжуулж алгасахаас. Хөтөчид нэвтрээгүй бол хаана. */
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = ajilScope(meNow ?? args.author, 'editor');
    if (sc !== null && !sc.includes(args.pkgGroup))
      return { ok: false, error: tr('Энэ багцад нэмэлт ажил илгээх эрхгүй.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const already = await loadPending(args.pkgKey);
  if (already) {
    return { ok: false, error: tr('Энэ багцад батлагдаагүй илгээлт байна — эхлээд шийдвэрлүүлнэ үү.') };
  }
  const attrs: Attrs = {
    [F.pkgKey]: args.pkgKey,
    [F.pkgGroup]: args.pkgGroup,
    [F.status]: AJIL_STATUS.pending,
    [F.author]: args.author.toLowerCase(),
    [F.authorSent]: Date.now(),
    [F.rowCount]: args.payload.adds.length,
    [F.note]: args.note?.trim() || null,
    [F.payload]: JSON.stringify(args.payload),
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      adds: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.addResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ШИЙДВЭР — батлах эсвэл буцаах.
 *
 * ⚠️ ҮНДСЭН ӨГӨГДӨЛД МӨР ҮҮСГЭХ нь ЭНД БИШ, дуудагч талд (`FillNew`) — учир
 *    нь тэр ажил нь схем, эцгийн зураглал, агшин солигдох зэрэг эх хуудасны
 *    бүх нарийн ширийнийг мэддэг `applyUpdates`-ыг шаардана. Энэ модуль
 *    зөвхөн урсгалын ТӨЛӨВИЙГ хөтөлнө.
 *
 * ⚠️ Дараалал: үндсэн өгөгдөлд АМЖИЛТТАЙ бичигдсэний ДАРАА л энэ мөрийг
 *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан» гэж
 *    харагдах атлаа мөр үүсээгүй үлдэнэ.
 */
export async function decideAjil(args: {
  oid: number;
  approve: boolean;
  approver: string;
  /**
   * Илгээсэн хүн — ЗӨВХӨН нөөц (fallback).
   *
   * ⚠️ Дүрмийн ЖИНХЭНЭ эх нь ЭНЭ БИШ, СЕРВЕРИЙН мөрийн `F.author` (доор
   *    `cur`-аас уншина). Дуудагчийн өгсөн утгад найдвал консолоос
   *    `author: ''` дамжуулаад хамгаалалтыг бүрэн алгасаж болно.
   */
  author?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  /*
   * ⚠️ ДҮРМҮҮДИЙГ СҮЛЖЭЭНЭЭС ӨМНӨ шалгана. `tableUrl`-ийн ДАРАА байрлуулбал
   *    ArcGIS уншигдахгүй орчинд «хүснэгт олдсонгүй» гэсэн буруу шалтгаан
   *    буцааж, дүрэм нь чимээгүй алга болно.
   *
   * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ. Энэ шалгуур UI-д БИШ, ЭНД байх ёстой:
   *    товч нуух нь харагдацын асуудал, харин дүрэм нь өгөгдлийнх. Хоёр эрх
   *    (`addRow` + `ajilApprove`) нэг хүнд олгогдвол товч нь идэвхтэй болох
   *    тул ганц хамгаалалт нь энэ.
   *
   * ⚠️ ХОЁР ДАВХАР ШАЛГУУР:
   *      (1) ЭНД — дуудагчийн өгсөн `author`-оор, СҮЛЖЭЭНЭЭС ӨМНӨ. ArcGIS
   *          уншигдахгүй орчинд дүрэм чимээгүй алга болохоос сэргийлнэ.
   *      (2) `cur`-ийн ДАРАА — СЕРВЕРИЙН мөрийн `F.author`-оор, учир нь (1)
   *          нь дуудагчийн утгад найддаг тул хуурамчлах боломжтой.
   */
  requireCap('ajilApprove');
  const me = args.approver.trim().toLowerCase();
  const claimed = (args.author ?? '').trim().toLowerCase();
  if (me && claimed && me === claimed) {
    return { ok: false, error: tr('Өөрийн илгээсэн нэмэлт ажлыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  if (!args.approve && !args.reason?.trim()) {
    return { ok: false, error: tr('Буцаах шалтгааныг бичнэ үү.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  /*
   * ⚠️ ШИЙДВЭР ГАРСАН ЭСЭХИЙГ ДАХИН ШАЛГАНА. Хоёр батлагч хуудсаа зэрэг
   *    нээгээд нэг нь баталчихвал нөгөөгийн дэлгэц ХУУЧИН хэвээр үлдэнэ.
   *    Түүнийг дарахад шийдвэр гаргасан хүний нэр чимээгүй дарагдана. Мөр нь
   *    ганц тул `applyEdits` алдаа өгөхгүй — ЗӨВХӨН энэ шалгуур л барина.
   */
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.approver},${F.author},${F.pkgGroup}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  /* ⚠️ БАТЛАГЧИЙН ХҮРЭЭГ СЕРВЕРИЙН БАГЦААР — дуудагчийн өгсөн багцаар БИШ. */
  if (AUTH.appId) {
    const meNow = currentUser();
    if (typeof window !== 'undefined' && !meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc = ajilScope(meNow ?? me, 'approver');
    if (sc !== null && !sc.includes(String(cur[0][F.pkgGroup] ?? '')))
      return { ok: false, error: tr('Энэ багцын нэмэлт ажлыг батлах эрхгүй.') };
  }
  /*
   * ⚠️ ХОЁР ДАХЬ ШАЛГУУР — ЗОХИОГЧ СЕРВЕРЭЭС. Дээрх эрт шалгуур нь дуудагчийн
   *    утгад найддаг тул хоосон утга дамжуулаад алгасах боломжтой байв.
   */
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (me && author && me === author) {
    return { ok: false, error: tr('Өөрийн илгээсэн нэмэлт ажлыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.') };
  }
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== AJIL_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: args.approve ? AJIL_STATUS.approved : AJIL_STATUS.returned,
    [F.approver]: args.approver.toLowerCase(),
    [F.approverAt]: Date.now(),
    [F.reason]: args.approve ? null : (args.reason?.trim() ?? null),
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч ӨӨРИЙН хүлээгдэж буй илгээлтийг буцааж авна.
 *
 * ⚠️ ЯАГААД: `decideAjil` нь зохиогч=батлагч бүх шийдвэрийг татгалздаг (зөв —
 *    өөрийгөө батлахгүй), гэвч түүний улмаас зохиогч алдаатай илгээлтээ
 *    буцаах замгүй болно: өөр батлагч буцаатал багц түгжээтэй
 *    (`huvaariBatlah.withdrawPlan`-ийн 2026-09-21-ний сургамж).
 * ⚠️ ЭХ ХУУДСАНД ЮУ Ч БИЧИХГҮЙ — зөвхөн урсгалын мөр `withdrawn` болно.
 * ⚠️ ЗӨВХӨН ЗОХИОГЧ: жинхэнэ дүрэм нь СЕРВЕРИЙН `F.author`.
 * ⚠️ `approver`-т ЮУ Ч бичихгүй, `approverAt`-д татсан агшныг: түүх «хэзээ»
 *    гэдгийг мэднэ, «батлагч» багана нь зөвхөн батлагчийнх үлдэнэ.
 */
export async function withdrawAjil(args: {
  oid: number;
  /** Татаж буй хүн — нэвтэрсэн хэрэглэгч (`currentUser`) байх ёстой */
  me: string;
}): Promise<{ ok: boolean; error?: string }> {
  /* ⚠️ Дүрмүүд СҮЛЖЭЭНЭЭС ӨМНӨ — `decideAjil`-тай ижил шалтгаан. */
  requireCap('addRow');
  const me = args.me.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
  if (typeof window !== 'undefined' && AUTH.appId) {
    const meNow = currentUser();
    if (!meNow) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    if (meNow !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  }
  const url = await tableUrl();
  if (!url) return { ok: false, error: tr('Батлах хүснэгт олдсонгүй — админд хандана уу.') };
  const cur = await query(`${F.oid} = ${Number(args.oid)}`, `${F.oid},${F.status},${F.author},${F.approver}`);
  if (!cur.length) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  const author = s(cur[0][F.author])?.trim().toLowerCase() ?? '';
  if (author !== me) return { ok: false, error: tr('Зөвхөн илгээсэн хүн өөрөө илгээлтээ татна.') };
  const curStatus = s(cur[0][F.status]);
  if (curStatus !== AJIL_STATUS.pending) {
    const by = s(cur[0][F.approver]);
    return {
      ok: false,
      error: by
        ? tr('Энэ илгээлтийг {0} аль хэдийн шийдвэрлэсэн байна ({1}). Хуудсаа шинэчилнэ үү.', by, curStatus ?? '')
        : tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'),
    };
  }
  const attrs: Attrs = {
    [F.oid]: args.oid,
    [F.status]: AJIL_STATUS.withdrawn,
    [F.approverAt]: Date.now(),
    [F.reason]: null,
  };
  try {
    const j = await req(`${url}/applyEdits`, {
      updates: JSON.stringify([{ attributes: attrs }]),
      rollbackOnFailure: 'true',
    });
    return editOk(j.updateResults)
      ? { ok: true }
      : { ok: false, error: tr('ArcGIS-т хадгалагдсангүй.') };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
