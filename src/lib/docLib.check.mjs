/**
 * Баримт бичгийн сан — `docLib.ts` (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/docLib.check.mjs
 */
import assert from 'node:assert/strict';

const { libPdfs, isChanarDoc } = await import('./docLib.ts');

/* 2026-11-23 (аудит): чанарын баримт (`selbe-chanar-doc`) ба FIC/М-акт сангийн жагсаалтад орохгүй — сангаас устгагдах/зөөгдөхгүй */
{
  const p = (id, title, tags) => ({ id, title, owner: 'u', tags });
  const all = [
    p('a', 'Тайлан.pdf', ['selbe-portal', 'selbe-docgrp:tezu']),
    p('b', 'Шалгалтын акт.pdf', ['selbe-portal', 'Selbe-Chanar-Doc', 'k:1']),
    p('c', 'FIC · 12', ['selbe-portal']),
    p('d', 'М-акт.pdf', ['selbe-portal', 'selbe-fm']),
    p('e', 'Хуучин.pdf', undefined),
  ];
  assert.equal(isChanarDoc(all[1]), true);
  assert.equal(isChanarDoc(all[4]), false);
  assert.deepEqual(libPdfs(all).map((d) => d.id), ['a', 'e']);
  console.log('✅ баримтын сан: чанарын баримт · FIC/М-акт хасагдана');
}

console.log('docLib.check: OK');
