import json
from pathlib import Path
import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, Point, MultiPoint

ROOT = Path.cwd()
DATA = ROOT / "app" / "public" / "data"
SIM = ROOT / "simulation"

# Load datasets
clean = pd.read_csv(SIM / "humid_chaco_clean.csv")
roads = gpd.read_file(DATA / "roads.geojson")
candidates = gpd.read_file(SIM / "candidate_roads.geojson")
summary = pd.read_csv(SIM / "candidate_road_summary.csv")

# 1. GPS Observation Bounds
print("1. GPS Observation Bounds (EPSG:4326):")
print(f"   Longitude: min={clean.longitude.min():.6f}, max={clean.longitude.max():.6f}")
print(f"   Latitude:  min={clean.latitude.min():.6f}, max={clean.latitude.max():.6f}")

# 2. Road Network and Candidate Bounds
print("\n2. Bounds (EPSG:4326):")
r_bounds = roads.total_bounds
print(f"   Full Road Network: min_lon={r_bounds[0]:.6f}, min_lat={r_bounds[1]:.6f}, max_lon={r_bounds[2]:.6f}, max_lat={r_bounds[3]:.6f}")
c_bounds = candidates.total_bounds
print(f"   Candidate Roads:   min_lon={c_bounds[0]:.6f}, min_lat={c_bounds[1]:.6f}, max_lon={c_bounds[2]:.6f}, max_lat={c_bounds[3]:.6f}")

# 3. Road geometry comparison by positional road_id
roads_reset = roads.reset_index(drop=True)
roads_reset["road_id"] = roads_reset.index
roads_utm = roads_reset.to_crs("EPSG:32721")
cand_utm = candidates.to_crs("EPSG:32721")

geom_mismatches = 0
for _, crow in cand_utm.iterrows():
    rid = int(crow["road_id"])
    c_geom = crow.geometry
    orig_geom = roads_utm.loc[rid, "geometry"]
    dist = c_geom.hausdorff_distance(orig_geom)
    if dist > 0.05:
        geom_mismatches += 1

print(f"\n3. Candidate Geometry vs Full-Network Geometry by road_id:")
print(f"   Total candidates checked: {len(candidates)}")
print(f"   Mismatches (>5cm Hausdorff distance): {geom_mismatches}")

# 4 & 5: Reconstruct movement segments and calculate intersections
clean["timestamp"] = pd.to_datetime(clean["timestamp"], errors="coerce")
clean = clean.dropna(subset=["timestamp", "longitude", "latitude"]).sort_values(
    ["individual.local.identifier (ID)", "timestamp"]
)
grouped = clean.groupby("individual.local.identifier (ID)")
clean["gap_hours"] = grouped["timestamp"].diff().dt.total_seconds() / 3600
clean["previous_lon"] = grouped["longitude"].shift()
clean["previous_lat"] = grouped["latitude"].shift()

valid = clean[
    clean["gap_hours"].between(0, 24)
    & clean["previous_lon"].notna()
    & clean["previous_lat"].notna()
].copy()
valid["segment_index"] = range(len(valid))

tracks = gpd.GeoDataFrame(
    valid,
    geometry=[
        LineString([(r.previous_lon, r.previous_lat), (r.longitude, r.latitude)])
        for r in valid.itertuples()
    ],
    crs="EPSG:4326",
).to_crs("EPSG:32721")

intersections = gpd.sjoin(
    tracks[["segment_index", "geometry"]],
    roads_utm[["road_id", "geometry"]],
    how="inner",
    predicate="intersects",
)

summary_map = dict(zip(summary["road_id"].astype(int), summary["movement_segments"].astype(int)))
cand_ids = set(candidates["road_id"].astype(int))
recalc_counts = intersections.groupby("road_id")["segment_index"].nunique().to_dict()

intersecting_candidates = [cid for cid in cand_ids if recalc_counts.get(cid, 0) > 0]
print(f"\n4. Candidate roads intersecting >= 1 movement segment: {len(intersecting_candidates)} / {len(cand_ids)}")

count_discrepancies = 0
for cid in sorted(cand_ids):
    reported = summary_map.get(cid, 0)
    calculated = recalc_counts.get(cid, 0)
    if reported != calculated:
        count_discrepancies += 1
print(f"\n5. Segment count comparison vs candidate_road_summary.csv:")
print(f"   Summary count discrepancies: {count_discrepancies}")

# 6. Intersection points distribution
inter_pts_list = []
for track_row in tracks.itertuples():
    # Only check roads that we know intersect from sjoin for performance
    relevant_road_ids = intersections[intersections["segment_index"] == track_row.segment_index]["road_id"]
    for rid in relevant_road_ids:
        road_geom = roads_utm.loc[rid, "geometry"]
        inter = track_row.geometry.intersection(road_geom)
        if not inter.is_empty:
            if isinstance(inter, Point):
                inter_pts_list.append(inter)
            elif isinstance(inter, MultiPoint):
                inter_pts_list.extend(inter.geoms)
            elif inter.geom_type in ["LineString", "MultiLineString"]:
                # If they overlap, take the centroid of the overlap
                inter_pts_list.append(inter.centroid)

inter_pts_gdf = gpd.GeoDataFrame(geometry=inter_pts_list, crs="EPSG:32721").to_crs("EPSG:4326")
pt_lons = inter_pts_gdf.geometry.x
pt_lats = inter_pts_gdf.geometry.y

first_lons = []
first_lats = []
for g in candidates.geometry:
    if g.geom_type == "LineString":
        first_lons.append(g.coords[0][0])
        first_lats.append(g.coords[0][1])
    elif g.geom_type == "MultiLineString":
        first_lons.append(g.geoms[0].coords[0][0])
        first_lats.append(g.geoms[0].coords[0][1])

print("\n6. Distribution of Intersection Points vs Candidate Road First Coordinates:")
print(f"   Actual intersection points count: {len(pt_lons)}")
if not pt_lons.empty:
    print(f"   Intersection points bounds: min_lon={pt_lons.min():.6f}, max_lon={pt_lons.max():.6f}, min_lat={pt_lats.min():.6f}, max_lat={pt_lats.max():.6f}")
print(f"   First coordinates bounds:   min_lon={min(first_lons):.6f}, max_lon={max(first_lons):.6f}, min_lat={min(first_lats):.6f}, max_lat={max(first_lats):.6f}")

# Distance from first-coord (hotspot) to nearest actual crossing point
dist_first_to_crossings = []
for _, crow in cand_utm.iterrows():
    rid = int(crow["road_id"])
    road_geom = crow.geometry
    first_pt = Point(road_geom.coords[0]) if road_geom.geom_type == "LineString" else Point(road_geom.geoms[0].coords[0])
    
    # Get all intersections for this road
    road_intersections = intersections[intersections["road_id"] == rid]
    if not road_intersections.empty:
        road_pts = []
        for s_idx in road_intersections["segment_index"]:
            track_geom = tracks.loc[tracks["segment_index"] == s_idx, "geometry"].iloc[0]
            inter = track_geom.intersection(road_geom)
            if isinstance(inter, Point):
                road_pts.append(inter)
            elif isinstance(inter, MultiPoint):
                road_pts.extend(inter.geoms)
            elif not inter.is_empty:
                road_pts.append(inter.centroid)
        
        if road_pts:
            min_d = min(first_pt.distance(p) for p in road_pts)
            dist_first_to_crossings.append(min_d)

if dist_first_to_crossings:
    print(f"   Distance from first-coord (hotspot) to nearest actual crossing point on same road:")
    print(f"   Mean distance: {sum(dist_first_to_crossings)/len(dist_first_to_crossings):.1f} m")
    print(f"   Max distance:  {max(dist_first_to_crossings):.1f} m")
    print(f"   Min distance:  {min(dist_first_to_crossings):.1f} m")
