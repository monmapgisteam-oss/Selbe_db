'use client';

/**
 * СИСТЕМИЙН БАРИМТ — ӨГӨГДЛИЙН КАТАЛОГ.
 *
 * ⚠️ 2026-09-25 (хэрэглэгчийн хүсэлт): урьдын markdown баримт (`sysDocs.ts`) ба
 *    схем (`SysSchemView`)-ийн ОРОНД порталын БҮХ эх сурвалжийг давхарга/хүснэгт
 *    тус бүрээр жагсаана: зориулалт, ШИНЭЧЛЭГДЭХ ШАТЛАЛ (хэн бөглөж, хэн
 *    батлаад, хаашаа урсдаг), уншдаг харагдац, засах эрх, хаалттай эсэх.
 *    Өгөгдөл нь `lib/dataCatalog.ts`-д — энд зөвхөн харуулна. Хуучин файлууд
 *    устгагдаагүй (`docs:build` ба `docs.invariant.check.mjs` хэвээр).
 *
 * ⚠️ СҮЛЖЭЭНД ОГТ ХАНДАХГҮЙ — каталог нь кодын регистрээс бүтээх үед гарна.
 *
 * ⚠️ ШАТЛАЛЫН АЛХАМ ДАРАХАД ТЭР МӨР РҮҮ ҮСЭРНЭ. Зорилтот мөр одоогийн
 *    шүүлтэд нуугдсан бол шүүлтийг ЦЭВЭРЛЭЖ байж үсэрнэ — эс бөгөөс дархад
 *    «юу ч болсонгүй» мэт харагдана.
 */

import { useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { VIEW_BY_KEY, type ViewKey } from '@/lib/services';
import {
  dataCatalog, CAT_GROUPS, kindLabel, searchText, shortRef,
  type CatEntry, type CatGroup, type StepPart,
} from '@/lib/dataCatalog';
import s from './sysDoc.module.css';

type Jump = (id: string) => void;

/** ⚠️ 2026-10-01: «Техникийн дэлгэрэнгүй» эвхмэл хэсэгт харуулах код байгаа эсэх */
export function hasTech(e: Pick<CatEntry, 'aliases' | 'styleSrc'>, editors: { cap?: string }[], rows: unknown[]): boolean {
  return editors.some((x) => !!x.cap) || rows.length > 0 || e.aliases.length > 0 || e.styleSrc.length > 0;
}

/** Шатлалын нэг хэсэг — өөр мөр рүү заасан бол товч */
function Part({ p, onJump, nameOf }: { p: StepPart; onJump: Jump; nameOf: (id: string) => string }) {
  if (!p.ref) return <span>{p.label}</span>;
  return (
    <button
      type="button"
      className={s.stepLink}
      onClick={() => onJump(p.ref!)}
      title={tr('«{0}» мөр рүү очих', nameOf(p.ref))}
    >
      {p.label}
    </button>
  );
}

function Entry({ e, domId, on, onJump, nameOf, go, canOpen }: {
  e: CatEntry;
  domId: string;
  on: boolean;
  onJump: Jump;
  nameOf: (id: string) => string;
  go?: (v: ViewKey) => void;
  canOpen: (v: ViewKey) => boolean;
}) {
  const chain = e.chain();
  const editors = e.editors();
  const rows = e.rows?.() ?? [];
  const note = e.note?.();
  return (
    <li id={domId} tabIndex={-1} className={`${s.item} ${on ? s.hl : ''} ${e.closed ? s.itemClosed : ''}`} aria-labelledby={`${domId}-n`}>
      <div className={s.head}>
        <h3 id={`${domId}-n`} className={s.name}>{e.name}</h3>
        <span className={s.kind}>{kindLabel(e.kind)}</span>
        {e.closed && <span className={s.closed}>{tr('хаалттай (499)')}</span>}
      </div>
      <div className={s.refLine}>
        <code className={s.mono}>{shortRef(e)}</code>
        {e.env && <code className={`${s.mono} ${s.dim}`} title={tr('Орчны хувьсагчаас')}>{e.env}</code>}
      </div>

      <p className={s.purpose}>{e.purpose()}</p>

      <ol className={s.chain} aria-label={tr('Шинэчлэлийн шатлал')}>
        {chain.map((st, i) => (
          <li key={i} className={s.stepLi}>
            {i > 0 && <span className={s.arrow} aria-hidden>→</span>}
            <span className={`${s.step} ${st.ref || st.with?.some((w) => w.ref) ? s.stepHasRef : ''}`}>
              <Part p={st} onJump={onJump} nameOf={nameOf} />
              {st.with?.map((w, k) => (
                <span key={k} className={s.with}>
                  <span className={s.dot} aria-hidden>·</span>
                  <Part p={w} onJump={onJump} nameOf={nameOf} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>

      <dl className={s.meta}>
        <div className={s.metaRow}>
          <dt>{tr('Уншдаг харагдац')}</dt>
          <dd className={s.chips}>
            {e.allMaps && <span className={s.chip}>{tr('Бүх газрын зураг')}</span>}
            {e.views.map((v) => (
              go && canOpen(v)
                ? <button key={v} type="button" className={`${s.chip} ${s.chipBtn}`} onClick={() => go(v)}>{VIEW_BY_KEY[v]?.title ?? v}</button>
                : <span key={v} className={s.chip}>{VIEW_BY_KEY[v]?.title ?? v}</span>
            ))}
            {!e.allMaps && !e.views.length && <span className={`${s.chip} ${s.dim}`}>{tr('Харагдац шууд уншдаггүй')}</span>}
          </dd>
        </div>
        {/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ДОТООД КОДЫГ (`__flow__`, `planApprove` …)
            энгийн хэрэглэгчид ил гаргахгүй — зөвхөн хүний хэлээрх тайлбар. Кодууд нь доорх
            «Техникийн дэлгэрэнгүй» эвхмэл хэсэгт (админ/хөгжүүлэгчид) хэвээр. */}
        <div className={s.metaRow}>
          <dt>{tr('Засах эрх')}</dt>
          <dd className={s.chips}>
            {editors.length
              ? editors.map((x, k) => (
                <span key={k} className={s.chip}>{x.text}</span>
              ))
              : <span className={`${s.chip} ${s.dim}`}>{tr('Порталаас засахгүй (зөвхөн унших)')}</span>}
          </dd>
        </div>
        {rows.length > 0 && (
          <div className={s.metaRow}>
            <dt>{tr('Мөрийн төрөл')}</dt>
            <dd>
              <ul className={s.rows}>
                {rows.map((r) => (
                  <li key={r.key}>{r.text}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      {hasTech(e, editors, rows) && (
        <details className={s.tech}>
          <summary>{tr('Техникийн дэлгэрэнгүй')}</summary>
          <dl className={s.meta}>
            {editors.some((x) => x.cap) && (
              <div className={s.metaRow}>
                <dt>{tr('Эрхийн түлхүүр')}</dt>
                <dd>
                  <ul className={s.rows}>
                    {editors.filter((x) => x.cap).map((x, k) => (
                      <li key={k}><code className={s.mono}>{x.cap}</code> {x.text}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {rows.length > 0 && (
              <div className={s.metaRow}>
                <dt>{tr('Мөрийн түлхүүр')}</dt>
                <dd>
                  <ul className={s.rows}>
                    {rows.map((r) => (
                      <li key={r.key}><code className={s.mono}>{r.key}</code> {r.text}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {e.aliases.length > 0 && (
              <div className={s.metaRow}>
                <dt>{tr('Порталын id')}</dt>
                <dd className={s.chips}>
                  {e.aliases.map((a) => <code key={a} className={`${s.mono} ${s.dim}`}>{a}</code>)}
                </dd>
              </div>
            )}
            {e.styleSrc.length > 0 && (
              <div className={s.metaRow}>
                <dt>{tr('Загварын түлхүүр')}</dt>
                <dd className={s.chips}>
                  {e.styleSrc.map((a) => <code key={a} className={`${s.mono} ${s.dim}`}>{a}</code>)}
                </dd>
              </div>
            )}
          </dl>
        </details>
      )}
      {note && <p className={s.note}>{note}</p>}
    </li>
  );
}

export default function SysDoc({ setView, navScope = 'all' }: {
  setView?: (v: ViewKey) => void;
  /** Хэрэглэгчийн эрхэд байгаа харагдацууд; `'all'` бол хязгааргүй (`Schem`-тэй ижил) */
  navScope?: 'all' | ViewKey[];
}) {
  /**
   * ⚠️ 2026-09-25: ЭРХИЙН ХҮРЭЭНЭЭС ГАДУУРХ харагдац руу ШИЛЖИХГҮЙ — Portal-ын
   * хамгаалалт `navScope[0]` руу шидэж энэ хуудаснаас ГАРГАДАГ. Хүрээнээс
   * гадуурх харагдац нь товч биш, энгийн шошго болж зурагдана.
   */
  const canOpen = useMemo(
    () => (v: ViewKey) => navScope === 'all' || navScope.includes(v),
    [navScope],
  );
  const go = useMemo(
    () => (setView ? (v: ViewKey) => { if (canOpen(v)) setView(v); } : undefined),
    [setView, canOpen],
  );

  const all = useMemo(() => dataCatalog(), []);
  const hay = useMemo(() => new Map(all.map((e) => [e.id, searchText(e)])), [all]);
  /* ⚠️ DOM id нь индексээр — BIM-ийн кирилл нэрийг id болгох шаардлагагүй */
  const domOf = useMemo(() => new Map(all.map((e, i) => [e.id, `cat-${i}`])), [all]);
  const nameOf = useMemo(() => {
    const m = new Map(all.map((e) => [e.id, e.name]));
    return (id: string) => m.get(id) ?? id;
  }, [all]);
  const counts = useMemo(() => {
    const c = {} as Record<CatGroup, number>;
    for (const e of all) c[e.group] = (c[e.group] ?? 0) + 1;
    return c;
  }, [all]);

  const [q, setQ] = useState('');
  const [grp, setGrp] = useState<CatGroup | 'all'>('all');
  const [hl, setHl] = useState<string | null>(null);
  /* ⚠️ 2026-09-29 (аудит 10): тодруулга асаалттай (2.4 с) байхад ИЖИЛ мөр рүү дахин
     үсрэхэд `setHl(id)` өөрчлөлтгүй тул эффект дахин ажилладаггүй байв — тоолуураар. */
  const [hlNonce, setHlNonce] = useState(0);

  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((e) => (grp === 'all' || e.group === grp)
      && terms.every((t) => (hay.get(e.id) ?? '').includes(t)));
  }, [all, hay, q, grp]);

  const jump: Jump = (id) => {
    if (!domOf.has(id)) return;
    if (!shown.some((e) => e.id === id)) { setQ(''); setGrp('all'); }
    setHl(id);
    setHlNonce((n) => n + 1);
  };

  /* Үсэрсэн мөрийг төвд аваачиж, фокуслаад, түр тодруулна */
  useEffect(() => {
    if (!hl) return;
    const el = document.getElementById(domOf.get(hl) ?? '');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setHl(null), 2400);
    return () => window.clearTimeout(t);
  }, [hl, hlNonce, domOf]);

  return (
    <div className={s.wrap}>
      <header className={s.top}>
        <div className={s.titleRow}>
          <h2 className={s.title}>{tr('Өгөгдлийн каталог')}</h2>
          <span className={s.count} aria-live="polite">{tr('{0} / {1} эх сурвалж', shown.length, all.length)}</span>
        </div>
        <p className={s.lead}>{tr('Порталын уншдаг, бичдэг давхарга/хүснэгт бүр — зориулалт, шинэчлэгдэх шатлал, хэн засах эрхтэй.')}</p>
        <input
          type="search"
          className={s.search}
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder={tr('Нэр, үйлчилгээ, id-аар хайх…')}
          aria-label={tr('Каталогоос хайх')}
        />
        <div className={s.filters} role="group" aria-label={tr('Бүлгээр шүүх')}>
          <button type="button" className={`${s.filter} ${grp === 'all' ? s.filterOn : ''}`} aria-pressed={grp === 'all'} onClick={() => setGrp('all')}>
            {tr('Бүгд')} <span className={s.n}>{all.length}</span>
          </button>
          {CAT_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`${s.filter} ${grp === g.key ? s.filterOn : ''}`}
              aria-pressed={grp === g.key}
              onClick={() => setGrp(g.key)}
              disabled={!counts[g.key]}
            >
              {g.label()} <span className={s.n}>{counts[g.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </header>

      {shown.length
        ? (
          <ul className={s.list}>
            {shown.map((e) => (
              <Entry
                key={e.id}
                e={e}
                domId={domOf.get(e.id)!}
                on={hl === e.id}
                onJump={jump}
                nameOf={nameOf}
                go={go}
                canOpen={canOpen}
              />
            ))}
          </ul>
        )
        : <p className={s.empty}>{tr('Тохирох эх сурвалж олдсонгүй')}</p>}
    </div>
  );
}
