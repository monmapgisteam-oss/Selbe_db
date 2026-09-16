'use client';

/**
 * СИСТЕМИЙН БАРИМТ — порталын өөрийн гарын авлага.
 *
 * ⚠️ «Үйл ажиллагааны схем» (`Schem.tsx`)-ТЭЙ АНДУУРАХГҮЙ. Тэр нь БАРИЛГЫН
 * ТӨСЛИЙН урсгалыг зурдаг; энэ нь ПРОГРАМ хэрхэн ажилладгийг тайлбарлана.
 *
 * ⚠️ СҮЛЖЭЭНД ОГТ ХАНДАХГҮЙ. Агуулга нь `sysDocs.ts`-д бүтээх үед шингэдэг
 * (`npm run docs:build`). Эх сурвалж нь `docs/` хэвээр — тэнд засаж, дахин
 * бүтээнэ. GitHub дээр ч, порталд ч ИЖИЛ агуулга.
 *
 * ⚠️ MARKDOWN-ЫГ ӨӨРСДӨӨ ЗУРНА. `react-markdown` нь ~100 КБ нэмнэ; энэ
 * баримтын хэрэглэдэг бүтэц (гарчиг, хүснэгт, жагсаалт, ишлэл, код, mermaid)
 * хязгаарлагдмал тул `AgentMarkdown`-ийн зарчмыг дагав.
 *
 * ⚠️ MERMAID БЛОКИЙГ ЗУРАХГҮЙ — сан нэмэхгүй. Оронд нь «диаграм» гэсэн
 * эвхэгддэг хайрцагт ЭХ бичвэрийг харуулна: GitHub дээр зурагдсан хэвээр,
 * порталд нэмэлт 300 КБ ачаалахгүй.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { SYS_DOCS } from '@/lib/sysDocs';
import { SysSchemView } from './SysSchemView';
import type { ViewKey } from '@/lib/services';
import s from './sysDoc.module.css';

/* ─────────── Мөрийн доторх тэмдэглэгээ ─────────── */

/**
 * `**тод**` · `` `код` `` · `[текст](холбоос)`
 *
 * ⚠️ Дотоод холбоосыг ТОВЧ болгоно: `.md` файл руу заасан холбоос нь порталд
 * URL биш, ӨӨР БҮЛЭГ рүү шилжих үйлдэл. `onJump` нь түүнийг хүлээж авна.
 */
function inline(text: string, key: string, onJump: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  parts.forEach((p, i) => {
    if (!p) return;
    const k = `${key}-${i}`;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      out.push(<strong key={k}>{p.slice(2, -2)}</strong>);
      return;
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      out.push(<code key={k}>{p.slice(1, -1)}</code>);
      return;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) {
      const [, label, href] = link;
      const id = docIdOf(href);
      if (id) {
        out.push(
          <button key={k} type="button" className={s.jump} onClick={() => onJump(id)}>
            {label}
          </button>,
        );
      } else if (/^https?:/.test(href)) {
        out.push(<a key={k} href={href} target="_blank" rel="noreferrer">{label}</a>);
      } else {
        /* Кодын файл руу заасан холбоос — порталаас нээх боломжгүй тул
           зөвхөн нэрийг үлдээнэ (⚠️ холбоос мэт харагдвал дарж үзээд юу ч
           болохгүй нь эвгүй). */
        out.push(<code key={k}>{label}</code>);
      }
      return;
    }
    out.push(<span key={k}>{p}</span>);
  });
  return out;
}

/** `02-ogogdliin-esurvalj.md#хэсэг` → `02-ogogdliin-esurvalj`; бусад бол `null` */
function docIdOf(href: string): string | null {
  const path = href.split('#')[0];
  if (!path.endsWith('.md')) return null;
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
  if (base === 'SYSTEM') return 'index';
  return SYS_DOCS.some((d) => d.id === base) ? base : null;
}

/* ─────────── Мөрийн төрөл таних ─────────── */

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l: string) => /^\s*\|[\s|:-]+\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isBullet = (l: string) => /^\s*[-·]\s+/.test(l);
const isNum = (l: string) => /^\s*\d+[.)]\s+/.test(l);

/* ─────────── Нэг баримтыг зурах ─────────── */

function Body({ src, onJump }: { src: string; onJump: (id: string) => void }) {
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    /* ── Хуваах зураас ── */
    if (/^---+\s*$/.test(line)) { out.push(<hr key={`hr${i}`} />); i += 1; continue; }

    /* ── Хашлагатай блок (mermaid ба бусад) ── */
    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      i += 1;
      const buf: string[] = [];
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) i += 1;
      out.push(
        lang === 'mermaid'
          ? <Diagram key={`d${i}`} src={buf.join('\n')} />
          : <pre key={`p${i}`} className={s.code}>{buf.join('\n')}</pre>,
      );
      continue;
    }

    /* ── Ишлэл (⚠️ анхааруулга ихэвчлэн энд) ── */
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      }
      out.push(
        <blockquote key={`q${i}`} className={s.quote}>
          {buf.filter(Boolean).map((b, n) => <p key={n}>{inline(b, `q${i}${n}`, onJump)}</p>)}
        </blockquote>,
      );
      continue;
    }

    /* ── Гарчиг ── */
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      /* ⚠️ `{#anchor}` тэмдэглэгээг ХАСНА — эс бөгөөс гарчигт ил гарна. */
      const txt = h[2].replace(/\s*\{#[\w-]+\}\s*$/, '');
      const Tag = (`h${Math.min(lvl + 1, 5)}`) as 'h2' | 'h3' | 'h4' | 'h5';
      out.push(<Tag key={`h${i}`} className={s[`h${lvl}`]}>{inline(txt, `ht${i}`, onJump)}</Tag>);
      i += 1;
      continue;
    }

    /* ── Хүснэгт ── */
    if (isRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isRow(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !isSep(r));
      if (body.length) {
        const [head, ...rest] = body;
        out.push(
          /* ⚠️ Нарийн дэлгэцэд өргөн хүснэгт хальдаг тул ХӨНДЛӨН гүйлгэнэ. */
          <div key={`t${i}`} className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{cells(head).map((c, n) => <th key={n}>{inline(c, `th${i}${n}`, onJump)}</th>)}</tr>
              </thead>
              <tbody>
                {rest.map((r, ri) => (
                  <tr key={ri}>
                    {cells(r).map((c, n) => <td key={n}>{inline(c, `td${i}${ri}${n}`, onJump)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    /* ── Жагсаалт ── */
    if (isBullet(line) || isNum(line)) {
      const numbered = isNum(line);
      const items: string[] = [];
      while (i < lines.length && (numbered ? isNum(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i++].replace(/^\s*(?:[-·]|\d+[.)])\s+/, ''));
      }
      const List = numbered ? 'ol' : 'ul';
      out.push(
        <List key={`l${i}`} className={s.list}>
          {items.map((it, n) => <li key={n}>{inline(it, `li${i}${n}`, onJump)}</li>)}
        </List>,
      );
      continue;
    }

    /* ── Догол мөр — дараалсан мөрүүдийг нэгтгэнэ ── */
    const buf: string[] = [];
    while (
      i < lines.length && lines[i].trim()
      && !isRow(lines[i]) && !isBullet(lines[i]) && !isNum(lines[i])
      && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*```/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i]) && !/^---+\s*$/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push(<p key={`p${i}`}>{inline(buf.join(' '), `pt${i}`, onJump)}</p>);
  }

  return <>{out}</>;
}

/**
 * ДИАГРАМ — эх бичвэрийг эвхэгддэг хайрцагт.
 *
 * ⚠️ Зурах САН НЭМЭХГҮЙ (2026-09-16): mermaid нь ~300 КБ бөгөөд энэ баримт
 * нь порталын гол ажиллагаа БИШ. GitHub дээр диаграм зурагдсан хэвээр байх
 * тул мэдээлэл алдагдахгүй. Шаардлага гарвал энд сан холбоно.
 */
function Diagram({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.diagram}>
      <button type="button" className={s.diagramHead} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {tr('Диаграм')}
        <span className={s.diagramHint}>{tr('бүтцийн тайлбар')}</span>
      </button>
      {open && <pre className={s.code}>{src}</pre>}
    </div>
  );
}

/* ─────────── Харагдац ─────────── */

/**
 * ⚠️ СХЕМ нь ЭХНИЙ бөгөөд АНХДАГЧ таб (2026-09-16, хэрэглэгчийн шаардлага:
 * «бүгдийг багтаасан нэг схем»). Бичвэрийн бүлгүүд түүний ДАРАА — схем нь
 * бүхнийг нэг харцаар хэлж, бүлгүүд нь дэлгэрэнгүйг тайлбарлана.
 */
const SCHEM_ID = '__schem__';

export default function SysDoc({ setView }: { setView?: (v: ViewKey) => void }) {
  const [id, setId] = useState(SCHEM_ID);
  const doc = useMemo(() => SYS_DOCS.find((d) => d.id === id) ?? SYS_DOCS[0], [id]);

  /**
   * ⚠️ Бүлэг солиход ДЭЭШ гүйнэ. Эс бөгөөс урт бүлгийн дундаас өөр бүлэг рүү
   * үсрэхэд шинэ баримтын ДУНДУУР нээгдэж, хэрэглэгч «юу ч болсонгүй» гэж
   * бодно.
   */
  const jump = (next: string) => {
    setId(next);
    document.querySelector(`.${s.main}`)?.scrollTo({ top: 0 });
  };

  return (
    <div className={s.wrap}>
      <nav className={s.side} aria-label={tr('Бүлгүүд')}>
        <div className={s.sideHead}>{tr('Системийн баримт')}</div>
        <button
          type="button"
          className={`${s.sideItem} ${s.sideSchem} ${id === SCHEM_ID ? s.sideOn : ''}`}
          aria-current={id === SCHEM_ID ? 'page' : undefined}
          onClick={() => jump(SCHEM_ID)}
        >
          {tr('Схем')}
        </button>
        {SYS_DOCS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`${s.sideItem} ${d.id === id ? s.sideOn : ''}`}
            aria-current={d.id === id ? 'page' : undefined}
            onClick={() => jump(d.id)}
          >
            {d.id === 'index' ? tr('Эхлэл') : d.title.replace(/^\d+\s*·\s*/, '')}
          </button>
        ))}
      </nav>

      <article className={`${s.main} ${id === SCHEM_ID ? s.mainSchem : ''}`}>
        {id === SCHEM_ID
          ? <SysSchemView setView={setView} onDoc={jump} />
          : <Body src={doc.body} onJump={jump} />}
      </article>
    </div>
  );
}
