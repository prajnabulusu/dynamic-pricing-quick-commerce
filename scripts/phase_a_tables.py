"""
Phase A migration — adds new tables for real-time demand tracking,
dark stores, competitor prices, and enhanced perishable tracking.
Command: python scripts/phase_a_tables.py
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
import psycopg2
from config import settings

conn = psycopg2.connect(
    dbname=settings.db_name, user=settings.db_user,
    password=settings.db_password, host=settings.db_host, port=settings.db_port,
)
cur = conn.cursor()
print("Running Phase A migration...\n")

migrations = [

# ── 1. Dark stores (Blinkit/Zepto style hyperlocal warehouses) ────────────────
("""
CREATE TABLE IF NOT EXISTS dark_stores (
    store_id          SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    city              VARCHAR(100),
    latitude          NUMERIC(9,6),
    longitude         NUMERIC(9,6),
    radius_km         NUMERIC(4,1) DEFAULT 3.0,
    avg_delivery_mins INT          DEFAULT 12,
    is_active         BOOLEAN      DEFAULT TRUE,
    created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
""", "dark_stores"),

# ── 2. Delivery slots with surge factor ───────────────────────────────────────
("""
CREATE TABLE IF NOT EXISTS delivery_slots (
    slot_id        SERIAL PRIMARY KEY,
    store_id       INT REFERENCES dark_stores(store_id),
    slot_time      TIMESTAMP NOT NULL,
    capacity       INT       DEFAULT 50,
    booked         INT       DEFAULT 0,
    surge_factor   NUMERIC(4,2) DEFAULT 1.0,
    is_available   BOOLEAN   DEFAULT TRUE
);
""", "delivery_slots"),

# ── 3. Real-time demand events (every click, view, cart action) ───────────────
("""
CREATE TABLE IF NOT EXISTS demand_events (
    event_id         BIGSERIAL PRIMARY KEY,
    product_id       INT REFERENCES products(product_id),
    event_type       VARCHAR(30) CHECK (event_type IN (
                         'view', 'cart_add', 'cart_abandon',
                         'purchase', 'wishlist', 'share'
                     )),
    session_id       VARCHAR(64),
    location_id      INT REFERENCES locations(location_id),
    intensity_score  NUMERIC(5,4) DEFAULT 0.0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""", "demand_events"),

# ── index for fast recent-event lookups ───────────────────────────────────────
("""
CREATE INDEX IF NOT EXISTS idx_demand_events_product_time
    ON demand_events(product_id, created_at DESC);
""", "idx_demand_events"),

# ── 4. Live product view counters (rolling 5-min window) ─────────────────────
("""
CREATE TABLE IF NOT EXISTS product_view_stats (
    product_id        INT PRIMARY KEY REFERENCES products(product_id),
    views_last_5min   INT          DEFAULT 0,
    views_last_1hr    INT          DEFAULT 0,
    cart_adds_1hr     INT          DEFAULT 0,
    abandons_1hr      INT          DEFAULT 0,
    intensity_score   NUMERIC(5,4) DEFAULT 0.0,
    last_updated      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
""", "product_view_stats"),

# ── 5. Competitor prices (simulated Blinkit / Zepto / Swiggy Instamart) ───────
("""
CREATE TABLE IF NOT EXISTS competitor_prices (
    comp_price_id   SERIAL PRIMARY KEY,
    product_id      INT REFERENCES products(product_id),
    competitor_name VARCHAR(50) CHECK (competitor_name IN (
                        'Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket Now'
                    )),
    their_price     NUMERIC(10,2),
    scraped_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""", "competitor_prices"),

("""
CREATE INDEX IF NOT EXISTS idx_comp_prices_product
    ON competitor_prices(product_id, scraped_at DESC);
""", "idx_comp_prices"),

# ── 6. Cold chain monitoring (temperature logs for perishables) ───────────────
("""
CREATE TABLE IF NOT EXISTS cold_chain_logs (
    log_id           SERIAL PRIMARY KEY,
    product_id       INT  REFERENCES products(product_id),
    store_id         INT  REFERENCES dark_stores(store_id),
    temperature_c    NUMERIC(5,2),
    required_temp_c  NUMERIC(5,2),
    breach_detected  BOOLEAN   DEFAULT FALSE,
    breach_severity  VARCHAR(20) CHECK (breach_severity IN
                         ('none','minor','major','critical')),
    logged_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""", "cold_chain_logs"),

# ── 7. Enhance perishable_batches with FEFO and social impact columns ─────────
("""
ALTER TABLE perishable_batches
    ADD COLUMN IF NOT EXISTS batch_code          VARCHAR(30),
    ADD COLUMN IF NOT EXISTS manufacture_date    DATE,
    ADD COLUMN IF NOT EXISTS temperature_required NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS fefo_priority       INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS kg_saved            NUMERIC(8,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS co2_offset_kg       NUMERIC(8,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS redistribution_status VARCHAR(20)
        DEFAULT 'available'
        CHECK (redistribution_status IN (
            'available','discounting','dispatched','wasted'
        ));
""", "perishable_batches (enhanced)"),

# ── 8. Social impact summary table ────────────────────────────────────────────
("""
CREATE TABLE IF NOT EXISTS social_impact (
    impact_id          SERIAL PRIMARY KEY,
    report_date        DATE    DEFAULT CURRENT_DATE,
    total_kg_saved     NUMERIC(10,2) DEFAULT 0,
    total_co2_offset   NUMERIC(10,2) DEFAULT 0,
    meals_equivalent   INT           DEFAULT 0,
    partner_dispatches INT           DEFAULT 0,
    revenue_recovered  NUMERIC(10,2) DEFAULT 0
);
""", "social_impact"),

# ── 9. Event log for pricing decisions (explainability) ───────────────────────
("""
CREATE TABLE IF NOT EXISTS pricing_decisions (
    decision_id      BIGSERIAL PRIMARY KEY,
    product_id       INT REFERENCES products(product_id),
    trigger_type     VARCHAR(30),  -- 'order','view_spike','expiry','manual'
    old_price        NUMERIC(10,2),
    new_price        NUMERIC(10,2),
    demand_score     NUMERIC(5,4),
    view_intensity   NUMERIC(5,4),
    stock_factor     NUMERIC(5,4),
    expiry_factor    NUMERIC(5,4),
    competitor_ceil  NUMERIC(10,2),
    decision_reason  TEXT,
    decided_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""", "pricing_decisions"),
]

for sql, name in migrations:
    try:
        cur.execute(sql)
        conn.commit()
        print(f"  OK  {name}")
    except Exception as e:
        conn.rollback()
        print(f"  ERR {name}: {e}")

cur.close()
conn.close()
print("\nPhase A migration complete.")