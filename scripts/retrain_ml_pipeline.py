"""
Rebuilds the demand model end-to-end:
1) feature engineering from live DB
2) model training and artifact save

Command:
    python scripts/retrain_ml_pipeline.py
"""
import os
import subprocess
import sys


ROOT = os.path.dirname(os.path.dirname(__file__))


def run_step(args: list[str]) -> None:
    print(f"\n>> Running: {' '.join(args)}")
    completed = subprocess.run(args, cwd=ROOT)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


if __name__ == "__main__":
    print("=" * 56)
    print("  Rebuilding Demand ML Pipeline")
    print("=" * 56)
    run_step([sys.executable, "ml/training/feature_engineering.py"])
    run_step([sys.executable, "ml/training/train_model.py"])
    print("\nModel rebuild complete.")
