import { t as tr } from '@/lib/i18nCore';
import { ENT_SERVER } from '@/lib/entInterceptor';
import { clearMetaCache } from '@/lib/metaCache';
import { AUTH } from '@/lib/services/env';
import { authToken, ensureFreshToken } from '@/lib/authToken';
import { currentUser } from '@/lib/who';

/**
 * ENTERPRISE ГЕОПОРТАЛ ДАХЬ PDF БАРИМТ (2026-10-08, туршилт — tezu-bonu).
 *
 * PDF бүр геопорталд ТУСДАА item (`type=PDF`) болж хадгалагдана — порталын
 * «New item → файл оруулах»-тай яг ижил (`content/users/{u}/addItem`). Хавсралт
 * (feature service `addAttachment`) БИШ — хэрэглэгчийн шийдвэр: «attach-аар feature
 * service-д оруулах нь огт таалагдахгүй».
 */
export const ENT_PORTAL = (process.env.NEXT_PUBLIC_ENT_PORTAL_URL ?? '').trim().replace(/\/+$/, '');

/** Порталын PDF-ээс ЗӨВХӨН энэ системийнхийг ялгах таг */
export const ENT_TAG = 'selbe-portal';

const TIMEOUT_MS = 120_000;

type Sess = { user: string; token: string; expires: number };
let sess: Sess | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
const samePortal = (): boolean => !!ENT_PORTAL && norm(ENT_PORTAL) === norm(AUTH.portalUrl);

/** Хүчинтэй сешн (дуусахаас 1 минутын өмнө хүчингүйд тооцно) */
export function entSession(): Sess | null {
  if (sess && sess.expires > Date.now() + 60_000) return sess;
  if (samePortal()) {
    const token = authToken();
    const user = currentUser();
    if (token && user) {
      if (!shared || shared.token !== token || shared.user !== user) shared = { user, token, expires: Date.now() + 10 * 60_000 };
      return shared;
    }
  }
  return null;
}
let shared: Sess | null = null;
export function entIsShared(): boolean {
  const cur = entSession();
  return !!cur && cur === shared && samePortal();
}
/**
 * ТОКЕН ШИНЭЧЛЭЭД БИЕД ДАХИН ДАРНА — Enterprise рүү ШУУД fetch хийдэг замууд (ma · mir · ficMakt · энэ модуль).
 */
export async function entStamp(body: URLSearchParams | FormData): Promise<void> {
  await ensureFreshToken();
  const s = entSession();
  if (s && body.has('token')) body.set('token', s.token);
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
  await entStamp(body);
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

async function registerEntToken(s: Sess): Promise<void> {
  if (!ENT_SERVER) return;
  clearMetaCache();
  try {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    esriId.registerToken({ server: ENT_SERVER, token: s.token, expires: s.expires, userId: s.user });
  } catch {
    /* JS API ачаалагдаагүй (Node/тест) — REST зам хэвээр ажиллана */
  }
}

/** Нэр · нууц үгээр токен авна. Нууц үг санах ойд ч үлдэхгүй. */
export async function entSignIn(username: string, password: string): Promise<void> {
  const g = await post<{ token?: string; expires?: number }>('generateToken', new URLSearchParams({
    username: username.trim(), password, client: 'referer', referer: window.location.origin, expiration: '120', f: 'json',
  }));
  if (!g.token) throw new Error(tr('Enterprise токен олгосонгүй.'));
  const me = await post<{ username?: string }>('community/self', new URLSearchParams({ token: g.token, f: 'json' }));
  if (!me.username) throw new Error(tr('Enterprise хэрэглэгч тодорхойгүй.'));
  sess = { user: me.username, token: g.token, expires: g.expires ?? Date.now() + 110 * 60_000 };
  emit();
  void registerEntToken(sess);
}

export function entSignOut(): void {
  sess = null;
  clearMetaCache();
  emit();
}

/** `access`: порталын хуваалцалт ('private' · 'shared' · 'org' · 'public'); `null` = тодорхойгүй. */
export type EntPdf = { id: string; title: string; owner: string; modified: number; size: number | null; access: string | null; pending?: boolean;
  tags?: string[] };

type ItemJson = { id: string; title?: string; owner?: string; modified?: number; size?: number; access?: string; tags?: string[] };
const toPdf = (x: ItemJson): EntPdf => ({
  id: x.id, title: x.title || x.id, owner: x.owner ?? '', modified: x.modified ?? 0,
  size: typeof x.size === 'number' && x.size >= 0 ? x.size : null,
  access: x.access ?? null,
  tags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === 'string') : [],
});

/** Хайлтын нэг хуудас (порталын `num`-ийн дээд хязгаар 100) */
const SEARCH_NUM = 100;
/** Жагсаалтын дээд хязгаар — эвдэрсэн `nextStart` мөнхийн давталт үүсгэхгүй */
export const ENT_LIST_MAX = 2000;

/**
 * Энэ системийн тагтай, хэрэглэгчид харагдах бүх PDF item (сүүлд өөрчлөгдсөн нь эхэнд).
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
 */
let exact: { token: string; user: string } | null = null;
async function exactUser(s: Sess): Promise<string> {
  if (sess && s === sess) return s.user;
  if (exact && exact.token === s.token) return exact.user;
  const me = await post<{ username?: string }>('community/self', new URLSearchParams({ token: s.token, f: 'json' }));
  if (!me.username) throw new Error(tr('Enterprise хэрэглэгч тодорхойгүй.'));
  exact = { token: s.token, user: me.username };
  return me.username;
}

/** Нэвтэрсэн хэрэглэгчийн ПОРТАЛЫН ЯГ нэр (`content/users/{u}/…` замд) — `ficMakt.createTable` ч ашиглана */
export const entExactUser = (): Promise<string> => exactUser(need());

/**
 * ЭЗНИЙ ГЕОПОРТАЛЫН ХАВТАС (2026-10-23, хэрэглэгч: «PDF оруулах Enterprise-ийн folder-ууд») — нэрээр нь (том/жижиг
 * үсэг үл хамаарна) олно, байхгүй бол ҮҮСГЭНЭ. Хавтас нь хэрэглэгч тус бүрийнх (порталын дүрэм) — оруулагч бүр өөрийн
 * ижил нэртэй хавтсанд хадгална. Сешн тутамд кэшлэнэ.
 */
const folderCache = new Map<string, string>();
async function folderId(s: Sess, owner: string, title: string): Promise<string> {
  const ck = `${owner.toLowerCase()}|${title.toLowerCase()}`;
  const hit = folderCache.get(ck);
  if (hit) return hit;
  const u = encodeURIComponent(owner);
  const j = await post<{ folders?: { id?: string; title?: string }[] }>(`content/users/${u}`, new URLSearchParams({ f: 'json', token: s.token, num: '1' }));
  const found = (j.folders ?? []).find((x) => (x.title ?? '').trim().toLowerCase() === title.trim().toLowerCase());
  let id = found?.id ?? '';
  if (!id) {
    const c = await post<{ success?: boolean; folder?: { id?: string } }>(`content/users/${u}/createFolder`, new URLSearchParams({ f: 'json', token: s.token, title }));
    id = c.folder?.id ?? '';
    if (!c.success || !id) throw new Error(tr('«{0}» хавтас үүссэнгүй.', title));
  }
  folderCache.set(ck, id);
  return id;
}

export async function entUploadPdf(file: File, title?: string, extraTags: readonly string[] = [], folder = ''): Promise<{ item: EntPdf; warn?: string }> {
  const s = need();
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error(tr('Зөвхөн PDF файл оруулна.'));
  const owner = await exactUser(s);
  const ttl = (title ?? '').trim() || file.name.replace(/\.pdf$/i, '');
  const fd = new FormData();
  fd.append('f', 'json');
  fd.append('token', s.token);
  fd.append('type', 'PDF');
  fd.append('title', ttl);
  fd.append('tags', [ENT_TAG, ...extraTags].join(','));
  fd.append('typeKeywords', ENT_TAG);
  fd.append('file', file, file.name);
  const fid = folder.trim() ? await folderId(s, owner, folder) : '';
  const j = await post<{ success?: boolean; id?: string }>(`content/users/${encodeURIComponent(owner)}${fid ? `/${encodeURIComponent(fid)}` : ''}/addItem`, fd);
  if (!j.success || !j.id) throw new Error(tr('PDF item үүссэнгүй.'));
  const id = j.id;
  const user = encodeURIComponent(owner);
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
    return {
      item: { id, title: (title ?? '').trim() || file.name.replace(/\.pdf$/i, ''), owner, modified: Date.now(), size: file.size, access: warn ? null : 'org' },
      warn,
    };
  }
}

/** Item-ийн PDF файлыг токентой (POST) татаж Blob болгоно — `<iframe>`-д objectURL-ээр харуулна */
export async function entPdfBlob(id: string): Promise<Blob> {
  const s = need();
  const body = new URLSearchParams({ token: s.token });
  await entStamp(body);
  let r: Response;
  try {
    r = await fetch(`${ENT_PORTAL}/sharing/rest/content/items/${encodeURIComponent(id)}/data`, {
      method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(tr('Enterprise геопорталтай холбогдож чадсангүй — сүлжээгээ шалгана уу.'));
  }
  if (!r.ok) throw new Error(tr('Enterprise алдаа (HTTP {0})', r.status));
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

/**
 * PDF ITEM-ИЙГ УСТГАНА (2026-10-23, баримт бичгийн сан). `content/users/{эзэн}/items/{id}/delete` — порталд ЗӨВХӨН
 * эзэн эсвэл порталын админ устгаж чадна; бусдад портал өөрөө татгалзана (алдаа ил гарна). Буцаах боломжгүй.
 */
export async function entDeletePdf(id: string, owner: string): Promise<void> {
  const s = need();
  const j = await post<{ success?: boolean }>(`content/users/${encodeURIComponent(owner)}/items/${encodeURIComponent(id)}/delete`,
    new URLSearchParams({ f: 'json', token: s.token }));
  if (!j.success) throw new Error(tr('PDF устгагдсангүй.'));
}

/**
 * ITEM-ИЙН ТАГИЙГ СОЛИНО (2026-10-23, баримтыг өөр бүлэгт шилжүүлэх). Зөвхөн эзэн/порталын админ.
 */
export async function entSetTags(id: string, owner: string, tags: readonly string[]): Promise<void> {
  const s = need();
  const j = await post<{ success?: boolean }>(`content/users/${encodeURIComponent(owner)}/items/${encodeURIComponent(id)}/update`,
    new URLSearchParams({ f: 'json', token: s.token, tags: tags.join(',') }));
  if (!j.success) throw new Error(tr('Бүлэг солигдсонгүй.'));
}
