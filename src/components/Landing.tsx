'use client';

/**
 * НЭЭЛТИЙН ХУУДАС — платформыг нээхэд ХАМГИЙН ТҮРҮҮНД гарна.
 */

import { ArrowRight } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from './AuthGate';
import { LocaleToggle } from './LocaleToggle';
import s from './landing.module.css';

export function Landing() {
  const { signIn, status, error } = useAuth();
  const busy = status === 'checking';

  return (
    <div className={s.wrap}>
      <div className={s.bg} aria-hidden />

      {/* ── Зүүн дээд: лого · Баруун дээд: нэвтрэх ── */}
      <header className={s.top}>
        <img src="/logo.svg" alt={tr('Сэлбэ')} className={s.logo} />
        <div className={s.topRight}>
          <LocaleToggle />
          <button type="button" className={s.enter} onClick={signIn} disabled={busy}>
            {busy ? tr('Шалгаж байна…') : tr('Нэвтрэх')}
            {!busy && <span className={s.arrow} aria-hidden><ArrowRight size={14} strokeWidth={1.75} /></span>}
          </button>
        </div>
      </header>

      {/* ── Гол хэсэг — ЗҮҮН эгнээнд ── */}
      <main className={s.hero}>
        <p className={s.tag}><span aria-hidden />Digital Twin Platform</p>
        <h1 className={s.title}>
          {tr('Сэлбэ')}
          <br />
          <span className={s.titleSub}>{tr('Ухаалаг хот')}</span>
        </h1>

        <p className={s.lede}>
          {tr('Сэлбэ дэд төвийн бүтээн байгуулалтын хуваарь, гүйцэтгэл, чанар, санхүүг газрын зурагтай нэг дор хянах ажлын портал.')}
        </p>

        <div className={s.actions}>
          <button type="button" className={s.actionPrimary} onClick={signIn} disabled={busy}>
            {busy ? tr('Шалгаж байна…') : tr('Нэвтрэх')}
            {!busy && <ArrowRight size={17} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>

        {status === 'denied' && (
          <p className={s.error} role="alert">
            {tr('Таны бүртгэлд энэ платформд нэвтрэх эрх олгогдоогүй байна.')}
          </p>
        )}
        {error && status !== 'denied' && (
          <p className={s.error} role="alert">{error}</p>
        )}
      </main>

      <footer className={s.foot}>{tr('Улаанбаатар хотын Сэлбэ дэд төв')}</footer>
    </div>
  );
}
