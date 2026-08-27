'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, ROLE_ACCESS, type Role, type ViewKey } from '@/lib/services';
import {
  listUsers,
  listRemoved,
  removeUser,
  setUser,
  clearOverride,
  subscribe,
  type UserPerm,
} from '@/lib/permissions';
import { useAuth } from './AuthGate';
import { Icon } from './Icon';
import { GuitsetgelAcl } from '@/modules/GuitsetgelAcl';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import { STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import {
  ALL_BAGTS, STAGE_ROLE, bagtsFor, removeAssign, setAssign, stageOfUser, subscribeAcl,
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

const countOn = (views: ViewKey[] | 'all'): number =>
  views === 'all' ? ALL_KEYS.length : ALL_KEYS.filter((k) => views.includes(k)).length;

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
  /** «Устгах» — хадгалахад аккаунтыг жагсаалтаас хасаж нэвтрэлтийг нь хаана */
  remove?: boolean;
  /** Панелаас ШИНЭЭР нэмсэн, хараахан хадгалаагүй аккаунт */
  isNew?: boolean;
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д.
 *
 * ⚠️ БҮХ өөрчлөлт (нэмэх, эрх солих, шат томилох, устгах) НООРОГТ хуримтлагдаж
 * ганц «Хадгалах» товчоор л ArcGIS + localStorage руу бууна. Хэсэгчилсэн бичилт
 * байхгүй тул «хагас тохируулсан» төлөв үүсэхгүй.
 */
export function UserAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<UserPerm[]>([]);
  /** Нэвтэрсэн админы нэр — ӨӨРИЙН аккаунтад устгах товч гарахгүй (өөрийгөө түгжихээс сэргийлнэ) */
  const { user: me } = useAuth();
  const myName = me?.username?.toLowerCase() ?? null;
  /**
   * АЛЬ БҮЛЭГ нээлттэй байна.
   * ⚠️ Хоёр бүлэг нь ӨӨР асуултад хариулна: «ямар харагдац үзэх вэ» ба
   *    «аль багцыг бөглөх/хянах вэ». Нэг жагсаалтад хольбол нэгийг засахад
   *    нөгөө нь өөрчлөгдсөн мэт төөрөгдөл үүснэ.
   */
  const [pane, setPane] = useState<'users' | 'guits'>('users');
  const [name, setName] = useState('');
  const [addErr, setAddErr] = useState('');
  /** Хайлт — олон аккаунттай үед шаардлагатай (нэрээр шүүнэ) */
  const [q, setQ] = useState('');
  /** Дэлгэсэн мөрүүд — анхдагчаар БҮГД хураасан (13 хэрэглэгч × 14 унтраалга = уншигдахгүй хана) */
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /** Бөөнөөр засах сонголт */
  const [sel, setSel] = useState<Set<string>>(new Set());
  // ⚠️ ArcGIS хүснэгтэд бичигдэж ЧАДААГҮЙ хэрэглэгчид (жижиг үсгээр) — урьд нь
  //    бичилт унахад ямар ч дохиогүй, өөрчлөлт зөвхөн энэ browser-т үлддэг байв.
  const [unsynced, setUnsynced] = useState<Set<string>>(new Set());
  /** username(жижиг үсгээр) → хадгалаагүй ноорог */
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [saving, setSaving] = useState(false);
  /** Хамгийн сүүлийн хадгалалтын үр дүн — товчийн доор товч мэдэгдэл */
  const [saved, setSaved] = useState<{ ok: number; fail: number } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setUsers(listUsers());
  }, [open]);

  /** Хадгалаагүй ноорогтой үед санамсаргүй хаагдахаас хамгаална */
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const requestClose = () => {
    if (draftsRef.current.size > 0
      && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'))) return;
    setDrafts(new Map());
    onClose();
  };

  /*
   * ⚠️ Escape-ээр хаах · фоны гүйлгэлт түгжих · Ctrl/Cmd+S-ээр хадгалах ·
   *    Tab-ыг модал дотор БАРЬЖ үлдэх (focus trap). Модал нээлттэй байхад
   *    Tab нь ард байгаа порталын товчнууд руу гарвал гар/уншигчийн
   *    хэрэглэгч «хаана байгаагаа» алдана — WCAG 2.4.3.
   */
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { requestClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const f = [...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Нээгдэхэд фокусыг хайлтын талбарт — гараар шууд ажиллаж эхэлнэ
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  useEffect(() => subscribe(() => setUsers(listUsers())), []);
  /*
   * ⚠️ Урсгалын томилгоо нь ӨӨР хадгалалттай тул түүнд ч захиалах ёстой.
   *    Эс бөгөөс шат хадгалсны дараа дэлгэц хуучин хэвээр үлдэнэ.
   */
  const [, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);

  /** Устгагдсан аккаунтууд — рендер бүрд ДАХИН биш, нэг л удаа */
  const removed = useMemo(() => (open ? listRemoved() : []), [open, users]);

  /**
   * ХАРУУЛАХ МӨРҮҮД — хадгалагдсан хэрэглэгчид + панелаас шинээр нэмсэн
   * (хараахан хадгалаагүй) аккаунтууд, хайлтаар шүүгдсэн.
   */
  const rows = useMemo(() => {
    const newOnes: UserPerm[] = [...drafts.entries()]
      .filter(([k, d]) => d.isNew && !users.some((u) => u.username.toLowerCase() === k))
      .map(([k, d]) => ({ username: k, role: d.role, views: d.views, docs: d.docs, overridden: true }));
    const all = [...newOnes, ...users];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((u) => u.username.toLowerCase().includes(needle)) : all;
  }, [users, drafts, q]);

  if (!open) return null;

  /** ArcGIS бичилтийн үр дүнг хүлээж, унасан мөрийг unsynced-д тэмдэглэнэ */
  const track = (username: string, ok: boolean) => {
    const key = username.toLowerCase();
    setUnsynced((prev) => {
      if (prev.has(key) === !ok) return prev; // өөрчлөлтгүй — дахин зурахгүй
      const next = new Set(prev);
      if (ok) next.delete(key); else next.add(key);
      return next;
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
      && !next.remove
      && !next.isNew
      && next.stage === undefined
      && next.role === u.role
      && next.docs === u.docs
      && viewsEq(next.views, u.views);
    setDrafts((prev) => {
      const m = new Map(prev);
      if (same) m.delete(key); else m.set(key, next);
      return m;
    });
    setSaved(null);
  };

  const applyRole = (u: UserPerm, role: Role) => {
    const a = ROLE_ACCESS[role];
    putDraft(u, { ...draftOf(u), clear: false, views: a.views, docs: a.docs, role });
  };
  const flipView = (u: UserPerm, k: ViewKey) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, views: toggled(d.views, k) });
  };
  const setAllViews = (u: UserPerm, on: boolean) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, views: on ? [...ALL_KEYS] : [], docs: on });
  };
  const flipDocs = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, docs: !d.docs });
  };
  const flipStage = (u: UserPerm, st: Stage) => {
    const cur = stageOf(u);
    putDraft(u, { ...draftOf(u), stage: cur === st ? null : st });
  };
  const flipRemove = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, remove: !d.remove });
  };
  const markClear = (u: UserPerm) => {
    // Сэргээх = хатуу тохиргооны суурь руу. Суурьгүй (панелаас нэмсэн) хэрэглэгч
    // жагсаалтаас бүрмөсөн хасагдана — урьдчилан харуулах суурьгүй тул одоогийн
    // утгыг нь үлдээгээд clear тэмдэг тавина.
    putDraft(u, { ...draftOf(u), clear: true });
  };

  /* ── Бөөнөөр засах ── */
  const selRows = rows.filter((u) => sel.has(u.username.toLowerCase()));
  const bulkRole = (role: Role) => { selRows.forEach((u) => applyRole(u, role)); setSel(new Set()); };
  const bulkRemove = () => {
    selRows.filter((u) => u.username.toLowerCase() !== myName)
      .forEach((u) => { if (!draftOf(u).remove) flipRemove(u); });
    setSel(new Set());
  };

  /**
   * ГАНЦ ХАДГАЛАХ — бүх ноорогыг ДАРААЛЛААР бичиж, үр дүнг нь ХҮЛЭЭНЭ.
   *
   * ⚠️ 2026-08-25: урьд нь бичилтүүдийг fire-and-forget явуулдаг байсныг
   * `await`-тай болгов — «Хадгалж байна…» төлөв ҮНЭН болж, дууссаны дараа
   * жагсаалт нь бодит утгаараа шинэчлэгдэнэ.
   *
   * ⚠️ АМЖИЛТГҮЙ гэдэг нь ЗӨВХӨН ALSЫН (ArcGIS) бичилтийг хэлнэ: `setUser`
   * зэрэг нь localStorage-д СИНХРОНООР аль хэдийн бичсэн байдаг тул өөрчлөлт
   * энэ browser-т ҮРГЭЛЖ хүчинтэй. Тиймээс ноорогыг үлдээхгүй (эс бөгөөс
   * ArcGIS-гүй орчинд юу ч хадгалагдахгүй мэт харагдана) — оронд нь тухайн
   * мөрийг «ArcGIS-т хадгалагдсангүй» гэж тэмдэглэнэ.
   */
  const saveAll = async () => {
    if (saving || drafts.size === 0) return;
    const removing = [...drafts.values()].filter((d) => d.remove).length;
    if (removing > 0
      && !window.confirm(tr('{0} аккаунт хадгалахад УСТГАГДАНА. Үргэлжлүүлэх үү?', String(removing)))) return;
    setSaving(true);
    setSaved(null);
    let ok = 0;
    let fail = 0;

    for (const [key, d] of drafts) {
      const u = users.find((x) => x.username.toLowerCase() === key);
      const uname = u?.username ?? key;
      try {
        // УСТГАХ — урсгалын томилгоог нь цэвэрлээд tombstone/арилгалт хийнэ
        if (d.remove) {
          const cur = stageOfUser(uname);
          if (cur) removeAssign(uname, cur);
          const r = await removeUser(uname);
          track(uname, r);
          if (r) ok += 1; else fail += 1;
          continue;
        }
        if (d.clear) {
          const r = await clearOverride(uname);
          track(uname, r);
          if (r) ok += 1; else fail += 1;
          continue;
        }

        /*
         * УРСГАЛЫН ШАТ ба ЭРХИЙГ НЭГ БИЧИЛТЭД нэгтгэнэ.
         * ⚠️ 2026-08-25 ЗАСВАР: урьд нь `setAssign` дотроос `grantFlowAccess`
         * нэг `setUser` хийж, тэр дороо энэ мөрийн `setUser` ДАХИН бичдэг байв —
         * хоёр асинхрон бичилт уралдаж, аль нь сүүлд буухаас хамаарч `guitsetgel`
         * харагдац чимээгүй алга болдог байлаа. Одоо томилгоог `grant: false`-оор
         * хийж, харагдац/үүргийг эндээс ГАНЦ удаа бичнэ.
         */
        let views = d.views;
        let role = d.role;
        if (d.stage !== undefined) {
          const cur = stageOfUser(uname);
          if (cur && cur !== d.stage) removeAssign(uname, cur);
          if (d.stage) {
            setAssign(uname, d.stage, [ALL_BAGTS], false);
            role = STAGE_ROLE[d.stage];
            views = views === 'all' ? 'all' : [...new Set<ViewKey>([...views, 'guitsetgel'])];
          }
        }
        const r = await setUser(uname, { views, docs: d.docs }, role);
        track(uname, r);
        if (r) ok += 1; else fail += 1;
      } catch {
        fail += 1;
        track(uname, false);
      }
    }

    setUsers(listUsers());
    setDrafts(new Map());
    setSaving(false);
    setSaved({ ok, fail });
  };
  saveRef.current = () => { void saveAll(); };

  /**
   * ШИНЭ АККАУНТ — ноорогт нэмнэ (шууд бичихгүй).
   * ⚠️ Давхардлыг ЭНД барина: байгаа нэрийг дахин нэмбэл түүний эрх нь
   *    «Төлөвлөлт» preset-ээр чимээгүй дарагдаж, админ анзаарахгүй байв.
   */
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === key) || drafts.has(key)) {
      setAddErr(tr('«{0}» аль хэдийн жагсаалтад байна.', n));
      return;
    }
    if (removed.includes(key)) {
      setAddErr(tr('«{0}» устгагдсан — доорх «Буцаах» товчоор сэргээнэ үү.', n));
      return;
    }
    const a = ROLE_ACCESS.tolovlolt;
    setDrafts((prev) => new Map(prev).set(key, {
      views: a.views, docs: a.docs, role: 'tolovlolt', isNew: true,
    }));
    setOpenRows((prev) => new Set(prev).add(key));
    setName('');
    setAddErr('');
    setSaved(null);
  };

  return (
    /**
     * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): жижиг МОДАЛ байсныг ТУСДАА «Админ
     * портал» хуудас болгов — админы тохиргоо нь үндсэн порталаас салангид,
     * өөрийн толгой ба хажуугийн цэстэй бүтэн дэлгэцийн хэсэг.
     */
    <div ref={dialogRef} className={s.page} role="dialog" aria-modal="true" aria-label={tr('Админ портал')}>
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

        {/* Хайх + шинэ аккаунт нэмэх */}
        <div className={s.addRow}>
          <div className={s.searchWrap}>
            <Icon name="target" size={13} />
            <input
              ref={searchRef}
              className={s.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('Аккаунт хайх…')}
              aria-label={tr('Аккаунт хайх')}
            />
            {q && (
              <button type="button" className={s.searchX} onClick={() => setQ('')} title={tr('Цэвэрлэх')}>✕</button>
            )}
          </div>
          <input
            className={s.input}
            value={name}
            onChange={(e) => { setName(e.target.value); setAddErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={tr('ArcGIS хэрэглэгчийн нэр')}
            aria-label={tr('Шинэ хэрэглэгчийн нэр')}
          />
          <button type="button" className={s.addBtn} onClick={add} disabled={!name.trim()}>
            {tr('Нэмэх')}
          </button>
        </div>
        {addErr && <div className={s.addErr} role="alert">{addErr}</div>}

        {/* Бөөнөөр засах зурвас — сонголттой үед л */}
        {sel.size > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkInfo}>{tr('{0} сонгосон', String(sel.size))}</span>
            {ROLE_PRESETS.map((r) => (
              <button key={r.key} type="button" className={s.preset} onClick={() => bulkRole(r.key)}>
                {r.label}
              </button>
            ))}
            <button type="button" className={s.delBtn} onClick={bulkRemove}>{tr('Устгах')}</button>
            <button type="button" className={s.cancelBtn} onClick={() => setSel(new Set())}>
              {tr('Сонголт цуцлах')}
            </button>
          </div>
        )}

        {/* Хэрэглэгчийн жагсаалт */}
        <div className={s.list}>
          {rows.length === 0 && (
            <div className={s.empty}>{tr('Тохирох аккаунт олдсонгүй.')}</div>
          )}
          {rows.map((u) => {
            const key = u.username.toLowerCase();
            const d = draftOf(u);
            const dirty = drafts.has(key);
            const st = stageOf(u);
            const expanded = openRows.has(key);
            const on = countOn(d.views);
            return (
            <div key={key} className={`${s.user} ${dirty ? s.userDirty : ''} ${d.remove ? s.userRemoving : ''}`}>
              <div className={s.userHead}>
                <input
                  type="checkbox"
                  className={s.pick}
                  checked={sel.has(key)}
                  onChange={(e) => setSel((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(key); else n.delete(key);
                    return n;
                  })}
                  aria-label={tr('{0} сонгох', u.username)}
                />
                <button
                  type="button"
                  className={s.expand}
                  aria-expanded={expanded}
                  onClick={() => setOpenRows((prev) => {
                    const n = new Set(prev);
                    if (n.has(key)) n.delete(key); else n.add(key);
                    return n;
                  })}
                >
                  <span className={`${s.caret} ${expanded ? s.caretOn : ''}`} aria-hidden>▸</span>
                  <span className={s.uname}>{u.username}</span>
                </button>
                <span className={s.badges}>
                  {d.isNew && <span className={s.newBadge}>{tr('шинэ')}</span>}
                  {d.remove && <span className={s.removeBadge}>{tr('хадгалахад устгагдана')}</span>}
                  {!d.remove && (
                    <span className={s.countBadge} title={tr('Нээлттэй харагдацын тоо')}>
                      {`${on}/${ALL_KEYS.length}`}
                    </span>
                  )}
                  {st && <span className={s.stageBadge}>{STAGE_LABEL[st]}</span>}
                  {dirty && !d.remove && (
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
                  {(u.overridden || dirty) && !d.remove && !d.isNew && (
                    <button
                      type="button"
                      className={s.reset}
                      onClick={() => markClear(u)}
                      title={tr('Хатуу тохиргоо руу сэргээх (хадгалахад үйлчилнэ)')}
                    >
                      {tr('Сэргээх')}
                    </button>
                  )}
                  {key !== myName && (
                    <button
                      type="button"
                      className={`${s.delBtn} ${d.remove ? s.delBtnOn : ''}`}
                      onClick={() => flipRemove(u)}
                      title={d.remove
                        ? tr('Устгалтыг болиулна')
                        : tr('Аккаунтыг устгана (хадгалахад үйлчилнэ)')}
                    >
                      {d.remove ? tr('Болиулах') : tr('Устгах')}
                    </button>
                  )}
                </div>
              </div>

              {expanded && !d.remove && (
                <>
                  {/*
                    * ГҮЙЦЭТГЭЛИЙН УРСГАЛ — аккаунтыг ЭНД шууд шатанд томилно.
                    * ⚠️ Нэг аккаунт нэг шатанд — өөрийн ажлаа өөрөө батлах
                    *    зам үүсэхээс сэргийлнэ.
                    */}
                  <div className={s.flowRow}>
                    <span className={s.flowLabel}>{tr('Гүйцэтгэлийн урсгал')}</span>
                    {STAGE_ORDER.map((stg) => {
                      const stOn = st === stg;
                      const pk = stOn ? bagtsFor(u.username, stg) : null;
                      return (
                        <button
                          key={stg}
                          type="button"
                          aria-pressed={stOn}
                          className={`${s.chip} ${stOn ? s.chipOn : ''}`}
                          onClick={() => flipStage(u, stg)}
                          title={stOn ? tr('Дарж хасна') : tr('{0} шатанд томилно', STAGE_LABEL[stg])}
                        >
                          {STAGE_LABEL[stg]}
                          {stOn && (
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
                  <div className={s.topicHead}>
                    <span className={s.topicHeadLabel}>{tr('Харагдац')}</span>
                    <button type="button" className={s.linkBtn} onClick={() => setAllViews(u, true)}>
                      {tr('Бүгдийг асаах')}
                    </button>
                    <button type="button" className={s.linkBtn} onClick={() => setAllViews(u, false)}>
                      {tr('Бүгдийг унтраах')}
                    </button>
                  </div>
                  <div className={s.topicList}>
                    {VIEWS.map((v) => {
                      const vOn = hasView(d.views, v.key);
                      return (
                        <div key={v.key} className={s.topicRow}>
                          <span className={s.topicName}>
                            <span className={s.topicIcon}><Icon name={v.icon} size={14} /></span>
                            {v.title}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={vOn}
                            aria-label={v.title}
                            className={`${s.sw} ${vOn ? s.swOn : ''}`}
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
                </>
              )}
            </div>
            );
          })}
        </div>

        {removed.length > 0 && (
          <div className={s.removedSec}>
            <div className={s.removedHead}>{tr('Устгагдсан аккаунтууд')}</div>
            {removed.map((k) => (
              <div key={k} className={s.removedRow}>
                <span className={s.removedName}>{k}</span>
                <button
                  type="button"
                  className={s.reset}
                  onClick={() => { void clearOverride(k).then((r) => { track(k, r); setUsers(listUsers()); }); }}
                  title={tr('Аккаунтыг сэргээж хатуу тохиргооны эрхийг нь буцаана')}
                >
                  {tr('Буцаах')}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className={s.note}>
          {tr('Өөрчлөлт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс нэвтэрсэн ч) үйлчилнэ. ArcGIS-т холбогдоогүй үед түр зуур энэ browser-т хадгалагдана.')}
        </p>

        {/* ҮНДСЭН ХАДГАЛАХ ТОВЧ — ҮРГЭЛЖ доод талд наалдана.
          * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): урьд нь зөвхөн өөрчлөлттэй үед
          * гарч ирдэг байсныг БАЙНГА харагдахаар болгов — товч хаана байдгийг
          * админ үргэлж мэднэ. Өөрчлөлтгүй үед идэвхгүй, тоолуур «бүгд
          * хадгалагдсан» гэж мэдээлнэ. */}
        <div className={s.saveBar}>
          <span className={s.saveInfo}>
            {drafts.size > 0
              ? tr('{0} хэрэглэгчийн өөрчлөлт хадгалагдаагүй', String(drafts.size))
              : saved
                ? (saved.fail > 0
                  ? tr('{0} хадгалагдав · {1} нь ArcGIS-т хүрсэнгүй', String(saved.ok), String(saved.fail))
                  : tr('{0} хэрэглэгчийн өөрчлөлт хадгалагдлаа', String(saved.ok)))
                : tr('Бүх өөрчлөлт хадгалагдсан')}
          </span>
          {drafts.size > 0 && (
            <button
              type="button"
              className={s.cancelBtn}
              onClick={() => { setDrafts(new Map()); setSaved(null); }}
            >
              {tr('Болих')}
            </button>
          )}
          <button
            type="button"
            className={s.saveBtn}
            onClick={() => { void saveAll(); }}
            disabled={saving || drafts.size === 0}
            title={tr('Ctrl+S')}
          >
            {saving ? tr('Хадгалж байна…') : tr('Хадгалах')}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
