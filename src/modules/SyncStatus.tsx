'use client';

/**
 * СИНКИЙН ТӨЛӨВ (2026-11-19, аудит: «синк хэзээ ажилласан, амжилттай эсэх харагддаггүй»). Энэ хөтөч дээр сүүлд ажилласан
 * 3 автомат синкийн агшин ба алдаа — «Санхүүжилт» хуудасны дээд талд. Синк зөвхөн санхүүгийн эрхтэй хүний хөтөч дээр
 * ажилладаг тул бусдад «энэ хөтөч дээр ажиллаагүй» гэж харагдана.
 */
import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { hoSyncLast } from '@/lib/hoSync/sync';
import { planSyncLast, planSyncLastAt, planSyncWarn } from '@/lib/projectPlanSync';
import { publicSyncLast, publicSyncDisabled } from '@/lib/publicSync/sync';

const hm = (ms: number): string => new Date(ms).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ulaanbaatar' });

type Line = { name: string; at: number | null; error: string | null };

function read(): Line[] {
  const ho = hoSyncLast();
  const pl = planSyncLast();
  const pu = publicSyncLast();
  const puOff = publicSyncDisabled();
  return [
    { name: tr('Төлбөрийн акт ↔ Төсөл төлөвлөгөө биелэлт'), at: ho?.at ?? null, error: ho?.error && ho.error !== 'no-cap' ? ho.error : null },
    { name: tr('Гүйцэтгэлийн хувь, огноо'), at: planSyncLastAt() || null, error: pl ? (pl.ok ? planSyncWarn(pl) : pl.error) : null },
    { name: tr('Нийтийн вэб'), at: pu?.at ?? null, error: puOff ?? (pu?.failed.length ? pu.failed.join(', ') : null) },
  ];
}

export function SyncStatus() {
  const [lines, setLines] = useState<Line[]>(() => read());
  useEffect(() => {
    const t = setInterval(() => setLines(read()), 5000);
    return () => clearInterval(t);
  }, []);
  const bad = lines.some((l) => l.error);
  return (
    <details style={{ fontSize: 12, color: bad ? 'var(--bad-ink)' : 'var(--ink-3)', margin: '4px 0' }}>
      <summary>{bad ? tr('Синкийн төлөв — алдаатай') : tr('Синкийн төлөв')}</summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {lines.map((l) => (
          <li key={l.name}>
            {l.name}: {l.at == null ? tr('энэ хөтөч дээр ажиллаагүй') : tr('сүүлд {0}', hm(l.at))}
            {l.error && <> — <b>{l.error}</b></>}
          </li>
        ))}
      </ul>
    </details>
  );
}
