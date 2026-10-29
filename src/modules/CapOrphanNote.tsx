'use client';

/**
 * ӨНЧИН / ДУТУУ ЭРХИЙН АНХААРУУЛГА — үйлдлийн хуудас бүрийн дээд хэсэгт (2026-09-30).
 */

import { t as tr } from '@/lib/i18nCore';
import type { CapKey } from '@/lib/caps';
import { aclPendingFor, allAclReady, capDirectOp, liveErhSource, regrantOp } from '@/lib/aclOps';
import { missingCaps, orphanCaps, userErh } from '@/lib/erhOverview';
import { useAclRunner } from './useAclRunner';
import s from './guitsetgel.module.css';

export function CapOrphanNote({ cap }: { cap: CapKey }) {
  const { busy, err, run } = useAclRunner();
  if (!allAclReady()) return null;
  const src = liveErhSource();
  const orphans: string[] = [];
  const missing: string[] = [];
  for (const u of src.users) {
    if (aclPendingFor(u)) continue;
    const e = userErh(src, u);
    if (orphanCaps(e).includes(cap)) orphans.push(u);
    if (missingCaps(e).includes(cap)) missing.push(u);
  }
  if (!orphans.length && !missing.length && !err) return null;

  return (
    <div className={s.aclWrap}>
      {orphans.length > 0 && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ Хуваарилалтгүй (өнчин) эрх — асаалттай атлаа энэ хуудсанд багц оноогоогүй:')}
          {' '}
          {orphans.map((u) => (
            <span key={u}>
              <b>{u}</b>
              {' '}
              <button
                type="button"
                className={s.aclPkg}
                disabled={busy}
                title={tr('Энэ эрхийг хасна — хуваарилалт байхгүй')}
                onClick={() => { void run(capDirectOp(u, cap, false)); }}
              >
                {tr('хасах')}
              </button>
              {' '}
            </span>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ Багц оноосон атлаа эрх олгогдоогүй (бичилт унасан):')}
          {' '}
          {missing.map((u) => (
            <span key={u}>
              <b>{u}</b>
              {' '}
              <button
                type="button"
                className={s.aclPkg}
                disabled={busy}
                title={tr('Хуваарилалтыг хэвээр нь дахин хадгалж эрхийг олгоно')}
                onClick={() => { void run(regrantOp(u, [cap])); }}
              >
                {tr('Дахин олгох')}
              </button>
              {' '}
            </span>
          ))}
        </div>
      )}
      {err && <div className={s.aclErr} role="alert">{err}</div>}
    </div>
  );
}
