# -*- coding: utf-8 -*-
"""
3D MESH → ӨНДРИЙН ТОР (DSM)   `public/uyr/selbe-mesh.bin` + `.json`

  python tools/dsm-mesh.py

WARNING: BUILD-Д ОРОХГҮЙ. Гараар, нэг удаа ажиллуулна (эсвэл mesh шинэчлэгдэхэд).
Зөвхөн стандарт Python — arcpy, GDAL шаардахгүй.

ЯАГААД ЭНЭ ХЭРЭГТЭЙ ВЭ
  Үерийн шинжилгээг вэб дээр ӨӨРӨӨ тооцохын тулд өндрийн тор хэрэгтэй. Гэтэл:
    · IntegratedMesh (SLPK) нь текстуртай гурвалжны тор — ArcGIS-ийн вэб API-д
      түүнээс `z` асуух арга БАЙХГҮЙ (`elevationSampler` нь зөвхөн `Ground`-оос).
    · ubhub дээр өндрийн ImageServer НИЙТЛЭГДЭЭГҮЙ.
    · Esri-ийн Terrain3D нь дэлхийн ерөнхий DEM — төслийн талбайд хэтэрхий бүдэг.
  Тиймээс mesh-ийн ЁРООЛООС нь өндрийг өөрсдөө гаргаж авна.

ЯАЖ АЖИЛЛАДАГ ВЭ (I3S 1.10, `meshpyramids`)
  1. `nodepages/*` — зангилааны мод (3,900 орчим зангилаа) уншина.
  2. Зорьсон нүдний хэмжээнд тохирох LOD-ийн зангилааг сонгоно.
  3. `nodes/{resource}/geometries/0` — хоёрлосон буфер:
        header: vertexCount UInt32, featureCount UInt32
        дараа нь vertexCount × 3 × Float32 (position), дараа нь uv0
  4. Байрлал нь зангилааны OBB ТӨВӨӨС ХАРЬЦАНГУЙ:
        x, y — Web Mercator НЭГЖ (метр БИШ!)
        z    — МЕТР
     (Амьдаар баталсан: зангилааны байрлалын хүрээ нь `halfSize`×2-той таарна.)
  5. Тор бүрийн нүдэнд ХАМГИЙН БАГА z-г авна.

WARNING: MIN, харин MAX БИШ. Ус нь ГАЗРААР урсдаг. `max` авбал модны титэм,
  дээвэр торны өндөр болж, ус агаарт «урсана». `min` нь мод/сүүдрийн доорх
  газрын түвшинд ойртуулна; барилга нь нүдээ бүрэн эзэлсэн газраа тэгш өндөрлөг
  болж үлдэх ба энэ нь усны хувьд ХАНА болно — хотын үерийн загварт зөв.

WARNING: ӨНДРИЙН СИСТЕМ нь EGM2008 (vcsWkid 3855). Урсгалын чиглэл нь зөвхөн
  ХАРЬЦАНГУЙ өндрөөс хамаардаг тул датумын шилжилт нөлөөлөхгүй.
"""
import json, gzip, math, os, struct, urllib.request, urllib.error

SCENE = "https://arcgis.ubhub.mn/arcgis/rest/services/Hosted"
MESHES = ["Selbewebapp_slpk", "Selbewebapp2_slpk"]
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, "..", "public", "uyr")
BIN = os.path.join(OUTDIR, "selbe-mesh.bin")
META = os.path.join(OUTDIR, "selbe-mesh.json")

LAT = 47.9674
K = math.cos(math.radians(LAT))          # WM нэгж → газрын метр
GRID = 512                                # торны хэмжээ (нэг тал)
# Энэ газрын нүднээс НАРИЙН зангилааг татахгүй — татах хэмжээ дэмий өснө
TARGET_M = 6.0
BASE_Z = 1200.0                           # uint16-д багтаах суурь өндөр (м)


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
            raw = urllib.request.urlopen(req, timeout=180).read()
            return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw
        except Exception as e:
            if i == tries - 1:
                raise
    return b""


def nodepages(base):
    """Бүх зангилааг индексээр нь."""
    out = {}
    p = 0
    while True:
        try:
            d = json.loads(get(f"{base}/nodepages/{p}?f=json").decode("utf-8"))
        except Exception:
            break
        ns = d.get("nodes", [])
        if not ns:
            break
        for n in ns:
            out[n["index"]] = n
        p += 1
        if p > 200:
            break
    return out


def pick(nodes):
    """
    ТАТАХ зангилааг сонгоно.

    WARNING: Зөвхөн навчийг авбал 2,500 хүсэлт болж татах нь удаан; зөвхөн
    дээд LOD-ийг авбал бүдэг. Тиймээс «газрын хэмжээ нь `TARGET_M`-ээс ЖИЖИГ
    болмогц зогсох» дүрмээр модыг таслана — нүд бүрд хангалттай нягт, харин
    илүү нарийныг татахгүй.
    """
    keep, stack = [], [0]
    seen = set()
    while stack:
        i = stack.pop()
        if i in seen or i not in nodes:
            continue
        seen.add(i)
        n = nodes[i]
        hs = n["obb"]["halfSize"]
        size_m = max(hs[0], hs[1]) * 2 * K
        has_geom = n.get("mesh", {}).get("geometry", {}).get("resource") is not None
        kids = [c for c in n.get("children", []) if c in nodes]
        # Хангалттай нарийн БОЛСОН, эсвэл цаашид хүүхэдгүй → энд зогсоно
        if has_geom and (size_m <= TARGET_M or not kids):
            keep.append(n)
            continue
        if kids:
            stack.extend(kids)
        elif has_geom:
            keep.append(n)
    return keep


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    zsum, zcnt = {}, {}
    xmin = ymin = float("inf")
    xmax = ymax = float("-inf")
    # ── 1. Зангилаа цуглуулах ──
    picks = []
    for m in MESHES:
        base = f"{SCENE}/{m}/SceneServer/layers/0"
        try:
            nodes = nodepages(base)
        except Exception as e:
            print(f"  {m}: уншиж чадсангүй — {e}")
            continue
        sel = pick(nodes)
        print(f"  {m}: {len(nodes)} зангилаа → {len(sel)} татна")
        for n in sel:
            picks.append((base, n))
        for n in nodes.values():
            c, hs = n["obb"]["center"], n["obb"]["halfSize"]
            xmin = min(xmin, c[0] - hs[0]); xmax = max(xmax, c[0] + hs[0])
            ymin = min(ymin, c[1] - hs[1]); ymax = max(ymax, c[1] + hs[1])
    if not picks:
        raise SystemExit("зангилаа олдсонгүй")

    # ── 2. Торны хүрээ — квадрат болгоно (нүд тэгш өнцөгт биш байх) ──
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    half = max(xmax - xmin, ymax - ymin) / 2
    xmin, xmax, ymin, ymax = cx - half, cx + half, cy - half, cy + half
    cell_wm = (xmax - xmin) / GRID
    print(f"\nхүрээ {round((xmax-xmin)*K)} × {round((ymax-ymin)*K)} м | "
          f"тор {GRID}² | нүд {cell_wm*K:.2f} м")

    # ── 3. Геометр татаж, нүд бүрд ХАМГИЙН БАГА z ──
    zmin_grid = [None] * (GRID * GRID)
    done = 0
    for base, n in picks:
        rid = n["mesh"]["geometry"]["resource"]
        c = n["obb"]["center"]
        try:
            g = get(f"{base}/nodes/{rid}/geometries/0")
        except Exception:
            continue
        if len(g) < 8:
            continue
        vc, _fc = struct.unpack_from("<II", g, 0)
        need = 8 + vc * 12
        if vc == 0 or len(g) < need:
            continue
        pos = struct.unpack_from("<" + str(vc * 3) + "f", g, 8)
        for k in range(vc):
            x = c[0] + pos[k * 3]
            y = c[1] + pos[k * 3 + 1]
            z = c[2] + pos[k * 3 + 2]
            gx = int((x - xmin) / cell_wm)
            gy = int((ymax - y) / cell_wm)      # мөр 0 = ХОЙД зах
            if 0 <= gx < GRID and 0 <= gy < GRID:
                i = gy * GRID + gx
                if zmin_grid[i] is None or z < zmin_grid[i]:
                    zmin_grid[i] = z
        done += 1
        if done % 250 == 0:
            filled = sum(1 for v in zmin_grid if v is not None)
            print(f"  {done}/{len(picks)} зангилаа · дүүрсэн нүд {filled*100//(GRID*GRID)}%")

    filled = sum(1 for v in zmin_grid if v is not None)
    print(f"\nдүүрсэн нүд: {filled} / {GRID*GRID} ({filled*100//(GRID*GRID)}%)")
    if filled < GRID * GRID // 20:
        raise SystemExit("хэт цөөн нүд дүүрлээ — LOD эсвэл хүрээ буруу")

    # ── 4. Нүхийг нөхөх: хөрш дунджаар давтан тархаана ──
    # WARNING: Нүх үлдвэл усны урсгал тэнд «хад» мэт зогсоно.
    for _ in range(40):
        holes = 0
        for gy in range(GRID):
            for gx in range(GRID):
                i = gy * GRID + gx
                if zmin_grid[i] is not None:
                    continue
                s, c2 = 0.0, 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = gy + dy, gx + dx
                        if 0 <= ny < GRID and 0 <= nx < GRID:
                            v = zmin_grid[ny * GRID + nx]
                            if v is not None:
                                s += v; c2 += 1
                if c2:
                    zmin_grid[i] = s / c2
                else:
                    holes += 1
        if holes == 0:
            break
    zs = [v for v in zmin_grid if v is not None]
    if len(zs) < GRID * GRID:
        med = sorted(zs)[len(zs) // 2]
        zmin_grid = [med if v is None else v for v in zmin_grid]
    print(f"өндөр: {min(zs):.1f} … {max(zs):.1f} м")

    # ── 5. Бичих: uint16, дециметр, `BASE_Z`-ээс ──
    with open(BIN, "wb") as f:
        f.write(struct.pack("<" + str(GRID * GRID) + "H",
                            *[max(0, min(65535, int(round((v - BASE_Z) * 10))))
                              for v in zmin_grid]))
    meta = {
        "source": "IntegratedMesh " + " + ".join(MESHES),
        "grid": GRID,
        "wkid": 102100,
        "extent": {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
        "cellM": round(cell_wm * K, 3),
        "baseZ": BASE_Z,
        "scale": 10,
        "dtype": "uint16",
        "zMin": round(min(zs), 2),
        "zMax": round(max(zs), 2),
        "nodes": len(picks),
    }
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    raw = os.path.getsize(BIN)
    print(f"\nbin {raw/1e6:.2f} МБ (gzip {len(gzip.compress(open(BIN,'rb').read(),6))/1e6:.2f} МБ)")
    print(f"meta {os.path.getsize(META)} байт")


if __name__ == "__main__":
    main()
