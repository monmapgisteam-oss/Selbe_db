# -*- coding: utf-8 -*-
"""
ҮЕРИЙН ЗАГВАРЧЛАЛ: ArcGIS Flood Simulation CRF -> аппын bin + meta

  "C:/Program Files/ArcGIS/Pro/bin/Python/envs/arcgispro-py3/python.exe" tools/uyr-crf.py

WARNING: BUILD-Д ОРОХГҮЙ. Гараар, ArcGIS Pro-ийн Python дээр л ажиллана
(arcpy + Spatial Analyst). Гаралт нь репод орох public/uyr/selbe-flood.bin ба
public/uyr/selbe-flood.json — тэдгээрийг аппын src/lib/uyr.ts уншина.

ЗАРЧИМ (NEMA ANALYSIS WEB / nextjs_last-ийн FloodScene-тэй ИЖИЛ):
  ArcGIS Flood Simulation нь ЦАГ ХУГАЦААНЫ цуваа гаргадаг — ус тархах явцыг
  зүсмэл тус бүрээр нь харуулах ёстой. Тиймээс НЭГ агшин эсвэл «хамгийн их
  гүн» рүү хураангуйлж БОЛОХГҮЙ: зүсмэл бүрийн гүн, урсгалын хурдны вектор
  хоёуланг нь хадгална.

  Файлын байрлал (reference-тэй ижил дараалал):
      [зүсмэл][хувьсагч][пиксел]   order = depth, u, v

ЭХ ӨГӨГДӨЛ (Selbe_crf, 4 растер, нийт 2.3 ГБ):
  Selbe_FS_WaterDepth.crf          гүн, м            0 .. 2.274
  Selbe_FS_WaterVelocityVector.crf Vector_U/Vector_V, м/с
  Selbe_FS_WaterSpeed.crf          хурдны хэмжээ     (u,v-ээс гарах тул АВАХГҮЙ)
  Selbe_FS_WaterAbsoluteHeight.crf усны үнэмлэхүй өндөр, м (1311..1718)
  Бүгд 4096x4096 нүд, 12 хугацааны алхам, Web Mercator (3857).

WARNING: НЭГЖ нь МЕТР (reference төслийнх фут байсан — андуурч болохгүй).
  Үүнийг WaterAbsoluteHeight-аар баталгаажуулав: 1311..1718 = УБ-ын далайн
  түвшнээс дээших өндөр метрээр.

WARNING: ГАЗРЫН нүдний хэмжээ. Web Mercator-ын нэгж нь өргөрөгт татагддаг тул
  2.0994 WM нэгж = 2.0994 * cos(47.97) = 1.406 м. Талбайг WM нэгжээр шууд
  бодвол 2.23 дахин хэтэрнэ.

ХЭМЖЭЭ БАГАСГАХ (git):
  4096^2 x 12 x 3 хувьсагч x float32 = 2.4 ГБ -> репод орохгүй.
    · 8 дахин сийрэгжүүлж 512x512 (11.25 м/нүд) — reference-ийн 512-тай ижил
      тор, түүнээс НАРИЙН (тэдний домэйн 15.5 км, манайх 5.8 км).
    · гүн -> uint16, миллиметр (0..65.5 м);  u,v -> int16, см/с (+-327 м/с).
  Гүнийг сийрэгжүүлэхэд MAX авна (дундаж бол нойтон талбай хиймлээр хумигдана),
  u,v-д гүнээр ЖИНЛЭСЭН дундаж (хуурай нүд чиглэлийг гажуудуулахгүй).
"""
import arcpy, numpy as np, json, math, os, gzip

SRC = "E:/Saruul/NEMA ANALYSIS WEB/uyr/Selbe_crf"
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, "..", "public", "uyr")
BIN = os.path.join(OUTDIR, "selbe-flood.bin")
META = os.path.join(OUTDIR, "selbe-flood.json")

FACTOR = 8                 # 4096 -> 512
WET_M = 0.05               # үүнээс доош = нойтон биш (тоон шуугиан)
LAT = 47.9674

arcpy.env.overwriteOutput = True
os.makedirs(OUTDIR, exist_ok=True)

dep = arcpy.Raster(SRC + "/Selbe_FS_WaterDepth.crf", is_multidimensional=True)
md = json.loads(dep.mdinfo) if isinstance(dep.mdinfo, str) else dep.mdinfo
times = [str(v) for v in md["variables"][0]["dimensions"][0]["values"]]
SL = len(times)
W0, H0 = dep.width, dep.height
W, H = W0 // FACTOR, H0 // FACTOR
cellWM = dep.meanCellWidth
k = math.cos(math.radians(LAT))
cellM = cellWM * FACTOR * k
e = dep.extent
print("тор {}x{} x {} зүсмэл | нүд {:.2f} м".format(W, H, SL, cellM))


def block(a, how):
    """4096 -> 512 сийрэгжүүлэлт (8x8 блок)."""
    b = a.reshape(H, FACTOR, W, FACTOR)
    return b.max(axis=(1, 3)) if how == "max" else b.mean(axis=(1, 3))


def slice_arr(path, var, t, bands=1):
    arcpy.md.MakeMultidimensionalRasterLayer(
        path, "lyr", variables=var, dimension_def="BY_VALUE",
        dimension_values=[["StdTime", t]])
    a = arcpy.RasterToNumPyArray(arcpy.Raster("lyr"), nodata_to_value=0.0).astype("float32")
    arcpy.management.Delete("lyr")
    return a


cell0M = cellWM * k                     # эх торын газрын нүд (1.406 м)
ever_full = np.zeros((H0, W0), dtype=bool)

depth_q = np.zeros((SL, H, W), dtype="uint16")
u_q = np.zeros((SL, H, W), dtype="int16")
v_q = np.zeros((SL, H, W), dtype="int16")
stats = []

for s, t in enumerate(times):
    d = slice_arr(SRC + "/Selbe_FS_WaterDepth.crf", "WaterDepth", t)
    d[~np.isfinite(d)] = 0.0
    d[d < 0] = 0.0
    uv = slice_arr(SRC + "/Selbe_FS_WaterVelocityVector.crf", "WaterVelocityVector", t)
    # 2 сувагтай -> (2, H, W)
    if uv.ndim == 2:
        uv = np.stack([uv, np.zeros_like(uv)])
    uv[~np.isfinite(uv)] = 0.0

    ds = block(d, "max")
    # Гүнээр жинлэсэн дундаж — хуурай нүд векторыг тэглэхгүй
    wgt = d.reshape(H, FACTOR, W, FACTOR)
    wsum = wgt.sum(axis=(1, 3))
    safe = np.where(wsum > 0, wsum, 1.0)
    us = (uv[0].reshape(H, FACTOR, W, FACTOR) * wgt).sum(axis=(1, 3)) / safe
    vs = (uv[1].reshape(H, FACTOR, W, FACTOR) * wgt).sum(axis=(1, 3)) / safe
    us[wsum <= 0] = 0.0
    vs[wsum <= 0] = 0.0

    depth_q[s] = np.clip(ds * 1000, 0, 65535).astype("uint16")
    u_q[s] = np.clip(us * 100, -32767, 32767).astype("int16")
    v_q[s] = np.clip(vs * 100, -32767, 32767).astype("int16")

    # WARNING: ТАЛБАЙГ 512-ийн тороос бодож БОЛОХГҮЙ. Сийрэгжүүлэхэд MAX авдаг
    #   тул 8x8 блокийн НЭГ Л нойтон нүд бүтэн блокийг нойтон болгож, талбай
    #   1.6 дахин хэтэрдэг (хэмжив: 144 га vs бодит 91 га). Тиймээс тоон
    #   үзүүлэлтийг ЭХ 4096 тороос, зурагдах торыг 512-оос авна.
    stats.append({
        "wetHa": round(float((d >= WET_M).sum()) * cell0M * cell0M / 10000, 2),
        "peakM": round(float(d.max()), 3),
        "maxSpeed": round(float(np.hypot(uv[0], uv[1])[d >= WET_M].max()) if (d >= WET_M).any() else 0.0, 2),
    })
    ever_full |= (d >= WET_M)
    print("  {:>2}/{} {}  нойтон {:>7.2f} га  дээд гүн {:.2f} м".format(
        s + 1, SL, t[11:19], stats[-1]["wetHa"], stats[-1]["peakM"]))

# ── Файл: [зүсмэл][хувьсагч][пиксел] ──
with open(BIN, "wb") as f:
    for s in range(SL):
        f.write(depth_q[s].tobytes())
        f.write(u_q[s].tobytes())
        f.write(v_q[s].tobytes())

total_wet_ha = float(ever_full.sum()) * cell0M * cell0M / 10000
meta = {
    "source": "ArcGIS Flood Simulation · Selbe_FS (WaterDepth + WaterVelocityVector)",
    "width": W, "height": H, "slices": SL,
    "order": ["depth", "u", "v"],
    # WARNING: КВАНТЧЛАЛЫН масштаб — уншихдаа ЗААВАЛ хуваана
    "scale": {"depth": 1000, "u": 100, "v": 100},
    "dtype": {"depth": "uint16", "u": "int16", "v": "int16"},
    "units": "meters",
    "wkid": 102100,
    "extent": {"xmin": e.XMin, "ymin": e.YMin, "xmax": e.XMax, "ymax": e.YMax},
    # Газрын бодит нүд (WM нэгж * cos(өргөрөг)) — талбай тооцоход ЭНЭ хэрэгтэй
    "cellM": round(cellM, 4),
    "times": times,
    "wetM": WET_M,
    "stats": stats,
    "totalWetHa": round(total_wet_ha, 2),
    # WARNING: ЭХ торын нүд — тоон үзүүлэлт эндээс, зурагдах нүд нь `cellM`
    "srcCellM": round(cell0M, 4),
    "peakDepthM": round(float(depth_q.max()) / 1000, 3),
}
with open(META, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

raw = os.path.getsize(BIN)
gz = len(gzip.compress(open(BIN, "rb").read(), 6))
print()
print("bin  {:.1f} МБ  (gzip {:.1f} МБ — git ба HTTP хоёулаа шахна)".format(raw / 1e6, gz / 1e6))
print("meta {:.1f} КБ".format(os.path.getsize(META) / 1024))
print("нойтон нийт {} га · дээд гүн {} м".format(meta["totalWetHa"], meta["peakDepthM"]))
