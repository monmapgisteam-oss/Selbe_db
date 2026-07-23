/** Портал даяар хэрэглэх дүрсүүд (24×24, stroke) */

const P: Record<string, string> = {
  frame: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M9 9h6v6H9z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  building: 'M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 11h.01M12 11h.01M16 11h.01',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11zM12 10h.01',
  calc: 'M5 3h14v18H5zM9 7h6M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  network: 'M6 3v4M18 3v4M6 21v-4M18 21v-4M3 9h4M17 9h4M3 15h4M17 15h4M9 9h6v6H9z',
  radio: 'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  pen: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  chart: 'M3 21h18M6 21V11M11 21V4M16 21v-6M21 21v-9',

  /* ── Инженерийн багцын дүрсүүд ──
     ⚠️ Дээрх ерөнхий дүрсүүд (network, grid, layers) нь «дулаан уу, ус уу,
     цахилгаан уу» гэдгийг ялгахгүй. Багц бүр өөрийн салбарын танил тэмдэгтэй
     байх нь жагсаалтыг нүдээр гүйлгэхэд шууд ялгагдана.
     ⚠️ Зам зурах алгоритм нь `M`-ээр л таслах тул нэг ч сегмент `M`-гүй
     эхэлж болохгүй — доорх бүх зам үүнийг баримтална. */
  flame: 'M12 22a6 6 0 0 0 6-6c0-4-3-6.5-4-9-1.5 1.5-1 3.5-2 4.5-1-1-1.5-2-1.5-3.5C8 10 6 12.5 6 16a6 6 0 0 0 6 6z',
  droplet: 'M12 3c3.2 3.6 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 2.8-6.4 6-10z',
  waves: 'M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 20c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  road: 'M6 3 4 21M18 3l2 18M12 4v3M12 11v3M12 18v3',
  bus: 'M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M4 11h16M8 17v2M16 17v2M4 17h16M8.5 14h.01M15.5 14h.01',
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  );
}
