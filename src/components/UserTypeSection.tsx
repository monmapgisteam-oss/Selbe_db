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
 * ⚠️ 2026-09-25: анхдагчийг ЗӨВХӨН бүх ACL уншигдсаны дараа (`allAclReady`)
 *    тооцно — урьд нь mount агшинд `[]` жагсаалтаас нэрээр таамагласан багц
 *    бодит хуваарилалтыг орлож, «Төрлөөр тохируулах» түүнийг хумьдаг байв.
 *    Админ чип дарах хүртэл анхдагч нь бэлэн болох бүрд дахин бодогдоно.
 * ⚠️ 2026-09-25: чип ХОЁР бүлэг — бөглөх хуудасны бүлэг ба дэд бүтцийн багц
 *    (`roleTypeApply`-ийн толгойн ⚠️: `bagtsKey` давхцлаар бие биедээ тэлэхгүй).
 * ⚠️ Өөр хэрэглэгч рүү шилжихэд эцэг нь `key`-ээр ШИНЭЭР mount хийнэ (төлөв цэвэр).
 * ⚠️ Ноорогтой (хадгалаагүй) үед ХААЛТТАЙ — хэрэгжүүлэлт нь эрхийн мөрийг
 *    (`setUser`) бичдэг тул ноороготой уралдана (урсгалын хэсгийн ⚠️-тэй ижил).
 */

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import type { Role } from '@/lib/services';
import { allAclReady } from '@/lib/aclOps';
import { TYPE_ORDER, isTypeRole, tplOf, typeLabel } from '@/lib/roleTypes';
import {
  applyType, currentSel, defaultSel, pkgOptions, typeApplyBusy, type PkgKind, type PkgSel,
} from '@/lib/roleTypeApply';
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
  /** Админы сонголт — `null` бол анхдагч (ACL бэлэн болмогц бодогдоно) */
  const [picked, setPicked] = useState<PkgSel | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const ready = allAclReady();
  const sel: PkgSel | null = picked ?? (ready ? defaultSel(user) : null);
  const all = type ? tplOf(type).scope === 'all' || type === 'super' : false;
  const off = disabled || busy || !ready || typeApplyBusy(user);

  const toggle = (kind: PkgKind, key: string) => {
    if (!sel) return;
    const cur = sel[kind];
    setPicked({ ...sel, [kind]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
    setMsg('');
  };

  const run = async () => {
    if (!type || off || !sel) return;
    if (!window.confirm(tr('«{0}»-г «{1}» төрлөөр тохируулах уу? Загварт чеклээгүй хуваарилалт, эрх нь хасагдана.', user, typeLabel(type)))) return;
    setBusy(true); setErr(''); setMsg('');
    /* ⚠️ 2026-09-25: try/finally — шидвэл товч үүрд «Тохируулж байна…» дээр үлдэхгүй */
    try {
      const r = await applyType(user, type, sel);
      if (r.ok) setMsg(tr('Тохируулагдлаа.'));
      else setErr(r.errors.join('\n'));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  /* Хадгалсан ч жагсаалтад байхгүй утгыг чипээр харуулна (`pkgOptions`-ийн ⚠️) */
  const cur = ready ? currentSel(user) : { sheet: [], butets: [] };
  const groups: { kind: PkgKind; title: string }[] = [
    { kind: 'sheet', title: tr('Бөглөх хуудасны багц (урсгал · QAQC · хуваарь · обьём · нэмэлт ажил · чанарын баримт)') },
    { kind: 'butets', title: tr('Дэд бүтцийн багц') },
  ];

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
        <button type="button" className={s.saveBtn} disabled={off || !type || !sel} onClick={() => { void run(); }}>
          {busy ? tr('Тохируулж байна…') : tr('Төрлөөр тохируулах')}
        </button>
        {hardSuper && <span className={s.saveHint}>{tr('Кодонд бүртгэлтэй админ')}</span>}
      </div>
      {type && (all ? (
        <div className={s.capNote}>{tr('Энэ төрөл бүх багцыг хамарна.')}</div>
      ) : sel && groups.map((g) => (
        <div key={g.kind}>
          <div className={t.pkgKind}>{g.title}</div>
          <div className={s.chips} role="group" aria-label={g.title}>
            {pkgOptions(g.kind, cur[g.kind]).map((p) => {
              const on = sel[g.kind].includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`${s.chip} ${on ? s.chipOn : ''}`}
                  disabled={off}
                  aria-pressed={on}
                  onClick={() => toggle(g.kind, p.key)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )))}
      {msg && <div className={s.capNote} role="status">{msg}</div>}
      {err && <div className={s.capErr} role="alert" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
    </section>
  );
}
