"""
Populates all master data tables with Indian context data.
Run this ONCE before starting the producer.
Command: python scripts/seed_data.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import psycopg2
from config import settings

conn = psycopg2.connect(
    dbname=settings.db_name, user=settings.db_user,
    password=settings.db_password, host=settings.db_host, port=settings.db_port,
)
cur = conn.cursor()

print("Seeding database with Indian context data...\n")

# ── 1. Categories ─────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM categories;")
if cur.fetchone()[0] == 0:
    cur.executemany(
        "INSERT INTO categories (category_name) VALUES (%s);",
        [("Dairy",), ("Fruits",), ("Vegetables",),
         ("Staples",), ("Snacks",), ("Beverages",)],
    )
    print("  Inserted 6 categories")
else:
    print("  Categories already exist — skipping")

conn.commit()

# ── 2. Warehouses ─────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM warehouses;")
if cur.fetchone()[0] == 0:
    cur.executemany(
        "INSERT INTO warehouses (location, capacity) VALUES (%s, %s);",
        [
            ("Hyderabad Warehouse", 10000),
            ("Bangalore Warehouse", 8000),
            ("Chennai Warehouse",   7000),
        ],
    )
    print("  Inserted 3 warehouses")
else:
    print("  Warehouses already exist — skipping")

conn.commit()

# ── 3. Locations ──────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM locations;")
if cur.fetchone()[0] == 0:
    cur.executemany(
        "INSERT INTO locations (city, region) VALUES (%s, %s);",
        [
            ("Hyderabad", "Telangana"),
            ("Bangalore", "Karnataka"),
            ("Chennai",   "Tamil Nadu"),
            ("Mumbai",    "Maharashtra"),
            ("Delhi",     "Delhi"),
        ],
    )
    print("  Inserted 5 locations")
else:
    print("  Locations already exist — skipping")

conn.commit()

# ── 4. Products ───────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM products;")
if cur.fetchone()[0] == 0:
    # Fetch category IDs
    cur.execute("SELECT category_id, category_name FROM categories;")
    cat = {name: cid for cid, name in cur.fetchall()}

    products = [
        # (name, category, brand, base_price, cost_price, shelf_life_days, is_perishable)
        # Dairy
        ("Amul Milk 1L",             "Dairy",      "Amul",         60,  45,   3, True),
        ("Mother Dairy Curd 500g",   "Dairy",      "Mother Dairy", 40,  28,   5, True),
        ("Amul Butter 100g",         "Dairy",      "Amul",         55,  38,  15, True),
        ("Amul Paneer 200g",         "Dairy",      "Amul",         90,  65,   7, True),
        # Fruits
        ("Banana 1 dozen",           "Fruits",     "Local Farm",   50,  30,   4, True),
        ("Apple 1kg",                "Fruits",     "Kashmir Fresh",180, 120, 10, True),
        ("Mango 1kg",                "Fruits",     "Local Farm",   120, 80,   5, True),
        ("Grapes 500g",              "Fruits",     "Local Farm",   80,  55,   6, True),
        # Vegetables
        ("Tomato 1kg",               "Vegetables", "Local Farm",   30,  18,   3, True),
        ("Potato 1kg",               "Vegetables", "Local Farm",   25,  15,  10, True),
        ("Onion 1kg",                "Vegetables", "Local Farm",   35,  20,   7, True),
        ("Spinach 250g",             "Vegetables", "Local Farm",   20,  12,   2, True),
        # Staples
        ("Aashirvaad Atta 5kg",      "Staples",    "ITC",          280, 240, 180, False),
        ("India Gate Basmati 5kg",   "Staples",    "India Gate",   450, 380, 365, False),
        ("Toor Dal 1kg",             "Staples",    "Local Brand",  130, 100, 180, False),
        ("Sunflower Oil 1L",         "Staples",    "Fortune",      140, 110, 365, False),
        # Snacks
        ("Lays Chips 100g",          "Snacks",     "PepsiCo",      20,  12,  120, False),
        ("Haldirams Mixture 200g",   "Snacks",     "Haldirams",    60,  40,   90, False),
        ("Britannia Biscuits 100g",  "Snacks",     "Britannia",    30,  20,  180, False),
        # Beverages
        ("Tropicana Juice 1L",       "Beverages",  "PepsiCo",      99,  70,   30, True),
        ("Coca Cola 2L",             "Beverages",  "Coca Cola",    80,  55,   90, False),
        ("Bisleri Water 1L",         "Beverages",  "Bisleri",      20,  10,  365, False),
    ]

    for p in products:
        name, cat_name, brand, base_price, cost_price, shelf_life, is_perishable = p
        cur.execute(
            """INSERT INTO products
               (name, category_id, brand, base_price, cost_price,
                shelf_life_days, is_perishable)
               VALUES (%s, %s, %s, %s, %s, %s, %s);""",
            (name, cat[cat_name], brand, base_price, cost_price,
             shelf_life, is_perishable),
        )
    print(f"  Inserted {len(products)} products")
else:
    print("  Products already exist — skipping")

conn.commit()

# ── 5. Inventory ──────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM inventory;")
if cur.fetchone()[0] == 0:
    cur.execute("SELECT product_id FROM products ORDER BY product_id;")
    product_ids = [row[0] for row in cur.fetchall()]

    cur.execute("SELECT warehouse_id FROM warehouses ORDER BY warehouse_id;")
    warehouse_ids = [row[0] for row in cur.fetchall()]

    import random
    random.seed(42)
    inventory_rows = []
    for pid in product_ids:
        wid = random.choice(warehouse_ids)
        stock = random.randint(50, 300)
        inventory_rows.append((pid, wid, stock, 0, 20))

    cur.executemany(
        """INSERT INTO inventory
           (product_id, warehouse_id, stock_quantity, reserved_quantity, reorder_level)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (product_id, warehouse_id) DO NOTHING;""",
        inventory_rows,
    )
    print(f"  Inserted {len(inventory_rows)} inventory records")
else:
    print("  Inventory already exists — skipping")

conn.commit()

# ── 6. Perishable batches ─────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM perishable_batches;")
if cur.fetchone()[0] == 0:
    cur.execute("""
        SELECT p.product_id, i.warehouse_id
        FROM products p
        JOIN inventory i ON p.product_id = i.product_id
        WHERE p.is_perishable = TRUE;
    """)
    perishables = cur.fetchall()

    import random
    from datetime import date, timedelta
    random.seed(99)
    batches = []
    for pid, wid in perishables:
        days_to_expiry = random.randint(1, 10)
        batches.append((pid, wid, random.randint(20, 80),
                        date.today() + timedelta(days=days_to_expiry)))

    cur.executemany(
        """INSERT INTO perishable_batches
           (product_id, warehouse_id, quantity, expiry_date)
           VALUES (%s, %s, %s, %s);""",
        batches,
    )
    print(f"  Inserted {len(batches)} perishable batches")
else:
    print("  Perishable batches already exist — skipping")

conn.commit()

# ── 7. Redistribution partners ────────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM redistribution_partners;")
if cur.fetchone()[0] == 0:
    cur.executemany(
        """INSERT INTO redistribution_partners
           (name, type, location, contact_details, capacity)
           VALUES (%s, %s, %s, %s, %s);""",
        [
            ("Blue Cross Animal Shelter", "animal_shelter",
             "Hyderabad", "9876543210", 200),
            ("People For Animals NGO",    "NGO",
             "Bangalore", "9123456780", 300),
            ("Chennai SPCA",              "animal_shelter",
             "Chennai",   "9988776655", 150),
            ("Robin Hood Army",           "NGO",
             "Hyderabad", "9090909090", 500),
        ],
    )
    print("  Inserted 4 redistribution partners")
else:
    print("  Partners already exist — skipping")

conn.commit()

# ── Summary ───────────────────────────────────────────────────────────────────
print()
for table in ["categories", "warehouses", "locations", "products",
              "inventory", "perishable_batches", "redistribution_partners"]:
    cur.execute(f"SELECT COUNT(*) FROM {table};")
    print(f"  {table:<30} {cur.fetchone()[0]:>4} rows")

cur.close()
conn.close()
print("\nDatabase seeded successfully. You can now run the producer.")