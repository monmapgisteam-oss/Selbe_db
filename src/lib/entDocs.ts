import { t as tr } from '@/lib/i18nCore';

/**
 * ENTERPRISE ГЕОПОРТАЛ ДАХЬ PDF БАРИМТ (2026-10-08, туршилт — tezu-bonu).
 *
 * PDF бүр геопорталд ТУСДАА item (`type=PDF`) болж хадгалагдана — порталын
 * «New item → файл оруулах»-тай яг ижил (`content/users/{u}/addItem`). Хавсралт
 * (feature service `addAttachment`) БИШ — хэрэглэгчийн шийдвэр: «attach-аар feature
 * service-д оруулах нь огт таалагдахгүй».
 *
 * ⚠️ ТУСДАА НЭВТРЭЛТ: портал одоо ArcGIS Online-оор нэвтэрдэг (`AUTH`); Enterprise-ийн
 *    токен түүнээс хамаарахгүй. Туршилтад `generateToken` (нэр · нууц үг, `client=referer`)
 *    ашиглана — геопорталд OAuth апп бүртгэгдсэний дараа OAuth руу солино.
 *    Нууц үгийг ХАДГАЛАХГҮЙ; токен зөвхөн санах ойд (хуудас дахин ачаалахад дахин нэвтэрнэ).
 * ⚠️ Токен ЗӨВХӨН POST-ын биеэр (`tools/tokenInUrl.check.mjs`) — `/data`-г ч POST-оор татна.
 * ⚠️ ArcGIS алдаа HTTP 200-аар `{ error }` биед ирнэ — биеийг заавал шалгана.
 * ⚠️ `NEXT_PUBLIC_ENT_PORTAL_URL` хоосон бол энэ боломж бүхэлдээ нуугдана
 *    (`tools/envParity.check.mjs`-ийн OPTIONAL_LOCAL — зөвхөн локал туршилт).
 */
export const ENT_PORTAL = (process.env.NEXT_PUBLIC_ENT_PORTAL_URL ?? '').trim().replace(/\/+$/, '');

/** Порталын PDF-ээс ЗӨВХӨН энэ системийнхийг ялгах таг */
export const ENT_TAG = 'selbe-portal';

const TIMEOUT_MS = 120_000;

type Sess = { user: string; token: string; expires: number };
let sess: Sess | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

/** Хүчинтэй сешн (дуусахаас 1 минутын өмнө хүчингүйд тооцно) */
export function entSession(): Sess | null {
  return sess && sess.expires > Date.now() + 60_000 ? sess : null;
}
export function subscribeEnt(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function need(): Sess {
  const s = entSession();
  if (!s) throw new Error(tr('Enterprise-д нэвтрээгүй эсвэл сешн дууссан — дахин нэвтэрнэ үү.'));
  return s;
}

type ArcErr = { error?: { code?: number; message?: string; details?: string[] } };

async function post<T>(path: string, body: FormData | URLSearchParams): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${ENT_PORTAL}/sharing/rest/${path}`, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new Error(tr('Enterprise хугацаандаа хариу өгсөнгүй — дахин оролдоно уу.'));
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  let j: T & ArcErr;
  try { j = await r.json(); } catch { throw new Error(tr('Enterprise JSON биш хариу буцаав.')); }
  if (j?.error) {
    /* 498 = токен хүчингүй, 499 = токен шаардлагатай → сешнийг цэвэрлэж дахин нэвтрүүлнэ */
    if (j.error.code === 498 || j.error.code === 499) { sess = null; emit(); }
    const det = j.error.details?.filter(Boolean).join(' · ');
    throw new Error(`${j.error.message || tr('Enterprise алдаа')}${det ? ` — ${det}` : ''}`);
  }
  return j;
}

/** Нэр · нууц үгээр токен авна. Нууц үг санах ойд ч үлдэхгүй. */
export async function entSignIn(username: string, password: string): Promise<void> {
  const g = await post<{ token?: string; expires?: number }>('generateToken', new URLSearchParams({
    username: username.trim(), password, client: 'referer', referer: window.location.origin, expiration: '120', f: 'json',
  }));
  if (!g.token) throw new Error(tr('Enterprise токен олгосонгүй.'));
  /* ⚠️ Хэрэглэгчийн нэрийг порталаас (`community/self`) авна — оруулсан бичвэр том/жижиг
     үсгээр зөрж болох бөгөөд `addItem`-ийн зам яг порталын нэрийг шаарддаг. */
  const me = await post<{ username?: string }>('community/self', new URLSearchParams({ token: g.token, f: 'json' }));
  if (!me.username) throw new Error(tr('Enterprise хэрэглэгч тодорхойгүй.'));
  sess = { user: me.username, token: g.token, expires: g.expires ?? Date.now() + 110 * 60_000 };
  emit();
}

export function entSignOut(): void {
  sess = null;
  emit();
}

/** `access`: порталын хуваалцалт ('private' · 'shared' · 'org' · 'public'); `null` = тодорхойгүй.
 * ⚠️ 2026-10-09 (аудит): `pending` — item ҮҮССЭН ч дэлгэрэнгүйг татаж чадаагүй (одоо `warn`-аар мэдэгддэг; хуучин дуудагчид). */
export type EntPdf = { id: string; title: string; owner: string; modified: number; size: number | null; access: string | null; pending?: boolean };

type ItemJson = { id: string; title?: string; owner?: string; modified?: number; size?: number; access?: string };
const toPdf = (x: ItemJson): EntPdf => ({
  id: x.id, title: x.title || x.id, owner: x.owner ?? '', modified: x.modified ?? 0,
  size: typeof x.size === 'number' && x.size >= 0 ? x.size : null,
  access: x.access ?? null,
});

/** Хайлтын нэг хуудас (порталын `num`-ийн дээд хязгаар 100) */
const SEARCH_NUM = 100;
/** Жагсаалтын дээд хязгаар — эвдэрсэн `nextStart` мөнхийн давталт үүсгэхгүй */
export const ENT_LIST_MAX = 2000;

/**
 * Энэ системийн тагтай, хэрэглэгчид харагдах бүх PDF item (сүүлд өөрчлөгдсөн нь эхэнд).
 * ⚠️ 2026-10-09 (аудит): `nextStart`-аар ХУУДАСЛАНА — урьд нь ганц `num: 100` хүсэлт тул 100-аас
 *    олон PDF-тэй үед хуучнууд нь чимээгүй алга болдог байв. `nextStart` ≤ 0 (−1 = төгсгөл),
 *    хоосон хуудас эсвэл `ENT_LIST_MAX` хүрвэл зогсоно.
 */
export async function entListPdfs(): Promise<EntPdf[]> {
  const s = need();
  const out: EntPdf[] = [];
  for (let start = 1; out.length < ENT_LIST_MAX;) {
    const j = await post<{ results?: ItemJson[]; nextStart?: number }>('search', new URLSearchParams({
      q: `type:"PDF" AND tags:"${ENT_TAG}"`, sortField: 'modified', sortOrder: 'desc',
      start: String(start), num: String(SEARCH_NUM), f: 'json', token: s.token,
    }));
    const page = j.results ?? [];
    out.push(...page.map(toPdf));
    const next = Number(j.nextStart);
    if (!page.length || !Number.isFinite(next) || next <= start) break;
    start = next;
  }
  return out.slice(0, ENT_LIST_MAX);
}

/**
 * PDF-ийг шинэ item болгон оруулж БАЙГУУЛЛАГАД хуваалцана. Буцаах: шинэ item +
 * (хуваалцаж чадаагүй бол) анхааруулга.
 * ⚠️ Хайлтын индекс шинэ item-ийг хэдэн секундын дараа л олдог тул дуудагч
 *    буцаасан item-ийг жагсаалтын эхэнд өөрөө нэмнэ.
 * ⚠️ 2026-10-09 (хэрэглэгч: «organization тохиргоотой item болох»): `addItem` нь item-ийг
 *    ЗӨВХӨН эзэнд (private) үүсгэдэг тул дараа нь `share` (org=true, everyone=false) —
 *    байгууллагын бүх хэрэглэгч харна, нийтэд (public) БИШ.
 * ⚠️ `addItem` АМЖИЛТТАЙ болсны дараах алхмууд (хуваалцах · мэдээлэл унших) унавал
 *    АЛДАА ШИДЭХГҮЙ — item аль хэдийн үүссэн тул хэрэглэгч «болсонгүй» гэж бодоод дахин
 *    оруулбал ижил PDF хоёр item болно. Оронд нь анхааруулга буцаана.
 */
export async function entUploadPdf(file: File, title?: string): Promise<{ item: EntPdf; warn?: string }> {
  const s = need();
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error(tr('Зөвхөн PDF файл оруулна.'));
  const ttl = (title ?? '').trim() || file.name.replace(/\.pdf$/i, '');
  const fd = new FormData();
  fd.append('f', 'json');
  fd.append('token', s.token);
  fd.append('type', 'PDF');
  fd.append('title', ttl);
  fd.append('tags', ENT_TAG);
  fd.append('typeKeywords', ENT_TAG);
  fd.append('file', file, file.name);
  const j = await post<{ success?: boolean; id?: string }>(`content/users/${encodeURIComponent(s.user)}/addItem`, fd);
  if (!j.success || !j.id) throw new Error(tr('PDF item үүссэнгүй.'));
  const id = j.id;
  const user = encodeURIComponent(s.user);
  let warn: string | undefined;
  try {
    const sh = await post<{ notSharedWith?: string[] }>(`content/users/${user}/items/${encodeURIComponent(id)}/share`,
      new URLSearchParams({ everyone: 'false', org: 'true', groups: '', f: 'json', token: s.token }));
    if (sh.notSharedWith?.length) warn = tr('«{0}» байгууллагад хуваалцагдсангүй — геопорталаас гараар хуваалцана уу.', file.name);
  } catch (e) {
    warn = tr('«{0}» байгууллагад хуваалцагдсангүй ({1}) — геопорталаас гараар хуваалцана уу.', file.name, (e as Error).message);
  }
  try {
    const it = await post<ItemJson>(`content/items/${encodeURIComponent(id)}`, new URLSearchParams({ f: 'json', token: s.token }));
    return { item: toPdf({ ...it, id }), warn };
  } catch {
    /* ⚠️ Item бий — мэдээллийг файлаас бүрдүүлнэ (дээрх «алдаа шидэхгүй» ⚠️) */
    return {
      item: { id, title: (title ?? '').trim() || file.name.replace(/\.pdf$/i, ''), owner: s.user, modified: Date.now(), size: file.size, access: warn ? null : 'org' },
      warn,
    };
  }
}

/** Item-ийн PDF файлыг токентой (POST) татаж Blob болгоно — `<iframe>`-д objectURL-ээр харуулна */
export async function entPdfBlob(id: string): Promise<Blob> {
  const s = need();
  let r: Response;
  try {
    r = await fetch(`${ENT_PORTAL}/sharing/rest/content/items/${encodeURIComponent(id)}/data`, {
      method: 'POST', body: new URLSearchParams({ token: s.token }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
  /* ⚠️ Алдаа PDF-ийн оронд JSON-оор (HTTP 200) ирнэ */
  if ((r.headers.get('content-type') ?? '').includes('json')) {
    let j: ArcErr = {};
    try { j = await r.json(); } catch { /* доорх ерөнхий мессеж */ }
    if (j.error?.code === 498 || j.error?.code === 499) { sess = null; emit(); }
    throw new Error(j.error?.message || tr('PDF татагдсангүй.'));
  }
  return new Blob([await r.blob()], { type: 'application/pdf' });
}

/** Порталын item хуудас (порталд нэвтэрсэн хөтчид нээгдэнэ) — токенгүй */
export const entItemPage = (id: string) => `${ENT_PORTAL}/home/item.html?id=${encodeURIComponent(id)}`;
