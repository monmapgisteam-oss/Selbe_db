'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AUTH } from '@/lib/services';
import s from './auth.module.css';

/**
 * ArcGIS Online нэвтрэлтийн хаалт.
 *
 * OAuth 2.0 (PKCE, authorization-code) урсгалаар нэвтэрч, зөвхөн нэвтэрсэн (болон
 * `AUTH.allowedOrgId` заасан бол тухайн org-ийн) хэрэглэгчид л `children`-ийг үзнэ.
 *
 * ⚠️ ArcGIS SDK нь браузерын API-д түшиглэдэг тул identity модулиудыг ЗӨВХӨН effect
 * дотор динамик import хийнэ — эс бөгөөс статик экспортын SSR үед унана.
 *
 * `AUTH.appId` хоосон бол нэвтрэлт унтраалттай — апп хуучнаар шууд нээгдэнэ.
 */

type User = { username: string; fullName: string; thumbnail: string | null; orgId: string | null };
type Status = 'checking' | 'signed-in' | 'signed-out' | 'denied';

/** portalUrl-ийн сүүлийн '/'-г арилгаад /sharing нэмнэ */
const sharingUrl = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`;

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Тохируулаагүй бол нэвтрэлтгүйгээр ажиллана (одоогийн байдлыг эвдэхгүй)
    if (!AUTH.appId) {
      setStatus('signed-in');
      return;
    }

    let alive = true;
    (async () => {
      try {
        const [{ default: esriId }, { default: OAuthInfo }, { default: Portal }] = await Promise.all([
          import('@arcgis/core/identity/IdentityManager'),
          import('@arcgis/core/identity/OAuthInfo'),
          import('@arcgis/core/portal/Portal'),
        ]);

        esriId.registerOAuthInfos([
          new OAuthInfo({
            appId: AUTH.appId,
            portalUrl: AUTH.portalUrl,
            popup: false, // бүтэн хуудсаар чиглүүлнэ — статик сайтад callback хуудас хэрэггүй
            flowType: 'authorization-code', // PKCE — client secret-гүй, SPA-д аюулгүй
          }),
        ]);

        // Нэвтэрсэн эсэх. Аль хэдийн нэвтэрсэн (эсвэл OAuth-аас буцаж ирсэн) бол
        // энэ шийдэгдэнэ; үгүй бол catch руу унаж, нэвтрэх дэлгэц гарна.
        await esriId.checkSignInStatus(sharingUrl());

        const portal = new Portal({ url: AUTH.portalUrl });
        await portal.load();
        const u = portal.user;
        const info: User = {
          username: u?.username ?? '',
          fullName: u?.fullName || u?.username || '',
          thumbnail: u?.thumbnailUrl ?? null,
          orgId: u?.orgId ?? null,
        };

        // allowedOrgId бөглөхөд туслах: нэвтэрсэн хэрэглэгчийн orgId-г консолд хэвлэнэ
        console.info('[selbe] нэвтэрсэн:', info.username, '· orgId:', info.orgId);

        if (!alive) return;
        setUser(info);
        setStatus(AUTH.allowedOrgId && info.orgId !== AUTH.allowedOrgId ? 'denied' : 'signed-in');
      } catch {
        if (alive) setStatus('signed-out');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
      // popup:false тул энэ нь хуудсыг ArcGIS нэвтрэлт рүү чиглүүлж, буцаж ирнэ
      await esriId.getCredential(sharingUrl());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нэвтрэх боломжгүй байна.');
    }
  };

  const signOut = async () => {
    const { default: esriId } = await import('@arcgis/core/identity/IdentityManager');
    esriId.destroyCredentials();
    location.reload();
  };

  if (status === 'signed-in') return <>{children}</>;

  return (
    <div className={s.screen}>
      <div className={s.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className={s.logo} />
        <div className={s.title}>Сэлбэ портал</div>

        {status === 'checking' && (
          <>
            <p className={s.sub}>Нэвтрэлт шалгаж байна…</p>
            <span className={s.spinner} aria-hidden />
          </>
        )}

        {status === 'signed-out' && (
          <>
            <p className={s.sub}>
              Үргэлжлүүлэхийн тулд байгууллагынхаа ArcGIS Online бүртгэлээр нэвтэрнэ үү.
            </p>
            <button type="button" className={s.btn} onClick={signIn}>
              ArcGIS Online-аар нэвтрэх
            </button>
            {error && <p className={s.error}>{error}</p>}
          </>
        )}

        {status === 'denied' && (
          <>
            {user && (
              <div className={s.user}>
                {user.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.thumbnail} alt="" className={s.avatar} />
                )}
                <div style={{ textAlign: 'left' }}>
                  <div className={s.userName}>{user.fullName}</div>
                  <div className={s.userSub}>{user.username}</div>
                </div>
              </div>
            )}
            <p className={s.sub}>
              Энэ бүртгэл танай байгууллагын хэрэглэгч биш тул хандах эрхгүй байна.
            </p>
            <button type="button" className={s.btnGhost} onClick={signOut}>
              Өөр бүртгэлээр нэвтрэх
            </button>
          </>
        )}
      </div>
    </div>
  );
}
