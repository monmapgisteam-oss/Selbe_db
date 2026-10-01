/**
 * РЕЛЕНИЙ ХУРДНЫ ХЯЗГААР — `server.mjs` ба `worker.mjs`-ийн ХУВААЛЦСАН цөм (⚠️ 2026-10-01).
 *
 * ⚠️ ШИЙДВЭР («хэрэглэгч: бүгдийг зас»):
 *    · БАТАЛГААЖСАН ArcGIS ХЭРЭГЛЭГЧ бүрд минутад 40 (`LIMITS.user`) — гол хязгаар;
 *    · IP бүрд минутад 300 (`LIMITS.ip`) — ӨНДӨР таг. Урьд IP-ийн «урьдчилсан»
 *      хязгаар ч 40 байсан тул НЭГ IP-ийн ард (оффисын NAT) суугаа бүх ажилтан нийлээд
 *      минутад 40-д баригдаж (агентын нэг асуулт 2–5 хүсэлт), 10 хүн зэрэг асуухад
 *      429 авдаг байв;
 *    · АМЖИЛТГҮЙ НЭВТРЭЛТ IP бүрд минутад 20 (`LIMITS.authFail`) — хүчингүй токентой
 *      үер бүр ArcGIS-ийн `/community/self` руу хүсэлт үүсгэдэг тул (амжилтгүйг
 *      кэшлэдэггүй) хязгаарт хүрсэн IP-ийн шалгалтыг ArcGIS руу ЯВУУЛАХГҮЙ.
 * ⚠️ Санах ойн тоолуур — Worker-ийн isolate солигдоход тэглэгдэнэ (`worker.mjs`-ийн ⚠️).
 * ⚠️ Хуучирсан түлхүүрийг цонх тутам нэг удаа цэвэрлэнэ — Map өсөхгүй (2026-09-15-ны аудит).
 */

export const WINDOW_MS = 60 * 1000;

export const LIMITS = Object.freeze({
  /** Баталгаажсан хэрэглэгч (эсвэл баталгаажуулалтгүй горимд IP) — минутад */
  user: 40,
  /** IP-ийн таг — оффисын NAT-ын ард олон хэрэглэгч хуваалцана */
  ip: 300,
  /** Амжилтгүй нэвтрэлт IP бүрд */
  authFail: 20,
});

/**
 * Гулсах цонхтой тоолуур. `now` — тестэд цаг солих.
 *   · `hit(key, limit)` — хүсэлтийг ТООЛООД хязгаар ХЭТЭРСЭН эсэх (`true` → 429);
 *   · `full(key, limit)` — ТООЛОХГҮЙгээр хязгаарт ХҮРСЭН эсэх (амжилтгүй нэвтрэлтийн
 *     шалгалтыг ArcGIS руу явуулахаас ӨМНӨ).
 */
export function createLimiter({ windowMs = WINDOW_MS, now = Date.now } = {}) {
  const hits = new Map();
  let lastSweep = 0;
  const sweep = (t) => {
    if (t - lastSweep <= windowMs) return;
    for (const [k, arr] of hits) {
      if (!arr.length || t - arr[arr.length - 1] >= windowMs) hits.delete(k);
    }
    lastSweep = t;
  };
  const recent = (key, t) => (hits.get(key) || []).filter((x) => t - x < windowMs);
  return {
    hit(key, limit) {
      const t = now();
      sweep(t);
      const arr = recent(key, t);
      arr.push(t);
      hits.set(key, arr);
      return arr.length > limit;
    },
    full(key, limit) {
      const t = now();
      sweep(t);
      return recent(key, t).length >= limit;
    },
    size: () => hits.size,
  };
}
