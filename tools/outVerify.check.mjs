/**
 * `tools/outVerify.mjs`-ийн НЭГЖ шалгуур — түр хавтсанд хуурамч `out/` үүсгэж `verifyOut`-ийг ажиллуулна
 * (жинхэнэ `next build` ШААРДАХГҮЙ, сүлжээгүй).
 *   node tools/outVerify.check.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyOut } from './outVerify.mjs';

const root = mkdtempSync(join(tmpdir(), 'selbe-outverify-'));
const put = (rel, s = '') => {
  const p = join(root, ...rel.split('/'));
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, s);
};
try {
  /* 1. Хавтас алга */
  let r = verifyOut(join(root, 'nope'));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /хавтас алга/);

  /* 2. Бүрэн out/ — давна (`?dpl=` сүүл, `&amp;`, `%5B…%5D` кодчилол, дэд хуудас) */
  put('index.html', '<link rel="stylesheet" href="/_next/static/css/a1.css?dpl=x"><script src="/_next/static/chunks/main-1.js" async=""></script>');
  put('404.html', '<script src="/_next/static/chunks/main-1.js"></script>');
  put('tailan/index.html', "<script src='/_next/static/chunks/app/%5Bslug%5D/page-2.js'></script><a href=\"/tailan/\">x</a>");
  put('_next/static/css/a1.css', 'body{}');
  put('_next/static/chunks/main-1.js', '');
  put('_next/static/chunks/app/[slug]/page-2.js', '');
  r = verifyOut(root);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.pages, 3);
  assert.equal(r.refs, 3);

  /* 3. Chunk дутуу — нэрлэж унана */
  unlinkSync(join(root, '_next', 'static', 'chunks', 'main-1.js'));
  r = verifyOut(root);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('/_next/static/chunks/main-1.js') && /\.html-д заасан/.test(e)), r.errors.join('\n'));
  assert.equal(r.errors.length, 1, 'дутуу файл НЭГ л удаа (хуудас бүрд давтахгүй)');

  /* 4. 404.html алга */
  put('_next/static/chunks/main-1.js', '');
  unlinkSync(join(root, '404.html'));
  r = verifyOut(root);
  assert.ok(r.errors.includes('404.html алга'), r.errors.join('\n'));

  /* 5. Лавлагаагүй HTML — шалгалт өөрөө эвдэрсэн гэж унана (хоосон «давсан» гэж хэлэхгүй) */
  const bare = mkdtempSync(join(tmpdir(), 'selbe-outverify-'));
  try {
    writeFileSync(join(bare, 'index.html'), '<p>x</p>');
    writeFileSync(join(bare, '404.html'), '<p>x</p>');
    r = verifyOut(bare);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('НЭГ Ч олдсонгүй')));
  } finally { rmSync(bare, { recursive: true, force: true }); }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('✅ outVerify — бүрэн · chunk дутуу · 404 алга · лавлагаагүй');
