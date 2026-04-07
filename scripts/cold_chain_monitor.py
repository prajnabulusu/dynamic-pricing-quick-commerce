"""
Simulates IoT temperature sensors in dark stores.
Logs readings every 10 minutes and raises alerts on breaches.
Breached batches get extra discount + fast-tracked for redistribution.
Command: python scripts/cold_chain_monitor.py
"""
import sys, os, random, time
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import psycopg2
import schedule
from datetime import datetime
from config import settings

random.seed()

# Required temperatures by product category
TEMP_REQUIREMENTS = {
    "Dairy":      4.0,   # must stay below 4°C
    "Fruits":     8.0,
    "Vegetables": 6.0,
    "Beverages":  10.0,
    "Snacks":     25.0,  # room temp
    "Staples":    25.0,
}

# How often temperature drifts (simulates real IoT sensor noise)
DRIFT_PROFILE = {
    "normal":   (0.0,  0.8),   # mean, std — small fluctuation
    "stressed": (1.5,  1.2),   # unit is warm, maybe power issue
    "failing":  (4.0,  2.0),   # serious cold chain failure
}


def get_conn():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host, port=settings.db_port,
    )


def get_perishable_products(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT p.product_id, p.name, c.category_name,
               pb.batch_id, pb.temperature_required,
               ds.store_id, ds.name AS store_name
        FROM perishable_batches pb
        JOIN products p     ON pb.product_id   = p.product_id
        JOIN categories c   ON p.category_id   = c.category_id
        JOIN dark_stores ds ON pb.warehouse_id  = ds.store_id
        WHERE pb.redistribution_status = 'available'
          AND pb.expiry_date >= CURRENT_DATE;
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def classify_breach(actual_temp, required_temp):
    diff = actual_temp - required_temp
    if diff <= 0:
        return False, "none"
    elif diff < 1.5:
        return True, "minor"
    elif diff < 3.0:
        return True, "major"
    else:
        return True, "critical"


def handle_breach(conn, cur, product_id, batch_id, breach_severity, product_name):
    """On critical breach — apply extra discount and fast-track redistribution."""
    if breach_severity == "critical":
        # Apply emergency discount to pricing
        cur.execute("""
            INSERT INTO pricing
                (product_id, warehouse_id, recommended_price, base_price,
                 demand_score, stock_factor, expiry_factor, final_margin,
                 price_reason)
            SELECT
                product_id,
                (SELECT warehouse_id FROM inventory
                 WHERE product_id = %s LIMIT 1),
                GREATEST(base_price * 0.40, cost_price * 1.02),
                base_price,
                0.1, 0.0, 0.60, 0.02,
                'CRITICAL cold chain breach — emergency discount'
            FROM products WHERE product_id = %s;
        """, (product_id, product_id))

        # Fast-track redistribution
        cur.execute("""
            UPDATE perishable_batches
            SET redistribution_status = 'dispatched'
            WHERE batch_id = %s;
        """, (batch_id,))

        print(f"  [CRITICAL] {product_name} — emergency discount + redistribution triggered")

    elif breach_severity == "major":
        cur.execute("""
            INSERT INTO pricing
                (product_id, warehouse_id, recommended_price, base_price,
                 demand_score, stock_factor, expiry_factor, final_margin,
                 price_reason)
            SELECT
                product_id,
                (SELECT warehouse_id FROM inventory
                 WHERE product_id = %s LIMIT 1),
                GREATEST(base_price * 0.65, cost_price * 1.02),
                base_price,
                0.1, 0.0, 0.35, 0.05,
                'Major cold chain breach — heavy discount applied'
            FROM products WHERE product_id = %s;
        """, (product_id, product_id))
        print(f"  [MAJOR]    {product_name} — heavy discount applied")


def run_temperature_check():
    now  = datetime.now()
    conn = get_conn()
    cur  = conn.cursor()

    products = get_perishable_products(conn)
    if not products:
        print(f"[{now.strftime('%H:%M:%S')}] No active perishable batches to monitor.")
        cur.close()
        conn.close()
        return

    print(f"\n[{now.strftime('%H:%M:%S')}] Cold chain check — {len(products)} batches:")

    breaches  = {"none": 0, "minor": 0, "major": 0, "critical": 0}
    readings  = []

    for pid, name, category, batch_id, temp_req, store_id, store_name in products:
        required = float(temp_req) if temp_req else TEMP_REQUIREMENTS.get(category, 8.0)

        # Simulate sensor reading with occasional stressed/failing units
        profile_name = random.choices(
            ["normal", "stressed", "failing"],
            weights=[0.80,    0.15,      0.05],
        )[0]
        drift_mean, drift_std = DRIFT_PROFILE[profile_name]
        drift         = random.gauss(drift_mean, drift_std)
        actual_temp   = round(required + drift, 2)
        breach, sev   = classify_breach(actual_temp, required)

        readings.append((pid, store_id, actual_temp, required, breach, sev))
        breaches[sev] += 1

        status_icon = (
            "OK " if not breach
            else "!" if sev == "minor"
            else "!!" if sev == "major"
            else "!!!"
        )
        print(
            f"  [{status_icon}] {name:<28} "
            f"actual={actual_temp:>5.1f}°C  "
            f"required≤{required:.1f}°C  "
            f"{store_name}  [{sev}]"
        )

        if breach and sev in ("major", "critical"):
            handle_breach(conn, cur, pid, batch_id, sev, name)

    # Bulk insert readings
    cur.executemany("""
        INSERT INTO cold_chain_logs
            (product_id, store_id, temperature_c, required_temp_c,
             breach_detected, breach_severity, logged_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s);
    """, [(r[0], r[1], r[2], r[3], r[4], r[5], now) for r in readings])

    conn.commit()

    total_breaches = breaches["minor"] + breaches["major"] + breaches["critical"]
    print(
        f"\n  Summary: {breaches['none']} OK, "
        f"{breaches['minor']} minor, "
        f"{breaches['major']} major, "
        f"{breaches['critical']} critical "
        f"({total_breaches} total breach{'es' if total_breaches != 1 else ''})"
    )

    cur.close()
    conn.close()


if __name__ == "__main__":
    print("Cold Chain Monitor started — checking every 10 minutes.\n")
    run_temperature_check()
    schedule.every(10).minutes.do(run_temperature_check)
    while True:
        schedule.run_pending()
        time.sleep(30)