'use client';

/**
 * НЭЭЛТИЙН ХУУДАС — платформыг нээхэд ХАМГИЙН ТҮРҮҮНД гарна.
 *
 * ⚠️ Энэ нь `Home`-ыг ОРЛОХГҮЙ. `Home` бол нэвтэрсний дараа гарах KPI самбар.
 * Урсгал нь: Landing → (нэвтрэх) → Home самбар → (хэсэг сонгох) → Portal.
 *
 * ⚠️ Товч нь `enterAll` БИШ, ЗӨВХӨН `signIn`. `enterAll` нь `PENDING_KEY`-д
 * тэмдэглэл үлдээдэг ба нэвтэрч буцаж ирэхэд ШУУД Portal (газрын зураг) руу
 * үсэрч, KPI самбарыг алгасна. Хэрэглэгчийн хүссэн урсгал бол нэвтрээд эхлээд
 * САМБАР харагдах явдал.
 *
 * ⚠️ БҮХ ЗҮЙЛ ГОЛДОО БИШ. Лого зүүн дээд буланд, нэвтрэх товч баруун дээд
 * буланд, төслийн нэр зүүн эгнээнд — сонгодог нээлтийн хуудасны байрлал.
 */

import { t as tr } from '@/lib/i18nCore';
import { useAuth } from './AuthGate';
import s from './landing.module.css';

export function Landing() {
  const { signIn, status, error } = useAuth();
  const busy = status === 'checking';

  return (
    <div className={s.wrap}>
      <div className={s.bg} aria-hidden />

      {/* ── Зүүн дээд: лого · Баруун дээд: нэвтрэх ── */}
      <header className={s.top}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt={tr('Сэлбэ')} className={s.logo} />
        <button type="button" className={s.enter} onClick={signIn} disabled={busy}>
          {busy ? tr('Шалгаж байна…') : tr('Нэвтрэх')}
          {!busy && <span className={s.arrow} aria-hidden>→</span>}
        </button>
      </header>

      {/* ── Гол хэсэг — ЗҮҮН эгнээнд ── */}
      <main className={s.hero}>
        <h1 className={s.title}>
          {tr('Сэлбэ')}
          {/* ⚠️ Төслийн албан нэр — толгойн брэндтэй («Сэлбэ ухаалаг хот») ИЖИЛ.
              ⚠️ 2026-08-24: хэрэглэгчийн шийдвэрээр «Ухаалаг хот» рүү БУЦААВ
              (2026-08-21-нд «20 минутын хот» болгож нэгтгэсэн байсан). Хоёр
              дэлгэц нэг нэртэй байх ёстой тул `Home.tsx`-ийн брэндтэй хамт л
              өөрчилнө. */}
          <span className={s.titleSub}>{tr('Ухаалаг хот')}</span>
        </h1>

        <p className={s.tag}>Digital Twin Platform</p>

        {/*
          * ⚠️ Алдааг ЗААВАЛ үзүүлнэ. Эс бөгөөс эрх нь хүрэлцээгүй хэрэглэгч
          * товчоо дараад юу ч болохгүй мэт харагдаж, шалтгааныг мэдэхгүй үлдэнэ.
          */}
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
