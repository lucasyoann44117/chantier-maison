"""Télécharge le relief (Terrain Tiles AWS, format terrarium) sur la zone trip.json > map.bbox."""
import math, subprocess, numpy as np
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from common import WORK, load
m = load("trip.json")["map"]; z = m["zoom"]; w, s, e, n = m["bbox"]
tx = lambda lon: int((lon + 180) / 360 * 2**z)
ty = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2**z)
x0, x1, y0, y1 = tx(w), tx(e), ty(n), ty(s)
nc, nr = m["chunks"]
x1 = x0 + math.ceil((x1 - x0 + 1) / nc) * nc - 1; y1 = y0 + math.ceil((y1 - y0 + 1) / nr) * nr - 1   # multiple des morceaux
d = WORK / "dem"; d.mkdir(exist_ok=True)
def get(xy):
    x, y = xy; f = d / f"{x}_{y}.png"
    if not f.exists():
        subprocess.run(["curl", "-sS", "-m", "30", "-o", str(f), f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], check=True)
jobs = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
list(ThreadPoolExecutor(16).map(get, jobs))
E = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
for x, y in jobs:
    a = np.asarray(Image.open(d / f"{x}_{y}.png").convert("RGB")).astype(np.float32)
    E[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
np.save(WORK / "dem.npy", E)
import json; json.dump(dict(z=z, x0=x0, y0=y0, W=E.shape[1], H=E.shape[0]), open(WORK / "grid.json", "w"))
print("relief", E.shape, "max", E.max())
