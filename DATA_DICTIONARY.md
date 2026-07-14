# Сэлбэ — Дата үйлчилгээний толь бичиг (ArcGIS FeatureServer)

Бодит талбарууд дээр суурилсан. Зөвхөн ашигтай талбаруудыг жагсаав (CAD/meta талбар орхив).

**Орг үндэс**
- `O1 = https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services`
- `O2 = https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services`

---

## 1. Кадастр ба үнэлгээ (том датасет)

### Selbe_parcel/0 — Нэгж талбар (кадастр) · **43,041** · polygon · O1
`rigth_type` (өмчлөх/эзэмших…), `area_m2`, `landuse` + `landuse_de` (Гэр орон сууц…), `address_ne/st/kh`, `person_typ`, `decision_d` (огноо), `descriptio` (Хүчинтэй), `soum` (Баянзүрх), `parcel_id`.

### selbe_B/0 — Барилга + үнэлгээ · **36,586** · polygon · O1
`NIIT_UNE` (нийт үнэлгээ ₮), `MKV_UNE` (1м² үнэ), `SARUUN_TUR` (сарын түрээс), `OROO_TOO` (өрөө), `DAVHAR_TOO` (давхар), `TOROL` (Орон сууц…), `MATERIAL` (Блок), `AJLIIN_BAI` (ажлын байр), `BAGTSAAMAI` (багтаамж), `area_m2`.

---

## 2. Байгаль орчин / IoT

### air_quality_IoT/0 — Агаарын чанарын станц · **18** · point · O1
Хос талбар (утга + босго `_lim`): `PM2_5`/`PM2_5_lim`, `PM10`/`PM10_lim`, `NO2`, `SO2`, `CO`, `O3`, `BlackC`, `CO2`, `VOC`, `Temp`, `Humid`, `Press`. `Device`, `Purpose`, `CID`. → **босготой харьцуулсан амьд AQI дашбоард**.

### selbe_iot/0 — IoT мэдрэгч · **64** · point · O2
`Type_1` (coded төрөл), `description` (Waterway level sensor…), `CreationDate`.

---

## 3. Инженерийн сүлжээ (актив менежмент)

### Selbe_utility_network/0 — Шугам сүлжээ · **1,866** · line · O2
`Type` (0–5), `Шугам_сүлжээний_төрөл`, `Материал`, `Голч__мм_` (голч мм), `Техникийн_төлөв_байдал` (Сайн…), `Эрсдэлийн_зэрэг` (Дунд…), `Тулгарсан_асуудал` (Гэмтэлгүй…), `Засвар_үйлчилгээний_төрөл`, `Статус` (Ашиглалтад), `Сүүлд_засвар_хийсэн_огноо`, `Сүүлд_үзлэг_хийсэн_огноо`, `Төлөвлөсөн_гүйцэтгэл____` (%), `Бодит_гүйцэтгэл____` (%), `Length_km`.

### Road_shugam_suljee — инженерийн шугам · O2
`/0` Ариутгах татуурга (line), `/1` Гадна дулаан хангамж (line), `/2` Борооны ус зайлуулах (line), `/3` Замын план (polygon). Талбар: `Shape__Length`, `Shape__Area`.

---

## 4. Барилгын явц (гүйцэтгэл)

### building_GOL_barigdaj_ehelsen/2 — Барилгын явц · **112 блок** · polygon · O2
`BAGTS` (Багц), `BLOK` (5/9), `BAR_COMP` (гүйцэтгэгч — Морин сувд ХХК…), `DAVHAR`, `AIL_TOO`, `TOROL` (71 айл 9 давхар), `GUITS_HV` (нийт гүйцэтгэл %), `GUITS_OGN` (зорилтот огноо), **16 үе шат** (%): `A_BELTGEL, B_BARILGA, GAZAR, SUURI, KARKAS, HANA, HAALGA, DEEVER, SHAL, DOTOR, GADNA, BUSAD, LIFT, HALAALT, US, TSAHILGAAN, HOLBOO`. (-1 = тухайн ажил байхгүй/N/A).

### New_building/3 — Шинэ барилга нэмэх (editable) · **0** · polygon · O2
`torol`, `ail_too`, `davhar`, `guits_on`.

---

## 5. Газар чөлөөлөлт (үлдсэн нэгж талбар)

### 20260226_uldsen_negj_talbar/1 (map1) · **216** · O2
### 20260226_uldsen_negj_talbar_selbe/35 (infra) · **217** · O2
`rigth_type`/`right_type` (өмчлөх/эзэмших…), `area_m2`, `landuse_de`, `Zoriulalt`, `Turul`, `Ner`/`Овог__нэр` (эзэмшигч), `Хаяг`/`address_ne`, `Талбай`, `явцын_мэдээ` (явцын тайлбар), `shaltgaan` (шалтгаан), `Unelgee`, `person_typ`, `Нэгж_талбарын_дугаар`.

---

## 6. Хил / багц / төлөвлөлт

- **bagts_hil/34** — Багцын хил · **10** · polygon · O2 — `BAGTS` (Багц 1, 2, 3.1…), `Shape__Area`.
- **barilga_20260709/0** — Барилгын хээ (CAD) · **167** · polygon · O2 — `Layer`, `RefName` (70 ail…), `Shape__Area` (`Layer NOT LIKE '%TEXT%'`).
- **Tuluvlult_talbai/2** — Төлөвлөлтийн талбай · **1** · O2 — `Hec_area` = **159.57 га** (нийт талбай).
- **Сэлбэ_2_khil/0** — Сэлбэ-2 бүс · **2** · O1 — `area_ha` (13.32), `far`, `bcr`, `landuse`.
- **selbe_road_20260707** · O2 — `/16` хил (line), `/17` гүүр, `/18` замын тэмдэглэгээ, `/19` зам (polygon).

---

## 7. 20 минутын хотын дизайн (план давхаргууд)

### Selbe_talbain_hynalt — O2 (Bod_guits = бодит гүйцэтгэл % талбартай)
`/0` Явган хүний зам · `/1` Ногоон байгууламж · `/2` Зам · `/3` Дугуйн зам · `/4` Гэр · `/5` Гол · `/6` Барилга (бүгд polygon).

---

## 8. Хүн хүч (патрол)

### workforce…/1 — Ажилчид · **7** · point · O2
`name`, `status` (coded), `title`, `contactnumber`, `userid`. + Track_View (Last Known Locations, OAuth).

---

## 3D
- IntegratedMesh (slpk): `Selbewebapp_P_slpk`, `Selbewebapp2_slpk` (O1, tiles-ap1).
- Basemap: Nova VectorTile `75f4dfdff19e445395653121a95a85db`.

---

## Гол дүгнэлт (rebuild-д чухал)
1. **air_quality_IoT** нь босго (`_lim`) талбартай 13 параметртэй — жинхэнэ орчны мониторинг хийх боломжтой (одоо зөвхөн PM2.5 хэрэглэж байгаа).
2. **Selbe_utility_network** (1,866) — төлөв/эрсдэл/материал/огноо бүрэн актив менежмент.
3. **building_GOL** (112) — 16 үе шаттай нарийн гүйцэтгэл.
4. **selbe_B** (36,586) — үнэлгээ/түрээс/ажлын байр — эдийн засгийн шинжилгээ.
5. **uldsen_negj_talbar** — `явцын_мэдээ`, `shaltgaan`, эзэмшигчтэй газар чөлөөлөлтийн бодит хяналт.
6. Одоогийн апп-ын олон тоо **hardcode/demo** (жишээ: AQI 42, uptime 99.2%, төлөвлөсөн = бодит+18%) — бодит агрегациар солино.
