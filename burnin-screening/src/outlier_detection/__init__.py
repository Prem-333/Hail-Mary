# outlier_detection — Module A: anomaly & outlier detection
#
# Public API:
#   OutlierDetector         — configurable detector class
#   run_outlier_detection() — one-call convenience wrapper

from src.outlier_detection.detector import OutlierDetector, run_outlier_detection

__all__ = ["OutlierDetector", "run_outlier_detection"]
