/**
 * АГЕНТААС ТЕРМИНАЛААР АСУУХ — браузер нээхгүйгээр туршина.
 *
 * ⚠️ Порталын ЯГ ижил кодыг ажиллуулна (`src/lib/agent/*`) — өөр зам БИШ.
 * Тиймээс энд гарсан хариулт нь цонхонд гарах хариулттай ижил байна.
 *
 * ⚠️ Реле АСААЛТТАЙ байх ёстой: `cd agent-proxy && npm start`
 *
 * Хэрэглээ:
 *   npm run ask "Төсөлд хэдэн барилга байна вэ?"
 *   npm run ask "Бүс бүрээр газрын талбай"  -- --scope plan,bagts
 */

const args = process.argv.slice(2);
const question = args.filter((a) => !a.startsWith('--')).join(' ').trim();

/** ⚠️ Эрхийг дуурайх — тодорхойлоогүй бол бүх харагдац (super admin шиг) */
const scopeArg = args.find((a) => a.startsWith('--scope='))?.slice('--scope='.length);
const scope = scopeArg ? scopeArg.split(',').map((s) => s.trim()) : 'all';

if (!question) {
  console.error('Хэрэглээ: npm run ask "асуултаа бичнэ"');
  process.exit(1);
}

process.env.NEXT_PUBLIC_AGENT_API ||= 'http://127.0.0.1:8787';

const { ask, relayAlive, AGENT_API } = await import('../src/lib/agent/client.ts');

if (!(await relayAlive())) {
  console.error(`✗ Реле хариулахгүй байна: ${AGENT_API}`);
  console.error('  Асаах:  cd agent-proxy && npm start');
  process.exit(1);
}

console.log(`\n❓ ${question}`);
console.log(`   (эрх: ${scope === 'all' ? 'бүх харагдац' : scope.join(', ')})\n`);

const t0 = Date.now();
const history = [];

try {
  const res = await ask({
    question,
    history,
    scope,
    onProgress: (p) => console.log(`   … ${p}`),
  });
  console.log(`\n💬 ${res.text}\n`);
  console.log(`⏱  ${((Date.now() - t0) / 1000).toFixed(1)} сек · ${res.turns} эргэлт`);
} catch (e) {
  console.error(`\n✗ ${e?.message ?? e}`);
  process.exit(1);
}
