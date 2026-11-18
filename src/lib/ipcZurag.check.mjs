/**
 * «Төлбөрийн акт»-ын «Зураг» бүлгийн дотоод бүлэглэлт (2026-11-17), цэвэр логикийн шалгуур.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipcZurag.check.mjs
 */
import assert from 'node:assert/strict';
import { toZRow } from './zuragBurtgel.ts';
import { groupByRegistry } from './ipcZurag.ts';

const z = (oid, buleg, ded, ner, bagts) => toZRow({ objectid: oid, buleg, ded_buleg: ded, ner, bagts });
const reg = [
  z(1, '002. ЗАГВАР ЗУРАГ', '', 'Загвар А', 'Багц 1'),
  z(2, '003. АЖЛЫН ЗУРАГ', '300.10. БАГЦ 1', 'Гадна шугам', 'Багц 1'),
  z(3, '003. АЖЛЫН ЗУРАГ', '300.20. БАГЦ 2', 'Гадна шугам', 'Багц 2'),
  z(4, '003. АЖЛЫН ЗУРАГ', '300.20. БАГЦ 2', 'Дулаан', 'Багц 2'),
  z(5, '005. ТӨСӨВ', '100. ОРОН СУУЦ', 'Дулаан', 'Багц 2'),
  z(6, '003. АЖЛЫН ЗУРАГ', '300.10. БАГЦ 1', 'Ус', 'Багц 1'),
  z(7, '003. АЖЛЫН ЗУРАГ', '300.20. БАГЦ 2', 'Ус', 'Багц 1'),
];
const it = (name, pkg) => ({ name, pkg });
const items = [it('  загвар  а ', 'x'), it('Гадна шугам', 'БАГЦ-2'), it('Гадна шугам', 'Багц 1'), it('Дулаан', 'Багц-2'), it('Ус', 'Багц-1'), it('Байхгүй нэр', '')];
const { tree, rest } = groupByRegistry(items, reg, (x) => x.name, (x) => x.pkg);
const flat = tree.map((g) => [g.label, g.items.map((x) => x.name), g.subs.map((s) => [s.label, s.items.map((x) => `${x.name}|${x.pkg}`)])]);
assert.deepEqual(flat, [
  ['1. ЗАГВАР ЗУРАГ', ['  загвар  а '], []],
  ['2. АЖЛЫН ЗУРАГ', ['Ус'], [['1. БАГЦ 1', ['Гадна шугам|Багц 1']], ['2. БАГЦ 2', ['Гадна шугам|БАГЦ-2']]]],
], 'нэрээр; ижил нэртэйг багцаар ялгана; нэг бүлгийн хоёр дэд бүлэгт таарвал бүлэгт шууд; хоосон бүлэг орохгүй');
assert.deepEqual(rest.map((x) => x.name), ['Дулаан', 'Байхгүй нэр'], 'хоёр өөр бүлэгт таарсан ба олдоогүй — «Бусад»');
console.log('ipcZurag.check: бүгд ✅');
