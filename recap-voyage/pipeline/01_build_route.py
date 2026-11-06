"""Chaîne les activités, insère les liaisons (transfers.json), horodate,
écrit les GPX (continu + détail) et work/<voyage>/route_data.json pour le rendu."""
import datetime as dt, json
from xml.sax.saxutils import escape
from common import TRIP_DIR, WORK, load, hav
from polyline import decode

A = load("activities.json"); T = load("transfers.json")
CAR_SPEED = 12.5  # m/s moyen pour horodater une liaison
def timed(pts, t0, t1):
    d = [0.0]
    for i in range(1, len(pts)): d.append(d[-1] + hav(pts[i-1], pts[i]))
    tot = d[-1] or 1
    return [(p, t0 + (t1 - t0) * (x / tot)) for p, x in zip(pts, d)]

segs = []  # dicts: name, mode, pts[(latlon, datetime)], meta
for i, a in enumerate(A):
    pts = decode(a["poly"]); t0 = dt.datetime.fromisoformat(a["start"]); t1 = t0 + dt.timedelta(seconds=a["elapsed"])
    if i > 0 and str(i) in T:
        tr = T[str(i)]; pe, pt = segs[-1]["pts"][-1]
        way = [pe] + [tuple(w) for w in tr["waypoints"]] + [pts[0]]
        L = sum(hav(way[j], way[j+1]) for j in range(len(way)-1))
        segs.append(dict(name=tr["name"], mode=tr["mode"], pts=timed(way, pt, min(t0, pt + dt.timedelta(seconds=L / CAR_SPEED)))))
    mode = {"Walk": "Marche", "Run": "Course", "Ride": "Vélo", "Hike": "Marche"}.get(a["type"], "Marche")
    segs.append(dict(name=f'{a["start"][:10]} {a["name"]}', mode=mode, pts=timed(pts, t0, t1),
                     temp=a.get("temp"), wind=a.get("wind"), dplus=a.get("dplus", 0)))

UTC_OFFSET = dt.timedelta(hours=1)  # heure locale -> UTC (CET)
iso = lambda x: (x - UTC_OFFSET).strftime("%Y-%m-%dT%H:%M:%SZ")
trkpt = lambda p, x: f'<trkpt lat="{p[0]:.5f}" lon="{p[1]:.5f}"><time>{iso(x)}</time></trkpt>'
H = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="recap-voyage" xmlns="http://www.topografix.com/GPX/1/1">\n'
allp = []
for s in segs:
    for q in s["pts"]:
        if not allp or allp[-1][1] < q[1]: allp.append(q)
with open(WORK / "voyage_continu.gpx", "w") as f:
    f.write(H + f'<trk><name>{TRIP_DIR.name}</name><trkseg>\n' + "\n".join(trkpt(*q) for q in allp) + "\n</trkseg></trk>\n</gpx>\n")
with open(WORK / "voyage_detail.gpx", "w") as f:
    f.write(H)
    for s in segs:
        desc = "<desc>Trajet reconstitué (pas de trace GPS)</desc>" if s["mode"] == "Voiture" else ""
        f.write(f'<trk><name>{escape(s["name"])}</name><type>{s["mode"]}</type>{desc}<trkseg>\n' + "\n".join(trkpt(*q) for q in s["pts"]) + "\n</trkseg></trk>\n")
    f.write("</gpx>\n")
# données compactes pour le rendu : [lat, lon, epoch(heure locale)] aplatis
out = []
for s in segs:
    km = sum(hav(s["pts"][j][0], s["pts"][j+1][0]) for j in range(len(s["pts"])-1)) / 1000
    flat = [v for (p, x) in s["pts"] for v in (round(p[0], 5), round(p[1], 5), int(x.replace(tzinfo=dt.timezone.utc).timestamp()))]
    out.append(dict(mode=s["mode"], km=round(km, 2), temp=s.get("temp"), wind=s.get("wind"), dplus=s.get("dplus", 0), p=flat))
    print(f'{s["mode"]:8} {km:6.1f} km  {s["name"]}')
json.dump(out, open(WORK / "route_data.json", "w"), separators=(",", ":"), ensure_ascii=False)
