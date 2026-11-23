/**
 * НООРОГИЙН ХҮСНЭГТИЙН (191) ЦЭВЭРЛЭГЭЭ — хугацаа дууссан (7 хоног) tombstone (`ustgal`) · илгээлтийн баримт (`barimt`) ·
 * хоосолсон мөрийг БҮХ багцын ноорогоос устгана. Хөтөч эдгээрийг зөвхөн тэр багц дахин бичигдэхэд цэвэрлэдэг тул
 * нээгдэхгүй багцын мөр хуримтлагддаг. Дүрэм нь хөтчийнхтэй нэг (`draftRows.gcExpired`); илгээлтийн мөр, толгой хөндөгдөхгүй.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/draft-gc.mjs            — зөвхөн тоолно (анхдагч)
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs tools/draft-gc.mjs --write    — устгана
 *
 * Токен: `ARCGIS_SYNC_USER` + `ARCGIS_SYNC_PASS` эсвэл `ARCGIS_ADMIN_TOKEN`. Утгыг хэзээ ч логлохгүй.
 */
import { pathToFileURL } from 'node:url';

/** Цэвэрлэгээ — `write` худал бол зөвхөн тоолно. Токен залгалтыг дуудагч хийсэн байна. */
export async function draftGc({ write = false, max } = {}) {
  const { gcAllDrafts } = await import('../src/lib/draftRowsRemote.ts');
  return gcAllDrafts({ write, max });
}

/** Тайлангийн мөр */
export function draftGcReport(r, write) {
  const top = Object.entries(r.byDkey).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(' · ');
  return `шалгасан ${r.scanned} · хугацаа дууссан ${r.expired} · ${write ? `устгасан ${r.deleted} · унасан ${r.failed}` : 'устгаагүй (--write-гүй)'}${top ? ` — ${top}` : ''}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const WRITE = process.argv.includes('--write');
  const { installTokenInjection, installWriteGuard, syncToken } = await import('./liveFetch.mjs');
  process.env.NEXT_PUBLIC_AUTH_OFF = '1';
  /* Хуурай горимд бичилтийг сүлжээний түвшинд ч хаана */
  if (!WRITE) installWriteGuard({ stubAppTables: false });
  /* 2026-11-24 (засвар): `liveFetch.syncToken` — нэг токены функц — referer токенд `Referer` толгой хүсэлт бүрд */
  installTokenInjection(await syncToken());
  try {
    const r = await draftGc({ write: WRITE });
    console.log(`${WRITE ? '🧹' : '🔎'} Ноорогийн цэвэрлэгээ: ${draftGcReport(r, WRITE)}`);
    if (r.failed) process.exit(1);
  } catch (e) {
    console.error(`❌ Ноорогийн цэвэрлэгээ: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
