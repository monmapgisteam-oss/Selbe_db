'use client';

/**
 * ЧАНАРЫН (QAQC) ЭРХ ТОХИРУУЛАХ ПАНЕЛ.
 *
 * ⚠️ «Гүйцэтгэлийн урсгалын эрх»-ЭЭС ТУСДАА БҮЛЭГ (2026-09-07). Тэр нь «хэн
 * аль багцын гүйцэтгэлийг бөглөх / хянах вэ» гэсэн ДӨРВӨН ШАТТАЙ асуулт;
 * энэ нь «хэн аль багцын чанарын баримтыг (М-акт · FIC · MA · MIR) хөтлөх вэ»
 * гэсэн ШАТГҮЙ асуулт. Чанарын хяналтын ажилтан нь гүйцэтгэгч ч биш, хянагч
 * инженер ч биш тул урсгалын багананд байрлуулах газаргүй.
 *
 * ⚠️ ЯАГААД ТУСДАА БАЙХ ЁСТОЙ ВЭ: урьд нь QAQC хуудас багцаа урсгалын
 * томилгооноос авдаг байсан тул чанарын ажилтанд багц өгөх гэвэл түүнийг
 * заавал нэг ШАТАНД томилох ёстой болж, тэр нь гүйцэтгэлийг ЗӨВШӨӨРӨХ эрх
 * дагуулдаг байв («хэн юуг баталсан нь замхарна» — `caps.ts`). Мөн «нэг
 * аккаунт нэг шатанд» дүрмээр хүний өмнөх томилгоо чимээгүй хасагддаг байлаа.
 *
 * ⚠️ Багц ХУВААРИЛАХ нь `qaqc` ЭРХИЙГ автоматаар олгоно, хасах нь буцаана —
 * хоёрыг тусад нь тохируулах шаардлагагүй (`qaqcAcl.setQaqcAssign`).
 *
 * ⚠️ БИЧИЛТ `aclOps`-ООР (2026-09-25) — хэрэглэгчийн карт ба матрицтай ИЖИЛ
 *    дүрэм, ИЖИЛ асуулт (2026-09-30-наас `qaqcCellOp` · `qaqcDropOp`). Сүүлийн
 *    багцыг дарвал урьд нь «хасахгүй» гэж зогсоодог байв; одоо ✕-ийн зам
 *    (асууж, хуваарилалтаас хасна) — «бүх багц» руу БУЦАХГҮЙ (fail-closed хэвээр).
 *
 * ⚠️ ХӨЗӨР → ХҮСНЭГТ (2026-09-30, `GuitsetgelAcl` загвар): мөр = багц, ганц
 *    багана «Чанарын хяналт», нүдэнд аккаунтын чипүүд (`AclGrid`). Урьд нь
 *    аккаунтын мөр бүрд багцын чипүүд + «Бүх багц» товч байв. Одоо «+» = тэр
 *    аккаунтын жагсаалтад ЭНЭ багцыг нэмнэ (мөргүй бол зөвхөн энэ багцаар
 *    шинэ мөр, эрх олгоно); ✕ = энэ багцыг хасна (сүүлийнх бол ✕-ийн зам,
 *    «бүх багц»-тай бол бусад багцын ил жагсаалт болгохыг асууна) —
 *    `aclOps.qaqcCellOp` (цэвэр дүрэм `aclGrid.planList*`). Устгагдсан аккаунтын
 *    өнчин мөрийг ✕ шууд цэвэрлэнэ (`qaqcDropOp`, асуухгүй — хуучин дүрэм).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  listQaqcAssigns, qaqcAclReady, qaqcFailedUsers, subscribeQaqcAcl,
} from '@/lib/qaqcAcl';
import { qaqcCellOp, qaqcDropOp } from '@/lib/aclOps';
import { listHolds } from '@/lib/aclGrid';
import { useAclRunner } from './useAclRunner';
import { AclGrid, type GridHolder } from './AclGrid';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

export function QaqcAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeQaqcAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт / эрхийн dirty-set өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   *
   * ⚠️ Гараар бичихгүй: `selbe_injner` гэж алдаатай бичвэл хуваарилалт үүсэх ч
   *    тэр нэртэй хүн байхгүй тул хэзээ ч ажиллахгүй, ямар ч алдаа гарахгүй.
   *
   * ⚠️ Кодын хатуу super-ийг САНАЛ БОЛГОХГҮЙ — түүнд хязгаар үйлчилдэггүй
   *    (`qaqcScope` `null`) тул хуваарилалт нь худал хязгаар л харуулна.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  /** Порталд БАЙГАА аккаунтууд (жижиг үсгээр) — устгагдсаны өнчин мөрийг ялгана */
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listQaqcAssigns();

  /** Remote бичилт нь унасан хэрэглэгчид — мөр бүрд тэмдэг */
  const failed = new Set(qaqcFailedUsers());
  /** Хасалт унасан (мөр нь жагсаалтад алга) — панелийн түвшний анхааруулга */
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  /** Эрхийн мөр (үүрэг/харагдац) ArcGIS-т хүрээгүй — `permissions` dirty-set */
  const dirtyPerms = new Set(dirtyKeys());

  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `ScopedAclPanel`-тэй ИЖИЛ.
   *    Remote уншигдаагүй үед `rows` нь `[]` тул нэмэх/багц солих бичилт
   *    remote-ийн бодит мөрийг дарж бичнэ. Уншигдтал бүх бичилт хаалттай.
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const ready = () => remoteReady() && capsRemoteReady() && qaqcAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* ⚠️ Өөрийн 3 тугтай түгжээ хэвээр; `busy` нь давхар товшилтыг барина */
  const { busy, err, setErr, run } = useAclRunner(ready);
  const off = locked || busy;

  const act = (op: Parameters<typeof run>[0]) => {
    if (locked) { setErr(LOCK_MSG); return; }
    void run(op);
  };

  /** Тухайн багцыг хариуцах аккаунтууд (+ «бүх багц»-аар эсэх) */
  const holdersOf = (pkg: string): GridHolder[] =>
    rows.flatMap((r) => {
      const held = listHolds(r.bagts, pkg);
      return held ? [{
        user: r.user,
        viaAll: held === 'all',
        gone: !known.has(r.user),
        failed: failed.has(r.user),
        dirty: dirtyPerms.has(r.user),
      }] : [];
    });

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Мөр = багц. «+»-ээр тухайн багцын чанарын баримтыг хариуцах аккаунт нэмж, ✕-ээр хасна.')}
        {' '}
        {tr('Хуваарилалт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, тухайн хүн өөрийн төхөөрөмжөөс нэвтрэхэд шууд үйлчилнэ. Нэмэхэд «QAQC — Inspection Test Plan» эрх ба «Чанар (QAQC)» харагдац автоматаар нээгдэж, хасахад буцаагдана.')}
        {' '}
        {tr('⚠️ Энэ нь гүйцэтгэлийн урсгалаас ТУСДАА: чанарын багц олгосон нь тухайн хүнд гүйцэтгэл зөвшөөрөх/буцаах эрх өгөхгүй, түүний урсгалын шатыг ч хөндөхгүй.')}
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
        rows={PKG_GROUPS.map((g) => ({ key: g, label: g }))}
        cols={[{ key: 'qaqc', label: tr('Чанарын хяналт'), count: rows.length }]}
        holders={(g) => holdersOf(g)}
        /* ⚠️ Хоосон багц гацаа биш — QAQC хуудас батлах шатгүй (хэн ч бөглөөгүй л болно) */
        stuck={() => false}
        stuckTitle={() => ''}
        /* Аль хэдийн хамарсан («бүх багц»-аар ч) аккаунтыг санал болгохгүй */
        candidates={(g) => {
          const list = holdersOf(g).map((h) => h.user);
          return accounts.filter((a) => !list.includes(a.toLowerCase())).map((a) => ({ value: a, label: a }));
        }}
        onAdd={(g, _c, u) => act(qaqcCellOp(u, g, true))}
        /* ⚠️ Устгагдсан аккаунт: зөвхөн мөрийг арилгана (revoke=false, асуухгүй) —
           эрх буцаах бичилт tombstone-ыг хөндөх ёсгүй. Дүрэм `qaqcDropOp`-д. */
        onRemove={(g, _c, h) => act(h.gone ? qaqcDropOp(h.user) : qaqcCellOp(h.user, g, false))}
        addTitle={(r) => tr('{0} — чанарын хяналтад аккаунт нэмэх', r.label)}
        off={off}
        canOpen={() => { if (locked) { setErr(LOCK_MSG); return false; } return true; }}
      />
    </div>
  );
}
