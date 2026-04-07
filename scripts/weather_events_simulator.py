"""
Simulates real-world demand triggers: weather, IPL matches, festivals.
Runs continuously, inserting rows into external_factors every 2 minutes.
Command: python scripts/weather_events_simulator.py
"""
import sys, os, random, time
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import psycopg2
import schedule
from datetime import datetime
from config import settings

random.seed()  # fresh seed each run

# ── Realistic Indian weather patterns by city ─────────────────────────────────
CITY_WEATHER = {
    "Hyderabad": [
        ("Sunny",  32, 0),
        ("Cloudy", 28, 0),
        ("Rainy",  24, 7),
        ("Heavy Rain", 21, 9),
        ("Humid",  30, 0),
    ],
    "Bangalore": [
        ("Sunny",  27, 0),
        ("Cloudy", 24, 0),
        ("Drizzle", 20, 4),
        ("Rainy",  19, 6),
        ("Foggy",  18, 0),
    ],
    "Chennai": [
        ("Hot",    36, 0),
        ("Humid",  34, 0),
        ("Cloudy", 31, 0),
        ("Rainy",  27, 8),
        ("Cyclone Warning", 22, 10),
    ],
    "Mumbai": [
        ("Sunny",  33, 0),
        ("Humid",  31, 0),
        ("Monsoon", 26, 9),
        ("Heavy Rain", 24, 10),
        ("Cloudy", 28, 0),
    ],
    "Delhi": [
        ("Sunny",  35, 0),
        ("Smoggy", 28, 0),
        ("Foggy",  18, 0),
        ("Cloudy", 25, 0),
        ("Rainy",  24, 5),
    ],
}

# ── Indian festivals and events calendar (month → events) ─────────────────────
EVENTS_BY_MONTH = {
    1:  [("Pongal", 2.1), ("Republic Day", 1.3)],
    2:  [("Valentine's Day", 1.4)],
    3:  [("Holi", 2.3), ("Ugadi", 1.8)],
    4:  [("IPL Season", 1.6), ("Ram Navami", 1.5)],
    5:  [("IPL Finals", 1.8), ("Eid", 2.0)],
    6:  [("Summer Holidays", 1.3)],
    7:  [("Monsoon Season", 1.4)],
    8:  [("Independence Day", 1.3), ("Raksha Bandhan", 1.7), ("Onam", 1.9)],
    9:  [("Ganesh Chaturthi", 2.2), ("Navratri", 1.8)],
    10: [("Navratri", 2.0), ("Dussehra", 1.9)],
    11: [("Diwali", 2.5), ("Bhai Dooj", 1.6)],
    12: [("Christmas", 1.8), ("New Year Eve", 2.0)],
}

# Products most affected by each weather/event ─────────────────────────────────
WEATHER_PRODUCT_BOOST = {
    "Rainy":          {"Beverages": 1.4, "Snacks": 1.5},
    "Heavy Rain":     {"Beverages": 1.6, "Snacks": 1.8},
    "Monsoon":        {"Vegetables": 1.3, "Snacks": 1.7},
    "Cyclone Warning":{"Staples": 2.0,   "Beverages": 1.8},
    "Hot":            {"Beverages": 1.8, "Dairy": 1.3},
    "Humid":          {"Beverages": 1.5},
}

EVENT_PRODUCT_BOOST = {
    "IPL Season":     {"Snacks": 1.8, "Beverages": 1.9},
    "IPL Finals":     {"Snacks": 2.2, "Beverages": 2.1},
    "Diwali":         {"Snacks": 2.3, "Dairy": 1.8},
    "Holi":           {"Dairy": 2.0, "Beverages": 1.7},
    "Pongal":         {"Dairy": 2.1, "Staples": 1.9},
    "Ganesh Chaturthi":{"Staples": 1.8, "Snacks": 1.6},
    "Eid":            {"Staples": 2.0, "Dairy": 1.7},
    "Christmas":      {"Beverages": 1.8, "Snacks": 1.7},
}


def get_conn():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host, port=settings.db_port,
    )


def get_location_ids(conn):
    cur = conn.cursor()
    cur.execute("SELECT location_id, city FROM locations;")
    rows = cur.fetchall()
    cur.close()
    return {city: lid for lid, city in rows}


def get_current_event():
    month  = datetime.now().month
    hour   = datetime.now().hour
    events = EVENTS_BY_MONTH.get(month, [])

    # Late night / early morning = no events
    if hour < 8 or hour > 23:
        return None, 1.0

    # 30% chance an event is active at any given time
    if events and random.random() < 0.30:
        return random.choice(events)
    return None, 1.0


def insert_external_factors():
    now  = datetime.now()
    conn = get_conn()
    cur  = conn.cursor()

    locations  = get_location_ids(conn)
    event_name, event_multiplier = get_current_event()

    inserted = []
    for city, weather_options in CITY_WEATHER.items():
        loc_id = locations.get(city)
        if not loc_id:
            continue

        weather, temp, rain = random.choice(weather_options)

        # Rain intensity drives umbrella / snack demand
        rain_intensity = rain + random.uniform(-1, 1)
        rain_intensity = round(max(0, min(10, rain_intensity)), 1)

        cur.execute("""
            INSERT INTO external_factors
                (timestamp, location_id, weather, temperature,
                 festival_flag, rain_intensity, event_name,
                 event_demand_multiplier)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """, (
            now, loc_id, weather, temp,
            event_name is not None,
            rain_intensity,
            event_name,
            event_multiplier,
        ))
        inserted.append(
            f"  {city:<12} {weather:<18} {temp}°C  "
            f"rain={rain_intensity}"
            + (f"  EVENT: {event_name} ×{event_multiplier}" if event_name else "")
        )

    conn.commit()

    # Print summary
    ts = now.strftime("%H:%M:%S")
    print(f"\n[{ts}] External factors updated:")
    for line in inserted:
        print(line)

    cur.close()
    conn.close()


def apply_weather_price_boosts():
    """
    Reads latest external factors and applies category-level demand boosts
    by writing to the demand_events table (intensity signal for pricing engine).
    """
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute("""
        SELECT DISTINCT ON (location_id)
            location_id, weather, event_name, event_demand_multiplier,
            rain_intensity
        FROM external_factors
        ORDER BY location_id, timestamp DESC;
    """)
    factors = cur.fetchall()

    cur.execute("""
        SELECT p.product_id, c.category_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id;
    """)
    products = cur.fetchall()  # [(product_id, category_name), ...]

    boosts_applied = 0
    for loc_id, weather, event_name, event_mult, rain in factors:
        # Determine which categories get boosted
        category_boosts = {}

        if weather in WEATHER_PRODUCT_BOOST:
            category_boosts.update(WEATHER_PRODUCT_BOOST[weather])

        if event_name and event_name in EVENT_PRODUCT_BOOST:
            for cat, mult in EVENT_PRODUCT_BOOST[event_name].items():
                category_boosts[cat] = max(category_boosts.get(cat, 1.0), mult)

        if not category_boosts:
            continue

        for pid, cat_name in products:
            boost = category_boosts.get(cat_name, 0)
            if boost <= 1.2:
                continue   # only act on significant boosts

            # Intensity proportional to boost magnitude
            intensity = round(min((boost - 1.0) * 0.8, 1.0), 4)

            cur.execute("""
                INSERT INTO demand_events
                    (product_id, event_type, session_id,
                     location_id, intensity_score)
                VALUES (%s, 'view', 'weather-bot', %s, %s);
            """, (pid, loc_id, intensity))
            boosts_applied += 1

    if boosts_applied:
        print(f"  Applied {boosts_applied} weather/event demand boosts")

    conn.commit()
    cur.close()
    conn.close()


def run():
    print("Weather & Events Simulator started.")
    print("Updating external factors every 2 minutes.\n")

    insert_external_factors()
    apply_weather_price_boosts()

    schedule.every(2).minutes.do(insert_external_factors)
    schedule.every(2).minutes.do(apply_weather_price_boosts)

    while True:
        schedule.run_pending()
        time.sleep(10)


if __name__ == "__main__":
    run()