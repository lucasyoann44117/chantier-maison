"""Étalonnage de l'image satellite, mer synthétique au large (masque côte + distance),
découpe en morceaux JPEG et grille de hauteurs PNG (16 bits sur R,G) pour le moteur 3D."""
import math, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from common import WORK, TRIP_DIR, load
g = json.load(open(WORK / "grid.json")); z, x0, y0 = g["z"], g["x0"], g["y0"]
E = np.load(WORK / "dem.npy"); H, W = E.shape
S = np.load(WORK / "sat.npy").transpose(1, 2, 0).astype(np.float32)
px = lambda lon: ((lon + 180) / 360 * 2**z - x0) * 256
py = lambda lat: ((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2**z - y0) * 256
M = Image.new("L", (W, H), 0); d = ImageDraw.Draw(M)
for r in load("coast.json"): d.polygon([(px(a), py(b)) for a, b in r], fill=255)
poly = np.asarray(M) > 0
sat_water = (S.mean(2) < 45) & (S[..., 2] > S[..., 0] + 2)
land = (poly & ~(sat_water & (E < 3))) | (E > 4)
land = ndimage.binary_fill_holes(ndimage.binary_opening(land, iterations=1))
lat_c = math.degrees(math.atan(math.sinh(math.pi - 2 * math.pi * (y0 * 256 + H / 2) / 256 / 2**z)))
mpp = 156543.03 * math.cos(math.radians(lat_c)) / 2**z
dist = ndimage.distance_transform_edt(~land) * mpp
L = np.clip(S / 255 * np.array([0.94, 1.0, 1.06]), 0, 1) ** 0.85
lum = L.mean(2, keepdims=True); L = np.clip(((lum + (L - lum) * 1.12) - 0.02) * 1.12, 0, 1) * 255
rng = np.random.default_rng(5); n = ndimage.gaussian_filter(rng.standard_normal((H // 4, W // 4)), 1.5)
n = np.array(Image.fromarray(n.astype(np.float32)).resize((W, H), Image.BILINEAR)); n = n / n.std()
t = np.clip(dist / 7000, 0, 1) ** 0.55
shallow, mid, deep = np.array([40, 150, 170.]), np.array([18, 82, 128.]), np.array([10, 40, 78.])
sea = np.where((t < 0.12)[..., None], shallow + (mid - shallow) * (t / 0.12)[..., None], mid + (deep - mid) * ((t - 0.12) / 0.88)[..., None])
sea *= (1 + 0.035 * n)[..., None]
w = np.clip(1 - (dist - 30) / 110, 0, 1)[..., None]          # garde les vrais hauts-fonds près de la côte
img = np.clip(np.where(land[..., None], L, L * w + sea * (1 - w)), 0, 255).astype(np.uint8)
nc, nr = load("trip.json")["map"]["chunks"]; CW, CH = W // nc, H // nr
tex = WORK / "tex"; tex.mkdir(exist_ok=True)
for j in range(nr):
    for i in range(nc):
        Image.fromarray(img[j*CH:(j+1)*CH, i*CW:(i+1)*CW]).save(tex / f"c{j}{i}.jpg", quality=76, optimize=True, progressive=True)
Image.fromarray(img).resize((1024, int(1024 * H / W))).save(WORK / "texture_apercu.jpg", quality=85)
STEP = 8
Es = ndimage.gaussian_filter(np.where(land, np.maximum(E, 0.5), 0), 1.2)
GW, GH = W // STEP + 1, H // STEP + 1
Eg = Es[np.ix_(np.minimum(np.arange(GH) * STEP, H - 1), np.minimum(np.arange(GW) * STEP, W - 1))]
v = np.clip((np.where(Eg < 1, 0, Eg) + 100) * 10, 0, 65535).astype(np.uint16)
rgb = np.zeros((GH, GW, 3), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255
Image.fromarray(rgb).save(tex / "height.png", optimize=True)
deep_px = img[:40, :40].reshape(-1, 3).mean(0).round().astype(int).tolist()
json.dump(dict(W=W, H=H, GW=GW, GH=GH, mpp=mpp, z=z, x0=x0, y0=y0, NC=nc, NR=nr, CSX=CW // STEP, CSY=CH // STEP, deep=deep_px), open(tex / "meta.json", "w"))
print("texture", W, "x", H, "morceaux", nc, "x", nr)
