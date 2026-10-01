/**
 * «ЭРСДЭЛИЙН ЗАГВАР» ХАРАГДАЦЫН РЕГРЕСС (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/ersdelUi.check.mjs
 *
 * Хамгаалж буй алдаанууд (засвар бүр `⚠️ 2026-09-30` тэмдэгтэй):
 *   1. Загварчлалын мужийн өнгө 'var(--…)' → `Overlay.rgb()` NaN → муж ЦАГААН.
 *   2. Шинжилгээ өөрөө асаасан давхаргууд дараагийн шинжилгээг ЗӨВХӨН тэднээр хязгаарладаг.
 *   3. Цаг хугацааны агшинд хуурай ч ус ирэх нүдэнд «Энэ цэгт ус ирээгүй»; хуучин усны зам үлддэг.
 *   4. АЧИ-ийн цагираг «12%» (АЧИ 60) гэж бичдэг.
 *   5. Харуулын давхарга унавал ҮЕРИЙН шинжилгээний товч мөнхөд хаагддаг.
 *   6. Үерийн легенд растер гарсан ч хохирлын шинжилгээ хүлээдэг.
 *   7. «Аюул» легенд 2.5 м²/с гэдэг атал ангилал 2.0-оос «Онц аюултай».
 *   8. Хувилбарын мөр «оргил урсац 26 м³/с» ↔ доорх «97.3 м³/с оргил урсац».
 *   9–13 (2026-10-01, «хэрэглэгч: бүгдийг зас»): FD2321 аюулын зэрэглэл · «Ирэх
 *      хугацаа» горим · оролтын тэмдэг · кэш/харьцуулалт/экспорт · вэб ажилтан.
 * ⚠️ 1–6 нь React/ArcGIS-ийн холболт тул ЭХ КОДООР шалгана (Node-д газрын зураг зурагдахгүй);
 *    7–8 нь жинхэнэ функцээр.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HAZARD_CLASS, HAZARD_EXTREME, HAZARD_LEGEND, SATURATE_HAZ,
  arrivalColor, debrisFactor, hazardColor, hazardRating,
} from '@/lib/uyr';
import { scenarioNote } from '@/lib/ersdel';

const src = readFileSync(new URL('./Ersdel.tsx', import.meta.url), 'utf8');
const ov = readFileSync(new URL('./ersdel/Overlay.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./ersdel.module.css', import.meta.url), 'utf8');

/* 1. Мужийн өнгө HEX; `rgb()` HEX бишийг улаан руу ухраана */
assert.ok(!src.includes('hue: lv?.color'), 'мужийн өнгө LEVELS-ийн CSS хувьсагчаас');
assert.ok(/if \(!\/\^\[0-9a-f\]\{6\}\/i\.test\(h\)\) return \[220, 38, 38\];/.test(ov), 'Overlay.rgb хамгаалалтгүй');

/* 2. Автоматаар асаасан давхарга `activeIds`-аас хасагдана, каталог хэрэглэгчийн сонголтыг бичнэ */
assert.ok(src.includes('if (autoOn.current.has(l.id)) return;'));
assert.ok(src.includes('visible.filter((id) => !autoOn.current.has(id))'));
assert.ok(src.includes('setVisible={setVisibleUser}'));

/* 3. «Одоогоор ус алга» + дээд гүн/ирэх хугацаа; үерийн бус даралт замыг цэвэрлэнэ */
assert.ok(src.includes("tr('Одоогоор ус алга')"));
assert.ok(src.includes("if (!p || p.kind !== 'flood') setPath(null);"));

/* 4. АЧИ-ийн цагираг — «%» биш АЧИ-ийн тоо.
   ⚠️ 2026-10-01: CSS заль (`--aqi-text`) → `Ring`-ийн `text` проп */
assert.ok(src.includes('text={num(aqi)}'), 'АЧИ цагираг `text` пропгүй');
assert.ok(!src.includes("'--aqi-text':") && !css.includes('.aqiRing {'), 'хуучин CSS заль үлдэв');

/* 5. Шинжилгээний хоёр товч — харуул зөвхөн агаарт шаардлагатай */
const gates = src.match(/disabled=\{busy \|\| !view \|\| \(hazard === 'air' && q\.state !== 'ready'\)\}/g) ?? [];
assert.equal(gates.length, 2, 'шинжилгээний товчны нөхцөл');
assert.ok(!/disabled=\{busy \|\| !view \|\| q\.state !== 'ready'\}/.test(src));

/* 6. Легенд — растерын нөхцөлтэй ижил (`wantFlood && flood`) */
assert.ok(src.includes('windFlow || (wantFlood && !!flood)) && ('));
assert.ok(!src.includes("result?.hazard === 'flood' && flood"), 'легенд хохирлын шинжилгээг хүлээсээр');

/* 7. «Онц аюултай» босго = өнгөний ханалт = легенд */
assert.equal(SATURATE_HAZ, HAZARD_EXTREME);
assert.equal(HAZARD_CLASS(HAZARD_EXTREME).label, 'Онц аюултай');
assert.notEqual(HAZARD_CLASS(HAZARD_EXTREME - 0.01).label, 'Онц аюултай');

/* 9. ⚠️ 2026-10-01: DEFRA FD2321 — HR = d·(v+0.5)+DF, 4 ангилал */
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(debrisFactor(0.25), 0);
  assert.equal(debrisFactor(0.26), 0.5);
  assert.equal(debrisFactor(0.75), 0.5);
  assert.equal(debrisFactor(0.76), 1);
  assert.ok(near(hazardRating(0.2, 0), 0.1));
  assert.ok(near(hazardRating(0.3, 0.5), 0.8));
  assert.ok(near(hazardRating(1.5, 0), 1.75), 'зогсонги гүн ус');
  assert.equal(hazardRating(0, 3), 0, 'хуурай нүд');
  assert.equal(HAZARD_CLASS(hazardRating(0.2, 0)).label, 'Бага');
  assert.equal(HAZARD_CLASS(hazardRating(0.3, 0.5)).label, 'Дунд');
  /* ⚠️ Хуучин `d × v`-ээр 1.5 м ЗОГСОНГИ ус «Бага» гардаг байв — одоо «Өндөр» */
  assert.equal(HAZARD_CLASS(hazardRating(1.5, 0)).label, 'Өндөр');
  assert.equal(HAZARD_CLASS(hazardRating(1, 1.5)).label, 'Онц аюултай');
  assert.equal(HAZARD_CLASS(0.75).label, 'Дунд');
  assert.equal(HAZARD_CLASS(1.25).label, 'Өндөр');
  assert.equal(HAZARD_CLASS(0.7499).label, 'Бага');
  /* Легенд ↔ ангилал ↔ растерын өнгө нэг */
  const leg = HAZARD_LEGEND();
  assert.equal(leg.length, 4);
  for (const [hr, k] of [[0.1, 0], [1, 1], [1.5, 2], [3, 3]]) {
    assert.equal(HAZARD_CLASS(hr).color, leg[k].color);
    assert.equal(HAZARD_CLASS(hr).label, leg[k].label);
    const rgb = hazardColor(hr / SATURATE_HAZ);
    const hex = `#${rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    assert.equal(hex, leg[k].color, `растерын өнгө HR=${hr}`);
  }
  assert.ok(src.includes('hazardRating(d, sp)'), 'попап HR-ээр');
  assert.ok(!src.includes('HAZARD_CLASS(d * sp)'), 'хуучин d×v ангилал үлдэв');
  assert.ok(src.includes('HAZARD_LEGEND().map'), 'аюулын легенд ангиллаар');
}

/* 10. ⚠️ 2026-10-01: «Ирэх хугацаа» горим + легенд, CSS шатлал = uyr.ts */
{
  assert.ok(src.includes("['arrival', tr('Ирэх хугацаа')]"));
  assert.ok(src.includes("tr('Ус ирэх хугацаа')"));
  for (const t of [0, 1 / 3, 2 / 3, 1]) {
    const c = arrivalColor(t).join(',');
    assert.ok(css.replace(/\s/g, '').includes(`rgb(${c})`), `rampArrival-д ${c} алга`);
  }
}

/* 11. ⚠️ 2026-10-01: оролтын нүд + гидрографын тэмдэг газрын зурагт (`ersdel:` угтвар) */
assert.ok(ov.includes("const INLET_ID = 'ersdel:inlet';"));
assert.ok(ov.includes("tr('Голын оролт · {0} м³/с'"));
assert.ok(/mk\(INLET_ID\)/.test(ov));

/* 12. ⚠️ 2026-10-01: загварчлалын кэш, харьцуулалт, ETA, экспорт, эрэмбэ */
assert.ok(src.includes('const hit = simCache.current.get(key);'), 'кэш');
assert.ok(src.includes('const compareAll = useCallback'), 'түвшний харьцуулалт');
assert.ok(src.includes("tr('Үерийг бодож байна… {0}% · ~{1} с үлдлээ'"), 'ETA');
assert.ok(src.includes('damageCsv(exportRows())') && src.includes('damageGeoJSON(exportRows()'), 'экспорт');
assert.ok(src.includes("toggleSort('depth')"), 'дээд гүнээр эрэмбэлэх');
assert.ok(src.includes('hazardPolygon(fd)'), 'мөрийг хялбарчилж асуулгад');

/* 13. ⚠️ 2026-10-01: үерийн загварчлал ВЭБ АЖИЛТАНД (Next статик экспортын хэлбэр) */
{
  const sim = readFileSync(new URL('../lib/uyrSim.ts', import.meta.url), 'utf8');
  assert.ok(sim.includes("new Worker(new URL('./uyrSim.worker.ts', import.meta.url), { type: 'module' })"));
  assert.ok(sim.includes("typeof Worker === 'undefined'"), 'ажилтангүй орчинд ухрах');
  const core = readFileSync(new URL('../lib/uyrSimCore.ts', import.meta.url), 'utf8');
  /* Цөмд DOM/tr/сүлжээ орохгүй — ажилтан ачаалах агшинд унана */
  assert.ok(!/from '@\/lib\/i18nCore'|document\.|window\.|fetch\(/.test(core), 'цөм цэвэр биш');
}

/* 8. Хувилбарын мөр — лавлагааны урсац (загварын оргил БИШ) */
for (const lv of [1, 2, 3]) {
  const s = scenarioNote('flood', lv);
  assert.ok(s.includes('лавлагааны урсац'), s);
  assert.ok(!s.includes('оргил урсац'), s);
}

console.log('ersdelUi.check: OK');
