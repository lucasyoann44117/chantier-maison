"""Assemble les pages : recap3d.html (publiable, three.js via CDN) et deux pages de capture
locales (polices + three.js intégrés) : capture.html (16:9) et capture_reel.html (9:16, version courte)."""
import json, base64, subprocess, tarfile
from common import ROOT, WORK, TRIP_DIR, load
V = ROOT / "work" / "_vendor"; V.mkdir(parents=True, exist_ok=True)
def npm(pkg):
    name = pkg.replace("@", "").replace("/", "-")
    if not (V / name).exists():
        subprocess.run(["npm", "pack", pkg, "--silent"], cwd=V, check=True, capture_output=True)
        tgz = next(V.glob(pkg.split("@")[-2].lstrip("@").replace("/", "-") + "*.tgz" if pkg.startswith("@") else pkg.split("@")[0] + "-*.tgz"))
        (V / name).mkdir(); tarfile.open(tgz).extractall(V / name)
    return V / name / "package"
three = (npm("three@0.128.0") / "build" / "three.min.js").read_text()
css = ""
for fam, pkg, specs in [("Barlow Condensed", "barlow-condensed", [(500, "normal"), (700, "normal"), (800, "normal"), (700, "italic"), (800, "italic")]),
                        ("Barlow", "barlow", [(400, "normal"), (600, "normal"), (600, "italic")])]:
    d = npm(f"@fontsource/{pkg}@5.0.13") / "files"
    for w, st in specs:
        b = base64.b64encode((d / f"{pkg}-latin-{w}-{st}.woff2").read_bytes()).decode()
        css += f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:{st};src:url(data:font/woff2;base64,{b}) format('woff2')}}\n"
trip = load("trip.json"); tex = WORK / "tex"; meta = json.load(open(tex / "meta.json"))
b64 = lambda f, m: f"data:{m};base64," + base64.b64encode(f.read_bytes()).decode()
texs = [[b64(tex / f"c{j}{i}.jpg", "image/jpeg") for i in range(meta["NC"])] for j in range(meta["NR"])]
route = json.load(open(WORK / "route_data.json"))
t = (ROOT / "templates" / "recap3d.html").read_text()
for k, v in {"__ROUTE__": json.dumps(route, separators=(",", ":"), ensure_ascii=False), "__TRIP__": json.dumps(trip, ensure_ascii=False),
             "__META__": json.dumps(meta), "__TEXS__": json.dumps(texs), "__HGT__": b64(tex / "height.png", "image/png"),
             "__DEEP__": json.dumps(meta["deep"]), "__TITLE__": trip["title"], "__KICKER__": trip["kicker"], "__DATES__": trip["dates"],
             "__CLOCK__": trip["clockCode"], "__PLACE__": trip["place"]}.items():
    t = t.replace(k, v)
(WORK / "recap3d.html").write_text(t)
CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
assert CDN in t
for name, flags, cls in [("capture.html", "window.__CAPTURE=true;", "capture"), ("capture_reel.html", "window.__CAPTURE=true;window.__REEL=true;", "capture reel")]:
    loc = t.replace(CDN, "<script>" + three + "</script>").replace("<script>\nconst ROUTE", "<script>\n" + flags + "\nconst ROUTE", 1)
    (WORK / name).write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'
                             + css + f'</style></head><body class="{cls}">' + loc + "</body></html>")
print("pages :", WORK / "recap3d.html", f"({len(t)/1e6:.1f} Mo)")
