/**
 * АУДИТЫН ТАЙЛАН (2026-11-04) — цэвэр: үр дүн → Markdown / JSON. Сүлжээгүй (`dataAudit.check.mjs` шалгана).
 */

const esc = (v) => {
  if (v == null) return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 200);
};

/** Мөрүүд → Markdown хүснэгт. Багана нь эхний 200 мөрийн түлхүүрүүдийн нэгдэл */
export function mdTable(rows, maxRows = 50) {
  if (!rows?.length) return '';
  const cols = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))];
  const shown = rows.slice(0, maxRows);
  const lines = [
    `| ${cols.join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...shown.map((r) => `| ${cols.map((c) => esc(r[c])).join(' | ')} |`),
  ];
  if (rows.length > shown.length) lines.push('', `…нийт ${rows.length} мөр, үлдсэн нь JSON-д.`);
  return lines.join('\n');
}

const STATUS_ICON = { ok: '✅', diff: '❌', fail: '❌', warn: '⚠️', skip: '⏭', error: '💥' };

/** Хүснэгт хоорондын нэг зүйлийн дүгнэлт: мэдэгдэж буйг ТООЛНО, нуухгүй */
export function summarize(result) {
  const s = { diff: 0, warn: 0, ok: 0, skip: 0, error: 0, schemaFail: 0, schemaWarn: 0, schemaSkip: 0 };
  for (const it of result.cross ?? []) s[it.status] = (s[it.status] ?? 0) + 1;
  const all = [...(result.schema?.targets ?? []), ...(result.schema?.sheets ?? []), ...(result.schema?.roots ?? [])];
  for (const t of all) {
    if (t.status === 'fail') s.schemaFail += 1;
    else if (t.status === 'warn') s.schemaWarn += 1;
    else if (t.status === 'skip') s.schemaSkip += 1;
  }
  return s;
}

export const toJson = (result) => JSON.stringify(result, null, 2);

export function toMarkdown(result, { maxRows = 50 } = {}) {
  const { meta = {}, cross = [], schema } = result;
  const s = summarize(result);
  const out = [
    '# Сэлбэ — өгөгдлийн аудит',
    '',
    `- Огноо: ${meta.at ?? '—'}`,
    `- Enterprise: ${meta.ent ?? '—'}`,
    `- Хугацаа: ${meta.durationMs != null ? `${Math.round(meta.durationMs / 1000)} с` : '—'}`,
    `- Хүсэлт: ${meta.reads ?? '—'} · бичих оролдлого: ${meta.writesBlocked ?? '—'}`,
    '',
  ];

  if (cross.length) {
    out.push('## Хүснэгт хоорондын зөрүү', '', '| Төлөв | Тулгалт | Мөр | Тайлбар |', '| --- | --- | --- | --- |');
    for (const it of cross) out.push(`| ${STATUS_ICON[it.status] ?? it.status} | ${esc(it.title)} | ${it.n ?? 0} | ${esc(it.note ?? '')} |`);
    out.push('');
    for (const it of cross) {
      if (!it.rows?.length) continue;
      out.push(`### ${it.title}`, '', mdTable(it.rows, maxRows), '');
    }
  }

  if (schema) {
    const bad = schema.targets.filter((t) => t.status === 'fail' || t.status === 'warn');
    out.push(
      '## Схемийн зөрүү', '',
      `Шалгасан: ${schema.targets.length} эх сурвалж · ${schema.sheets.length} хуудас · ${schema.roots.length} үйлчилгээ. `
        + `Унасан: ${s.schemaFail} · анхааруулга: ${s.schemaWarn} · эрхгүй/алгассан: ${s.schemaSkip}.`,
      '',
    );
    if (bad.length) {
      out.push(mdTable(bad.map((t) => ({
        төлөв: t.status, id: t.id, бүлэг: t.group,
        алга: t.missing?.join(', ') || null,
        'сонголттой алга': t.optionalMissing?.join(', ') || null,
        үсэг: t.caseDiff?.map((c) => `${c.code}→${c.live}`).join(', ') || null,
        төрөл: t.typeDiff?.map((x) => `${x.field}: ${x.expected}≠${x.live}`).join(', ') || null,
        тайлбар: t.note ?? null,
      })), 500), '');
    }
    const badSheets = schema.sheets.filter((t) => t.status !== 'ok');
    if (badSheets.length) {
      out.push('### Багцын хуудас', '', mdTable(badSheets.map((t) => ({
        төлөв: t.status, id: t.id, блок: t.blocks ?? null,
        'олдоогүй slot': t.nullSlots?.join(', ') || null,
        асуудал: t.issues?.join(' · ') || null,
        төрөл: t.typeDiff?.map((x) => `${x.field}: ${x.expected}≠${x.live}`).join(', ') || null,
        тайлбар: t.note ?? null,
      })), 500), '');
    }
    const badRoots = schema.roots.filter((t) => t.status !== 'ok');
    if (badRoots.length) {
      out.push('### Үйлчилгээний үндэс', '', mdTable(badRoots.map((t) => ({
        төлөв: t.status, үйлчилгээ: t.root, нийт: t.total,
        'бүртгэлтэй атлаа алга': t.absent.join(', ') || null,
        бүртгэлгүй: t.extra.length ? `${t.extra.length}: ${t.extra.slice(0, 12).join(' · ')}` : null,
        тайлбар: t.note ?? null,
      })), 200), '');
    }
    const skipped = schema.targets.filter((t) => t.status === 'skip');
    if (skipped.length) out.push('### Алгассан', '', mdTable(skipped.map((t) => ({ id: t.id, тайлбар: t.note })), 100), '');
  }
  return out.join('\n');
}
