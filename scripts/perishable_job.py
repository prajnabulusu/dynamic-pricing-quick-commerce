"""
Runs every 15 minutes. Checks for near-expiry perishable batches and:
  - Applies deep discount in the pricing table (expiry_factor = 0.35)
  - Creates a redistribution_request if expiry <= 1 day
Command: python scripts/perishable_job.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import schedule
import time
import psycopg2
from datetime import date, datetime
from config import settings


def get_conn():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host, port=settings.db_port,
    )


def normalize_to_date(value):
    if isinstance(value, datetime):
        return value.date()
    return value


def resolve_days_left(expiry_date, raw_days_left):
    if raw_days_left is not None:
        days_attr = getattr(raw_days_left, "days", None)
        if days_attr is not None:
            return days_attr
        if isinstance(raw_days_left, int):
            return raw_days_left

    normalized_expiry = normalize_to_date(expiry_date)
    return (normalized_expiry - date.today()).days


def run_perishable_check():
    now = date.today()
    print(f"\n[{now}] Running perishable check...")

    conn = get_conn()
    cur  = conn.cursor()

    # ── 1. Find all batches expiring within 4 days ────────────────────────────
    cur.execute("""
        SELECT
            pb.batch_id,
            pb.product_id,
            pb.warehouse_id,
            pb.quantity,
            pb.expiry_date,
            (pb.expiry_date - CURRENT_DATE) AS days_left,
            p.name,
            p.base_price,
            p.cost_price
        FROM perishable_batches pb
        JOIN products p ON pb.product_id = p.product_id
        WHERE pb.expiry_date >= CURRENT_DATE
          AND pb.expiry_date <= CURRENT_DATE + INTERVAL '4 days'
        ORDER BY pb.expiry_date ASC;
    """)
    batches = cur.fetchall()

    if not batches:
        print("  No near-expiry batches found.")
        cur.close()
        conn.close()
        return

    print(f"  Found {len(batches)} near-expiry batch(es):")

    for row in batches:
        batch_id, product_id, warehouse_id, quantity, expiry_date, \
            days_left, name, base_price, cost_price = row

        expiry_date = normalize_to_date(expiry_date)
        base_price  = float(base_price)
        cost_price  = float(cost_price)
        days_left   = resolve_days_left(expiry_date, days_left)
        # ── Determine discount depth based on days remaining ─────────────────
        if days_left <= 0:
            expiry_factor = 0.50
            reason = "Expired — marked for redistribution"
        elif days_left == 1:
            expiry_factor = 0.40
            reason = "Expiring tomorrow — deep discount"
        elif days_left == 2:
            expiry_factor = 0.25
            reason = "Expiring in 2 days — discount"
        else:
            expiry_factor = 0.10
            reason = f"Expiring in {days_left} days — small discount"

        discounted_price = max(
            round(base_price * (1 - expiry_factor), 2),
            cost_price * 1.02,    # never sell below cost
        )

        # ── Insert discounted price into pricing table ────────────────────────
        cur.execute("""
            INSERT INTO pricing
                (product_id, warehouse_id, recommended_price, base_price,
                 demand_score, stock_factor, expiry_factor, final_margin,
                 price_reason)
            VALUES (%s, %s, %s, %s, 0.1, 0.0, %s, %s, %s);
        """, (
            product_id, warehouse_id, discounted_price, base_price,
            expiry_factor,
            round((discounted_price - cost_price) / discounted_price, 4),
            reason,
        ))

        print(f"  [{days_left}d] {name:<28} Rs.{base_price:.2f} → Rs.{discounted_price:.2f}  | {reason}")

        # ── Create redistribution request if expiry <= 1 day ─────────────────
        if days_left <= 1:
            # Check if a pending request already exists for this batch
            cur.execute("""
                SELECT COUNT(*) FROM redistribution_requests
                WHERE batch_id = %s AND status = 'pending';
            """, (batch_id,))
            already_exists = cur.fetchone()[0] > 0

            if not already_exists:
                cur.execute("""
                    INSERT INTO redistribution_requests
                        (batch_id, product_id, quantity_available,
                         expiry_date, status)
                    VALUES (%s, %s, %s, %s, 'pending');
                """, (batch_id, product_id, quantity, expiry_date))
                print(f"         → Redistribution request created for {name}")

    conn.commit()

    # ── 2. Auto-dispatch pending requests to nearest partner ─────────────────
    cur.execute("""
        SELECT rr.request_id, rr.product_id, rr.quantity_available,
               rp.partner_id, rp.name AS partner_name, rp.capacity
        FROM redistribution_requests rr
        JOIN redistribution_partners rp ON TRUE   -- match any available partner
        WHERE rr.status = 'pending'
          AND rp.capacity >= rr.quantity_available
        LIMIT 5;
    """)
    pending = cur.fetchall()

    if pending:
        print(f"\n  Auto-dispatching {len(pending)} redistribution request(s):")
        for req_id, prod_id, qty, partner_id, partner_name, _ in pending:
            cur.execute("""
                INSERT INTO redistribution_dispatch
                    (request_id, partner_id, quantity_dispatched, delivery_status)
                VALUES (%s, %s, %s, 'in_transit');
            """, (req_id, partner_id, qty))

            cur.execute("""
                UPDATE redistribution_requests
                SET status = 'accepted'
                WHERE request_id = %s;
            """, (req_id,))

            print(f"  Dispatched {qty} units → {partner_name}")

    conn.commit()
    cur.close()
    conn.close()
    print("  Check complete.")


if __name__ == "__main__":
    print("Perishable scheduler started — runs every 15 minutes.")
    print("Press Ctrl+C to stop.\n")

    run_perishable_check()    # run immediately on startup

    schedule.every(15).minutes.do(run_perishable_check)

    while True:
        schedule.run_pending()
        time.sleep(30)
