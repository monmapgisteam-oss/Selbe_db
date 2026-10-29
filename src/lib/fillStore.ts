'use client';

/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ»-ИЙН НООРОГИЙН ХАДГАЛАЛТЫН ДАВХАРГА (2026-10-26) — `useDraftSync` ЯГ өнөөгийн хэлбэрийн функцуудыг
 * (`readRemoteDraftAt` · `readRemoteDraft` · `saveRemoteDraft` · `clearRemoteDraft`) эндээс авна.
 */
import {
  clearRemoteDraft as blobClear, readRemoteDraft as blobRead, readRemoteDraftAt as blobReadAt, saveRemoteDraft as blobSave,
  REMOTE_MAX, type RemoteDraftRead, type RemoteSaveResult,
} from '@/lib/draftRemote';
import { perfClear, perfMigrate, perfRead, perfReadAt, perfSave, rowsReady, setFillFrame as setFrame } from '@/lib/draftRowsRemote';
import type { FrameRow } from '@/lib/draftRows';
import { t as tr } from '@/lib/i18nCore';

export { REMOTE_MAX };

/** Сүүлд шалгасан горим — `remoteMax` (синхрон) ба тест */
let lastMode: 'rows' | 'blob' | 'wait' = 'blob';
const mode = async (): Promise<'rows' | 'blob' | 'wait'> => {
  lastMode = (await rowsReady()).mode;
  return lastMode;
};

/** Алсын ноорогийн дээд хэмжээ — мөрийн горимд хязгааргүй (нүд мөрөнд), JSON горимд `REMOTE_MAX` */
export const remoteMax = (): number => (lastMode === 'rows' ? Number.POSITIVE_INFINITY : REMOTE_MAX);

/** Хуудасны жаазыг бүртгэнэ (код ↔ oid) — мөрийн горимд нүдийг `des_dugaar`-аар түлхүүрлэнэ */
export function setFillFrame(pkgKey: string, rows: readonly FrameRow[], bld: readonly string[]): void {
  setFrame(pkgKey, rows, bld);
}

export async function readRemoteDraftAt(pkgKey: string): Promise<number | null | undefined> {
  const m = await mode();
  if (m === 'blob') return blobReadAt(pkgKey);
  if (m === 'wait') return undefined;
  return perfReadAt(pkgKey);
}

export async function readRemoteDraft(pkgKey: string): Promise<RemoteDraftRead> {
  const m = await mode();
  if (m === 'blob') return blobRead(pkgKey);
  if (m === 'wait') return { ok: false, error: tr('ноорогийн хүснэгтийг шалгаж чадсангүй') };
  await perfMigrate(pkgKey).catch(() => false);
  return perfRead(pkgKey);
}

export async function saveRemoteDraft(
  pkgKey: string, at: number, payload: string, opt?: { expectAt?: number | null },
): Promise<RemoteSaveResult> {
  const m = await mode();
  if (m === 'blob') return blobSave(pkgKey, at, payload, opt);
  if (m === 'wait') return { ok: false, error: tr('ноорогийн хүснэгтийг шалгаж чадсангүй') };
  if (opt && opt.expectAt !== undefined) {
    const cur = await perfReadAt(pkgKey);
    if (cur === undefined) return { ok: false, error: tr('алсын ноорогийг шалгаж чадсангүй') };
    if (cur !== opt.expectAt) return { ok: false, conflict: true, error: tr('хооронд нь өөр хүн ноорог бичсэн — дахин уншиж нийлүүлнэ') };
  }
  return perfSave(pkgKey, payload);
}

export async function clearRemoteDraft(pkgKey: string): Promise<boolean> {
  const m = await mode();
  if (m === 'blob') return blobClear(pkgKey);
  if (m === 'wait') return false;
  return perfClear(pkgKey);
}
