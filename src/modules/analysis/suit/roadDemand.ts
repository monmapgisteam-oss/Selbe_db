/**
 * ЗАМЫН ЭРЭЛТ — барилгын машин-зорчилтыг замын сүлжээнд хуваарилна.
 *
 * Барилга бүрийн төв цэгээс ХАМГИЙН ОЙРЫН 3 замын хэрчимд `ROAD_WEIGHTS`
 * (50% / 30% / 20%) жингээр тарааж, хэрчим бүрийн эрэлтийг нэгтгэнэ.
 */

import { ROAD_MAX_DIST_M, ROAD_WEIGHTS } from '@/lib/analysis/transport';
import { distToPath, type Network, type Pt } from './traffic';
import type { BuildingPt } from './buildings';

/** Нэг барилгын замд холбогдсон байдал */
export type BuildingLink = {
  /** Хуваарилагдсан ирмэгийн индексүүд (ойроос хол руу, дээд тал нь 3) */
  edges: number[];
  /** Тэдгээр ирмэг хүртэлх зай — БОДИТ метр */
  distsM: number[];
};

export type RoadDemand = {
  /** Ирмэг бүрийн машин-зорчилт (индекс = `net.edges`-ийн индекс) */
  edgeDemand: Float64Array;
  /** Хамгийн өндөр эрэлттэй ирмэгийн утга — нормчилол ба легендэд */
  max: number;
  /** Замд хуваарилагдсан нийт машин-зорчилт */
  assigned: number;
  /** Барилга бүрийн холболт (индекс = `buildings`-ийн индекс); холбогдоогүй бол `null` */
  links: (BuildingLink | null)[];
  /**
   * 150 м дотор зам ОЛДООГҮЙ барилгуудын индекс.
   */
  unlinked: number[];
};

/**
 * Цэгээс хамгийн ойрын `k` ирмэгийг олно (зайгаар эрэмбэлсэн).
 */
function nearestEdges(
  p: Pt,
  net: Network,
  k: number,
  maxDist: number,
): { i: number; d: number }[] {
  /** Хамгийн ойрын k-г ӨСӨХ дарааллаар барих жижиг жагсаалт */
  const best: { i: number; d: number }[] = [];
  for (let i = 0; i < net.edges.length; i++) {
    if (net.edges[i].dup) continue;
    const d = distToPath(p, net.edges[i].pts);
    if (d > maxDist) continue;
    if (best.length === k && d >= best[k - 1].d) continue;
    let j = best.length;
    while (j > 0 && best[j - 1].d > d) j--;
    best.splice(j, 0, { i, d });
    if (best.length > k) best.pop();
  }
  return best;
}

/**
 * Барилгуудын машин-зорчилтыг замын сүлжээнд хуваарилна.
 */
export function assignRoadDemand(net: Network, buildings: BuildingPt[]): RoadDemand {
  const edgeDemand = new Float64Array(net.edges.length);
  const links: (BuildingLink | null)[] = new Array(buildings.length).fill(null);
  const unlinked: number[] = [];
  // Зай нь ПРОЕКЦЫН нэгжээр гардаг тул босгыг мөн тэр нэгжид хөрвүүлнэ
  const upm = net.unitsPerMeter || 1;
  const maxDist = ROAD_MAX_DIST_M * upm;
  let assigned = 0;

  for (let b = 0; b < buildings.length; b++) {
    const bld = buildings[b];
    const near = nearestEdges([bld.x, bld.y], net, ROAD_WEIGHTS.length, maxDist);

    if (!near.length) {
      if (bld.vehTrips > 0) unlinked.push(b);
      continue;
    }

    links[b] = { edges: near.map((n) => n.i), distsM: near.map((n) => n.d / upm) };
    if (bld.vehTrips <= 0) continue;

    const wSum = near.reduce((a, _, i) => a + ROAD_WEIGHTS[i], 0);
    for (let i = 0; i < near.length; i++) {
      const share = (bld.vehTrips * ROAD_WEIGHTS[i]) / wSum;
      edgeDemand[near[i].i] += share;
      assigned += share;
    }
  }

  let max = 0;
  for (const v of edgeDemand) if (v > max) max = v;
  return { edgeDemand, max, assigned, links, unlinked };
}

/** Эрэлтийг 0..1 болгож нормчилно (өнгөний шатлалд). Хязгаар нурсан бол 0. */
export const demandNorm = (v: number, max: number): number =>
  max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
