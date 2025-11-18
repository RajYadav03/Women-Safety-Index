import json
import numpy as np
import pandas as pd
import xgboost as xgb
from difflib import get_close_matches


MODEL_PATH = "xgboost_wsi_model.json"
LOCALITY_CSV = "synthetic_wsi_delhi_engineered.csv"

print("🔍 Loading model and data...")


booster = xgb.Booster()
booster.load_model(MODEL_PATH)


df = pd.read_csv(LOCALITY_CSV)

# pick numeric feature columns (exclude target and non-numeric)
feature_cols = [c for c in df.columns if c != "safety_index" and df[c].dtype != object]

# keep a numeric dataframe plus locality name for grouping
numeric_df = df[feature_cols + ["locality"]].copy()

# create a per-locality profile (mean of numeric features)
zone_profiles = (
    numeric_df.groupby("locality")
    .mean()
    .reset_index()
)
known_localities = zone_profiles["locality"].tolist()

print(f"Loaded model and {len(known_localities)} Delhi localities.")



def find_locality(name, cutoff=0.6):
    name_lower = name.strip().lower()
    for loc in known_localities:
        if loc.lower() == name_lower:
            return loc
    matches = get_close_matches(name_lower, [l.lower() for l in known_localities], n=1, cutoff=cutoff)
    if matches:
        matched_lower = matches[0]
        for loc in known_localities:
            if loc.lower() == matched_lower:
                return loc
    return None

while True:
    user_input = input("\nEnter Delhi locality name (or 'exit' to quit): ").strip()
    if user_input.lower() in ("exit", "quit"):
        print("Exiting.")
        break

    matched = find_locality(user_input)
    if not matched:
        print("Locality not found. Try again (check spelling).")
        continue

    # get the locality feature row (averaged profile)
    zone_row = zone_profiles.loc[zone_profiles["locality"] == matched, feature_cols]

    # build DMatrix and predict using the loaded booster
    dmat = xgb.DMatrix(zone_row, feature_names=feature_cols)
    pred = float(booster.predict(dmat)[0])
    pred = np.clip(pred, 0, 1)

    # simple categorization
    if pred < 0.33:
        level = "🔴 High Risk"
    elif pred < 0.66:
        level = "🟡 Moderate Safety"
    else:
        level = "🟢 Safe Zone"

    print(f"\n📍 Locality: {matched}")
    print(f"   Predicted Safety Index: {pred:.3f}")
    print(f"   Category: {level}")
