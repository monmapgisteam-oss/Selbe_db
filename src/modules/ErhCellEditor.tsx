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
 *    ⚠️ 2026-10-23: бичих хориг `aclOps.runOp`-д (`draftGuard`); энд зөвхөн санал болгохгүй.
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { isTopFocusTrap, useFocusTrap } from '@/lib/useFocusTrap';
import { useSyncRef } from '@/lib/useSyncRef';
import { listUsers, roleOf } from '@/lib/permissions';
import { isCodeSuper, roleForUser } from '@/lib/services';
import { stageOfUser } from '@/lib/guitsetgelAcl';
/* ⚠️ 2026-10-22 (аудит): порталд алга аккаунтын шошго (`portalPresence`) */
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
  /*
   * ⚠️ 2026-10-23 (UX аудит A5): `role="dialog"` атлаа фокусын урхигүй, Esc нь эцгийнх (`ErhMatrix`) байв — Tab нь
   *    popover-оос гарч ард байгаа матриц руу явдаг байв. Одоо урхи (`useFocusTrap`, хаахад нээсэн нүд рүү буцна) ба
   *    ӨӨРИЙН Esc. Урхи ЭХЭНД зарлагдана: доорх эффект (select-ийг фокуслах, 2026-10-07 ⚠️) түүний ДАРАА ажиллаж
   *    урхины «эхний товч» (толгойн ✕) фокусыг засна.
   */
  useFocusTrap(box, true);
  /* ⚠️ `onClose` нь эцгээс inline (зурагдалт бүрд шинэ) — ref-ээр уншина, эс бөгөөс сонсогч дахин бүртгэгдэж эцгийнхээс ХОЙШ орно */
  const closeRef = useRef(onClose);
  useSyncRef(closeRef, onClose);
  useEffect(() => {
    /* ⚠️ CAPTURE — хүүхдийн эффект эцгийнхээс (`ErhMatrix`) ӨМНӨ бүртгэгдэх тул энэ нь эхэлж ажиллана. Дээр нь өөр
       урхи (асуултын цонх `askConfirm`) нээлттэй бол Esc түүнийх — оролцохгүй. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopFocusTrap(box.current)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  /* ⚠️ 2026-10-07: ЭХЛЭЭД select — `'select, button'` нь баримтын дарааллаар толгойн ✕-г
     олдог тул Enter дарахад засварлагч шууд хаагддаг байв. */
  useEffect(() => {
    const b = box.current;
    (b?.querySelector<HTMLElement>('select') ?? b?.querySelector<HTMLElement>('button'))?.focus();
  }, []);

  const all = listUsers().map((u) => u.username);
  const known = new Set(all.map((a) => a.toLowerCase()));
  const taken = new Set([...owners, ...viewers].map((x) => x.toLowerCase()));
  /* ⚠️ Шинэ (хадгалаагүй) ба устгахаар тэмдэглэсэн аккаунтыг санал болгохгүй */
  const frozen = (a: string): boolean => {
    const d = drafts.get(a.toLowerCase());
    return !!d && (!!d.remove || !!d.isNew);
  };
  /* ⚠️ 2026-10-21 (аудит): зөвхөн КОДЫН super-ийг нуух — хүснэгтийн super (доошлуулж болно) хуваарилагдана (`aclOps.isCleanup`-ийн ⚠️) */
  /* ⚠️ 2026-10-23: порталд алга гэж батлагдсан аккаунтыг санал болгохгүй */
  /* ⚠️ 2026-10-26 (аудит): урсгалын нүдэнд «Ерөнхий захирал»-ыг санал болгохгүй — `setAssign` ZAHIRAL_NO_FLOW-оор татгалздаг
     (GuitsetgelAcl-ийн сонгогчтой нэг дүрэм) */
  const free = all.filter((a) => !isCodeSuper(a) && !portalMissing(a) && !taken.has(a.toLowerCase()) && !frozen(a)
    && !(col.sys === 'flow' && roleOf(a) === 'zahiral'));
  /* ⚠️ 2026-10-23: ноорогийн бичих хориг (шинэ · устгахаар тэмдэглэсэн · урсгал × ноорог) `aclOps.runOp`-д ШИЛЖСЭН
     (`draftGuard`) — бүх эрхийн хуудсанд нэг дүрэм; энд зөвхөн санал болгохгүй (`frozen`). */
  /** Бичээд фокусыг popover руу буцаана — Esc барих хүрээнд үлдэнэ */
  const exec = async (op: AclOp) => {
    await run(op);
    box.current?.focus();
  };

  /*
   * ⚠️ НҮДНИЙ OP — багцын хуудасны хүснэгттэй (`AclGrid`) ЯГ ИЖИЛ (2026-09-30, хэрэглэгчийн
   *    мэдээлсэн алдаа: «нэг багцаас хасахад бүх багцаас хасагдаж байна»). Урьд нь энд
   *    `removePkgOp` · `qaqcRemoveOp` · `flowRemoveOp` дуудагддаг байв: «Бүх багц»-тай хүнийг
   *    НЭГ нүднээс ✕ дарахад «энэ үүргийг БҮХЭЛД НЬ хасах уу?» гэж асуугаад зөвшөөрвөл
   *    БҮХ багцаас хасдаг — тэр хүн матрицын нүд бүрд энгийн нэр шиг харагддаг тул админ
   *    «зөвхөн энэ багц» гэж ойлгож зөвшөөрдөг. Хуудасны хүснэгт 2026-09-30-нд «бусад
   *    багцын ил жагсаалт болно» (`narrow`) дүрэмд шилжсэн ч матриц хуучин op дээр үлдсэн.
   *    Одоо `*CellOp` — нэг дүрэм, нэг асуулт (`aclE2E.ui.check.mjs` барина).
   *    Урсгалын баганад ШАТЫГ нь (`col.role`) дамжуулна — `flowRemoveOp` шатгүй байв.
   */
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
      {/* ⚠️ 2026-10-01: устгагдсан · админ тэмдэг ИЛ текстээр (матрицын `ErhMatrix.person`-той ижил) */}
      {!known.has(u.toLowerCase()) && <span className={s.aclMarkTag} title={tr('устгагдсан аккаунт')}>{tr('устгагдсан')}</span>}
      {/* ⚠️ 2026-10-22 (аудит): хүснэгтэд мөртэй атлаа Enterprise порталд алга — нэвтэрч чадахгүй, хасаж/шилжүүлнэ */}
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
          onClick={() => { const u = add; setAdd(''); void exec(addOp(u)); }}
        >
          {tr('Нэмэх')}
        </button>
      </div>
    </div>
  );
}
