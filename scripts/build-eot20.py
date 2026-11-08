"""Maintainer-only: cuts the EOT20 global ocean tide model down to the ocean
cells near a coast and writes them as small binary tiles the browser fetches
on demand.

Input : data-raw/eot20/ocean_tides/*_ocean_eot20.nc  (EOT20, DGFI-TUM, CC BY 4.0,
        https://doi.org/10.17882/79489; SEANOE file 85762.zip, ocean_tides.zip inside)
Output: public/data/eot20/<lat0>_<lon0>.bin, one per 5°x5° tile that has coastal cells,
        plus public/data/eot20/index.json (the list of tiles and the constituent order).

Cells kept: ocean cells (non-zero M2 amplitude) with a land cell (the model's own
land mask) within RADIUS cells, i.e. about 3 x 14 km. Open ocean is left out: the
almanac is for coasts, and the full grid would be 2 GB.

Tile format (little-endian): for each cell, uint8 row and uint8 column inside the
tile (1/8 degree steps from the tile's south-west corner), then for each constituent
in index.json order uint16 amplitude in millimetres and uint16 Greenwich phase lag
in tenths of a degree.

Run: python -I scripts/build-eot20.py   (needs numpy and h5py)
"""
import json
import os
import sys

import h5py
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data-raw", "eot20", "ocean_tides")
OUT = os.path.join(ROOT, "public", "data", "eot20")
CONST = ["M2", "S2", "N2", "K2", "K1", "O1", "P1", "Q1", "2N2", "J1", "M4", "S1", "T2", "MF", "MM", "SA", "SSA"]
RADIUS = 3  # cells
# Quality control: amplitudes (cm) above these are not physical for that constituent
# anywhere on Earth (the real maxima are M2 ~6 m in the Bay of Fundy, S2 ~2.5 m).
# EOT20 has such values in a few river mouths (St Lawrence, Amazon); those cells are dropped.
CAPS = {"S2": 300, "K2": 100, "P1": 100, "S1": 30, "T2": 30, "SA": 100, "MF": 30, "MM": 30, "M4": 150}
TILE = 5  # degrees
STEP = 0.125


def read(name):
    with h5py.File(os.path.join(SRC, f"{name}_ocean_eot20.nc"), "r") as f:
        lat = f["lat"][:]
        lon = f["lon"][:]
        amp = f["amplitude"][:]
        ph = f["phase"][:]
        units = f["amplitude"].attrs["units"]
        units = units.decode() if isinstance(units, bytes) else str(units)
    assert units == "cm", f"{name}: amplitude units {units!r}, expected cm"
    # The last column repeats longitude 0 as 360.
    assert abs(lon[-1] - 360) < 1e-9 and abs(lon[0]) < 1e-9
    return lat, lon[:-1], amp[:, :-1], ph[:, :-1]


def main():
    lat, lon, m2, _ = read("M2")
    assert abs(lat[1] - lat[0] - STEP) < 1e-9 and abs(lat[0] + 90) < 1e-9
    ocean = m2 > 0
    land = ~ocean
    # Dilate the land mask by RADIUS cells (longitude wraps, latitude does not).
    near = np.zeros_like(land)
    for di in range(-RADIUS, RADIUS + 1):
        for dj in range(-RADIUS, RADIUS + 1):
            if di * di + dj * dj > RADIUS * RADIUS:
                continue
            shifted = np.roll(land, dj, axis=1)
            if di > 0:
                shifted = np.vstack([np.zeros((di, land.shape[1]), bool), shifted[:-di]])
            elif di < 0:
                shifted = np.vstack([shifted[-di:], np.zeros((-di, land.shape[1]), bool)])
            near |= shifted
    keep = ocean & near
    rows, cols = np.nonzero(keep)
    print(f"coastal cells: {len(rows)} of {ocean.sum()} ocean cells")

    amps = np.zeros((len(rows), len(CONST)), np.uint16)
    phs = np.zeros((len(rows), len(CONST)), np.uint16)
    for k, name in enumerate(CONST):
        _, _, a, p = read(name)
        a = a[rows, cols]
        p = p[rows, cols]
        assert np.all(a >= 0) and np.nanmax(a) < 6553, name
        amps[:, k] = np.round(a * 10).astype(np.uint16)  # cm -> mm
        phs[:, k] = np.round(np.mod(p, 360) * 10).astype(np.uint16) % 3600
        print(f"  {name}: max {a.max():.1f} cm")

    bad = np.zeros(len(rows), bool)
    for name, cap in CAPS.items():
        k = CONST.index(name)
        over = amps[:, k] > cap * 10
        print(f"  QC {name} > {cap} cm: {over.sum()} cells")
        bad |= over
    print(f"QC: dropped {bad.sum()} cells")
    rows, cols, amps, phs = rows[~bad], cols[~bad], amps[~bad], phs[~bad]

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".bin"):
            os.remove(os.path.join(OUT, f))
    cell_lat = lat[rows]
    cell_lon = lon[cols]
    cell_lon = np.where(cell_lon >= 180, cell_lon - 360, cell_lon)
    t_lat = (np.floor(cell_lat / TILE) * TILE).astype(int)
    t_lon = (np.floor(cell_lon / TILE) * TILE).astype(int)
    tiles = {}
    order = np.lexsort((t_lon, t_lat))
    for idx in order:
        tiles.setdefault((int(t_lat[idx]), int(t_lon[idx])), []).append(idx)
    total = 0
    for (la0, lo0), idxs in tiles.items():
        buf = bytearray()
        for i in idxs:
            r = int(round((cell_lat[i] - la0) / STEP))
            c = int(round((cell_lon[i] - lo0) / STEP))
            assert 0 <= r <= 40 and 0 <= c < 40, (cell_lat[i], cell_lon[i], la0, lo0)
            buf += bytes([r, c])
            inter = np.empty(2 * len(CONST), np.uint16)
            inter[0::2] = amps[i]
            inter[1::2] = phs[i]
            buf += inter.astype("<u2").tobytes()
        with open(os.path.join(OUT, f"{la0}_{lo0}.bin"), "wb") as f:
            f.write(buf)
        total += len(buf)
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"model": "EOT20", "doi": "10.17882/79489", "step": STEP, "tile": TILE, "radius": RADIUS,
                   "constituents": CONST, "caps_cm": CAPS, "tiles": sorted(f"{a}_{b}" for a, b in tiles)}, f)
    print(f"{len(tiles)} tiles, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    sys.exit(main())
