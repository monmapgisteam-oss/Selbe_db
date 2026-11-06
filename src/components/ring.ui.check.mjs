/**
 * `ui.tsx` `Ring` — `text` prop голын «{v}%»-ийг дарна (2026-10-01).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/components/ring.ui.check.mjs
 */
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Ring } from '@/components/ui';

const center = (html) => html.match(/num"[^>]*>([^<]*)</)?.[1];

/* Анхдагч — хувь */
const a = renderToStaticMarkup(h(Ring, { value: 63, label: 'Гүйцэтгэл' }));
assert.equal(center(a), '63%');
assert.match(a, /aria-valuetext="63%"/);

/* text — хувийн оронд */
const b = renderToStaticMarkup(h(Ring, { value: 72, text: '72 AQI', label: 'Агаар' }));
assert.equal(center(b), '72 AQI', 'text голын бичвэрийг дарах ёстой');
assert.match(b, /aria-valuetext="72 AQI"/);
assert.match(b, /aria-valuenow="72"/, 'дүүргэлт value-аар хэвээр');
assert.ok(!b.includes('72%'));

/* Өгөгдөлгүй → text өгсөн ч «—» */
const c = renderToStaticMarkup(h(Ring, { value: null, text: '0 AQI' }));
assert.equal(center(c), '—', 'null үед text гаргаж болохгүй (null ≠ 0)');
assert.ok(!c.includes('aria-valuenow'));

/* Дуусаагүй ажил «100%» гэж бичигдэхгүй */
const pctOf = (value, decimals) => center(renderToStaticMarkup(h(Ring, { value, decimals })));
assert.equal(pctOf(99.4), '99%');
assert.equal(pctOf(99.5), '99%', '99.5 дуусаагүй');
assert.equal(pctOf(99.99), '99%', '99.99 дуусаагүй');
assert.equal(pctOf(100), '100%', 'бүрэн дууссан нь 100%');
assert.equal(pctOf(99.96, 1), '99.9%', 'decimals өгсөн ч 100.0 болохгүй');
assert.equal(pctOf(99.6, 1), '99.6%');
assert.equal(pctOf(0), '0.0%', '0% хэвээр');
assert.equal(pctOf(47.42), '47%', 'ердийн дугуйлалт хэвээр');

console.log('✅ Ring: text → голын бичвэр · aria-valuetext · null үед «—» · дуусаагүй нь 100% биш');
