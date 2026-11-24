"""
Erzeugt data.js für den Gletscher-Prototyp aus den GLAMOS-CSV-Dateien.
Aufruf:  python3 build_data.py [data-ordner] [ausgabe]
Benötigt: pandas, numpy
"""
import sys, json
import numpy as np, pandas as pd

DATA = sys.argv[1] if len(sys.argv) > 1 else "data"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data.js"

Y0, Y_OBS_END, Y1 = 2000, 2025, 2100
VA_GAMMA = 1.36        # Volumen-Flächen-Skalierung V = 0.034 * A^1.36 (km3 Eis)
ICE_TO_WE = 0.9        # Eis -> Wasseräquivalent
TREND_FROM = 2011      # Projektion: mittlere Massenbilanz 2011-2025

# 20 Gletscher: lange Messreihen, verschiedene Grössen
IDS = ["B36-26","B83-03","B43-03","B56-03","B82-27","B52-29","E22-16","A55f-03",
       "B82-14","B52-24","A50i-19","A54g-03","B45-04","A10g-05","B22-01","B56-14",
       "B52-32","C14-10","A14g-16"]

mb = pd.read_csv(f"{DATA}/massbalance_observation.csv", skiprows=9, header=None, usecols=range(13))
mb.columns = ["name","id","start","wend","end","Bw","Bs","Ba","ELA","AAR","area","hmin","hmax"]
mb["y"] = pd.to_datetime(mb["end"]).dt.year
mb = mb[mb.id.isin(IDS) & (mb.y >= Y0 - 1)]

years = list(range(Y0, Y_OBS_END + 1))
ba = pd.DataFrame(index=years, columns=IDS, dtype=float)
area = pd.DataFrame(index=years, columns=IDS, dtype=float)
for gid, g in mb.groupby("id"):
    g = g.drop_duplicates("y", keep="last").set_index("y")
    for y in years:
        if y in g.index:
            ba.loc[y, gid] = g.loc[y, "Ba"] / 1000.0   # m w.e.
            area.loc[y, gid] = g.loc[y, "area"]

# Referenz = Mittel der Gletscher mit lückenlosen Reihen; Lücken über Offset zur Referenz füllen
full = [c for c in IDS if ba[c].notna().sum() >= len(years) - 1]
ref = ba[full].mean(axis=1)
observed = ba.notna()
for c in IDS:
    off = (ba[c] - ref).mean()
    ba[c] = ba[c].fillna(ref + off)
area = area.bfill().ffill()

names = mb.drop_duplicates("id").set_index("id")["name"].to_dict()

# Längenänderung
lc = pd.read_csv(f"{DATA}/lengthchange.csv", skiprows=9, header=None)
lc = lc.iloc[:, :9]; lc.columns = ["name","id","d0","q0","d1","q1","dL","hmin","obs"]
lc["y1"] = pd.to_datetime(lc["d1"], errors="coerce").dt.year
lc["dL"] = pd.to_numeric(lc["dL"], errors="coerce")

# Geodätische Volumenänderung
vc = pd.read_csv(f"{DATA}/volumechange.csv", skiprows=8, header=None)
vc = vc.iloc[:, :16]
vc.columns = ["id","s0","s1","d0","d1","A0","o0","A1","o1","dV","dh","Bgeod","sigma","cov","rho","name"]
vc["id"] = vc["id"].astype(str)
vc["y0"] = vc["d0"].astype(str).str[:4].astype(int)
vc["y1"] = vc["d1"].astype(str).str[:4].astype(int)

glaciers = []
for gid in IDS:
    A0 = float(area.loc[Y0, gid])
    V0 = 0.034 * A0 ** VA_GAMMA * ICE_TO_WE         # km3 w.e.
    # Ba [m w.e.] * A [km2] = 1e-3 km3 w.e.
    f = {Y0: 1.0}
    for y in years[1:]:
        f[y] = max(0.0, f[y-1] + ba.loc[y, gid] * area.loc[y, gid] * 1e-3 / V0)
    b_trend = float(ba.loc[TREND_FROM:Y_OBS_END, gid].mean())
    A_end, f_end = float(area.loc[Y_OBS_END, gid]), f[Y_OBS_END]
    series, bser, aser = [], [], []
    for y in range(Y0, Y1 + 1):
        if y <= Y_OBS_END:
            fy, by, ay = f[y], float(ba.loc[y, gid]), float(area.loc[y, gid])
        else:
            prev = series[-1]
            ay = A_end * (prev / f_end) ** (1 / VA_GAMMA) if prev > 0 else 0.0
            fy = max(0.0, prev + b_trend * ay * 1e-3 / V0)
            by = b_trend if prev > 0 else 0.0
        series.append(round(fy, 4)); bser.append(round(by, 3)); aser.append(round(ay, 3))
    # Längenänderung seit 2000
    l = lc[(lc.id == gid) & (lc.y1 >= Y0 + 1)].dropna(subset=["dL"])
    cumL = {}
    run = 0.0
    for y, v in l.groupby("y1")["dL"].sum().sort_index().items():
        run += v; cumL[int(y)] = round(run, 1)
    # geodätisch: längster Zeitraum mit Ende >= 2014
    v = vc[(vc.id == gid) & (vc.y1 >= 2014)].copy()
    geo = None
    if len(v):
        v["span"] = v.y1 - v.y0
        c = v[(v.y0 <= 2012) & (v.span >= 8)]
        if len(c):   # Zeitraum, der möglichst nahe bei 2000 beginnt
            r = c.assign(k=(c.y0 - 2000).abs()).sort_values(["k", "y1"], ascending=[True, False]).iloc[0]
        else:
            r = v.sort_values("span", ascending=False).iloc[0]
        geo = dict(y0=int(r.y0), y1=int(r.y1), dV=float(r.dV), dh=float(r.dh))
    glaciers.append(dict(
        id=gid, name=names[gid].strip(), area0=round(A0, 3), v0=round(V0, 4),
        f=series, ba=bser, area=aser, obsYears=[int(y) for y in years if observed.loc[y, gid]],
        lengthCum=cumL, geo=geo, bTrend=round(b_trend, 3)))

# Gesamtwerte
V0s = np.array([g["v0"] for g in glaciers]); F = np.array([g["f"] for g in glaciers])
melted = (1 - (V0s[:, None] * F).sum(0) / V0s.sum()).round(4).tolist()

payload = dict(y0=Y0, yObsEnd=Y_OBS_END, y1=Y1, glaciers=glaciers, melted=melted,
               source="GLAMOS (2025), release 2025")
open(OUT, "w", encoding="utf-8").write("window.GLACIER_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")
print("Gletscher:", len(glaciers))
for g in glaciers:
    print(f'{g["name"][:28]:28} A0={g["area0"]:7.2f} V0={g["v0"]:6.3f} f2025={g["f"][25]:.2f} f2050={g["f"][50]:.2f} f2100={g["f"][100]:.2f} b={g["bTrend"]:+.2f} len={max(g["lengthCum"]) if g["lengthCum"] else "-"} geo={bool(g["geo"])}')
print("melted 2025/2050/2075/2100:", [melted[i] for i in (25,50,75,100)])
