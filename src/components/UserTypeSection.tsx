'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТЫН «ЭРХИЙН ТӨРӨЛ» ХЭСЭГ (2026-09-25).
 *
 * Төрөл + багц сонгоод «Төрлөөр тохируулах» — загварын бүх тохиргоо нэг дор
 * бичигдэнэ (`roleTypeApply.applyType`). Доорх хэсгүүд (урсгал, QAQC, …)
 * нь үр дүнг харуулж, шаардвал гараар нарийвчилна.
 *
 * ⚠️ Багцын анхдагч = одоогийн хуваарилалт, байхгүй бол НЭРНЭЭС
 *    («bagts5_1_…» → Багц 5.1) — CSV-ээр нэмсэн олон аккаунтыг нэг бүрчлэн
 *    сонгохгүйн тулд. Админ өөрчилж болно.
 * ⚠️ Өөр хэрэглэгч рүү шилжихэд эцэг нь `key`-ээр ШИНЭЭР mount хийнэ (төлөв цэвэр).
 * ⚠️ Ноорогтой (хадгалаагүй) үед ХААЛТТАЙ — хэрэгжүүлэлт нь эрхийн мөрийг
 *    (`setUser`) бичдэг тул ноороготой уралдана (урсгалын хэсгийн ⚠️-тэй ижил).
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Role } from '@/lib/services';
import { TYPE_ORDER, isTypeRole, tplOf, typeLabel } from '@/lib/roleTypes';
import { applyType, currentPkgs, pkgOptions, pkgsFromName } from '@/lib/roleTypeApply';
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
  const [pkgs, setPkgs] = useState<string[]>(() => {
    const c = currentPkgs(user);
    return c.length ? c : pkgsFromName(user);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const opts = pkgOptions();
  const all = type ? tplOf(type).scope === 'all' || type === 'super' : false;
  const off = disabled || busy;

  const run = async () => {
    if (!type || off) return;
    if (!window.confirm(tr('«{0}»-г «{1}» төрлөөр тохируулах уу? Загварт чеклээгүй хуваарилалт, эрх нь хасагдана.', user, typeLabel(type)))) return;
    setBusy(true); setErr(''); setMsg('');
    const r = await applyType(user, type, pkgs);
    setBusy(false);
    if (r.ok) setMsg(tr('Тохируулагдлаа.'));
    else setErr(r.errors.join('\n'));
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
          {TYPE_ORDER.map((r) => <option key={r} value={r}>{typeLabel(r)}</option>)}
        </select>
        <button type="button" className={s.saveBtn} disabled={off || !type} onClick={() => { void run(); }}>
          {busy ? tr('Тохируулж байна…') : tr('Төрлөөр тохируулах')}
        </button>
        {hardSuper && <span className={s.saveHint}>{tr('Кодонд бүртгэлтэй админ')}</span>}
      </div>
      {type && (all ? (
        <div className={s.capNote}>{tr('Энэ төрөл бүх багцыг хамарна.')}</div>
      ) : (
        <div className={s.chips}>
          {opts.map((p) => {
            const on = pkgs.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className={`${s.chip} ${on ? s.chipOn : ''}`}
                disabled={off}
                onClick={() => setPkgs((x) => (on ? x.filter((k) => k !== p.key) : [...x, p.key]))}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ))}
      {msg && <div className={s.capNote} role="status">{msg}</div>}
      {err && <div className={s.capErr} role="alert" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
    </section>
  );
}
