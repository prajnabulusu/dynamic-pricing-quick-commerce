"""
Seeds external_factors with realistic Indian weather data.
Inserts historical readings (3 days back) + current conditions.
Command: python scripts/seed_external_factors.py
"""
import sys, os, random
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import psycopg2
from datetime import datetime, timedelta
from config import settings

random.seed(42)

conn = psycopg2.connect(
    dbname=settings.db_name, user=settings.db_user,
    password=settings.db_password, host=settings.db_host, port=settings.db_port,
)
cur = conn.cursor()

# ── Fetch location IDs ─────────────────────────────────────────────────────────
cur.execute("SELECT location_id, city FROM locations;")
locations = {city: lid for lid, city in cur.fetchall()}
print(f"Found locations: {list(locations.keys())}\n")

# ── City weather profiles (realistic for April in India) ──────────────────────
CITY_PROFILES = {
    "Hyderabad": {
        "base_temp": 36,
        "temp_range": (-3, 4),
        "weather_options": [
            ("Sunny",      0,   0.40),
            ("Hot",        0,   0.25),
            ("Humid",      0,   0.15),
            ("Cloudy",     0,   0.10),
            ("Rainy",      5,   0.07),
            ("Heavy Rain", 8,   0.03),
        ],
    },
    "Bangalore": {
        "base_temp": 28,
        "temp_range": (-4, 3),
        "weather_options": [
            ("Sunny",    0,   0.35),
            ("Cloudy",   0,   0.25),
            ("Drizzle",  3,   0.20),
            ("Rainy",    6,   0.12),
            ("Foggy",    0,   0.08),
        ],
    },
    "Chennai": {
        "base_temp": 38,
        "temp_range": (-2, 4),
        "weather_options": [
            ("Hot",      0,   0.35),
            ("Humid",    0,   0.30),
            ("Sunny",    0,   0.20),
            ("Cloudy",   0,   0.10),
            ("Rainy",    7,   0.05),
        ],
    },
    "Mumbai": {
        "base_temp": 33,
        "temp_range": (-3, 3),
        "weather_options": [
            ("Humid",      0,   0.30),
            ("Sunny",      0,   0.25),
            ("Cloudy",     0,   0.20),
            ("Monsoon",    8,   0.15),
            ("Heavy Rain", 9,   0.10),
        ],
    },
    "Delhi": {
        "base_temp": 38,
        "temp_range": (-4, 5),
        "weather_options": [
            ("Hot",    0,   0.35),
            ("Sunny",  0,   0.25),
            ("Smoggy", 0,   0.20),
            ("Cloudy", 0,   0.15),
            ("Rainy",  4,   0.05),
        ],
    },
}

# ── Indian events active in April ─────────────────────────────────────────────
APRIL_EVENTS = [
    ("IPL Season",  1.6, 0.30),   # (name, multiplier, probability)
    ("Ram Navami",  1.5, 0.10),
    ("Baisakhi",    1.7, 0.08),
    (None,          1.0, 0.52),   # no event
]

def pick_weather(profile):
    options  = profile["weather_options"]
    names    = [o[0] for o in options]
    rains    = [o[1] for o in options]
    weights  = [o[2] for o in options]
    idx      = random.choices(range(len(options)), weights=weights)[0]
    weather  = names[idx]
    rain_base= rains[idx]
    rain_int = round(max(0, min(10, rain_base + random.uniform(-1, 1))), 1)
    temp     = round(
        profile["base_temp"] + random.uniform(*profile["temp_range"]), 1
    )
    return weather, temp, rain_int

def pick_event():
    names   = [e[0] for e in APRIL_EVENTS]
    mults   = [e[1] for e in APRIL_EVENTS]
    weights = [e[2] for e in APRIL_EVENTS]
    idx     = random.choices(range(len(APRIL_EVENTS)), weights=weights)[0]
    return names[idx], mults[idx]

# ── Generate readings every 30 minutes for last 3 days ───────────────────────
now       = datetime.now()
start     = now - timedelta(days=3)
interval  = timedelta(minutes=30)

rows = []
ts   = start
while ts <= now:
    event_name, event_mult = pick_event()
    festival_flag          = event_name is not None

    for city, profile in CITY_PROFILES.items():
        loc_id = locations.get(city)
        if not loc_id:
            continue
        weather, temp, rain = pick_weather(profile)

        # Night hours → cooler, less rain
        if ts.hour < 6 or ts.hour > 21:
            temp  = round(temp - random.uniform(2, 5), 1)
            rain  = round(rain * 0.3, 1)

        rows.append((
            ts, loc_id, weather, temp, festival_flag,
            rain, event_name, event_mult,
        ))

    ts += interval

print(f"Inserting {len(rows)} weather readings across {len(CITY_PROFILES)} cities...")

cur.executemany("""
    INSERT INTO external_factors
        (timestamp, location_id, weather, temperature, festival_flag,
         rain_intensity, event_name, event_demand_multiplier)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s);
""", rows)

conn.commit()
print(f"Inserted {len(rows)} rows.\n")

# ── Verify ────────────────────────────────────────────────────────────────────
cur.execute("""
    SELECT DISTINCT ON (location_id)
        l.city, ef.weather, ef.temperature, ef.rain_intensity,
        ef.event_name, ef.event_demand_multiplier, ef.timestamp
    FROM external_factors ef
    JOIN locations l ON ef.location_id = l.location_id
    ORDER BY location_id, ef.timestamp DESC;
""")
print("Current conditions per city:")
print(f"{'City':<14} {'Weather':<16} {'Temp':>5}  {'Rain':>5}  {'Event'}")
print("-" * 65)
for city, weather, temp, rain, event, mult, ts in cur.fetchall():
    event_str = f"{event} ×{mult}" if event else "—"
    print(f"{city:<14} {weather:<16} {float(temp):>4.1f}°C  {float(rain):>4.1f}/10  {event_str}")

cur.close()
conn.close()
print("\nDone. Weather data ready for the pricing engine.")