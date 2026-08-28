'use client';

/**
 * ЗӨВШӨӨРӨЛ НЭМЭХ / ЗАСАХ МАЯГТ.
 *
 * ⚠️ Зарчим: маягт нь хэрэглэгчийн оруулсныг ЧИМЭЭГҮЙ ЗАСАХГҮЙ. Зөрчлийг
 * зөвхөн хэлж, хаана байгааг нэрлэж өгнө. Автоматаар «зөв болгосон» утга нь
 * хэрэглэгчийн мэдэлгүй өөр өгөгдөл болж хадгалагдана.
 *
 * ⚠️ Хадгалах амжилтгүй бол маягт ХААГДАХГҮЙ — оруулсан утга алдагдахгүй.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { buildPacks } from '@/modules/Bagts';
import { useBuildings } from '@/modules/BuildingPanel';
import {
  TOLOV, deleteZov, saveZov, validateZov, type Tolov, type Zov, type ZovDraft,
} from '@/lib/zovshoorol';
import s from './zovshoorol.module.css';

/** ms → YYYY-MM-DD (UTC). Огноогүй бол хоосон. */
const toInput = (ms: number | null): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
};

/** YYYY-MM-DD → ms (UTC). ⚠️ Орон нутгийн бүсээр уншвал нэг хоног ухарна. */
const fromInput = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const TOLOV_LIST: Exclude<Tolov, 'unknown'>[] = [TOLOV.wait, TOLOV.ok, TOLOV.no];

export function ZovshoorolEdit({ init, all, onDone, onCancel }: {
  init: ZovDraft;
  all: Zov[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ZovDraft>(init);
  /**
   * ⚠️ ХӨНДӨГДСӨН ЭСЭХ — санамсаргүй хаалтаас хамгаална. Гадуур дарах,
   * Esc дарах нь маягтыг ХААДАГ тул урт тайлбар бичсэн хүн нэг товшилтоор
   * бүгдийг алдаж болно. Өөрчлөлт байвал баталгаажуулна.
   */
  const dirty = useRef(false);
  const [err, setErr] = useState<Partial<Record<keyof ZovDraft, string>>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const editing = init.oid != null;

  useEffect(() => { firstRef.current?.focus(); }, []);
  /** Хаахыг оролдох — өөрчлөлт байвал асууна. */
  const tryClose = useCallback(() => {
    if (busy) return;
    if (dirty.current && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хаах уу?'))) return;
    onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryClose]);

  /**
   * БАГЦЫН СОНГОЛТ — «Багцын гүйцэтгэл» харагдацын ЯГ ТЭР жагсаалтаас.
   *
   * ⚠️ Урьд нь `PKG_GROUPS` (бөглөх хуудсуудын 7 багц) ашиглаж байв. Тэр нь
   * ЗӨВХӨН барилга угсралтын багцууд — дэд бүтэц, нийгмийн барилга, өндөржилт
   * огт байхгүй. Зөвшөөрөл нь бүх төрлийн багцад шаардлагатай тул хяналтын
   * жагсаалтаас авна: ингэснээр нэрс ч ижил бичигдэж, хоёр хуудас хоорондоо
   * тааруулагдана.
   *
   * ⚠️ Бүртгэлд аль хэдийн байгаа багцыг ч нэмнэ — давхарга уншигдаагүй
   * эсвэл нэр өөрчлөгдсөн үед хуучин мөр сонголтоос алга болох ёсгүй.
   */
  const bq = useBuildings();
  /* ⚠️ Хамаарал нь `bq` БИШ мөрүүд өөрсдөө: `useAsync` нь зурагдал бүрд
     ШИНЭ объект буцаадаг тул `bq`-ээр хамаарвал memo ажиллахгүй, багцын
     жагсаалт товшилт бүрд дахин угсрагдана. */
  const bRows = bq.state === 'ready' ? bq.data.rows : null;
  const bagtsOpts = useMemo(() => {
    const set = new Set<string>(buildPacks(bRows).map((p) => p.name));
    for (const r of all) if (r.bagts) set.add(r.bagts);
    return [...set].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
  }, [all, bRows]);

  /**
   * Багц солиход ДАРААЛЛЫГ санал болгоно (сүүлийнх + 1).
   * ⚠️ Энэ нь САНАЛ — хэрэглэгч гараар өөрчилж болно.
   */
  const nextShat = (bagts: string): number => {
    const mine = all.filter((r) => r.bagts === bagts && r.oid !== d.oid);
    return mine.length ? Math.max(...mine.map((r) => r.shat)) + 1 : 1;
  };

  const set = (k: keyof ZovDraft, v: unknown) => {
    dirty.current = true;
    setD((p) => ({ ...p, [k]: v }) as ZovDraft);
    setErr((p) => ({ ...p, [k]: undefined }));
    setFail('');
  };

  const submit = async () => {
    const e = validateZov(d, all);
    setErr(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    setFail('');
    try {
      await saveZov({ ...d, ner: d.ner.trim(), bagts: d.bagts.trim() });
      onDone();
    } catch (x) {
      setFail(String((x as Error).message || x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.oid) return;
    if (!window.confirm(tr('«{0}» зөвшөөрлийг бүрмөсөн устгах уу? Буцаах боломжгүй.', d.ner))) return;
    setBusy(true);
    setFail('');
    try {
      await deleteZov(d.oid);
      onDone();
    } catch (x) {
      setFail(String((x as Error).message || x));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof ZovDraft, label: string, node: ReactNode, hint?: string) => (
    <label className={s.f}>
      <span className={s.fLabel}>{label}</span>
      {node}
      {err[k] ? <span className={s.fErr}>{err[k]}</span> : hint ? <span className={s.fHint}>{hint}</span> : null}
    </label>
  );

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" onClick={tryClose}>
      <div className={s.modal + ' ' + s.modalWide} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>
            {editing ? tr('Зөвшөөрөл засах') : tr('Зөвшөөрөл нэмэх')}
          </span>
          <button type="button" className={s.close} onClick={tryClose} disabled={busy} aria-label={tr('Хаах')}>✕</button>
        </div>

        <div className={s.form}>
          <div className={s.grid2}>
            {field('bagts', tr('Багц'), (
              <select
                className={s.input}
                value={d.bagts}
                onChange={(e) => {
                  const b = e.target.value;
                  dirty.current = true;
                  setD((p) => ({ ...p, bagts: b, shat: p.oid ? p.shat : nextShat(b) }));
                  setErr({});
                }}
              >
                <option value="">{tr('— сонгох —')}</option>
                {bagtsOpts.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ))}
            {field('shat', tr('Дараалал'), (
              <input
                className={s.input}
                type="number"
                min={1}
                step={1}
                value={String(d.shat)}
                onChange={(e) => set('shat', Number(e.target.value))}
              />
            ), tr('Гинжин дэх байрлал — 1-ээс эхэлнэ'))}
          </div>

          {field('ner', tr('Зөвшөөрлийн нэр'), (
            <input
              ref={firstRef}
              className={s.input}
              value={d.ner}
              maxLength={200}
              placeholder={tr('жиш. Барилга барих зөвшөөрөл')}
              onChange={(e) => set('ner', e.target.value)}
            />
          ))}

          <div className={s.grid2}>
            {field('tolov', tr('Төлөв'), (
              <div className={s.radios}>
                {TOLOV_LIST.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={s.radio + ' ' + (d.tolov === t ? s.radioOn : '')}
                    onClick={() => set('tolov', t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ))}
            {field('ognoo', tr('Шийдвэрлэсэн огноо'), (
              <input
                className={s.input}
                type="date"
                value={toInput(d.ognoo)}
                onChange={(e) => set('ognoo', fromInput(e.target.value))}
              />
            ), d.tolov === TOLOV.wait ? tr('Хүлээгдэж буй үед хоосон') : undefined)}
          </div>

          <div className={s.grid2}>
            {field('dugaar', tr('Зөвшөөрлийн дугаар'), (
              <input className={s.input} value={d.dugaar} maxLength={100}
                onChange={(e) => set('dugaar', e.target.value)} />
            ), d.tolov === TOLOV.ok && !d.dugaar.trim()
              ? tr('Зөвшөөрсөн боловч дугаар бичээгүй байна')
              : undefined)}
            {field('baiguullaga', tr('Шийдвэрлэх байгууллага'), (
              <input className={s.input} value={d.baiguullaga} maxLength={150}
                onChange={(e) => set('baiguullaga', e.target.value)} />
            ))}
          </div>

          <div className={s.grid2}>
            {field('hariutsagch', tr('Байгууллагын хариуцагч'), (
              <input className={s.input} value={d.hariutsagch} maxLength={100}
                onChange={(e) => set('hariutsagch', e.target.value)} />
            ))}
            {field('selbe', tr('Сэлбэ талын хариуцагч'), (
              <input className={s.input} value={d.selbe} maxLength={100}
                onChange={(e) => set('selbe', e.target.value)} />
            ))}
          </div>

          {field('tailbar', tr('Тайлбар'), (
            <textarea className={s.input + ' ' + s.area} rows={3} value={d.tailbar} maxLength={2000}
              onChange={(e) => set('tailbar', e.target.value)} />
          ))}

          {fail && <div className={s.formErr} role="alert">{fail}</div>}
        </div>

        <div className={s.actions}>
          {editing && (
            <button type="button" className={s.danger} onClick={remove} disabled={busy}>
              {tr('Устгах')}
            </button>
          )}
          <span className={s.spacer} />
          <button type="button" className={s.btn} onClick={tryClose} disabled={busy}>
            {tr('Болих')}
          </button>
          <button type="button" className={s.primary} onClick={submit} disabled={busy}>
            {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
          </button>
        </div>
      </div>
    </div>
  );
}
