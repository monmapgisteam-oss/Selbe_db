/**
 * ҮЕРИЙН ЗАГВАРЧЛАЛ — голын оролт ба усны хадгалалтын регресс (2026-09-30).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/uyrSim.check.mjs
 *
 * ⚠️ Юуг барих гэсэн юм бэ:
 *   1. `pickInlets` — голын урсац ХӨНДИЙН ЁРООЛООР (гадны ус орж ирэх ирмэг)
 *      орно. Урьд нь «ирмэгийн өндрийн медианаас дээш» хаалга хөндийн ёроолыг
 *      тасалж, энгэрийн салангид 8 нүдэнд урсацын 1/8-ийг цутгадаг байв; MFD
 *      хуримтлалыг хөршийнхтэй харьцуулбал ГАРАЛТЫН нүд (урсгал хуваагддаг)
 *      оролт мэт харагддаг.
 *   2. Гол татагдсан ч талбайд ОРООГҮЙ бол голын оролт ҮГҮЙ.
 *   3. `limitOutflow` — нүднээс нэг алхамд байгаа уснаас ИЛҮҮ гарахгүй (урьд нь
 *      нүүр тус бүрийн тагтай тул 4 нүүр тус бүр бүтэн нүдийг урсгаж, сөрөг
 *      гүнийг 0 болгоход УС ҮҮСДЭГ байв).
 *   4. Бүтэн загварчлал (DSM офлайн) — NaN-гүй, хүрээ нь торны БОДИТ хамралт
 *      (`N·f` багана, 640-ын 639), голын оролт байгаа үед `peakQ` бичигдэнэ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickInlets, limitOutflow, hydroQ, peakInflow } from '@/lib/uyrSim';
import { transferList } from '@/lib/uyrSimCore';

/* ══════════ 0. Гидрограф — оргил ЯГ peakQ (2026-10-01) ══════════ */
{
  const total = 3600;
  const peak = peakInflow(25);
  let mx = 0;
  for (let t = 0; t <= total; t += 1) mx = Math.max(mx, hydroQ(peak, t, total));
  assert.ok(Math.abs(mx - peak) < 1e-6 * peak, `оргил ${mx} ≠ ${peak} (урьд нь 1.08×)`);
  /* Яг tp = 0.3·T агшинд оргил */
  assert.ok(Math.abs(hydroQ(peak, 0.3 * total, total) - peak) < 1e-9);
  /* Эхлэлд суурь урсац (8%) — тэг биш */
  assert.ok(hydroQ(peak, 0, total) > 0.07 * peak && hydroQ(peak, 0, total) < 0.09 * peak);
}

/* ══════════ 0б. Ажилтны transfer жагсаалт — давхардалгүй (DataCloneError) ══════════ */
{
  const a = new Float32Array(4);
  const out = {
    meta: {}, buf: new ArrayBuffer(8),
    extra: {
      terrainZ: new Float32Array(1), bedZ: new Float32Array(1), maxDepth: new Float32Array(1),
      maxSpeed: new Float32Array(1), arrivalS: new Float32Array(1), accHa: a, catchHa: a,
      channelMask: new Uint8Array(1),
    },
  };
  const tl = transferList(out);
  assert.equal(new Set(tl).size, tl.length, 'transfer жагсаалтад давхар буфер');
  assert.equal(tl.length, 8, 'buf + 7 өвөрмөц буфер');
}
import { fillSinks, flowAccum } from '@/lib/uyrHydro';

/* ══════════ 1. pickInlets — синтетик хөндий ══════════
   Хойноос урагш уруудах хөндий (x = 20 орчим), хоёр талдаа өндөр энгэр.
   Судалгааны талбай (rainDom) нь торны дунд тэгш өнцөгт: y 10…29, x 8…31. */
const N = 40;
const P = N * N;
const z = new Float32Array(P);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    z[y * N + x] = 100 - y * 0.5 + Math.abs(x - 20) * 0.8;
  }
}
const valid = new Uint8Array(P).fill(1);
const rainDom = new Uint8Array(P);
for (let y = 10; y < 30; y++) for (let x = 8; x < 32; x++) rainDom[y * N + x] = 1;
const zf = fillSinks(z, N, valid);
const acc = flowAccum(zf, N, undefined, valid);
{
  const inl = pickInlets(N, rainDom, zf, acc, null, valid);
  assert.ok(inl.length >= 1 && inl.length <= 8, `оролтын тоо ${inl.length}`);
  for (const i of inl) {
    const x = i % N;
    const y = (i / N) | 0;
    assert.ok(rainDom[i], 'оролт талбайн дотор');
    /* Хойд (дээд урсгал) ирмэг, хөндийн ёроолын орчим — урд (гаралт) ирмэг БИШ */
    assert.ok(y <= 12, `оролт хойд ирмэгт биш: (${x},${y})`);
    assert.ok(Math.abs(x - 20) <= 4, `оролт хөндийн ёроолоос хол: (${x},${y})`);
  }
  /* Нэг бөөгнөрөл — хоорондын зай ≤ 8 нүд */
  const xs = inl.map((i) => i % N);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 8, 'оролт салангид');
}

/* ══════════ 2. Гол татагдсан ч талбайд ороогүй → оролтгүй; голтой бол голын дагуу ══════════ */
{
  const river = new Uint8Array(P);
  for (let y = 0; y < N; y++) river[y * N + 36] = 1;          // талбайн ГАДНА (x = 36)
  assert.deepEqual(pickInlets(N, rainDom, zf, acc, river, valid), [], 'голгүй талбайд оролт гарав');
  const river2 = new Uint8Array(P);
  for (let y = 0; y < N; y++) river2[y * N + 20] = 1;         // хөндийн ёроолоор
  const inl = pickInlets(N, rainDom, zf, acc, river2, valid);
  assert.ok(inl.length > 0, 'голтой талбайд оролт алга');
  assert.ok(inl.every((i) => ((i / N) | 0) <= 12), 'голын оролт хойд ирмэгт биш');
}

/* ══════════ 3. limitOutflow — ус үүсэхгүй ══════════ */
{
  const n = 5;
  const d = new Float32Array(n * n);
  const qx = new Float32Array(n * n);
  const qy = new Float32Array(n * n);
  const c = 2 * n + 2;          // төвийн нүд
  d[c] = 0.1;
  const dt = 1;
  const dx = 10;
  /* 4 нүүр тус бүр нүдийг БҮТНЭЭР нь урсгах хэмжээтэй (нүүрийн таг давхцана) */
  const full = (0.1 * dx) / dt;
  qx[c] = full;                 // зүүн → баруун (гарна)
  qx[c - 1] = -full;            // баруун → зүүн (гарна)
  qy[c] = full;                 // урагш (гарна)
  qy[c - n] = -full;            // хойш (гарна)
  /* Хөршөөс ОРЖ ирэх урсгал — хөндөгдөх ёсгүй */
  d[c + 2] = 1;
  qx[c + 1] = -0.3;             // c+2 → c+1 (c+2-ийн гаралт, багтана)
  limitOutflow(qx, qy, d, n, dt, dx);
  const out = (qx[c] - qx[c - 1] + qy[c] - qy[c - n]) * dt / dx;
  assert.ok(out <= d[c] + 1e-6, `гаралт ${out} > ${d[c]}`);
  assert.ok(Math.abs(out - d[c]) < 1e-6, 'гаралт бүрэн хасагдаагүй — хэт багасгав');
  assert.equal(qx[c + 1], Math.fround(-0.3), 'багтах гаралтыг хөндлөө');
  /* Шинэчлэлийн дараа гүн сөрөг БИШ */
  const nd = d[c] + (qx[c - 1] - qx[c] + qy[c - n] - qy[c]) * dt / dx;
  assert.ok(nd >= -1e-6, `сөрөг гүн ${nd}`);
  /* Хуурай нүд — юу ч өөрчлөгдөхгүй */
  const q2 = new Float32Array(n * n);
  limitOutflow(q2, new Float32Array(n * n), new Float32Array(n * n), n, dt, dx);
  assert.ok(q2.every((v) => v === 0));
}

/* ══════════ 4. Бүтэн загварчлал — офлайн DSM ══════════ */
{
  const PUB = new URL('../../public', import.meta.url);
  const ctx = () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {},
  });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: ctx }) };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/uyr/')) return new Response(readFileSync(new URL(`.${url.split('?')[0]}`, `${PUB.href}/`)));
    /* ⚠️ Голын давхарга (сүлжээ) — офлайн тул татагдахгүй: загварчлал голгүй үргэлжлэх ёстой */
    throw new TypeError('offline');
  };
  try {
    const { simulateFlood } = await import('@/lib/uyrSim');
    const meta = JSON.parse(readFileSync(new URL('./public/uyr/selbe-dsm.json', new URL('../../', import.meta.url)), 'utf8'));
    const fd = await simulateFlood(1);
    const m = fd.meta;
    const f = Math.max(1, Math.round(meta.grid / 192));
    const k = (m.width * f) / meta.grid;
    const e = meta.extent;
    assert.ok(Math.abs(m.extent.xmax - (e.xmin + (e.xmax - e.xmin) * k)) < 1e-6, 'хүрээ торны хамралттай таарахгүй');
    assert.ok(Math.abs(m.extent.ymin - (e.ymax - (e.ymax - e.ymin) * k)) < 1e-6);
    assert.equal(m.extent.xmin, e.xmin);
    assert.equal(m.extent.ymax, e.ymax);
    let nan = 0;
    let wet = 0;
    for (let i = 0; i < m.width * m.height; i++) {
      const v = fd.maxDepth(i);
      if (!Number.isFinite(v)) nan++;
      if (v >= m.wetM) wet++;
    }
    assert.equal(nan, 0, 'NaN/Infinity гүн');
    assert.ok(wet > 100, `усанд автсан нүд хэт цөөн: ${wet}`);
    assert.ok(Number.isFinite(m.peakDepthM) && m.peakDepthM < 20, `дээд гүн ${m.peakDepthM}`);
    /* Голгүй (офлайн) ч хөндийгөөр ирэх оролт олдоно → оролтын урсац бичигдэнэ */
    assert.equal(m.peakQ, 97.3);
    assert.equal(m.hydroQ?.length, m.slices);
    /* ⚠️ 2026-10-01: гидрографын оргил ≤ peakQ (урьд нь 1.08×), оролтын нүд метад */
    assert.ok(Math.max(...m.hydroQ) <= m.peakQ + 1e-9, `гидрограф оргилоос хэтэрлээ: ${Math.max(...m.hydroQ)}`);
    assert.ok(Math.max(...m.hydroQ) > m.peakQ * 0.9, 'гидрографын оргил хэт бага');
    assert.ok(Array.isArray(m.inlets) && m.inlets.length > 0 && m.inlets.length <= 8, 'оролтын нүд метад алга');
    for (const i of m.inlets) assert.ok(i >= 0 && i < m.width * m.height);
    /* Маскгүй хуримтлал (`catchHa`) нь попапын тайлбарт; зурсан талбайгүй үед `accHa`-тай ижил */
    assert.equal(typeof fd.catchHa, 'function');
    assert.equal(fd.catchHa(1234), fd.accHa(1234));
    /* Ирэх хугацааны горим: растер зурагдана (canvas стуб) — алдаагүй */
    fd.frame(5, 0.5, 0, 'arrival');
    fd.frame(5, 0.5, 0, 'hazard');

    /* ⚠️ 2026-10-01: хэт жижиг талбай — цөмийн `SimError` орчуулагдаж ирнэ */
    const e0 = m.extent;
    const cx = (e0.xmin + e0.xmax) / 2;
    const cy = (e0.ymin + e0.ymax) / 2;
    const tiny = [[[cx, cy], [cx + 30, cy], [cx + 30, cy + 30], [cx, cy + 30], [cx, cy]]];
    await assert.rejects(simulateFlood(1, undefined, tiny), /хэт жижиг/);

    /* ⚠️ 2026-10-01: цуцлалт — `AbortError` (дуудагч чимээгүй алгасна) */
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(simulateFlood(1, undefined, null, ac.signal), (er) => er.name === 'AbortError');
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('uyrSim.check ✔');
