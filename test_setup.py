"""
Run this script to verify your Milestone 2 setup is correct.
Command: python test_setup.py
"""
import sys

print("=" * 50)
print("  Milestone 2 — Setup Verification")
print("=" * 50)

errors = []

# 1. Check Python version
print(f"\n[1] Python version: {sys.version}")
if sys.version_info < (3, 10):
    errors.append("Python 3.10+ required")
else:
    print("    OK")

# 2. Check all libraries import
print("\n[2] Checking libraries...")
libs = [
    ("fastapi", "FastAPI"),
    ("uvicorn", "Uvicorn"),
    ("sqlalchemy", "SQLAlchemy"),
    ("psycopg2", "Psycopg2"),
    ("kafka", "Kafka-Python"),
    ("xgboost", "XGBoost"),
    ("sklearn", "Scikit-learn"),
    ("pandas", "Pandas"),
    ("numpy", "NumPy"),
    ("joblib", "Joblib"),
    ("schedule", "Schedule"),
    ("dotenv", "Python-dotenv"),
    ("pydantic", "Pydantic"),
]

for module, name in libs:
    try:
        __import__(module)
        print(f"    {name} — OK")
    except ImportError:
        print(f"    {name} — MISSING")
        errors.append(f"{name} not installed")

# 3. Check config loads
print("\n[3] Checking config...")
try:
    from config import settings
    print(f"    DB Host     : {settings.db_host}")
    print(f"    DB Port     : {settings.db_port}")
    print(f"    DB Name     : {settings.db_name}")
    print(f"    Kafka Server: {settings.kafka_bootstrap_servers}")
    print("    Config — OK")
except Exception as e:
    print(f"    Config — FAILED: {e}")
    errors.append("Config load failed")

# 4. Check PostgreSQL connection
print("\n[4] Checking PostgreSQL connection...")
try:
    import psycopg2
    from config import settings
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM products;")
    count = cursor.fetchone()[0]
    conn.close()
    print(f"    Connected! Products in DB: {count}")
    print("    PostgreSQL — OK")
except Exception as e:
    print(f"    PostgreSQL — FAILED: {e}")
    errors.append("PostgreSQL connection failed")

# 5. Summary
print("\n" + "=" * 50)
if errors:
    print("  Issues found:")
    for e in errors:
        print(f"  - {e}")
    print("\n  Fix the issues above before moving to Milestone 3.")
else:
    print("  All checks passed! Ready for Milestone 3.")
print("=" * 50)