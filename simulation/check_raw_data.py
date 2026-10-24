import pandas as pd
from pathlib import Path

ROOT = Path.cwd()
RAW_CSV = ROOT / "app" / "public" / "data" / "jaguar_movement_data.csv"

df = pd.read_csv(RAW_CSV)
print(f"Total raw observations: {len(df)}")
# Check column names
print(f"Columns: {df.columns.tolist()}")

# Assuming standard column names from previous errors or standard Movebank format
lon_col = 'location.long' if 'location.long' in df.columns else 'longitude'
lat_col = 'location.lat' if 'location.lat' in df.columns else 'latitude'

print(f"Raw GPS bounds: lon={df[lon_col].min():.6f} to {df[lon_col].max():.6f}, lat={df[lat_col].min():.6f} to {df[lat_col].max():.6f}")

study_col = 'study.name' if 'study.name' in df.columns else 'study_name'
studies = df[study_col].unique()
print(f"Number of studies: {len(studies)}")
print(f"Studies: {studies}")

hc_df = df[df[study_col] == "Humid Chaco"]
print(f"Humid Chaco observations: {len(hc_df)}")
print(f"Humid Chaco bounds: lon={hc_df[lon_col].min():.6f} to {hc_df[lon_col].max():.6f}, lat={hc_df[lat_col].min():.6f} to {hc_df[lat_col].max():.6f}")
