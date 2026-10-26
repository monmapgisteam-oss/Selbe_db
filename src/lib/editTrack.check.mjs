/**
 * ИМПОРТЫН АГШНЫ МӨШГӨЛТИЙН ЗАСВАР (`editTrack.ts`, 2026-10-26) — хөрвүүлэх хүснэгт (`entMap`) хасагдсаны дараа үлдсэн
 * цорын ганц утгын засвар. Сүлжээгүй, цэвэр.
 *   node --experimental-transform-types src/lib/editTrack.check.mjs
 */
import assert from 'node:assert/strict';
import { fixImportStamp, fixImportStamps, trackStatOf, IMPORT_FROM, IMPORT_TO } from './editTrack.ts';

const IMP = Date.UTC(2026, 9, 20, 8, 40);
assert.ok(IMP >= IMPORT_FROM && IMP <= IMPORT_TO, 'туршилтын агшин импортын цонхонд');
const OLD = Date.UTC(2026, 8, 15);

/* 1. gdb-ийн давхарга: амьд утга импортын агшинд → хуучин баганын утга */
{
  const a = { created_date: IMP, created_user: 'tumenjargal_selbe', creationdate: OLD, creator: 'eng_a',
    last_edited_date: IMP, last_edited_user: 'tumenjargal_selbe', editdate: OLD + 1, editor: 'eng_b' };
  fixImportStamp(a);
  assert.equal(a.created_date, OLD);
  assert.equal(a.created_user, 'eng_a');
  assert.equal(a.last_edited_date, OLD + 1);
  assert.equal(a.last_edited_user, 'eng_b');
}

/* 2. `*_1` давхарга (Guitsetgel_talbe/183 · selbe_ET/114): `_1` ЭХЭЛЖ — энгийн `editdate` нь тусдаа багана */
{
  const a = { last_edited_date: IMP, editdate: 5, editdate_1: OLD, last_edited_user: 'x', editor: 'plain', editor_1: 'real' };
  fixImportStamp(a);
  assert.equal(a.last_edited_date, OLD);
  assert.equal(a.last_edited_user, 'real');
}

/* 3. Импортын дараа засагдсан мөр — амьд утга ХЭВЭЭР; хуучин багана алга (Survey123/HET) — хэвээр */
{
  const later = Date.UTC(2026, 9, 22);
  const a = { last_edited_date: later, editdate: OLD };
  fixImportStamp(a);
  assert.equal(a.last_edited_date, later);
  const b = { created_date: IMP, created_user: 'u' };
  fixImportStamp(b);
  assert.equal(b.created_date, IMP, 'хуучин багана байхгүй бол хөндөхгүй');
}

/* 4. Хариуны бие — зөвхөн `features[].attributes`; бусад хариу хэвээр */
{
  const body = { features: [{ attributes: { created_date: IMP, creationdate: OLD } }, { attributes: null }], fields: [{ name: 'x' }] };
  assert.equal(fixImportStamps(body), body);
  assert.equal(body.features[0].attributes.created_date, OLD);
  assert.deepEqual(fixImportStamps({ count: 3 }), { count: 3 });
  assert.equal(fixImportStamps(null), null);
}

/* 5. Ил `outFields`-д нэмэх хос багана — давхаргын бодит талбараас */
assert.equal(trackStatOf(['objectid', 'editdate', 'last_edited_date'], 'last_edited_date'), 'editdate');
assert.equal(trackStatOf(['editdate', 'editdate_1'], 'last_edited_date'), 'editdate_1');
assert.equal(trackStatOf(['objectid'], 'last_edited_date'), null);
assert.equal(trackStatOf(['creator'], 'created_user'), 'creator');
assert.equal(trackStatOf(['editdate'], 'bagts'), null);

console.log('✅ editTrack — импортын агшны засвар · `*_1` давамгайлал · хуучин баганагүй давхарга хэвээр');
