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
 *
 * ⚠️ 2026-10-23: Environment нүүр (`workspace.css` §workspace-header · §intro-copy ·
 * §action-primary · §workspace-footer) — 80px толгой (blur 16, доод зураас), kicker →
 * Manrope hero гарчиг (2 дахь мөр moss) → тайлбар → 46px `.actionPrimary`. Баруун дээд
 * буланд нэвтрэх товч ХЭВЭЭР (дээрх ⚠️); hero-гийн товч нь ТҮҮНТЭЙ ижил `signIn` (enterAll БИШ).
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
        {/* ⚠️ 2026-09-30: хэл солигч — англи хэлтэй зочин нэвтрэхээс ӨМНӨ ч
            хуудсыг уншиж чаддаг байх ёстой (урьд нь зөвхөн дотор нь байв). */}
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
          {/* ⚠️ Төслийн албан нэр — толгойн брэндтэй («Сэлбэ ухаалаг хот») ИЖИЛ.
              ⚠️ 2026-08-24: хэрэглэгчийн шийдвэрээр «Ухаалаг хот» рүү БУЦААВ
              (2026-08-21-нд «20 минутын хот» болгож нэгтгэсэн байсан). Хоёр
              дэлгэц нэг нэртэй байх ёстой тул `Home.tsx`-ийн брэндтэй хамт л
              өөрчилнө. */}
          <span className={s.titleSub}>{tr('Ухаалаг хот')}</span>
        </h1>

        {/* ⚠️ 2026-09-30: «Digital Twin Platform» дангаараа юу болохыг хэлдэггүй —
            нэг өгүүлбэрээр энгийн тайлбар. */}
        <p className={s.lede}>
          {tr('Сэлбэ дэд төвийн бүтээн байгуулалтын хуваарь, гүйцэтгэл, чанар, санхүүг газрын зурагтай нэг дор хянах ажлын портал.')}
        </p>

        <div className={s.actions}>
          <button type="button" className={s.actionPrimary} onClick={signIn} disabled={busy}>
            {busy ? tr('Шалгаж байна…') : tr('Нэвтрэх')}
            {!busy && <ArrowRight size={17} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>

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
