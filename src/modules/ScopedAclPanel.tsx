'use client';

/**
 * БАГЦААР ЭРХ ХУВААРИЛАХ ПАНЕЛИЙН ЕРӨНХИЙ БҮРЭЛДЭХҮҮН — Хуваарь ба Обьёмын
 * ГАНЦ эх код.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ БАЙХ ЁСТОЙ ВЭ (2026-09-10). `HuvaariAcl.tsx` (319 мөр)
 * ба `ObyemAcl.tsx` (311 мөр) хоёр нь тэмдэгтийн нэрээр солиод `diff` хийхэд
 * ЛОГИКИЙН ялгаагүй байв — зөвхөн үүргийн нэр (`author`/`editor`) ба зургаан
 * текст өөр. Тэр давхардлын үнэ нь `scopedAcl.ts`-ийн толгойд баримтжуулсан
 * ижил хэв шинж: «засвар нь ижил кодын НЭГД нь л хүрч, бусад руу
 * хуулагдаагүй». 2026-09-08 · 09-нд тэр хэв шинжээс НИЙТ 9 алдаа гарсан.
 *
 * ⚠️ ЛОГИК НЬ ЭНД, ЯЛГАА НЬ ТОХИРГООНД. Дуудагч модуль нь `AclPanelSpec`
 * өгнө: үүрэг хоёрын нэр, шошго, зургаан текст, дөрвөн функц. Шинэ дэд
 * систем нэмэхэд энэ файлыг ХӨНДӨХГҮЙ.
 *
 * ⚠️ `GuitsetgelAcl` нь ЭНД ОРОХГҮЙ — тэр нь ШАТТАЙ (`stage`) бөгөөд «нэг
 * аккаунт нэг шатанд» гэсэн үндсэн өөр дүрэмтэй (`scopedAcl.ts`-ийн ижил
 * шалтгаан).
 *
 * ⚠️ БАГЦ ТУС БҮР ӨӨРИЙН ХӨЗӨРТЭЙ (2026-09-07, хэрэглэгч: «багц багцаар
 * тусдаа хувиарлана, тэр бүрд аккаунт онооно»). Урьд нь эсрэгээр байв —
 * аккаунт нэмээд түүнд багц зүүдэг тул «Багц 3.1-ийг хэн хариуцаж байна»
 * гэдгийг харахын тулд бүх мөрийг гүйлгэж үзэх шаардлагатай байлаа. Ажил нь
 * БАГЦААР хуваарилагддаг тул дэлгэц ч мөн багцаар байх ёстой.
 *
 * ⚠️ ХАДГАЛАЛТ нь ХЭРЭГЛЭГЧЭЭР (нэг аккаунт = нэг мөр), панел нь БАГЦААР
 * эргүүлж харуулна — дэлгэцийн бүтэц ба хадгалалтын бүтэц ӨӨР.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from '@/lib/scopedAcl';
import { ALL_BAGTS } from '@/lib/scopedAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady, toggleCap, type CapKey } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

/**
 * МӨРИЙГ БҮХЭЛД НЬ ХАСААД ЗӨВХӨН ХАСАГДСАН ҮҮРГИЙН ЭРХИЙГ БУЦААНА (2026-09-24).
 *
 * ⚠️ `remove*Assign(user)`-ийн анхдагч `revoke=true` нь `syncCaps(u, [])` →
 *    `none` горимд тэр системийн `roleCaps` БҮХ эрхийг хасдаг байв: нэмэлт
 *    ажлын батлагчийг хасахад админы гараар олгосон «Мөр нэмэх» (`addRow`) ч
 *    чимээгүй алга болно. `UserAdmin.flipScoped`-ийн 2026-09-24 дүрэмтэй
 *    тэгшлэв: мөрийг `revoke=false`-оор хасаад, `sync` дууссаны ДАРАА зөвхөн
 *    хасагдсан үүргүүдийн эрхийг буцаана.
 * ⚠️ ГҮЙЦЭТГЭХ АГШИНД ДАХИН УНШИНА: дараалалд хүлээх хооронд дахин
 *    хуваарилагдсан үүргийн эрхийг буцаахгүй; нэг эрх рүү заадаг ӨӨР үүрэг
 *    үлдсэн бол (Чанарын гурван хянагч → `chanarReview`) мөн буцаахгүй.
 * ⚠️ Таван панел (Хуваарь · Обьём · Нэмэлт ажил · Чанарын баримт · Дэд бүтэц)
 *    бүгд үүгээр явна — QAQC нь `soleCap`, өөрийн замаар хэвээр.
 */
export function removeRevokingRoles<R extends string>(
  user: string,
  list: () => Row<R>[],
  remove: (u: string) => Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  const u = user.trim().toLowerCase();
  const rolesOf = rolesOfUser(list, u);
  const had = rolesOf();
  return revokeGoneRoles(u, had, rolesOf, remove(u), roleCaps);
}

/**
 * ҮҮРГИЙН ЗАРИМЫГ ХАСААД (бусад grant ҮЛДЭНЭ) ХАСАГДСАН ҮҮРГИЙН ЭРХИЙГ БУЦААНА
 * (2026-09-25, аудитын засвар).
 *
 * ⚠️ `removeRevokingRoles`-ийн ХОС. Урьд нь хэсэгчилсэн хасалт `setGrants`
 *    руу шууд явдаг байсан бөгөөд түүний `syncCaps` нь зөвхөн ОЛГОДОГ (lib-ийн
 *    санаатай дүрэм — гараар олгосныг устгахгүй). Тиймээс «Багц 1 · Зохиогч,
 *    Багц 5 · Батлагч» хүний батлагчийг ✕ дарахад `planApprove` ҮЛДЭЖ,
 *    «Хуваарь батлах» асаалттай, `huvaariBatlah` харагдац нээлттэй хэвээр
 *    байв. `UserAdmin.flipScoped`-ийн 2026-09-24 дүрэмтэй тэгшлэв.
 * ⚠️ Үүрэг нь БАГЦ ЦӨӨРӨӨД үлдсэн бол эрх ХЭВЭЭР — зөвхөн үүрэг бүхэлдээ
 *    алга болсон үед л буцаана (`revokeGoneRoles`-ийн дахин уншилт).
 */
export function setGrantsRevokingRoles<R extends string>(
  user: string,
  grants: Grant<R>[],
  list: () => Row<R>[],
  setGrants: (u: string, grants: Grant<R>[]) => Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  const u = user.trim().toLowerCase();
  const rolesOf = rolesOfUser(list, u);
  const had = rolesOf();
  return revokeGoneRoles(u, had, rolesOf, setGrants(u, grants), roleCaps);
}

/** Тухайн хэрэглэгчийн ОДООГИЙН үүргүүд — дуудах агшинд жагсаалтаас уншина */
const rolesOfUser = <R extends string>(list: () => Row<R>[], u: string) =>
  (): Set<string> => new Set((list().find((a) => a.user === u)?.grants ?? []).map((g) => g.role));

/**
 * `sync` дууссаны ДАРАА `had`-д байсан, одоо алга болсон үүргүүдийн эрхийг
 * буцаана — хоёр замын (бүтэн · хэсэгчилсэн хасалт) НИЙТЛЭГ логик.
 * ⚠️ Үлдсэн үүрэг ИЖИЛ эрх рүү заадаг бол (Чанарын гурван хянагч →
 *    `chanarReview`) тэр эрхийг буцаахгүй.
 */
function revokeGoneRoles(
  u: string,
  had: Set<string>,
  rolesOf: () => Set<string>,
  rr: Write,
  roleCaps: Readonly<Partial<Record<string, CapKey>>>,
): Write {
  if (!rr.ok || !rr.sync) return rr;
  const sync = rr.sync.then(async (ok) => {
    const cur = rolesOf();
    const caps = new Set<CapKey>();
    for (const r of had) {
      const c = roleCaps[r];
      if (c && !cur.has(r)) caps.add(c);
    }
    for (const r of cur) {
      const c = roleCaps[r];
      if (c) caps.delete(c);
    }
    let all = ok;
    for (const c of caps) all = (await toggleCap(u, c, false)) && all;
    return all;
  });
  return { ...rr, sync };
}

/** Бичилтийн үр дүн — `scopedAcl.AclWrite`-тай ижил хэлбэр */
type Write = { ok: boolean; error?: string; sync?: Promise<boolean> };

/** Хуваарилалтын мөр — үүрэг бүр өөрийн багцтай */
type Row<R extends string> = { user: string; grants: Grant<R>[] };

/**
 * НЭГ ДЭД СИСТЕМИЙН ТОХИРГОО.
 *
 * ⚠️ Шошго ба зурвасыг ФУНКЦ болгож авна — модулийн түвшинд `tr()` дуудвал
 *    хэл солиход шинэчлэгдэхгүй (зурагдах агшинд дуудагдах ёстой).
 */
export type AclPanelSpec<R extends string> = {
  /** Хоёр үүрэг — ЭХНИЙХ нь зохиогч/засварлагч, ХОЁРДАХЬ нь батлагч */
  roles: readonly [R, R];
  /** Үүргийн шошго */
  roleLabel: (r: R) => string;
  /** «Зохиогч томилоогүй» / «Засварлагч томилоогүй» */
  emptyLabel: (r: R) => string;
  /** Хуваарилалтууд ба тэдгээрийн төлөв */
  list: () => Row<R>[];
  failedUsers: () => string[];
  subscribe: (fn: () => void) => () => void;
  /** Энэ ACL-ийн remote уншигдсан уу — түгжээнд (2026-09-24) */
  ready: () => boolean;
  /** Бичилт */
  setGrants: (user: string, grants: Grant<R>[]) => Write;
  remove: (user: string) => Write;
  /**
   * ҮҮРЭГ → ЭРХ (2026-09-25) — ХЭСЭГЧИЛСЭН хасалтад (бусад grant үлдэх)
   * хасагдсан үүргийн эрхийг буцаахад (`setGrantsRevokingRoles`).
   * ⚠️ СОНГОМОЛ: өгөөгүй панел урьдын адил зөвхөн `setGrants` — эрх ҮЛДЭНЭ.
   *    `remove`-д өгдөг ижил зураглалыг энд өгнө.
   */
  roleCaps?: Readonly<Partial<Record<R, CapKey>>>;
  /** Панелийн тайлбар — 3 догол мөр */
  notes: () => [string, string, string];
  /** Мөрийг БҮХЭЛД нь хасахыг баталгаажуулах асуулт */
  confirmRemoveAll: (user: string) => string;
  /** Зохиогч=батлагч давхцлын анхааруулга */
  stuckMsg: () => string;
  /** Батлагч огт томилоогүйн анхааруулга */
  noApproverMsg: () => string;
};

export function ScopedAclPanel<R extends string>({ spec }: { spec: AclPanelSpec<R> }) {
  const [, tick] = useState(0);
  useEffect(() => spec.subscribe(() => tick((n) => n + 1)), [spec]);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно.
   * ⚠️ Хатуу super-ийг САНАЛ БОЛГОХГҮЙ — түүнд хязгаар үйлчилдэггүй.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = spec.list();
  const failed = new Set(spec.failedUsers());
  /*
   * ⚠️ ХАСАЛТ УНАСНЫГ ПАНЕЛИЙН ТҮВШИНД ХЭЛНЭ (2026-09-08). Мөрийн `failed`
   *    тэмдэг нь ЗӨВХӨН жагсаагдсан аккаунт дээр зурагддаг — хасалт локалаас
   *    мөрийг аль хэдийн арилгасан тул ArcGIS бичилт унахад хаана ч
   *    харагдахгүй байв. Админ «хасагдлаа» гэж итгэсэн ч дараагийн
   *    `initRemote` тэр мөрийг АМИЛУУЛНА.
   *    `GuitsetgelAcl` / `QaqcAcl`-ийн ижил хяналт.
   */
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  const dirtyPerms = new Set(dirtyKeys());
  const [err, setErr] = useState('');
  /*
   * ⚠️ БИЧИЛТ ЯВЖ БАЙХАД дахин дарахаас хамгаална (2026-09-15-ны
   *    хэрэглээний аудит). Урьд нь `void r.sync` гэж хүлээлгүй орхидог тул
   *    сүлжээ удаан үед хоёр удаа дарвал хоёр `setGrants` зэрэгцэн явж,
   *    хоёр дахь нь ХУУЧИН `rows`-оос `grants`-ыг уншина — сүүлийнх нь
   *    ялж, эхний нэмэлт ЧИМЭЭГҮЙ алга болно.
   */
  const [busy, setBusy] = useState(false);
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `UserAdmin.capsLocked`-той
   *    ИЖИЛ. Remote уншигдаагүй үед `spec.list()` нь `[]` тул бүх багц
   *    «томилоогүй» харагдаж, «Нэмэх» дарахад `setGrants` тэр хүний БҮХ
   *    мөрийг зөвхөн энэ нэг багцаар ДАРЖ бичнэ. Уншигдтал нэмэх/хасах хаалттай.
   */
  /* ⚠️ ӨӨРИЙН ACL-ийн тугийг ч шалгана (2026-09-24) — `spec.list()` энэ туг
     хүртэл `[]` тул нөгөө хоёр бэлэн ч энэ нь хоцорвол дарж бичнэ. */
  const locked = !remoteReady() || !capsRemoteReady() || !spec.ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /**
   * Бичилтийг хүлээж, явцад нь товчнуудыг түгжинэ.
   * ⚠️ `sync` нь СОНГОМОЛ (`Write.sync?`) — алсын бичилт огт эхлээгүй
   *    (баталгаажуулалт унасан) үед байхгүй. Тэр үед түгжих зүйлгүй.
   * ⚠️ `false` буцвал ArcGIS бичилт унасан — чимээгүй орхихгүй, зурвас тавина.
   */
  const run = async (sync?: Promise<unknown>) => {
    if (!sync) return;
    setBusy(true);
    try {
      if ((await sync) === false) setErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
    } finally { setBusy(false); }
  };

  /**
   * БАГЦАД ААКАУНТ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
   *
   * ⚠️ ТАВАН ХАМГААЛАЛТ УСТСАН (2026-09-09). Урьд нь хадгалалт нь
   *    `{roles[], bagts[]}` буюу үүрэг × багцын ҮРЖВЭР байсан тул «Багц A ·
   *    Зохиогч»-той хүнийг «Багц B · Батлагч» болгож нэмэхэд тэр нь Багц A-д
   *    ч БАТЛАГЧ болж, багц гацдаг байв. Тиймээс панел ийм үйлдлийг ЗОГСООЖ
   *    «эхлээд хасаад дахин томилно уу» гэж заадаг байсан — админ хүссэн
   *    зүйлээ хийж чаддаггүй байлаа. Одоо grant тус бүр ӨӨРИЙН багцтай тул
   *    тэр хослол ЯГ илэрхийлэгдэнэ: шалгах юу ч үлдсэнгүй.
   *
   * ⚠️ «Бүх багц»-тай grant-д ДАХИН нэмэхгүй: хүрээ нь аль хэдийн бүрэн тул
   *    жагсаалт руу буулгавал ХУМИГДАНА (бүх багц → зөвхөн энэ нэг).
   */
  const addTo = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const u = user.trim().toLowerCase();
    if (!u) return;
    const cur = rows.find((a) => a.user === u);
    const grants = cur ? cur.grants.map((g) => ({ ...g })) : [];
    const mine = grants.find((g) => g.role === role);
    if (!mine) grants.push({ role, bagts: [group] });
    else if (!mine.bagts.includes(ALL_BAGTS) && !mine.bagts.includes(group)) {
      mine.bagts = [...mine.bagts, group];
    }
    const r = spec.setGrants(u, grants);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

  /**
   * БАГЦААС ААКАУНТ ХАСАХ — тэр ҮҮРГИЙН grant-аас энэ багцыг л хасна.
   *
   * ⚠️ НӨГӨӨ ҮҮРЭГТ ХҮРЭХГҮЙ (2026-09-09). Урьд нь энэ багцад нөгөө үүрэг нь
   *    байвал ТАТГАЛЗДАГ байв (хадгалалт үүргийг багцаар салгадаггүй байсан):
   *    админ зөвхөн зохиогчийг хасахыг хүссэн атлаа «мөрийг бүхэлд нь хасаад
   *    дахин томилно уу» гэсэн заавар авдаг байлаа. Одоо grant тус тусдаа тул
   *    зөвхөн заасныг нь хасна.
   *
   * ⚠️ «Бүх багц»-тай grant-ыг нэг багцаас САЛГАЖ хасах боломжгүй — хүрээ нь
   *    тодорхой жагсаалт биш. Тэр үүргийг БҮХЭЛД нь хасахыг баталгаажуулж асууна.
   */
  const removeFrom = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    const cur = rows.find((a) => a.user === user);
    if (!cur) return;
    const mine = cur.grants.find((g) => g.role === role);
    if (!mine) return;

    if (mine.bagts.includes(ALL_BAGTS)) {
      if (!window.confirm(tr('«{0}» нь энэ үүргээр БҮХ багцад хуваарилагдсан тул нэг багцаас нь салгаж хасах боломжгүй. Энэ үүргийг нь БҮХЭЛД НЬ хасах уу?', user))) return;
    }
    setErr('');

    /* Энэ багцыг хасаад — багцгүй үлдсэн grant өөрөө унана */
    const left = mine.bagts.includes(ALL_BAGTS) ? [] : mine.bagts.filter((b) => b !== group);
    const grants = cur.grants
      .map((g) => (g.role === role ? { ...g, bagts: left } : g))
      .filter((g) => g.bagts.length > 0);

    /* Нэг ч grant үлдэхгүй бол мөрийг бүхэлд нь хасна — эрх нь мөн буцна */
    if (!grants.length) {
      if (!window.confirm(spec.confirmRemoveAll(user))) return;
      /* ⚠️ `.ok`-г шалгана (2026-09-23) — урьд нь баталгаажуулалтын алдаа чимээгүй алга болдог байв */
      const rr = spec.remove(user);
      setErr(rr.ok ? '' : (rr.error ?? ''));
      void run(rr.sync);
      return;
    }
    /* ⚠️ Үүрэг бүхэлдээ хасагдсан бол түүний эрхийг ч буцаана (2026-09-25) —
       `setGrants`-ийн `syncCaps` зөвхөн олгодог (`setGrantsRevokingRoles`). */
    const r = spec.roleCaps
      ? setGrantsRevokingRoles(user, grants, spec.list, spec.setGrants,
        spec.roleCaps as Readonly<Partial<Record<string, CapKey>>>)
      : spec.setGrants(user, grants);
    setErr(r.ok ? '' : (r.error ?? ''));
    void run(r.sync);
  };

  const [note1, note2, note3] = spec.notes();

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {note1}
        {' '}
        {note2}
        {' '}
        {note3}
      </p>
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      <div className={s.aclGrid}>
        {PKG_GROUPS.map((g) => (
          <PkgCol
            key={g}
            spec={spec}
            group={g}
            rows={rows}
            accounts={accounts}
            known={known}
            failed={failed}
            dirtyPerms={dirtyPerms}
            onAdd={addTo}
            onRemove={removeFrom}
            busy={busy || locked}
          />
        ))}
      </div>
    </div>
  );
}

/** НЭГ БАГЦЫН хөзөр — хоёр үүргийн жагсаалт */
function PkgCol<R extends string>({
  spec, group, rows, accounts, known, failed, dirtyPerms, onAdd, onRemove, busy,
}: {
  spec: AclPanelSpec<R>;
  group: string;
  rows: Row<R>[];
  accounts: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (group: string, role: R, user: string) => void;
  onRemove: (group: string, role: R, user: string) => void;
  /** Алсын бичилт явж байна — товчнууд түгжигдэнэ (давхар товшилтоос) */
  busy: boolean;
}) {
  /** Тухайн багцад тэр үүргээр хуваарилагдсан аккаунтууд */
  const usersOf = (role: R): string[] =>
    rows
      .filter((a) => a.grants.some((g) => g.role === role
        && (g.bagts.includes(ALL_BAGTS) || g.bagts.includes(group))))
      .map((a) => a.user);

  const [authorRole, approverRole] = spec.roles;
  const authors = usersOf(authorRole);
  const approvers = usersOf(approverRole);

  /**
   * ⚠️ ГАЦААНЫ АНХААРУУЛГА: зохиогч нь бий атлаа батлагч нь ЗӨВХӨН тэр өөрөө
   *    бол илгээсэн зүйлийг нь хэн ч батлах боломжгүй болно (батлах логик
   *    өөрийгөө батлахыг татгалздаг). Багц бүхэлдээ гацна.
   * ⚠️ ЗОХИОГЧ БҮРЭЭР (2026-09-25, аудитын засвар): урьд нь «зохиогч биш
   *    батлагч алга» (`usable.length === 0`) гэж шалгадаг байсан тул A, B
   *    хоёулаа зохиогч БА батлагч үед худал анхааруулга гардаг байв — A-гийнхыг
   *    B, B-гийнхыг A батална. Батлах логик ЗӨВХӨН тухайн илгээлтийн зохиогчийг
   *    татгалздаг тул гацаа = ЯМАР НЭГ зохиогчид өөрөөс нь өөр батлагч алга
   *    (`erhOverview.noOther`-той ижил дүрэм).
   */
  const stuck = approvers.length > 0
    && authors.some((a) => !approvers.some((b) => b !== a));

  return (
    <div className={s.aclCol}>
      <div className={s.aclHead}>
        <span>{group}</span>
        <span className={s.aclCount}>{authors.length + approvers.length}</span>
      </div>

      {spec.roles.map((role) => {
        const list = role === authorRole ? authors : approvers;
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг санал болгохгүй */
        const free = accounts.filter((a) => !list.includes(a.toLowerCase()));
        return (
          <RoleBlock
            key={role}
            spec={spec}
            group={group}
            role={role}
            list={list}
            free={free}
            known={known}
            failed={failed}
            dirtyPerms={dirtyPerms}
            onAdd={onAdd}
            onRemove={onRemove}
            busy={busy}
          />
        );
      })}

      {stuck && (
        <div className={s.aclErr} role="alert">{spec.stuckMsg()}</div>
      )}
      {authors.length > 0 && approvers.length === 0 && (
        <div className={s.aclErr} role="alert">{spec.noApproverMsg()}</div>
      )}
    </div>
  );
}

/** Нэг үүргийн блок — жагсаалт + нэмэх сонгогч */
function RoleBlock<R extends string>({
  spec, group, role, list, free, known, failed, dirtyPerms, onAdd, onRemove, busy,
}: {
  spec: AclPanelSpec<R>;
  group: string;
  role: R;
  list: string[];
  free: string[];
  known: Set<string>;
  failed: Set<string>;
  dirtyPerms: Set<string>;
  onAdd: (group: string, role: R, user: string) => void;
  onRemove: (group: string, role: R, user: string) => void;
  /** Алсын бичилт явж байна — товчнууд түгжигдэнэ (давхар товшилтоос) */
  busy: boolean;
}) {
  const [add, setAdd] = useState('');

  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{spec.roleLabel(role)}</div>

      {list.length === 0 && (
        <div className={s.aclEmpty}>{spec.emptyLabel(role)}</div>
      )}

      {list.map((u) => (
        <div key={u} className={s.aclUser}>
          <span className={s.aclName} title={u}>{u}</span>
          {!known.has(u) && (
            <span className={s.aclEmpty} title={tr('устгагдсан аккаунт')}>⚠️</span>
          )}
          {failed.has(u) && (
            <span className={s.aclErr} title={tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}>⚠️</span>
          )}
          {dirtyPerms.has(u) && (
            <span className={s.aclErr} title={tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»')}>⚠️</span>
          )}
          <button
            type="button"
            className={s.aclX}
            title={tr('Энэ багцаас хасах')}
            disabled={busy}
            onClick={() => onRemove(group, role, u)}
          >
            ✕
          </button>
        </div>
      ))}

      <div className={s.aclAdd}>
        {/* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */}
        <select
          className={s.aclInput}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          disabled={busy || free.length === 0}
        >
          <option value="">{free.length ? tr('Аккаунт нэмэх…') : tr('Чөлөөтэй аккаунт алга')}</option>
          {free.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          type="button"
          className={s.aclBtn}
          /* ⚠️ Бичилт явж байхад түгжинэ — давхар товшилт нэмэлтийг алдагдуулна */
          disabled={busy || !add.trim()}
          onClick={() => { onAdd(group, role, add); setAdd(''); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
