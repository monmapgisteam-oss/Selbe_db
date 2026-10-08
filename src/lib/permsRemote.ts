'use client';

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ — ArcGIS ДЭЭРХ ХУВААЛЦСАН ХАДГАЛАЛТ.
 *
 * Эрхийн override-ыг байгууллагын ArcGIS дээрх нэг hosted хүснэгтэд хадгална.
 * Ингэснээр super admin ямар ч төхөөрөмжөөс өөрчилсөн эрх бүх хэрэглэгчид
 * (өөр газраас нэвтэрсэн ч) үйлчилнэ — `localStorage` шиг нэг browser-т хязгаарлагдахгүй.
 *
 * ⚠️ Хүснэгт нь super admin ЭХ АНХ нэвтрэхэд автоматаар үүснэ (publish эрхтэй бол).
 * Уншилт нь бүх нэвтэрсэн хэрэглэгчид (org-shared) нээлттэй, бичих нь editor эрхээр.
 * ArcGIS байхгүй/алдаа гарвал дуудагч тал `localStorage`-руу ухарна.
 *
 * ⚠️ УРСГАЛЫН ТОМИЛГОО (2026-08-27): «хэн аль шатанд, аль багцад» гэсэн
 * гүйцэтгэлийн урсгалын томилгоог мөн ЭНЭ хүснэгтэд хадгална — `username`
 * талбарт `__flow__:` угтвартай нөөц мөрөөр. Урьд нь тэр нь зөвхөн админы
 * browser-ийн localStorage-д байсан тул томилогдсон хүний ӨӨРИЙНХ нь
 * төхөөрөмж дээр томилгоо огт харагдахгүй — багцын хязгаарлалт хаана ч
 * биелдэггүй, Ерөнхий менежерийн эрх (мөр нэмэх г.м.) хэзээ ч асдаггүй байв.
 * Угтвартай мөрүүд эрхийн уншилтад ОГТ ОРОХГҮЙ (`fetchAll` ялгаж буцаана).
 *
 * ⚠️ ХЯЗГААР (баримтжуулсан): бичих эрх нь ArcGIS item-sharing дээр л
 * тулгуурладаг. Хүснэгтийг олон super admin засах ёстой тул мөрийн эзэмшлийн
 * хязгаарлалт (ownership-based access control) тавьж болохгүй — тиймээс org
 * доторх, бичих эрх бүхий хэн боловч REST-ээр шууд засаж чадна. Клиент талын
 * системд үүнээс чанга хамгаалалт байхгүй; нэвтрэлтийн түвшний эрсдэлийг
 * `permissions.hasAccess` (хатуу жагсаалт + remote баталгаажилт) барина.
 */

import { AUTH, ROLE_BY_USER, type Role, type ViewKey } from './services';
import { arcgisPost } from '@/lib/query';
import { ensureFreshToken } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from './scopedAcl';
import { UNSAFE_KEY } from './caps';

export type RemoteRow = {
  username: string;
  role: Role | null;
  views: ViewKey[] | 'all';
  docs: boolean;
  /**
   * Устгагдсан аккаунтын тэмдэглэгээ — `views` талбарт `removed` гэсэн
   * (JSON биш) шууд утгаар хадгална: хуучин хувилбарын parser JSON.parse-д
   * унаад fail-closed `views: []` болгодог тул хуучин клиент дээр ч эрсдэлгүй.
   */
  removed?: boolean;
};

/**
 * Урсгалын нэг томилгоо — permsRemote нь `Stage` төрлөөс санаатай ХАРААТ БУС
 * (энд зөвхөн тээвэрлэнэ, утгыг нь `guitsetgelAcl` шалгана).
 */
export type FlowRow = {
  user: string; stage: string; bagts: string[];
  /** ХАРНА, ШИЙДВЭРЛЭХГҮЙ — хуучин мөрд `undefined` = жирийн томилгоо */
  viewOnly?: boolean;
};

/**
 * НЭМЭЛТ ЭРХИЙН нэг мөр — `__cap__:` угтвартай.
 *
 * ⚠️ `caps` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 * тээвэрлэнэ (`caps.ts` танигдахгүйг нь хаяна). Ингэснээр шинэ эрх нэмэхэд
 * хадгалалтын давхарга хөндөгдөхгүй.
 */
export type CapRow = { user: string; caps: string[] };

/**
 * ЧАНАРЫН (QAQC) багцын хуваарилалтын нэг мөр — `__qaqc__:` угтвартай.
 *
 * ⚠️ Урсгалын `FlowRow`-оос ТУСДАА: тэнд `stage` байдаг, энд БАЙХГҮЙ. Чанарын
 * хяналт нь дөрвөн шатны аль нь ч биш тул шат зүүвэл тэр хүн гүйцэтгэлийг
 * зөвшөөрөх эрхтэй болно (`qaqcAcl.ts`-ийн толгойн тайлбарыг үз).
 */
export type QaqcRow = { user: string; bagts: string[] };

/**
 * ХУВААРИЙН хуваарилалтын нэг мөр — `__huvaari__:` угтвартай.
 *
 * ⚠️ `QaqcRow`-оос ЯЛГААТАЙ нь `roles` талбартай: хуваарь нь ХОЁР үүрэгтэй
 * (зохиогч · батлагч) тул нэг мөрөнд аль нь болохыг хадгална.
 */
/**
 * ХУВААРИЛАЛТЫН `views` НҮДНИЙ JSON — гурван үүрэгтэй систем (Хуваарь · Обьём ·
 * Чанарын баримт) ижил хэлбэрээр бичдэг.
 *
 * ⚠️ `grants` НЬ ҮНЭН ЭХ СУРВАЛЖ (2026-09-09). `roles`/`bagts` нь зөвхөн
 *    ХУУЧИН клиент build уншиж чадах НӨӨЦ нэгдэл — үүрэг тус бүр аль багцад
 *    хамаарахыг АЛДДАГ (үржвэр болно).
 *
 * ⚠️ 2026-09-16-ны аудит: `fetchAll` нь `grants`-ыг ЗӨВХӨН `__chanar__:`
 *    салаанд уншдаг байв; `__huvaari__:` ба `__obyem__:` салаанууд хаядаг
 *    байсан тул хуудас сэргээх бүрд үржвэр ЭРГЭЖ ИРДЭГ байлаа («Багц 1-д
 *    зохиогч, Багц 5.1-д батлагч» → хоёуланд нь ХОЁУЛАА). Тэр нь
 *    `decidePlan`-ийн зохиогч=батлагч татгалзалтаар багцыг ГАЦААНА. Гурван
 *    салаа ижил төрөл ашиглаж, ижил уншилт хийх ёстой — тиймээс энэ төрөл.
 */
type ViewsJson = { roles?: string[]; bagts?: string[]; grants?: Grant[] };

export type HuvaariRow = {
  user: string;
  roles: string[];
  bagts: string[];
  /** ⚠️ Байвал ЭНЭ давамгайлна (`scopedAcl.syncRemote`) */
  grants?: Grant[];
};

/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН хуваарилалтын нэг мөр — `__obyem__:` угтвартай.
 *
 * ⚠️ `HuvaariRow`-той ижил бүтэц, ӨӨР асуулт: тэр нь ОГНОО төлөвлөх эрх,
 * энэ нь ОБЬЁМ. Хоёр үүрэг: `editor` (засварлагч) · `approver` (батлагч).
 */
export type ObyemRow = {
  user: string;
  roles: string[];
  bagts: string[];
  /** ⚠️ Байвал ЭНЭ давамгайлна — `HuvaariRow`-тай ижил дүрэм */
  grants?: Grant[];
};

/**
 * НЭМЭЛТ АЖЛЫН хуваарилалтын нэг мөр — `__ajil__:` угтвартай.
 *
 * ⚠️ `ObyemRow`-той ижил бүтэц, ӨӨР асуулт: тэр нь БАЙГАА мөрийн обьёмыг,
 * энэ нь шинэ мөр гэрээнд нэмэгдэх эсэхийг зохицуулна. Хоёр үүрэг:
 * `editor` (мөр нэмэгч) · `approver` (батлагч).
 */
/**
 * ДЭД БҮТЦИЙН ЗАСВАРЫН хуваарилалтын нэг мөр — `__butets__:` угтвартай.
 * ⚠️ `ObyemRow`-той ижил бүтэц, ганц үүрэг (`editor`); `bagts` нь `bagtsKey`
 *    хэлбэрийн дэд бүтцийн багц («БАГЦ51»), Бөглөх хуудасны бүлэг БИШ.
 */
export type ButetsRow = {
  user: string;
  roles: string[];
  bagts: string[];
  grants?: Grant[];
};

export type AjilRow = {
  user: string;
  roles: string[];
  bagts: string[];
  /** ⚠️ Байвал ЭНЭ давамгайлна — `HuvaariRow`-тай ижил дүрэм */
  grants?: Grant[];
};

/**
 * ЧАНАРЫН БАРИМТЫН хуваарилалтын нэг мөр — `__chanar__:` угтвартай.
 * ⚠️ ДӨРВӨН үүрэг (author · tuh · chanar · habea) — `chanarAcl.ts`.
 */
export type ChanarRow = {
  user: string;
  roles: string[];
  bagts: string[];
  /** ⚠️ Байвал ЭНЭ давамгайлна — `HuvaariRow`-тай ижил дүрэм */
  grants?: Grant[];
};

const TITLE = 'Selbe_Permissions';
const TABLE_NAME = 'permissions';
/** Урсгалын томилгооны мөрийн `username` угтвар — эрхийн мөрөөс ялгана */
const FLOW_PREFIX = '__flow__:';
/** Нэмэлт эрхийн мөрийн `username` угтвар — эрх ба урсгалын мөрөөс ялгана */
const CAP_PREFIX = '__cap__:';
/** Чанарын (QAQC) багцын хуваарилалтын мөрийн угтвар — урсгалынхаас ялгана */
const QAQC_PREFIX = '__qaqc__:';
/** Хуваарийн хуваарилалтын мөрийн угтвар — чанарынхаас ялгана */
const HUVAARI_PREFIX = '__huvaari__:';
/** Инженерийн төлөвлөсөн обьёмын хуваарилалтын угтвар — хуваариныхаас ялгана */
const OBYEM_PREFIX = '__obyem__:';
/** Чанарын баримтын хуваарилалтын угтвар — QAQC-ийнхаас ялгана */
const CHANAR_PREFIX = '__chanar__:';
/** Нэмэлт ажлын хуваарилалтын угтвар — обьёмынхоос ялгана */
const AJIL_PREFIX = '__ajil__:';
/** Дэд бүтцийн засварын багцын хуваарилалтын угтвар — нэмэлт ажлынхаас ялгана */
const BUTETS_PREFIX = '__butets__:';
/**
 * ЭРХИЙН ТӨРЛИЙН ЗАГВАРЫН угтвар (2026-09-25) — `__type__:injener` г.м.
 * ⚠️ Хэрэглэгчийн мөр БИШ: загвар нь өөрөө эрх олгохгүй, админ «Төрлөөр
 *    тохируулах» дарахад л хуваарилалт болж бичигдэнэ (`roleTypeApply.ts`).
 */
const TYPE_PREFIX = '__type__:';

/** Эрхийн төрлийн нэг загвар — `tpl` нь задлаагүй JSON (`roleTypes.cleanTpl` шүүнэ) */
export type TypeRow = { role: string; tpl: unknown };

let tableUrlCache: string | undefined; // ⚠️ зөвхөн ОЛДСОН URL — null/олдоогүйг кэшлэхгүй (tableUrl-ыг үз)

/** IdentityManager-аас идэвхтэй token авах (нэвтрээгүй бол null) */
async function getToken(): Promise<{ token: string; user: string } | null> {
  try {
    /* ⚠️ 2026-10-05: токеноо АВАХААС ӨМНӨ шинэчилнэ. `findTableUrl`/`createTable` нь токеноо
       ӨӨРСДӨӨ `params`-д өгдөг (`token: 'org'`) тул `query.arcgisPost`-ын «498 → шинэчлээд
       дахин» зам тэдэнд АЖИЛЛАХГҮЙ (дуудагчийн токен хэвээр явна). Таб удаан нуугдаад
       сэрэхэд хугацаа дууссан токеноор хайлт унаж, `initRemote` → `false` → бүх эрх
       15 сек–5 мин хаалттай үлддэг байв. Node (тест) орчинд шууд буцна. */
    await ensureFreshToken();
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
 * ⚠️ ArcGIS нь алдаагаа HTTP 200 + `{error:{...}}` биеэр буцаадаг — шалгахгүй
 * бол `createTable` хагас дутуу (талбаргүй, share хийгдээгүй) «хордсон»
 * хүснэгт үүсгээд URL-ыг нь кэшилдэг байв. Одоо алдаанд ШИДНЭ — дуудагч
 * тал catch-ээрээ null/false руу ухардаг.
 */
/* ⚠️ 2026-09-30: `query.arcgisPost` (timeout · слот · 429 backoff · `res.ok`). `token: 'org'` —
   дуудагч `getToken()`-ы токеноо өөрөө `params`-д өгдөг тул түүнийг хэвээр эрхэмлэнэ. */
const req = (url: string, params: Record<string, string>) => arcgisPost(url, params, { token: 'org' });

const restBase = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing/rest`;

/** Хатуу тохиргооны super админууд — хүснэгтийн ЖИНХЭНЭ эзэн эдний нэг байх ёстой */
const SUPER_OWNERS = new Set(
  Object.entries(ROLE_BY_USER).filter(([, r]) => r === 'super').map(([u]) => u),
);
/**
 * ⚠️ ХУУЧИН ЭЗЭД (2026-08-29): super-ийг `ROLE_BY_USER`-аас хасахад түүний
 * үүсгэсэн хүснэгт хэнд ч «танигдахгүй» болж, бүх клиент эрх/томилгоо/
 * tombstone-оо алддаг байв. Super-ийг хасахдаа (а) ArcGIS дээр item-ыг одоогийн
 * super-т reassign хийнэ, ЭСВЭЛ (б) нэрийг нь энд үлдээнэ — super эрх БУЦАХГҮЙ,
 * зөвхөн хүснэгт олдох л зорилготой.
 *
 * ⚠️ 2026-10-05 — `ROLE_BY_USER`-ААС SUPER ХАСАХЫН ӨМНӨ ЗААВАЛ ШАЛГА:
 *    `Selbe_Permissions` item-ийн ЭЗЭН тэр хүн мөн үү (AGOL → item → Overview → Owner).
 *    Мөн бол хасмагц `findTableUrl` хүснэгтийг «танигдахгүй эзэнтэй» гэж татгалзаж,
 *    БҮХ хэрэглэгчийн remote эрх унтарна: панелаас нэмсэн аккаунт нэвтрэхгүй, бүх
 *    хуваарилалт/засах эрх хаагдана (fail-closed), админ панел түгжигдэнэ. Шинж тэмдэг:
 *    консолд «хүснэгтийн эзэн танигдсангүй: <нэр>», админ панелд улаан зурвас
 *    (`permsOwnerMismatch`). Засвар нь ХОЁРЫН НЭГ:
 *      (а) AGOL дээр item-ийн эзнийг одоогийн super-т шилжүүлэх (Change owner) — кодгүй;
 *      (б) хассан хүний нэрийг ДООРХ жагсаалтад нэмж дахин байршуулах.
 *    Ижил дүрэм `Selbe_*` ноорог/батлах хүснэгтүүдэд (`draftRemote` · `qaqcDraftRemote`).
 */
const FORMER_TABLE_OWNERS: string[] = [];
const TABLE_OWNERS = new Set([...SUPER_OWNERS, ...FORMER_TABLE_OWNERS.map((u) => u.toLowerCase())]);
/** Ижил нэртэй боловч танигдахгүй эзэнтэй хүснэгт олдсон — шинээр үүсгэхийг хориглоно */
let ownerMismatch = false;
/** Танигдаагүй эздийн нэрс (сүүлийн хайлт) — админд ИЛ хэлэхэд */
let mismatchOwners: string[] = [];
/**
 * ⚠️ 2026-10-05: ХҮСНЭГТИЙН ЭЗЭН ТАНИГДААГҮЙ бол эздийн нэрс (үгүй бол `[]`) — `UserAdmin`-ы
 *    улаан зурвас. Урьд нь шалтгаан ЗӨВХӨН консолд гардаг байсан тул super-ийг кодоос
 *    хассаны дараа «эрхийн хүснэгт уншигдсангүй» гэсэн ерөнхий түгжээнээс өөр дохио
 *    байгаагүй — админ сүлжээгээ шалгаж, дахин ачаалж цаг алдана.
 */
export const permsOwnerMismatch = (): string[] => (ownerMismatch ? mismatchOwners : []);
/**
 * ⚠️ ЭРХИЙН ХҮСНЭГТ НИЙТЭД (`access: public`) НЭЭЛТТЭЙ БАЙНА УУ (2026-09-08-ны
 * амьд шалгалт). `createTable` нь ЗӨВХӨН байгууллагад (`org:'true',
 * everyone:'false'`) хуваалцдаг боловч AGOL дээр гараар нийтийн болгосон байв.
 * Тэр үед НЭВТРЭЭГҮЙ хэн ч (`applyEdits` нь токенгүй амжилттай) БҮХ таван
 * ACL-ийн мөрийг нэмж, засаж, устгаж чадна — үүрэг, эрх, урсгал, чанар,
 * хуваарь, обьём бүгд энэ нэг хүснэгтэд. Кодоор засах боломжгүй (серверийн
 * тохиргоо) тул ИЛРҮҮЛЖ, админ панелд улаанаар мэдэгдэнэ.
 */
let tablePublic = false;
/** Эрхийн хүснэгт нийтэд нээлттэй эсэх — UserAdmin-ы анхааруулга */
export const permsTablePublic = (): boolean => tablePublic;

/**
 * Хүснэгтийн URL олох — байгаа item-ээс.
 *
 * ⚠️ ЭЗНИЙГ ШАЛГАНА: title хайлт нь org доторх ХЭНИЙ Ч үүсгэсэн ижил нэртэй
 * item-ыг буцааж болно — халдагч `Selbe_Permissions` нэртэй хуурамч хүснэгт
 * үүсгэвэл бүх клиент эрхээ түүнээс уншина. Зөвхөн хатуу тохиргооны super
 * админы эзэмшдэг хүснэгтийг л хүлээн авна.
 */
async function findTableUrl(token: string): Promise<string | null> {
  const search = await req(`${restBase()}/search`, {
    q: `title:"${TITLE}" type:"Feature Service"`,
    token,
    /*
     * ⚠️ 100 (2026-09-08): урьд нь '10' байв. Хайлт нь org доторх ХЭНИЙ Ч ижил
     * нэртэй item-ыг буцаадаг тул хэн нэгэн 10+ хуурамч `Selbe_Permissions`
     * үүсгэвэл ЖИНХЭНЭ хүснэгт эхний 10-т багтахаа больж, `ownerMismatch`
     * асаад бүх клиентийн remote эрх УНТАРНА (үйлчилгээ таслах халдлага).
     * Эзний шүүлтүүр нь хэвээр — энэ нь зөвхөн хайлтын цонхыг өргөсгөнө.
     */
    num: '100',
  });
  const results = (search.results as Array<{ url?: string; title?: string; owner?: string; access?: string }>) ?? [];
  const same = results.filter((x) => x.title === TITLE && x.url);
  const hit = same.find((x) => TABLE_OWNERS.has(String(x.owner ?? '').toLowerCase()));
  /* ⚠️ Нийтэд нээлттэй эсэхийг ЭНД барина — item-ийн `access` талбар хайлтын
     хариунд хамт ирдэг, нэмэлт хүсэлт хэрэггүй (`tablePublic`-ийн тайлбар). */
  tablePublic = String(hit?.access ?? '') === 'public';
  if (tablePublic) {
    console.error(
      `[selbe] ${TITLE} хүснэгт НИЙТЭД (public) нээлттэй — нэвтрээгүй хэн ч эрхийн мөр засаж чадна.`,
      'AGOL дээр item-ийн Share-ийг «Organization» болгоно уу.',
    );
  }
  // ⚠️ Ижил нэртэй хүснэгт байгаа ч эзэн нь танигдахгүй → ШИНЭЭР ҮҮСГЭХГҮЙ
  //    (нэр давхцаж унана, эсвэл салаа хүснэгт үүсэж өгөгдөл хуваагдана).
  //    Админ item-ыг reassign хийх хүртэл remote унтраалттай — шалтгааныг ил хэлнэ.
  ownerMismatch = !hit && same.length > 0;
  mismatchOwners = ownerMismatch ? [...new Set(same.map((x) => String(x.owner ?? '?')))] : [];
  if (ownerMismatch) {
    /* ⚠️ 2026-10-05: ЯГ юу хийхийг хэлнэ — эзний нэр, хоёр засвар (FORMER_TABLE_OWNERS-ийн ⚠️) */
    console.error(
      `[selbe] ${TITLE} хүснэгтийн эзэн танигдсангүй: ${mismatchOwners.join(', ')}.`,
      'Энэ нэр кодын super жагсаалтад (ROLE_BY_USER) алга тул БҮХ хэрэглэгчийн remote эрх унтарсан.',
      `Засвар: (а) AGOL дээр item-ийн эзнийг одоогийн super-т шилжүүлэх (Change owner), ЭСВЭЛ (б) src/lib/permsRemote.ts-ийн FORMER_TABLE_OWNERS-д '${mismatchOwners.join("', '")}' нэмж дахин байршуулах.`,
    );
  }
  return hit?.url ? `${hit.url}/0` : null;
}

/** Хүснэгт үүсгэх (publish эрхтэй super admin) — service + table definition */
async function createTable(token: string, user: string): Promise<string | null> {
  const createParameters = {
    name: TITLE,
    serviceDescription: tr('Сэлбэ порталын хэрэглэгчийн эрх'),
    hasStaticData: false,
    maxRecordCount: 10000,
    capabilities: 'Query,Editing,Create,Update,Delete',
    spatialReference: { wkid: 102100 },
    allowGeometryUpdates: false,
    units: 'esriMeters',
  };
  const created = await req(`${restBase()}/content/users/${encodeURIComponent(user)}/createService`, {
    token,
    createParameters: JSON.stringify(createParameters),
    outputType: 'featureService',
  });
  const serviceUrl = created.encodedServiceURL as string | undefined;
  const itemId = created.itemId as string | undefined;
  if (!serviceUrl || !itemId) return null;

  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const table = {
    tables: [{
      name: TABLE_NAME,
      type: 'Table',
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', nullable: false, editable: false },
        { name: 'username', type: 'esriFieldTypeString', length: 256, nullable: false, editable: true },
        { name: 'role', type: 'esriFieldTypeString', length: 32, nullable: true, editable: true },
        { name: 'views', type: 'esriFieldTypeString', length: 2048, nullable: true, editable: true },
        { name: 'docs', type: 'esriFieldTypeSmallInteger', nullable: true, editable: true },
      ],
    }],
  };
  await req(`${adminUrl}/addToDefinition`, { token, addToDefinition: JSON.stringify(table) });
  // Байгууллага даяар УНШИХ эрх нээх
  await req(`${restBase()}/content/users/${encodeURIComponent(user)}/items/${itemId}/share`, {
    token, org: 'true', everyone: 'false',
  });
  return `${serviceUrl}/0`;
}

/**
 * Хүснэгтийн URL-ыг тодорхойлох — олох, эс бөгөөс (super) үүсгэх.
 *
 * ⚠️ `canCreate = true` нь ЗӨВХӨН `fetchAll` ← `permissions.initRemote`-ийн
 *    нэвтрэх агшны хатуу super замаас ирнэ (2026-09-21). Бичих замууд
 *    (`upsertByKey` · `removeByKey`) урьд нь бүгд `tableUrl(true)` дууддаг
 *    байв — порталын search индекс түр хоцрох/алдаа гарах агшинд super-ийн
 *    ямар ч бичилт ХОЁР ДАХЬ `Selbe_Permissions` үүсгэж, эрх/томилгоо хоёр
 *    хүснэгтэд хуваагдах эрсдэлтэй байлаа. Одоо бичилт хүснэгт олдохгүй бол
 *    `false` буцаана (dirty-set-д тэмдэглэгдэж дараа retry) — үүсгэхгүй.
 */
async function tableUrl(canCreate: boolean): Promise<string | null> {
  // ⚠️ Зөвхөн ОЛДСОН URL-ыг кэшлэнэ — null-ыг кэшлэвэл порталын search транзит
  //    алдаа/индексжилтийн хоцрогдолтой үед «олдсонгүй» сешн даяар тогтмолжиж,
  //    remote эрх огт уншигдахгүй байв; одоо дараагийн дуудлагад дахин хайна.
  if (tableUrlCache) return tableUrlCache;
  const auth = await getToken();
  if (!auth) return null;
  let url = await findTableUrl(auth.token);
  /*
   * ⚠️ ЗӨВХӨН ЭЗЭН ҮҮСГЭНЭ (2026-09-15-ны аудит). Урьд нь `TABLE_OWNERS`
   *    шалгуургүй байсан тул порталын search индекс хоцрох/түр алдаа гарах
   *    агшинд publish эрхтэй ЖИРИЙН хэрэглэгч ӨӨРИЙН эзэмшлийн хуурамч
   *    `Selbe_Permissions` үүсгэж чаддаг байв. Дараа нь `findTableUrl` нь
   *    эзэн таарахгүй гэж `ownerMismatch` тавьж, БҮХ клиентийн remote эрх,
   *    урсгал, QAQC, хуваарь, обьёмын томилгоо унтарна.
   *
   * ⚠️ `draftRemote.ts` ба `qaqcDraftRemote.ts` аль хэдийн ижил шалгууртай —
   *    энэ файл л хоцорсон байв.
   */
  if (!url && canCreate && !ownerMismatch && TABLE_OWNERS.has(auth.user.toLowerCase())) {
    url = await createTable(auth.token, auth.user);
  }
  if (url) tableUrlCache = url;
  return url;
}

type FeatureLayerMod = typeof import('@arcgis/core/layers/FeatureLayer').default;
type FeatureLayerInst = InstanceType<FeatureLayerMod>;
async function layer(url: string): Promise<FeatureLayerInst> {
  const { default: FeatureLayer } = (await import('@arcgis/core/layers/FeatureLayer')) as { default: FeatureLayerMod };
  return new FeatureLayer({ url });
}

type RawAttrs = { OBJECTID?: number; username?: string; role?: string; views?: string; docs?: number };

/**
 * БҮХ мөрийг хуудаслаж татна.
 * ⚠️ `maxRecordCount`-аас хэтэрсэн мөрийг чимээгүй хаявал сүүлд нэмэгдсэн
 * хэрэглэгчид «эрхгүй» болно — хуудаслалт ЗААВАЛ.
 */
async function queryAllRows(fl: FeatureLayerInst, where: string): Promise<RawAttrs[]> {
  const out: RawAttrs[] = [];
  for (let offset = 0; ; ) {
    const res = await fl.queryFeatures({
      where, outFields: ['*'], returnGeometry: false,
      orderByFields: ['OBJECTID ASC'], start: offset, num: 2000,
    });
    out.push(...res.features.map((f) => f.attributes as RawAttrs));
    if (!res.exceededTransferLimit || res.features.length === 0) break;
    offset += res.features.length;
  }
  return out;
}

/**
 * Бүх мөрийг татаж, ЭРХ ба УРСГАЛЫН томилгоо болгон ялгана.
 *
 * ⚠️ Нэг л асуулгаар хоёуланг нь авна — `initRemote` 5 минут тутам дуудагддаг
 * тул давхар round-trip дэмий.
 */
export async function fetchAll(
  canCreate = false,
): Promise<{
  perms: Record<string, RemoteRow>; flow: FlowRow[]; caps: CapRow[]; qaqc: QaqcRow[];
  huvaari: HuvaariRow[]; obyem: ObyemRow[]; chanar: ChanarRow[]; ajil: AjilRow[];
  butets: ButetsRow[]; types: TypeRow[];
} | null> {
  try {
    const url = await tableUrl(canCreate);
    if (!url) return null;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, '1=1');
    const perms: Record<string, RemoteRow> = {};
    /*
     * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ ТОМИЛГОО (2026-08-29): зэрэгцээ бичилтийн race-аас
     * давхар `__flow__:` мөр үүсвэл уншилт нь ЭХНИЙХ, бичилт нь СҮҮЛИЙНХ (их OID)
     * мөрийг авч зөрдөг байв — багцын хязгаар чимээгүй арилах, эсвэл нэг аккаунт
     * хоёр шатанд. Мөрүүд OBJECTID ASC ирдэг тул Map-д сүүлийнх нь ялна — эрхийн
     * мөртэй ижил дүрэм (`upsertByKey`).
     */
    const flowBy = new Map<string, FlowRow>();
    /*
     * ⚠️ НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР (2026-09-08). Урьд нь массив байсан тул
     * зэрэгцээ бичилтийн race-аас үүссэн давхар `__cap__:` мөр ХОЁУЛАА
     * жагсаалтад ордог байв. `_syncRemoteCaps` нь эхнээс нь давтдаг учир
     * СҮҮЛИЙНХ нь ялах ёстой атлаа `upsertByKey` их OID-д бичдэг тул хассан
     * эрх (хуучин, бага OID мөрд үлдсэн) дараалал зөрөхөд СЭРГЭДЭГ байлаа.
     * Map нь flow/qaqc/huvaari/obyem-тэй ижил дүрмийг барина: их OID ялна
     * (мөрүүд OBJECTID ASC ирдэг).
     */
    const capsBy = new Map<string, CapRow>();
    /* ⚠️ QAQC мөр ч мөн НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР — flow-той ижил дүрэм */
    const qaqcBy = new Map<string, QaqcRow>();
    /* ⚠️ Хуваарийн мөр ч мөн НЭГ ХЭРЭГЛЭГЧ = НЭГ МӨР */
    const huvaariBy = new Map<string, HuvaariRow>();
    const obyemBy = new Map<string, ObyemRow>();
    const chanarBy = new Map<string, ChanarRow>();
    const ajilBy = new Map<string, AjilRow>();
    const butetsBy = new Map<string, ButetsRow>();
    /* ⚠️ Эрхийн төрлийн загвар — НЭГ ТӨРӨЛ = НЭГ МӨР, их OID ялна */
    const typesBy = new Map<string, TypeRow>();
    for (const a of rows) {
      if (!a.username) continue;

      /* ── Эрхийн төрлийн загварын мөр (2026-09-25) ── */
      if (a.username.startsWith(TYPE_PREFIX)) {
        const role = a.username.slice(TYPE_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as unknown;
          /* ⚠️ 2026-09-25: эвдэрсэн мөр → `tpl: null` — `roleTypes` нарийн нөөц (`ROLE_ACCESS`)
             өгнө; урьд нь алгасдаг байсан тул ӨРГӨН анхдагч загвар (`DEFAULT_TPL`) үйлчилж байв */
          typesBy.set(role, { role, tpl: d && typeof d === 'object' ? d : null });
        } catch { typesBy.set(role, { role, tpl: null }); }
        continue;
      }

      /* ── Нэмэлт ажлын хуваарилалтын мөр ── */
      if (a.username.startsWith(AJIL_PREFIX)) {
        const user = a.username.slice(AJIL_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (user) {
            ajilBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (fail-closed) */ }
        continue;
      }

      /* ── Дэд бүтцийн засварын хуваарилалтын мөр ── */
      if (a.username.startsWith(BUTETS_PREFIX)) {
        const user = a.username.slice(BUTETS_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (user) {
            butetsBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (fail-closed) */ }
        continue;
      }

      /* ── Чанарын баримтын хуваарилалтын мөр ── */
      if (a.username.startsWith(CHANAR_PREFIX)) {
        const user = a.username.slice(CHANAR_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (user) {
            chanarBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (fail-closed) */ }
        continue;
      }

      /* ── Инженерийн төлөвлөсөн обьёмын хуваарилалтын мөр ── */
      if (a.username.startsWith(OBYEM_PREFIX)) {
        const user = a.username.slice(OBYEM_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (user) {
            obyemBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Хуваарийн хуваарилалтын мөр ── */
      if (a.username.startsWith(HUVAARI_PREFIX)) {
        const user = a.username.slice(HUVAARI_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as ViewsJson;
          if (user) {
            huvaariBy.set(user, {
              user,
              roles: Array.isArray(d.roles) ? d.roles : [],
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Чанарын (QAQC) багцын хуваарилалтын мөр ── */
      if (a.username.startsWith(QAQC_PREFIX)) {
        const user = a.username.slice(QAQC_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as { bagts?: string[] };
          if (user) {
            qaqcBy.set(user, { user, bagts: Array.isArray(d.bagts) ? d.bagts : [] });
          }
        } catch { /* эвдэрсэн мөр — алгасна (хуваарилалтгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Нэмэлт эрхийн мөр ── */
      if (a.username.startsWith(CAP_PREFIX)) {
        const user = a.username.slice(CAP_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '[]') as unknown;
          if (user && Array.isArray(d)) capsBy.set(user, { user, caps: d as string[] });
        } catch { /* эвдэрсэн мөр — алгасна (эрхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Урсгалын томилгооны мөр ── */
      if (a.username.startsWith(FLOW_PREFIX)) {
        const user = a.username.slice(FLOW_PREFIX.length).toLowerCase();
        try {
          const d = JSON.parse(a.views || '{}') as {
            stage?: string; bagts?: string[]; viewOnly?: boolean;
          };
          if (user && d.stage) {
            flowBy.set(user, {
              user,
              stage: d.stage,
              bagts: Array.isArray(d.bagts) ? d.bagts : [],
              /* ⚠️ ЗӨВХӨН ЯГ `true` — эргэлзээтэй утга эрх ХАСАХГҮЙ (2026-09-09) */
              ...(d.viewOnly === true ? { viewOnly: true as const } : {}),
            });
          }
        } catch { /* эвдэрсэн мөр — алгасна (томилгоо байхгүйтэй ижил, fail-closed) */ }
        continue;
      }

      /* ── Эрхийн мөр ── */
      // Устгагдсан аккаунт — `views` талбарт `removed` шууд утга (JSON биш)
      const removed = a.views === 'removed';
      // ⚠️ FAIL-CLOSED: views талбар хоосон/эвдэрсэн (JSON алдаа, урт таслагдсан)
      //    бол «бүх эрх» БИШ, «эрхгүй» ([]) руу унана — аюулгүй байдлын анхдагч.
      let views: ViewKey[] | 'all' = [];
      if (!removed) {
        try {
          const v = a.views ? JSON.parse(a.views) : [];
          views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
        } catch { views = []; }
      }
      /* ⚠️ 2026-10-09: `__proto__` · `constructor` · `prototype` нэртэй мөрийг АЛГАСНА — хүснэгтэд
         бичих эрхтэй хүн ийм `username` бичвэл `perms[k] = …` нь энгийн объектын прототипыг солиж,
         бүртгэлгүй бүх нэрэнд «эрх» харагдах боломжтой байв (`caps.UNSAFE_KEY`). */
      if (UNSAFE_KEY.has(a.username.toLowerCase())) continue;
      perms[a.username.toLowerCase()] = {
        username: a.username,
        role: (a.role as Role) || null,
        views,
        // ⚠️ FAIL-CLOSED: зөвхөн ТОДОРХОЙ 1 (эсвэл true) бол эрх нээнэ; null/хоосон → үгүй
        docs: a.docs === 1 || (a.docs as unknown) === true,
        ...(removed ? { removed: true } : {}),
      };
    }
    return {
      perms,
      flow: [...flowBy.values()],
      caps: [...capsBy.values()],
      qaqc: [...qaqcBy.values()],
      huvaari: [...huvaariBy.values()],
      obyem: [...obyemBy.values()],
      chanar: [...chanarBy.values()],
      ajil: [...ajilBy.values()],
      butets: [...butetsBy.values()],
      types: [...typesBy.values()],
    };
  } catch {
    return null;
  }
}

/**
 * `username`-ээр таарах БҮХ мөрийн OBJECTID (өсөх эрэмбээр).
 * ⚠️ Давхар мөр нь зэрэгцээ бичилтийн race-аас үүсдэг бөгөөд `fetchAll`-д
 * СҮҮЛИЙН (их OID) мөр ялдаг тул засварыг ч мөн их OID-д хийж, бусдыг нь
 * устгана — эс бөгөөс «хадгалсан ч үйлчлэхгүй» чимээгүй алдаа гардаг байв.
 */
async function findOids(fl: FeatureLayerInst, username: string): Promise<number[]> {
  /*
   * ⚠️ ХУУДАСЛАЛТ (2026-09-08): урьд нь ганц дуудлага байсан тул үйлчилгээний
   * `maxRecordCount` (ихэвчлэн 1000, зарим дээр 2000)-аас дээш давхар мөр
   * үүссэн тохиолдолд илүүдэл нь ОГТ буцаагддаггүй байв. Тэр нь `upsertByKey`-д
   * «цэвэрлэх давхардал алга» гэж харагдаж, цэвэрлэгдээгүй хуучин мөр дараагийн
   * уншилтад эргэн гарч ирнэ. `orderByFields`-гүй offset нь мөр алгасдаг тул
   * эрэмбийг ЗААВАЛ хадгална (CLAUDE.md-ийн ArcGIS занга).
   */
  const where = `LOWER(username) = '${username.toLowerCase().replace(/'/g, "''")}'`;
  const out: number[] = [];
  for (let offset = 0; ; ) {
    const found = await fl.queryFeatures({
      where, outFields: ['OBJECTID'], returnGeometry: false,
      orderByFields: ['OBJECTID ASC'], start: offset, num: 2000,
    });
    out.push(...found.features
      .map((x) => x.attributes?.OBJECTID as number)
      .filter((x) => typeof x === 'number'));
    if (!found.exceededTransferLimit || found.features.length === 0) break;
    offset += found.features.length;
  }
  return out;
}

const editOk = (r: { error?: unknown }[] | undefined): boolean =>
  (r ?? []).every((x) => x.error == null);

/**
 * ⚠️ 2026-10-05: `views` ТАЛБАРЫН УРТ — `createTable`-д 2048 тэмдэгт. Урьд нь шалгалтгүй
 *    байсан тул олон багц × олон үүрэгтэй `grants` JSON (эсвэл том загвар) хязгаараас
 *    хэтрэхэд ArcGIS бичилтийг ерөнхий алдаагаар татгалзаж (зарим үйлчилгээ ТАСЛААД
 *    хадгалдаг — тэр үед JSON эвдэрч мөр fail-closed «эрхгүй» болно), админд зөвхөн
 *    «ArcGIS-т хадгалагдсангүй» гэж харагддаг байв. Одоо бичихээс ӨМНӨ шалгаж, шалтгааныг
 *    нэрлэсэн алдаа шиднэ; `upsertByKey` түүнийг барьж `false` буцаана (бүх дуудагчийн
 *    `Promise<boolean>` гэрээ хэвээр), текстийг `takeWriteError` UI-д хүргэнэ.
 */
const VIEWS_MAX = 2048;
let lastWriteErr = '';
let lastWriteErrAt = 0;
/**
 * Сүүлийн бичилтийн ТОДОРХОЙ шалтгаан (уншмагц цэвэрлэгдэнэ) — `aclOps.runOp` · `UserAdmin`.
 * ⚠️ 15 секундээс хуучныг буцаахгүй — өөр замаар (жиш. загвар хадгалах) үлдсэн хуучин
 *    мессеж дараагийн, хамааралгүй уналтад гарч төөрөгдүүлэхгүй.
 */
export function takeWriteError(): string {
  const m = Date.now() - lastWriteErrAt < 15_000 ? lastWriteErr : '';
  lastWriteErr = '';
  return m;
}
/**
 * ⚠️ 2026-10-06 (аудит): БҮХ уналтын замын шалтгааныг тэмдэглэнэ (урьд нь зөвхөн уртын
 *    шалгалт). `upsertByKey` · `removeByKey` нь нүцгэн `false` буцаадаг тул UI зөвхөн ерөнхий
 *    «хадгалагдсангүй» харуулдаг байв. `Promise<boolean>` гэрээг ӨӨРЧЛӨХГҮЙ (20+ дуудагч) —
 *    шалтгаан нь `takeWriteError()`-ээр; дэлгэцэнд `ui.userError`-оор (дуудагч тал).
 *    Эхний (хамгийн тодорхой) шалтгааныг дарахгүй.
 */
function noteWriteError(e: unknown): void {
  if (lastWriteErr && Date.now() - lastWriteErrAt < 15_000) return;
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e
    : String((e as { message?: string } | null)?.message ?? e ?? '');
  if (!m) return;
  /* ⚠️ «ArcGIS-т хадгалагдсангүй» угтвар ЗААВАЛ — түүхий шалтгаан («fake failure», «Failed
     to fetch») дангаараа юу болсныг хэлэхгүй (aclE2E §7b) */
  lastWriteErr = tr('ArcGIS-т хадгалагдсангүй: {0}', m);
  lastWriteErrAt = Date.now();
}
/** applyEdits-ийн үр дүнгийн ЭХНИЙ алдааны текст */
const editErr = (r: { error?: unknown }[] | undefined): string => {
  const x = (r ?? []).find((y) => y.error != null)?.error as { message?: string; description?: string } | undefined;
  return x ? String(x.message ?? x.description ?? '') : '';
};
function assertViewsFit(usernameKey: string, attrs: Record<string, unknown>): void {
  const v = attrs.views;
  if (typeof v !== 'string' || v.length <= VIEWS_MAX) return;
  const msg = tr('«{0}» мөрийн эрхийн өгөгдөл хэт урт ({1} тэмдэгт, дээд тал нь {2}) тул хадгалагдсангүй — багцын жагсаалтыг цөөлөх эсвэл «Бүх багц» болгоно уу.',
    usernameKey, v.length, VIEWS_MAX);
  lastWriteErr = msg;
  lastWriteErrAt = Date.now();
  console.error('[selbe]', msg);
  throw new Error(msg);
}

/** Нэг түлхүүр (username)-д нэг мөр байлгаж upsert хийнэ; давхардлыг цэвэрлэнэ */
async function upsertByKey(usernameKey: string, attrs: Record<string, unknown>): Promise<boolean> {
  try {
    /* ⚠️ 2026-10-05: уртын шалгалт — сүлжээний хүсэлтээс ӨМНӨ (`assertViewsFit`-ийн ⚠️) */
    assertViewsFit(usernameKey, attrs);
    /* ⚠️ `false` — бичилт хүснэгт ҮҮСГЭХГҮЙ (2026-09-21, `tableUrl`-ийн тайлбар) */
    const url = await tableUrl(false);
    if (!url) { noteWriteError(tr('Эрхийн хүснэгт олдсонгүй эсвэл хандах эрхгүй байна.')); return false; }
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    const target = oids.length ? oids[oids.length - 1] : null;
    const dupes = oids.slice(0, -1);
    const edit = {
      ...(target != null
        ? { updateFeatures: [{ attributes: { OBJECTID: target, ...attrs } }] }
        : { addFeatures: [{ attributes: attrs }] }),
      ...(dupes.length ? { deleteFeatures: dupes.map((objectId) => ({ objectId })) } : {}),
    };
    const r = await fl.applyEdits(edit as Parameters<typeof fl.applyEdits>[0]);
    const ok = [...(r.addFeatureResults ?? []), ...(r.updateFeatureResults ?? [])];
    const good = ok.length > 0 && ok.every((x) => x.error == null) && editOk(r.deleteFeatureResults);
    if (!good) noteWriteError(editErr(ok) || editErr(r.deleteFeatureResults) || tr('ArcGIS бичилтийг хүлээж авсангүй.'));
    return good;
  } catch (e) {
    noteWriteError(e);
    return false;
  }
}

/** Түлхүүрт таарах БҮХ мөрийг устгана (давхардал ч бас) */
async function removeByKey(usernameKey: string): Promise<boolean> {
  try {
    /* ⚠️ `false` — устгал хүснэгт ҮҮСГЭХГҮЙ (2026-09-21, `tableUrl`-ийн тайлбар) */
    const url = await tableUrl(false);
    if (!url) { noteWriteError(tr('Эрхийн хүснэгт олдсонгүй эсвэл хандах эрхгүй байна.')); return false; }
    const fl = await layer(url);
    const oids = await findOids(fl, usernameKey);
    if (!oids.length) return true;
    const del = { deleteFeatures: oids.map((objectId) => ({ objectId })) } as Parameters<typeof fl.applyEdits>[0];
    const r = await fl.applyEdits(del);
    const good = editOk(r.deleteFeatureResults);
    if (!good) noteWriteError(editErr(r.deleteFeatureResults) || tr('ArcGIS бичилтийг хүлээж авсангүй.'));
    return good;
  } catch (e) {
    noteWriteError(e);
    return false;
  }
}

/**
 * НЭГ ТҮЛХҮҮРИЙН `views`-ИЙГ ШИНЭЭР УНШИНА — бичихийн ЯГ ӨМНӨ нэгтгэхэд (2026-10-04).
 * ⚠️ ЯАГААД: `caps.setCaps` · `scopedAcl.pushRow` нь ≤5 мин настай кэшээс БҮТЭН жагсаалт
 *    бичдэг тул хоёр админ нэг хэрэглэгчийг зэрэг засвал сүүлд бичсэн нь өмнөхийн
 *    нэмсэн эрх/багцыг чимээгүй арчдаг байв. Одоо дуудагч энэ шинэ утга дээр ӨӨРИЙН
 *    ганц өөрчлөлтийг (нэмсэн/хассан) давхарлаж бичнэ.
 * @returns `undefined` = уншиж чадсангүй (дуудагч БИЧИХГҮЙ), `null` = мөр алга,
 *   эс бөгөөс их OID-тай мөрийн `views` (`fetchAll`-ийн «их OID ялна» дүрэм).
 */
async function readViewsByKey(key: string): Promise<string | null | undefined> {
  const r = await readRowByKey(key);
  if (r === undefined) return undefined;
  return r ? String(r.views ?? '') : null;
}

/** Нэг түлхүүрийн их OID-тай МӨРИЙГ бүтнээр — `undefined` = уншиж чадсангүй, `null` = мөр алга */
async function readRowByKey(key: string): Promise<RawAttrs | null | undefined> {
  try {
    const url = await tableUrl(false);
    if (!url) return undefined;
    const fl = await layer(url);
    const rows = await queryAllRows(fl, `LOWER(username) = '${key.toLowerCase().replace(/'/g, "''")}'`);
    return rows[rows.length - 1] ?? null;
  } catch {
    return undefined;
  }
}

/**
 * Урсгалын томилгоог ШИНЭЭР уншина (`guitsetgelAcl.pushFlow`-ийн нэгтгэлд, 2026-10-05).
 * ⚠️ `capRead`/`scopedRead`-ийн ижил зорилго: хоёр админ нэг хүний багцыг зэрэг засахад
 *    сүүлд бичсэн нь өмнөхийнхийг арчихгүй. Задлалт `fetchAll`-тэй ИЖИЛ.
 * @returns `null` = уншиж чадсангүй; `{ row: null }` = мөр алга / эвдэрсэн (томилгоогүй).
 */
export async function flowRead(user: string): Promise<{ row: FlowRow | null } | null> {
  const u = user.trim().toLowerCase();
  const v = await readViewsByKey(FLOW_PREFIX + u);
  if (v === undefined) return null;
  if (v === null) return { row: null };
  try {
    const d = JSON.parse(v || '{}') as { stage?: string; bagts?: string[]; viewOnly?: boolean };
    if (!d.stage) return { row: null };
    return {
      row: {
        user: u,
        stage: d.stage,
        bagts: Array.isArray(d.bagts) ? d.bagts : [],
        ...(d.viewOnly === true ? { viewOnly: true as const } : {}),
      },
    };
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил алгасна (томилгоогүй, fail-closed) */
    return { row: null };
  }
}

/**
 * Хэрэглэгчийн ЭРХИЙН мөрийг ШИНЭЭР уншина (`permissions.setUser`-ийн нэгтгэлд, 2026-10-05).
 * ⚠️ Задлалт `fetchAll`-ийн «Эрхийн мөр» хэсэгтэй ИЖИЛ (fail-closed: эвдэрсэн `views` → `[]`,
 *    `docs` зөвхөн тодорхой 1).
 * @returns `null` = уншиж чадсангүй; `{ row: null }` = мөр алга.
 */
export async function userRead(username: string): Promise<{ row: RemoteRow | null } | null> {
  const a = await readRowByKey(username.trim());
  if (a === undefined) return null;
  if (a === null || !a.username) return { row: null };
  const removed = a.views === 'removed';
  let views: ViewKey[] | 'all' = [];
  if (!removed) {
    try {
      const v = a.views ? JSON.parse(a.views) : [];
      views = v === 'all' ? 'all' : Array.isArray(v) ? (v as ViewKey[]) : [];
    } catch { views = []; }
  }
  return {
    row: {
      username: a.username,
      role: (a.role as Role) || null,
      views,
      docs: a.docs === 1 || (a.docs as unknown) === true,
      ...(removed ? { removed: true } : {}),
    },
  };
}

/** Хэрэглэгчийн нэмэлт эрхийг ШИНЭЭР уншина — `null` = уншиж чадсангүй, `[]` = мөр алга */
export async function capRead(user: string): Promise<string[] | null> {
  const v = await readViewsByKey(CAP_PREFIX + user.trim().toLowerCase());
  if (v === undefined) return null;
  if (v === null) return [];
  try {
    const d = JSON.parse(v || '[]') as unknown;
    return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил эрхгүй гэж уншина (fail-closed) */
    return [];
  }
}

/** `scopedAcl`-ийн систем бүрийн угтвар */
const SCOPED_PREFIX = {
  huvaari: HUVAARI_PREFIX, obyem: OBYEM_PREFIX, chanar: CHANAR_PREFIX,
  ajil: AJIL_PREFIX, butets: BUTETS_PREFIX, qaqc: QAQC_PREFIX,
} as const;
export type ScopedKind = keyof typeof SCOPED_PREFIX;

/**
 * Багцын хуваарилалтын мөрийг ШИНЭЭР уншина (`scopedAcl.pushRow`-ийн нэгтгэлд).
 * @returns `null` = уншиж чадсангүй; `{ row: null }` = мөр алга; эс бөгөөс `fetchAll`-тэй ижил задлалт.
 */
export async function scopedRead(
  kind: ScopedKind, user: string,
): Promise<{ row: { roles: string[]; bagts: string[]; grants?: Grant[] } | null } | null> {
  const v = await readViewsByKey(SCOPED_PREFIX[kind] + user.trim().toLowerCase());
  if (v === undefined) return null;
  if (v === null) return { row: null };
  try {
    const d = JSON.parse(v || '{}') as ViewsJson;
    return {
      row: {
        roles: Array.isArray(d.roles) ? d.roles : [],
        bagts: Array.isArray(d.bagts) ? d.bagts : [],
        ...(Array.isArray(d.grants) ? { grants: d.grants } : {}),
      },
    };
  } catch {
    /* эвдэрсэн мөр — `fetchAll`-ийн адил алгасна (хуваарилалтгүй) */
    return { row: null };
  }
}

/** Нэг хэрэглэгчийн эрхийн мөрийг нэмэх/шинэчлэх (upsert) */
export function upsert(row: RemoteRow): Promise<boolean> {
  return upsertByKey(row.username, {
    username: row.username,
    role: row.role ?? null,
    // Устгагдсан аккаунт — JSON биш `removed` шууд утга (RemoteRow-ийн тайлбарыг үз)
    views: row.removed ? 'removed' : JSON.stringify(row.views),
    docs: row.docs ? 1 : 0,
  });
}

/** Хэрэглэгчийн эрхийн мөрийг устгах */
export function remove(username: string): Promise<boolean> {
  return removeByKey(username);
}

/**
 * Урсгалын томилгоог бичих — нэг хэрэглэгч нэг мөр (`__flow__:` угтвартай).
 *
 * ⚠️ `viewOnly` нь ЗӨВХӨН `true` үед бичигдэнэ (2026-09-09). Хуучин мөр
 *    талбаргүй хэвээр үлдэж, задлахад `undefined` = ЖИРИЙН томилгоо болно —
 *    тэр туг эрхийг ХАСДАГ болохоос НЭМДЭГГҮЙ тул анхдагч нь аюулгүй.
 */
export function flowUpsert(
  user: string, stage: string, bagts: string[], viewOnly = false,
): Promise<boolean> {
  const key = FLOW_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(viewOnly ? { stage, bagts, viewOnly: true } : { stage, bagts }),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бичих — нэг хэрэглэгч нэг мөр (`__cap__:` угтвартай) */
export function capUpsert(user: string, caps: string[]): Promise<boolean> {
  const key = CAP_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(caps),
    docs: 0,
  });
}

/** Нэмэлт эрхийг бүрмөсөн арилгах (эрхгүй болгох) */
export function capRemove(user: string): Promise<boolean> {
  return removeByKey(CAP_PREFIX + user.toLowerCase());
}

/** Урсгалын томилгоог арилгах */
export function flowRemove(user: string): Promise<boolean> {
  return removeByKey(FLOW_PREFIX + user.toLowerCase());
}

/**
 * Чанарын (QAQC) багцын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 *
 * ⚠️ `{ bagts }` объектоор бичнэ, массиваар БИШ: `__cap__:` мөр нь массив
 * хадгалдаг тул хэлбэрээр нь ялгаж болохгүй, гэхдээ ирээдүйд талбар нэмэхэд
 * (жишээ нь тайлбар) хэлбэр өөрчлөгдөхгүй байх нь чухал. `__flow__:`-тэй ижил.
 */
export function qaqcUpsert(user: string, bagts: string[]): Promise<boolean> {
  const key = QAQC_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify({ bagts }),
    docs: 0,
  });
}

/** Чанарын багцын хуваарилалтыг арилгах */
/** Эрхийн төрлийн загварыг бичих — нэг төрөл нэг мөр */
export function typeUpsert(role: string, tpl: unknown): Promise<boolean> {
  const key = TYPE_PREFIX + role.toLowerCase();
  return upsertByKey(key, { username: key, role: null, views: JSON.stringify(tpl), docs: 0 });
}

export function qaqcRemove(user: string): Promise<boolean> {
  return removeByKey(QAQC_PREFIX + user.toLowerCase());
}

/**
 * Хуваарийн хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `roles` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 *    тээвэрлэнэ (`huvaariAcl` танигдахгүйг нь хаяна) — `caps`-тай ижил зарчим.
 */
export function huvaariUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = HUVAARI_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    /*
     * ⚠️ ХОЁР ХЭЛБЭРИЙГ ЗЭРЭГ БИЧНЭ (2026-09-09). `grants` нь ҮНЭН эх сурвалж;
     *    `roles`/`bagts` нь ХУУЧИН клиент build уншиж чадах нөөц (нэгдэл).
     *    Ингэсэн тул шинэ клиент бичсэн мөрийг хуучин клиент нээхэд эрх
     *    ЧИМЭЭГҮЙ алга болохгүй. Хуучин нь үржвэр болж УЯН болох тул
     *    (жишээ нь Багц 1-д батлагч ч болох) — энэ нь fail-closed биш ч
     *    зөвхөн ШИЛЖИЛТИЙН хугацаанд, зөвхөн хуучин build дээр үйлчилнэ.
     */
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/**
 * Инженерийн төлөвлөсөн обьёмын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `roles` нь ЧӨЛӨӨТ мөрийн массив: энэ модуль утгыг нь ШАЛГАХГҮЙ, зөвхөн
 *    тээвэрлэнэ (`obyemAcl` танигдахгүйг нь хаяна).
 */
export function obyemUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = OBYEM_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    /*
     * ⚠️ ХОЁР ХЭЛБЭРИЙГ ЗЭРЭГ БИЧНЭ (2026-09-09). `grants` нь ҮНЭН эх сурвалж;
     *    `roles`/`bagts` нь ХУУЧИН клиент build уншиж чадах нөөц (нэгдэл).
     *    Ингэсэн тул шинэ клиент бичсэн мөрийг хуучин клиент нээхэд эрх
     *    ЧИМЭЭГҮЙ алга болохгүй. Хуучин нь үржвэр болж УЯН болох тул
     *    (жишээ нь Багц 1-д батлагч ч болох) — энэ нь fail-closed биш ч
     *    зөвхөн ШИЛЖИЛТИЙН хугацаанд, зөвхөн хуучин build дээр үйлчилнэ.
     */
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/**
 * Чанарын баримтын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `huvaariUpsert`-тэй ижил: `grants` нь үнэн эх, `roles`/`bagts` нь нөөц.
 */
export function chanarUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = CHANAR_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/** Чанарын баримтын хуваарилалтыг арилгах */
export function chanarRemove(user: string): Promise<boolean> {
  return removeByKey(CHANAR_PREFIX + user.toLowerCase());
}

/**
 * Нэмэлт ажлын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `obyemUpsert`-тэй ижил: `grants` нь үнэн эх, `roles`/`bagts` нь нөөц.
 */
export function ajilUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = AJIL_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/** Нэмэлт ажлын хуваарилалтыг арилгах */
export function ajilRemove(user: string): Promise<boolean> {
  return removeByKey(AJIL_PREFIX + user.toLowerCase());
}

/**
 * Дэд бүтцийн засварын хуваарилалтыг бичих — нэг хэрэглэгч нэг мөр.
 * ⚠️ `obyemUpsert`-тэй ижил: `grants` нь үнэн эх, `roles`/`bagts` нь нөөц.
 */
export function butetsUpsert(
  user: string, roles: string[], bagts: string[], grants?: Grant[],
): Promise<boolean> {
  const key = BUTETS_PREFIX + user.toLowerCase();
  return upsertByKey(key, {
    username: key,
    role: null,
    views: JSON.stringify(grants ? { roles, bagts, grants } : { roles, bagts }),
    docs: 0,
  });
}

/** Дэд бүтцийн засварын хуваарилалтыг арилгах */
export function butetsRemove(user: string): Promise<boolean> {
  return removeByKey(BUTETS_PREFIX + user.toLowerCase());
}

/** Инженерийн төлөвлөсөн обьёмын хуваарилалтыг арилгах */
export function obyemRemove(user: string): Promise<boolean> {
  return removeByKey(OBYEM_PREFIX + user.toLowerCase());
}

/** Хуваарийн хуваарилалтыг арилгах */
export function huvaariRemove(user: string): Promise<boolean> {
  return removeByKey(HUVAARI_PREFIX + user.toLowerCase());
}
