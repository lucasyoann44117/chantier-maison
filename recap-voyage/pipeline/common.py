"""Chemins partagés par les scripts du pipeline.
Usage : python3 pipeline/<script>.py data/<voyage>   (depuis le dossier recap-voyage/)"""
import sys, json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
TRIP_DIR = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "data" / "palma-2026-11"
WORK = ROOT / "work" / TRIP_DIR.name
WORK.mkdir(parents=True, exist_ok=True)
def load(name): return json.load(open(TRIP_DIR / name, encoding="utf-8"))
def hav(a, b):
    R = 6371000; p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1]-a[1]); dp = p2-p1
    return 2*R*math.asin(math.sqrt(math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))
