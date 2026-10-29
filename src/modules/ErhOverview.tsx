'use client';

/**
 * ЭРХИЙН ТОЙМ — «хэн юу хийж чадах вэ» ба «багц бүрд хэн байгаа вэ».
 *
 *   · «Батбаяр юу хийж чадах вэ?» — таван бүлгийг тус тусад нь нээж, нэрийг
 *     нь хайх ёстой (5 удаа).
 *   · «Багц 3.1-ийг хэн хариуцаж байна?» — мөн адил.
 */

import { useEffect, useState } from 'react';
import { initRemote } from '@/lib/permissions';
import { t as tr } from '@/lib/i18nCore';
import { askConfirm } from '@/lib/confirm';
import { remoteMalformed, subscribe } from '@/lib/permissions';
import { subscribeCaps, CAP_HOST_VIEW, type CapKey } from '@/lib/caps';
import { subscribeAcl } from '@/lib/guitsetgelAcl';
import { subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { subscribeObyemAcl } from '@/lib/obyemAcl';
import { subscribeChanarAcl } from '@/lib/chanarAcl';
import { subscribeAjilAcl } from '@/lib/ajilAcl';
import { subscribeButetsAcl } from '@/lib/butetsAcl';
import { BUTETS_PACKS } from '@/lib/butetsPacks';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { allAclReady, liveErhSource, lockMsg } from '@/lib/aclOps';
import { allPkgErh, allUserErh, typeStageGaps, unknownPkgUsers, userErh, type RoleLine } from '@/lib/erhOverview';
import { portalCheckStatus } from '@/lib/portalPresence';
import { bagtsText, capLabelShort, issueText, roleLabel, type ScopedKind } from './erhLabels';
import { ERH_PANES, paneLabel } from './capText';
import { ErhMatrix } from './ErhMatrix';
import s from './guitsetgel.module.css';

export function ErhOverview({
  onGo, onOpenUser, drafts,
}: {
  onGo: (pane: string) => void;
  /** `UserAdmin`-ы хадгалаагүй ноорог — матриц картын хамгаалалтыг мөрдөнө (2026-09-25) */
  drafts: ReadonlyMap<string, { remove?: boolean; isNew?: boolean }>;
  /** Хүний хөзөр дарахад хэрэглэгчийн карт нээнэ (2026-09-25) */
  onOpenUser: (user: string) => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeCaps(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeAjilAcl(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeButetsAcl(() => tick((n) => n + 1)), []);

  const [mode, setMode] = useState<'matrix' | 'user'>('matrix');

  const locked = !allAclReady();
  const LOCK_MSG = lockMsg();

  const src = liveErhSource();
  const pkgs = allPkgErh(src);
  const people = allUserErh(src);
  const allIssues = pkgs.flatMap((p) => p.issues);
  const malformed = remoteMalformed();
  const unknownPkgs = unknownPkgUsers(src);
  const absent = (src.absent ?? []).map((u) => userErh(src, u));
  const typeGaps = typeStageGaps(src);
  const presence = portalCheckStatus();
  const [cleanBusy, setCleanBusy] = useState<number | null>(null);
  const [cleanErr, setCleanErr] = useState('');
  const dropRow = async (oid: number, key: string) => {
    if (!(await askConfirm(tr('«{0}» мөрийг эрхийн хүснэгтээс УСТГАХ уу? Буцаах боломжгүй.', key), { danger: true, ok: tr('Мөрийг устгах') }))) return;
    setCleanBusy(oid); setCleanErr('');
    try {
      const { removeMalformedRow, takeWriteError } = await import('@/lib/permsRemote');
      const ok = await removeMalformedRow(oid, key);
      if (!ok) { setCleanErr(takeWriteError() || tr('Устгаж чадсангүй.')); return; }
      await initRemote(false, true);
    } finally {
      setCleanBusy(null);
    }
  };

  return (
    <div className={s.aclWrap}>
      <p className={s.aclNote}>
        {tr('Засвар бүгд нэг бичих давхаргаар — матриц, хэрэглэгчийн карт, бүлгийн хуудас ижил дүрмээр бичиж, ижил асуулт асууна. Хуваарилалт шууд хадгалагдана.')}
      </p>

      {allIssues.length > 0 && (
        <div className={s.aclCol}>
          <div className={s.aclHead}>
            <span>{tr('Анхаарах')}</span>
            <span className={s.aclCount}>{allIssues.length}</span>
          </div>
          {allIssues.map((i, k) => (
            <div key={`${i.key}-${i.args[0]}-${k}`} className={s.aclErr} role="alert">
              {issueText(i)}
            </div>
          ))}
        </div>
      )}
      {absent.length > 0 && (
        <div className={s.aclCol}>
          <div className={s.aclHead}>
            <span>{tr('Порталд алга аккаунт')}</span>
            <span className={s.aclCount}>{absent.length}</span>
          </div>
          {absent.map((u) => (
            <div key={`a-${u.user}`} className={s.aclErr} role="alert">
              {tr('«{0}»: Enterprise порталд бүртгэлгүй — нэвтэрч чадахгүй тул түүний хуваарилалт ажил гүйцэтгэхгүй (гацааны шалгуурт тоологдохгүй). Хуваарилалтыг нь өөр хүнд шилжүүлэх, эсвэл аккаунтыг устгана уу.', u.user)}
              {u.flow && <> {tr('Урсгал: {0} · {1}.', STAGE_LABEL[u.flow.stage], bagtsText(u.flow.bagts))}</>}
              {' '}
              <button type="button" className={s.aclPkg} onClick={() => onOpenUser(u.user)}>{tr('Карт')}</button>
              {u.flow && (
                <>
                  {' '}
                  <button type="button" className={s.aclPkg} onClick={() => onGo('guits')}>{tr('Гүйцэтгэлийн урсгал')}</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {typeGaps.length > 0 && (
        <div className={s.aclCol}>
          <div className={s.aclHead}>
            <span>{tr('Эрхийн төрөл ↔ урсгалын шат')}</span>
            <span className={s.aclCount}>{typeGaps.length}</span>
          </div>
          {typeGaps.map((g) => (
            <div key={`t-${g.user}`} className={s.aclErr} role="alert">
              {g.want === null
                ? tr('«{0}»: «Ерөнхий захирал» (зөвхөн харна) атлаа «{1}» шатанд томилгоотой — шийдвэрлэх эрхгүй тул шатны эзэн биш. Томилгоог хасна уу.', g.user, g.have ? STAGE_LABEL[g.have] : '—')
                : g.have
                ? tr('«{0}»: «{1}» төрөлтэй атлаа «{2}» шатанд томилогдсон — төрөл ба шат зөрж байна (шат нь томилгооноос).', g.user, STAGE_LABEL[g.want], STAGE_LABEL[g.have])
                : tr('«{0}»: «{1}» төрөлтэй атлаа урсгалын шатанд томилогдоогүй — «Гүйцэтгэл» хуудас нээгдэхгүй, батлах боломжгүй. Төрөл нь шат олгодоггүй.', g.user, STAGE_LABEL[g.want])}
              {' '}
              <button type="button" className={s.aclPkg} onClick={() => onGo('guits')}>{tr('Гүйцэтгэлийн урсгал')}</button>
              {' '}
              <button type="button" className={s.aclPkg} onClick={() => onOpenUser(g.user)}>{tr('Карт')}</button>
            </div>
          ))}
        </div>
      )}
      {presence === 'noPrivilege' && (
        <p className={s.aclNote}>{tr('Порталын аккаунтыг тулгаж чадсангүй — таны Enterprise эрх бүх гишүүнийг харахгүй (порталын админ биш). «Порталд алга» аккаунт тэмдэглэгдээгүй.')}</p>
      )}
      {(malformed.length > 0 || unknownPkgs.length > 0) && (
        <div className={s.aclCol}>
          <div className={s.aclHead}>
            <span>{tr('Эрхийн хүснэгтийн цэвэрлэгээ')}</span>
            <span className={s.aclCount}>{malformed.length + unknownPkgs.length}</span>
          </div>
          {malformed.map((m, k) => (
            <div key={`m-${m.key}-${k}`} className={s.aclErr} role="alert">
              {m.reason === 'stage'
                ? tr('«{0}»: урсгалын мөрөнд шат алга — мөр үл тоогдож байна (хүснэгтээс засна уу).', m.key)
                : m.reason === 'user'
                  ? tr('«{0}»: аккаунтын нэр хоосон эсвэл зөвшөөрөгдөөгүй — мөр үл тоогдож байна (хүснэгтээс устгана уу).', m.key)
                  : m.reason === 'space'
                    ? tr('«{0}»: аккаунтын нэрийн захад/угтварын дараа зай байна — мөр үл тоогдож байна, эрх олгохгүй (устгаад зөв нэрээр дахин олгоно уу).', m.key)
                    : tr('«{0}»: эвдэрсэн мөр (views JSON задлагдсангүй) — үл тоогдож байна, эрх олгохгүй (хүснэгтээс засна уу).', m.key)}
              {m.oid != null && (
                <>
                  {' '}
                  <button
                    type="button"
                    className={s.aclPkg}
                    disabled={cleanBusy != null}
                    aria-busy={cleanBusy === m.oid || undefined}
                    onClick={() => { void dropRow(m.oid!, m.key); }}
                  >
                    {cleanBusy === m.oid ? tr('Устгаж байна…') : tr('Мөрийг устгах')}
                  </button>
                </>
              )}
            </div>
          ))}
          {cleanErr && <div className={s.aclErr} role="alert">{cleanErr}</div>}
          {unknownPkgs.map((x) => (
            <div key={`u-${x.user}`} className={s.aclErr} role="alert">
              {tr('«{0}»: танигдаагүй багц ({1}) — ямар ч багц нээгдэхгүй; тухайн эрхийн хуудсанд багцыг дахин сонгоно уу.', x.user, x.bagts.join(', '))}
            </div>
          ))}
        </div>
      )}
      {locked && <div className={s.aclErr} role="alert">{LOCK_MSG}</div>}
      {!locked && allIssues.length === 0 && (
        <div className={s.aclEmpty}>{tr('Цоорхой алга — багц бүр бүрэн томилогдсон.')}</div>
      )}

      <div className={s.aclAdd}>
        <button
          type="button"
          className={`${s.aclPkg} ${mode === 'matrix' ? s.aclPkgOn : ''}`}
          onClick={() => setMode('matrix')}
        >
          {tr('Багцаар')}
        </button>
        <button
          type="button"
          className={`${s.aclPkg} ${mode === 'user' ? s.aclPkgOn : ''}`}
          onClick={() => setMode('user')}
        >
          {tr('Хүнээр')}
        </button>
      </div>

      {mode === 'matrix' ? (
        <ErhMatrix src={src} locked={locked} drafts={drafts} />
      ) : (
        <div className={s.aclGrid}>
          {people.map((u) => (
            <div
              key={u.user}
              className={`${s.aclCol} ${s.mxCard}`}
              role="button"
              tabIndex={0}
              title={tr('Хэрэглэгчийн карт — бүх эрх, хуваарилалт нэг дор')}
              onClick={() => onOpenUser(u.user)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenUser(u.user); } }}
            >
              <div className={s.aclHead}>
                <span>{u.user}</span>
                <span className={s.aclCount}>{u.views.open}/{u.views.total}</span>
              </div>

              {u.superUser && (
                <div className={s.aclName}>{tr('Админ — бүх багц, бүх шат')}</div>
              )}
              {!u.any && (
                <div className={s.aclEmpty}>{tr('Эрх олгоогүй — зөвхөн харагдац.')}</div>
              )}
              {u.unknownBagts.length > 0 && (
                <div className={s.aclErr} role="alert">{tr('Танигдаагүй багц: {0}', u.unknownBagts.join(', '))}</div>
              )}

              {u.flow && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Гүйцэтгэлийн урсгал')}</div>
                  <div className={s.aclName}>
                    {STAGE_LABEL[u.flow.stage]} · {bagtsText(u.flow.bagts)}
                    {u.flow.viewOnly && <> · <em className={s.aclEmpty}>{tr('зөвхөн харна')}</em></>}
                  </div>
                </div>
              )}

              <UserRoles title={tr('Хуваарь')} kind="huvaari" lines={u.huvaari} />
              <UserRoles title={tr('Инженерийн обьём')} kind="obyem" lines={u.obyem} />
              <UserRoles title={tr('Чанарын баримт')} kind="chanar" lines={u.chanar} />
              <UserRoles title={tr('Нэмэлт ажил')} kind="ajil" lines={u.ajil} />
              <UserRoles
                title={tr('Дэд бүтцийн засвар')}
                kind="butets"
                lines={u.butets.map((l) => ({
                  ...l,
                  bagts: l.bagts?.map((k) => BUTETS_PACKS.find((x) => x.key === k)?.name ?? k) ?? null,
                }))}
              />

              {u.caps.length > 0 && (
                <div className={s.aclRole}>
                  <div className={s.aclRoleHead}>{tr('Засах эрх')}</div>
                  <div className={s.aclPkgs}>
                    {u.caps.map((c) => (
                      <span key={c} className={s.aclPkg} title={CAP_HOST_VIEW[c as CapKey].join(', ')}>
                        {capLabelShort(c as CapKey)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className={s.aclNote}>
        {tr('Засах бол:')}{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('users')}>{tr('Хэрэглэгчдийн эрх')}</button>{' '}
        <button type="button" className={s.aclPkg} onClick={() => onGo('guits')}>{tr('Гүйцэтгэлийн урсгал')}</button>{' '}
        {ERH_PANES.map((k) => (
          <span key={k}>
            <button type="button" className={s.aclPkg} onClick={() => onGo(k)}>{paneLabel(k)}</button>{' '}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Хүний хөзөр дэх нэг дэд системийн үүргүүд */
function UserRoles({
  title, kind, lines,
}: { title: string; kind: ScopedKind; lines: RoleLine[] }) {
  if (!lines.length) return null;
  return (
    <div className={s.aclRole}>
      <div className={s.aclRoleHead}>{title}</div>
      {lines.map((l, i) => (
        <div key={`${l.role}|${i}`} className={s.aclUser}>
          <span className={s.aclEmpty} style={{ minWidth: 96 }}>{roleLabel(kind, l.role)}</span>
          <span className={s.aclName}>{bagtsText(l.bagts)}</span>
        </div>
      ))}
    </div>
  );
}
