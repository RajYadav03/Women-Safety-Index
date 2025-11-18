import streamlit as st
import pandas as pd
import json
import numpy as np
import plotly.express as px

st.set_page_config(page_title="Delhi WSI", layout="wide")
st.title("🔒 Women Safety Index — Delhi")


AGG_JSON = "locality_aggregates.json"
GEOCODE_CSV = "localities_delhi_geocoded.csv"


with open(AGG_JSON, "r", encoding="utf-8") as f:
    agg = json.load(f)

agg_df = pd.DataFrame([{"locality": k, **v} for k, v in agg.items()])

geo_df = pd.read_csv(GEOCODE_CSV)

# Normalize names for merging
agg_df["locality_norm"] = agg_df["locality"].str.lower().str.strip()
geo_df["name_norm"] = geo_df["name"].str.lower().str.strip()

# Merge safety stats + coords
merged = agg_df.merge(
    geo_df[["name_norm", "latitude", "longitude"]],
    left_on="locality_norm",
    right_on="name_norm",
    how="left"
).drop(columns=["name_norm"])

df = merged.copy()

st.sidebar.header("Lookup Locality")
query = st.sidebar.text_input("Locality name", "Saket")
show_feature_info = st.sidebar.checkbox("Show locality stats", value=True)

if not query.strip():
    st.info("Enter a locality name to begin.")
    st.stop()

q = query.strip().lower()

match = df[df["locality_norm"] == q]

if match.empty:
    st.error("Locality not found.")
    st.stop()

row = match.iloc[0]
safety = row.get("mean_safety", np.nan)

TH_LOW = 0.4
TH_HIGH = 0.7

if pd.isna(safety):
    category = "N/A"
elif safety >= TH_HIGH:
    category = "🟢 High Safety"
elif safety >= TH_LOW:
    category = "🟡 Moderate Safety"
else:
    category = "🔴 Low Safety"

# Layout
c1, c2 = st.columns([2, 3])

with c1:
    st.subheader(f"📍 {row['locality']}")
    try:
        st.metric("Mean safety", f"{float(safety):.4f}")
    except:
        st.metric("Mean safety", "N/A")

    st.write(f"Category: **{category}**")

    if show_feature_info:
        st.write("---")
        st.write("Locality stats:")
        st.write(f"- Median safety: {row.get('median_safety','N/A')}")
        st.write(f"- Incidents analyzed: {row.get('n_incidents','N/A')}")
        st.write(f"- Mean severity: {row.get('mean_severity','N/A')}")
        st.write(f"- Median lighting: {row.get('median_lighting','N/A')}")
        st.write(f"- Median crowd: {row.get('median_crowd','N/A')}")

with c2:
    lat = row["latitude"]
    lon = row["longitude"]
    st.write("### Locality Map")
    st.map(pd.DataFrame({"lat": [lat], "lon": [lon]}))

st.write("---")
left, right = st.columns(2)

with left:
    st.write("### 10 Lowest Safety Localities")
    worst = df.sort_values("mean_safety").head(10)[["locality", "mean_safety", "n_incidents"]]
    st.table(worst.reset_index(drop=True))

with right:
    st.write("### 10 Highest Safety Localities")
    best = df.sort_values("mean_safety", ascending=False).head(10)[["locality", "mean_safety", "n_incidents"]]
    st.table(best.reset_index(drop=True))
