'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — «БАГЦ × ШАТ» ХҮСНЭГТ (2026-09-30).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  assignsOf, flowAclReady, flowFailedUsers, listAssigns, subscribeAcl, type Assign,
} from '@/lib/guitsetgelAcl';
import { cellHolds, planCellAdd } from '@/lib/guitsetgelGrid';
import { AclGrid, type GridHolder } from './AclGrid';
import { flowCellOp, flowViewOnlyOp } from '@/lib/aclOps';
import { useAclRunner } from './useAclRunner';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, roleOf, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { isCodeSuper, roleForUser } from '@/lib/services';
import { portalMissing } from '@/lib/portalPresence';
import s from './guitsetgel.module.css';

export function GuitsetgelAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт / эрхийн dirty-set өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => !isCodeSuper(a));
  /** Порталд БАЙГАА аккаунтууд (жижиг үсгээр) — устгагдсаны өнчин томилгоог ялгана */
  const known = new Set(all.map((a) => a.toLowerCase()));
  /** Хасалт унасан (мөр нь аль ч нүдэнд алга) — хүснэгтэд нэгэн адил хамаарна */
  const orphanFail = [...flowFailedUsers()].some((u) => !listAssigns().some((a) => a.user === u));
  const ready = () => remoteReady() && capsRemoteReady() && flowAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const { busy, err, setErr, run } = useAclRunner(ready);
  const off = locked || busy;

  /** Remote бичилт нь унасан хэрэглэгчид — мөр бүрд тэмдэг (`guitsetgelAcl.failed`) */
  const failed = new Set(flowFailedUsers());
  /** Эрхийн мөр (үүрэг/харагдац) ArcGIS-т хүрээгүй — `permissions` dirty-set */
  const dirtyPerms = new Set(dirtyKeys());
  const rowOf = new Map(listAssigns().map((a) => [a.user, a] as const));

  const act = (op: Parameters<typeof run>[0]) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(op);
  };

  /** Нэг нүдний аккаунтууд — `pkg`, `stage` */
  const cell = (pkg: string, stage: string): GridHolder[] =>
    assignsOf(stage as Stage)
      .map((a) => ({ a, held: cellHolds(a, stage as Stage, pkg) }))
      .filter((x) => x.held)
      .map(({ a, held }) => ({
        user: a.user,
        viaAll: held === 'all',
        gone: !known.has(a.user),
        absent: portalMissing(a.user),
        admin: roleForUser(a.user) === 'super',
        failed: failed.has(a.user),
        dirty: dirtyPerms.has(a.user),
      }));

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Мөр = багц, багана = шат. «+»-ээр аккаунт нэмж, ✕-ээр хасна. Нэг аккаунт зөвхөн НЭГ шатанд байна — өөр шатанд нэмбэл шилжүүлэхийг асууна.')}
        {' '}
        {tr('Томилгоо ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, нэвтрэхэд шууд үйлчилнэ. Томилохын хамт «Гүйцэтгэлийн хяналт» харагдац нээгдэж, хасахад буцаагдана. Шат ба багц нь ЭНЭ томилгооноос гарна — үүргээс биш.')}
      </p>

      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — томилгоо түр зөвхөн энэ хөтчид. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}
      {err && <div className={s.aclErr} role="alert">{err}</div>}

      <AclGrid
        corner={tr('Багц')}
        rows={PKG_GROUPS.map((g) => ({ key: g, label: g }))}
        cols={STAGE_ORDER.map((st) => {
          const live = assignsOf(st).filter((a) => known.has(a.user) && !portalMissing(a.user));
          const vo = live.filter((a) => a.viewOnly || roleOf(a.user) === 'zahiral').length;
          return { key: st, label: STAGE_LABEL[st], count: live.length - vo, more: vo ? tr('+{0} зөвхөн харна', String(vo)) : undefined };
        })}
        holders={cell}
        stuck={(_pkg, _st, hs) => !hs.some((h) => !h.gone && !h.absent && !rowOf.get(h.user)?.viewOnly && roleOf(h.user) !== 'zahiral')}
        stuckTitle={() => tr('Энэ багцын энэ шатанд шийдвэрлэх аккаунт алга — ажил энд гацна')}
        candidates={(pkg, st) => accounts
          .filter((u) => !portalMissing(u) && roleOf(u) !== 'zahiral' && planCellAdd(rowOf.get(u.toLowerCase()), st as Stage, pkg).kind !== 'none')
          .map((u) => {
            const cur = rowOf.get(u.toLowerCase());
            const name = roleForUser(u) === 'super' ? `${u} (${tr('админ')})` : u;
            return { value: u, label: cur && cur.stage !== st ? tr('{0} (одоо: {1} — шилжинэ)', name, STAGE_LABEL[cur.stage]) : name };
          })}
        onAdd={(pkg, st, u) => act(flowCellOp(u, st as Stage, pkg, true))}
        onRemove={(pkg, st, h) => act(flowCellOp(h.user, st as Stage, pkg, false))}
        addTitle={(r, c) => tr('{0} — {1} шатанд аккаунт нэмэх', r.label, c.label)}
        flag={(h) => {
          const a = rowOf.get(h.user);
          return a && !h.gone && !h.absent && !h.admin ? <ViewOnlyFlag a={a} off={off} onClick={() => act(flowViewOnlyOp(a.user, !a.viewOnly))} /> : null;
        }}
        off={off}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}

/**
 * «Зөвхөн харна» туг — чипэн дэх товч.
 */
function ViewOnlyFlag({ a, off, onClick }: { a: Assign; off: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${s.ggVo} ${a.viewOnly ? s.ggVoOn : ''}`}
      aria-pressed={!!a.viewOnly}
      aria-label={`${tr('Зөвхөн харна')}: ${a.user}`}
      disabled={off}
      title={tr('«Зөвхөн харна» ({0}) — асаавал гүйцэтгэлийг ХАРНА, батлах/буцаах товч идэвхгүй. Аккаунтын нэг тохиргоо: энд солиход «{1}»-ийн бүх багцад нэгэн адил үйлчилнэ.',
        a.viewOnly ? tr('асаалттай') : tr('унтраалттай'), a.user)}
      onClick={onClick}
    >
      {a.viewOnly ? tr('◉ харна') : '○'}
    </button>
  );
}
