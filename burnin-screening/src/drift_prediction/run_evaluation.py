"""Quick script to train Module B on generated data, print metrics, and save artifacts."""
import pandas as pd
from src.drift_prediction.predictor import DriftPredictor

# Load generated data
measurements = pd.read_csv("data/generated/burnin_measurements.csv")
labels = pd.read_csv("data/generated/burnin_labels.csv")

# Train
print("Training drift predictor...")
predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=42)
predictor.fit(measurements)

# Evaluate
metrics = predictor.evaluate(measurements, labels)
print("\n=== Evaluation Metrics ===")
for param, m in metrics.items():
    print(f"\n{param}:")
    for k, v in m.items():
        print(f"  {k}: {v}")

# Flag
flags = predictor.flag_for_rejection(measurements)
merged = flags.merge(labels[["component_id", "defect_type"]], on="component_id")

print("\n=== Safety-Slope Flagging ===")
for dtype in ["normal", "latent", "obvious"]:
    subset = merged[merged["defect_type"] == dtype]
    rate = subset["flagged_for_rejection"].mean() if len(subset) > 0 else 0
    print(f"  {dtype}: {subset['flagged_for_rejection'].sum()}/{len(subset)} flagged ({rate:.1%})")

# Save artifacts
predictor.save("data/generated/models")
predictor.plot_feature_importance("docs/module_b_feature_importance.png")
print("\nDone.")
