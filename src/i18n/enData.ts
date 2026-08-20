/**
 * ӨГӨГДЛИЙН УТГЫН ОРЧУУЛГА — ArcGIS-ээс АЖИЛЛАХ ҮЕД ирдэг утгууд
 * (нэгж талбарын төлөв, ослын төрөл, материал, гүйцэтгэгчийн нэр…).
 *
 * ⚠️ Яагаад `en.ts`-ээс ТУСДАА вэ: эдгээр түлхүүр кодод `tr('…')` гэж
 * БИЧИГДЭЭГҮЙ — тэдгээр нь өгөгдлийн үйлчилгээнээс ирж, харагдах цэгтээ
 * `tr(утга)` гэж ДИНАМИКААР дамждаг. Иймд `npm run i18n:check` тэднийг
 * «хэрэглэгдээгүй» гэж үзэж, `npm run i18n:prune` УСТГАХ байсан. Тусдаа
 * файл нь тэр аюулаас хамгаална.
 *
 * ⚠️ Эх өгөгдөл дэх утга ӨӨРЧЛӨГДВӨЛ (жиш. ArcGIS дээр бичиглэл засвал) энд
 * байгаа түлхүүр таарахаа болино — тэр мөр зүгээр л монголоороо харагдана.
 * Унахгүй, зөвхөн орчуулагдахгүй.
 */
const enData: Record<string, string> = {
  "АТД": "ATD",
  "Амины орон сууц": "Detached house",
  "Амь нас эрсдэж болзошгүй байсан": "Potentially life-threatening",
  "Анхны тусламж авсан осол зөрчил": "Incident requiring first aid",
  "Аюулгүй ажиллагааны дүрэм зөрчс": "Safety rule breach",
  "БУСАД": "OTHER",
  "Багц-1": "Package-1",
  "Багц-2": "Package-2",
  "Багц-3.1": "Package-3.1",
  "Багц-3.2": "Package-3.2",
  "Багц-3.3": "Package-3.3",
  "Багц-4.1": "Package-4.1",
  "Багц-4.2": "Package-4.2",
  "Бетон": "Concrete",
  "ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ": "EXTERNAL LANDSCAPING AND GRADING",
  "Гэр бүлийн хэрэгцээний зуслангийн газар": "Family summer-house plot",
  "Гэр, орон сууцны хашааны газар": "Ger and housing yard plot",
  "Жижиг бизнес": "Small business",
  "Зөвшилцөх": "Under negotiation",
  "ИНЖЕНЕРИЙН ДЭД БҮТЭЦ": "UTILITY INFRASTRUCTURE",
  "Маргаантай": "Disputed",
  "Морин сувд констракшн ХХК": "Morin Suvd Construction LLC",
  "Моторт тээврийн хэрэгсэлийн осо": "Motor vehicle accident",
  "Мэргэжил, туршлага дутуу": "Lack of skill or experience",
  "НИЙГМИЙН ДЭД БҮТЭЦ": "SOCIAL INFRASTRUCTURE",
  "Ноцтой байдалд хүргэж болзошгүй": "Potentially serious",
  "Нутгын буян групп": "Nutgiin Buyan Group",
  "ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ": "RESIDENTIAL NEIGHBOURHOOD DEVELOPMENT",
  "Осол дөхсөн тохиолдол": "Near miss",
  "Професионалстрой ХХК": "Professionalstroy LLC",
  "ТЭЗҮ ЗУРАГ ТӨСӨЛ": "FEASIBILITY STUDY AND DESIGN",
  "Татгалзсан": "Refused",
  "Тоосго": "Brick",
  "Төрийн захиргааны байгууллага": "Government administration body",
  "Хашилт, тэмдэглэгээ дутуу": "Inadequate barriers or signage",
  "Хоосон блок": "Hollow block",
  "Худалдаа": "Retail",
  "Худалдаа, нийтийн үйлчилгээний газар, төв, цогцолбор": "Retail, public service premises, centres and complexes",
  "Хяналт, мэргэжлийн дутагдал": "Supervision or competence shortfall",
  "Хятадын барилгын 6-р инженерийн товчоо": "China Construction Sixth Engineering Bureau",
  "Хятадын барилгын зургаа дугаар": "China Construction No. Six",
  "Хятадын хоёр дахь металлурги г": "China Second Metallurgical G",
  "Цахилгаанаас үүдэлтэй": "Electrical in origin",
  "Цутгамал бетон": "Cast concrete",
  "Эд хөрөнгийн хохирол": "Property damage",
  "Эмнэлгийн тусламж авсан гэмтэл": "Injury requiring medical treatment",
  "ашиглах": "use",
  "эзэмших": "possession",
  "өмчлөх": "ownership",
  "Үйлдвэр": "Industry",
  "Үлдэх саналтай": "Requests to remain",
  "Үнийн дүн зөвшөөрөөгүй": "Price not agreed"
};

export default enData;
