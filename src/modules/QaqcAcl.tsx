'use client';

/**
 * ЧАНАРЫН (QAQC) ЭРХ ТОХИРУУЛАХ ПАНЕЛ.
 *
 * ⚠️ «Гүйцэтгэлийн урсгалын эрх»-ЭЭС ТУСДАА БҮЛЭГ (2026-09-07). Тэр нь «хэн
 * аль багцын гүйцэтгэлийг бөглөх / хянах вэ» гэсэн ДӨРВӨН ШАТТАЙ асуулт;
 * энэ нь «хэн аль багцын чанарын баримтыг (М-акт · FIC · MA · MIR) хөтлөх вэ»
 * гэсэн ШАТГҮЙ асуулт. Чанарын хяналтын ажилтан нь гүйцэтгэгч ч биш, хянагч
 * инженер ч биш тул урсгалын багананд байрлуулах газаргүй.
 *
 * ⚠️ ЯАГААД ТУСДАА БАЙХ ЁСТОЙ ВЭ: урьд нь QAQC хуудас багцаа урсгалын
 * томилгооноос авдаг байсан тул чанарын ажилтанд багц өгөх гэвэл түүнийг
 * заавал нэг ШАТАНД томилох ёстой болж, тэр нь гүйцэтгэлийг ЗӨВШӨӨРӨХ эрх
 * дагуулдаг байв («хэн юуг баталсан нь замхарна» — `caps.ts`). Мөн «нэг
 * аккаунт нэг шатанд» дүрмээр хүний өмнөх томилгоо чимээгүй хасагддаг байлаа.
 *
 * ⚠️ Багц ХУВААРИЛАХ нь `qaqc` ЭРХИЙГ автоматаар олгоно, хасах нь буцаана —
 * хоёрыг тусад нь тохируулах шаардлагагүй (`qaqcAcl.setQaqcAssign`).
 *
 * ⚠️ БИЧИЛТ `aclOps`-ООР (2026-09-25) — хэрэглэгчийн карт ба матрицтай ИЖИЛ
 *    дүрэм, ИЖИЛ асуулт (`qaqcAllOp` · `qaqcChipOp` · `qaqcDropOp`). Сүүлийн
 *    багцыг дарвал урьд нь «хасахгүй» гэж зогсоодог байв; одоо ✕-ийн зам
 *    (асууж, хуваарилалтаас хасна) — «бүх багц» руу БУЦАХГҮЙ (fail-closed хэвээр).
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import {
  ALL_BAGTS, listQaqcAssigns, qaqcAclReady, qaqcFailedUsers, subscribeQaqcAcl,
} from '@/lib/qaqcAcl';
import { qaqcAllOp, qaqcChipOp, qaqcDropOp } from '@/lib/aclOps';
import { useAclRunner } from './useAclRunner';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { dirtyKeys, listUsers, remoteReady, subscribe } from '@/lib/permissions';
import { capsRemoteReady } from '@/lib/caps';
import { roleForUser } from '@/lib/services';
import s from './guitsetgel.module.css';

export function QaqcAcl() {
  const [, tick] = useState(0);
  useEffect(() => subscribeQaqcAcl(() => tick((n) => n + 1)), []);
  // Хэрэглэгчийн жагсаалт / эрхийн dirty-set өөрчлөгдөхөд сонгогч ч шинэчлэгдэнэ
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);

  /**
   * СОНГОХ АККАУНТУУД — «Хэрэглэгчдийн эрх удирдах» бүлгийн ЯГ ТЭР жагсаалт.
   *
   * ⚠️ Гараар бичихгүй: `selbe_injner` гэж алдаатай бичвэл хуваарилалт үүсэх ч
   *    тэр нэртэй хүн байхгүй тул хэзээ ч ажиллахгүй, ямар ч алдаа гарахгүй.
   *
   * ⚠️ Кодын хатуу super-ийг САНАЛ БОЛГОХГҮЙ — түүнд хязгаар үйлчилдэггүй
   *    (`qaqcScope` `null`) тул хуваарилалт нь худал хязгаар л харуулна.
   */
  const all = listUsers().map((u) => u.username);
  const accounts = all.filter((a) => roleForUser(a) !== 'super');
  /** Порталд БАЙГАА аккаунтууд (жижиг үсгээр) — устгагдсаны өнчин мөрийг ялгана */
  const known = new Set(all.map((a) => a.toLowerCase()));

  const rows = listQaqcAssigns();
  const [add, setAdd] = useState('');

  /** Remote бичилт нь унасан хэрэглэгчид — мөр бүрд тэмдэг */
  const failed = new Set(qaqcFailedUsers());
  /** Хасалт унасан (мөр нь жагсаалтад алга) — панелийн түвшний анхааруулга */
  const orphanFail = [...failed].some((u) => !rows.some((a) => a.user === u));
  /** Эрхийн мөр (үүрэг/харагдац) ArcGIS-т хүрээгүй — `permissions` dirty-set */
  const dirtyPerms = new Set(dirtyKeys());

  /* Аль хэдийн хуваарилагдсаныг давхардуулж санал болгохгүй */
  const taken = new Set(rows.map((a) => a.user));
  const free = accounts.filter((a) => !taken.has(a.toLowerCase()));

  /*
   * ⚠️ ТҮГЖЭЭ (2026-09-23 аудит) — `DedButetsAcl` · `ScopedAclPanel`-тэй ИЖИЛ.
   *    Remote уншигдаагүй үед `rows` нь `[]` тул нэмэх/багц солих бичилт
   *    remote-ийн бодит мөрийг дарж бичнэ. Уншигдтал бүх бичилт хаалттай.
   */
  /* ⚠️ Өөрийн ACL-ийн туг ч (2026-09-24) — `ScopedAclPanel`-тэй ижил */
  const ready = () => remoteReady() && capsRemoteReady() && qaqcAclReady();
  const locked = !ready();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  /* ⚠️ Өөрийн 3 тугтай түгжээ хэвээр; `busy` нь давхар товшилтыг барина */
  const { busy, err, setErr, run } = useAclRunner(ready);
  const off = locked || busy;

  /* Шинэ мөр → «бүх багц», эрх олгоно (`qaqcAllOp`: мөргүй бол grant=true) */
  const push = () => {
    if (locked) { setErr(LOCK_MSG); return; }
    const u = add;
    void run(qaqcAllOp(u)).then((ok) => { if (ok) setAdd(''); });
  };

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Аккаунт нэмээд аль багцын чанарын баримтыг хариуцахыг зааж өгнө — заагаагүй бол бүх багц.')}
        {' '}
        {tr('Хуваарилалт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, тухайн хүн өөрийн төхөөрөмжөөс нэвтрэхэд шууд үйлчилнэ. Нэмэхэд «QAQC — Inspection Test Plan» эрх ба «Чанар (QAQC)» харагдац автоматаар нээгдэж, хасахад буцаагдана.')}
        {' '}
        {tr('⚠️ Энэ нь гүйцэтгэлийн урсгалаас ТУСДАА: чанарын багц олгосон нь тухайн хүнд гүйцэтгэл зөвшөөрөх/буцаах эрх өгөхгүй, түүний урсгалын шатыг ч хөндөхгүй.')}
      </p>

      <div className={s.aclGrid}>
        <div className={`${s.aclCol} ${s.aclOne}`}>
          <div className={s.aclHead}>
            <span>{tr('Чанарын хяналт')}</span>
            <span className={s.aclCount}>{rows.length}</span>
          </div>

          <div className={s.aclAdd}>
            {/* ⚠️ Гараар бичихгүй — порталд БАЙГАА аккаунтаас л сонгоно. */}
            <select
              className={s.aclInput}
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              disabled={off}
            >
              <option value="">{tr('Аккаунт сонгох…')}</option>
              {free.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" className={s.aclBtn} onClick={push} disabled={off || !add.trim()}>
              {tr('Нэмэх')}
            </button>
          </div>
          {free.length === 0 && (
            <div className={s.aclEmpty}>
              {tr('Чөлөөтэй аккаунт алга — «Хэрэглэгчдийн эрх удирдах» хэсэгт шинээр нэмнэ үү.')}
            </div>
          )}
          {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
          {err && <div className={s.aclErr}>{err}</div>}
          {orphanFail && (
            <div className={s.aclErr} role="alert">
              {tr('⚠️ ArcGIS-т бичигдсэнгүй — хуваарилалт түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин оролдоно уу.')}
            </div>
          )}

          {rows.length === 0 && <div className={s.aclEmpty}>{tr('Аккаунт хуваарилаагүй')}</div>}

          {rows.map((r) => {
            /* Устгагдсан аккаунтын өнчин мөр — цэвэрлэх л үлдсэн */
            const gone = !known.has(r.user);
            return (
              <div key={r.user} className={s.aclRow}>
                <div className={s.aclUser}>
                  <span className={s.aclName} title={r.user}>{r.user}</span>
                  <button
                    type="button"
                    className={s.aclX}
                    title={tr('Хуваарилалтаас хасах')}
                    disabled={off}
                    onClick={() => {
                      if (locked) { setErr(LOCK_MSG); return; }
                      /* ⚠️ Устгагдсан аккаунт: зөвхөн мөрийг арилгана (revoke=false, асуухгүй) —
                         эрх буцаах бичилт tombstone-ыг хөндөх ёсгүй. Дүрэм `qaqcDropOp`-д. */
                      void run(qaqcDropOp(r.user));
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
                  <div className={s.aclEmpty}>{tr('устгагдсан аккаунт — хуваарилалтыг ✕-ээр цэвэрлэнэ үү')}</div>
                ) : (
                  /* БАГЦУУД — олон сонголт. «Бүх багц» нь бусдыг хүчингүй болгоно. */
                  <div className={s.aclPkgs}>
                    <button
                      type="button"
                      className={`${s.aclPkg} ${r.bagts.includes(ALL_BAGTS) ? s.aclPkgOn : ''}`}
                      /* grant:false — эрх нь нэмэх үедээ аль хэдийн олгогдсон;
                         багц солих бүрд эрхийн мөр дахин бичих нь дэмий (`qaqcAllOp`) */
                      disabled={off}
                      onClick={() => {
                        if (locked) { setErr(LOCK_MSG); return; }
                        void run(qaqcAllOp(r.user));
                      }}
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
                          disabled={off}
                          onClick={() => {
                            if (locked) { setErr(LOCK_MSG); return; }
                            /*
                             * ⚠️ FAIL-CLOSED (урсгалын панелтай ижил дүрэм): сүүлийн
                             * багцыг хасахад «бүх багц» руу БУЦААХГҮЙ — хязгаарлах
                             * гэсэн даралт хүрээг тэлэх ёсгүй. 2026-09-25-аас ✕-ийн
                             * зам (асууж хасна) — `aclOps.qaqcChipOp`.
                             */
                            void run(qaqcChipOp(r.user, g));
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
      </div>
    </div>
  );
}
