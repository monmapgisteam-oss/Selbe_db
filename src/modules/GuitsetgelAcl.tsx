'use client';

/**
 * ГҮЙЦЭТГЭЛИЙН ЭРХ ТОХИРУУЛАХ ПАНЕЛ.
 *
 * ⚠️ Админ порталын ТУСДАА БҮЛЭГ. Хажуугийн «Хэрэглэгчдийн эрх удирдах» нь
 * «хэн ямар харагдац үзэх вэ», энэ нь «хэн аль багцыг бөглөх/хянах вэ» —
 * хоёр өөр асуулт тул нэг жагсаалтад хольсонгүй, гэхдээ нэг л газарт байна.
 *
 * ⚠️ Багана бүр НЭГ ШАТ. Шат бүрд хэдэн ч аккаунт, аккаунт бүрд БАГЦУУД.
 * Инженер, менежерүүд ч мөн адил багцаараа хуваарилагдана — тэгэхгүй бол
 * бүх инженер бүх багцыг харж, хэн хариуцахыг хэн ч мэдэхгүй болно.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { STAGE_LABEL } from './Guitsetgel';
import {
  ALL_BAGTS, assignsOf, listAssigns, removeAssign, setAssign, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { listUsers, subscribe } from '@/lib/permissions';
import s from './guitsetgel.module.css';

export function GuitsetgelAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   *
   * ⚠️ Гараар бичих нь үсгийн алдаанд өртөнө: `selbe_injner` гэж бичвэл
   *    томилгоо үүснэ, гэхдээ тэр нэртэй хүн байхгүй тул хэзээ ч ажиллахгүй.
   *    Ямар ч алдаа гарахгүй тул админ хэдэн долоо хоног мэдэхгүй байж болно.
   */
  const accounts = listUsers().map((u) => u.username);

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Шат бүрд хэдэн ч аккаунт нэмнэ. Аккаунт бүрд аль багцыг хариуцахыг зааж өгнө — заагаагүй бол бүх багц.')}
        {' '}
        {tr('Томилгоо ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, тухайн хүн өөрийн төхөөрөмжөөс нэвтрэхэд шууд үйлчилнэ. Томилохын хамт үүрэг ба «Гүйцэтгэлийн хяналт» харагдац автоматаар олгогдоно; хасахад буцаагдана.')}
      </p>

      <div className={s.aclGrid}>
        {STAGE_ORDER.map((st) => (
          <Column key={st} stage={st} title={STAGE_LABEL[st]} accounts={accounts} />
        ))}
      </div>
    </div>
  );
}

function Column({
  stage, title, accounts,
}: { stage: Stage; title: string; accounts: string[] }) {
  const rows = assignsOf(stage);
  const [add, setAdd] = useState('');
  const [err, setErr] = useState('');
  /** ArcGIS бичилт унасан тэмдэг — томилгоо түр зөвхөн энэ browser-т */
  const [syncWarn, setSyncWarn] = useState(false);
  /** Remote бичилтийн үр дүнг ажиглана — унавал ИЛ анхааруулна */
  const watch = (p?: Promise<boolean>) => {
    if (!p) return;
    void p.then((ok) => setSyncWarn(!ok)).catch(() => setSyncWarn(true));
  };

  /* Аль хэдийн ямар нэг шатанд томилогдсоныг давхардуулж санал болгохгүй */
  const taken = new Set(listAssigns().map((a) => a.user));
  const free = accounts.filter((a) => !taken.has(a.toLowerCase()));

  const push = () => {
    const r = setAssign(add, stage, [ALL_BAGTS]);
    setErr(r.ok ? '' : (r.error ?? ''));
    watch(r.sync);
    if (r.ok) setAdd('');
  };

  return (
    <div className={s.aclCol}>
      <div className={s.aclHead}>
        <span>{title}</span>
        <span className={s.aclCount}>{rows.length}</span>
      </div>

      <div className={s.aclAdd}>
        {/* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */}
        <select
          className={s.aclInput}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
        >
          <option value="">{tr('Аккаунт сонгох…')}</option>
          {free.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="button" className={s.aclBtn} onClick={push} disabled={!add.trim()}>
          {tr('Нэмэх')}
        </button>
      </div>
      {free.length === 0 && (
        <div className={s.aclEmpty}>
          {tr('Чөлөөтэй аккаунт алга — «Хэрэглэгчдийн эрх удирдах» хэсэгт шинээр нэмнэ үү.')}
        </div>
      )}
      {err && <div className={s.aclErr}>{err}</div>}
      {syncWarn && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — томилгоо түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      {rows.length === 0 && <div className={s.aclEmpty}>{tr('Аккаунт томилоогүй')}</div>}

      {rows.map((r) => (
        <div key={r.user} className={s.aclRow}>
          <div className={s.aclUser}>
            <span className={s.aclName} title={r.user}>{r.user}</span>
            <button
              type="button"
              className={s.aclX}
              title={tr('Томилгооноос хасах')}
              onClick={() => {
                /* ⚠️ Хасах нь олгосон эрхийг ч буцаадаг болсон (2026-08-27) —
                   юу болохыг ил хэлж баталгаажуулна. */
                if (!window.confirm(tr('«{0}»-г {1} шатнаас хасах уу? Олгогдсон үүрэг ба «Гүйцэтгэлийн хяналт» харагдац нь мөн буцаагдана.', r.user, title))) return;
                watch(removeAssign(r.user, stage).sync);
              }}
            >
              ✕
            </button>
          </div>

          {/* БАГЦУУД — олон сонголт. «Бүх багц» нь бусдыг хүчингүй болгоно. */}
          <div className={s.aclPkgs}>
            <button
              type="button"
              className={`${s.aclPkg} ${r.bagts.includes(ALL_BAGTS) ? s.aclPkgOn : ''}`}
              /* grant:false — эрх нь нэмэх үедээ аль хэдийн олгогдсон;
                 багц солих бүрд эрхийн мөр дахин бичих нь дэмий, бас уралдана */
              onClick={() => watch(setAssign(r.user, stage, [ALL_BAGTS], false).sync)}
            >
              {tr('Бүх багц')}
            </button>
            {PKG_GROUPS.map((g) => {
              const on = r.bagts.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  className={`${s.aclPkg} ${on ? s.aclPkgOn : ''}`}
                  onClick={() => {
                    const cur = r.bagts.filter((x) => x !== ALL_BAGTS);
                    const next = on ? cur.filter((x) => x !== g) : [...cur, g];
                    // Бүгдийг унтраавал «бүх багц» руу буцна — хоосон эрх утгагүй
                    watch(setAssign(r.user, stage, next.length ? next : [ALL_BAGTS], false).sync);
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
