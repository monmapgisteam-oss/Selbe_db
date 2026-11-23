/**
 * НООРОГИЙН ХҮСНЭГТИЙН (191) ЦЭВЭРЛЭГЭЭ — хугацаа дууссан (7 хоног) tombstone (`ustgal`) · илгээлтийн баримт (`barimt`) ·
 * хоосолсон мөрийг БҮХ багцын ноорогоос устгана. Хөтөч эдгээрийг зөвхөн тэр багц дахин бичигдэхэд цэвэрлэдэг тул
 * нээгдэхгүй багцын мөр хуримтлагддаг. Дүрэм нь хөтчийнхтэй нэг (`draftRows.gcExpired`); илгээлтийн мөр, толгой хөндөгдөхгүй.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/draft-gc.mjs            — зөвхөн тоолно (анхдагч)
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/draft-gc.mjs --write    — устгана
 *
 * Токен: `ARCGIS_SYNC_USER` + `ARCGIS_SYNC_PASS` эсвэл `ARCGIS_ADMIN_TOKEN` (`sync-all.mjs`-тэй ижил). Утгыг хэзээ ч логлохгүй.
 * `sync-all.mjs`-ээс нэмэлт алхам болгон `draftGc({ write })`-ийг дуудаж болно (токен аль хэдийн залгагдсан үед).
 */
import { pathToFileURL } from 'node:url';

/** Цэвэрлэгээ — `write` худал бол зөвхөн тоолно. Токен залгалтыг дуудагч хийсэн байна. */
export async function draftGc({ write = false, max } = {}) {
  const { gcAllDrafts } = await import('../src/lib/draftRowsRemote.ts');
  return gcAllDrafts({ write, max });
}

/** Тайлангийн мөр (`sync-all`-ийн `step`-д ч тохирно) */
export function draftGcReport(r, write) {
  const top = Object.entries(r.byDkey).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(' · ');
  return `шалгасан ${r.scanned} · хугацаа дууссан ${r.expired} · ${write ? `устгасан ${r.deleted} · унасан ${r.failed}` : 'устгаагүй (--write-гүй)'}${top ? ` — ${top}` : ''}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const WRITE = process.argv.includes('--write');
  const { installTokenInjection, installWriteGuard, loadAdminTokens } = await import('./liveFetch.mjs');
  process.env.NEXT_PUBLIC_AUTH_OFF = '1';
  const token = async () => {
    const u = process.env.ARCGIS_SYNC_USER;
    const p = process.env.ARCGIS_SYNC_PASS;
    const portal = (process.env.NEXT_PUBLIC_ENT_PORTAL_URL || process.env.NEXT_PUBLIC_PORTAL_URL || '').replace(/\/+$/, '');
    if (u && p && portal) {
      const r = await fetch(`${portal}/sharing/rest/generateToken`, {
        method: 'POST',
        body: new URLSearchParams({ f: 'json', username: u, password: p, client: 'referer', referer: portal, expiration: '60' }),
      });
      const j = await r.json();
      if (!j.token) throw new Error(`generateToken: ${j.error?.message ?? 'токен ирсэнгүй'}`);
      return { tok: j.token, tok2: '', tok2Svc: [] };
    }
    const t = loadAdminTokens();
    if (!t.tok) throw new Error('Токен алга: ARCGIS_SYNC_USER/ARCGIS_SYNC_PASS эсвэл ARCGIS_ADMIN_TOKEN тохируулна уу');
    return t;
  };
  /* Хуурай горимд бичилтийг сүлжээний түвшинд ч хаана */
  if (!WRITE) installWriteGuard({ stubAppTables: false });
  installTokenInjection(await token());
  try {
    const r = await draftGc({ write: WRITE });
    console.log(`${WRITE ? '🧹' : '🔎'} Ноорогийн цэвэрлэгээ: ${draftGcReport(r, WRITE)}`);
    if (r.failed) process.exit(1);
  } catch (e) {
    console.error(`❌ Ноорогийн цэвэрлэгээ: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
