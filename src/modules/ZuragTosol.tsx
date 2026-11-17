'use client';

/**
 * ТЭЗҮ · АЖЛЫН ЗУРАГ ТӨСӨЛ — «Зургийн бүртгэл» (хүснэгт 234, `ZuragBurtgel`).
 *
 * 2026-11-16 (хэрэглэгч: «салангид байгаа ТЭЗҮ-г хасаад … зураг төслийн ТЭЗҮ-г ТТБ рүү үр дүнг оруулдаг болго»): тусдаа
 * «ТЭЗҮ» таб (182-ын ТЭЗҮ · зураг төслийн мөрийн огноо, хувийг гараар засдаг хүснэгт) хасагдав. Баримтыг ганц газар —
 * бүртгэлд хөтөлнө; «Төсөл төлөвлөгөө биелэлт»-д үр дүн нь автоматаар орно (`zuragBurtgel.gereeOverride`).
 * Мөнгөн дүн, огноо «Төсөл төлөвлөгөө биелэлт»-д хэвээр.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { hasCap, subscribeCaps, type CapKey } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { ZuragBurtgel } from './ZuragBurtgel';
import s from './zuragTosol.module.css';

/** Засах эрх */
const ZURAG_CAP: CapKey = 'zuragEdit';

export function ZuragTosol() {
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио
  const canEdit = useMemo(() => hasCap(user?.username, ZURAG_CAP), [user, capN]);
  /* ТЭЗҮ (бүртгэлийн 001 бүлэг) ба зураг төсөл тусдаа таб — хоёулаа «Зургийн бүртгэл»-ээс */
  const [view, setView] = useState<'tezu' | 'zurag'>('tezu');
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <h1 className={s.h1}>{tr('ТЭЗҮ · Ажлын зураг төсөл')}</h1>
        <p className={s.sub}>
          {tr('Зургийн бүртгэл — ТЭЗҮ, зураг төслийн баримт бүр. «Төсөл төлөвлөгөө биелэлт»-д үр дүн нь автоматаар орно.')}
        </p>
        <div className={s.seg} role="tablist" aria-label={tr('Харагдац')}>
          {([['tezu', tr('ТЭЗҮ')], ['zurag', tr('Зургийн бүртгэл')]] as ['tezu' | 'zurag', string][]).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`${s.segB} ${view === k ? s.segOn : ''}`} onClick={() => setView(k)}>{t}</button>
          ))}
        </div>
      </header>
      <ZuragBurtgel canEdit={canEdit} scope={view} />
    </div>
  );
}
