'use client';

/**
 * ЭРХИЙН ХУУДАС БҮРИЙН ЗАСВАРЫН ХЭСЭГ — унасан бичилт ба устгагдсан аккаунтын үлдэгдэл
 * (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 *
 *   · ДАХИН ИЛГЭЭХ — ArcGIS бичилт нь унасан хуваарилалт (`failed` тэмдэг). Урьд нь «!» ба
 *     «Холболтоо шалгаад дахин оролдоно уу» л байв — дахин оролдох зам нь багцыг хасаад дахин
 *     нэмэх (эрх буцаах асуулттай). Мөр бүрд «Дахин илгээх», дээр нь «Бүгдийг дахин илгээх»
 *     (`aclOps.retryOp` — локалд байгаа, админы аль хэдийн хийсэн өөрчлөлтийг л илгээнэ).
 *   · УСТГАГДСАН АККАУНТЫН ҮЛДЭГДЭЛ — порталд алга аккаунтын энэ хуудасны хуваарилалтын мөр ба
 *     `__cap__:` эрх (`aclOps.goneRightsOf`). Энгийн эрхийн хуудас (Зөвшөөрөл · Санхүү · Газар)
 *     порталд БАЙГАА аккаунтыг л жагсаадаг тул тэдний эрх урьд нь ХАРАГДАХ ГАЗАРГҮЙ байв.
 *     Нэг товшилтоор цэвэрлэнэ (`goneCleanupOp`); «Бүгдийг цэвэрлэх» нэг удаа асууна.
 *
 * ⚠️ Бүх ACL уншигдтал (`allAclReady`) юу ч харуулахгүй — уншигдаагүй эх сурвалжийн `[]`-ээс
 *    худал «цэвэр» эсвэл худал «үлдэгдэл» гарна. Түгжээ нь `runOp` дарах агшинд ч дахин шалгагдана.
 * ⚠️ Энгийн эрхийн бичилт унасныг (`__cap__:` dirty) «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»
 *    хариуцна — энд давхардуулахгүй.
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  allAclReady, failedUsersOf, goneCleanupOp, goneRightsOf, retryOp, type AclOp, type RepairSys,
} from '@/lib/aclOps';
import { useAclRunner } from './useAclRunner';
import { PANE_CAPS, type ErhPane } from './capText';
import { capLabelShort } from './erhLabels';
import s from './guitsetgel.module.css';

/** Хуудас → хуваарилалтын систем (`null` — аккаунтаар олгодог энгийн эрхийн хуудас) */
export const repairSysOf = (pane: ErhPane): RepairSys | null => {
  if (pane === 'guits') return 'flow';
  if (pane === 'qaqc' || pane === 'huvaari' || pane === 'ajil' || pane === 'obyem' || pane === 'chanar' || pane === 'butets') return pane;
  return null;
};

export function AclRepairNote({ pane }: { pane: ErhPane }) {
  const { busy, err, run } = useAclRunner();
  const [bulk, setBulk] = useState(false);
  if (!allAclReady()) return null;

  const sys = repairSysOf(pane);
  const caps = PANE_CAPS[pane];
  const failed = sys ? failedUsersOf(sys) : [];
  const gone = goneRightsOf(sys, caps);
  if (!failed.length && !gone.length && !err) return null;
  const off = busy || bulk;

  const all = async (ops: (() => AclOp)[]) => {
    setBulk(true);
    try {
      for (const op of ops) await run(op());
    } finally {
      setBulk(false);
    }
  };

  return (
    <div className={s.aclWrap}>
      {failed.length > 0 && sys && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т хадгалагдаагүй хуваарилалт (бичилт унасан) — энэ browser-т л байна:')}
          {' '}
          {failed.map((u) => (
            <span key={u}>
              <b>{u}</b>
              {' '}
              <button type="button" className={s.aclPkg} disabled={off}
                title={tr('Энэ аккаунтын хуваарилалтыг ArcGIS руу дахин илгээнэ')}
                onClick={() => { void run(retryOp(sys, u)); }}>
                {tr('Дахин илгээх')}
              </button>
              {' '}
            </span>
          ))}
          {failed.length > 1 && (
            <button type="button" className={s.aclPkg} disabled={off}
              onClick={() => { void all(failed.map((u) => () => retryOp(sys, u))); }}>
              {tr('Бүгдийг дахин илгээх ({0})', String(failed.length))}
            </button>
          )}
        </div>
      )}
      {gone.length > 0 && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ Устгагдсан аккаунтын үлдсэн эрх — тэд нэвтэрч чадахгүй ч ArcGIS дээр мөр нь үлдсэн:')}
          {' '}
          {gone.map((g) => (
            <span key={g.user}>
              <b>{g.user}</b>
              {' ('}
              {[g.row ? tr('хуваарилалт') : '', ...g.caps.map(capLabelShort)].filter(Boolean).join(', ')}
              {') '}
              <button type="button" className={s.aclPkg} disabled={off}
                title={tr('Энэ хуудасны хуваарилалт ба эрхийг нь арилгана')}
                onClick={() => { void run(goneCleanupOp(sys, caps, g.user)); }}>
                {tr('Цэвэрлэх')}
              </button>
              {' '}
            </span>
          ))}
          {gone.length > 1 && (
            <button type="button" className={s.aclPkg} disabled={off}
              onClick={() => {
                if (!window.confirm(tr('Устгагдсан {0} аккаунтын энэ хуудасны үлдсэн хуваарилалт ба эрхийг арилгах уу? {1}',
                  String(gone.length), gone.map((g) => g.user).join(', ')))) return;
                void all(gone.map((g) => () => goneCleanupOp(sys, caps, g.user)));
              }}>
              {tr('Бүгдийг цэвэрлэх ({0})', String(gone.length))}
            </button>
          )}
        </div>
      )}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
    </div>
  );
}
