'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ЭРХ ТОХИРУУЛАХ ПАНЕЛ — «БАГЦ × ШАТ» ХҮСНЭГТ (2026-09-30).
 *
 * ⚠️ Админ порталын ТУСДАА БҮЛЭГ. Хажуугийн «Хэрэглэгчдийн эрх удирдах» нь
 * «хэн ямар харагдац үзэх вэ», энэ нь «хэн аль багцыг бөглөх/хянах вэ» —
 * хоёр өөр асуулт тул нэг жагсаалтад хольсонгүй, гэхдээ нэг л газарт байна.
 *
 * ⚠️ ХАРАГДАЦ УРВУУ БОЛОВ (2026-09-30, хэрэглэгчийн хүсэлт): урьд нь багана =
 *    шат, дотор нь аккаунтын карт + багцын чипүүд байв — «Багц 3-ыг хэн
 *    хянадаг вэ?» гэдгийг мэдэхийн тулд бүх картыг нүдээр гүйлгэх хэрэгтэй.
 *    Одоо мөр = багц, багана = шат, нүд = тэр багцын тэр шатны аккаунтууд.
 * ⚠️ ХАДГАЛАЛТ ӨӨРЧЛӨГДӨӨГҮЙ — АККАУНТААР (нэг аккаунт = нэг шат + багцууд /
 *    «бүх багц» + «Зөвхөн харна»). Нүдний нэмэх/хасахыг аккаунтын мөрийн
 *    өөрчлөлт болгох дүрэм ЦЭВЭР `guitsetgelGrid.planCell*`-д, бичилт нь
 *    `aclOps.flowCellOp`-оор (шилжүүлэх · сүүлийн багц · «бүх багц»-ыг ил
 *    болгох асуултууд тэнд). «Зөвхөн харна» АККАУНТЫН туг — аль нүдэнд
 *    солисон ч тэр хүний бүх багцад үйлчилнэ (`flowViewOnlyOp`).
 *
 * ⚠️ ЭНЭ ТОМИЛГОО = ШАТ БА БАГЦЫН ГАНЦ ЭХ СУРВАЛЖ (2026-08-29,
 * `resolveFlowStage`). Хэрэглэгчийн үүрэг (Энгийн/Төлөвлөлт) ямар ч байсан
 * энд томилогдсон шат нь хяналтын хуудсанд үйлчилнэ.
 *
 * ⚠️ НЭГ ТҮГЖЭЭ БҮХ ХҮСНЭГТЭД (`useAclRunner` нэг удаа): урьд нь багана бүр
 *    өөрийн runner-тэй байв; нүд олон болсон тул хоёр нүдэнд зэрэг дарвал
 *    хоёр бичилт ХУУЧИН мөрөөс бүтээгдэж нэг нь чимээгүй алга болно.
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
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

export function GuitsetgelAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт / эрхийн dirty-set өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   *
   * ⚠️ Гараар бичих нь үсгийн алдаанд өртөнө: `selbe_injner` гэж бичвэл
   *    томилгоо үүснэ, гэхдээ тэр нэртэй хүн байхгүй тул хэзээ ч ажиллахгүй.
   *    Ямар ч алдаа гарахгүй тул админ хэдэн долоо хоног мэдэхгүй байж болно.
   *
   * ⚠️ Кодын хатуу super-ийг САНАЛ БОЛГОХГҮЙ (2026-08-29): түүнд шат/багцын
   *    хязгаар үйлчилдэггүй (`resolveFlowStage`) тул томилгоо нь худал хязгаар
   *    харуулаад, дэмий override мөр л үүсгэдэг байв.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  /** Порталд БАЙГАА аккаунтууд (жижиг үсгээр) — устгагдсаны өнчин томилгоог ялгана */
  const known = new Set(all.map((a) => a.toLowerCase()));
  /** Хасалт унасан (мөр нь аль ч нүдэнд алга) — хүснэгтэд нэгэн адил хамаарна */
  const orphanFail = [...flowFailedUsers()].some((u) => !listAssigns().some((a) => a.user === u));
  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `ScopedAclPanel`-тэй ИЖИЛ.
   *    Remote уншигдаагүй үед томилгоо `[]` тул нэмэх/багц солих бичилт
   *    remote-ийн бодит мөрийг дарж бичнэ. Уншигдтал бүх бичилт хаалттай.
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const ready = () => remoteReady() && capsRemoteReady() && flowAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* ⚠️ Эцгийн 3 тугтай түгжээ (`ready`) — `runOp` дарах агшинд дахин шалгана */
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
        admin: roleForUser(a.user) === 'super',
        failed: failed.has(a.user),
        dirty: dirtyPerms.has(a.user),
      }));

  return (
    <div className={s.aclWrap}>
      {/* ⚠️ 2026-09-30: «Бүх багц» МӨР хасагдсан (доорх ⚠️) — тэр мөр рүү заасан өгүүлбэр тайлбараас хасагдав */}
      <p className={s.aclNote}>
        {tr('Мөр = багц, багана = шат. «+»-ээр аккаунт нэмж, ✕-ээр хасна. Нэг аккаунт зөвхөн НЭГ шатанд байна — өөр шатанд нэмбэл шилжүүлэхийг асууна.')}
        {' '}
        {tr('Томилгоо ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, нэвтрэхэд шууд үйлчилнэ. Томилохын хамт «Гүйцэтгэлийн хяналт» харагдац нээгдэж, хасахад буцаагдана. Шат ба багц нь ЭНЭ томилгооноос гарна — үүргээс биш.')}
      </p>

      {/*
        * ⚠️ НЭГ УДАА (2026-09-08). Урьд нь `Column` дотор байсан тул ДӨРВӨН
        *   баганад давхардаж гардаг байв — гэтэл шалгуур нь («томилгооны мөр
        *   нь аль ч баганад алга») баганаас ХАМААРАЛГҮЙ, өөрөөр хэлбэл дөрвүүлээ
        *   үргэлж ижил хариу өгнө. Дөрвөн ижил улаан анхааруулга нь дөрвөн
        *   ӨӨР асуудал мэт харагдаж, админыг төөрөгдүүлдэг байлаа.
        */}
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — томилгоо түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}
      {err && <div className={s.aclErr} role="alert">{err}</div>}

      {/* ⚠️ 2026-09-30: «Бүх багц» мөр ХАСАГДСАН (хэрэглэгч: «ийм зүйл хэрэггүй»). «Бүх багц»-тай
          хуучин томилгоо багц бүрийн мөрөнд бүдэг чипээр харагдсаар; нэг багцаас хасвал бусад багцын жагсаалт болно.
          ⚠️ Хүснэгтийн загвар `AclGrid`-д — бусад эрхийн хуудас ч ИЖИЛ бүрэлдэхүүн. */}
      <AclGrid
        corner={tr('Багц')}
        rows={PKG_GROUPS.map((g) => ({ key: g, label: g }))}
        cols={STAGE_ORDER.map((st) => ({ key: st, label: STAGE_LABEL[st], count: assignsOf(st).length }))}
        holders={cell}
        /* ⚠️ ХООСОН НҮД = шийдвэрлэх хүнгүй (зөвхөн «харна» хүмүүс ч тоогдохгүй) —
           тэр багцын ажил энэ шатанд ГАЦНА.
           ⚠️ 2026-09-30: устгагдсан аккаунт (`gone`) ч тоологдохгүй — нэвтэрч чадахгүй. */
        stuck={(_pkg, _st, hs) => !hs.some((h) => !h.gone && !rowOf.get(h.user)?.viewOnly)}
        stuckTitle={() => tr('Энэ багцын энэ шатанд шийдвэрлэх аккаунт алга — ажил энд гацна')}
        /*
         * ⚠️ Сонгогчид ЗӨВХӨН өөрчлөлт хийх аккаунт: аль хэдийн хамарсан
         *    (энэ багц эсвэл «бүх багц») хүнийг санал болгохгүй. Өөр шатных
         *    нь санал болгогдоно — сонговол ШИЛЖҮҮЛЭХИЙГ асууна (шошгонд ил).
         */
        candidates={(pkg, st) => accounts
          .filter((u) => planCellAdd(rowOf.get(u.toLowerCase()), st as Stage, pkg).kind !== 'none')
          .map((u) => {
            const cur = rowOf.get(u.toLowerCase());
            return { value: u, label: cur && cur.stage !== st ? tr('{0} (одоо: {1} — шилжинэ)', u, STAGE_LABEL[cur.stage]) : u };
          })}
        onAdd={(pkg, st, u) => act(flowCellOp(u, st as Stage, pkg, true))}
        onRemove={(pkg, st, h) => act(flowCellOp(h.user, st as Stage, pkg, false))}
        addTitle={(r, c) => tr('{0} — {1} шатанд аккаунт нэмэх', r.label, c.label)}
        flag={(h) => {
          const a = rowOf.get(h.user);
          return a && !h.gone && !h.admin ? <ViewOnlyFlag a={a} off={off} onClick={() => act(flowViewOnlyOp(a.user, !a.viewOnly))} /> : null;
        }}
        off={off}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}

/**
 * «Зөвхөн харна» туг — чипэн дэх товч.
 *
 * ⚠️ ХӨНДЛӨНГИЙН ХЯНАЛТ (2026-09-09) — ХАРНА, ШИЙДВЭРЛЭХГҮЙ.
 *    Аудитор, захиалагчийн төлөөлөгч, зөвлөх инженер зэрэг хүн
 *    гүйцэтгэлийг ХАРАХ ёстой ч батлах/буцаах эрхгүй.
 * ⚠️ АККАУНТЫН туг (2026-09-30) — нүдний биш: аль ч нүдэнд солиход
 *    тэр хүний БҮХ багцад нэгэн адил үйлчилнэ. Tooltip-д ил хэлнэ.
 */
function ViewOnlyFlag({ a, off, onClick }: { a: Assign; off: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${s.ggVo} ${a.viewOnly ? s.ggVoOn : ''}`}
      aria-pressed={!!a.viewOnly}
      disabled={off}
      title={tr('«Зөвхөн харна» ({0}) — асаавал гүйцэтгэлийг ХАРНА, батлах/буцаах товч идэвхгүй. Аккаунтын нэг тохиргоо: энд солиход «{1}»-ийн бүх багцад нэгэн адил үйлчилнэ.',
        a.viewOnly ? tr('асаалттай') : tr('унтраалттай'), a.user)}
      onClick={onClick}
    >
      {a.viewOnly ? tr('◉ харна') : '○'}
    </button>
  );
}
