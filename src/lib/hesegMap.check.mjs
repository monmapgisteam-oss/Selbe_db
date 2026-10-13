import assert from 'node:assert/strict';
import { hesegMapLayers } from './hesegMap.ts';

const state = {
  tab: 'change', compare: false, partial: ['rd:2', 'rd:0', 'rd:1'], previous: ['sb:2', 'sb:4', 'zone'],
  change: null, overlapActive: false, needActive: false,
};
assert.deepEqual(hesegMapLayers(state), state.partial, 'The initial map must be the partial plan only');
const road = { ...state, change: { key: 'road', layers: ['rd:0'], oldLayers: ['sb:2'] } };
assert.deepEqual(hesegMapLayers(road), ['rd:0'], 'Мэп дээр тооцоолсон тэнхлэгийн оронд эх замын давхарга гарна');
assert.deepEqual(hesegMapLayers({ ...road, compare: true }), ['sb:2', 'rd:0'], 'Зам сонгоход хоёр талд зөвхөн замын эх давхаргууд үлдэнэ');
assert.deepEqual(hesegMapLayers({ ...road, compare: true, hidden: ['sb:2'] }), ['rd:0'], 'Эх давхаргын цэсээр харагдах байдлыг удирдана');
assert.deepEqual(hesegMapLayers({ ...state, compare: true, hidden: ['zone'] }), ['sb:2', 'sb:4', ...state.partial], 'Сонголтгүй үед хуучин бүсийг давхаргын цэсээр унтрааж болно');
const zone = { ...state, change: { key: 'zone', layers: ['rd:2'], oldLayers: ['zone'] } };
assert.deepEqual(hesegMapLayers({ ...zone, compare: true, hidden: ['rd:2'] }), ['zone']);
assert.deepEqual(hesegMapLayers({ ...state, compare: true }), [...state.previous, ...state.partial]);
for (const change of [
  { key: 'bike', oldLayers: ['sb:15'], layers: ['rd:18'] },
  { key: 'walk', oldLayers: ['sb:3'], layers: ['rd:11'] },
  { key: 'green', oldLayers: ['sb:1'], layers: ['rd:6', 'rd:7', 'rd:8', 'rd:9', 'rd:12', 'rd:13'] },
  zone.change,
]) {
  const selected = { ...state, change };
  assert.deepEqual(hesegMapLayers(selected), change.layers, `${change.key}: энгийн зурагт зөвхөн шинэ давхаргууд`);
  assert.deepEqual(hesegMapLayers({ ...selected, compare: true }), [...change.oldLayers, ...change.layers], `${change.key}: Swipe-д зөвхөн харгалзах давхаргууд`);
  assert.deepEqual(hesegMapLayers({ ...selected, compare: true, change: null }), [...state.previous, ...state.partial], 'Сонголтыг цуцлахад хуучин бүс дахин асна');
}
assert.deepEqual(hesegMapLayers({ ...state, tab: 'overlap', overlapActive: true }), [], 'Only selected overlap graphics remain');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'overlap', overlapActive: true, compare: true }), state.partial, 'Comparison preserves the independent partial plan');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need' }), state.partial);
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', needActive: true }), [], 'Hide unrelated buildings when requirements are selected');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', compare: true }), state.partial, 'The partial plan remains under proposed additions on the right');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', compare: true, needActive: true }), [], 'Selected requirements exclude unrelated plan features from comparison');
const engineering = ['infra:6', 'infra:7', 'infra:19'];
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', existing: engineering }), state.partial, 'Swipe унтраалттай үед эхний зураг хэсэгчилсэн ЕТ хэвээр');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', compare: true, existing: engineering }), [...engineering, ...state.partial], 'Swipe зүүнд инженерийн эх давхаргууд, баруунд хэсэгчилсэн ЕТ');
assert.deepEqual(hesegMapLayers({ ...state, tab: 'need', compare: true, needActive: true, existing: engineering, hidden: ['infra:19'] }), ['infra:6', 'infra:7'], 'Хэрэгцээний шүүлт ба инженерийн давхаргын цэс хамт ажиллана');
console.log('hesegMap: initial plan, swipe, selection isolation and hidden layers passed');
