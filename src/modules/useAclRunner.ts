'use client';

/**
 * ЭРХИЙН OP ГҮЙЦЭТГЭХ HOOK — `busy` · `err` · `run` (2026-09-25).
 *
 * ⚠️ НЭГ БҮРЭЛДЭХҮҮНД НЭГ ТҮГЖЭЭ: бичилт явж байхад дахин дарахаас
 *    хамгаална (2026-09-15-ны хэрэглээний аудит). Хоёр бичилт зэрэгцэн
 *    явбал хоёр дахь нь ХУУЧИН мөрөөс `grants`-ыг бүтээж, эхний нэмэлт
 *    ЧИМЭЭГҮЙ алга болдог байв. `busyRef` — `setBusy` дараагийн рендер хүртэл
 *    хүлээдэг тул нэг рендер дотор хоёр товшилтыг ч барина.
 */

import { useRef, useState } from 'react';
import { allAclReady, runOp, type AclOp } from '@/lib/aclOps';

export function useAclRunner(ready: () => boolean = allAclReady) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const busyRef = useRef(false);

  const run = async (op: AclOp): Promise<boolean> => {
    if (busyRef.current || !op) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      return await runOp(op, setErr, ready);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { busy, err, setErr, run };
}
