# Burn-In Screening: Component Reliability Screening System

A machine-learning-driven system for **latent defect detection** during electronic component burn-in testing. Burn-in testing subjects components to elevated thermal and electrical stress to precipitate early-life failures before deployment. However, traditional pass/fail thresholds miss subtle parametric anomalies that signal latent defects — components that survive burn-in but degrade prematurely in the field. This project applies outlier detection, drift prediction, and explainable AI to time-series sensor data captured during burn-in cycles, enabling manufacturers to identify at-risk components that conventional screening overlooks and reduce costly field returns.

---

## Project Structure

```
burnin-screening
├── data
│   ├── raw                    # Raw burn-in sensor data
│   └── generated              # Synthetic / processed datasets
├── src
│   ├── data_generation        # Synthetic data generators
│   ├── outlier_detection      # Module A — anomaly & outlier detection
│   ├── drift_prediction       # Module B — parametric drift forecasting
│   ├── explainability         # SHAP-based model interpretability
│   └── evaluation             # Metrics, benchmarks, reporting
├── dashboard                  # Streamlit interactive dashboard
├── tests                      # pytest test suite
├── notebooks                  # Jupyter exploration notebooks
├── docs                       # Documentation & references
├── requirements.txt
├── README.md
└── .gitignore
```

---

## Getting Started

### Prerequisites

- **Python 3.11** (ensure it is available as `python` or `python3.11` on your PATH)
- **Git**

### 1. Clone the repository

```bash
git clone <repository-url>
cd burnin-screening
```

### 2. Create and activate a virtual environment

```bash
# Create
python -m venv .venv

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate (macOS / Linux)
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run tests

```bash
pytest tests/
```

### 5. Launch the dashboard

```bash
streamlit run dashboard/app.py
```

---

## License

TBD
