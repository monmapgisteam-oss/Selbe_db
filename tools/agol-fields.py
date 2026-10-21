# AGOL давхарга бүрийн ЭХ талбарын нэрс → JSON (`tools/entMap-build.mjs --fields`). Enterprise нийтлэхэд нэрсийг ЖИЖИГ үсэг болгодог тул
# кодын эх нэрийг энд хадгална (2026-10-20). Ажиллуулах: ArcGIS Pro-гийн python (AGOL-д нэвтэрсэн):
#   "C:/Program Files/ArcGIS/Pro/bin/Python/envs/arcgispro-py3/python.exe" -I tools/agol-fields.py <гаралт.json> [shalgalt_csv]
import sys, csv, json
sys.stdout.reconfigure(encoding="utf-8")
import arcpy
HJ = "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services"
out = {}
# «Нэр» (gdb/Enterprise нэр) · «Эх» (AGOL үйлчилгээ/№) — экспортын шалгалтын тайлан
rows = list(csv.DictReader(open(sys.argv[2] if len(sys.argv) > 2 else r"E:\selbe_1019\shalgalt_buren2.csv", encoding="utf-8-sig")))
extra = [  # ХАБЭА Survey123 (AGOL) — Enterprise-ийн дүйцэх үйлчилгээг сонгоход
    ("habea:labor", "survey123_60cf822671df4c3681cf8f77317bdb4f/0"), ("habea:incident", "survey123_a4e9f3801ea84fdd99133b139557ca81/0"),
    ("habea:uzlegV11", "service_cbda4d63ef404e1189dc208280dd9a45/0"), ("habea:uzlegG", "service_92a6675c595e48118dcaa17e7dde5e78/0"),
    ("habea:zahialagch", "service_923029f4289647bd8a34aaf8e93ec9c8/0"),
]
items = [(r["Нэр"], r["Эх"]) for r in rows] + extra
n = 0
for name, src in items:
    svc, lid = src.rsplit("/", 1)
    url = f"{HJ}/{svc}/FeatureServer/{lid}"
    try:
        d = arcpy.Describe(url)
        rec = {"key": src, "oid": getattr(d, "OIDFieldName", None), "fields": [f.name for f in d.fields],
               "types": {f.name: f.type for f in d.fields},
               "track": {k: getattr(d, k, None) for k in ("creatorFieldName", "createdAtFieldName", "editorFieldName", "editedAtFieldName")} if getattr(d, "editorTrackingEnabled", False) else None,
               "gid": getattr(d, "globalIDFieldName", None)}
        out[name] = rec; n += 1
    except Exception as e:
        out[name] = {"key": src, "error": str(e)[:200]}
        print("АЛДАА", name, src, str(e)[:120])
    if n % 25 == 0: print(n, "…", flush=True)
json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("дууслаа:", n, "/", len(items))
