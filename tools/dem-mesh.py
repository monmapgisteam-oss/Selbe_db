# -*- coding: utf-8 -*-
"""
ЗАГВАРЧЛАЛЫН ӨНДРИЙН ТОР — mesh + DEM   `public/uyr/selbe-dsm.bin` + `.json`

  python tools/dem-mesh.py

WARNING: BUILD-Д ОРОХГҮЙ. Гараар, нэг удаа ажиллуулна. Стандарт Python.

ЯАГААД ЭНЭ ХОЁРДУГААР ХЭРЭГСЭЛ ХЭРЭГТЭЙ ВЭ
  `dsm-mesh.py` нь 3D mesh-ээс өндрийг гаргадаг — гэвч mesh нь ЗӨВХӨН төслийн
  талбайг (2.17 км) хамардаг ба квадрат БИШ, хазгай тууз. Үерийн загварчлалыг
  зөвхөн түүн дээр бодвол:

    · Ус нь mesh-ийн ирмэг дээр «ханад» тулж, бодит бус овоорно.
    · Хур тунадасны загвар нь mesh-ийн ХҮРЭЭНД л ажиллана — уулын энгэрээс
      хот руу урсах ус, дээд урсгалын хагалбар бүгд орхигдоно.
    · Хэрэглэгчийн 2026-09-09-ны шаардлага: «улаан хүрээнд бүхэлд нь бодоод
      өгөөч, mesh байгаа хэсэг дээр mesh-ээр, бусад дээр DEM-ээр».

  Тиймээс ЭНЭ хэрэгсэл нь ХОЁР эх сурвалжийг НЭГ торонд нийлүүлнэ:

    · mesh байгаа газар  → `selbe-mesh.bin` (4.23 м, барилга/рельеф нарийн)
    · бусад бүх газар    → Esri Terrain3D ImageServer (~30 м, орографи)

БОСОО СИСТЕМ
  Terrain3D нь ОРТОМЕТР өндөр (EGM96 гэр бүл), mesh нь EGM2008. Улаанбаатарт
  тэдгээрийн зөрүү ~0.5 м. Гэсэн ч ШИНГЭЭЛТИЙН АЛДАА нь оёдол дээр «хад»
  үүсгэдэг тул давхцах нүднүүд дээрх ДУНДАЖ ЗӨРҮҮГ бодож DEM-ийг ШИЛЖҮҮЛНЭ.
  Урсгалын чиглэл нь зөвхөн ХАРЬЦАНГУЙ өндрөөс хамаардаг тул үлдэгдэл
  системийн шилжилт нөлөөлөхгүй.

WARNING: ОЁДЛЫГ ЗӨӨЛРҮҮЛНЭ. mesh (4 м, барилгатай) ба DEM (30 м, гөлгөр)
  хоёрын заагт 1–3 м-ийн үсрэлт гардаг. Тэр нь усанд ХИЙМЭЛ хүрхрээ, эсвэл
  далан болно. Тиймээс заагийн `BLEND` нүдэнд шугаман шилжилт хийнэ.
"""
import json, gzip, math, os, struct, urllib.request, zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, "..", "public", "uyr")
MESH_BIN = os.path.join(OUTDIR, "selbe-mesh.bin")
MESH_META = os.path.join(OUTDIR, "selbe-mesh.json")
BIN = os.path.join(OUTDIR, "selbe-dsm.bin")
META = os.path.join(OUTDIR, "selbe-dsm.json")

LAT = 47.9674
K = math.cos(math.radians(LAT))            # WM нэгж → газрын метр

# ── Загварчлалын талбай ──
# WARNING: mesh-ийн ТӨВӨӨС хэмжинэ. Хэрэглэгчийн зурсан улаан хүрээ нь mesh-ээс
#   ~1.3 дахин өргөн, өндөр нь ойролцоо. 1,800 м хагас тал нь 3.6 км квадрат
#   өгөх ба тэр хүрээг бүрэн багтаана.
HALF_M = 1800.0
GRID = 640                                  # 3.6 км / 640 ≈ 5.6 м нүд
BASE_Z = 1200.0
# DEM-ийн хавтангийн ЗУМ. z=14 нь 47.97°N-д 6.4 м/пиксел.
# WARNING: Эх өгөгдөл нь SRTM/ALOS (~30 м) тул үүнээс нарийн зум авах нь
#   зөвхөн интерполяци нэмнэ, мэдээлэл нэмэхгүй — харин хавтангийн тоо 4
#   дахин өснө.
DEM_Z = 14
# Оёдол зөөлрүүлэх өргөн (шинэ торны нүдээр)
BLEND = 6
# Ижил утгатай, захаас эхэлсэн муж хэдэн нүднээс дээш бол НӨХӨӨС гэж үзэх вэ
PAD_MIN_AREA = 400

# ── ГҮҮР / ХООЛОЙ — mesh-ийн «дээвэр»-ийг DEM-ээр солих полигонууд ──
# WARNING: DSM mesh нь ГАДАРГУУГ барьдаг: гүүрний ТАВЦАН, хоолойн ДЭЭД тал нь
#   өндөр болж, доогуур нь ОНГОРХОЙ байгааг мэддэггүй. Улмаас гүүр нь усанд
#   ДАЛАН болж, гол дээшээ тэвэрч, хажуу тийш «боломжгүй» газраар урсдаг
#   (хэрэглэгчийн 2026-09-10-ны олдвор). Эдгээр полигон дотор өндрийг DEM-ээс
#   авбал ус гүүрний ДООГУУР саадгүй өнгөрнө.
BRIDGE_URL = ("https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/"
              "services/Bridge_selbve/FeatureServer/0/query")


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
            raw = urllib.request.urlopen(req, timeout=180).read()
            return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw
        except Exception:
            if i == tries - 1:
                raise
    return b""


def mesh_valid(raw, n):
    """
    MESH-ИЙН БОДИТ ХҮРЭЭ — 1 = mesh-ээс гарсан, 0 = нөхөөс.

    WARNING: `dsm-mesh.py` нь торны булангуудыг (mesh-ийн гадна) хөршийн
    дунджаар нөхдөг ба тэр нь ЯГ ИЖИЛ утгатай том тэгш талбай болдог. Бодит
    газрын гадаргуу хэдэн зуун нүдэн дээр яг ижил дециметрт тэгширдэггүй тул
    түүнийг БҮТЦЭЭР нь таньж болно (өндрийн утгыг кодод бичихгүй — mesh
    шинэчлэгдэхэд өөрчлөгдөнө).
    """
    valid = bytearray(b"\x01" * (n * n))
    seen = bytearray(n * n)
    for b in range(n * n):
        x, y = b % n, b // n
        if seen[b] or not (x == 0 or y == 0 or x == n - 1 or y == n - 1):
            continue
        val = raw[b]
        stack, region = [b], []
        seen[b] = 1
        while stack:
            i = stack.pop()
            region.append(i)
            ix, iy = i % n, i // n
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                jx, jy = ix + dx, iy + dy
                if 0 <= jx < n and 0 <= jy < n:
                    j = jy * n + jx
                    if not seen[j] and raw[j] == val:
                        seen[j] = 1
                        stack.append(j)
        if len(region) >= PAD_MIN_AREA:
            for i in region:
                valid[i] = 0
    return valid


TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
# Web Mercator-ын дэлхийн хагас өргөн (м)
WM_HALF = 20037508.342789244


def png_gray(buf):
    """
    PNG → (W, H, [R,G,B,...]) байт. Зөвхөн 8-бит RGB/RGBA, interlace-гүй.

    WARNING: Бүтэн PNG задлагч БИШ. Terrarium хавтан нь ҮРГЭЛЖ 8-бит RGB
    (colorType 2) байдаг (амьдаар шалгав). Өөр хэлбэр ирвэл ил уначихна —
    чимээгүй буруу өндөр өгөхөөс дээр.
    """
    if buf[:8] != bytes([137, 80, 78, 71, 13, 10, 26, 10]):
        raise SystemExit("PNG биш — хавтан татагдсангүй")
    i, idat = 8, b""
    W = H = bd = ct = 0
    while i < len(buf):
        ln, typ = struct.unpack_from(">I4s", buf, i)
        data = buf[i + 8:i + 8 + ln]
        if typ == b"IHDR":
            W, H, bd, ct, _, _, il = struct.unpack(">IIBBBBB", data)
            if bd != 8 or ct not in (2, 6) or il != 0:
                raise SystemExit(f"PNG хэлбэр дэмжигдэхгүй (bd={bd} ct={ct} il={il})")
        elif typ == b"IDAT":
            idat += data
        elif typ == b"IEND":
            break
        i += 12 + ln
    raw = zlib.decompress(idat)
    bpp = 3 if ct == 2 else 4
    stride = W * bpp
    out = bytearray(H * stride)
    prev = bytearray(stride)
    pos = 0
    for r in range(H):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        # PNG-ийн мөрийн шүүлтүүрүүд (0 = байхгүй)
        if f == 1:
            for k in range(bpp, stride):
                line[k] = (line[k] + line[k - bpp]) & 255
        elif f == 2:
            for k in range(stride):
                line[k] = (line[k] + prev[k]) & 255
        elif f == 3:
            for k in range(stride):
                a2 = line[k - bpp] if k >= bpp else 0
                line[k] = (line[k] + ((a2 + prev[k]) >> 1)) & 255
        elif f == 4:
            for k in range(stride):
                a2 = line[k - bpp] if k >= bpp else 0
                c2 = prev[k - bpp] if k >= bpp else 0
                pr = a2 + prev[k] - c2
                pa, pb, pc = abs(pr - a2), abs(pr - prev[k]), abs(pr - c2)
                pd = a2 if (pa <= pb and pa <= pc) else (prev[k] if pb <= pc else c2)
                line[k] = (line[k] + pd) & 255
        out[r * stride:(r + 1) * stride] = line
        prev = line
    return W, H, out, bpp


def fetch_dem(xmin, ymin, xmax, ymax, z):
    """
    ХАВТАНГИЙН МОЗАИК — Web Mercator хүрээг бүрэн хамарна.

    WARNING: Terrarium хавтан нь Web Mercator (EPSG:3857) тул WM координатаас
    пиксел рүү шилжих нь ШУГАМАН — өргөрөг/уртрагийн тооцоо ОГТ хэрэггүй.
    Хавтангийн WM өргөн = 2·WM_HALF / 2^z.

    @returns (px_w, px_h, x0_wm, y0_wm, res_wm, [өндөр])
    """
    span = (2 * WM_HALF) / (2 ** z)
    tx0 = int((xmin + WM_HALF) // span)
    tx1 = int((xmax + WM_HALF) // span)
    ty0 = int((WM_HALF - ymax) // span)
    ty1 = int((WM_HALF - ymin) // span)
    nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
    W, H = nx * 256, ny * 256
    zs = [0.0] * (W * H)
    print(f"DEM хавтан z={z} · {nx}×{ny} = {nx*ny} ширхэг…")
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            buf = get(TILE_URL.format(z=z, x=tx, y=ty))
            tw, th, px, bpp = png_gray(buf)
            if tw != 256 or th != 256:
                raise SystemExit(f"хавтангийн хэмжээ {tw}×{th} — 256 байх ёстой")
            ox, oy = (tx - tx0) * 256, (ty - ty0) * 256
            for r in range(256):
                base = r * 256 * bpp
                row = (oy + r) * W + ox
                for c in range(256):
                    k = base + c * bpp
                    # Terrarium кодчилол: h = R·256 + G + B/256 − 32768
                    zs[row + c] = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768
    x0 = tx0 * span - WM_HALF
    y0 = WM_HALF - ty0 * span
    return W, H, x0, y0, span / 256, zs


def fetch_bridges():
    """
    ГҮҮР/ХООЛОЙН полигонууд (Web Mercator цагирагууд).

    WARNING: Татагдахгүй бол ил уначихна. Чимээгүй алгасвал гүүр нь далан
    хэвээр үлдэж, үерийн зураг буруу гарах ба яагаад гэдэг нь мэдэгдэхгүй.
    """
    url = (f"{BRIDGE_URL}?where=1%3D1&outFields=OBJECTID&outSR=102100"
           f"&returnGeometry=true&f=json")
    d = json.loads(get(url).decode("utf-8"))
    if "error" in d:
        raise SystemExit(f"гүүрийн давхарга: {d['error']}")
    rings = []
    for f in d.get("features", []):
        for r in f.get("geometry", {}).get("rings", []):
            rings.append([(pt[0], pt[1]) for pt in r])
    if not rings:
        raise SystemExit("гүүрийн полигон олдсонгүй")
    print(f"гүүр/хоолой: {len(d['features'])} обьект, {len(rings)} цагираг")
    return rings


def in_rings(rings, x, y):
    """Цэг полигон дотор уу — тэгш/сондгой (even-odd) туяаны арга."""
    inside = False
    for r in rings:
        n = len(r)
        j = n - 1
        for i in range(n):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def main():
    # ── 1. Mesh-ийн тор ──
    with open(MESH_META, encoding="utf-8") as f:
        mm = json.load(f)
    with open(MESH_BIN, "rb") as f:
        mbuf = f.read()
    MN = mm["grid"]
    mraw = struct.unpack("<" + str(MN * MN) + "H", mbuf[: MN * MN * 2])
    mvalid = mesh_valid(mraw, MN)
    me = mm["extent"]
    mcw = (me["xmax"] - me["xmin"]) / MN
    mch = (me["ymax"] - me["ymin"]) / MN
    nvalid = sum(mvalid)
    print(f"mesh {MN}² · хүчинтэй {nvalid} ({nvalid*100//(MN*MN)}%) · нүд {mm['cellM']} м")

    # ── 2. Шинэ хүрээ — mesh-ийн ТӨВӨӨС ──
    cx = (me["xmin"] + me["xmax"]) / 2
    cy = (me["ymin"] + me["ymax"]) / 2
    half = HALF_M / K                       # газрын метр → WM нэгж
    xmin, xmax = cx - half, cx + half
    ymin, ymax = cy - half, cy + half
    cw = (xmax - xmin) / GRID
    cell_m = cw * K
    print(f"загварчлалын хүрээ {round(HALF_M*2)} × {round(HALF_M*2)} м · "
          f"тор {GRID}² · нүд {cell_m:.2f} м")

    # ── 3. DEM татах (AWS terrain-tiles, terrarium) ──
    dw, dh, dx0, dy0, dres, dem = fetch_dem(xmin, ymin, xmax, ymax, DEM_Z)
    good = [v for v in dem if -500 < v < 9000]
    print(f"DEM {dw}×{dh} · {dres*K:.2f} м/пиксел · {min(good):.1f} … {max(good):.1f} м")

    def dem_at(x, y):
        """Bilinear дээж — WM координатаар (мозаик нь WM-д шугаман)."""
        fx = (x - dx0) / dres
        fy = (dy0 - y) / dres
        fx = min(max(fx, 0), dw - 1)
        fy = min(max(fy, 0), dh - 1)
        x0i, y0i = int(fx), int(fy)
        x1i, y1i = min(x0i + 1, dw - 1), min(y0i + 1, dh - 1)
        tx, ty = fx - x0i, fy - y0i
        a = dem[y0i * dw + x0i] * (1 - tx) + dem[y0i * dw + x1i] * tx
        b = dem[y1i * dw + x0i] * (1 - tx) + dem[y1i * dw + x1i] * tx
        return a * (1 - ty) + b * ty

    def mesh_at(x, y):
        """Mesh-ийн өндөр (м) эсвэл `None` — хүрээнээс гадна/нөхөөс дээр."""
        gx = int((x - me["xmin"]) / mcw)
        gy = int((me["ymax"] - y) / mch)
        if not (0 <= gx < MN and 0 <= gy < MN):
            return None
        i = gy * MN + gx
        if not mvalid[i]:
            return None
        return mm["baseZ"] + mraw[i] / mm["scale"]

    # ── 4. DEM-ийн БОСОО ШИЛЖИЛТ — давхцах нүднүүдийн дундаж зөрүүгээр ──
    diffs = []
    for gy in range(0, GRID, 4):
        y = ymax - (gy + 0.5) * cw
        for gx in range(0, GRID, 4):
            x = xmin + (gx + 0.5) * cw
            mz = mesh_at(x, y)
            if mz is not None:
                diffs.append(mz - dem_at(x, y))
    diffs.sort()
    shift = diffs[len(diffs) // 2] if diffs else 0.0
    print(f"DEM-ийн шилжилт (медиан mesh − DEM): {shift:+.2f} м · дээж {len(diffs)}")

    # ── 4б. Гүүр/хоолойн полигон ──
    bridges = fetch_bridges()

    # ── 5. Нийлүүлэх ──
    # Эхлээд mesh-ийн эх сурвалжийн маск (шинэ торонд)
    src = bytearray(GRID * GRID)            # 1 = mesh, 0 = DEM
    zm = [0.0] * (GRID * GRID)
    zd = [0.0] * (GRID * GRID)
    nbridge = [0]
    for gy in range(GRID):
        y = ymax - (gy + 0.5) * cw
        for gx in range(GRID):
            x = xmin + (gx + 0.5) * cw
            i = gy * GRID + gx
            zd[i] = dem_at(x, y) + shift
            mz = mesh_at(x, y)
            if mz is not None:
                src[i] = 1
                zm[i] = mz
                # WARNING: ГҮҮР — mesh-ийн тавцангийн оронд DEM-ийн ёроол.
                #   `src` нь 1 ХЭВЭЭР: энэ нүд СУДАЛГААНЫ талбайд байгаа тул
                #   бороо унах ёстой; зөвхөн ӨНДӨР нь DEM-ээс.
                if in_rings(bridges, x, y):
                    zm[i] = zd[i]
                    nbridge[0] += 1

    # Оёдлын зай (chamfer) — mesh-ийн ирмэгээс хэдэн нүд вэ
    INF = 10 ** 9
    dist = [0 if src[i] else INF for i in range(GRID * GRID)]
    for gy in range(GRID):
        for gx in range(GRID):
            i = gy * GRID + gx
            if dist[i] == 0:
                continue
            best = dist[i]
            if gx > 0:
                best = min(best, dist[i - 1] + 1)
            if gy > 0:
                best = min(best, dist[i - GRID] + 1)
            dist[i] = best
    for gy in range(GRID - 1, -1, -1):
        for gx in range(GRID - 1, -1, -1):
            i = gy * GRID + gx
            best = dist[i]
            if gx < GRID - 1:
                best = min(best, dist[i + 1] + 1)
            if gy < GRID - 1:
                best = min(best, dist[i + GRID] + 1)
            dist[i] = best

    z = [0.0] * (GRID * GRID)
    for i in range(GRID * GRID):
        if src[i]:
            z[i] = zm[i]
        else:
            z[i] = zd[i]
    # Зөөлрүүлэлт: заагийн туузыг ДУНДАЖЛАНА (mesh ба DEM хоёрыг холино)
    for _ in range(2):
        z2 = list(z)
        for gy in range(1, GRID - 1):
            for gx in range(1, GRID - 1):
                i = gy * GRID + gx
                if 0 < dist[i] <= BLEND:
                    s = (z[i - 1] + z[i + 1] + z[i - GRID] + z[i + GRID]) * 0.25
                    z2[i] = z[i] * 0.4 + s * 0.6
        z = z2

    nmesh = sum(src)
    zmin, zmax = min(z), max(z)
    print(f"нийлүүлэв: mesh {nmesh} нүд ({nmesh*100//(GRID*GRID)}%) · "
          f"DEM {GRID*GRID-nmesh} · гүүрээр DEM болгосон {nbridge[0]} нүд · "
          f"өндөр {zmin:.1f} … {zmax:.1f} м")

    # ── 6. Бичих: uint16, дециметр, `BASE_Z`-ээс ──
    with open(BIN, "wb") as f:
        f.write(struct.pack("<" + str(GRID * GRID) + "H",
                            *[max(0, min(65535, int(round((v - BASE_Z) * 10))))
                              for v in z]))
        # WARNING: ХОЁР ДАХЬ ХАВТАС — эх сурвалжийн маск (1 байт/нүд).
        #   Загварчлал өөрөө үүнийг ХЭРЭГЛЭХГҮЙ (бүх тор нь домэйн) ч
        #   «энэ хэсэг mesh-ээс, тэр хэсэг DEM-ээс» гэдгийг UI-д хэлэхэд
        #   хэрэгтэй бөгөөд ирээдүйд нарийвчлалаар жинлэхэд ч ашиглаж болно.
        f.write(bytes(src))
    meta = {
        "source": f"{mm['source']} + AWS terrain-tiles (SRTM/ALOS)",
        "grid": GRID,
        "wkid": 102100,
        "extent": {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
        "cellM": round(cell_m, 3),
        "baseZ": BASE_Z,
        "scale": 10,
        "dtype": "uint16",
        "zMin": round(zmin, 2),
        "zMax": round(zmax, 2),
        # Нөхөөс БАЙХГҮЙ — тор бүхэлдээ бодит өндөртэй
        "padded": False,
        "meshCells": nmesh,
        "demShiftM": round(shift, 2),
        "srcPlane": True,
        "bridgeCells": nbridge[0],
    }
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    raw = os.path.getsize(BIN)
    print(f"\nbin {raw/1e6:.2f} МБ (gzip "
          f"{len(gzip.compress(open(BIN,'rb').read(),6))/1e6:.2f} МБ)")


if __name__ == "__main__":
    main()
