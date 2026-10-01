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
 *
 * ⚠️ ХӨЗӨР → ХҮСНЭГТ (2026-09-30, хэрэглэгчийн баталсан `GuitsetgelAcl` загвар):
 *    мөр = багц, багана = хоёр үүрэг, нүдэнд аккаунтын чипүүд (`AclGrid`).
 *    Багц бүрийн хөзөр (`PkgCol` · `RoleBlock`) ХАСАГДСАН. Нүдний нэмэх/хасах
 *    нь `aclOps.scopedCellOp`-оор (цэвэр дүрэм `aclGrid.planGrant*`) — ALL
 *    хамгаалалт, багцгүй grant унах, сүүлийн grant → бүтэн хасалт хэвээр;
 *    «бүх багц»-ыг НЭГ мөрөөс хасвал бусад багцын ил жагсаалт болно (асууна).
 *    Гацааны анхааруулга (зохиогч=батлагч · батлагчгүй) мөрийн толгойд ⚠ ба
 *    батлагчийн нүдэнд бүдэг шараар, бүтэн текст нь хүснэгтийн доор.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Grant } from '@/lib/scopedAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import type { ScopedSys } from '@/lib/aclRoleCaps';
import { scopedCellOp } from '@/lib/aclOps';
import { grantHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import s from './guitsetgel.module.css';

/*
 * ⚠️ БИЧИХ ЛОГИК `aclOps.ts`-Д ШИЛЖСЭН (2026-09-25). `removeRevokingRoles` ·
 *    `setGrantsRevokingRoles` · нэмэх/хасах дүрэм (ALL хамгаалалт, багцгүй grant
 *    унах, `revoke=false`) урьд нь ЭНД байв; одоо хэрэглэгчийн карт ба матриц ч
 *    ИЖИЛ op-оор бичдэг тул нэг газар. Энэ панел нь зөвхөн харуулж, op дуудна
 *    (2026-09-30-наас нүдний `scopedCellOp`).
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
  /** «Зохиогч томилоогүй» / «Засварлагч томилоогүй» — хоосон нүдний tooltip */
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
   * НҮДЭНД ААКАУНТ НЭМЭХ — тэр хүний ТЭР ҮҮРГИЙН grant-д энэ багцыг нэмнэ.
   * ⚠️ Дүрэм (ALL хамгаалалт, grant тус бүр) нь `aclGrid.planGrantAdd` → `aclOps.scopedCellOp`-д.
   */
  const addTo = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp(spec.sys, user, role, group, true));
  };

  /**
   * НҮДНЭЭС ААКАУНТ ХАСАХ — тэр ҮҮРГИЙН grant-аас энэ багцыг л хасна.
   * ⚠️ «Бүх багц»-тай бол бусад багцын ил жагсаалт болгохыг асууна; сүүлийн grant бол
   *    мөр бүхэлдээ (асууж, `revoke=false` + алга болсон үүргийн эрх) — `aclOps.scopedCellOp`.
   */
  const removeFrom = (group: string, role: R, user: string) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(scopedCellOp(spec.sys, user, role, group, false));
  };

  const [note1, note2, note3] = spec.notes();
  const [authorRole, approverRole] = spec.roles;

  /** Тухайн багцад тэр үүргээр хуваарилагдсан аккаунтууд (+ «бүх багц»-аар эсэх) */
  const holdersOf = (group: string, role: string): GridHolder[] =>
    rows.flatMap((a) => {
      const held = grantHolds(a.grants, role, group);
      return held ? [{
        user: a.user,
        viaAll: held === 'all',
        gone: !known.has(a.user),
        /* ⚠️ 2026-09-30: хатуу super-ийн хуучин мөр — «админ» тэмдэг (`GuitsetgelAcl`-тэй ижил); ✕ нь мөрийг бүхэлд нь цэвэрлэнэ (`aclOps.isCleanup`) */
        admin: roleForUser(a.user) === 'super',
        failed: failed.has(a.user),
        dirty: dirtyPerms.has(a.user),
      }] : [];
    });

  /** Багц бүрийн гацаа — нэг удаа тооцоод мөр, нүд хоёуланд */
  const state = new Map(PKG_GROUPS.map((g) => {
    /* ⚠️ 2026-09-30: устгагдсан аккаунт (`gone`) нэвтэрч чадахгүй — гацааны шалгуурт тоолохгүй
       (`erhOverview.ErhSource.gone`-той ижил); урьд нь түүний хуучин мөр «батлагчгүй» анхааруулгыг нууж байв */
    const authors = holdersOf(g, authorRole).filter((h) => !h.gone).map((h) => h.user);
    const approvers = holdersOf(g, approverRole).filter((h) => !h.gone).map((h) => h.user);
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
    const noApprover = authors.length > 0 && approvers.length === 0;
    return [g, { stuck, noApprover }] as const;
  }));

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

      <AclGrid
        corner={tr('Багц')}
        rows={PKG_GROUPS.map((g) => {
          const st = state.get(g);
          return {
            key: g,
            label: g,
            warn: [st?.stuck ? spec.stuckMsg() : '', st?.noApprover ? spec.noApproverMsg() : ''].filter(Boolean),
          };
        })}
        cols={spec.roles.map((r) => ({
          key: r,
          label: spec.roleLabel(r),
          count: rows.filter((a) => a.grants.some((g) => g.role === r)).length,
        }))}
        holders={holdersOf}
        /* ⚠️ Гацаа нь БАТЛАГЧИЙН нүдэнд: батлагчгүй, эсвэл зохиогч өөрөө л батлагч.
           Хоосон зохиогчийн нүд гацаа биш — илгээх зүйл үүсэхгүй. */
        stuck={(g, role) => role === approverRole && !!(state.get(g)?.stuck || state.get(g)?.noApprover)}
        stuckTitle={(g, role) => (state.get(g)?.noApprover ? spec.emptyLabel(role as R) : spec.stuckMsg())}
        /* Тэр багцад тэр үүргээр аль хэдийн байгааг («бүх багц»-аар ч) санал болгохгүй */
        candidates={(g, role) => {
          const list = holdersOf(g, role).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase())).map((a) => ({ value: a, label: a }));
        }}
        onAdd={(g, role, u) => addTo(g, role as R, u)}
        onRemove={(g, role, h) => removeFrom(g, role as R, h.user)}
        addTitle={(r, c) => tr('{0} — {1}: аккаунт нэмэх', r.label, c.label)}
        off={busy || locked}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}
