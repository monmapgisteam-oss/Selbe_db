'use client';

/**
 * ГИДРОЛОГИЙН ГИНЖИН ХЭЛХЭЭ — ArcGIS Pro / Spatial Analyst-ийн зарчмаар.
 *
 * ══════════════════ ЯАГААД ЭНЭ МОДУЛЬ ══════════════════
 *
 * ArcGIS Pro-д «Flood Simulation» гэсэн тусдаа модуль БАЙХГҮЙ (2026-09-10-нд
 * суулгацыг шалгав: `Spatial Analyst Tools.tbx` дотор ердөө `Fill`,
 * `FlowDirection`, `FlowAccumulation`, `DeriveContinuousFlow`, `Watershed` —
 * бүгд native C++, Python эх кодгүй). Үерийн ЛОГИК нь яг эдгээрийн ГИНЖИН
 * ХЭЛХЭЭ бөгөөд түүнийг энд хэрэгжүүлнэ:
 *
 *     Fill  →  FlowDirection (MFD)  →  FlowAccumulation (ЖИНТЭЙ)
 *
 * ══════════════════ ЭНЭ ЮУГ ЗАСАХ ВЭ ══════════════════
 *
 * ⚠️ Хэрэглэгчийн 2026-09-09-ны гол шүүмж: «ус зөвхөн тодорхой хэсэгт урсаад
 * байна», «яагаад энэ хэсэг үерлэснийг ойлгохгүй байна».
 *
 * Шалтгаан нь: жигд бороо (4 см) нь нүд БҮРД ижил хэмжээгээр нэмэгддэг тул
 * уулын энгэр дээр 2–4 см-ийн хальс болж, «нойтон» босгыг давдаггүй. Гэтэл
 * БОДИТ байдал дээр 40 га энгэрийн ус нэг жалгаар цуглаж урсдаг — тэр жалга
 * нь ЖИНХЭНЭ горхи болно.
 *
 * `FlowAccumulation` нь яг үүнийг тоолно: нүд БҮРД хэдэн га талбайн ус
 * цуглаж байгааг. Түүнээс:
 *
 *   · СУВГИЙН СҮЛЖЭЭ гарна   → Маннингийн барзгар байдлыг зөв өгнө
 *   · ЭХЛЭЛИЙН УС гарна      → жалга, горхи эхнээсээ усаа агуулна
 *   · ТАЙЛБАР гарна          → «энэ цэгт 42 га талбайн ус цуглана»
 *
 * ⚠️ ЭНЭ НЬ ДИНАМИК ШИЙДЛИЙГ ОРЛОХГҮЙ. Гүн, хурд, чиглэл, хугацаа бүгд
 * `uyrSim.ts`-ийн 2D инерцийн шийдлээс гарна. Энд бодогдох нь зөвхөн
 * (1) хонхор дүүргэсэн гадаргуу, (2) хураах талбай, (3) сувгийн сүлжээ —
 * ArcGIS-д ч яг ийм: гидрологийн растерууд нь загварчлалын ОРОЛТ.
 */

/** Хөршийн 8 чиглэл: [dx, dy, зай] — диагональ нь √2 дахин хол */
const NB: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * ХОНХОР ДҮҮРГЭХ — Priority-Flood (Barnes нар, 2014).
 *
 * ArcGIS-ийн `Fill` хэрэгслийн үр дүнтэй ижил: битүү хонхрыг тэдгээрийн гарах
 * цэгийн түвшин хүртэл өргөнө.
 *
 * ⚠️ ДАВТАЛТАТ арга (хөршийн min-ээр өргөх) нь УДААН ба ТОГТВОРГҮЙ: гүн, өргөн
 * хонхор дээр хэдэн зуун давталт шаардаж, тогтмол давталтын тоо (12) дээр
 * ДУТУУ дүүрдэг. Priority-Flood нь нэг удаагийн O(n log n) — үр дүн нь ЯГ
 * ЗӨВ бөгөөс хурдан.
 *
 * ⚠️ `eps` (1 мм) нь ЗААВАЛ: яг тэгш талбай үүсвэл урсгалын чиглэл
 * тодорхойгүй болж, дараагийн алхмууд (MFD) ус хөдөлгөхгүй.
 *
 * @param z    эх өндөр (өөрчлөгдөхгүй)
 * @param mask 1 = домэйн; домэйны ГАДНА нүд нь ГАРЦ гэж тооцогдоно
 */
export function fillSinks(
  z: Float32Array, N: number, mask?: Uint8Array, eps = 0.001,
): Float32Array {
  const P = N * N;
  const out = new Float32Array(P);
  const done = new Uint8Array(P);
  /** Хамгийн бага элементийн бинар овоо: [z, index] хосууд */
  const hz: number[] = [];
  const hi: number[] = [];
  const push = (zz: number, i: number) => {
    hz.push(zz);
    hi.push(i);
    let c = hz.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hz[p] <= hz[c]) break;
      [hz[p], hz[c]] = [hz[c], hz[p]];
      [hi[p], hi[c]] = [hi[c], hi[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = hi[0];
    const lz = hz.pop()!;
    const li = hi.pop()!;
    if (hz.length) {
      hz[0] = lz;
      hi[0] = li;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < hz.length && hz[l] < hz[m]) m = l;
        if (r < hz.length && hz[r] < hz[m]) m = r;
        if (m === c) break;
        [hz[m], hz[c]] = [hz[c], hz[m]];
        [hi[m], hi[c]] = [hi[c], hi[m]];
        c = m;
      }
    }
    return top;
  };

  /* ── Эхлэл: домэйны ЗАХЫГ овоонд хийнэ (эндээс ус гарна) ── */
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const inDom = !mask || mask[i] === 1;
      if (!inDom) { out[i] = z[i]; done[i] = 1; continue; }
      let edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      if (!edge && mask) {
        for (const [dx, dy] of NB) {
          if (!mask[(y + dy) * N + (x + dx)]) { edge = true; break; }
        }
      }
      if (edge) {
        out[i] = z[i];
        done[i] = 1;
        push(z[i], i);
      }
    }
  }
  /* ⚠️ Зах олдоогүй бол (домэйн бүхэлдээ хаалттай) дүүргэх утгагүй */
  if (!hz.length) return Float32Array.from(z);

  while (hz.length) {
    const i = pop();
    const x = i % N;
    const y = (i / N) | 0;
    for (const [dx, dy] of NB) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx;
      if (done[j]) continue;
      /* ⚠️ Хөрш нь ЭНЭ нүднээс нам бол ӨРГӨНӨ — энэ нь дүүргэлт өөрөө */
      out[j] = Math.max(z[j], out[i] + eps);
      done[j] = 1;
      push(out[j], j);
    }
  }
  return out;
}

/**
 * ХУРААХ ТАЛБАЙ — `FlowAccumulation`, MFD (олон чиглэлт) урсгалаар.
 *
 * ArcGIS-ийн `FlowAccumulation` + `FlowDirection MFD`-тэй ижил зарчим: нүд
 * бүрийн ус нь БҮХ доош налуу хөрш рүү налуугийн жингээр хуваарилагдана.
 *
 *     жин_i ∝ (tanβ_i)^p · L_i
 *
 * ⚠️ ЯАГААД D8 БИШ ВЭ: D8 нь бүх усыг ГАНЦ хөрш рүү илгээдэг тул энгэр дээр
 * нэг нүдний өргөнтэй ХИЙМЭЛ шугам үүсгэдэг ба хажуугийн нүд нь хуурай
 * үлдэнэ. Хотын үерийн зурагт энэ нь «яагаад энэ гудамж үерлээд хажуугийнх нь
 * үгүй вэ» гэсэн ХУДАЛ хариулт болно. MFD нь энгэр дээр тархааж, жалгад
 * нийлүүлдэг — бодит зурагтай тохирно.
 *
 * ⚠️ `p = 1.1` (Freeman 1991, Quinn 1991). ArcGIS нь налуугаас хамаарсан
 * ДАСАН ЗОХИЦОХ `p` хэрэглэдэг (Qin нар 2007) — эгц газар D8 руу, хавтгай
 * газар тархалт руу ойртуулна. Тогтмол 1.1 нь тэр хоёрын дундаж зан гаргах ба
 * хэрэгжүүлэхэд энгийн, тогтвортой.
 *
 * @param zf     ДҮҮРГЭСЭН өндөр (`fillSinks`-ийн гаралт)
 * @param weight нүд бүрийн ЖИН (ArcGIS-ийн `in_weight_raster`). Байхгүй бол 1
 *   — тэр тохиолдолд гаралт нь «хэдэн нүдний ус цуглав» гэсэн тоо болно.
 * @returns нүд бүрд ЦУГЛАРСАН жин (өөрийнх нь жинг ОРУУЛААД)
 */
export function flowAccum(
  zf: Float32Array, N: number, weight?: Float32Array, mask?: Uint8Array,
): Float32Array {
  const P = N * N;
  const acc = new Float32Array(P);
  for (let i = 0; i < P; i++) acc[i] = weight ? weight[i] : 1;

  /**
   * ⚠️ ӨНДРӨӨР БУУРУУЛЖ эрэмбэлнэ. Дүүргэсэн гадаргуу дээр ус хэзээ ч ӨӨД
   * урсахгүй тул нэг дамжилтаар (өндөр → нам) бүх хуримтлал зөв бодогдоно.
   * Рекурс, давталт хэрэггүй.
   */
  const order = new Int32Array(P);
  for (let i = 0; i < P; i++) order[i] = i;
  const sorted = Array.from(order).sort((a, b) => zf[b] - zf[a]);

  const p = 1.1;
  const w: number[] = [];
  const nb: number[] = [];
  for (const i of sorted) {
    if (mask && !mask[i]) continue;
    const a = acc[i];
    if (a <= 0) continue;
    const x = i % N;
    const y = (i / N) | 0;
    w.length = 0;
    nb.length = 0;
    let tot = 0;
    for (const [dx, dy, L] of NB) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx;
      if (mask && !mask[j]) continue;
      const drop = zf[i] - zf[j];
      if (drop <= 0) continue;
      /* ⚠️ Налууг ЗАЙД хуваана — диагональ хөрш 1.41 дахин хол */
      const ww = Math.pow(drop / L, p) * (L === 1 ? 0.5 : 0.354);
      if (ww <= 0) continue;
      w.push(ww);
      nb.push(j);
      tot += ww;
    }
    if (!tot) continue;               // хамгийн нам цэг — ус энд үлдэнэ
    for (let k = 0; k < nb.length; k++) acc[nb[k]] += (a * w[k]) / tot;
  }
  return acc;
}

/**
 * СУВГИЙН СҮЛЖЭЭ — `DeriveStreamAsRaster`-ийн зарчим: хураах талбай нь
 * босгоос давсан нүд бол суваг.
 *
 * ⚠️ Босго нь ГА-гаар өгөгдөнө, нүдээр БИШ: торны нүд өөрчлөгдөхөд (12.7 м →
 * 16.9 м) нүдээр өгсөн босго чимээгүй утгаа алддаг.
 *
 * @param accCells `flowAccum`-ийн гаралт ЖИНГҮЙ (нүдний тоо)
 * @param cellHa   нэг нүдний талбай (га)
 * @param thHa     суваг гэж үзэх доод хураах талбай (га)
 */
export function streamMask(
  accCells: Float32Array, cellHa: number, thHa: number,
): Uint8Array {
  const m = new Uint8Array(accCells.length);
  const th = thHa / cellHa;
  for (let i = 0; i < accCells.length; i++) m[i] = accCells[i] >= th ? 1 : 0;
  return m;
}
