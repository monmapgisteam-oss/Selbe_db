/**
 * ТУХ — БАГЦ БҮРИЙН НЭМЭЛТ СЭДВҮҮД (2026-11-23): газар чөлөөлөлт · зөвшөөрөл · ХАБЭА · нэмэлт ажил · блокийн явц ба дулаан.
 * Бүгд системийн одоо байгаа ачаалагчаас; нэг нь унавал бусад нь хэвээр (`failed`-д нэрлэнэ). Түлхүүр — `bagtsKey`.
 */

import { t as tr } from '@/lib/i18nCore';
import { bagtsKey, buildingKey, BUILDING } from '@/lib/services';
import { dayOf } from '@/lib/zuragTosol';

export type TuhPermit = { name: string; status: 'ok' | 'wait' | 'no' | 'unknown'; date: number | null };
export type TuhSafety = { total: number; recent: number; byType: { type: string; n: number }[]; last: number | null };
export type TuhBlock = { block: string; households: number | null; pct: number | null; heatPlan: string; heatDone: string };

export type TuhExtra = {
  /** Багцын талбайд давхцсан, чөлөөлөгдөөгүй нэгж талбарын тоо; `null` утга — тэр багцын давхцал ачаалагдсангүй */
  land: Map<string, number | null> | null;
  permits: Map<string, TuhPermit[]> | null;
  safety: Map<string, TuhSafety> | null;
  /** Батлагдахыг хүлээж буй нэмэлт ажлын хүсэлт */
  ajilPending: Map<string, number> | null;
  /** Орон сууцны багцын блокууд — явц, дулааны огноо */
  blocks: Map<string, TuhBlock[]> | null;
  failed: string[];
};

const RECENT_DAYS = 30;
const DAY = 86_400_000;

async function settle<T>(name: string, p: () => Promise<T>, failed: string[]): Promise<T | null> {
  try { return await p(); } catch { failed.push(name); return null; }
}

export async function loadTuhExtra(now = Date.now()): Promise<TuhExtra> {
  const failed: string[] = [];
  const [overlaps, zov, safety, pending, prog, heat] = await Promise.all([
    settle(tr('Газар чөлөөлөлт'), async () => (await import('@/lib/pkgSaad')).loadPkgOverlaps(), failed),
    /* 2026-11-24 (аудит): ТТБ-ийн мөр + бүртгэл (`loadPermitRows`) — удирдлагын тайлан, CEO самбартай НЭГ эх. `null` = унасан */
    settle(tr('Зөвшөөрөл'), async () => {
      const z = await (await import('@/lib/zovshoorol')).loadPermitRows();
      if (z == null) throw new Error('zov');
      return z;
    }, failed),
    settle(tr('ХАБЭА'), async () => (await import('@/lib/ceo/safety')).loadSafetyRows(), failed),
    settle(tr('Нэмэлт ажил'), async () => (await import('@/lib/ajilBatlah')).loadAllPending(), failed),
    settle(tr('Блокийн явц'), async () => (await import('@/lib/blockProgress')).loadBlockProgress(), failed),
    settle(tr('Блок · дулаан'), async () => (await import('@/modules/DulaanOgnoo')).loadHeatRows(), failed),
  ]);

  /* Нэг багцын давхцал унасан бол «давхцал алга» биш — `null` (харагдахдаа «—») ба анхааруулгын мөрөнд нэрлэнэ */
  const land = overlaps ? new Map<string, number | null>(overlaps.map((o) => [o.key, o.failed ? null : o.oids.length] as const)) : null;
  if (overlaps?.some((o) => o.failed)) failed.push(tr('Газар чөлөөлөлт'));

  let permits: TuhExtra['permits'] = null;
  if (zov) {
    const { TOLOV } = await import('@/lib/zovshoorol');
    permits = new Map();
    for (const z of zov) {
      const k = bagtsKey(z.bagts);
      if (!k) continue;
      const st: TuhPermit['status'] = z.tolov === TOLOV.ok ? 'ok' : z.tolov === TOLOV.wait ? 'wait' : z.tolov === TOLOV.no ? 'no' : 'unknown';
      const a = permits.get(k) ?? [];
      a.push({ name: z.ner || z.selbe || '—', status: st, date: z.ognoo });
      permits.set(k, a);
    }
  }

  let safetyMap: TuhExtra['safety'] = null;
  if (safety) {
    safetyMap = new Map();
    for (const r of safety) {
      const k = bagtsKey(r.bagts);
      if (!k) continue;
      const cur = safetyMap.get(k) ?? { total: 0, recent: 0, byType: [], last: null };
      cur.total += 1;
      if (r.ognoo != null && r.ognoo <= now && now - r.ognoo <= RECENT_DAYS * DAY) cur.recent += 1;
      if (r.ognoo != null && (cur.last == null || r.ognoo > cur.last)) cur.last = r.ognoo;
      const t = r.turul || tr('Тодорхойгүй');
      const hit = cur.byType.find((x) => x.type === t);
      if (hit) hit.n += 1; else cur.byType.push({ type: t, n: 1 });
      safetyMap.set(k, cur);
    }
  }

  /* Илгээлтийн `pkgKey` нь хуудасны түлхүүр (`b1_9f`) — ТУХ-ийн багцтай БҮЛГЭЭР (`pkgGroup` «Багц-1») тулгана; 9/12 давхар нийлнэ */
  const ajilPending = pending ? pending.reduce((m, s) => {
    const k = bagtsKey(s.pkgGroup);
    return k ? m.set(k, (m.get(k) ?? 0) + 1) : m;
  }, new Map<string, number>()) : null;

  let blocks: TuhExtra['blocks'] = null;
  if (heat) {
    const F = BUILDING.fields;
    blocks = new Map();
    for (const r of heat) {
      const k = bagtsKey(String(r[F.bagts] ?? ''));
      if (!k) continue;
      const bp = prog?.get(buildingKey(r[F.bagts], r[F.block]));
      const hh = r[F.households] == null || r[F.households] === '' ? null : Number(r[F.households]);
      const a = blocks.get(k) ?? [];
      a.push({
        block: String(r[F.block] ?? '—'),
        households: Number.isFinite(hh) ? hh : null,
        pct: bp ? bp.overall : prog ? 0 : null,
        heatPlan: dayOf(r[F.heatPlan] as number | null),
        heatDone: dayOf(r[F.heatDone] as number | null),
      });
      blocks.set(k, a);
    }
    for (const a of blocks.values()) a.sort((x, y) => x.block.localeCompare(y.block, 'mn', { numeric: true }));
  }

  return { land, permits, safety: safetyMap, ajilPending, blocks, failed };
}
