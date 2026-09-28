'use client';

/**
 * MS — АЖЛЫН АРГАЧЛАЛЫН МАЯГТ: маягтын 6 хэсэг (MSC-SLB-MS-P0303-0001-00,
 * хуудас 3) + 2026-09-28: ажлын төрөл (`meta.workType`, 32-оос сонгоно) ба
 * боловсруулсан огноо · ангилал (`meta`).
 *
 * ⚠️ 6 хэсгийн бүтэц ӨӨРЧЛӨГДӨӨГҮЙ — хуучин мөрүүд (`meta`-гүй JSON) хэвээр
 *    уншигдана (`parseBodyOf` хоосон meta нөхнө).
 * ⚠️ 2026-09-28: QMP · PRC мөн ЭНЭ маягт (`kind` prop) — ажлын төрлийн сонголт
 *    зөвхөн MS-д (32 төрөл нь ажлын аргачлалын жагсаалт).
 */

import { t as tr } from '@/lib/i18nCore';
import type { DocKind, MsBody, Meta } from '@/lib/chanarMs';
import { msWorkTypes } from '@/lib/chanarTemplates';
import { Sec, Txt, Sel, DateInp, Inp, type Mode } from './fields';
import s from '../chanar.module.css';

export type MsFull = MsBody & { meta: Meta };

/** Маягтын 6 хэсэг — MS PDF-ийн бүтэц (`MsBody`) */
const SECTIONS: { k: keyof MsBody; label: () => string; hint: () => string }[] = [
  { k: 'general', label: () => tr('1. Ерөнхий мэдээлэл'), hint: () => tr('Ажлын нэр, байршил, гэрээний иш, хамрах хугацаа') },
  { k: 'scope', label: () => tr('2. Ажлын хамрах хүрээ'), hint: () => tr('Ямар ажил, ямар хэмжээ, зураг төслийн иш') },
  { k: 'materials', label: () => tr('3. Материал · тоног төхөөрөмж · хүн хүч'), hint: () => tr('Материалын жагсаалт, машин механизм, ажилтны бүрэлдэхүүн') },
  { k: 'sequence', label: () => tr('4. Ажлын дараалал, технологи'), hint: () => tr('Алхам алхмаар: бэлтгэл → гүйцэтгэл → дуусгал') },
  { k: 'quality', label: () => tr('5. Чанарын хяналт, шалгалт'), hint: () => tr('ITP-тэй холбоо, шалгах цэг, хүлээн авах шалгуур, туршилт') },
  { k: 'safety', label: () => tr('6. ХАБЭА арга хэмжээ'), hint: () => tr('Эрсдэл, хамгаалах хэрэгсэл, аюулгүй ажиллагааны заавар') },
];

export function MsForm({ m, body, onChange, kind = 'MS' }: { m: Mode; body: MsFull; onChange: (b: MsFull) => void; kind?: DocKind }) {
  const meta = body.meta;
  const setMeta = (p: Partial<Meta>) => onChange({ ...body, meta: { ...meta, ...p } });
  const types = msWorkTypes();
  return (
    <>
      <dl className={s.meta}>
        {kind === 'MS' && <Sel
          m={m} label={tr('Ажлын төрөл (32-оос)')} value={meta.workType ?? ''}
          onChange={(v) => setMeta({ workType: v || null })}
          options={types.map((w) => ({ v: w.id, l: `${w.name}${w.required ? '' : ` (${tr('шаардахгүй')})`}` }))}
        />}
        <DateInp m={m} label={tr('Боловсруулсан огноо')} value={meta.preparedAt} onChange={(v) => setMeta({ preparedAt: v })} />
        <Inp m={m} label={tr('Ангилал')} value={meta.category} onChange={(v) => setMeta({ category: v })} />
      </dl>
      {SECTIONS.map((sec) => (
        <Sec key={sec.k} title={sec.label()}>
          <Txt m={m} label={sec.label()} hint={sec.hint()} value={body[sec.k]} onChange={(v) => onChange({ ...body, [sec.k]: v })} />
        </Sec>
      ))}
    </>
  );
}
