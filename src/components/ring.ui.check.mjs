/**
 * `ui.tsx` `Ring` — `text` prop голын «{v}%»-ийг дарна (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/ring.ui.check.mjs
 *
 * ⚠️ Эрсдэлийн AQI зэрэг хувь биш утгад: цагираг 0–100 дүүргэлттэй, гол нь `text`.
 *    Өгөгдөлгүй (`value` null) үед `text` өгсөн ч «—» (null ≠ 0).
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

console.log('✅ Ring: text → голын бичвэр · aria-valuetext · null үед «—»');
