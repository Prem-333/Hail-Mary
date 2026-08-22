# data_generation — Synthetic burn-in data generators
#
# Public API:
#   generate_dataset()  — generate full multi-lot synthetic dataset
#   save_outputs()      — persist measurements CSV, labels CSV, limits JSON
#   plot_sample_trajectories() — create pitch-deck trajectory visualization

from src.data_generation.generate_dataset import generate_dataset, save_outputs
from src.data_generation.visualize_trajectories import plot_sample_trajectories

__all__ = ["generate_dataset", "save_outputs", "plot_sample_trajectories"]
