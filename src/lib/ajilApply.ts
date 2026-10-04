'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАТЛАГДСАН МӨРИЙГ ҮНДСЭН ХҮСНЭГТЭД БУУЛГАХ (2026-09-24).
 *
 * ⚠️ ЯАГААД ЭНЭ ХЭРЭГТЭЙ БОЛОВ (хэрэглэгчийн шийдвэр): урьд нь батлагдсан мөр
 *    зохиогчийн «Гүйцэтгэл бөглөх» хуудасны НООРОГТ орж, гүйцэтгэлийн 6 шат
 *    батлагдтал хүлээдэг байв — «шинэ ажил гэрээнд орох уу» гэсэн шийдвэр
 *    гүйцэтгэлийн тоонд уягдаж, батлагдсан мөр хэдэн долоо хоног үндсэн
 *    хүснэгтэд гарч ирдэггүй байлаа. Одоо батлангуут ШУУД бичигдэнэ.
 *
 * ⚠️ БҮТЭН ЖААЗ, ГАНЦ МӨР БИШ. Архивын загвар нь «нэг жааз = нэг
 *    `buglusun_ognoo` өдөр»; `loadRows` нь ХАМГИЙН СҮҮЛИЙН өдрийн сүүлийн
 *    жаазыг уншдаг (`latestWhere` · `lastFrame`). Ганц мөр нэмвэл тэр мөр
 *    ямар ч жаазанд харьяалагдахгүй алга болно. Тиймээс `hyanaltStore.
 *    archiveSubmission`-ийн ЯГ ИЖИЛ зам: сүүлийн жааз татах → мөр оруулах →
 *    `buildFrame` → `applyAdds`. Гүйцэтгэлийн тоо ОРОХГҮЙ — `buildFrame`-д
 *    хоосон `pending`/`pendDate` өгнө, `act` нь ачаалснаараа үлдэнэ.
 *
 * ⚠️ `hyanaltStore.ts`-ийн 2026-09-04-ний толгойн дүрэм («`applyAdds`-ыг өөр
 *    газраас БҮҮ дууд») ЭНД НЭГ л удаа сунгагдав — гуравдахь дуудагч байхгүй.
 *    Тэндхийн хамгаалалтууд бүгд давтагдана:
 *      A.6  өдрийн залруулга — сүүлийн жаазны өдрөөс ХУУЧИН өдрөөр бичвэл
 *           `latestWhere` шинэ жаазыг харахгүй (булагдана);
 *      A.7  жааз угсрах (`buildFrame`; уртын assert нь тавтологи тул үгүй);
 *      A.8  бичихийн өмнө уралдааны шалгалт — үйлчилгээний MAX OID ачаалснаас
 *           хойш ӨССӨН бол (өөр батлалт, гүйцэтгэлийн батлалт) ЮУ Ч бичихгүй;
 *      A.9  унасан бол хагас жаазыг `applyDeletes`-ээр буцаана;
 *      A.10 бичсэний дараа мөр бүрийг дахин уншиж батална, мөн бидний дараа
 *           өөр жааз орсон бол `applied` тэмдэглэхгүй.
 *
 * ⚠️ ИДЕМПОТЕНТ: (1) `applied` бол дахин бичихгүй; (2) ижил (эцэг + № + нэр)
 *    мөр эцгийн доор аль хэдийн БАЙВАЛ хаяна (`dedupeAdds`) — хоёр таб зэрэг
 *    батлах, эсвэл бичигдсэн ч `markApplied` унасан үеийн дахин оролдлого
 *    давхар мөр үүсгэхгүй; (3) `markApplied` ЗӨВХӨН бичсэний ДАРАА, бичсэн
 *    мөр серверээс буцаж уншигдсаны дараа.
 *
 * ⚠️ Гүйцэтгэлийн бүртгэл (`registerApproved` · IPC · нэгтгэл) ДУУДАГДАХГҮЙ —
 *    гүйцэтгэл батлагдаагүй, зөвхөн гэрээний хамрах хүрээ өргөжсөн.
 *    `BAGTS_SHEET` кэшийг `applyAdds` өөрөө хүчингүй болгоно.
 *
 * ⚠️ Модулиудыг ДИНАМИКААР импортолно (`hyanaltStore`-ийн ижил шалтгаан):
 *    `AjilBatlah` хуудас `bagtsSheet` · `sheetFrame` · `bagts.pkg`-ийг
 *    статикаар чирвэл батлах дараалал бөглөх хуудсыг бүхэлд нь ачаална.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас) — «БАТЛАГДСАН · БУУЛГААГҮЙ» ГАЦААГҮЙ БАЙХ:
 *    (1) ИЛРҮҮЛЭЛТ (`classifyStuck`, цэвэр): «буулгасан» тэмдэг = төлөв `applied`
 *        (`markApplied`); `approved` хэвээр = буулгаагүй. Саяхан батлагдсаныг
 *        (`APPLY_GRACE_MS`) «буулгаж байж магадгүй» гэж ялгана, бүртгэлгүй багцыг
 *        нуухгүй — тайлбартай харуулна.
 *    (2) ДАВХАР ДАРАЛТ / ЗЭРЭГЦЭЭ ОРОЛДЛОГО: нэг илгээлтийн хоёр дахь дуудлага
 *        эхнийхээ амлалтыг хүлээнэ (`inflight`); бүх буулгалт нэг түгжээгээр
 *        ДАРААЛНА (`withApplyLock` — Web Locks бол хөтчийн бүх таб, эс бөгөөс
 *        энэ таб). Түгжээ суллагдахад дараагийнх нь серверээс `applied`-ийг уншаад
 *        ЮУ Ч БИЧИХГҮЙ (`already`).
 *    (3) ЭРХ: `ajilApprove` ЭСВЭЛ хатуу super (`mayReapply`). Шийдвэр (`decideAjil`)
 *        `ajilApprove`-ийг ШААРДСАН хэвээр — админ зөвхөн аль хэдийн БАТЛАГДСАН
 *        илгээлтийн бичилтийг гүйцээнэ, шинээр батлахгүй.
 *    (4) Сүлжээний хамаарал `_io`-д — тест (`ajilReapply.check.mjs`) сүлжээгүй
 *        идемпотент байдлыг шалгана.
 */

import { AUTH, roleForUser } from './services';
import { ajilScope } from './ajilAcl';
import { hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
import { currentUser, requireCap } from './who';
import { AJIL_STATUS, loadHead, loadPayloadStamped, markApplied } from './ajilBatlah';
import type { NewRow } from './submission';

/* ══════════════════ ЦЭВЭР ХЭСЭГ (тест: ajilApply.check.mjs) ══════════════════ */

/** Давхардал шалгахад хэрэгтэй ХАМГИЙН БАГА мөрийн хэлбэр (`SheetRow`-ийн дэд олонлог) */
export type RowLike = { no: string; work: string; group: boolean; depth: number };

const eq = (a: string, b: string) => a.trim() === b.trim();

/**
 * Нэмэх мөрийн ЭЦЭГ БҮЛГИЙН индекс — `sheetFrame.parentOf`-ийн ЯГ ИЖИЛ дүрэм:
 * нэрээр таарах бүх бүлгээс `parentIdx`-д ХАМГИЙН ОЙРХОНЫГ. `-1` = алга.
 * ⚠️ (№ + нэр) хос ДАВХАРДДАГ (Багц 1-д «10 · БУСАД АЖИЛ» блок бүрт нэг) —
 *    зөвхөн нэрээр хайвал ӨӨР БЛОКИЙН ижил нэртэй мөр «давхардал» болж, жинхэнэ
 *    шинэ мөр чимээгүй хаягдана (2026-09-24 аудит #3). `insertAdds` энэ л
 *    эцэгт оруулдаг тул давхардлыг ч ЭНЭ эцгийн дэд модонд л хайна.
 */
export function parentIdxOf(rows: readonly RowLike[], a: NewRow): number {
  let p = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const g = rows[i];
    if (!g.group || !eq(g.no, a.parentNo) || !eq(g.work, a.parentWork)) continue;
    if (p < 0 || Math.abs(i - a.parentIdx) < Math.abs(p - a.parentIdx)) p = i;
  }
  return p;
}

/**
 * Нэмэх мөр эцгийнхээ ДОР аль хэдийн БАЙНА уу — зөвхөн `parentIdxOf` эцгийн
 * дэд модны АЖЛЫН (бүлэг биш) мөрүүдээс. Дэд мод = эцгийн араас гүн нь
 * эцгийнхээс их байх хүртэл.
 */
export function addPresent(rows: readonly RowLike[], a: NewRow): boolean {
  const p = parentIdxOf(rows, a);
  if (p < 0) return false;
  const g = rows[p];
  for (let k = p + 1; k < rows.length && rows[k].depth > g.depth; k += 1) {
    const r = rows[k];
    if (!r.group && eq(r.no, a.no) && eq(r.work, a.work)) return true;
  }
  return false;
}

/**
 * Давхардлыг хасна: аль хэдийн байгаа мөрийг `dropped`, үлдсэнийг `fresh`.
 * ⚠️ Нэг илгээлт ДОТОР ижил мөр хоёр удаа байвал хоёр дахийг нь ч хаяна.
 * ⚠️ «Ижил» = ИЖИЛ ЭЦЭГ (`parentIdxOf`-оор шийдсэн БАЙРЛАЛ) + № + нэр
 *    (2026-09-25 аудит). Урьд нь түлхүүр нь эцгийн (№ + нэр) л байсан тул
 *    Багц 1-ийн блок бүрийн «10 · БУСАД АЖИЛ» дор тус тусад нэмсэн «5 · Хашаа»
 *    НЭГ мөр болж нийлж, хоёр дахь блокийнх нь чимээгүй хаягддаг байв —
 *    `addPresent`-ийн (дээрх ⚠️) дүрэмтэй зөрчилтэй. Эцэг олдоогүй (`-1`) мөр
 *    (№ + нэрээр) хэвээр нэгтгэгдэнэ — тэр нь `insertAdds`-д ямар ч байсан унана.
 */
export function dedupeAdds(rows: readonly RowLike[], adds: readonly NewRow[]): { fresh: NewRow[]; dropped: NewRow[] } {
  const fresh: NewRow[] = [];
  const dropped: NewRow[] = [];
  const seen = new Set<string>();
  for (const a of adds) {
    const p = parentIdxOf(rows, a);
    const key = `${p}¦${a.parentNo.trim()}¦${a.parentWork.trim()}¦${a.no.trim()}¦${a.work.trim()}`;
    if (seen.has(key) || addPresent(rows, a)) { dropped.push(a); continue; }
    seen.add(key);
    fresh.push(a);
  }
  return { fresh, dropped };
}

/** UTC өдрийн эхэн (`Date.UTC(y,m,d)`) */
export const dayStartUtc = (ms: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * ӨНӨӨДӨР — ЛОКАЛ хуанлийн өдөр, `Date.UTC(y,m,d)` хэлбэрээр.
 * ⚠️ `hyanaltStore.archiveSubmission` (`Date.UTC(now.getFullYear(), now.getMonth(),
 *    now.getDate())`) ба `FillNew.todayFillMs`-тэй ЯГ ИЖИЛ томъёо (2026-09-24
 *    аудит #6): UTC өдрөөр бодвол УБ-д 00:00–07:59-д батлахад ӨЧИГДРИЙН өдрөөр
 *    жааз бичигдэж, бөглөх хуудасны «өнөөдөр» жаазаас өөр өдөрт унана.
 */
export const todayLocalMs = (nowMs: number): number => {
  const d = new Date(nowMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * БӨГЛӨСӨН ӨДӨР — `max(өнөөдөр (локал), сүүлийн жаазны өдөр)`.
 *
 * ⚠️ `hyanaltStore`-ийн 2026-09-04-ний дүрэм: сүүлийн жаазны өдрөөс ХУУЧИН
 *    өдрөөр бичвэл шинэ жааз `latestWhere`-ийн «хамгийн сүүлийн өдөр»
 *    шүүлтэд ХАРАГДАХГҮЙ — мөр архивт орсон мөртөө хуудсанд хэзээ ч гарч
 *    ирэхгүй. Жаазны өдөр (`buglusun_ognoo`, UTC өдрийн эхэн) өнөөдрөөс
 *    хойш байвал тэр өдрөөр — нэг өдрийн хоёр жааз `lastFrame`-ээр аюулгүй.
 * ⚠️ Хэзээ ч ӨНӨӨДРӨӨС хуучин өдөр буцаахгүй.
 */
export function fillMsFor(nowMs: number, snapshot: number | null | undefined): number {
  const today = todayLocalMs(nowMs);
  if (snapshot == null || !Number.isFinite(snapshot)) return today;
  const last = dayStartUtc(snapshot);
  return last > today ? last : today;
}

/** Жааз тулгахад хэрэгтэй ХАМГИЙН БАГА хэлбэр (`loadRows`-ийн үр дүнгийн дэд олонлог) */
export type FrameLike = {
  rows: readonly { oid: number; raw?: Record<string, unknown> }[];
  asOf: number | null;
  snapshot: number | null;
};

/**
 * Хоёр ачаалалт ЯГ ИЖИЛ жааз уу — мөр бүрийн OID ба ТҮҮХИЙ атрибут (`raw`)-аар.
 *
 * ⚠️ ЯАГААД MAX OID ХАНГАЛТГҮЙ (2026-09-25 аудит): «Хуваарь»-ийн хадгалалт
 *    (огноо · Hamaaral · бодит огноо · хүн хүч/машин) нь БАЙГАА жааз руу
 *    `applyUpdates`-аар бичдэг — шинэ OID үүсгэхгүй. Ачаалсны дараа тийм бичилт
 *    орвол MAX OID өөрчлөгдөхгүй атлаа манай шинэ жааз ХУУЧИН мөрүүдээс
 *    угсрагдаж хамгийн сүүлийн жааз болно — тэр огноонууд чимээгүй алга болно.
 *    Тиймээс бичихийн өмнө ДАХИН ачаалж `raw`-ийг бүтнээр нь тулгана
 *    (`EditDate` байвал түүгээр ч, байхгүй бол талбар бүрээр илэрнэ).
 */
export function sameFrame(a: FrameLike, b: FrameLike): boolean {
  if (a.asOf !== b.asOf || a.snapshot !== b.snapshot || a.rows.length !== b.rows.length) return false;
  for (let i = 0; i < a.rows.length; i += 1) {
    const x = a.rows[i];
    const y = b.rows[i];
    if (x.oid !== y.oid) return false;
    if (JSON.stringify(x.raw ?? null) !== JSON.stringify(y.raw ?? null)) return false;
  }
  return true;
}

/* ══════════ «БАТЛАГДСАН · БУУЛГААГҮЙ» ИЛРҮҮЛЭХ (2026-10-01, тест: ajilReapply.check.mjs) ══════════ */

/**
 * Батлагдсаны дараах ХҮЛЭЭХ ХУГАЦАА — энэ хугацаанд батлагчийн цонх
 * `materializeAdds`-ыг ӨӨРӨӨ гүйцээж байж магадгүй.
 *
 * ⚠️ 2026-10-01: `approved` нь хэвийн урсгалд ч хэдэн секунд–минут (жааз ачаалах,
 *    500-аар багцалж бичих, дахин уншиж батлах) үлддэг. Тэр завсарт ӨӨР батлагч/
 *    админ хуудсаа нээвэл илгээлт «буулгаагүй» болж харагдана; «Дахин буулгах»
 *    дарвал ХОЁР КОМПЬЮТЕР нэг багцад зэрэг жааз бичиж, 500-ийн багцууд холилдох
 *    эрсдэлтэй (`bagtsSheet.lastFrame`; Web Locks зөвхөн НЭГ хөтчийг хамгаална).
 *    Тиймээс саяхан батлагдсаныг ЗӨВХӨН харуулна, товч энэ хугацааны дараа нээгдэнэ.
 * ⚠️ Энэ цонхонд өөрөө оролдоод дууссан бол (`settled`) хүлээхгүй — батлагч алдааг
 *    хармагц шууд дахин буулгана.
 */
export const APPLY_GRACE_MS = 3 * 60_000;

/**
 * `retry`  — буулгалт унасан/тасарсан: «Дахин буулгах» нээлттэй
 * `fresh`  — саяхан батлагдсан: батлагчийн цонх одоо бичиж байж магадгүй
 * `orphan` — багцын түлхүүр бүртгэлд (`PKGS`) алга: буулгах боломжгүй, админд
 */
export type StuckKind = 'retry' | 'fresh' | 'orphan';

/** Ангилахад хэрэгтэй ХАМГИЙН БАГА хэлбэр (`AjilSubmission`-ийн дэд олонлог) */
export type StuckLike = { oid: number; status: string; pkgKey: string; pkgGroup: string; approverAt: number | null };

export type StuckItem<T extends StuckLike> = {
  sub: T;
  kind: StuckKind;
  /** `fresh` бол «Дахин буулгах» нээгдэх агшин, бусад нь `null` */
  readyAt: number | null;
};

/**
 * БАТЛАГДСАН ч БУУГААГҮЙ илгээлтүүдийг ангилна — хэнд юу харуулахыг.
 *
 * ⚠️ Зөвхөн `approved`. `applied` («Буулгасан») нь буулгалт амжилттай дууссаны
 *    СЕРВЕРИЙН тэмдэг (`markApplied`) — түүнийг энд хэзээ ч оруулахгүй.
 * ⚠️ Хүрээ: `scope` `null` = хязгааргүй (super / нэвтрэлтгүй), `[...]` = зөвхөн тэр
 *    бүлгүүд — `AjilBatlah`-ийн «Шийдвэрлэх»-тэй ижил fail-closed дүрэм.
 * ⚠️ Бүртгэлгүй багцыг ХАЯХГҮЙ (2026-10-01): урьд нь шүүгдэж ЧИМЭЭГҮЙ алга болдог
 *    байв — батлагдсан ажил хэзээ ч хуудсанд орохгүй атлаа хэн ч мэдэхгүй.
 * ⚠️ `approverAt` алга (`null`) эсвэл цаг нь хэт ирээдүйд (компьютерийн цаг
 *    `grace`-ээс илүү зөрсөн) бол `retry` — хүлээлгийг мөнхөд сунгахгүй.
 */
export function classifyStuck<T extends StuckLike>(
  subs: readonly T[],
  o: {
    now: number;
    scope: readonly string[] | null;
    knownPkg: (pkgKey: string) => boolean;
    /** Энэ цонхонд буулгах оролдлого ДУУССАН илгээлтүүд — хүлээлгүй */
    settled?: ReadonlySet<number>;
    /**
     * ⚠️ 2026-10-04: буулгалт «эцэг бүлэг олдсонгүй» (`ApplyResult.code: 'no-parent'`)-ээр
     *    унасан илгээлтүүд → `orphan`. Дахин буулгах нь ХЭЗЭЭ Ч бүтэхгүй (эцэг мөр хуудсанд
     *    алга) тул `retry` гэж харуулбал товч дарсаар мөнхөд гацдаг байв.
     */
    noParent?: ReadonlySet<number>;
    grace?: number;
  },
): StuckItem<T>[] {
  const grace = o.grace ?? APPLY_GRACE_MS;
  const out: StuckItem<T>[] = [];
  for (const x of subs) {
    if (x.status !== AJIL_STATUS.approved) continue;
    if (o.scope != null && !o.scope.includes(x.pkgGroup)) continue;
    if (!o.knownPkg(x.pkgKey) || o.noParent?.has(x.oid)) {
      out.push({ sub: x, kind: 'orphan', readyAt: null });
      continue;
    }
    const at = x.approverAt;
    if (at != null && Number.isFinite(at) && !o.settled?.has(x.oid) && o.now - at > -grace && o.now - at < grace) {
      out.push({ sub: x, kind: 'fresh', readyAt: at + grace });
    } else {
      out.push({ sub: x, kind: 'retry', readyAt: null });
    }
  }
  return out;
}

/**
 * «ДАХИН БУУЛГАХ» ЭРХ — батлагч (`ajilApprove`) ЭСВЭЛ хатуу super.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь `ajilApprove` л байсан тул
 *    тэр эрхгүй админ «Батлагдсан · буулгаагүй»-г харж байгаад дарахад «эрхгүй»
 *    гэж унадаг байв. Буулгалт нь ШИЙДВЭР БИШ — батлагч аль хэдийн шийдсэн
 *    (`decideAjil` `ajilApprove`-ийг шаардсан хэвээр), энэ нь зөвхөн бичилтийг
 *    гүйцээнэ. Багцын хүрээг (`ajilScope`) `materializeInner` тусад нь шалгана.
 */
export function mayReapply(o: { authOff: boolean; isSuper: boolean; hasApprove: boolean }): boolean {
  return o.authOff || o.isSuper || o.hasApprove;
}

/* ══════════════════ СҮЛЖЭЭТЭЙ ХЭСЭГ ══════════════════ */

export type ApplyResult =
  | { ok: true; /** Аль хэдийн `applied` байсан — юу ч бичээгүй */ already?: boolean; /** Энэ удаа бичигдсэн мөр */ added: number }
  /** ⚠️ 2026-10-04: `code: 'no-parent'` — эцэг бүлэг хуудсанд алга (`classifyStuck.noParent`) */
  | { ok: false; error: string; code?: 'no-parent' };

/**
 * БАТЛАГДСАН ИЛГЭЭЛТИЙН МӨРҮҮДИЙГ ҮНДСЭН ХҮСНЭГТЭД БИЧНЭ.
 *
 * Дараалал (файлын толгой): эрх → толгой/төлөв → агуулга → сүүлийн жааз →
 * давхардал хасах → оруулах → жааз угсрах → урт тулгах → уралдаа шалгах →
 * бичих (унавал буцаах) → дахин уншиж батлах → `markApplied`.
 *
 * @param pkgKey дуудагчийн мэдэж буй багц — СЕРВЕРИЙН `pkgKey`-тэй тулгана
 *               (зөрвөл татгалзана); жинхэнэ эх нь сервер.
 * @param stamp  батлагчийн ХАРСАН агуулгын тэмдэг (`ajilBatlah.payloadStamp`) — өгсөн
 *               бол серверийн одоогийн агуулгатай тулгана (2026-09-30).
 */
export async function materializeAdds(args: { pkgKey?: string; ajilOid: number; stamp?: string }): Promise<ApplyResult> {
  /* ⚠️ Дүрэм СҮЛЖЭЭНЭЭС ӨМНӨ — `decideAjil`-ийн ижил шалтгаан. Эрхгүй бол
     ШИДНЭ (доорх `try`-ийн гадна) — энэ нь сүлжээний алдаа биш.
     ⚠️ 2026-10-01: `ajilApprove` ЭСВЭЛ хатуу super (`mayReapply`-ийн ⚠️). */
  requireApplyCap();
  /* ⚠️ 2026-10-01: ДАВХАР ДАРАЛТ — ижил илгээлт энэ табд аль хэдийн буулгагдаж
     байвал ШИНЭ оролдлого эхлүүлэхгүй, тэр амлалтын үр дүнг буцаана. */
  const cur = inflight.get(args.ajilOid);
  if (cur) return cur;
  /* ⚠️ ШИДЭХГҮЙ, `{ok:false}` БУЦААНА (2026-09-25 аудит): `loadHead` ·
     `loadPayload` · `loadSchema` · `loadRows` · динамик импорт нь сүлжээний
     алдаанд ШИДДЭГ байв — `decideAjil` амжилттай (төлөв `approved`) болсны
     дараа шидэхэд `AjilBatlah` дараалал дахин уншаагүй, «Батлагдсан ·
     буулгаагүй» хэсэг гарахгүй, «Батлах» дахин дарахад «аль хэдийн
     шийдвэрлэсэн» гэж гацдаг байлаа. Дуудагч бүр `ok`-оор салбарлана. */
  const p = withApplyLock(async () => {
    try {
      return await materializeInner(args);
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  });
  inflight.set(args.ajilOid, p);
  try {
    return await p;
  } finally {
    if (inflight.get(args.ajilOid) === p) inflight.delete(args.ajilOid);
  }
}

/**
 * Эрхийн шалгуур — `ajilApprove` ЭСВЭЛ хатуу super (2026-10-01, `mayReapply`).
 * ⚠️ `requireCap`-ийн ижил дүрэм: ЗӨВХӨН хөтөчид (Node тест/скрипт хаагдахгүй);
 *    эрхгүй бол `requireCap` өөрөө ИЖИЛ мессежээр шиднэ.
 */
function requireApplyCap(): void {
  if (typeof window === 'undefined') return;
  const me = currentUser();
  if (mayReapply({ authOff: !AUTH.appId, isSuper: roleForUser(me) === 'super', hasApprove: hasCap(me, 'ajilApprove') })) return;
  requireCap('ajilApprove');
}

/** Энэ табд одоо явж буй буулгалт — илгээлтийн OID → амлалт (2026-10-01) */
const inflight = new Map<number, Promise<ApplyResult>>();

/** Хөтчийн бүх табд нэг — Web Locks-ийн нэр */
const APPLY_LOCK = 'selbe-ajil-apply';
/** Web Locks байхгүй орчны (хуучин хөтөч, Node) таб доторх дараалал */
let applyTail: Promise<unknown> = Promise.resolve();

/**
 * БҮХ БУУЛГАЛТЫГ НЭГ НЭГЭЭР НЬ — нэг багцад хоёр жааз зэрэг бичигдэхгүй (2026-10-01).
 *
 * ⚠️ ЯАГААД ТҮГЖЭЭ: `applyAdds` 500-аар багцалж бичдэг; хоёр таб зэрэг бичвэл
 *    багцууд холилдож `lastFrame` эвдэрсэн жааз уншина. A.8/A.10б уралдааг
 *    бичилтийн ӨМНӨ/ДАРАА л барина — бичилт ДУНДАХ холилдлыг биш.
 * ⚠️ Web Locks (`navigator.locks`) нь ИЖИЛ хөтчийн бүх табыг хамгаална; өөр
 *    компьютерийг `APPLY_GRACE_MS` + A.8/A.10б хамгаална. Түгжээг БАГЦААР биш
 *    НИЙТЭЭР нь — буулгалт ховор, энгийн нь найдвартай.
 * ⚠️ Түгжээ `_io.lockWaitMs`-ээс удаан суллагдахгүй бол ХҮЛЭЭЛГҮЙ алдаа буцаана —
 *    өөр табын гацсан сүлжээ энэ табыг мөнхөд «ажиллаж байна» болгохгүй. Түгжээ
 *    олгогдсоны дараа таслахгүй (бичилтийг дундуур нь зогсоохгүй).
 */
async function withApplyLock(fn: () => Promise<ApplyResult>): Promise<ApplyResult> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    try {
      return await locks.request(APPLY_LOCK, { signal: AbortSignal.timeout(_io.lockWaitMs) }, () => fn());
    } catch (e) {
      const n = (e as Error)?.name;
      if (n === 'TimeoutError' || n === 'AbortError')
        return { ok: false, error: tr('Өөр цонхонд нэмэлт ажил буулгаж байна — дуусахыг хүлээгээд дахин оролдоно уу.') };
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }
  const run = applyTail.then(fn, fn);
  applyTail = run.catch(() => undefined);
  return run;
}

/** Жааз бичилтийн үр дүн — `added: 0` = бүх мөр аль хэдийн хуудсанд байна (юу ч бичээгүй) */
/* ⚠️ 2026-10-04: `code: 'no-parent'` — `ApplyResult`-ийн адил (эцэг бүлэг хуудсанд алга) */
export type FrameWrite = { ok: true; added: number } | { ok: false; error: string; code?: 'no-parent' };

/**
 * СҮЛЖЭЭНИЙ ХАМААРАЛ — ⚠️ ЗӨВХӨН тест (`ajilReapply.check.mjs`) солино (2026-10-01).
 * Ажиллах үед үргэлж жинхэнэ функцууд.
 */
export const _io: {
  loadHead: typeof loadHead;
  loadPayloadStamped: typeof loadPayloadStamped;
  markApplied: typeof markApplied;
  writeFrame: (pkgKey: string, adds: readonly NewRow[]) => Promise<FrameWrite>;
  /** Өөр табын түгжээг хүлээх дээд хугацаа */
  lockWaitMs: number;
} = { loadHead, loadPayloadStamped, markApplied, writeFrame: writeFrameLive, lockWaitMs: 120_000 };

/** `materializeAdds`-ийн бие — эрхийн шалгалтын ДАРАА л дуудагдана. */
async function materializeInner(args: { pkgKey?: string; ajilOid: number; stamp?: string }): Promise<ApplyResult> {
  const head = await _io.loadHead(args.ajilOid);
  if (!head) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (args.pkgKey && args.pkgKey !== head.pkgKey)
    return { ok: false, error: tr('Илгээлт «{0}» багцынх — хуудас «{1}». Юу ч бичсэнгүй.', head.pkgKey, args.pkgKey) };
  /* ⚠️ БАТЛАГЧИЙН ХҮРЭЭГ СЕРВЕРИЙН БАГЦААР (`decideAjil`-ийн загвар). */
  if (AUTH.appId) {
    const me = currentUser();
    if (typeof window !== 'undefined' && !me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc0 = ajilScope(me, 'approver');
    if (sc0 !== null && !sc0.includes(head.pkgGroup))
      return { ok: false, error: tr('Энэ багцын нэмэлт ажлыг батлах эрхгүй.') };
  }
  if (head.status === AJIL_STATUS.applied) return { ok: true, already: true, added: 0 };
  if (head.status !== AJIL_STATUS.approved)
    return { ok: false, error: tr('Илгээлт батлагдаагүй ({0}) — хуудсанд буулгах боломжгүй.', head.status) };

  const st = await _io.loadPayloadStamped(args.ajilOid);
  const pl = st?.p ?? null;
  if (!pl) return { ok: false, error: tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй. Буцаавал нэмэгч дахин илгээнэ.') };
  /* ⚠️ 2026-09-30: `decideAjil`-ийн тулгалт ба `approved` бичилтийн ЗАВСАРТ
     зохиогч агуулгыг сольсон бол батлагчийн ХАРААГҮЙ мөрийг бичихгүй — төлөв
     `approved` хэвээр, «Батлагдсан · буулгаагүй»-д шинэ агуулгыг харж «Дахин
     буулгах» (тэмдэггүй) дарна. */
  if (args.stamp && st && st.stamp !== args.stamp)
    return { ok: false, error: tr('Батлах зуур зохиогч агуулгыг өөрчилсөн — юу ч бичсэнгүй. Шинэ агуулгыг харж «Дахин буулгах» дарна уу.') };

  /* A.4–A.10б — жааз (2026-10-01: `writeFrameLive`-д тусгаарлав, дараалал ижил) */
  const w = await _io.writeFrame(head.pkgKey, pl.adds);
  if (!w.ok) return w;

  /* A.11 — зөвхөн амжилтын дараа.
     ⚠️ `added: 0` = бүх мөр аль хэдийн байна (давхар таб / өмнөх оролдлого бичсэн ч
     тэмдэглэж амжаагүй) — юу ч бичээгүй, зөвхөн тэмдэглэнэ. */
  const m = await _io.markApplied(args.ajilOid);
  if (w.added === 0)
    return m.ok ? { ok: true, already: true, added: 0 } : { ok: false, error: m.error ?? tr('ArcGIS-т хадгалагдсангүй.') };
  if (!m.ok) return { ok: false, error: tr('Мөрүүд бичигдсэн, гэвч «буулгасан» тэмдэглэгээ хадгалагдсангүй: {0} — «Дахин буулгах» дарвал давхар бичихгүй, зөвхөн тэмдэглэнэ.', m.error ?? '') };
  return { ok: true, added: w.added };
}

/**
 * A.4–A.10б — СҮҮЛИЙН ЖААЗ + ШИНЭ МӨР → БҮТЭН ЖААЗ БИЧИХ (2026-10-01: `materializeInner`-
 * ээс тусгаарлав; алхам, шалгалт, мессеж ӨӨРЧЛӨГДӨӨГҮЙ).
 * ⚠️ `markApplied`-ыг ЭНД дуудахгүй — дуудагч (A.11) бичилт амжилттай болсны ДАРАА.
 */
async function writeFrameLive(pkgKey: string, adds: readonly NewRow[]): Promise<FrameWrite> {
  const { PKGS, loadSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
  const [{ loadRows, applyAdds, applyDeletes }, { insertAdds, buildFrame }, { agsFetch }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('@/modules/sheet/ags'),
  ]);
  /* ⚠️ `synthetic` БИШ — синтетик блок нь «Хуваарь»-ийн дэлгэцийн л хэлбэр;
     архивт бичих схем нь `FillNew`/`hyanaltStore`-той ИЖИЛ байх ёстой. */
  const sc = await loadSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  /**
   * ҮЙЛЧИЛГЭЭНИЙ ХАМГИЙН ИХ OBJECTID — уралдааны шалгалтын хэмжүүр.
   * ⚠️ `max(loaded.rows.oid)`-той ХАРЬЦУУЛЖ БОЛОХГҮЙ (2026-09-24 аудит #2):
   *    `loadRows` нь хоосон мөр · хагас жааз · огноогүй мөрийг алгасдаг тул
   *    үйлчилгээнд түүнээс ИХ OID үргэлж байж болно — тэгвэл «шинэ мөр орсон»
   *    гэж мөнхөд няцааж, батлалт бүр гацна. Тиймээс НЭГ Л хэмжүүрийг
   *    (үйлчилгээний MAX) ачаалахаас ӨМНӨ ба бичихийн ӨМНӨ авч, ӨССӨН эсэхийг
   *    л шалгана.
   */
  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('OBJECTID-ийн дээд утга уншигдсангүй'));
    return mx;
  };
  let maxOid0: number;
  try { maxOid0 = await maxOidOf(); } catch (e) {
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }
  const loaded = await loadRows(pkg, sc);

  /* A.4 — давхардал хасах */
  const { fresh } = dedupeAdds(loaded.rows, adds);
  /* Бүгд аль хэдийн байна (давхар таб / өмнөх оролдлого бичсэн ч тэмдэглэж
     амжаагүй) — юу ч бичихгүй; дуудагч (A.11) зөвхөн тэмдэглэнэ. */
  if (!fresh.length) return { ok: true, added: 0 };

  /* A.5 — оруулах; эцэг олдоогүй мөр байвал ЗОГСОНО (хагас батлахгүй) */
  const rows = insertAdds(loaded.rows, fresh, sc, nBld);
  const added = rows.length - loaded.rows.length;
  if (added !== fresh.length) {
    const present = new Set(rows.map((r) => r.oid));
    const missing = fresh.filter((a) => !present.has(a.oid)).map((a) => `${a.no} · ${a.work} (${tr('эцэг: {0}', a.parentWork || '—')})`);
    return {
      ok: false,
      code: 'no-parent',
      error: tr('{0} мөрийн эцэг бүлэг хуудсанд олдсонгүй — юу ч бичсэнгүй: {1}', String(missing.length), missing.slice(0, 5).join('; ')),
    };
  }

  /* A.6 — өдөр */
  const fillMs = fillMsFor(Date.now(), loaded.snapshot);

  /* A.7 — жааз; сарын задаргаанаас төлөвлөгөөт хувь (`hyanaltStore`-той ижил closure) */
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try { obPlan = (await loadPkgPlan(pkg.key)).plan; } catch { obPlan = null; }
  const asOf = loaded.asOf;
  let frame: Record<string, unknown>[];
  try {
    frame = buildFrame(rows, sc, nBld, asOf, hasObyem, fillMs, {}, {}, (row, b) => {
      if (!obPlan || row.des == null || asOf == null) return null;
      const blok = sc.bld[b];
      const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
      /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр, «бүгдийг зас»): сар доторх төлөвлөгөөт хувь
         АЖЛЫН жинхэнэ эхлэх–дуусах өдрөөр (`planPctFromMonths`-ийн 3 дахь аргумент) —
         `bagtsSheet.planAt`-тай нэг томъёо; сарын эхэнд ХУДАЛ «хоцорсон» арилна. Огноо
         хоосон/эвдэрсэн бол функц өөрөө бүтэн сараар (хуучин зам). */
      return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
    });
    /* ⚠️ `assertFrameLength` ЭНД ХЭРЭГГҮЙ (2026-09-24 аудит #8): `frame` нь
       `rows.map` тул урт нь `loaded.rows.length + added`-тай ҮРГЭЛЖ тэнцэнэ —
       шалгуур тавтологи. Жинхэнэ хамгаалалт нь A.8 (бичихийн өмнөх уралдаа) ба
       A.10 (бичсэний дараа мөр бүрийг дахин уншиж батлах). Богино жааз бичих
       зам энд байхгүй: мөр устгал үгүй, `loaded.rows` бүтнээрээ `rows`-д. */
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }

  /* A.8 — уралдаа: ачаалснаас хойш үйлчилгээний MAX OID өссөн бол (шинэ жааз
     орсон — өөр батлалт, гүйцэтгэлийн батлалт) бичихгүй.
     ⚠️ A.8а (2026-09-25 аудит): MAX OID нь БАЙГАА жааз руу `applyUpdates`-аар
     орсон бичилтийг («Хуваарь»-ийн хадгалалт/батлалт) ХАРДАГГҮЙ — сүүлийн
     жаазыг ДАХИН ачаалж `sameFrame`-ээр тулгана; зөрвөл юу ч бичихгүй (дахин
     оролдоход шинэ утгуудаар угсарна). Дахин ачаалалтыг MAX OID-оос ӨМНӨ —
     хямд шалгалт бичилтэд хамгийн ойр. Цонх үлдэнэ (серверт транзакц
     байхгүй): дахин ачаалалтын ЭХНИЙ хуудас татагдсанаас `applyAdds` бичих
     хүртэл — үлдсэн хуудсууд + MAX OID хүсэлтийн хугацаа (хэдэн зуун мс-ээс
     хэдэн секунд). Энэ хугацаанд аль хэдийн татагдсан мөрийг засвал барихгүй. */
  try {
    const now = await loadRows(pkg, sc);
    if (!sameFrame(loaded, now))
      return { ok: false, error: tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
    const mx = await maxOidOf();
    if (mx > maxOid0)
      return { ok: false, error: tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
  } catch (e) {
    /* ⚠️ Шалгаж ЧАДААГҮЙ нь «уралдаагүй» гэсэн үг БИШ — бичихгүй. */
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }

  /* A.9 — бичих; унавал хагас жаазыг буцаах */
  const written: number[] = [];
  try {
    await applyAdds(pkg, frame, written);
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — AGOL дээр гараар цэвэрлэнэ үү', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`,
      };
    }
    return { ok: false, error: why };
  }

  /* A.10 — дахин уншиж мөр бүр байгааг батална; үгүй бол `approved` хэвээр (дахин оролдоно) */
  try {
    const again = await loadRows(pkg, sc);
    const lost = fresh.filter((a) => !addPresent(again.rows, a));
    if (lost.length)
      return { ok: false, error: tr('Бичсэний дараа {0} мөр хуудсанд олдсонгүй — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String(lost.length)) };
  } catch (e) {
    return { ok: false, error: tr('Бичсэний дараах шалгалт унав: {0} — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }

  /* A.10б — ХОЁР БАТЛАГЧ зэрэг бичсэн бол (2026-09-24 аудит #4): бидний
     бичсэнээс хойш үйлчилгээнд ШИНЭ мөр орсон бол манай жааз булагдсан байж
     болно — `applied` гэж тэмдэглэхгүй, `approved` хэвээр (дахин оролдоно;
     `dedupeAdds` давхар бичихээс хамгаална). */
  try {
    const mx = await maxOidOf();
    const mine = written.reduce((a, b) => (b > a ? b : a), 0);
    if (mx > mine)
      return { ok: false, error: tr('Бичсэний дараа хуудсанд өөр жааз орлоо (зэрэгцээ батлалт) — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.') };
  } catch (e) {
    return { ok: false, error: tr('Бичсэний дараах шалгалт унав: {0} — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }

  /* A.11 — `markApplied` нь дуудагчид (`materializeInner`) */
  return { ok: true, added };
}
