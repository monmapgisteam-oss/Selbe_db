'use client';

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, ROLE_ACCESS, type Role, type ViewKey } from '@/lib/services';
import {
  listUsers,
  setUser,
  clearOverride,
  subscribe,
  type UserPerm,
} from '@/lib/permissions';
import { Icon } from './Icon';
import { GuitsetgelAcl } from '@/modules/GuitsetgelAcl';
import { STAGE_LABEL } from '@/modules/Guitsetgel';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import {
  ALL_BAGTS, bagtsFor, removeAssign, setAssign, stageOfUser, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import s from './userAdmin.module.css';

/** Toggle хийж болох бүх харагдац */
const ALL_KEYS: ViewKey[] = VIEWS.map((v) => v.key);

/** Үүргийн preset товчнууд */
const ROLE_PRESETS: { key: Role; label: string }[] = [
  { key: 'super', label: tr('Супер') },
  { key: 'beginner', label: tr('Энгийн') },
  { key: 'tolovlolt', label: tr('Төлөвлөлт') },
];

const hasView = (views: ViewKey[] | 'all', k: ViewKey) => views === 'all' || views.includes(k);

const toggled = (views: ViewKey[] | 'all', k: ViewKey): ViewKey[] => {
  const arr = views === 'all' ? [...ALL_KEYS] : [...views];
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
};

/** 'all' ба бүрэн жагсаалтыг ИЖИЛ гэж үзэж харьцуулна */
const viewsEq = (a: ViewKey[] | 'all', b: ViewKey[] | 'all'): boolean =>
  ALL_KEYS.every((k) => hasView(a, k) === hasView(b, k));

/**
 * НЭГ хэрэглэгчийн ХАДГАЛААГҮЙ өөрчлөлт (ноорог).
 *
 * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): даралт бүр ArcGIS руу ШУУД бичдэг байсныг
 * болиулав — унтраалга дарахад зөвхөн ноорогт бичигдэж, доод талын ГАНЦ
 * «Хадгалах» товч бүгдийг нэг дор ArcGIS + localStorage руу буулгана. Ингэснээр
 * админ олон унтраалга дараад нэг удаа хадгалж, эсвэл «Болих»-оор бүгдийг
 * буцааж чадна.
 */
type Draft = {
  views: ViewKey[] | 'all';
  docs: boolean;
  role: Role | null;
  /** undefined = урсгалын шат хөндөгдөөгүй · null = шатгүй болгох */
  stage?: Stage | null;
  /** «Сэргээх» — хадгалахад override-ыг бүрмөсөн устгаж хатуу тохиргоонд буцаана */
  clear?: boolean;
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д. Хэрэглэгч нэмж, аккаунт
 * бүрийн доор сэдвүүдийг ЖАГСААЛТААР харуулж, мөр бүрийн ард унтраалгаар
 * нээж/хаана. Өөрчлөлт НООРОГТ хуримтлагдаж «Хадгалах» товчоор нэг дор буудаг.
 */
export function UserAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<UserPerm[]>([]);
  /**
   * АЛЬ БҮЛЭГ нээлттэй байна.
   * ⚠️ Хоёр бүлэг нь ӨӨР асуултад хариулна: «ямар харагдац үзэх вэ» ба
   *    «аль багцыг бөглөх/хянах вэ». Нэг жагсаалтад хольбол нэгийг засахад
   *    нөгөө нь өөрчлөгдсөн мэт төөрөгдөл үүснэ.
   */
  const [pane, setPane] = useState<'users' | 'guits'>('users');
  const [name, setName] = useState('');
  // ⚠️ ArcGIS хүснэгтэд бичигдэж ЧАДААГҮЙ хэрэглэгчид (жижиг үсгээр) — урьд нь
  //    бичилт унахад ямар ч дохиогүй, өөрчлөлт зөвхөн энэ browser-т үлддэг байв.
  const [unsynced, setUnsynced] = useState<Set<string>>(new Set());
  /** username(жижиг үсгээр) → хадгалаагүй ноорог */
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setUsers(listUsers());
  }, [open]);

  /** Хадгалаагүй ноорогтой үед санамсаргүй хаагдахаас хамгаална */
  const requestClose = () => {
    if (drafts.size > 0
      && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'))) return;
    setDrafts(new Map());
    onClose();
  };

  // ⚠️ Escape-ээр хаах + нээлттэй үед фоны гүйлгэлтийг түгжих (DocViewer-тэй ижил
  //    хэв маяг). Ноорогтой бол Escape ч мөн баталгаажуулалт асууна.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, drafts.size]);
  useEffect(() => subscribe(() => setUsers(listUsers())), []);
  /*
   * ⚠️ Урсгалын томилгоо нь ӨӨР хадгалалттай тул түүнд ч захиалах ёстой.
   *    Эс бөгөөс шат хадгалсны дараа дэлгэц хуучин хэвээр үлдэнэ.
   */
  const [, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);

  if (!open) return null;

  /** ArcGIS бичилтийн үр дүнг хүлээж, унасан мөрийг unsynced-д тэмдэглэнэ */
  const track = (username: string, p: Promise<boolean>) => {
    const key = username.toLowerCase();
    void p.then((ok) => {
      setUnsynced((prev) => {
        if (prev.has(key) === !ok) return prev; // өөрчлөлтгүй — дахин зурахгүй
        const next = new Set(prev);
        if (ok) next.delete(key); else next.add(key);
        return next;
      });
    });
  };

  /** Хэрэглэгчийн ОДООГИЙН харагдах төлөв — ноорог байвал түүнийг, эс бөгөөс хадгалснаа */
  const draftOf = (u: UserPerm): Draft => {
    const d = drafts.get(u.username.toLowerCase());
    return d ?? { views: u.views, docs: u.docs, role: u.role };
  };
  const stageOf = (u: UserPerm): Stage | null => {
    const d = drafts.get(u.username.toLowerCase());
    return d?.stage !== undefined ? d.stage : stageOfUser(u.username);
  };

  /**
   * Ноорог тавих — хадгалсантай ИЖИЛ болж буцвал ноорогоос хасна
   * (Save-бар «0 өөрчлөлт»-тэй дэмий гарч ирэхгүй).
   */
  const putDraft = (u: UserPerm, d: Draft) => {
    const key = u.username.toLowerCase();
    const next = { ...d };
    if (next.stage !== undefined && next.stage === stageOfUser(u.username)) delete next.stage;
    const same = !next.clear
      && next.stage === undefined
      && next.role === u.role
      && next.docs === u.docs
      && viewsEq(next.views, u.views);
    setDrafts((prev) => {
      const m = new Map(prev);
      if (same) m.delete(key); else m.set(key, next);
      return m;
    });
  };

  const applyRole = (u: UserPerm, role: Role) => {
    const a = ROLE_ACCESS[role];
    putDraft(u, { ...draftOf(u), clear: false, views: a.views, docs: a.docs, role });
  };
  const flipView = (u: UserPerm, k: ViewKey) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, views: toggled(d.views, k) });
  };
  const flipDocs = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, docs: !d.docs });
  };
  const flipStage = (u: UserPerm, st: Stage) => {
    const cur = stageOf(u);
    putDraft(u, { ...draftOf(u), stage: cur === st ? null : st });
  };
  const markClear = (u: UserPerm) => {
    // Сэргээх = хатуу тохиргооны суурь руу. Суурьгүй (панелаас нэмсэн) хэрэглэгч
    // жагсаалтаас бүрмөсөн хасагдана — урьдчилан харуулах суурьгүй тул одоогийн
    // утгыг нь үлдээгээд clear тэмдэг тавина.
    putDraft(u, { ...draftOf(u), clear: true });
  };

  /** ГАНЦ ХАДГАЛАХ — бүх ноорогыг нэг дор ArcGIS + localStorage руу буулгана */
  const saveAll = () => {
    setSaving(true);
    for (const [key, d] of drafts) {
      const u = users.find((x) => x.username.toLowerCase() === key);
      const uname = u?.username ?? key;
      // Урсгалын шат — тусдаа хадгалалттай (guitsetgelAcl)
      if (d.stage !== undefined) {
        const cur = stageOfUser(uname);
        if (cur !== d.stage) {
          if (cur) removeAssign(uname, cur);
          if (d.stage) setAssign(uname, d.stage, [ALL_BAGTS]);
        }
      }
      if (d.clear) track(uname, clearOverride(uname));
      else track(uname, setUser(uname, { views: d.views, docs: d.docs }, d.role));
    }
    setDrafts(new Map());
    setSaving(false);
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const a = ROLE_ACCESS.tolovlolt;
    track(n, setUser(n, { views: a.views, docs: a.docs }, 'tolovlolt'));
    setName('');
  };

  return (
    /**
     * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): жижиг МОДАЛ байсныг ТУСДАА «Админ
     * портал» хуудас болгов — админы тохиргоо нь үндсэн порталаас салангид,
     * өөрийн толгой ба хажуугийн цэстэй бүтэн дэлгэцийн хэсэг.
     */
    <div className={s.page} role="dialog" aria-modal="true" aria-label={tr('Админ портал')}>
      <header className={s.pageHead}>
        <span className={s.pageBrand}>
          <span className={s.pageBadge}><Icon name="users" size={15} /></span>
          <span className={s.pageBrandText}>
            <b>{tr('Админ портал')}</b>
            <small>{tr('Сэлбэ 20 минутын хот · тохиргоо')}</small>
          </span>
        </span>
        <button type="button" className={s.back} onClick={requestClose}>
          {tr('← Портал руу буцах')}
        </button>
      </header>

      <aside className={s.side} aria-label={tr('Админ цэс')}>
        <div className={s.sideHead}>{tr('Тохиргоо')}</div>
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'users' ? s.sideItemOn : ''}`}
          aria-current={pane === 'users'}
          onClick={() => setPane('users')}
        >
          <Icon name="users" size={14} />
          {tr('Хэрэглэгчдийн эрх удирдах')}
        </button>
        {/*
          * ⚠️ ТУСДАА БҮЛЭГ, нэг жагсаалтад ХОЛИОГҮЙ. Дээрх нь «ямар
          *    харагдац үзэх вэ», энэ нь «аль багцыг бөглөх/хянах вэ».
          */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'guits' ? s.sideItemOn : ''}`}
          aria-current={pane === 'guits'}
          onClick={() => setPane('guits')}
        >
          <Icon name="pen" size={14} />
          {tr('Гүйцэтгэлийн урсгалын эрх')}
        </button>
      </aside>

      <div className={s.main}>
        {pane === 'guits' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Гүйцэтгэлийн урсгалын эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Дөрвөн шат бүрд аккаунт томилж, аль багцыг хариуцахыг зааж өгнө.')}
              </p>
            </header>
            <GuitsetgelAcl />
          </>
        ) : (
          <>
        <header className={s.head}>
          <h2 className={s.title}>{tr('Хэрэглэгчдийн эрх удирдах')}</h2>
          <p className={s.subtitle}>
            {tr('Сэдэв бүрийг унтраалгаар нээж/хааж, доод талын «Хадгалах» товчоор нэг дор хадгална.')}
          </p>
        </header>

        {/* Хэрэглэгч нэмэх */}
        <div className={s.addRow}>
          <input
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={tr('ArcGIS хэрэглэгчийн нэр')}
            aria-label={tr('Шинэ хэрэглэгчийн нэр')}
          />
          <button type="button" className={s.addBtn} onClick={add} disabled={!name.trim()}>
            {tr('Нэмэх')}
          </button>
        </div>

        {/* Хэрэглэгчийн жагсаалт */}
        <div className={s.list}>
          {users.map((u) => {
            const key = u.username.toLowerCase();
            const d = draftOf(u);
            const dirty = drafts.has(key);
            const st = stageOf(u);
            return (
            <div key={key} className={`${s.user} ${dirty ? s.userDirty : ''}`}>
              <div className={s.userHead}>
                <span className={s.uname}>
                  {u.username}
                  {dirty && (
                    <span className={s.dirtyDot} title={tr('Хадгалаагүй өөрчлөлттэй')} />
                  )}
                  {unsynced.has(key) && (
                    <span
                      className={s.unsynced}
                      title={tr('ArcGIS хүснэгтэд бичиж чадсангүй — өөрчлөлт бусад төхөөрөмжид үйлчлэхгүй')}
                    >
                      {tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}
                    </span>
                  )}
                </span>
                <div className={s.presets}>
                  {ROLE_PRESETS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`${s.preset} ${d.role === r.key ? s.presetOn : ''}`}
                      onClick={() => applyRole(u, r.key)}
                      title={tr('{0} эрхийн багц', r.label)}
                    >
                      {r.label}
                    </button>
                  ))}
                  {(u.overridden || dirty) && (
                    <button
                      type="button"
                      className={s.reset}
                      onClick={() => markClear(u)}
                      title={tr('Хатуу тохиргоо руу сэргээх (хадгалахад үйлчилнэ)')}
                    >
                      {tr('Сэргээх')}
                    </button>
                  )}
                </div>
              </div>

              {/*
                * ГҮЙЦЭТГЭЛИЙН УРСГАЛ — аккаунтыг ЭНД шууд шатанд томилно.
                * ⚠️ Нэг аккаунт нэг шатанд — өөрийн ажлаа өөрөө батлах
                *    зам үүсэхээс сэргийлнэ.
                */}
              <div className={s.flowRow}>
                <span className={s.flowLabel}>{tr('Гүйцэтгэлийн урсгал')}</span>
                {STAGE_ORDER.map((stg) => {
                  const on = st === stg;
                  const pk = on ? bagtsFor(u.username, stg) : null;
                  return (
                    <button
                      key={stg}
                      type="button"
                      aria-pressed={on}
                      className={`${s.chip} ${on ? s.chipOn : ''}`}
                      onClick={() => flipStage(u, stg)}
                      title={on ? tr('Дарж хасна') : tr('{0} шатанд томилно', STAGE_LABEL[stg])}
                    >
                      {STAGE_LABEL[stg]}
                      {on && (
                        <span className={s.flowPk}>
                          {pk ? tr('{0} багц', String(pk.length)) : tr('бүх багц')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/*
                * СЭДВҮҮД — жагсаалт хэлбэрээр, мөр бүрийн АРД унтраалга.
                * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): chip-үүдийн үүл байсныг
                * жагсаалт + switch болгов — аль сэдэв нээлттэйг нэг харцаар
                * ялгахад унтраалгын байрлал тогтмол байх нь чухал.
                */}
              <div className={s.topicList}>
                {VIEWS.map((v) => {
                  const on = hasView(d.views, v.key);
                  return (
                    <div key={v.key} className={s.topicRow}>
                      <span className={s.topicName}>
                        <span className={s.topicIcon}><Icon name={v.icon} size={14} /></span>
                        {v.title}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={v.title}
                        className={`${s.sw} ${on ? s.swOn : ''}`}
                        onClick={() => flipView(u, v.key)}
                      >
                        <span className={s.swKnob} />
                      </button>
                    </div>
                  );
                })}
                <div className={s.topicRow}>
                  <span className={s.topicName}>
                    <span className={s.topicIcon}><Icon name="file" size={14} /></span>
                    {tr('ТЭЗҮ-БОНУ')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={d.docs}
                    aria-label={tr('ТЭЗҮ-БОНУ')}
                    className={`${s.sw} ${d.docs ? s.swOn : ''}`}
                    onClick={() => flipDocs(u)}
                  >
                    <span className={s.swKnob} />
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        <p className={s.note}>
          {tr('Өөрчлөлт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс нэвтэрсэн ч) үйлчилнэ. ArcGIS-т холбогдоогүй үед түр зуур энэ browser-т хадгалагдана.')}
        </p>

        {/* ГАНЦ ХАДГАЛАХ ТОВЧ — ноорогтой үед л гарна */}
        {drafts.size > 0 && (
          <div className={s.saveBar}>
            <span className={s.saveInfo}>
              {tr('{0} хэрэглэгчийн өөрчлөлт хадгалагдаагүй', String(drafts.size))}
            </span>
            <button
              type="button"
              className={s.cancelBtn}
              onClick={() => setDrafts(new Map())}
            >
              {tr('Болих')}
            </button>
            <button
              type="button"
              className={s.saveBtn}
              onClick={saveAll}
              disabled={saving}
            >
              {saving ? tr('Хадгалж байна…') : tr('Хадгалах')}
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
