/**
 * НЭГ ШАЛГУУРЫГ ХУГАЦААНЫ ХЯЗГААРТАЙ АЖИЛЛУУЛАХ — `test-all.mjs`-ийн цөм.
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ЯАГААД — урьд нь `test-all` хүүхэд
 *    процессоо хязгааргүй хүлээдэг байв. Нэг шалгуур гацвал (хаагдаагүй
 *    `setInterval`, хариу ирэхгүй сүлжээ, үүрд хүлээх Promise) `npm test` хэзээ ч
 *    дуусахгүй — CI-ийн deploy 6 цагийн хязгаар хүртэл чимээгүй түгжигдэнэ. Одоо
 *    хугацаа хэтэрвэл процессыг АЛЖ, ил мессежтэй «унасан» гэж тооцно.
 * ⚠️ Тусдаа модуль — `test-all.mjs` нь импортлоход шууд ажиллаж эхэлдэг тул
 *    `testRun.check.mjs` энэ функцийг дангаар нь шалгана.
 */
import { spawn } from 'node:child_process';

/** Анхдагч хязгаар (сек) — хамгийн удаан шалгуур ~60с, CI-д 3 дахин өгөөмөр */
export const DEFAULT_TIMEOUT_S = 180;

/**
 * Хязгаарыг тодорхойлно: `--timeout <сек>` → `TEST_TIMEOUT_S` env → 180.
 * 0 эсвэл буруу утга → анхдагч (хязгааргүй болгох боломжгүй — гацсан тест deploy-г
 * хаах нь яг засах гэсэн эвдрэл).
 */
export function resolveTimeoutS(argv, env) {
  const i = argv.indexOf('--timeout');
  const raw = i >= 0 ? argv[i + 1] : env.TEST_TIMEOUT_S;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_S;
}

/**
 * `node <args> <file>`-ийг ажиллуулж `{ file, code, ms, out, timedOut }` буцаана.
 * Хугацаа хэтэрвэл SIGKILL — `code` 1 бөгөөд гаралтын төгсгөлд шалтгаан бичигдэнэ.
 */
export function runCheck(file, { args = [], timeoutMs = DEFAULT_TIMEOUT_S * 1000, env = process.env } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const out = [];
    let timedOut = false;
    const child = spawn(process.execPath, [...args, file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => out.push(b));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const done = (code) => {
      clearTimeout(timer);
      let text = Buffer.concat(out).toString('utf8');
      if (timedOut) {
        text += `\n⏱ ГАЦСАН: ${(timeoutMs / 1000).toFixed(0)} секундэд дуусаагүй тул зогсоов` +
          ' (хаагдаагүй timer/сүлжээ/Promise байж магадгүй; хязгаар: --timeout <сек> эсвэл TEST_TIMEOUT_S)';
      }
      resolve({ file, code: timedOut ? 1 : (code ?? 1), ms: Date.now() - t0, out: text, timedOut });
    };
    child.on('close', done);
    /* spawn өөрөө унавал (`close` ирэхгүй байж болно) */
    child.on('error', (e) => { out.push(Buffer.from(String(e?.stack ?? e))); done(1); });
  });
}
