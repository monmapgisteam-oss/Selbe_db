'use client';

/**
 * МАТРИЦЫН НҮДНИЙ ЗАСВАРЛАГЧ — нэг багц × нэг үүрэг/шатны эзэд (2026-09-25).
 *
 * ⚠️ БИЧИЛТ ЗӨВХӨН `aclOps`-оор — бүлгийн панел ба хэрэглэгчийн карттай ИЖИЛ
 *    дүрэм ба асуулт («Бүх багц» хамгаалалт, шат шилжүүлэх, сүүлийн багц →
 *    хуваарилалтаас хасах). Энд шинэ дүрэм БИЧИХГҮЙ.
 * ⚠️ Хатуу super-ийг САНАЛ БОЛГОХГҮЙ — түүнд хуваарилалт үйлчилдэггүй
 *    (`setGrants`/`setAssign` татгалздаг).
 * ⚠️ Esc — `ErhMatrix`-ийн CAPTURE-фазын `window` сонсогч барина (2026-09-25,
 *    хянагчийн олдвор): урьд нь зөвхөн popover-ийн `onKeyDown` байсан тул ✕ /
 *    «Нэмэх» дарсны дараа фокус `body` руу унаж, Esc нь `UserAdmin`-ы `window`
 *    сонсогчид хүрч БҮХ админ порталыг хаадаг байв. Мөн бичилтийн дараа фокусыг
 *    popover руу буцаана (`tabIndex={-1}`).
 * ⚠️ КАРТЫН ХАМГААЛАЛТ МАТРИЦАД Ч (2026-09-25): шинэ/устгах тэмдэгтэй аккаунтыг
 *    санал болгохгүй, тэдэнд бичихгүй; урсгалыг хадгалаагүй ноорогтой хүнд
 *    бичихгүй (`grantFlowAccess` эрхийн мөрийг бичиж ноорогтой уралдана).
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { listUsers } from '@/lib/permissions';
import { roleForUser } from '@/lib/services';
import { stageOfUser } from '@/lib/guitsetgelAcl';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
import type { ScopedSys } from '@/lib/aclRoleCaps';
import {
  addPkgOp, flowAddOp, flowRemoveOp, lockMsg, qaqcAddOp, qaqcRemoveOp, removePkgOp, type AclOp,
} from '@/lib/aclOps';
import { draftFlowMsg, newAccountMsg, removeMarkedMsg } from './erhLabels';
import s from './guitsetgel.module.css';

/** Засах нүдний багана — матрицын 17 + дэд бүтцийн «Засварлагч» */
export type EditCol = { sys: 'flow' | 'qaqc' | ScopedSys; role: string };

export function ErhCellEditor({
  pkg, title, col, owners, viewers, locked, busy, err, run, onClose, drafts,
}: {
  /** Багцын түлхүүр (`PKG_GROUPS` эсвэл `BUTETS_PACKS[].key`) */
  pkg: string;
  /** «Багц 3 · Батлагч» гэх мэт гарчиг */
  title: string;
  col: EditCol;
  owners: string[];
  viewers: string[];
  /** Бүх ACL уншигдаагүй — засвар хаалттай */
  locked: boolean;
  busy: boolean;
  err: string;
  run: (op: AclOp) => Promise<boolean>;
  onClose: () => void;
  /** `UserAdmin`-ы хадгалаагүй ноорог (жижиг үсгийн түлхүүр) — картын хамгаалалт */
  drafts: ReadonlyMap<string, { remove?: boolean; isNew?: boolean }>;
}) {
  const [add, setAdd] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>('select, button')?.focus(); }, []);

  const all = listUsers().map((u) => u.username);
  const known = new Set(all.map((a) => a.toLowerCase()));
  const taken = new Set([...owners, ...viewers].map((x) => x.toLowerCase()));
  /* ⚠️ Шинэ (хадгалаагүй) ба устгахаар тэмдэглэсэн аккаунтыг санал болгохгүй */
  const frozen = (a: string): boolean => {
    const d = drafts.get(a.toLowerCase());
    return !!d && (!!d.remove || !!d.isNew);
  };
  const free = all.filter((a) => roleForUser(a) !== 'super' && !taken.has(a.toLowerCase()) && !frozen(a));

  /** Картын хамгаалалт — op бүтээхээс ӨМНӨ (`runOp` `error`-ийг зурвас болгоно) */
  const guard = (u: string, op: () => AclOp): AclOp => {
    const d = drafts.get(u.toLowerCase());
    if (d?.isNew) return { error: newAccountMsg() };
    if (d?.remove) return { error: removeMarkedMsg() };
    if (col.sys === 'flow' && d) return { error: draftFlowMsg() };
    return op();
  };
  /** Бичээд фокусыг popover руу буцаана — Esc барих хүрээнд үлдэнэ */
  const exec = async (op: AclOp) => {
    await run(op);
    box.current?.focus();
  };

  const addOp = (u: string): AclOp => (col.sys === 'flow' ? flowAddOp(u, col.role as Stage, pkg)
    : col.sys === 'qaqc' ? qaqcAddOp(u, pkg)
      : addPkgOp(col.sys, u, col.role, pkg));
  const rmOp = (u: string): AclOp => (col.sys === 'flow' ? flowRemoveOp(u, pkg)
    : col.sys === 'qaqc' ? qaqcRemoveOp(u, pkg)
      : removePkgOp(col.sys, u, col.role, pkg));

  /** Урсгалын сонголтод одоогийн шатыг харуулна — шилжүүлэхээс өмнө мэдэгдэнэ */
  const optLabel = (a: string): string => {
    if (col.sys !== 'flow') return a;
    const st = stageOfUser(a);
    return st ? `${a} (${STAGE_LABEL[st]})` : a;
  };

  const off = locked || busy;

  const person = (u: string, view: boolean) => (
    <div key={`${view ? 'v' : 'o'}-${u}`} className={s.aclUser}>
      <span className={`${s.aclName} ${view ? s.mxView : ''}`} title={u}>
        {u}{view ? ` · ${tr('зөвхөн харна')}` : ''}
      </span>
      {!known.has(u.toLowerCase()) && <span className={s.aclEmpty} title={tr('устгагдсан аккаунт')}>⚠️</span>}
      <button
        type="button"
        className={s.aclX}
        title={tr('Энэ багцаас хасах')}
        disabled={off}
        onClick={() => { void exec(guard(u, () => rmOp(u))); }}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div
      ref={box}
      className={s.mxPop}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={s.aclHead}>
        <span>{title}</span>
        <button type="button" className={s.aclX} title={tr('Хаах')} onClick={onClose}>✕</button>
      </div>
      {locked && <div className={s.aclErr} role="alert">{lockMsg()}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {owners.length === 0 && viewers.length === 0 && <div className={s.aclEmpty}>{tr('Томилоогүй')}</div>}
      {owners.map((u) => person(u, false))}
      {viewers.map((u) => person(u, true))}
      <div className={s.aclAdd}>
        {/* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */}
        <select
          className={s.aclInput}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          disabled={off || free.length === 0}
          aria-label={tr('Аккаунт нэмэх…')}
        >
          <option value="">{free.length ? tr('Аккаунт нэмэх…') : tr('Чөлөөтэй аккаунт алга')}</option>
          {free.map((a) => <option key={a} value={a}>{optLabel(a)}</option>)}
        </select>
        <button
          type="button"
          className={s.aclBtn}
          disabled={off || !add.trim()}
          onClick={() => { const u = add; setAdd(''); void exec(guard(u, () => addOp(u))); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
