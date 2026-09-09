import numpy as np
import pandas as pd
import sys
sys.path.insert(0, '.')

from src.data_generation.generate_dataset import generate_lot
from src.outlier_detection.detector import OutlierDetector

rng = np.random.default_rng(42)

# Generate a single lot with 7% latent + 5% obvious = 12% total defects
measurements, labels = generate_lot(
    lot_id='TEST_LOT_001',
    num_units=300,
    latent_rate=0.07,
    obvious_rate=0.05,
    rng=rng
)

mdf = pd.DataFrame(measurements)
ldf = pd.DataFrame(labels)

print(f"Total components: {ldf['component_id'].nunique()}")
print(f"Defect counts: {ldf['defect_type'].value_counts().to_dict()}")

# Run detection
detector = OutlierDetector(z_threshold=3.5, contamination=0.05)
results = detector.detect(mdf)

# Merge with labels
merged = results.merge(ldf[['component_id', 'defect_type']], on='component_id')

# Count what happened
print()
print("=== MODULE A RESULTS BY DEFECT TYPE ===")
for dtype in ['normal', 'latent', 'obvious']:
    sub = merged[merged['defect_type'] == dtype]
    n_flagged = int(sub['is_anomalous'].sum())
    n_total = len(sub)
    passed = n_total - n_flagged
    print(f"{dtype.upper():10s}: {n_total:3d} total  |  {n_flagged:3d} flagged  |  {passed:3d} passed (shown as Normal in UI)")

print()
print("=== OBVIOUS THAT PASSED (shown as Normal in Module A) ===")
obvious_passed = merged[(merged['defect_type'] == 'obvious') & (~merged['is_anomalous'])]
if obvious_passed.empty:
    print("None — all obvious defects were correctly flagged by Module A.")
else:
    print(f"COUNT: {len(obvious_passed)} obvious defects passed through Module A and show as 'Normal'")
    # Show their anomaly scores and actual readings
    for cid in obvious_passed['component_id'].tolist():
        row = obvious_passed[obvious_passed['component_id'] == cid].iloc[0]
        cd = mdf[(mdf['component_id'] == cid) & (mdf['param_name'] == 'leakage_current_uA')]
        if not cd.empty:
            v0 = cd.iloc[0]['value_0h']
            v168 = cd.iloc[0]['value_168h']
            print(f"  {cid}: score={row['anomaly_score']:.3f}, robust_z={row['robust_z_score']:.2f}, iso={row['isolation_score']:.3f}")
            print(f"         leak_0h={v0:.1f}uA  leak_168h={v168:.1f}uA  (limit=50uA)")
        triggered = row['triggered_by']
        print(f"         triggered_by={triggered}")

print()
print("=== WHY? Check isolation forest contamination cap ===")
print(f"Contamination=0.05 means Isolation Forest HARD CAPS flagging at 5% of lot")
n_iso_flagged = merged[merged['triggered_by'].apply(lambda x: any('isolation_forest' in str(t) for t in x))].shape[0]
n_z_flagged = merged[merged['triggered_by'].apply(lambda x: any('robust_z' in str(t) for t in x))].shape[0]
print(f"Z-score flagged: {n_z_flagged}")
print(f"Isolation Forest flagged: {n_iso_flagged}")
print(f"Total flagged (OR): {int(merged['is_anomalous'].sum())}")
print(f"Total defects: {(ldf['defect_type'] != 'normal').sum()}")
