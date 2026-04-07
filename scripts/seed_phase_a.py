"""
Seeds Phase A tables with realistic Indian quick commerce data.
Command: python scripts/seed_phase_a.py
"""
import sys, os, random
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
import psycopg2
from datetime import date, datetime, timedelta
from config import settings

random.seed(42)
conn = psycopg2.connect(
    dbname=settings.db_name, user=settings.db_user,
    password=settings.db_password, host=settings.db_host, port=settings.db_port,
)
cur = conn.cursor()
print("Seeding Phase A data...\n")

# ── 1. Dark stores ─────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM dark_stores;")
if cur.fetchone()[0] == 0:
    stores = [
        ("Banjara Hills Dark Store",   "Hyderabad", 17.4156, 78.4480, 2.5, 10),
        ("Madhapur Dark Store",        "Hyderabad", 17.4486, 78.3908, 3.0, 12),
        ("Koramangala Dark Store",     "Bangalore",  12.9352, 77.6245, 2.0, 11),
        ("Indiranagar Dark Store",     "Bangalore",  12.9784, 77.6408, 2.5, 13),
        ("Anna Nagar Dark Store",      "Chennai",    13.0850, 80.2101, 3.0, 14),
        ("T Nagar Dark Store",         "Chennai",    13.0418, 80.2341, 2.0, 10),
        ("Bandra Dark Store",          "Mumbai",     19.0596, 72.8295, 2.5, 15),
        ("Connaught Place Dark Store", "Delhi",      28.6315, 77.2167, 3.0, 12),
    ]
    cur.executemany("""
        INSERT INTO dark_stores
            (name, city, latitude, longitude, radius_km, avg_delivery_mins)
        VALUES (%s,%s,%s,%s,%s,%s);
    """, stores)
    print(f"  Inserted {len(stores)} dark stores")
else:
    print("  Dark stores already exist — skipping")
conn.commit()

# ── 2. Delivery slots (next 4 hours, every 30 mins, for each store) ───────────
cur.execute("SELECT COUNT(*) FROM delivery_slots;")
if cur.fetchone()[0] == 0:
    cur.execute("SELECT store_id FROM dark_stores;")
    store_ids = [r[0] for r in cur.fetchall()]
    now   = datetime.now().replace(minute=0, second=0, microsecond=0)
    slots = []
    for sid in store_ids:
        for h in range(8):                      # 4 hours × 2 slots/hr
            slot_time    = now + timedelta(minutes=30*h)
            booked       = random.randint(0, 45)
            surge_factor = round(1.0 + (booked / 50) * 0.5, 2)  # up to 1.5×
            slots.append((sid, slot_time, 50, booked, surge_factor))
    cur.executemany("""
        INSERT INTO delivery_slots
            (store_id, slot_time, capacity, booked, surge_factor)
        VALUES (%s,%s,%s,%s,%s);
    """, slots)
    print(f"  Inserted {len(slots)} delivery slots")
else:
    print("  Delivery slots already exist — skipping")
conn.commit()

# ── 3. Competitor prices ────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM competitor_prices;")
if cur.fetchone()[0] == 0:
    cur.execute("SELECT product_id, base_price FROM products;")
    products = cur.fetchall()
    competitors = ["Blinkit", "Zepto", "Swiggy Instamart", "BigBasket Now"]
    rows = []
    for pid, base_price in products:
        base = float(base_price)
        for comp in competitors:
            # Competitors price within ±15% of our base price
            variation = random.uniform(-0.12, 0.15)
            their_price = round(base * (1 + variation), 2)
            rows.append((pid, comp, their_price))
    cur.executemany("""
        INSERT INTO competitor_prices (product_id, competitor_name, their_price)
        VALUES (%s,%s,%s);
    """, rows)
    print(f"  Inserted {len(rows)} competitor price records")
else:
    print("  Competitor prices already exist — skipping")
conn.commit()

# ── 4. Product view stats (initialise one row per product) ────────────────────
cur.execute("SELECT COUNT(*) FROM product_view_stats;")
if cur.fetchone()[0] == 0:
    cur.execute("SELECT product_id FROM products;")
    pids = [r[0] for r in cur.fetchall()]
    rows = [(pid, random.randint(0,8), random.randint(5,40),
             random.randint(0,10), random.randint(0,3),
             round(random.uniform(0.1,0.5), 4))
            for pid in pids]
    cur.executemany("""
        INSERT INTO product_view_stats
            (product_id, views_last_5min, views_last_1hr,
             cart_adds_1hr, abandons_1hr, intensity_score)
        VALUES (%s,%s,%s,%s,%s,%s);
    """, rows)
    print(f"  Inserted {len(rows)} product view stat rows")
else:
    print("  Product view stats already exist — skipping")
conn.commit()

# ── 5. Cold chain logs (for perishables) ──────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM cold_chain_logs;")
if cur.fetchone()[0] == 0:
    cur.execute("""
        SELECT p.product_id, p.shelf_life_days
        FROM products p WHERE p.is_perishable = TRUE;
    """)
    perishables = cur.fetchall()
    cur.execute("SELECT store_id FROM dark_stores LIMIT 4;")
    store_ids = [r[0] for r in cur.fetchall()]

    logs = []
    for pid, _ in perishables:
        sid          = random.choice(store_ids)
        required     = 4.0 if _ and _ <= 5 else 8.0   # dairy needs colder
        for h in range(6):                              # 6 readings over 3 hrs
            temp    = round(required + random.uniform(-1.5, 3.0), 2)
            breach  = temp > required + 2.0
            severity = ("critical" if temp > required + 4
                        else "major" if temp > required + 2.5
                        else "minor" if breach else "none")
            logs.append((pid, sid, temp, required, breach, severity,
                         datetime.now() - timedelta(minutes=30*h)))
    cur.executemany("""
        INSERT INTO cold_chain_logs
            (product_id, store_id, temperature_c, required_temp_c,
             breach_detected, breach_severity, logged_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s);
    """, logs)
    print(f"  Inserted {len(logs)} cold chain log entries")
else:
    print("  Cold chain logs already exist — skipping")
conn.commit()

# ── 6. Enhance existing perishable_batches with new columns ───────────────────
cur.execute("""
    SELECT batch_id, product_id, expiry_date, quantity
    FROM perishable_batches
    WHERE batch_code IS NULL;
""")
batches = cur.fetchall()
if batches:
    for batch_id, pid, expiry, qty in batches:
        mfg_date = expiry - timedelta(days=random.randint(3, 10))
        batch_code = f"B{pid:03d}-{mfg_date.strftime('%m%d')}"
        days_left  = (expiry - date.today()).days
        fefo       = max(1, days_left)
        temp_req   = round(random.choice([4.0, 6.0, 8.0]), 1)
        kg_saved   = round(float(qty) * 0.25, 2)   # assume 250g average unit
        co2_offset = round(kg_saved * 2.5, 2)       # 2.5kg CO2 per kg food saved
        cur.execute("""
            UPDATE perishable_batches
            SET batch_code=(%s), manufacture_date=(%s),
                temperature_required=(%s), fefo_priority=(%s),
                kg_saved=(%s), co2_offset_kg=(%s)
            WHERE batch_id=(%s);
        """, (batch_code, mfg_date, temp_req, fefo, kg_saved, co2_offset, batch_id))
    conn.commit()
    print(f"  Enhanced {len(batches)} perishable batches with FEFO + impact data")
else:
    print("  Perishable batches already enhanced — skipping")

# ── 7. Social impact seed row ──────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM social_impact WHERE report_date = CURRENT_DATE;")
if cur.fetchone()[0] == 0:
    cur.execute("""
        INSERT INTO social_impact
            (report_date, total_kg_saved, total_co2_offset,
             meals_equivalent, partner_dispatches, revenue_recovered)
        VALUES (CURRENT_DATE, 0, 0, 0, 0, 0);
    """)
    conn.commit()
    print("  Created today's social impact row")

# ── Summary ────────────────────────────────────────────────────────────────────
print()
for table in ["dark_stores","delivery_slots","competitor_prices",
              "product_view_stats","cold_chain_logs","social_impact"]:
    cur.execute(f"SELECT COUNT(*) FROM {table};")
    print(f"  {table:<30} {cur.fetchone()[0]:>4} rows")

cur.close()
conn.close()
print("\nPhase A seed complete.")