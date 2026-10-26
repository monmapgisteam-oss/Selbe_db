/**
 * САНХҮҮЖИЛТИЙН EXCEL ЗОХИОМЖ — хувийн ХЭМЖЭЭС (0–100 · 0–1) ба хасагдсан багана (2026-10-21).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/finExcelLayout.check.mjs
 *
 * ⚠️ Хамгаалж буй алдаа (аудит 2026-10-21):
 *   · `urdchilgaa_huvi` амьд өгөгдөлд 0–1 БУТАРХАЙ (58 мөр, max 0.2 — `urdchilgaa_batalgaa_dun ÷ geree_dun`)
 *     атал `FIN_XL_PCT` (0–100)-д байсан тул «Хувь» багана «0.2», зурваст «0.18», засварт «20» зөвшөөрөгдөж
 *     0.2 ба 20 холилддог байв. Одоо `FIN_XL_FRACTION` — үнэт цаасны хувьтай ижил зам (×100 харагдац, ÷100 засвар).
 *   · `tusuld_ezleh_huvi` (текст) нь тоон ихрээсээ 0.715 дахин бага ХУУЧИРСАН хуулбар — нуусан биш, багана биш
 *     (`FIN_XL_DROP`).
 * ⚠️ `Finance.tsx` нь React тул ажиллуулж шалгахгүй — холболтыг ЭХ КОДООР тулгана (`finEdit.check.mjs`-ийн арга).
 * ⚠️ 2026-10-22 (аудит): ×100 · жигнэсэн дундажийн ДҮРМИЙГ бүтээгдэхүүний цэвэр функцээр (`finXl*`, `finExcelLayout.ts`)
 *    амьд хэлбэрийн 0–1 утгаар шалгана (§2). Урьд энд дунджийг ТЕСТ ӨӨРӨӨ дахин бодож, `Finance.tsx`-ийн мөрийг
 *    regex-ээр тулгадаг байв — бүтээгдэхүүний дүрэм өөрчлөгдсөн ч ногоон хэвээр үлдэнэ. §4 нь зөвхөн холболт.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIN_XL_PCT, FIN_XL_FRACTION, FIN_XL_DROP, FIN_XL_HIDE, FIN_XL_ORDER, FIN_XL_PCT_WEIGHT,
  finXlIsFraction, finXlScale, finXlFractionText, finXlEditText, finXlIsMean, finXlWeightedMean,
} from '@/lib/finExcelLayout';
import { parseFinanceShare } from '@/lib/finEdit';
import { pct } from '@/lib/format';

let ok = 0;
const check = (label, cond) => { assert.ok(cond, '✗ ' + label); ok += 1; console.log('  ✓ ' + label); };

console.log('\n1. ХЭМЖЭЭС — 0–100 ба 0–1 жагсаалт зөрөхгүй');
check('FIN_XL_PCT нь амьдаар 0–100 байдаг 6 талбар', [...FIN_XL_PCT].sort().join(',')
  === ['guitsetgel_huvi', 'tezu', 'ajliin_zurag_tusul', 'gazar_chuluulult', 'zuwshuurul', 'songon_shalgaruulalt'].sort().join(','));
check('urdchilgaa_huvi (0–1) FIN_XL_PCT-д БАЙХГҮЙ', !FIN_XL_PCT.includes('urdchilgaa_huvi'));
check('FIN_XL_FRACTION = үнэт цаасны хувь + урьдчилгааны хувь', FIN_XL_FRACTION.join(',') === 'zahiramj_unet_tsaas_huvi,urdchilgaa_huvi');
check('хоёр жагсаалт огтлолцохгүй', FIN_XL_FRACTION.every((f) => !FIN_XL_PCT.includes(f)));
check('жин нь ХО дүн', FIN_XL_PCT_WEIGHT === 'ho_dun_geree');

console.log('\n2. АМЬД УТГААР — бүтээгдэхүүний функцээр (0–1 бутархай; `Finance.tsx` эдгээрийг дууддаг)');
{
  /* Амьд Guitsetgel_talbe/182-ийн ялгаатай утгууд: 0.2 · 0.164 · 0.08807975 · 0.199 · null; жин = ho_dun_geree */
  const rows = [
    { urdchilgaa_huvi: 0.2, ho_dun_geree: 100 },
    { urdchilgaa_huvi: 0.164, ho_dun_geree: 300 },
    { urdchilgaa_huvi: 0.08807975, ho_dun_geree: 50 },
    { urdchilgaa_huvi: null, ho_dun_geree: 200 }, // хэмжилтгүй — хуваарьт ч, хүртвэрт ч орохгүй
    { urdchilgaa_huvi: 0.199, ho_dun_geree: 0 },  // жингүй — орохгүй
  ];
  /* зурвас (`sumText`): жигнэсэн дундаж */
  const mean = finXlWeightedMean(rows, 'urdchilgaa_huvi');
  check('жигнэсэн дундаж 0.1636 (бутархай)', mean != null && Math.abs(mean - 0.163564) < 1e-5);
  check('хэмжилтгүй · жингүй мөр нөлөөгүй (эхний 3 мөртэй ЯГ ижил)', mean === finXlWeightedMean(rows.slice(0, 3), 'urdchilgaa_huvi'));
  check('орох мөргүй → null (зурвас хоосон, 0 БИШ)',
    finXlWeightedMean(rows.slice(3), 'urdchilgaa_huvi') === null && finXlWeightedMean([], 'urdchilgaa_huvi') === null);
  check('0–100 хувь (FIN_XL_PCT) хэмжээсээ хадгална — 30%·500 + 100%·1 → 30.14',
    Math.abs(finXlWeightedMean([{ guitsetgel_huvi: 30, ho_dun_geree: 500 }, { guitsetgel_huvi: 100, ho_dun_geree: 1 }], 'guitsetgel_huvi') - 30.1397) < 1e-3);
  check('дундаж багана = FIN_XL_PCT + FIN_XL_FRACTION; мөнгө · эзлэх хувийн дүн — нийлбэр',
    [...FIN_XL_PCT, ...FIN_XL_FRACTION].every(finXlIsMean) && !finXlIsMean(FIN_XL_PCT_WEIGHT) && !finXlIsMean('tusuld_ezleh_huvi_dun'));
  /* харагдац (`fmtCell`) · тоон шүүлт (`shareScale`): ×100 */
  check('харагдац ×100 → 16.4% (0.2% БИШ)', finXlFractionText(mean) === pct(16.3564, 1) && finXlFractionText(mean) !== pct(0.1636, 1));
  check('харагдац: амьд max 0.2 → «20.0%»', finXlFractionText(0.2) === pct(20, 1));
  check('0–100 мужид', mean * 100 > 0 && mean * 100 <= 100);
  check('бутархай талбар = FIN_XL_FRACTION', FIN_XL_FRACTION.every(finXlIsFraction) && !FIN_XL_PCT.some(finXlIsFraction));
  check('тоон шүүлтийн хэмжээс: бутархай 100, 0–100 хувь · мөнгө 1',
    finXlScale('urdchilgaa_huvi') === 100 && finXlScale('zahiramj_unet_tsaas_huvi') === 100
    && finXlScale('guitsetgel_huvi') === 1 && finXlScale(FIN_XL_PCT_WEIGHT) === 1);
  /* засвар (`editTextF`) ×100 → хадгалах (`parseFinanceShare`) ÷100 */
  check('засварын текст ×100: 0.2 → «20», 0.164 → «16.4», 0.07 → «7» (хөвөгч сүүлгүй)',
    finXlEditText(0.2, 'urdchilgaa_huvi') === '20' && finXlEditText(0.164, 'urdchilgaa_huvi') === '16.4'
    && finXlEditText(0.07, 'zahiramj_unet_tsaas_huvi') === '7');
  check('засварын текст: 0–100 талбар · тоо биш → null (`editText`-ийн зам)',
    finXlEditText(55, 'guitsetgel_huvi') === null && finXlEditText(null, 'urdchilgaa_huvi') === null
    && finXlEditText('0.2', 'urdchilgaa_huvi') === null && finXlEditText(Number.NaN, 'urdchilgaa_huvi') === null);
  check('хадгалах ÷100: «20» → 0.2 (амьд max 0.2-той нэг хэмжээс)', parseFinanceShare('20', 'esriFieldTypeDouble', 'Хувь') === 0.2);
  check('бүтэн тойрог: 0.2 → засвар «20» → хадгалах 0.2',
    parseFinanceShare(finXlEditText(0.2, 'urdchilgaa_huvi'), 'esriFieldTypeDouble', 'Хувь') === 0.2);
  let rejected = false;
  try { parseFinanceShare('120', 'esriFieldTypeDouble', 'Хувь'); } catch { rejected = true; }
  check('хадгалах: 0–100-аас гадуур («120») татгалзана — 0.2 ба 20 холилдохгүй', rejected);
}

console.log('\n3. ХАСАГДСАН БАГАНА — хуучирсан текстэн хуулбар');
check('FIN_XL_DROP = tusuld_ezleh_huvi', FIN_XL_DROP.join(',') === 'tusuld_ezleh_huvi');
check('FIN_XL_HIDE-д байхгүй (нуугдсан биш, огт багана биш)', !FIN_XL_HIDE.includes('tusuld_ezleh_huvi'));
check('FIN_XL_ORDER-т ХЭВЭЭР (эрэмбийн хувилбар хөдлөхгүй)', FIN_XL_ORDER.includes('tusuld_ezleh_huvi'));
check('urdchilgaa_huvi анхдагчаар нуугдсан хэвээр', FIN_XL_HIDE.includes('urdchilgaa_huvi') && FIN_XL_HIDE.includes('cashflow_id'));
check('тоон ихэр нуугдахгүй', !FIN_XL_HIDE.includes('tusuld_ezleh_huvi_dun') && !FIN_XL_DROP.includes('tusuld_ezleh_huvi_dun'));

console.log('\n4. Finance.tsx — бутархай хувийн ЗАМ §2-ын функцүүдэд холбогдсон (дотоод хуулбаргүй)');
{
  /* ⚠️ 2026-10-22 (аудит): дүрмийг өөрийг нь §2 шалгана; энд зөвхөн `Finance.tsx` тэдгээрийг дуудаж, ДАХИН бичээгүйг
     тайлбаргүй эх кодоор тулгана. */
  const src = readFileSync(new URL('../modules/Finance.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('fmtCell → finXlFractionText', /if \(finXlIsFraction\(name\)\) return \{ text: finXlFractionText\(x\), num: true \};/.test(src)
    && !src.includes('if (name === CASHFLOW_NEW.fields.share) return'));
  check('shareScale (тоон шүүлт) → finXlScale', src.includes('const shareScale = finXlScale;'));
  check('editTextF (засварын текст) → finXlEditText', src.includes('finXlEditText(v, name) ?? editText(v, type)'));
  check('sumText → finXlIsMean · finXlWeightedMean', src.includes('if (finXlIsMean(c.name)) {')
    && src.includes('finXlWeightedMean(rows.map((p) => p.row), c.name)'));
  check('×100 · жигнэлтийн ДОТООД хуулбар алга', !src.includes('pct(x * 100') && !src.includes('toPrecision(12)') && !/top \+= g \* v/.test(src));
  check('isPctField 0–100 мужийн шалгалт', src.includes("f === 'cashflow_huwi' || FIN_XL_PCT.includes(f) || FIN_XL_FRACTION.includes(f);"));
  check('нийтлэл: pend ба adds хоёулаа parseFinanceShare (÷100)',
    (src.match(/FIN_XL_FRACTION\.includes\(fld\)\s*\?\s*parseFinanceShare\(v, typeOf\(fld\), labelOf\(fld\), legacyShareInvalidRef\.current, PARSE_MSG\)/g) ?? []).length === 2);
  check('sumText: үнэт цаасны хувийн зурвас хоосон хэвээр (дунджаас ӨМНӨ)',
    src.includes("if (c.name === CASHFLOW_NEW.fields.share) return '';")
    && src.indexOf("if (c.name === CASHFLOW_NEW.fields.share) return '';") < src.indexOf('if (finXlIsMean(c.name)) {'));
  check('ноорог v3 — FIN_XL_FRACTION-аар сэргээнэ', src.includes('upgradeFinanceDraft(offer, CASHFLOW_NEW.fields.share, FIN_XL_FRACTION)'));
  check('allCols: FIN_XL_DROP багана болохгүй', src.includes('...FIN_XL_CODE, ...FIN_XL_DROP,'));
}

console.log(`\n✅ finExcelLayout.check: ${ok} шалгуур давлаа`);
