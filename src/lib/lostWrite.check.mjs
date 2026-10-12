/**
 * ХАРИУ АЛДАГДСАН БИЧИЛТИЙН АНГИЛЛЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/lostWrite.check.mjs
 *
 * ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): ArcGIS JS API (`@arcgis/core/request`) алдааг `esri/core/Error`
 *    (`name: 'request:server'`, `details.httpStatus`) болгодог тул урьд нь `isLostWrite` JS API-ийн алдаанд
 *    хэзээ ч `true` буцаадаггүй байв (`saveSubmission.lost` үхмэл). Хамгаалж буй дүрэм:
 *   1. `request:server` + 5xx / статусгүй (сүлжээ · timeout · JSON биш) → алдагдсан.
 *   2. `request:server` + 400/401/403/404/498/499 → тодорхой татгалзал (юу ч бичигдээгүй).
 *   3. `TypeError` (fetch унасан) · `request:timeout` · `{ lost: true }` ороосон алдаа → алдагдсан.
 *   4. `ArcGISError` HTTP 403 (REST зам) → тодорхой; `isLostResponse` = `isLostWrite` (нэг эх).
 */
import assert from 'node:assert/strict';
import { isLostWrite } from './lostWrite.ts';
import { isLostResponse } from './butetsEdit.ts';
import { ArcGISError } from './query.ts';

/** JS API-ийн `esri/core/Error` загвар — `name` ба `details` */
const api = (name, details) => Object.assign(new Error(name), { name, details });

const cases = [
  [api('request:server', { httpStatus: 500 }), true, 'request:server 500'],
  [api('request:server', { httpStatus: 502 }), true, 'request:server 502'],
  [api('request:server', { httpStatus: 429 }), true, 'request:server 429'],
  [api('request:server', {}), true, 'request:server статусгүй (сүлжээ · JSON биш)'],
  [api('request:server', undefined), true, 'request:server details-гүй'],
  [api('request:server', { httpStatus: 400 }), false, 'request:server 400'],
  [api('request:server', { httpStatus: 403 }), false, 'request:server 403'],
  [api('request:server', { httpStatus: 498 }), false, 'request:server 498 (токен)'],
  [api('request:server', { httpStatus: 499 }), false, 'request:server 499 (токен)'],
  [api('request:timeout', {}), true, 'request:timeout'],
  [new TypeError('Failed to fetch'), true, 'TypeError'],
  [Object.assign(new Error('t'), { name: 'TimeoutError' }), true, 'TimeoutError'],
  [Object.assign(new Error('ороосон'), { lost: true }), true, '{lost:true}'],
  [new ArcGISError('HTTP 403', 'u', undefined, undefined, false, 403), false, 'ArcGISError HTTP 403'],
  [new ArcGISError('HTTP 503', 'u', undefined, undefined, false, 503), true, 'ArcGISError HTTP 503'],
  [new ArcGISError('x', 'u', 498, undefined, true), false, 'ArcGISError sessionExpired'],
  [new Error('success:false'), false, 'энгийн Error'],
  [null, false, 'null'],
];
for (const [e, want, label] of cases) {
  assert.equal(isLostWrite(e), want, `isLostWrite: ${label}`);
  assert.equal(isLostResponse(e), want, `isLostResponse ≠ isLostWrite: ${label}`);
}
console.log('✅ isLostWrite — request:server/timeout · TypeError · lost туг · ArcGISError · isLostResponse нэг эх');
console.log('\nlostWrite.check: ok');
