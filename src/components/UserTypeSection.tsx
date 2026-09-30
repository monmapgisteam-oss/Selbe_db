'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТЫН «ЭРХИЙН ТӨРӨЛ» ХЭСЭГ (2026-09-25 · 2026-09-30).
 *
 * Төрөл сонгоод «Төрлөөр тохируулах» — загварын ХАРАХ тохиргоо (харагдац ·
 * ТЭЗҮ-БОНУ · үүрэг/нүүр цонх) нэг дор бичигдэнэ (`roleTypeApply.applyType`).
 *
 * ⚠️ 2026-09-30 (хэрэглэгчийн шийдвэр): багцын чип ХАСАГДСАН — загвар засах эрх
 *    агуулахгүй тул багц сонгох зүйлгүй (`roleTypes.ts`-ийн ⚠️). Засах эрх нь
 *    админ порталын тухайн хуудсанд багцаар олгогдоно.
 * ⚠️ Өөр хэрэглэгч рүү шилжихэд эцэг нь `key`-ээр ШИНЭЭР mount хийнэ (төлөв цэвэр).
 * ⚠️ Ноорогтой (хадгалаагүй) үед ХААЛТТАЙ — хэрэгжүүлэлт нь эрхийн мөрийг
 *    (`setUser`) бичдэг тул ноороготой уралдана.
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Role } from '@/lib/services';
import { remoteReady } from '@/lib/permissions';
import { TYPE_ORDER, isTypeRole, typeLabel } from '@/lib/roleTypes';
import { applyType, typeApplyBusy } from '@/lib/roleTypeApply';
import s from './userAdmin.module.css';
import t from '@/modules/erhTypes.module.css';

export function UserTypeSection({
  user, role, disabled, hardSuper,
}: {
  user: string;
  role: Role | null;
  disabled: boolean;
  hardSuper: boolean;
}) {
  const [type, setType] = useState<Role | ''>(isTypeRole(role) ? role : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const off = disabled || busy || !remoteReady() || typeApplyBusy(user);

  const run = async () => {
    if (!type || off) return;
    if (!window.confirm(tr('«{0}»-г «{1}» төрлөөр тохируулах уу? Харагдац ба ТЭЗҮ-БОНУ нь загварынхаар солигдоно; засах эрх хөндөгдөхгүй.', user, typeLabel(type)))) return;
    setBusy(true); setErr(''); setMsg('');
    /* ⚠️ 2026-09-25: try/finally — шидвэл товч үүрд «Тохируулж байна…» дээр үлдэхгүй */
    try {
      const r = await applyType(user, type);
      if (r.ok) setMsg(tr('Тохируулагдлаа.'));
      else setErr(r.errors.join('\n'));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.cardSec} id="erh-sec-type">
      <div className={s.topicHead}>
        <span className={s.topicHeadLabel}>{tr('Эрхийн төрөл')}</span>
        <span className={s.saveHint}>{tr('шууд хадгалагдана')}</span>
      </div>
      <div className={t.typeRow}>
        <select
          id={`ut-type-${user}`}
          className={s.cardSelect}
          value={type}
          disabled={off || hardSuper}
          aria-label={tr('Эрхийн төрөл')}
          onChange={(e) => { setType(e.target.value as Role | ''); setMsg(''); }}
        >
          <option value="">{tr('— төрөл сонгох —')}</option>
          {/* ⚠️ 2026-09-25: Super төрөл зөвхөн кодонд бүртгэлтэй админд (`applyType`-ийн ⚠️) */}
          {TYPE_ORDER.map((r) => (
            <option key={r} value={r} disabled={r === 'super' && !hardSuper}>{typeLabel(r)}</option>
          ))}
        </select>
        <button type="button" className={s.saveBtn} disabled={off || !type} onClick={() => { void run(); }}>
          {busy ? tr('Тохируулж байна…') : tr('Төрлөөр тохируулах')}
        </button>
        {hardSuper && <span className={s.saveHint}>{tr('Кодонд бүртгэлтэй админ')}</span>}
      </div>
      <div className={s.capNote}>{tr('Загвар зөвхөн харагдац · ТЭЗҮ-БОНУ · нүүр цонхыг тохируулна — засах эрх тус тусын хуудаснаас.')}</div>
      {msg && <div className={s.capNote} role="status">{msg}</div>}
      {err && <div className={s.capErr} role="alert" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
    </section>
  );
}
