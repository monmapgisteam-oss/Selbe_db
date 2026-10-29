'use client';

/**
 * МАТРИЦЫН НҮДНИЙ ЗАСВАРЛАГЧ — нэг багц × нэг үүрэг/шатны эзэд (2026-09-25).
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { isTopFocusTrap, useFocusTrap } from '@/lib/useFocusTrap';
import { useSyncRef } from '@/lib/useSyncRef';
import { listUsers, roleOf } from '@/lib/permissions';
import { isCodeSuper, roleForUser } from '@/lib/services';
import { stageOfUser } from '@/lib/guitsetgelAcl';
import { portalMissing } from '@/lib/portalPresence';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
import type { ScopedSys } from '@/lib/aclRoleCaps';
import {
  flowCellOp, lockMsg, scopedCellOp, type AclOp,
} from '@/lib/aclOps';
import s from './guitsetgel.module.css';

/** Засах нүдний багана — матрицын 19 (`MATRIX_COLS`) + дэд бүтцийн «Засварлагч» */
export type EditCol = { sys: 'flow' | ScopedSys; role: string };

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
  useFocusTrap(box, true);
  const closeRef = useRef(onClose);
  useSyncRef(closeRef, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopFocusTrap(box.current)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => {
    const b = box.current;
    (b?.querySelector<HTMLElement>('select') ?? b?.querySelector<HTMLElement>('button'))?.focus();
  }, []);

  const all = listUsers().map((u) => u.username);
  const known = new Set(all.map((a) => a.toLowerCase()));
  const taken = new Set([...owners, ...viewers].map((x) => x.toLowerCase()));
  const frozen = (a: string): boolean => {
    const d = drafts.get(a.toLowerCase());
    return !!d && (!!d.remove || !!d.isNew);
  };
  const free = all.filter((a) => !isCodeSuper(a) && !portalMissing(a) && !taken.has(a.toLowerCase()) && !frozen(a)
    && !(col.sys === 'flow' && roleOf(a) === 'zahiral'));
  /** Бичээд фокусыг popover руу буцаана — Esc барих хүрээнд үлдэнэ */
  const exec = async (op: AclOp) => {
    await run(op);
    box.current?.focus();
  };

  const addOp = (u: string): AclOp => (col.sys === 'flow' ? flowCellOp(u, col.role as Stage, pkg, true)
    : scopedCellOp(col.sys, u, col.role, pkg, true));
  const rmOp = (u: string): AclOp => (col.sys === 'flow' ? flowCellOp(u, col.role as Stage, pkg, false)
    : scopedCellOp(col.sys, u, col.role, pkg, false));

  /** Урсгалын сонголтод одоогийн шатыг харуулна — шилжүүлэхээс өмнө мэдэгдэнэ */
  const optLabel = (a: string): string => {
    const name = roleForUser(a) === 'super' ? `${a} (${tr('админ')})` : a;
    if (col.sys !== 'flow') return name;
    const st = stageOfUser(a);
    return st ? `${name} (${STAGE_LABEL[st]})` : name;
  };

  const off = locked || busy;

  const person = (u: string, view: boolean) => (
    <div key={`${view ? 'v' : 'o'}-${u}`} className={s.aclUser}>
      <span className={`${s.aclName} ${view ? s.mxView : ''}`} title={u}>
        {u}{view ? ` · ${tr('зөвхөн харна')}` : ''}
      </span>
      {!known.has(u.toLowerCase()) && <span className={s.aclMarkTag} title={tr('устгагдсан аккаунт')}>{tr('устгагдсан')}</span>}
      {known.has(u.toLowerCase()) && portalMissing(u) && (
        <span className={s.aclMarkTag} title={tr('Enterprise порталд алга — нэвтэрч чадахгүй; ✕-ээр хасаад өөр аккаунт томилно уу')}>{tr('порталд алга')}</span>
      )}
      {known.has(u.toLowerCase()) && roleForUser(u) === 'super' && (
        <span className={s.aclMarkTag} title={tr('админ (super) — одоо бүх багцад, дараалсан шатуудад ч шийдвэр гаргана (багцын хязгаар, өөрийгөө батлах дүрэм үйлчлэхгүй); энэ томилгоо админ эрхийг хасахад үлдэнэ')}>{tr('админ')}</span>
      )}
      <button
        type="button"
        className={s.aclX}
        title={tr('Энэ багцаас хасах')} aria-label={`${tr('Энэ багцаас хасах')}: ${u}`}
        disabled={off}
        onClick={() => { void exec(rmOp(u)); }}
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
        <button type="button" className={s.aclX} title={tr('Хаах')} aria-label={tr('Хаах')} onClick={onClose}>✕</button>
      </div>
      {locked && <div className={s.aclErr} role="alert">{lockMsg()}</div>}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
      {owners.length === 0 && viewers.length === 0 && <div className={s.aclEmpty}>{tr('Томилоогүй')}</div>}
      {owners.map((u) => person(u, false))}
      {viewers.map((u) => person(u, true))}
      <div className={s.aclAdd}>
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
          onClick={() => { const u = add; setAdd(''); void exec(addOp(u)); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
