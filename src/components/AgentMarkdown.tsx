'use client';

/**
 * АГЕНТЫН ХАРИУЛТЫГ ЗУРАХ — жижигхэн markdown хөрвүүлэгч.
 *
 * ⚠️ ЯАГААД САН НЭМЭЭГҮЙ ВЭ: `react-markdown` + `remark` нь ~100 КБ bundle
 * нэмнэ. Агент нь `registry.ts`-ийн зааврын дагуу ЗӨВХӨН тодорхой цөөн бүтэц
 * гаргадаг (тод, код, жагсаалт, хүснэгт, эх сурвалжийн мөр) — тэр дэд олонлогийг
 * зурахад 80 мөр хангалттай. Төслийн бусад хэсэг ч ийм байдлаар өөрөө бичдэг.
 *
 * ⚠️ Заавар ба энэ файл ХОСООРОО ажиллана: `registry.ts`-д хариултын хэлбэрийг
 * өөрчилвөл энд харгалзах зураалт байгаа эсэхийг шалгана.
 */

import type { ReactNode } from 'react';
import { isNumeric } from '@/lib/agent/format';
import { AgentChart } from '@/components/AgentChart';
import s from '@/components/agent.module.css';

/** `**тод**` ба `` `код` `` — мөрийн дотоод тэмдэглэгээ */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Хоёуланг НЭГ алхамд салгана — эс бөгөөс код доторх `**` тодоор орно
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      const body = p.slice(2, -2);
      out.push(
        <strong key={`${key}-${i}`} className={isNumeric(body) ? s.num : undefined}>
          {body}
        </strong>,
      );
    } else if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      out.push(<code key={`${key}-${i}`}>{p.slice(1, -1)}</code>);
    } else {
      out.push(<span key={`${key}-${i}`}>{p}</span>);
    }
  });
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
/** `|---|---|` тусгаарлагч — өгөгдөл БИШ тул зурахгүй */
const isTableSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const isBullet = (l: string) => /^\s*[-•]\s+/.test(l);
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isSource = (l: string) => /^\s*(эх сурвалж|source)\s*[::]/i.test(l);

const cells = (l: string) =>
  l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function AgentMarkdown({ text }: { text: string }) {
  const lines = String(text).split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    /**
     * ── График ── ```chart … ``` хашлагатай JSON блок
     *
     * ⚠️ Хаалтын хашлага ирээгүй ч (хариулт таслагдсан) гогцоо мөнхөд эргэлдэхгүй:
     * файлын төгсгөл хүрвэл цуглуулсанаа зурна.
     */
    if (/^\s*```\s*chart\s*$/i.test(line)) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) i++; // хаалтын хашлагыг алгасна
      out.push(<AgentChart key={`ch${i}`} raw={buf.join('\n')} />);
      continue;
    }

    /* ── Хүснэгт ── */
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !isTableSep(r));
      if (body.length) {
        const [head, ...rest] = body;
        out.push(
          // ⚠️ Нарийн цонхонд өргөн хүснэгт багтахгүй тул ХӨНДЛӨН гүйлгэнэ —
          //    эс бөгөөс бүх чат цонх хэвтээгээр сунана.
          <div key={`t${i}`} className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{cells(head).map((c, n) => <th key={n}>{inline(c, `h${i}${n}`)}</th>)}</tr>
              </thead>
              <tbody>
                {rest.map((r, ri) => (
                  <tr key={ri}>{cells(r).map((c, n) => <td key={n}>{inline(c, `c${i}${ri}${n}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    /* ── Жагсаалт ── */
    if (isBullet(line) || isNumbered(line)) {
      const numbered = isNumbered(line);
      const items: string[] = [];
      while (i < lines.length && (numbered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i++].replace(/^\s*(?:[-•]|\d+[.)])\s+/, ''));
      }
      const List = numbered ? 'ol' : 'ul';
      out.push(
        <List key={`l${i}`} className={s.list}>
          {items.map((it, n) => <li key={n}>{inline(it, `li${i}${n}`)}</li>)}
        </List>,
      );
      continue;
    }

    /**
     * ── Эх сурвалжийн мөр — ХАЯГДАНА, хэрэглэгчид ХАРАГДАХГҮЙ ──
     *
     * ⚠️ Агент нь мөрийг ГАРГАСААР байна (`registry.ts`-ийн дүрэм). Тэр нь
     * загварыг «энэ тоог яг хаанаас авсан бэ» гэж нэрлэхэд хүргэдэг сахилга
     * бөгөөд зохиомол тоо гаргах эрсдэлийг бууруулдаг. Зөвхөн ХАРУУЛАХГҮЙ —
     * удирдлагад `et:24 / OBJECTID` гэдэг нь утгагүй техникийн чимээ.
     *
     * ⚠️ Хөгжүүлэгч шалгах шаардлагатай бол `npm run ask "…"` дээр бүрэн харагдана.
     */
    if (isSource(line)) {
      i++;
      continue;
    }

    /* ── Энгийн догол мөр — дараалсан мөрүүдийг нэгтгэнэ ── */
    /**
     * ⚠️ 2026-08-19: ``` хашилтан блок дээр ЗААВАЛ таслана. Загвар нь ихэвчлэн
     * «**Гүйцэтгэлийн байдал**» гэсэн тодруулсан гарчгийн ДАРАА хоосон мөр
     * үлдээлгүй шууд ```chart блок бичдэг. Тасалдаггүй байхад тэр блокийн
     * хашилт, JSON, хаалт гурвуулаа догол мөрд ЗАЛГИГДАЖ, удирдлагад график
     * зурагдахын оронд `{"type":"bar",…}` гэсэн түүхий JSON харагддаг байв
     * (дээрх графикийн салаа нь зөвхөн БЛОК ЭХЛЭХ үед ажилладаг).
     */
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !isTableRow(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !isSource(lines[i])
    ) {
      para.push(lines[i++]);
    }
    /**
     * Хашилт нь ЭХНИЙ мөр байсан бол догол мөр хоосон.
     * ⚠️ `i++` ЗААВАЛ: энд `continue` дангаараа бичвэл индекс ахихгүй тул
     * дээрх графикийн салаанд баригдаагүй хашилт (жиш. дан хаалтын ```)
     * ХЯЗГААРГҮЙ ДАВТАЛТ үүсгэж хөтчийг гацаана. Мөрийг залгиад цааш явна.
     */
    if (!para.length) { i++; continue; }
    out.push(<p key={`p${i}`} className={s.para}>{inline(para.join('\n'), `pi${i}`)}</p>);
  }

  return <>{out}</>;
}
