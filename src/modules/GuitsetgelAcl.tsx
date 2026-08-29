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
 *
 * ⚠️ ЭНЭ ТОМИЛГОО = ШАТ БА БАГЦЫН ГАНЦ ЭХ СУРВАЛЖ (2026-08-29,
 * `resolveFlowStage`). Хэрэглэгчийн үүрэг (Энгийн/Төлөвлөлт) ямар ч байсан
 * энд томилогдсон шат нь хяналтын хуудсанд үйлчилнэ.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  ALL_BAGTS, assignsOf, flowFailedUsers, listAssigns, removeAssign, setAssign, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, subscribe } from '@/lib/permissions';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

export function GuitsetgelAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт / эрхийн dirty-set өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   *
   * ⚠️ Гараар бичих нь үсгийн алдаанд өртөнө: `selbe_injner` гэж бичвэл
   *    томилгоо үүснэ, гэхдээ тэр нэртэй хүн байхгүй тул хэзээ ч ажиллахгүй.
   *    Ямар ч алдаа гарахгүй тул админ хэдэн долоо хоног мэдэхгүй байж болно.
   *
   * ⚠️ Кодын хатуу super-ийг САНАЛ БОЛГОХГҮЙ (2026-08-29): түүнд шат/багцын
   *    хязгаар үйлчилдэггүй (`resolveFlowStage`) тул томилгоо нь худал хязгаар
   *    харуулаад, дэмий override мөр л үүсгэдэг байв.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  /** Порталд БАЙГАА аккаунтууд (жижиг үсгээр) — устгагдсаны өнчин томилгоог ялгана */
  const known = new Set(all.map((a) => a.toLowerCase()));

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Шат бүрд хэдэн ч аккаунт нэмнэ. Аккаунт бүрд аль багцыг хариуцахыг зааж өгнө — заагаагүй бол бүх багц.')}
        {' '}
        {tr('Томилгоо ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, тухайн хүн өөрийн төхөөрөмжөөс нэвтрэхэд шууд үйлчилнэ. Томилохын хамт «Гүйцэтгэлийн хяналт» харагдац автоматаар нээгдэнэ (үүрэггүй аккаунтад урсгалын үүрэг олгогдоно, бусдын үндсэн үүрэг хэвээр); хасахад буцаагдана. Шат ба багц нь ЭНЭ томилгооноос гарна — үүргээс биш.')}
      </p>

      <div className={s.aclGrid}>
        {STAGE_ORDER.map((st) => (
          <Column key={st} stage={st} title={STAGE_LABEL[st]} accounts={accounts} known={known} />
        ))}
      </div>
    </div>
  );
}

function Column({
  stage, title, accounts, known,
}: { stage: Stage; title: string; accounts: string[]; known: Set<string> }) {
  const rows = assignsOf(stage);
  const [add, setAdd] = useState('');
  const [err, setErr] = useState('');
  /**
   * Remote бичилт нь унасан хэрэглэгчид — `guitsetgelAcl` модуль хадгалж, өөрчлөгдөхөд
   * `subscribeAcl`-аар мэдэгдэнэ. Урьд нь баганад НЭГ boolean байсан тул өөр мөрийн
   * дараагийн амжилт өмнөх мөрийн алдааг чимээгүй арчдаг байв.
   */
  const failed = new Set(flowFailedUsers());
  /** Хасалт унасан (мөр нь аль ч баганад алга) — баганын түвшний анхааруулга */
  const orphanFail = [...failed].some((u) => !listAssigns().some((a) => a.user === u));
  /** Эрхийн мөр (үүрэг/харагдац) ArcGIS-т хүрээгүй — `permissions` dirty-set */
  const dirtyPerms = new Set(dirtyKeys());

  /* Аль хэдийн ямар нэг шатанд томилогдсоныг давхардуулж санал болгохгүй */
  const taken = new Set(listAssigns().map((a) => a.user));
  const free = accounts.filter((a) => !taken.has(a.toLowerCase()));

  const push = () => {
    const r = setAssign(add, stage, [ALL_BAGTS]);
    setErr(r.ok ? '' : (r.error ?? ''));
    void r.sync;
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
      {orphanFail && (
        <div className={s.aclErr} role="alert">
          {tr('⚠️ ArcGIS-т бичигдсэнгүй — томилгоо түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
        </div>
      )}

      {rows.length === 0 && <div className={s.aclEmpty}>{tr('Аккаунт томилоогүй')}</div>}

      {rows.map((r) => {
        /* Remote-оос ирсэн хуучин мөр: хатуу super (хязгаар үйлчлэхгүй) эсвэл
           устгагдсан аккаунт (өнчин томилгоо — цэвэрлэх л үлдсэн) */
        const isAdmin = roleForUser(r.user) === 'super';
        const gone = !known.has(r.user);
        return (
          <div key={r.user} className={s.aclRow}>
            <div className={s.aclUser}>
              <span className={s.aclName} title={r.user}>{r.user}</span>
              <button
                type="button"
                className={s.aclX}
                title={tr('Томилгооноос хасах')}
                onClick={() => {
                  /* ⚠️ Устгагдсан аккаунт: зөвхөн мөрийг арилгана (revoke=false) —
                     эрх буцаах бичилт tombstone-ыг хөндөх ёсгүй. */
                  if (gone) { void removeAssign(r.user, stage, false).sync; return; }
                  /* ⚠️ Хасах нь олгосон эрхийг ч буцаадаг болсон (2026-08-27) —
                     юу болохыг ил хэлж баталгаажуулна. */
                  if (!window.confirm(tr('«{0}»-г {1} шатнаас хасах уу? Олгогдсон үүрэг ба «Гүйцэтгэлийн хяналт» харагдац нь мөн буцаагдана.', r.user, title))) return;
                  void removeAssign(r.user, stage).sync;
                }}
              >
                ✕
              </button>
            </div>
            {failed.has(r.user) && (
              <div className={s.aclErr} role="alert">{tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}</div>
            )}
            {dirtyPerms.has(r.user) && (
              <div className={s.aclErr}>{tr('Эрхийн мөр ArcGIS-т хадгалагдсангүй — «Хэрэглэгчдийн эрх удирдах» → «Дахин синк»')}</div>
            )}

            {gone ? (
              <div className={s.aclEmpty}>{tr('устгагдсан аккаунт — томилгоог ✕-ээр цэвэрлэнэ үү')}</div>
            ) : isAdmin ? (
              <div className={s.aclEmpty}>{tr('админ — багцын хязгаар үйлчлэхгүй')}</div>
            ) : (
              /* БАГЦУУД — олон сонголт. «Бүх багц» нь бусдыг хүчингүй болгоно. */
              <div className={s.aclPkgs}>
                <button
                  type="button"
                  className={`${s.aclPkg} ${r.bagts.includes(ALL_BAGTS) ? s.aclPkgOn : ''}`}
                  /* grant:false — эрх нь нэмэх үедээ аль хэдийн олгогдсон;
                     багц солих бүрд эрхийн мөр дахин бичих нь дэмий */
                  onClick={() => { setErr(''); void setAssign(r.user, stage, [ALL_BAGTS], false).sync; }}
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
                        /*
                         * ⚠️ FAIL-CLOSED (2026-08-29): сүүлийн багцыг хасахад урьд нь
                         * «бүх багц» руу БУЦДАГ байв — хязгаарлах гэсэн даралт хүрээг
                         * бүх багц руу тэлдэг. Одоо «Бүх багц» товч л тэр зам.
                         */
                        if (on && cur.length === 1) {
                          setErr(tr('Сүүлийн багцыг хасахгүй — бүх багц олгох бол «Бүх багц», томилгооноос хасах бол ✕ дарна уу.'));
                          return;
                        }
                        setErr('');
                        const next = on ? cur.filter((x) => x !== g) : [...cur, g];
                        void setAssign(r.user, stage, next, false).sync;
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
