# LATENT project documentation

The main document is the **[9-page project documentation PDF](LATENT_Project_Documentation.pdf)**. An **[editable Markdown edition](LATENT_Project_Documentation.md)** contains the text, tables and descriptions of the figures. The PDF includes orbital artwork, vector diagrams, charts, page bookmarks and linked public references.

The document presents the project for general and technical audiences. It covers the problem, system architecture, data and methods, a worked component assessment, a visual simulator demonstration, verified results, implementation, potential operational value and references.

## Evidence snapshot

The documentation uses the current 15,142-component, 20-lot synthetic dataset. It does not reuse the older 38,018-component results from `results/metrics.md`.

- [verification_evidence.json](verification_evidence.json): input hashes, package versions, full-cycle anomaly metrics, a final-limit baseline, forecast metrics, a separate lot-wise holdout experiment and the selected component report.
- [verification_tests.txt](verification_tests.txt): the successful repository test run, 36 passed, including one placeholder test.
- [verify_evidence.py](verify_evidence.py): the evaluation script, portable within this repository.
- [simulation_demo.json](simulation_demo.json): actual local API requests and responses used in the two-scenario visual demonstration.

To repeat the evidence calculation from the project root with the project's Python dependencies installed:

```powershell
python -m pytest tests -q
python docs/submission/verify_evidence.py
```

The script reads `data/generated/burnin_measurements.csv` and `burnin_labels.csv`, then writes a new `evidence.json` next to the script. It preserves the submitted `verification_evidence.json`. The script includes both in-sample diagnostics and a separate `GroupShuffleSplit` evaluation using five unseen lots; their scopes are identified in the document.

Use the recorded package versions for closer numerical reproduction. New datasets, library versions or code revisions can change results. The current case identifier is `LOT_009_C0374`.

All measured results in this document concern synthetic data. The simulator illustration shows model responses to recorded and hypothetical early readings. It does not represent physical test outcomes.
