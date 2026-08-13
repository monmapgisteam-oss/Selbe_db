/**
 * АГЕНТЫН БҮРЭН ГИНЖНИЙ ТЕСТ — LLM-ийн ТҮЛХҮҮРГҮЙГЭЭР.
 *
 * Загварыг хуурамч сервереэр орлуулж, бусад БҮХ холбоосыг БОДИТООР шалгана:
 *
 *   тест → [бодит реле] → [хуурамч LLM]        ← хүсэлтийн бүтэц шалгагдана
 *        → [бодит бүртгэл: LAYERS/DATASETS]     ← заавар зөв угсрагдсан эсэх
 *        → [бодит tools.ts → бодит ArcGIS]      ← тоо үнэхээр татагдаж байна уу
 *
 * ⚠️ ЮУГ ШАЛГАХГҮЙ ВЭ: загвар ЗӨВ эх сурвалж/талбар сонгож байгаа эсэхийг.
 * Тэр нь зөвхөн жинхэнэ загвартай шалгагдана — энэ тест түүнийг НОТЛОХГҮЙ.
 *
 * Ажиллуулах:  npm run test:agent
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const MOCK_PORT = 8799;
const RELAY_PORT = 8788;

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

/* ── 1. Хуурамч Anthropic ── */

/** Реле рүү ирсэн хүсэлтүүд — бүтцийг нь дараа шалгана */
let seen = [];
/** Загварын хариултын СЦЕНАР — дараалан идэгдэнэ */
let script = [];

const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push(JSON.parse(body || '{}'));
    const blocks = script.shift() ?? [{ type: 'text', text: 'сценар дууслаа' }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_test_${seen.length}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        stop_reason: blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: blocks,
      }),
    );
  });
});

/* ── 2. Бодит реле (хуурамч Anthropic руу чиглүүлсэн) ── */

let relay;

async function startRelay() {
  relay = spawn(process.execPath, ['agent-proxy/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(RELAY_PORT),
      ALLOW_ORIGIN: 'http://localhost:8123',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write(`[relay] ${d}`));

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${RELAY_PORT}/health`);
      if (r.ok) return r.json();
    } catch {
      /* хараахан асаагүй */
    }
    await sleep(100);
  }
  throw new Error('Реле асаагүй');
}

async function stopRelay() {
  if (!relay) return;
  const done = new Promise((r) => relay.once('exit', r));
  relay.kill();
  await done;
  relay = null;
}

/* ── Ажиллуулах ── */

async function main() {
  await new Promise((r) => mock.listen(MOCK_PORT, r));

  // ⚠️ Модуль ачаалагдахаас ӨМНӨ — `AGENT_API` нь импортын үед тогтдог
  process.env.NEXT_PUBLIC_AGENT_API = `http://127.0.0.1:${RELAY_PORT}`;

  const { buildSystemPrompt, allowedLayers, allowedDatasets } = await import('./registry.ts');
  const { runTool, AGENT_TOOLS } = await import('./tools.ts');
  const { ask } = await import('./client.ts');

  /* ── Тест 1: бүртгэл нь LAYERS-ээс амьдаар гарч байна уу ── */
  console.log('\n1. Бүртгэл (registry)');
  const prompt = buildSystemPrompt('all');
  const layers = allowedLayers('all');
  const datasets = allowedDatasets('all');
  check(`каталогт ${layers.length} давхарга орсон`, layers.length > 20, `${layers.length}`);
  check(`${datasets.length} өгөгдлийн эх сурвалж орсон`, datasets.length >= 4, `${datasets.length}`);
  check('`et:24` каталогт бий', prompt.includes('`et:24`'));
  check('`ds:habea` каталогт бий', prompt.includes('`ds:habea`'));
  check('«АНДУУРЧ БОЛОХГҮЙ» хэсэг үүссэн', prompt.includes('АНДУУРЧ БОЛОХГҮЙ'));
  check(
    '`Total_population`-ыг хориглосон анхааруулга бий',
    prompt.includes('Total_population') && prompt.includes('АШИГЛАХГҮЙ'),
  );
  check('эх сурвалж заах дүрэм бий', prompt.includes('ЭХ СУРВАЛЖИЙГ'));
  // ⚠️ Удирдлагад `GUITS_HV` гэдэг утгагүй — хариултын биед техникийн нэр гарах ёсгүй
  check('техникийн нэр хориглосон дүрэм бий', prompt.includes('ТЕХНИКИЙН НЭР ХЭРЭГЛЭГЧИД ХАРАГДАХГҮЙ'));
  check('хоёр баганат хүснэгтийн дүрэм бий', prompt.includes('| Үзүүлэлт | Утга |'));
  check('албан ёсны найруулгын дүрэм бий', prompt.includes('АЛБАН ЁСНЫ'));
  check('бүлэглэсэн жагсаалтын дүрэм бий', prompt.includes('бүлэглэсэн жагсаалтаар'));

  /**
   * ⚠️ ЗӨВХӨН ТОО шар өнгөтэй. Бүх тод бичвэрийг шар болговол бүлгийн гарчиг,
   * нэр ч шар болж, хэрэглэгчийн нүд гол тоог ялгахаа болино.
   */
  const { isNumeric } = await import('./format.ts');
  const numCases = [
    ['21.6%', true], ['3.0%', true], ['0%', true], ['1,788', true], ['20', true],
    ['115.1 тэрбум ₮', true], ['1.86 их наяд ₮', true], ['9.1 нэгж', true],
    ['15.2 км', true], ['9,082 м²', true], ['4.6 га', true], ['5/7', true],
    ['113 блок', true], ['8,575 айл', true],
    ['Багц 4.1', false], ['Гүйцэтгэлийн байдал', false], ['Анхаарах зүйл', false],
    ['Инженерийн шугам сүлжээ', false], ['Багц 2 — 24.6%', false], ['Дүн', false],
    ['Хамгийн хоцорсон блок 5/7', false], ['Гүйцэтгэгч байгууллага', false],
  ];
  const numBad = numCases.filter(([s, want]) => isNumeric(s) !== want);
  check(
    `тоо/гарчгийн ялгал зөв (${numCases.length} тохиолдол)`,
    numBad.length === 0,
    numBad.map(([s]) => s).join(' · '),
  );
  check('санхүүгийн эх сурвалж каталогт бий', prompt.includes('ds:cashflow') && prompt.includes('ds:invest'));
  check('төслийн явц каталогт бий', prompt.includes('ds:progress'));

  /* ── Тест 2: эрхийн хязгаарлалт ── */
  console.log('\n2. Эрхийн хязгаарлалт');
  check('эрхгүй хэрэглэгчид давхарга үзэгдэхгүй', allowedLayers([]).length === 0);
  check('эрхгүй хэрэглэгчид өгөгдөл үзэгдэхгүй', allowedDatasets([]).length === 0);
  check('эрхгүй үед `query_feature` татгалзана', (await runTool('query_feature', { id: 'et:24' }, [])).isError);
  check(
    '`ds:habea` нь `habea` эрхгүй бол хаалттай',
    (await runTool('query_feature', { id: 'ds:habea' }, ['plan'])).isError,
  );
  // ⚠️ Санхүү нээгдсэн ч ЭРХЭЭР хамгаалагдсан хэвээр — энэ бол гол шалгуур
  check(
    'санхүү `finance` эрхтэй хүнд НЭЭЛТТЭЙ',
    !(await runTool('query_feature', { id: 'ds:invest', stats: [{ op: 'count', field: 'ObjectID', as: 'n' }] }, 'all')).isError,
  );
  check(
    'санхүү `finance` эрхгүй хүнд ХААЛТТАЙ',
    (await runTool('query_feature', { id: 'ds:invest' }, ['plan', 'bagts', 'sheet'])).isError,
  );
  check(
    'төслийн явц `dashboard` эрхгүй бол хаалттай',
    (await runTool('query_feature', { id: 'ds:progress' }, ['plan'])).isError,
  );
  check(
    'байхгүй эх сурвалжид ойлгомжтой алдаа',
    (await runTool('query_feature', { id: 'ийм-давхарга-алга' }, 'all')).isError,
  );

  /* ── Тест 3: буруу талбарыг УРЬДЧИЛЖ барих ── */
  console.log('\n3. Талбарын шалгалт');
  const badField = await runTool(
    'query_feature',
    { id: 'et:24', stats: [{ op: 'sum', field: 'Ийм_талбар_байхгүй' }] },
    'all',
  );
  check('байхгүй талбарыг ArcGIS руу явуулахгүй', badField.isError);
  check('алдаанд байгаа талбаруудыг санал болгоно', badField.text.includes('Байгаа талбарууд'));

  /* ── Тест 4: БОДИТ ArcGIS-ээс тоо татах ── */
  console.log('\n4. Бодит өгөгдөл (ArcGIS)');
  const stats = await runTool(
    'query_feature',
    {
      id: 'et:24',
      stats: [
        { op: 'count', field: 'OBJECTID', as: 'n' },
        { op: 'sum', field: 'Population', as: 'pop' },
        { op: 'sum', field: 'Huchin_chadal', as: 'cap' },
      ],
    },
    'all',
  );
  check('нэгтгэл асуулга амжилттай', !stats.isError, stats.text.slice(0, 120));
  const row = stats.isError ? {} : JSON.parse(stats.text).rows?.[0] ?? {};
  check('барилгын тоо ирлээ', Number(row.n) > 0, `n=${row.n}`);
  check('`Population` ба `Huchin_chadal` ӨӨР утгатай', row.pop !== row.cap, `${row.pop} vs ${row.cap}`);
  console.log(`     → барилга ${row.n}, Population ${row.pop}, Huchin_chadal ${row.cap}`);

  const desc = await runTool('describe_feature', { id: 'et:24' }, 'all');
  const fields = desc.isError ? [] : JSON.parse(desc.text).fields ?? [];
  check('`describe_feature` бодит талбаруудыг татав', fields.length > 10, `${fields.length}`);
  check(
    'талбарын утга манай тайлбараар солигдсон',
    fields.find((f) => f.name === 'Population')?.meaning?.includes('орон сууц') ?? false,
  );

  // Өгөгдлийн эх сурвалж ч ижил замаар ажиллана
  const habea = await runTool(
    'query_feature',
    { id: 'ds:habea', stats: [{ op: 'count', field: 'objectid', as: 'n' }] },
    'all',
  );
  check('`ds:habea` ижил хэрэгслээр асуугдана', !habea.isError, habea.text.slice(0, 120));

  /* ── Тест 4b: бүсийн нэгдсэн тойм ── */
  console.log('\n4b. Бүсийн нэгдсэн тойм (zone_overview)');
  const t0 = Date.now();
  const ov = await runTool('zone_overview', { zone: 'Багц-1' }, 'all');
  check('тойм амжилттай', !ov.isError, ov.text.slice(0, 140));
  const o = ov.isError ? {} : JSON.parse(ov.text);
  check('олон эх сурвалжаас өгөгдөл олов', (o.sources?.length ?? 0) >= 5, `${o.sources?.length}`);
  check('өртөг тооцоологдов', (o.totalCost ?? 0) > 0, `${o.totalCost}`);
  check('давхарга БА өгөгдлийн эх сурвалж хоёулаа орсон', o.sources?.some((x) => x.id.startsWith('ds:')) ?? false);
  check('хэмжээ хүний нэгжээр гарав', o.sources?.some((x) => /га|км|м²|м$/.test(x.qty ?? '')) ?? false);
  console.log(`     → ${o.sources?.length} эх сурвалж · ${((o.totalCost ?? 0) / 1e9).toFixed(1)} тэрбум ₮ · ${((Date.now() - t0) / 1000).toFixed(1)}с`);

  check(
    'бичиглэл өөр байсан ч таарна («Багц 1»)',
    !(await runTool('zone_overview', { zone: 'Багц 1' }, 'all')).isError,
  );

  /**
   * ⚠️ АЖЛЫН БАГЦ (Багц 5–21) — эдгээрийн давхарга нь бүсийн атрибутаар
   * шүүгдэхгүй, БҮХЭЛДЭЭ тэр багцынх. Энэ шалгуургүй байхад «Багц 5.1» гэж
   * асуухад 0 эх сурвалж гарч байсан.
   */
  for (const wp of ['Багц 5.1', 'Багц 6.1', 'Багц 17.1']) {
    const r = await runTool('zone_overview', { zone: wp }, 'all');
    const j = r.isError ? {} : JSON.parse(r.text);
    const whole = (j.sources ?? []).filter((x) => x.whole);
    check(
      `ажлын багц «${wp}» — бүтэн давхарга олдов`,
      whole.length > 0 && whole.every((x) => x.n > 0),
      r.isError ? r.text.slice(0, 60) : `${whole.length} бүтэн`,
    );
  }
  /**
   * ⚠️ ЛАТИН БИЧИГЛЭЛ — хэрэглэгч монголоо латинаар бичих нь энэ порталд түгээмэл.
   * Хөрвүүлэлтгүй бол `bagtsKey('bagts 1')` = «BAGTS1» болж «БАГЦ1»-тэй таарахгүй,
   * тойм ЧИМЭЭГҮЙ хоосон буцна.
   */
  for (const lat of ['bagts 1', 'bagts-3.2', 'BAGTS 5.1', 'bus 2']) {
    const r = await runTool('zone_overview', { zone: lat }, 'all');
    check(
      `латин «${lat}» кирилл болж таарав`,
      !r.isError && JSON.parse(r.text).zone.startsWith('Багц'),
      r.isError ? r.text.slice(0, 50) : JSON.parse(r.text).zone,
    );
  }
  check('заавар латин бичиглэлийг тайлбарласан', buildSystemPrompt('all').includes('ЛАТИН'));

  check(
    'байхгүй бүсэд ойлгомжтой алдаа',
    (await runTool('zone_overview', { zone: 'Байхгүй-99' }, 'all')).isError,
  );
  check('эрхгүй бол тойм ч хаалттай', (await runTool('zone_overview', { zone: 'Багц-1' }, [])).isError);

  /* ── Тест 4c: тооцоолсон гүйцэтгэл (дашбоардын толгойн тоо) ── */
  console.log('\n4c. Тооцоолсон гүйцэтгэл (compute)');
  const bp = await runTool('compute', { kind: 'building_progress' }, 'all');
  check('тооцоолол амжилттай', !bp.isError, bp.text.slice(0, 120));
  const p = bp.isError ? {} : JSON.parse(bp.text);
  check('113 блок', p.blocks === 113, `${p.blocks}`);
  check('8,575 айл', p.ail === 8575, `${p.ail}`);
  // ⚠️ Дашбоардын толгойн тоотой ТААРАХ ёстой (18.2–18.4%). Зөрвөл `blockProgress`
  //    эсвэл ажлын хуудасны өгөгдөл өөрчлөгдсөн — хүн шалгах ёстой.
  check('нийт гүйцэтгэл дашбоардтай таарна', p.overall >= 15 && p.overall <= 22, `${p.overall}%`);
  check('багц бүрээр задарсан', (p.byBagts?.length ?? 0) === 7, `${p.byBagts?.length}`);
  check('бүртгэсэн ба бодит хувь ХОЁУЛАА бий', p.byBagts?.every((b) => 'actual' in b && 'recorded' in b));
  check('хамгийн хоцорсон блокууд гарав', (p.slowest?.length ?? 0) > 0);
  check('эрхгүй бол тооцоолол ч хаалттай', (await runTool('compute', { kind: 'building_progress' }, [])).isError);
  console.log(`     → ${p.blocks} блок · ${p.ail} айл · нийт ${p.overall}%`);

  /* ── Тест 5: агентын гогцоо ── */
  console.log('\n5. Агентын гогцоо (хуурамч загвартай)');
  seen = [];
  script = [
    [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'query_feature',
        input: { id: 'et:24', stats: [{ op: 'count', field: 'OBJECTID', as: 'n' }] },
      },
    ],
    [{ type: 'text', text: 'Нийт 363 барилга байна. Эх сурвалж: `et:24`' }],
  ];

  const health = await startRelay();
  check('реле асав', health.ok === true);

  const history = [];
  const progress = [];
  const res = await ask({
    question: 'Хэдэн барилга байгаа вэ?',
    history,
    scope: 'all',
    onProgress: (x) => progress.push(x),
  });

  check('эцсийн хариулт ирлээ', res.text.includes('363'), res.text);
  check('хоёр эргэлтээр дууслаа', res.turns === 2, `${res.turns}`);
  check('явцын мөр хэрэглэгчид харагдана', progress.length >= 2);
  check('түүхэд 4 мессеж', history.length === 4, `${history.length}`);
  check('tool_result зөв id-тай буцлаа', history[2]?.content?.[0]?.tool_use_id === 'toolu_1');
  check('tool_result дотор БОДИТ тоо байна', /"n":\d+/.test(history[2]?.content?.[0]?.content ?? ''));

  /* ── Тест 6: реле рүү явсан хүсэлтийн бүтэц ── */
  console.log('\n6. Реле рүү явсан хүсэлт');
  const first = seen[0] ?? {};
  check('загвар нь claude-opus-5', first.model === 'claude-opus-5', first.model);
  check('effort тохируулагдсан', first.output_config?.effort === 'low');
  check('заавар КЭШЛЭГДЭХЭЭР явсан', first.system?.[0]?.cache_control?.type === 'ephemeral');
  check('4 хэрэгсэл дамжсан', first.tools?.length === 4, `${first.tools?.length}`);
  check(
    'хэрэгслийн нэрс зөв',
    AGENT_TOOLS.map((t) => t.name).join(',') === 'describe_feature,query_feature,zone_overview,compute',
  );
  check('хоёр дахь хүсэлтэд tool_result очсон', seen.length === 2 && seen[1].messages.length === 3);

  /* ── Тест 7: татгалзал ── */
  console.log('\n7. Татгалзлыг зөв барих');
  script = [[]];
  const refused = await ask({ question: 'туршилт', history: [], scope: 'all' });
  check('хоосон хариу үед эвдрэхгүй', refused.text.length > 0, refused.text);
}

main()
  .catch((e) => {
    failures++;
    console.error('\n✗ Тест унав:', e?.stack ?? e);
  })
  .finally(async () => {
    await stopRelay().catch(() => {});
    mock.close();
    await sleep(100);
    console.log(
      failures ? `\n❌ ${failures} шалгуур унав` : '\n✅ Бүх шалгуур давлаа (загварын шийдвэрээс бусад)',
    );
    process.exit(failures ? 1 : 0);
  });
