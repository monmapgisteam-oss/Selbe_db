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
import { roleForUser, tableSuperUsers } from '@/lib/services';
import { currentUser } from '@/lib/who';
import type { CapKey } from '@/lib/caps';
import { allAclReady, liveErhSource } from '@/lib/aclOps';
import { removeAssign, stageOfUser } from '@/lib/guitsetgelAcl';
import { userErh } from '@/lib/erhOverview';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { capLabelShort } from '@/modules/erhLabels';
import { paneLabel } from '@/modules/capText';
import { TYPE_ORDER, isTypeRole, typeLabel } from '@/lib/roleTypes';
import { applyType, typeApplyBusy } from '@/lib/roleTypeApply';
import { askConfirm } from '@/lib/confirm';
import { userError } from '@/components/ui';
import s from './userAdmin.module.css';
import t from '@/modules/erhTypes.module.css';

/**
 * SUPER ОЛГОХ АСУУЛТ — үр дагаврыг нэрлэнэ (⚠️ 2026-10-23, UX аудит A1). Мөрийн үүргийн сонгогч (`UserAdmin.applyRole`)
 * ба картын «Төрлөөр тохируулах» ХОЁУЛАА энэ текстийг асууна. Урьд нь мөрөөс асуулгүй, картаас «засах эрх
 * хөндөгдөхгүй» гэсэн ХУДАЛ текстээр асуудаг байв — super нь бүх засах эрхийг авдаг (`caps.capsOf`).
 * ⚠️ Функц — текстийг дуудах агшинд (`tr`).
 */
/* ⚠️ 2026-10-23 (хэрэглэгч: «бүгдийг зас»): гүйцэтгэлийн урсгалд super-ийн эрх ба хязгаарыг ил хэлнэ — бүх шатанд шийдвэр
   гаргана, гэхдээ өөрийгөө батлах дүрэм (`hyanaltStore.authz` → `selfApprovalDeny`) super-т ч үйлчилнэ. */
export const superGrantMsg = (user: string): string =>
  tr('«{0}»-д Админ (super) эрх олгох уу? Тэр БҮХ хуудас, БҮХ засах эрхтэй болно — санхүүгийн мөр устгах, зөвшөөрөл, бусад хэрэглэгчийн эрх удирдах, системийг түр хаах зэрэг. Зөвхөн итгэмжлэгдсэн админд олгоно уу.', user)
  + ' ' + tr('Гүйцэтгэлийн бүх шатанд шийдвэр гаргах боломжтой (өөрийгөө батлах дүрэм үйлчилнэ).');

/**
 * SUPER-ИЙН ДООШЛУУЛСНЫ ДАРАА ҮЛДЭХ ЭРХ — нэрээр (⚠️ 2026-10-23, хэрэглэгч: «бүгдийг зас»). Хадгалагдсан засах эрх
 * (`capsStored` — `aclOps.liveErhSource`), урсгалын шат, багцын хуваарилалтын хуудсууд. Урьд нь асуулт «зөвхөн тусад нь
 * олгосон эрх үлдэнэ» гэж ерөнхийлдөг тул админ юу үлдэхийг мэддэггүй байв. ACL уншигдаагүй бол «шалгаж чадсангүй».
 */
export function superRemainText(user: string): string {
  if (!allAclReady()) return tr('Үлдэх эрхийг шалгаж чадсангүй — эрхийн хүснэгт уншигдаагүй.');
  const e = userErh(liveErhSource(), user);
  const parts: string[] = [];
  if (e.caps.length) parts.push(tr('засах эрх: {0}', (e.caps as CapKey[]).map(capLabelShort).join(', ')));
  if (e.flow) parts.push(tr('гүйцэтгэлийн шат: {0}{1}', STAGE_LABEL[e.flow.stage], e.flow.viewOnly ? ` (${tr('зөвхөн харна')})` : ''));
  const panes = ([
    ['huvaari', e.huvaari.length], ['obyem', e.obyem.length], ['ajil', e.ajil.length],
    ['chanar', e.chanar.length], ['butets', e.butets.length], ['qaqc', e.qaqcAssigned ? 1 : 0],
  ] as const).filter(([, n]) => n > 0).map(([p]) => paneLabel(p));
  if (panes.length) parts.push(tr('багцын хуваарилалт: {0}', panes.join(', ')));
  return parts.length
    ? tr('Доошлуулсны дараа үлдэх эрх — {0}.', parts.join('; '))
    : tr('Доошлуулсны дараа засах эрх, шат, хуваарилалт ҮЛДЭХГҮЙ — зөвхөн шинэ төрлийн харагдац.');
}

/**
 * СҮҮЛЧИЙН АДМИН АНХААРУУЛГА (⚠️ 2026-10-23): эдгээр super-ийг хасвал (доошлуулах · устгах) таниас ӨӨР хүснэгтийн super
 * үлдэхгүй бол текст, үгүй бол `''`. Та түгжигдвэл (сүлжээ, нууц үг) сэргээх хүн алга — хориглохгүй, зөвхөн хэлнэ.
 */
export function lastSuperWarn(removing: readonly string[]): string {
  const me = (currentUser() ?? '').trim().toLowerCase();
  const drop = new Set(removing.map((u) => u.trim().toLowerCase()));
  const sup = tableSuperUsers() ?? [];
  if (![...drop].some((u) => sup.includes(u))) return '';
  const left = sup.filter((u) => !drop.has(u) && u !== me);
  return left.length ? '' : tr('⚠️ Үүний дараа таниас өөр админ (super) үлдэхгүй — та нэвтэрч чадахгүй болбол эрх сэргээх хүн алга. Өөр нэг итгэмжлэгдсэн админ үлдээхийг зөвлөнө.');
}

/** SUPER ДООШЛУУЛАХ АСУУЛТ — үлдэх эрх ба сүүлчийн админ анхааруулгатай (⚠️ 2026-10-23) */
export const superDemoteMsg = (user: string, typeName: string): string =>
  [
    tr('«{0}»-ийн Админ (super) эрхийг хасаж «{1}» төрөлтэй болгох уу? Бүх хуудас, админ портал ба шууд олгоогүй засах эрх хаагдана.', user, typeName),
    superRemainText(user),
    lastSuperWarn([user]),
  ].filter(Boolean).join('\n\n');

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
    /* ⚠️ 2026-10-23 (UX аудит A1 · X1): `askConfirm`; «засах эрх хөндөгдөхгүй» нь SUPER олгох/хасахад ХУДАЛ байв —
       super бүх засах эрхийг авдаг, хасахад тэр бүгд алга болно. Тэр хоёр тохиолдолд үр дагаврыг нэрлэж асууна. */
    const toSuper = type === 'super' && role !== 'super';
    const fromSuper = role === 'super' && type !== 'super';
    const q = toSuper
      ? superGrantMsg(user)
      : fromSuper
        /* ⚠️ 2026-10-23: үлдэх эрхийг нэрээр (`superDemoteMsg`) */
        ? superDemoteMsg(user, typeLabel(type))
        : tr('«{0}»-г «{1}» төрлөөр тохируулах уу? Харагдац ба ТЭЗҮ-БОНУ нь загварынхаар солигдоно; засах эрх хөндөгдөхгүй.', user, typeLabel(type));
    /* ⚠️ 2026-10-23: «Ерөнхий захирал» зөвхөн харна — урсгалын томилгоотой бол ХАСАГДАХЫГ нэрлэж асууна (`applyType` томилгоотой хүнд татгалздаг) */
    const flowSt = type === 'zahiral' ? stageOfUser(user) : null;
    const q2 = flowSt
      ? q + '\n\n' + tr('Энэ хэрэглэгч гүйцэтгэлийн урсгалын «{0}» шатанд томилгоотой — Ерөнхий захирал бөглөж, батлахгүй тул томилгоо ХАСАГДАНА.', STAGE_LABEL[flowSt])
      : q;
    if (!(await askConfirm(q2, toSuper || fromSuper || flowSt ? { danger: true, ok: toSuper ? tr('Админ эрх олгох') : fromSuper ? tr('Админ эрх хасах') : tr('Тохируулах') } : { ok: tr('Тохируулах') }))) return;
    setBusy(true); setErr(''); setMsg('');
    /* ⚠️ 2026-09-25: try/finally — шидвэл товч үүрд «Тохируулж байна…» дээр үлдэхгүй */
    try {
      /* ⚠️ 2026-10-23: томилгоог ЭНД хасна (`applyType` хуваарилалт бичихгүй — 2026-09-30) — `revoke=false`: дараагийн
         `applyType`-ийн `setUser` төрөл/харагдацыг бичнэ, буцаалт (`revokeFlowAccess`) түүнтэй уралдана. Унавал төрөл солихгүй. */
      if (flowSt && !(await removeAssign(user, flowSt, false).sync)) {
        setErr(tr('Урсгалын томилгоо хасагдсангүй (ArcGIS) — төрөл солигдсонгүй, дахин оролдоно уу.'));
        return;
      }
      const r = await applyType(user, type);
      if (r.ok) setMsg(tr('Тохируулагдлаа.'));
      else setErr(r.errors.join('\n'));
    } catch (e) {
      /* ⚠️ 2026-10-23 (UX аудит X3): түүхий `String(e)` («TypeError: …») биш — ойлгомжтой текст */
      setErr(userError(e));
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
          {/* ⚠️ 2026-10-21: Super төрөл — нэвтэрсэн админ ӨӨРӨӨ super бол сонгогдоно (эрхийн тохиргооноос олгоно,
              `applyType`-ийн дүрэм); `hardSuper` = ӨӨРИЙН мөр (өөрийгөө доошлуулахгүй) */}
          {TYPE_ORDER.map((r) => (
            <option key={r} value={r} disabled={r === 'super' && roleForUser(currentUser()) !== 'super'}>{typeLabel(r)}</option>
          ))}
        </select>
        <button type="button" className={s.saveBtn} disabled={off || !type} onClick={() => { void run(); }}>
          {busy ? tr('Тохируулж байна…') : tr('Төрлөөр тохируулах')}
        </button>
        {hardSuper && <span className={s.saveHint}>{tr('Өөрийн super эрх — өөр super админ өөрчилнө')}</span>}
      </div>
      <div className={s.capNote}>{tr('Загвар зөвхөн харагдац · ТЭЗҮ-БОНУ · нүүр цонхыг тохируулна — засах эрх тус тусын хуудаснаас.')}</div>
      {msg && <div className={s.capNote} role="status">{msg}</div>}
      {err && <div className={s.capErr} role="alert" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
    </section>
  );
}
