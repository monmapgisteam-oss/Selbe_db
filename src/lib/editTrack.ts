/**
 * ИМПОРТЫН АГШНЫ ЗАСВАРЫН МӨШГӨЛТ — Enterprise-ийн амьд `created_date`/`last_edited_date` (2026-10-26, хуучин
 * `entMap.entTrackFix`-ийн ҮЛДЭГДЭЛ — нэрийн хөрвүүлэлт БИШ, утгын засвар).
 *
 * ⚠️ ЯАГААД: gdb-ээс Enterprise руу ачаалахад (2026-10-20) амьд editor tracking бүх мөрд импортын агшин
 *    (2026-10-20 08:4x UTC · tumenjargal_selbe) болж дарагдсан; AGOL-ын ЖИНХЭНЭ утга хуучин `creationdate` ·
 *    `creator` · `editdate` · `editor` баганад үлдсэн. Засахгүй бол хүлээгдэж буй зөвшөөрөл «0 хоног», «сүүлд хэн
 *    зассан» бүгд tumenjargal_selbe гэж худал гарна. Амьд огноо энэ цонхонд байвал (= импортын утга) хуучин баганын
 *    утгыг авна; дараа нь Enterprise дээр засагдсан мөрд амьд утга хэвээр.
 * ⚠️ ХҮСНЭГТГҮЙ: хуучин багана нь ХАРИУН ДАХЬ мөрд байвал л (`outFields: '*'` эсвэл дуудагч ил асуусан) засна.
 *    `Guitsetgel_talbe/183` · `selbe_ET/114`-д AGOL-ын мөшгөлт `*_1` байсан бөгөөд энгийн `creationdate`/`editdate`
 *    нь мөшгөлтийн БУС тусдаа багана — тиймээс `*_1` ЭХЛЭЖ (байвал) авна. Survey123 (`service_*`) ба HET-ийн
 *    давхаргад хуучин багана байхгүй → юу ч хийхгүй.
 * ⚠️ Ил `outFields`-тэй дуудагч хуучин баганыг `trackStatOf(fields, live)`-ээр (давхаргын МЕТАНЫ бодит талбараас)
 *    олж өөрөө нэмнэ (жиш. `ceo/land.fetchParcels`). Статистик (`max(last_edited_date)`) засагдахгүй — урьдын адил.
 */
export const IMPORT_FROM = Date.UTC(2026, 9, 20, 0, 0, 0);
export const IMPORT_TO = Date.UTC(2026, 9, 20, 12, 0, 0);

type Pair = { date: string; user: string; oldDate: readonly string[]; oldUser: readonly string[] };
const PAIRS: readonly Pair[] = [
  { date: 'created_date', user: 'created_user', oldDate: ['creationdate_1', 'creationdate'], oldUser: ['creator_1', 'creator'] },
  { date: 'last_edited_date', user: 'last_edited_user', oldDate: ['editdate_1', 'editdate'], oldUser: ['editor_1', 'editor'] },
];

/** Нэг мөрийн атрибутыг ГАЗАР ДЭЭР нь засна (цэвэр — тест) */
export function fixImportStamp(attrs: Record<string, unknown>): void {
  for (const p of PAIRS) {
    const live = attrs[p.date];
    if (typeof live !== 'number' || live < IMPORT_FROM || live > IMPORT_TO) continue;
    const dk = p.oldDate.find((k) => attrs[k] != null);
    if (!dk) continue;
    attrs[p.date] = attrs[dk];
    if (p.user in attrs) {
      const uk = p.oldUser.find((k) => attrs[k] != null);
      if (uk) attrs[p.user] = attrs[uk];
    }
  }
}

/** Асуулгын хариуны `features[].attributes` бүрт (бусад хариуг хөндөхгүй) */
export function fixImportStamps<T>(body: T): T {
  const f = (body as { features?: unknown } | null)?.features;
  if (Array.isArray(f)) {
    for (const x of f as { attributes?: Record<string, unknown> }[]) {
      if (x && x.attributes && typeof x.attributes === 'object') fixImportStamp(x.attributes);
    }
  }
  return body;
}

/** Амьд мөшгөлтийн талбарын ХУУЧИН (AGOL-ын эх утгатай) хос багана — давхаргын бодит талбаруудаас; алга бол `null` */
export function trackStatOf(fields: readonly string[], live: string): string | null {
  const p = PAIRS.find((x) => x.date === live || x.user === live);
  if (!p) return null;
  const cands = p.date === live ? p.oldDate : p.oldUser;
  return cands.find((c) => fields.includes(c)) ?? null;
}
