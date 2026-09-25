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
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import type { ScopedSys } from '@/lib/aclRoleCaps';
import { addPkgOp, removePkgOp } from '@/lib/aclOps';
import { useAclRunner } from './useAclRunner';
import s from './guitsetgel.module.css';

/*
 * ⚠️ БИЧИХ ЛОГИК `aclOps.ts`-Д ШИЛЖСЭН (2026-09-25). `removeRevokingRoles` ·
 *    `setGrantsRevokingRoles` · нэмэх/хасах дүрэм (ALL хамгаалалт, багцгүй grant
 *    унах, `revoke=false`) урьд нь ЭНД байв; одоо хэрэглэгчийн карт ба матриц ч
 *    ИЖИЛ op-оор бичдэг тул нэг газар. Энэ панел нь зөвхөн харуулж, op дуудна.
 */

/** Хуваарилалтын мөр — үүрэг бүр өөрийн багцтай */
type Row<R extends string> = { user: string; grants: Grant<R>[] };

/**
 * НЭГ ДЭД СИСТЕМИЙН ТОХИРГОО.
 *
 * ⚠️ Шошго ба зурвасыг ФУНКЦ болгож авна — модулийн түвшинд `tr()` дуудвал
 *    хэл солиход шинэчлэгдэхгүй (зурагдах агшинд дуудагдах ёстой).
 */
export type AclPanelSpec<R extends string> = {
  /**
   * Аль систем — бичилт `aclOps.SCOPED_SYS[sys]`-ээр явна (2026-09-25).
   * ⚠️ `setGrants` · `remove` · `roleCaps` · `confirmRemoveAll` талбарууд
   *    ХАСАГДСАН: тэдгээр нь `aclOps`/`aclRoleCaps`-д НЭГ газар — панел бүр
   *    өөрийн хуулбартай байхад нэгийг солиход бусад нь хоцордог байв.
   */
  sys: ScopedSys;
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
  /** Панелийн тайлбар — 3 догол мөр */
  notes: () => [string, string, string];
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
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `UserAdmin.capsLocked`-той
   *    ИЖИЛ. Remote уншигдаагүй үед `spec.list()` нь `[]` тул бүх багц
   *    «томилоогүй» харагдаж, «Нэмэх» дарахад `setGrants` тэр хүний БҮХ
   *    мөрийг зөвхөн энэ нэг багцаар ДАРЖ бичнэ. Уншигдтал нэмэх/хасах хаалттай.
   */
  /* ⚠️ ӨӨРИЙН ACL-ийн тугийг ч шалгана (2026-09-24) — `spec.list()` энэ туг
     хүртэл `[]` тул нөгөө хоёр бэлэн ч энэ нь хоцорвол дарж бичнэ. */
  const ready = () => remoteReady() && capsRemoteReady() && spec.ready();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /*
   * ⚠️ БИЧИЛТ ЯВЖ БАЙХАД дахин дарахаас хамгаална (2026-09-15-ны
   *    хэрэглээний аудит) — `useAclRunner`-ийн `busy`. Хоёр `setGrants`
   *    зэрэгцэн явбал хоёр дахь нь ХУУЧИН мөрөөс уншиж эхний нэмэлт алга болно.
   * ⚠️ `false` буцвал ArcGIS бичилт унасан — `runOp` зурвас тавина.
   */
  const { busy, err, setErr, run } = useAclRunner(ready);

  /**
   * БАГЦАД ААКАУНТ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
   * ⚠️ Дүрэм (ALL хамгаалалт, grant тус бүр) нь `aclOps.addPkgOp`-д.
   */
  const addTo = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(addPkgOp(spec.sys, user, role, group));
  };

  /**
   * БАГЦААС ААКАУНТ ХАСАХ — тэр ҮҮРГИЙН grant-аас энэ багцыг л хасна.
   * ⚠️ «Бүх багц»-тай бол бүхэлд нь хасахыг асууна; сүүлийн grant бол мөр
   *    бүхэлдээ (`revoke=false` + алга болсон үүргийн эрх) — `aclOps.removePkgOp`.
   */
  const removeFrom = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(removePkgOp(spec.sys, user, role, group));
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
