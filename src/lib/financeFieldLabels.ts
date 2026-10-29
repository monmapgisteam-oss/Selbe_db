/**
 * Санхүүгийн хоёр үйлчилгээний КОДЛОГДСОН талбаруудын монгол нэр.
 */
import { t as tr } from '@/lib/i18nCore';
import { LINK_FIELDS } from '@/lib/ipcLink';

export const FIN_FIELD_LABELS: Record<string, string> = {
  /*
   * ── Cashflow_0904 · гэрээний бүртгэл (2026.09.04) ──────────────────────
   */
  get ajil_tuvshin2() { return tr('Төрөл'); },
  get bagts_74() { return tr('Багц 74'); },
  get ajil_tuvshin1() { return tr('Төсөл'); },
  get bagts() { return tr('Багц'); },
  get ajil_uilchilgee() { return tr('Нарийвчилсан төрөл'); },
  get ho_dun_geree() { return tr('Урьдчилсан төсөвт өртөг /гэрээлээгүй ажлыг магадласан дүнгээр, м'); },
  get ho_dungiin_tailbar() { return tr('Хөрөнгө оруулалтын дүнгийн тайлбар'); },
  get ehleh_ognoo() { return tr('Төлөвлөгөөт хугацаа эхлэх'); },
  get duusah_ognoo() { return tr('Төлөвлөгөөт хугацаа дуусах'); },
  get zahiramj_ognoo() { return tr('Захирамжийн огноо'); },
  get zahiramj_dugaar() { return tr('Захирамжийн дүн дугаар'); },
  get zahiramj_niit_dun() { return tr('Захирамжийн дүн нийт дүн'); },
  get zahiramj_unet_tsaas() { return tr('Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр үнэт цаасны хөрөнгө'); },
  get zahiramj_unet_tsaas_huvi() { return tr('Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр нийт хөрөнгөд эзлэх'); },
  get zahiramj_borluulalt_dun() { return tr('Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр төслийн орлого'); },
  get zahiramj_niislel_tusuv() { return tr('Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр нийслэлийн төсөвийн'); },
  get zahiramj_nzd_nuuts() { return tr('Захирамжийн дүн хөрөнгө оруулалтын эх үүсвэр НЗД нөөц хөрөнгө'); },
  get zahialagch_hynalt_baig() { return tr('Захиалагчийн хяналт хийх байгууллага'); },
  get guitsetgegch() { return tr('Гүйцэтгэгч байгууллага'); },
  get geree_ognoo() { return tr('Гэрээ байгуулсан огноо'); },
  get geree_dugaar() { return tr('Гэрээний дугаар'); },
  get geree_dun() { return tr('Гэрээ байгуулах эрх олгосон дүн'); },
  get urdchilgaa_batalgaa_dun() { return tr('Урьдчилгаа төлбөрийн баталгааны дүн'); },
  get urdchilgaa_huvi() { return tr('Урьдчилгаа төлбөрийн хувь'); },
  get urdchilgaa_zh_zardal() { return tr('Урьдчилгаа төлбөрөөс суутгасан захиалагчийн хяналтын зардал'); },
  get guitsetgel_huvi() { return tr('Санхүүжсэн гүйцэтгэлийн хувь'); },
  get geree_ehleh() { return tr('Гэрээ/хавсралт 5 — эхлэх'); },
  get geree_duusah() { return tr('Гэрээ/хавсралт 5 — дуусах'); },
  get guits_ehleh() { return tr('Гүйцэтгэгч — эхлэх'); },
  get guits_duusah() { return tr('Гүйцэтгэгч — дуусах'); },
  get gazar_ehleh() { return tr('Газар чөлөөлөлт — эхлэх'); },
  get gazar_duusah() { return tr('Газар чөлөөлөлт — дуусах'); },
  get songon_ognoo() { return tr('Сонгон шалгаруулалтын огноо'); },
  get ashiglalt_ognoo() { return tr('Ашиглалтад оруулах огноо'); },
  get sar_mongo_eh() { return tr('Сарын мөнгөний эх сурвалж'); },



  /*
   * ── HO_guitsetgel_arcgis_csv /196 · ХӨРӨНГӨ ОРУУЛАЛТЫН ТӨЛБӨР ──────────
   */
  get murun_id() { return tr('Мөрийн ID'); },
  get geree_kod() { return tr('Гэрээний код'); },
  get dugaar() { return tr('№'); },
  /* `bagts` — Cashflow_0909-тэй НЭГ ижил нэр, ижил шошго (дээр). Нэг толь тул давтахгүй. */
  get tosol_ner() { return tr('Төсөл арга хэмжээний нэр'); },
  /* `guitsetgegch` — Cashflow_0909-тэй НЭГ ижил нэр, ижил шошго (дээр). Нэг толь тул давтахгүй. */
  get ajliin_turul() { return tr('Ажлын төрөл'); },
  get geree_helber() { return tr('Гэрээний хэлбэр'); },
  get huuliin_undeslel() { return tr('Шийдвэр гаргасан хуулийн үндэслэл'); },
  get zahiramj1_ognoo() { return tr('Захирамж 1 · огноо'); },
  get zahiramj1_dugaar() { return tr('Захирамж 1 · дугаар'); },
  get zahiramj2_ognoo() { return tr('Захирамж 2 · огноо'); },
  get zahiramj2_dugaar() { return tr('Захирамж 2 · дугаар'); },
  get zahiramj3_ognoo() { return tr('Захирамж 3 · огноо'); },
  get zahiramj3_dugaar() { return tr('Захирамж 3 · дугаар'); },
  /* `geree_dugaar` — Cashflow_0909-тэй НЭГ ижил нэр, ижил шошго (дээр). Нэг толь тул давтахгүй. */
  get geree_nemelt() { return tr('Гэрээнд нэмэлт өөрчлөлт орсон эсэх'); },
  /* Нийт төсөвт өртөг /Захирамж/ — дөрвөн эх үүсвэр */
  get tosov_niit() { return tr('Төсөвт өртөг · нийт'); },
  get tosov_unet_tsaas() { return tr('Төсөвт өртөг · үнэт цаас'); },
  get tosov_niislel_tosov() { return tr('Төсөвт өртөг · нийслэлийн төсөв'); },
  get tosov_borluulalt() { return tr('Төсөвт өртөг · борлуулалтын орлого'); },
  /* Гэрээ байгуулагдсан төсөв — ижил дөрвөн эх үүсвэр */
  get gereet_tosov_niit() { return tr('Гэрээт төсөв · нийт'); },
  get gereet_unet_tsaas() { return tr('Гэрээт төсөв · үнэт цаас'); },
  get gereet_niislel_tosov() { return tr('Гэрээт төсөв · нийслэлийн төсөв'); },
  get gereet_borluulalt() { return tr('Гэрээт төсөв · борлуулалтын орлого'); },
  get hemnelt_hetrelt() { return tr('Хэмнэлт / хэтрэлт'); },
  /* Санхүүжилт ба гүйцэтгэлийн төсвийн зарцуулалт */
  get on_() { return tr('Он'); },
  get tulult_turul() { return tr('Төлбөрийн төрөл'); },
  get ipc_dugaar() { return tr('IPC дугаар'); },
  get dun() { return tr('Дүн (₮)'); },
  get guilgee_ognoo() { return tr('Гүйлгээ хийсэн огноо'); },
  get hul_turiin_san() { return tr('Төрийн сан дээр хүлээгдэж буй'); },
  get hul_ho_helts() { return tr('ХО хэлтэст хүргүүлсэн хүлээгдэж буй'); },
  get hul_zahialagch() { return tr('Захиалагчийн хяналтад хүлээгдэж буй'); },

  /*
   * ── ГҮЙЦЭТГЭЛИЙН ХОЛБООС (2026-09-09-нд ArcGIS-д нэмэгдсэн 3 талбар) ──
   */
  get [LINK_FIELDS.obyem]() { return tr('Бодит гүйцэтгэлийн обьём'); },
  get [LINK_FIELDS.une]() { return tr('Гүйцэтгэлийн үнэ'); },
  get [LINK_FIELDS.zoruu]() { return tr('Зөрүү'); },
};

/** Код → монгол нэр; толинд байхгүй бол кодоо буцаана. */
export const finFieldLabel = (code: string): string => FIN_FIELD_LABELS[code] ?? code;
