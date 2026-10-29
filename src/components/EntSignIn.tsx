'use client';

import { useState, useSyncExternalStore } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { ENT_PORTAL, entIsShared, entSession, entSignIn, entSignOut, subscribeEnt } from '@/lib/entDocs';
import { userError } from './ui';
import s from './entSignIn.module.css';

/**
 * ENTERPRISE НЭВТРЭЛТИЙН МАЯГТ — нэг бүрэлдэхүүн, хоёр газар («ТЭЗҮ» цонхны Enterprise PDF ·
 * «MA» харагдацын хавсралт). 2026-10-09: `EntDocs.tsx`-ээс салгав.
 */
export function useEntSession() {
  return useSyncExternalStore(subscribeEnt, entSession, () => null);
}

export function EntSignIn({ compact = false, onSignedOut }: { compact?: boolean; onSignedOut?: () => void }) {
  const sess = useEntSession();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!ENT_PORTAL) return null;

  if (sess) {
    return (
      <div className={`${s.row} ${compact ? s.compact : ''}`}>
        <span className={s.user}>{sess.user}</span>
        {!entIsShared() && <button type="button" className={s.link} onClick={() => { entSignOut(); onSignedOut?.(); }}>{tr('Гарах')}</button>}
      </div>
    );
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pass) return;
    setBusy(true); setErr('');
    try { await entSignIn(user, pass); setPass(''); } catch (x) { setErr(userError(x)); } finally { setBusy(false); }
  };

  return (
    <form className={`${s.form} ${compact ? s.compact : ''}`} onSubmit={signIn}>
      <input className={s.input} value={user} onChange={(e) => setUser(e.target.value)}
        placeholder={tr('Геопорталын нэр')} aria-label={tr('Геопорталын нэр')} autoComplete="username" disabled={busy} />
      <input className={s.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)}
        placeholder={tr('Нууц үг')} autoComplete="current-password" disabled={busy} />
      <button type="submit" className={s.btn} disabled={busy || !user.trim() || !pass}>
        {busy ? tr('Нэвтэрч байна…') : tr('Enterprise-д нэвтрэх')}
      </button>
      {err && <div className={s.err} role="alert">{err}</div>}
    </form>
  );
}
