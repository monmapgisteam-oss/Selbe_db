'use client';

/**
 * ӨНЧИН / ДУТУУ ЭРХИЙН АНХААРУУЛГА — үйлдлийн хуудас бүрийн дээд хэсэгт (2026-09-30).
 *
 * ⚠️ ЯАГААД: урьд нь хэрэглэгчийн картын «Нэмэлт эрх» блокт «⚠️ Хуваарилалтгүй
 *    эрх · хасах» ба «эрх олгогдоогүй — хуваарилалтыг дахин хадгална уу» гэж
 *    зурагддаг байв. Тэр блок хасагдсан тул анхааруулга нь тухайн ЭРХИЙН
 *    хуудсанд (`UserRights`-ийн 2026-09-25-ны ⚠️ дүрэм хэвээр):
 *      · ӨНЧИН — асаалттай атлаа түүн рүү заадаг хуваарилалт алга → ИЛ «хасах»
 *        (`aclOps.capDirectOp(on=false)`, баталгаажуулалттай). Автоматаар ХЭЗЭЭ Ч
 *        хасахгүй — админы гараар олгосон хуучин эрх байж болно.
 *      · ДУТУУ — хуваарилалт бий атлаа эрх алга (эрх олголт унасан) → «Дахин олгох»
 *        (2026-10-01, `aclOps.regrantOp` — хуваарилалтыг хэвээр нь дахин хадгалж `syncCaps`).
 * ⚠️ Бүх ACL уншигдтал (`allAclReady`) юу ч харуулахгүй — `[]` жагсаалтаас ХУДАЛ
 *    өнчин гарна. Бичилт явагдаж буй хүнийг (`aclPendingFor`) алгасна — тэр
 *    хооронд эрх нь `sync`-ийн дараа л ирдэг тул тэмдэг худал.
 * ⚠️ Super-т өнчин ХЭЗЭЭ Ч үгүй (`erhOverview.orphanCaps`).
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
      {/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): «Дахин олгох» — урьд нь «багцыг хасаад дахин
          нэмнэ үү» гэсэн заавар л байв (хасах нь эрх буцаах асуулттай, гацааны анхааруулга өдөөдөг).
          `regrantOp` хуваарилалтыг ӨӨРЧЛӨХГҮЙ, зөвхөн эрхийг дахин олгоно. */}
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
