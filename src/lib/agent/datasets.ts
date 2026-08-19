'use client';

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
    title: 'Ажлын хуудас (гүйцэтгэл бөглөх)',
    url: TASK_SHEET.url,
    oid: TASK_SHEET.oid,
    view: 'sheet',
    zoneField: TASK_SHEET.fields.bagts,
    synonyms: ['ажлын хуудас', 'гүйцэтгэл бөглөх', 'багцын ажил', 'шатлал'],
    fields: {
      [TASK_SHEET.fields.bagts]: 'Багц («Багц 4-1» хэлбэрээр)',
      [TASK_SHEET.fields.no]: '№ — «А.», «Б.», «Б1», «1.2»',
      [TASK_SHEET.fields.level]: 'Шатлал 1–5 (5 = навч ажил)',
      [TASK_SHEET.fields.work]: 'Ажлын нэр',
      [TASK_SHEET.fields.date]: 'Огноо (YYYY-MM-DD)',
      [TASK_SHEET.fields.version]: 'Хувилбар (upload багц)',
      [TASK_SHEET.fields.weight]: 'Хувийн жин',
      [TASK_SHEET.fields.section]: 'Давхрын хэсэг',
      [TASK_SHEET.fields.block]: 'Барилга/блок («5/1 барилга»)',
      [TASK_SHEET.fields.progress]: 'Гүйцэтгэл 0–1 (хувь БИШ)',
    },
    warn:
      `Гүйцэтгэл (\`${TASK_SHEET.fields.progress}\`) нь 0–1 хооронд — хувь болгож харуулахдаа 100-аар үржүүлнэ. ` +
      `Мөн зөвхөн ${TASK_SHEET.fields.level}=5 (навч) мөрүүд бодит ажил; дээд шатлалын мөрүүд нь нэгтгэл тул ДАВХАР тоологдоно.`,
  },

  {
    id: 'ds:habea',
    title: 'ХАБЭА — хөдөлмөр, техникийн тайлан',
    url: HABEA.labor.url,
    // ⚠️ Survey123-аас гаралтай давхаргууд OID-гоо ЖИЖИГ үсгээр нэрлэдэг
    //    (`OBJECTID` БИШ). Буруу нэрээр `COUNT()` асуувал хүсэлт бүхэлдээ унана.
    oid: 'objectid',
    view: 'habea',
    // ⚠️ ӨРГӨН схем — багц нь гүйцэтгэгч тус бүрийн `Bagts_<SFX>` баганад байна.
    //    Дээд түвшний ГАНЦ «багц» талбар БАЙХГҮЙ тул `zoneField` тавьж болохгүй
    //    (тавибал `queryGroup` нь «Invalid field» гэж унана).
    synonyms: ['хабэа', 'ажилтан', 'ажиллах хүч', 'техник', 'кран', 'экскаватор'],
    fields: {
      [HABEA.labor.fields.ognoo]: 'Тайлангийн огноо',
      [HABEA.labor.fields.niitAjiltan]: 'Нийт ажилтны тоо (бүх гүйцэтгэгч)',
      [HABEA.labor.fields.hunTsag]: 'Хүн-цаг',
      [HABEA.labor.fields.niitTehnik]: 'Нийт техник (бүх гүйцэтгэгч)',
    },
    warn:
      'Энэ бол ӨДӨР ТУТМЫН НЭГДСЭН тайлан — мөр бүр НЭГ өдрийн бүх гүйцэтгэгчийн мэдээ. ' +
      'Ажилтны тоог бүх мөрөөр НИЙЛҮҮЛЭХ нь БУРУУ (нэг ажилтан олон өдөр давтагдана). ' +
      'Тухайн өдрийн байдлыг асуувал СҮҮЛИЙН огноогоор шүүнэ; хандлага асуувал огноогоор эрэмбэлнэ. ' +
      'Гүйцэтгэгч тус бүрийн задаргаа нь дагаварласан талбаруудаар байна: ' +
      '`Bagts_<SFX>` (багц), `MNG_ajiltani_too_<SFX>` (монгол), `G_ajiltanii_too_<SFX>` (гадаад), ' +
      '`Niit_ajiltan_<SFX>` (нийт ажилтан), `Tehnik_<SFX>` (техник) — ' +
      'SFX ∈ HHDMGK, HBZIT, HBTIT, MSK, NBG, MK, P, MMSE, SC, OSNAAG, GUBB, CHHO. ' +
      'Техникийн ТӨРЛИЙН (цамхагт кран, экскаватор г.м.) задаргаа энэ маягтад БАЙХГҮЙ — ' +
      'краны талаар асуувал `Цамхагт_кран` давхаргаас уншина.',
  },

  {
    id: 'ds:usan_san',
    title: 'Усан сан',
    url: USAN_SAN.url,
    view: 'plan',
    synonyms: ['усан сан', 'ус хуримтлуулах'],
  },

  {
    id: 'ds:boundary',
    title: 'Төлөвлөлтийн талбайн хил',
    url: BOUNDARY.plan.url,
    view: 'plan',
    synonyms: ['хил', 'төлөвлөлтийн талбай', 'хүрээ'],
    note: 'Төслийн нийт талбай = энэ давхаргын Hec_area талбар (га) — геометрээс дахин тооцохгүй.',
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
    title: 'Санхүүжилт — захирамж, гэрээ, сарын урсгал (дашбоардын эх)',
    url: CASHFLOW2.url,
    oid: CASHFLOW2.oid,
    view: 'tsogts',
    sensitive: true,
    zoneField: CASHFLOW2.fields.pkg2,
    synonyms: ['санхүүжилт', 'захирамж', 'гэрээ', 'төсөвт өртөг', 'олгосон', 'сарын урсгал'],
    fields: {
      [CASHFLOW2.fields.type]: 'Төрөл (ТЭЗҮ, инженер…)',
      [CASHFLOW2.fields.pkg]: 'Багц (бүдүүвч — дэд багц ялгадаггүй)',
      [CASHFLOW2.fields.pkg2]: 'Багц дэд багцтайгаа («БАГЦ-3.1») — ЭНИЙГ ашигла',
      [CASHFLOW2.fields.name]: 'Ажлын дэлгэрэнгүй нэр',
      [CASHFLOW2.fields.budget]: 'Урьдчилсан төсөвт өртөг, ₮',
      [CASHFLOW2.fields.orderNo]: 'Захирамжийн дугаар',
      [CASHFLOW2.fields.orderTotal]: 'Захирамжийн нийт дүн, ₮',
      [CASHFLOW2.fields.client]: 'Захиалагчийн хяналт',
      [CASHFLOW2.fields.contractor]: 'Гүйцэтгэгч байгууллага',
      [CASHFLOW2.fields.contractDate]: 'Гэрээ байгуулсан огноо',
      [CASHFLOW2.fields.contractNo]: 'Гэрээний дугаар',
      [CASHFLOW2.fields.contractAmount]: 'Гэрээ байгуулах эрх олгосон дүн, ₮',
      [CASHFLOW2.fields.prevPct]: 'Өмнө шилжүүлсэн хувь (БУТАРХАЙ 0–1)',
      [CASHFLOW2.fields.prevAmount]: 'Өмнө шилжүүлсэн мөнгөн дүн, ₮',
      ...Object.fromEntries(CASHFLOW2.sources.map((s) => [s.field, `Санхүүжилтийн эх — ${s.label}, ₮`])),
      ...Object.fromEntries(
        CASHFLOW2.months.flatMap((m) => [
          [m.amount, `${m.label} сарын дүн, ₮`],
          [m.amountCum, `${m.label} — өссөн дүн, ₮`],
        ]),
      ),
    },
    warn:
      'Багцаар шүүхдээ ЗААВАЛ `' + CASHFLOW2.fields.pkg2 + '` (дэд багцтай) ашигла — `' +
      CASHFLOW2.fields.pkg + '` нь дэд багц ялгадаггүй, зарим мөрөнд «0». ' +
      'Хувийн талбарууд (`' + CASHFLOW2.fields.prevPct + '`, сарын `pct`) нь БУТАРХАЙ 0–1 — харуулахдаа ×100. ' +
      'Мөнгөн дүн ТӨГРӨГӨӨР; хариултад сая/тэрбум/их наяд гэж хөрвүүлж бич.',
  },


  {
    id: 'ds:progress',
    title: 'Төслийн гүйцэтгэл — үе шатаар',
    url: PROJECT_PROGRESS.url,
    oid: PROJECT_PROGRESS.oid,
    view: 'dashboard',
    sensitive: true,
    zoneField: PROJECT_PROGRESS.fields.bagts,
    synonyms: ['төслийн явц', 'гүйцэтгэл', 'үе шат', 'биелэлт'],
    fields: {
      [PROJECT_PROGRESS.fields.no]: 'Д/д («6.2.1.1» — эхний тоо нь үе шат)',
      [PROJECT_PROGRESS.fields.stage]: 'Үе шатны нэр',
      [PROJECT_PROGRESS.fields.work]: 'Ажлын нэр',
      [PROJECT_PROGRESS.fields.bagts]: 'Багцын код',
      [PROJECT_PROGRESS.fields.sectionWeight]: 'Үе шат доторх жин (%)',
      [PROJECT_PROGRESS.fields.weight]: 'Төслийн нийт дүнд эзлэх жин (%)',
      [PROJECT_PROGRESS.fields.planned]: 'Төлөвлөгөөт гүйцэтгэл (%)',
      [PROJECT_PROGRESS.fields.actual]: 'Бодит гүйцэтгэл (%)',
      [PROJECT_PROGRESS.fields.fulfilment]: 'Төлөвлөгөөний биелэлт (%)',
    },
    warn:
      `Нийт гүйцэтгэлийг гаргахдаа энгийн ДУНДАЖ авч БОЛОХГҮЙ — ажил бүр өөр жинтэй. ` +
      `\`${PROJECT_PROGRESS.fields.actual}\`-ыг \`${PROJECT_PROGRESS.fields.weight}\`-ээр жинлэж нэгтгэнэ.`,
  },
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
