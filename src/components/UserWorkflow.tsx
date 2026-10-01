'use client';

/**
 * ХЭРЭГЛЭГЧИЙН КАРТЫН «УРСГАЛТАЙ ХУУДАС» ХЭСЭГ — ЗӨВХӨН ХАРУУЛНА (2026-10-01).
 *
 * ⚠️ ЯАГААД («хэрэглэгч: бүгдийг зас»): урсгалтай 6 харагдац (Гүйцэтгэл · Хуваарь · Хуваарь
 *    батлах · Нэмэлт ажил батлах · Чанарын баримт · Чанар (QAQC)) картын унтраалгаас 2026-09-30-нд
 *    хасагдсан ч «яагаад нээлттэй/хаалттай вэ» гэдэг нь картад ХАРАГДАХГҮЙ байв. Одоо мөр бүрд:
 *    төлөв · эх сурвалж («Хуваарийн эрх · Зохиогч · Багц 3.1») · тэр хуудас руу холбоос.
 * ⚠️ УНТРААЛГАГҮЙ: хуудас нь ЗӨВХӨН хуваарилалтаар нээгдэнэ (`permissions.workflowViewsOf`) —
 *    энд бичих зам нь ганцхан «Дахин олгох» (хуваарилалт бий атлаа эрх олгогдоогүй үед —
 *    `aclOps.regrantOp`, хуваарилалтыг ӨӨРЧЛӨХГҮЙ).
 * ⚠️ Эх сурвалжийн дүрэм `workflowSources.workflowRows`-д (цэвэр, тесттэй) — энд давтахгүй.
 * ⚠️ Бүх ACL уншигдтал (`allAclReady`) жагсаалт `[]` тул ХУДАЛ «хаалттай» гэхгүйн тулд түгжээ
 *    зурвас л харуулна. Бичилт явагдаж буй хүнд (`aclPendingFor`) «эрх олгогдоогүй» тэмдгийг
 *    түр нууна (`CapOrphanNote`-ийн ижил дүрэм — эрх нь `sync`-ийн ДАРАА ирдэг).
 */

import { t as tr } from '@/lib/i18nCore';
import { VIEWS } from '@/lib/services';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import type { Stage } from '@/lib/hyanalt';
import { aclPendingFor, allAclReady, liveErhSource, lockMsg, regrantOp } from '@/lib/aclOps';
import { userErh } from '@/lib/erhOverview';
import { ungrantedCaps, workflowRows, type WfSource } from '@/lib/workflowSources';
import { useAclRunner } from '@/modules/useAclRunner';
import { paneLabel, panesOfView, paneOfSys, type ErhPane } from '@/modules/capText';
import { bagtsText, capLabelShort, roleLabel } from '@/modules/erhLabels';
import s from './userAdmin.module.css';

/** Эх сурвалжийн текст — «Хуваарийн эрх · Зохиогч · Багц 3.1» */
function srcText(x: WfSource): string {
  const pane = paneLabel(paneOfSys(x.sys, x.cap));
  if (x.sys === 'cap') return `${pane} · ${x.cap ? capLabelShort(x.cap) : x.role} · ${tr('шууд олгосон')}`;
  const role = x.sys === 'flow' ? STAGE_LABEL[x.role as Stage]
    : x.sys === 'qaqc' ? ''
      : roleLabel(x.sys, x.role);
  /* ⚠️ Дэд бүтцийн эрх урсгалтай харагдац нээдэггүй (`CAP_HOST_VIEW.butets` = dedButets) — багц нь `PKG_GROUPS` */
  return [pane, role, bagtsText(x.bagts), x.viewOnly ? tr('зөвхөн харна') : ''].filter(Boolean).join(' · ');
}

export function UserWorkflow({ user, onGo }: { user: string; onGo: (pane: ErhPane) => void }) {
  const { busy, err, run } = useAclRunner();
  const ready = allAclReady();
  const head = (
    <div className={s.topicHead}>
      <span className={s.topicHeadLabel}>{tr('Урсгалтай хуудас')}</span>
      <span className={s.saveHint}>{tr('хуваарилалтаар л нээгдэнэ')}</span>
    </div>
  );
  if (!ready) {
    return (
      <section className={s.cardSec} id="erh-sec-workflow">
        {head}
        <div className={s.capNote}>{lockMsg()}</div>
      </section>
    );
  }

  const e = userErh(liveErhSource(), user);
  const rows = workflowRows(e);
  const pending = aclPendingFor(user);
  const missing = e.superUser || pending ? [] : ungrantedCaps(rows);
  const title = (v: string) => VIEWS.find((x) => x.key === v)?.title ?? v;

  return (
    <section className={s.cardSec} id="erh-sec-workflow">
      {head}
      <div className={s.capNote}>
        {e.superUser
          ? tr('Админ (super) — урсгалтай бүх хуудас нээлттэй, хуваарилалт үйлчлэхгүй.')
          : tr('Эдгээр хуудас унтраалгаар биш, тухайн эрхийн хуудсанд багц/шат олгоход нээгдэж, хасахад хаагдана. Эх сурвалж дээр дарж тэр хуудас руу очно.')}
      </div>
      {missing.length > 0 && (
        <div className={s.capErr} role="alert">
          {tr('Хуваарилалт бий атлаа эрх олгогдоогүй (бичилт унасан): {0}.', missing.map((c) => capLabelShort(c)).join(', '))}
          {' '}
          <button type="button" className={s.linkBtn} disabled={busy}
            onClick={() => { void run(regrantOp(user, missing)); }}>
            {busy ? tr('Олгож байна…') : tr('Дахин олгох')}
          </button>
        </div>
      )}
      {err && <div className={s.capErr} role="alert">{err}</div>}
      <div className={s.wfList}>
        {rows.map((r) => (
          <div key={r.view} className={s.wfRow}>
            <span className={s.wfName}>
              {title(r.view)}
              <span className={`${s.wfState} ${r.open ? s.wfOpen : ''}`}>{r.open ? tr('нээлттэй') : tr('хаалттай')}</span>
            </span>
            <span className={s.wfSrcs}>
              {r.sources.map((x, i) => {
                const bad = !x.granted && !e.superUser && !pending;
                return (
                  <button
                    key={`${x.sys}|${x.role}|${i}`}
                    type="button"
                    className={`${s.wfSrc} ${bad ? s.wfSrcBad : ''}`}
                    title={bad
                      ? tr('Хуваарилалт бий атлаа эрх олгогдоогүй — «Дахин олгох» дарна уу. Дарвал тэр хуудас руу очно.')
                      : tr('Тэр хуудас руу очих')}
                    onClick={() => onGo(paneOfSys(x.sys, x.cap))}
                  >
                    {srcText(x)}{bad ? ` · ${tr('эрх олгогдоогүй')}` : ''}
                  </button>
                );
              })}
              {!r.sources.length && (
                <>
                  <span className={s.wfNone}>{tr('хуваарилалтгүй')}</span>
                  {panesOfView(r.view).map((p) => (
                    <button key={p} type="button" className={s.wfSrc} onClick={() => onGo(p)}
                      title={tr('Энэ хуудсанд багц/шат олгоход нээгдэнэ')}>
                      {paneLabel(p)} →
                    </button>
                  ))}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
