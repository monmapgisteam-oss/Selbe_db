'use client';

import { useEffect, useState } from 'react';
import { VIEWS, ROLE_ACCESS, type Role, type ViewKey } from '@/lib/services';
import {
  listUsers,
  setUser,
  clearOverride,
  subscribe,
  type UserPerm,
} from '@/lib/permissions';
import { Icon } from './Icon';
import s from './userAdmin.module.css';

/** Toggle хийж болох бүх харагдац */
const ALL_KEYS: ViewKey[] = VIEWS.map((v) => v.key);

/** Үүргийн preset товчнууд */
const ROLE_PRESETS: { key: Role; label: string }[] = [
  { key: 'super', label: 'Супер' },
  { key: 'beginner', label: 'Энгийн' },
  { key: 'tolovlolt', label: 'Төлөвлөлт' },
];

const hasView = (views: ViewKey[] | 'all', k: ViewKey) => views === 'all' || views.includes(k);

const toggled = (views: ViewKey[] | 'all', k: ViewKey): ViewKey[] => {
  const arr = views === 'all' ? [...ALL_KEYS] : [...views];
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д. Хэрэглэгч нэмж, харагдац
 * бүрийг унтрааж/асаана. Өөрчлөлт `localStorage`-д шууд хадгалагдана.
 */
export function UserAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<UserPerm[]>([]);
  const [name, setName] = useState('');
  // ⚠️ ArcGIS хүснэгтэд бичигдэж ЧАДААГҮЙ хэрэглэгчид (жижиг үсгээр) — урьд нь
  //    бичилт унахад ямар ч дохиогүй, өөрчлөлт зөвхөн энэ browser-т үлддэг байв.
  const [unsynced, setUnsynced] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setUsers(listUsers());
  }, [open]);

  // ⚠️ Escape-ээр хаах + нээлттэй үед фоны гүйлгэлтийг түгжих (DocViewer-тэй ижил
  //    хэв маяг — өмнө нь энэ модал зөвхөн даралт/✕-ээр хаагддаг, гар/уншигчид
  //    таагүй байв).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  useEffect(() => subscribe(() => setUsers(listUsers())), []);

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

  const applyRole = (u: UserPerm, role: Role) => {
    const a = ROLE_ACCESS[role];
    track(u.username, setUser(u.username, { views: a.views, docs: a.docs }, role));
  };
  const flipView = (u: UserPerm, k: ViewKey) =>
    track(u.username, setUser(u.username, { views: toggled(u.views, k), docs: u.docs }, u.role));
  const flipDocs = (u: UserPerm) =>
    track(u.username, setUser(u.username, { views: u.views, docs: !u.docs }, u.role));

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
     * өөрийн толгой ба хажуугийн цэстэй бүтэн дэлгэцийн хэсэг. Нээх/хаах logic
     * (isSuper шалгалт, Escape, гүйлгэлт түгжих) хэвээр.
     */
    <div className={s.page} role="dialog" aria-modal="true" aria-label="Админ портал">
      <header className={s.pageHead}>
        <span className={s.pageBrand}>
          <span className={s.pageBadge}><Icon name="users" size={15} /></span>
          <span className={s.pageBrandText}>
            <b>Админ портал</b>
            <small>Сэлбэ 20 минутын хот · тохиргоо</small>
          </span>
        </span>
        <button type="button" className={s.back} onClick={onClose}>
          ← Портал руу буцах
        </button>
      </header>

      <aside className={s.side} aria-label="Админ цэс">
        <div className={s.sideHead}>Тохиргоо</div>
        <button type="button" className={`${s.sideItem} ${s.sideItemOn}`} aria-current="true">
          <Icon name="users" size={14} />
          Хэрэглэгчдийн эрх удирдах
        </button>
      </aside>

      <div className={s.main}>
        <header className={s.head}>
          <h2 className={s.title}>Хэрэглэгчдийн эрх удирдах</h2>
          <p className={s.subtitle}>
            Хэрэглэгч бүрд үүргийн багц оноох буюу харагдац тус бүрийг нээж/хаана.
          </p>
        </header>

        {/* Хэрэглэгч нэмэх */}
        <div className={s.addRow}>
          <input
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="ArcGIS хэрэглэгчийн нэр"
            aria-label="Шинэ хэрэглэгчийн нэр"
          />
          <button type="button" className={s.addBtn} onClick={add} disabled={!name.trim()}>
            Нэмэх
          </button>
        </div>

        {/* Хэрэглэгчийн жагсаалт */}
        <div className={s.list}>
          {users.map((u) => (
            <div key={u.username.toLowerCase()} className={s.user}>
              <div className={s.userHead}>
                <span className={s.uname}>
                  {u.username}
                  {unsynced.has(u.username.toLowerCase()) && (
                    // ⚠️ ArcGIS бичилт унасан — тусгай CSS класс байхгүй тул inline загвар
                    <span
                      style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 550, color: '#fbbf24' }}
                      title="ArcGIS хүснэгтэд бичиж чадсангүй — өөрчлөлт бусад төхөөрөмжид үйлчлэхгүй"
                    >
                      ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т
                    </span>
                  )}
                </span>
                <div className={s.presets}>
                  {ROLE_PRESETS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`${s.preset} ${u.role === r.key ? s.presetOn : ''}`}
                      onClick={() => applyRole(u, r.key)}
                      title={`${r.label} эрхийн багц`}
                    >
                      {r.label}
                    </button>
                  ))}
                  {u.overridden && (
                    <button
                      type="button"
                      className={s.reset}
                      onClick={() => track(u.username, clearOverride(u.username))}
                      title="Хатуу тохиргоо руу сэргээх"
                    >
                      Сэргээх
                    </button>
                  )}
                </div>
              </div>

              {/* Дээд/дэд сэдвүүдийн унтраалга */}
              <div className={s.toggles}>
                {VIEWS.map((v) => {
                  const on = hasView(u.views, v.key);
                  return (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={on}
                      className={`${s.chip} ${on ? s.chipOn : ''}`}
                      onClick={() => flipView(u, v.key)}
                    >
                      <span className={s.chipIcon}><Icon name={v.icon} size={14} /></span>
                      {v.title}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={u.docs}
                  className={`${s.chip} ${u.docs ? s.chipOn : ''}`}
                  onClick={() => flipDocs(u)}
                >
                  <span className={s.chipIcon}><Icon name="file" size={14} /></span>
                  ТЭЗҮ-БОНУ
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className={s.note}>
          Өөрчлөлт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, бүх хэрэглэгчид
          (өөр төхөөрөмжөөс нэвтэрсэн ч) үйлчилнэ. ArcGIS-т холбогдоогүй үед түр
          зуур энэ browser-т хадгалагдана.
        </p>
      </div>
    </div>
  );
}
