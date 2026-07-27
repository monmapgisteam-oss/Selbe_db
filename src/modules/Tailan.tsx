'use client';

/**
 * ТАЙЛАН — тайлангийн хуудас (порталын зураг/самбаргүй, бүрэн дэлгэц).
 *
 * ⚠️ Одоохондоо агуулгагүй ХООСОН суурь: товч ба харагдацыг нэмэв. Тайлангийн
 * бодит агуулга (хүснэгт, график, экспорт) дараа энд орно.
 */
export function Tailan() {
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        textAlign: 'center',
        color: 'var(--ink-3)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 650, color: 'var(--ink)' }}>Тайлан</h2>
        <p style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
          Тайлангийн хуудас. Агуулгыг удахгүй нэмнэ.
        </p>
      </div>
    </div>
  );
}
