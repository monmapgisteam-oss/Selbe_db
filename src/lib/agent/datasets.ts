'use client';

import { t as tr } from '@/lib/i18nCore';
import { SENSORS } from '@/lib/sensors';
/**
 * АГЕНТЫН ХОЁР ДАХЬ БҮРТГЭЛ — газрын зургийн ДАВХАРГА БИШ өгөгдлийн эх сурвалжууд.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ: `LAYERS` бол ГАЗРЫН ЗУРАГ зурах бүртгэл. Санхүү,
 * гүйцэтгэл, ажлын хуудас зэрэг нь зураг дээр зурагддаггүй тул тэнд байхгүй —
 * гэвч хэрэглэгч (ялангуяа удирдлага) яг тэдгээрийг асуудаг. Энэ файл тэр
 * цоорхойг нөхнө.
 *
 * ⚠️ ХАЯГ БА ТАЛБАРЫГ `services.ts`-ЭЭС АВНА — гараар хуулахгүй. Тэнд URL эсвэл
 * талбарын нэр өөрчлөгдвөл агент автоматаар дагана (гол шаардлага №3).
 *
 * ⚠️ ЭМЗЭГ ӨГӨГДӨЛ: `sensitive: true` тэмдэгтэйг нь агент АНХНААСАА харахгүй.
 * `SENSITIVE_ENABLED`-ыг `true` болгоход л нээгдэнэ — байгууллагын зөвшөөрөл
 * гарсны дараа. Тэр өгөгдөл LLM үйлчилгээ рүү явна гэдгийг санана уу.
 */

import {
  CASHFLOW2,
  HABEA,
  PROJECT_PROGRESS,
  TASK_SHEET,
  BOUNDARY,
  USAN_SAN,
  type ViewKey,
} from '@/lib/services';

/**
 * ⚠️ ЭМЗЭГ ӨГӨГДЛИЙН ТҮЛХҮҮР ТОВЧ.
 *
 * `true` — санхүү (`CASHFLOW`, `INVEST`) ба төслийн явц (`PROJECT_PROGRESS`)
 * агентад НЭЭЛТТЭЙ. Удирдлага мөнгө, гэрээ, барилгын явцыг асуудаг тул эдгээргүй
 * бол агент үндсэн зорилгоо биелүүлэхгүй (төслийн эзний шийдвэр, 2026-08-13).
 *
 * ⚠️ ЭНЭ ТОО ГАДААД LLM ҮЙЛЧИЛГЭЭ РҮҮ ЯВНА. Тиймээс provider нь өгөгдлийг
 * сургалтад АШИГЛАДАГГҮЙ байх ёстой (Anthropic API — ашигладаггүй). Үнэгүй
 * квоттай үйлчилгээ рүү (жиш. Gemini free) ШИЛЖИХГҮЙ.
 *
 * ⚠️ Мөн эдгээр нь `finance` / `dashboard` харагдацын эрхээр хамгаалагдана —
 * тэр эрхгүй хэрэглэгч агентаар дамжуулж ч харахгүй. Telegram талд `/users`-ээр
 * хэн хандах эрхтэйг шалгана.
 */
export const SENSITIVE_ENABLED = true;

export type Dataset = {
  /** `ds:` угтвартай — давхаргын id-аас ялгарна */
  id: string;
  title: string;
  url: string;
  /** OID талбарын нэр — анхдагч `OBJECTID` */
  oid?: string;
  /** Аль харагдацын эрхээр хамгаалагдах вэ */
  view: ViewKey;
  /**
   * Багц/бүсийн код агуулах талбар — бүсийн нэгдсэн тоймд ашиглагдана.
   * ⚠️ Утга нь давхаргуудынхаас ӨӨР бичиглэлтэй («Багц 4-1» vs «Багц-4.1») тул
   * `bagtsKey()`-ээр жишнэ, шууд харьцуулахгүй.
   */
  zoneField?: string;
  /** Хэрэглэгчийн хэлдэг үгс */
  synonyms?: string[];
  /** Машины нэр → хүний ойлгох утга (нэгжтэй нь) */
  fields?: Record<string, string>;
  note?: string;
  warn?: string;
  /** Зөвшөөрөлгүйгээр агентад нээгдэхгүй */
  sensitive?: boolean;
};


const ALL: Dataset[] = [
  /* ─────────── Эмзэг БУС ─────────── */

  {
    id: 'ds:task_sheet',
    title: tr('Ажлын хуудас (гүйцэтгэл бөглөх)'),
    url: TASK_SHEET.url,
    oid: TASK_SHEET.oid,
    view: 'sheet',
    zoneField: TASK_SHEET.fields.bagts,
    synonyms: [tr('ажлын хуудас'), tr('гүйцэтгэл бөглөх'), tr('багцын ажил'), tr('шатлал')],
    fields: {
      [TASK_SHEET.fields.bagts]: tr('Багц («Багц 4-1» хэлбэрээр)'),
      [TASK_SHEET.fields.no]: tr('№ — «А.», «Б.», «Б1», «1.2»'),
      [TASK_SHEET.fields.level]: tr('Шатлал 1–5 (5 = навч ажил)'),
      [TASK_SHEET.fields.work]: tr('Ажлын нэр'),
      [TASK_SHEET.fields.date]: tr('Огноо (YYYY-MM-DD)'),
      [TASK_SHEET.fields.version]: tr('Хувилбар (upload багц)'),
      [TASK_SHEET.fields.weight]: tr('Хувийн жин'),
      [TASK_SHEET.fields.section]: tr('Давхрын хэсэг'),
      [TASK_SHEET.fields.block]: tr('Барилга/блок («5/1 барилга»)'),
      [TASK_SHEET.fields.progress]: tr('Гүйцэтгэл 0–1 (хувь БИШ)'),
    },
    warn:
      tr('Гүйцэтгэл (`{0}`) нь 0–1 хооронд — хувь болгож харуулахдаа 100-аар үржүүлнэ. ', TASK_SHEET.fields.progress) +
      tr('Мөн зөвхөн {0}=5 (навч) мөрүүд бодит ажил; дээд шатлалын мөрүүд нь нэгтгэл тул ДАВХАР тоологдоно.', TASK_SHEET.fields.level),
  },

  {
    id: 'ds:habea',
    title: tr('ХАБЭА — хөдөлмөр, техникийн тайлан'),
    url: HABEA.labor.url,
    // ⚠️ Survey123-аас гаралтай давхаргууд OID-гоо ЖИЖИГ үсгээр нэрлэдэг
    //    (`OBJECTID` БИШ). Буруу нэрээр `COUNT()` асуувал хүсэлт бүхэлдээ унана.
    oid: 'objectid',
    view: 'habea',
    // ⚠️ ӨРГӨН схем — багц нь гүйцэтгэгч тус бүрийн `Bagts_<SFX>` баганад байна.
    //    Дээд түвшний ГАНЦ «багц» талбар БАЙХГҮЙ тул `zoneField` тавьж болохгүй
    //    (тавибал `queryGroup` нь «Invalid field» гэж унана).
    synonyms: [tr('хабэа'), tr('ажилтан'), tr('ажиллах хүч'), tr('техник'), tr('кран'), tr('экскаватор')],
    fields: {
      [HABEA.labor.fields.ognoo]: tr('Тайлангийн огноо'),
      [HABEA.labor.fields.niitAjiltan]: tr('Нийт ажилтны тоо (бүх гүйцэтгэгч)'),
      [HABEA.labor.fields.hunTsag]: tr('Хүн-цаг'),
      [HABEA.labor.fields.niitTehnik]: tr('Нийт техник (бүх гүйцэтгэгч)'),
    },
    warn:
      tr('Энэ бол ӨДӨР ТУТМЫН НЭГДСЭН тайлан — мөр бүр НЭГ өдрийн бүх гүйцэтгэгчийн мэдээ. ') +
      tr('Ажилтны тоог бүх мөрөөр НИЙЛҮҮЛЭХ нь БУРУУ (нэг ажилтан олон өдөр давтагдана). ') +
      tr('Тухайн өдрийн байдлыг асуувал СҮҮЛИЙН огноогоор шүүнэ; хандлага асуувал огноогоор эрэмбэлнэ. ') +
      tr('Гүйцэтгэгч тус бүрийн задаргаа нь дагаварласан талбаруудаар байна: ') +
      tr('`Bagts_<SFX>` (багц), `MNG_ajiltani_too_<SFX>` (монгол), `G_ajiltanii_too_<SFX>` (гадаад), ') +
      tr('`Niit_ajiltan_<SFX>` (нийт ажилтан), `Tehnik_<SFX>` (техник) — ') +
      'SFX ∈ HHDMGK, HBZIT, HBTIT, MSK, NBG, MK, P, MMSE, SC, OSNAAG, GUBB, CHHO. ' +
      tr('Техникийн ТӨРЛИЙН (цамхагт кран, экскаватор г.м.) задаргаа энэ маягтад БАЙХГҮЙ — ') +
      tr('краны талаар асуувал `Цамхагт_кран` давхаргаас уншина.'),
  },

  {
    id: 'ds:usan_san',
    title: tr('Усан сан'),
    url: USAN_SAN.url,
    view: 'plan',
    synonyms: [tr('усан сан'), tr('ус хуримтлуулах')],
  },

  {
    id: 'ds:boundary',
    title: tr('Төлөвлөлтийн талбайн хил'),
    url: BOUNDARY.plan.url,
    view: 'plan',
    synonyms: [tr('хил'), tr('төлөвлөлтийн талбай'), tr('хүрээ')],
    note: tr('Төслийн нийт талбай = энэ давхаргын Hec_area талбар (га) — геометрээс дахин тооцохгүй.'),
  },

  /* ─────────── ЭМЗЭГ — зөвшөөрөл гартал хаалттай ─────────── */

  /* ds:cashflow (BUS_cashflow) 2026-08-13-нд, ds:invest (Хөрөнгө оруулалт өртөг
     /249) 2026-08-14-нд хасагдав — санхүүгийн ЦОРЫН ГАНЦ зөв эх нь доорх
     ds:cashflow2 (Cashflow /106). INVEST өгөгдөл тодруулагдсаны дараа эргэн нэмнэ. */

  /**
   * ⚠️ «БАРИЛГЫН ХЯНАЛТ / ЦОГЦОЛБОР» дашбоардын толгойн тоонууд ЭНДЭЭС гардаг
   * (урьдчилсан төсөвт өртөг, захирамжийн дүн, олгосон санхүүжилт, эх үүсвэрийн
   * задаргаа, сар бүрийн урсгал). `ds:cashflow`-ООС ӨӨР эх сурвалж — тэр нь
   * зөвхөн барилга угсралтын 7 багцын хуучин хүснэгт.
   */
  {
    id: 'ds:cashflow2',
    title: tr('Санхүүжилт — захирамж, гэрээ, сарын урсгал (дашбоардын эх)'),
    url: CASHFLOW2.url,
    oid: CASHFLOW2.oid,
    view: 'pkgFin',
    sensitive: true,
    zoneField: CASHFLOW2.fields.pkg2,
    synonyms: [tr('санхүүжилт'), tr('захирамж'), tr('гэрээ'), tr('төсөвт өртөг'), tr('олгосон'), tr('сарын урсгал')],
    fields: {
      [CASHFLOW2.fields.type]: tr('Төрөл (ТЭЗҮ, инженер…)'),
      [CASHFLOW2.fields.pkg]: tr('Багц (бүдүүвч — дэд багц ялгадаггүй)'),
      [CASHFLOW2.fields.pkg2]: tr('Багц дэд багцтайгаа («БАГЦ-3.1») — ЭНИЙГ ашигла'),
      [CASHFLOW2.fields.name]: tr('Ажлын дэлгэрэнгүй нэр'),
      [CASHFLOW2.fields.budget]: tr('Урьдчилсан төсөвт өртөг, ₮'),
      [CASHFLOW2.fields.orderNo]: tr('Захирамжийн дугаар'),
      [CASHFLOW2.fields.orderTotal]: tr('Захирамжийн нийт дүн, ₮'),
      [CASHFLOW2.fields.client]: tr('Захиалагчийн хяналт'),
      [CASHFLOW2.fields.contractor]: tr('Гүйцэтгэгч байгууллага'),
      [CASHFLOW2.fields.contractDate]: tr('Гэрээ байгуулсан огноо'),
      [CASHFLOW2.fields.contractNo]: tr('Гэрээний дугаар'),
      [CASHFLOW2.fields.contractAmount]: tr('Гэрээ байгуулах эрх олгосон дүн, ₮'),
      [CASHFLOW2.fields.prevPct]: tr('Өмнө шилжүүлсэн хувь (БУТАРХАЙ 0–1)'),
      [CASHFLOW2.fields.prevAmount]: tr('Өмнө шилжүүлсэн мөнгөн дүн, ₮'),
      ...Object.fromEntries(CASHFLOW2.sources.map((s) => [s.field, tr('Санхүүжилтийн эх — {0}, ₮', s.label)])),
      ...Object.fromEntries(
        CASHFLOW2.months.flatMap((m) => [
          [m.amount, tr('{0} сарын дүн, ₮', m.label)],
          [m.amountCum, tr('{0} — өссөн дүн, ₮', m.label)],
        ]),
      ),
    },
    warn:
      tr('Багцаар шүүхдээ ЗААВАЛ `') + CASHFLOW2.fields.pkg2 + tr('` (дэд багцтай) ашигла — `') +
      CASHFLOW2.fields.pkg + tr('` нь дэд багц ялгадаггүй, зарим мөрөнд «0». ') +
      tr('Хувийн талбарууд (`') + CASHFLOW2.fields.prevPct + tr('`, сарын `pct`) нь БУТАРХАЙ 0–1 — харуулахдаа ×100. ') +
      tr('Мөнгөн дүн ТӨГРӨГӨӨР; хариултад сая/тэрбум/их наяд гэж хөрвүүлж бич.'),
  },


  {
    id: 'ds:progress',
    title: tr('Төслийн гүйцэтгэл — үе шатаар'),
    url: PROJECT_PROGRESS.url,
    oid: PROJECT_PROGRESS.oid,
    view: 'dashboard',
    sensitive: true,
    zoneField: PROJECT_PROGRESS.fields.bagts,
    synonyms: [tr('төслийн явц'), tr('гүйцэтгэл'), tr('үе шат'), tr('биелэлт')],
    fields: {
      [PROJECT_PROGRESS.fields.no]: tr('Д/д («6.2.1.1» — эхний тоо нь үе шат)'),
      [PROJECT_PROGRESS.fields.stage]: tr('Үе шатны нэр'),
      [PROJECT_PROGRESS.fields.work]: tr('Ажлын нэр'),
      [PROJECT_PROGRESS.fields.bagts]: tr('Багцын код'),
      [PROJECT_PROGRESS.fields.sectionWeight]: tr('Үе шат доторх жин (%)'),
      [PROJECT_PROGRESS.fields.weight]: tr('Төслийн нийт дүнд эзлэх жин (%)'),
      [PROJECT_PROGRESS.fields.planned]: tr('Төлөвлөгөөт гүйцэтгэл (%)'),
      [PROJECT_PROGRESS.fields.actual]: tr('Бодит гүйцэтгэл (%)'),
      [PROJECT_PROGRESS.fields.fulfilment]: tr('Төлөвлөгөөний биелэлт (%)'),
    },
    warn:
      tr('Нийт гүйцэтгэлийг гаргахдаа энгийн ДУНДАЖ авч БОЛОХГҮЙ — ажил бүр өөр жинтэй. ') +
      tr('`{0}`-ыг `{1}`-ээр жинлэж нэгтгэнэ.', PROJECT_PROGRESS.fields.actual, PROJECT_PROGRESS.fields.weight),
  },

  /* ─────────── IoT МЭДРЭГЧ ───────────
   * ⚠️ `sensors.ts`-ийн бүртгэлээс АВТОМАТААР үүснэ — мэдрэгч нэмэхэд энд
   * гараар мөр нэмэх шаардлагагүй, тодорхойлолт нь нэг эхээс тархана.
   *
   * ⚠️ Урьд нь агент мэдрэгчийг ОГТ харахгүй байв: «хогийн сав хэд дүүрсэн
   * бэ?» гэсэн асуултад «ийм өгөгдөл алга» гэж хариулдаг байлаа.
   */
  ...SENSORS.map((sn): Dataset => ({
    id: `ds:iot_${sn.key}`,
    title: `IoT · ${sn.label}`,
    url: sn.url,
    view: 'iot' as const,
    synonyms: [tr('мэдрэгч'), tr('сенсор'), tr('IoT'), sn.label],
    fields: {
      received_datetime: tr('Хэмжсэн хугацаа (ISO-8601, +08:00) — цуваа ба эрэмбэ ҮҮГЭЭР'),
      ingested_at: tr('ArcGIS руу АЧААЛСАН хугацаа — хэмжилтийн хугацаа БИШ, цуваанд хэрэглэхгүй'),
      ...Object.fromEntries(sn.metrics.map((m) => [
        m.field,
        `${m.label}${m.unit ? ` (${m.unit})` : ''} — ${m.note}`,
      ])),
    },
    note: sn.note,
    warn:
      tr('⚠️ Задарсан утга мөр БҮРД БАЙХГҮЙ (Mononet-ийн decoder тогтворгүй) — асуулга бүрд `<талбар> IS NOT NULL` шүүлт ЗААВАЛ тавь, эс бөгөөс дундаж/тоолол хазайна. ')
      + tr('⚠️ Сүүлийн заалт нь ӨНӨӨДРИЙНХ байх албагүй: хэдэн хоногоор хоцорч болно. Хариултад заалтын ОГНООГ заавал дурд. ')
      + (sn.metrics.some((m) => m.derive)
        ? tr('⚠️ Түүхий талбар нь дэлгэцийн утгаас ӨӨР: «{0}» нь мм-ээр хэмжсэн ЗАЙ бөгөөс дүүрэлтийн хувь БИШ (дүүрэлт = (3015 − зай) / 3015 × 100).', sn.metrics.find((m) => m.derive)?.field ?? '')
        : ''),
  })),
];

/**
 * ⚠️ `BIM` энд ОРООГҮЙ: тэр нь `SceneServer` (3D хавтангийн үйлчилгээ) бөгөөд
 * `/query` эцэг цэггүй — атрибутын асуулга явуулах боломжгүй. Зөвхөн зурагдана.
 */

/** Агентад НЭЭЛТТЭЙ өгөгдлийн эх сурвалжууд */
export const DATASETS: Dataset[] = ALL.filter((d) => SENSITIVE_ENABLED || !d.sensitive);

export const DATASET_BY_ID: Record<string, Dataset> = Object.fromEntries(
  DATASETS.map((d) => [d.id, d]),
);
