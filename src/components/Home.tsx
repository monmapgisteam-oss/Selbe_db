'use client';

import { useAuth } from './AuthGate';
import { HEADLINE, OVERALL } from '@/lib/brief';
import s from './home.module.css';

/** Гол үзүүлэлтүүд — албан ёсны илтгэлийн дүн (`brief.ts`) */
const STATS: { value: string; label: string }[] = [
  { value: `${HEADLINE.areaHa} га`, label: 'Төслийн талбай' },
  { value: HEADLINE.population.toLocaleString('en-US'), label: 'Хамрагдах хүн ам' },
  { value: HEADLINE.households.toLocaleString('en-US'), label: 'Өрхийн орон сууц' },
  { value: HEADLINE.investAllLabel, label: 'Нийт хөрөнгө оруулалт' },
  { value: `${OVERALL.reported}%`, label: 'Төслийн гүйцэтгэл' },
];

/**
 * НҮҮР ХУУДАС — албан ёсны лендинг.
 *
 * Дээд navbar-т төслийн нэр, хэсгүүдийн цэс, ArcGIS НЭВТРЭЛТ. Гол хэсэгт төслийн
 * нэр, товч танилцуулга, албан ёсны үзүүлэлтүүд ба «Порталд нэвтрэх» товч. Дарж
 * ороход нэвтрээгүй бол ArcGIS руу чиглүүлж, буцаж ирэхэд автоматаар орно.
 */
export function Home({ onEnterAll }: { onEnterAll: () => void }) {
  const { status, user, signOut } = useAuth();

  return (
    <div className={s.home}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.bg} src="/high_resolution_1.png" alt="" />
      <div className={s.scrim} aria-hidden />

      {/* ── Дээд навигацийн зурвас ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandText}>
            <b>СЭЛБЭ</b> 20 минутын хот
          </span>
        </div>

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          {status === 'signed-in' && user ? (
            <>
              <span className={s.userName}>{user.fullName}</span>
              <button type="button" className={s.signBtn} onClick={signOut}>Гарах</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              Нэвтрэх
            </button>
          )}
        </div>
      </header>

      {/* ── Гол — төслийн нэр ба мэдээлэл ── */}
      <main className={s.hero}>
        <span className={s.eyebrow}>Улаанбаатар хот · Сэлбэ дэд төв</span>
        <h1 className={s.title}>Сэлбэ 20 минутын хот</h1>
        <p className={s.lede}>
          Ерөнхий төлөвлөгөө, барилгын явц, инженерийн шугам сүлжээ, газар
          чөлөөлөлт, санхүүжилтийг нэгтгэсэн албан ёсны орон зайн мэдээллийн портал.
        </p>

        <dl className={s.stats}>
          {STATS.map((st) => (
            <div key={st.label} className={s.stat}>
              <dt className={s.statValue}>{st.value}</dt>
              <dd className={s.statLabel}>{st.label}</dd>
            </div>
          ))}
        </dl>

        <button type="button" className={s.cta} onClick={onEnterAll}>
          Порталд нэвтрэх
          <span className={s.ctaArrow} aria-hidden>→</span>
        </button>
      </main>
    </div>
  );
}
