"""Mosaïque Sentinel-2 (TCI 10 m, bucket public AWS sentinel-cogs) reprojetée sur la grille du relief.
Les produits sont listés dans trip.json > map.sentinel (choisir des dates sans nuages)."""
import os, json, numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from common import WORK, load
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")  # proxy de l'environnement cloud
os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="TRUE")
B = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31"
g = json.load(open(WORK / "grid.json")); z = g["z"]; W, H = g["W"], g["H"]
R = 6378137 * np.pi; res = 2 * R / (256 * 2**z)
tr = from_origin(-R + g["x0"] * 256 * res, R - g["y0"] * 256 * res, res, res)
out = np.zeros((3, H, W), np.uint8)
for it in load("trip.json")["map"]["sentinel"]:
    zone = B if it.startswith(("S/", "T/")) else B.rsplit("/", 1)[0]
    with rasterio.open(f"/vsicurl/{zone}/{it}/TCI.tif") as src:
        tmp = np.zeros((3, H, W), np.uint8)
        for b in range(3):
            reproject(rasterio.band(src, b + 1), tmp[b], dst_transform=tr, dst_crs="EPSG:3857", resampling=Resampling.average, src_nodata=0, dst_nodata=0, num_threads=4)
        m = (out.sum(0) == 0) & (tmp.sum(0) > 0); out[:, m] = tmp[:, m]
        print(it, f"{m.mean():.0%} de la zone")
np.save(WORK / "sat.npy", out)
