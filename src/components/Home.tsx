'use client';

import { useAuth } from './AuthGate';
import { HEADLINE, OVERALL } from '@/lib/brief';
import s from './home.module.css';

/** Гол үзүүлэлтүүд — албан ёсны илтгэлийн дүн (`brief.ts`) */
const STATS: { value: string; label: string }[] = [
  { value: `${HEADLINE.areaHa} га`, label: 'Төслийн талбай' },
  { value: HEADLINE.population.toLocaleString('en-US'), label: 'Хамрагдах хүн ам' },
  { value: HEADLINE.households.toLocaleString('en-US'), label: 'Өрхийн орон сууц' },
  { value: '58.11 га', label: 'Ногоон байгууламж' },
  { value: `${OVERALL.reported}%`, label: 'Төслийн гүйцэтгэл' },
];

/** Нэрнээс товч үсэг (avatar) — эхний хоёр үгийн эхний үсэг */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * НҮҮР ХУУДАС — «Сэлбэ 20 минутын хот» дижитал ихэр платформын лендинг.
 *
 * Дээд navbar-т төслийн нэр, ArcGIS НЭВТРЭЛТ. Гол хэсэгт төслийн нэр, товч
 * танилцуулга ба албан ёсны үзүүлэлтүүд. «Нэвтрэх» дарж ороход нэвтрээгүй бол
 * ArcGIS руу чиглүүлж, буцаж ирэхэд автоматаар орно.
 */
export function Home({ onEnterAll }: { onEnterAll: () => void }) {
  const { status, user, signOut } = useAuth();

  return (
    <div className={s.home}>
      {/* Дэвсгэр — WebP (444KB; 2.9MB PNG fallback хасав — бүх орчин үеийн browser webp дэмжинэ) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.bg} src="/high_resolution_1.webp" alt="" />
      <div className={s.scrim} aria-hidden />
      <div className={s.grid} aria-hidden />

      {/* ── Дээд навигацийн зурвас ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandDivider} aria-hidden />
          <span className={s.brandText}>
            <b>СЭЛБЭ</b> 20 минутын хот
            <small className={s.brandTag}>Digital Twin Platform</small>
          </span>
        </div>

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          {status === 'signed-in' && user ? (
            <>
              <span className={s.userChip}>
                {user.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.thumbnail} alt="" className={s.avatar} />
                ) : (
                  <span className={s.avatarFallback} aria-hidden>{initials(user.fullName)}</span>
                )}
                <span className={s.userName}>{user.fullName}</span>
              </span>
              {/* Нэвтэрсэн хэрэглэгч порталд ОРОХ — эс бөгөөс нүүр хуудсанд гацна */}
              <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
                Орох
                <span className={s.signInArrow} aria-hidden>→</span>
              </button>
              <button type="button" className={s.signBtn} onClick={signOut}>Гарах</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              Нэвтрэх
              <span className={s.signInArrow} aria-hidden>→</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Гол — төслийн нэр ба мэдээлэл ── */}
      <main className={s.hero}>
        <span className={s.eyebrow}>Улаанбаатар хот · Сэлбэ дэд төв</span>
        <h1 className={s.title}>
          Сэлбэ 20 минутын хот
          <span className={s.titleSub}>Digital Twin Platform</span>
        </h1>
        <p className={s.lede}>
          Ерөнхий төлөвлөгөө, барилгын явц, инженерийн шугам сүлжээ, газар
          чөлөөлөлт, санхүүжилтийг нэг орон зайн платформд нэгтгэж, шийдвэр
          гаргалтыг өгөгдөлд түшиглүүлнэ.
        </p>

        <dl className={s.stats}>
          {STATS.map((st) => (
            <div key={st.label} className={s.stat}>
              <dt className={s.statValue}>{st.value}</dt>
              <dd className={s.statLabel}>{st.label}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
