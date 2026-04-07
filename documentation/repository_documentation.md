# Repository Documentation

## Overview

This repository is a demo-ready quick commerce dynamic pricing platform built around real-time events.

At a high level, it simulates an online grocery or instant delivery system where:

- customers browse products in a React storefront,
- demand signals and orders are published through Kafka,
- FastAPI exposes operational and analytics APIs,
- PostgreSQL stores products, inventory, pricing, orders, perishables, and operational data,
- an ML-powered pricing engine recalculates prices based on demand, stock, perishability, weather, competitor prices, and event-driven conditions,
- admin views surface operations, expiry risk, cold-chain alerts, and social impact metrics.

The project appears to be structured as a milestone or phase-based academic/demo system:

- Base system: products, inventory, orders, pricing, redistribution.
- Phase A: demand event tracking, dark stores, competitor pricing, cold-chain logging, explainable pricing decisions.
- Phase B: weather and festival/event demand boosts, enhanced perishables, social impact tracking, and richer admin insights.

## What The Repository Is About

The core problem this system solves is:

How should a quick-commerce platform change prices in real time when customer demand, stock levels, expiry risk, competitor pricing, and real-world conditions are constantly changing?

The repo demonstrates that idea with:

- a customer-facing shop page,
- an admin dashboard,
- Kafka-based event streaming,
- ML demand scoring,
- automated repricing,
- perishable inventory discounting and redistribution workflows,
- weather/event-based demand simulation,
- cold-chain breach handling,
- social impact reporting for food saved and redistribution.

This is not just a CRUD app. It is an event-driven pricing simulation platform.

## Main Technology Stack

### Backend

- FastAPI
- SQLAlchemy session management
- raw SQL queries via SQLAlchemy `text(...)`
- PostgreSQL
- Kafka via `kafka-python`
- Pydantic / Pydantic Settings

### Machine Learning

- XGBoost regressor
- scikit-learn `StandardScaler`
- pandas / numpy / joblib

### Frontend

- React 19
- Vite
- Axios
- Tailwind CSS

### Background / Simulation

- Kafka producers and consumers
- Python scripts with `schedule`

## Repository Structure

```text
backend/         FastAPI application, routers, schemas, DB session setup
frontend/        React frontend for shop and admin dashboard
kafka/           Kafka producer, consumers, topic setup, Docker compose
ml/              Pricing engine, training scripts, saved ML artifacts
scripts/         DB seeding, migration-like scripts, simulators, scheduled jobs
data/            Project data folder (not used heavily in the code shown)
config.py        Environment-backed configuration
requirements.txt Python dependencies
test_setup.py    Environment/setup verification script
```

## Architecture Summary

The platform is built around three connected loops:

### 1. Customer browsing loop

1. Frontend loads products from FastAPI.
2. User clicks a product.
3. Frontend sends a demand event to `/events/`.
4. API writes the event to PostgreSQL immediately and also publishes it to Kafka.
5. The demand consumer detects spikes and may trigger repricing.
6. Frontend polls product and view stats endpoints and updates the UI.

### 2. Order placement loop

1. User adds products to cart and places an order.
2. FastAPI validates stock and current price.
3. API publishes the order event to Kafka topic `orders`.
4. `storage_consumer.py` writes the order into PostgreSQL and decrements stock.
5. `pricing_consumer.py` runs the pricing engine for products in that order and writes new prices.
6. Frontend refreshes and shows changed prices.

### 3. Operational automation loop

Scheduled scripts and APIs drive additional repricing and monitoring:

- weather/event simulator inserts external factors,
- perishable job discounts near-expiry items and creates redistribution requests,
- cold chain monitor simulates storage temperature breaches and triggers emergency discounts,
- admin dashboard aggregates these signals into operational views.

## Backend Details

### Entry Point

`backend/main.py`

This file creates the FastAPI app, enables CORS for local frontend development, and mounts routers for:

- products,
- orders,
- pricing,
- dashboard,
- events,
- phase B analytics.

Health endpoints:

- `GET /`
- `GET /health`

### Database Access

`backend/models/database.py`

This module configures:

- SQLAlchemy engine from `config.py`,
- `SessionLocal`,
- `get_db()` dependency for FastAPI routes.

Although SQLAlchemy manages connections, most business logic uses hand-written SQL instead of ORM models.

### Schemas

`backend/schemas/schemas.py`

Pydantic models cover:

- product responses,
- order requests and responses,
- price response and history,
- dashboard stats,
- near-expiry items,
- redistribution items.

### API Routers

#### Products

`backend/routers/products.py`

Provides:

- `GET /products/`
- `GET /products/{product_id}`
- `GET /products/{product_id}/price-history`

Behavior:

- joins product/category/inventory data,
- fetches latest dynamic price from `pricing`,
- falls back to base price if no pricing row exists.

#### Orders

`backend/routers/orders.py`

Provides:

- `POST /orders/`
- `GET /orders/recent`

Behavior:

- validates product existence and stock,
- fetches latest current price,
- builds an order event,
- publishes to Kafka `orders`,
- does not synchronously persist the order,
- expects asynchronous persistence by the storage consumer.

Important design note:

- `order_id` is returned as `None` because order persistence is async.

#### Pricing and Dashboard

`backend/routers/pricing.py`

Provides:

- `GET /price/{product_id}`
- `GET /price/all/latest`
- `GET /dashboard/stats`
- `GET /dashboard/near-expiry`
- `GET /dashboard/redistribution`

Behavior:

- returns current price breakdown,
- exposes all latest prices for analytics/BI use,
- aggregates admin dashboard KPIs,
- surfaces near-expiry inventory and redistribution requests.

#### Demand Events

`backend/routers/events.py`

Provides:

- `POST /events/`
- `POST /events/batch`
- `GET /events/stats/{product_id}`
- `GET /events/spike-simulator/{product_id}`

Behavior:

- records browse/cart demand signals,
- publishes to Kafka `demand_events`,
- updates DB stats,
- exposes “people viewing now” style counters,
- includes a built-in demo spike simulator.

This router is central to the live demo experience.

#### Phase B

`backend/routers/phase_b.py`

Provides:

- `GET /phase-b/competitor-prices`
- `GET /phase-b/weather`
- `GET /phase-b/cold-chain`
- `GET /phase-b/cold-chain/alerts`
- `GET /phase-b/social-impact`
- `GET /phase-b/perishable-lifecycle`

Behavior:

- exposes operational and sustainability analytics,
- compares current price against competitor prices,
- shows latest external weather/event conditions,
- surfaces cold-chain breaches,
- computes food-saved / CO2 / meals-equivalent metrics.

## Machine Learning Layer

### Pricing Engine

`ml/pricing_engine.py`

This is the core pricing logic.

Inputs used by the engine:

- base price,
- cost price,
- stock quantity and reorder level,
- shelf life / nearest expiry,
- product category,
- competitor prices,
- latest weather and event data,
- synthetic or real order event context.

Pricing formula in code:

```text
final price =
  base
  * (1 + demand_score)
  * (1 + stock_factor)
  * (1 - expiry_factor)
  * weather_multiplier
```

Then it applies constraints:

- upper bounded by base price multiplier,
- lower bounded by minimum multiplier,
- never below a margin over cost price,
- optionally capped near competitor ceiling.

Outputs include:

- recommended price,
- demand score,
- stock factor,
- expiry factor,
- final margin,
- reason string for explainability.

### Training Pipeline

`ml/training/feature_engineering.py`

Builds `ml/training_data.csv` from historical order and inventory data by creating:

- hour/day/weekend features,
- rolling quantity features,
- stock features,
- price ratio,
- category encoding,
- normalized demand score target.

`ml/training/train_model.py`

Trains an `XGBRegressor`, evaluates it, and saves:

- `ml/models/demand_model.pkl`
- `ml/models/scaler.pkl`

This means the pricing engine depends on pre-trained artifacts already saved in the repo.

## Kafka Layer

### Topics

`kafka/create_topics.py`

Creates:

- `orders`
- `inventory_updates`
- `pricing_updates`

Observed gap:

- the application also uses `demand_events`, but that topic is not listed in `create_topics.py`.
- Kafka may still create it automatically because Docker config enables topic auto-creation, but the script itself is incomplete relative to app usage.

### Producer

`kafka/producers/order_producer.py`

Simulates realistic quick-commerce orders:

- time-of-day demand multipliers,
- product category quantity ranges,
- random locations,
- small selling price variation.

This is useful for generating training and demo data.

### Consumers

#### Storage Consumer

`kafka/consumers/storage_consumer.py`

Responsibilities:

- consume `orders`,
- insert `orders` row,
- insert `order_items`,
- decrement inventory.

This is the persistence consumer.

#### Pricing Consumer

`kafka/consumers/pricing_consumer.py`

Responsibilities:

- consume `orders`,
- call `PricingEngine.compute_price(...)`,
- write to `pricing`,
- append to `price_history`.

This is the main order-triggered repricing consumer.

#### Demand Consumer

`kafka/consumers/demand_consumer.py`

Responsibilities:

- consume `demand_events`,
- maintain recent per-product event windows,
- reprice products when view intensity crosses threshold or on cart-add,
- write to `pricing` and `pricing_decisions`.

This is the browse-triggered repricing loop.

### Kafka Infrastructure

`kafka/docker-compose.yml`

Defines:

- Zookeeper
- Kafka broker

Suitable for local development/demo only.

## Frontend Details

### App Structure

`frontend/src/App.jsx`

The frontend has two main modes:

- `shop`
- `admin`

It also manages:

- in-memory cart state,
- toast notifications,
- page switching.

### API Client

`frontend/src/api.js`

Central Axios wrapper pointed at:

- `http://localhost:8000`

Exposes helper functions for products, pricing, orders, dashboard, and demand-event endpoints.

### Shop Page

`frontend/src/pages/ProductsPage.jsx`

Main features:

- product listing,
- category filters,
- polling every 5 seconds for latest products/prices,
- click-to-send demand signals,
- “people viewing now” polling,
- cart handling,
- order placement,
- price flash animations,
- expiry badges,
- low-stock warnings,
- demo guidance.

This page is designed as a live showcase of dynamic pricing behavior.

### Admin Dashboard

`frontend/src/pages/AdminDashboard.jsx`

Main features:

- overview KPI cards,
- recent orders,
- live pricing table,
- perishable lifecycle table,
- weather/events monitoring,
- cold-chain alerts,
- social impact metrics,
- spike simulator.

The admin page is essentially the operations/demo control center.

## Scripts and Operational Utilities

### Setup / Seeding

#### `scripts/seed_data.py`

Seeds core business data:

- categories,
- warehouses,
- locations,
- products,
- inventory,
- perishable batches,
- redistribution partners.

The sample data is India-focused.

#### `scripts/phase_a_tables.py`

Adds Phase A tables:

- dark stores,
- delivery slots,
- demand events,
- product view stats,
- competitor prices,
- cold-chain logs,
- social impact,
- pricing decisions,
- perishable batch enhancements.

#### `scripts/seed_phase_a.py`

Seeds Phase A data:

- dark stores,
- delivery slots,
- competitor prices,
- product view stats,
- cold-chain logs,
- enhanced perishable batch metadata,
- social impact seed row.

#### `scripts/seed_external_factors.py`

Seeds historical and current external factor data:

- weather,
- temperature,
- rain intensity,
- festivals/events,
- demand multipliers.

### Continuous Simulation / Jobs

#### `scripts/weather_events_simulator.py`

Runs continuously and:

- inserts weather/event rows into `external_factors`,
- injects demand signals into `demand_events` based on weather/event boosts.

#### `scripts/perishable_job.py`

Runs every 15 minutes and:

- finds near-expiry batches,
- writes discounted prices,
- creates redistribution requests,
- auto-dispatches requests to partners.

#### `scripts/cold_chain_monitor.py`

Runs every 10 minutes and:

- simulates temperature readings,
- logs cold-chain breaches,
- applies emergency discounts for major/critical breaches,
- fast-tracks critical items for redistribution.

## Data Model Summary

The full base schema is not defined in a single migration file in this repository, but from code usage the important tables are:

### Core tables

- `categories`
- `products`
- `warehouses`
- `locations`
- `inventory`
- `orders`
- `order_items`
- `pricing`
- `price_history`
- `perishable_batches`
- `redistribution_partners`
- `redistribution_requests`
- `redistribution_dispatch`
- `external_factors`

### Phase A / B tables

- `dark_stores`
- `delivery_slots`
- `demand_events`
- `product_view_stats`
- `competitor_prices`
- `cold_chain_logs`
- `social_impact`
- `pricing_decisions`

Important note:

- some foundational schema pieces are assumed to already exist.
- this repo contains additive migration/seeding scripts, but not a complete “create everything from zero” schema bootstrap for all base tables.

## End-to-End Flow Examples

### Flow A: User browsing causes price increase

1. User repeatedly clicks a product card.
2. Frontend sends `view` events to `/events/`.
3. API writes event to DB and Kafka.
4. Demand consumer counts events in a 5-minute sliding window.
5. Threshold is crossed.
6. Pricing engine recomputes price.
7. New price is saved.
8. Shop page polls and shows updated price.

### Flow B: User order causes price and inventory changes

1. User places order from cart.
2. API validates stock and publishes to Kafka.
3. Storage consumer saves order and reduces stock.
4. Pricing consumer recalculates price based on latest demand and stock.
5. `price_history` is updated.
6. Admin and shop views reflect the new price.

### Flow C: Near-expiry item gets discounted and redistributed

1. Perishable job scans batches.
2. Item with low days-left is found.
3. Discount is inserted into `pricing`.
4. If urgent enough, `redistribution_requests` is created.
5. Auto-dispatch may assign a partner.
6. Admin dashboard shows expiry risk and redistribution state.

### Flow D: Cold chain breach triggers emergency handling

1. Cold chain monitor simulates a high temperature reading.
2. Breach severity is classified.
3. Major/critical breach logs are written.
4. Emergency discount is inserted.
5. Critical breach may mark batch for redistribution.
6. Admin dashboard surfaces alerts.

## Configuration

`config.py` loads settings from `.env`.

Required values inferred from code:

- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `KAFKA_BOOTSTRAP_SERVERS`
- `APP_ENV`

The computed SQLAlchemy URL is:

```text
postgresql://<user>:<password>@<host>:<port>/<db_name>
```

## Suggested Local Run Order

Because the repo is event-driven, startup order matters.

### Backend prerequisites

1. Ensure PostgreSQL is running.
2. Create/populate the base schema expected by the app.
3. Run:
   - `python scripts/seed_data.py`
4. Run:
   - `python scripts/phase_a_tables.py`
   - `python scripts/seed_phase_a.py`
5. Run:
   - `python scripts/seed_external_factors.py`

### Kafka prerequisites

1. From `kafka/`, start Kafka:
   - `docker-compose up -d`
2. Create topics:
   - `python kafka/create_topics.py`

### ML prerequisites

If you need to retrain:

1. `python ml/training/feature_engineering.py`
2. `python ml/training/train_model.py`

If existing model artifacts are already valid, retraining is not required.

### Start runtime components

Run each in a separate terminal:

1. `python kafka/consumers/storage_consumer.py`
2. `python kafka/consumers/pricing_consumer.py`
3. `python kafka/consumers/demand_consumer.py`
4. `python scripts/weather_events_simulator.py`
5. `python scripts/perishable_job.py`
6. `python scripts/cold_chain_monitor.py`
7. `uvicorn backend.main:app --reload`
8. In `frontend/`: `npm run dev`

Optional:

- `python kafka/producers/order_producer.py`

## Major Strengths Of The Repository

- Clear separation between API, streaming, ML, and frontend layers.
- Strong demo value with live repricing and operational dashboards.
- Explainable pricing through `price_reason` and `pricing_decisions`.
- Rich operational scenarios: perishables, weather, competitor pricing, cold chain, NGO redistribution.
- Good use of simulation scripts to generate realistic behavior without production integrations.

## Important Gaps / Risks Found During Review

These are useful to know when working with the repo.

### 1. Incomplete topic bootstrap

`create_topics.py` does not create `demand_events`, even though the app uses it.

### 2. Missing full base schema migration

The repo references many core tables, but only Phase A additive migrations are present in code. A full from-scratch DB bootstrap script is not included here.

### 3. Potential dark store / warehouse mismatch

Some scripts use `warehouse_id` values as if they correspond to `dark_stores.store_id`, especially in cold-chain/perishable flows. That coupling may only work if IDs happen to align.

### 4. Frontend page state includes `cart` but no dedicated cart page render

`App.jsx` sets page to `"cart"` from the navbar button, but only `"shop"` and `"admin"` are rendered. The cart still exists as a side panel inside the shop page, so the navbar cart button appears incomplete.

### 5. Mixed persistence style

The backend uses SQLAlchemy only for session/connection lifecycle while business logic is raw SQL. That is fine for demos, but schema evolution and query reuse may become harder over time.

### 6. Some text encoding artifacts

Several files contain mojibake-like characters in comments and UI text. This does not change the architecture, but it affects polish and documentation readability.

## Who This Repo Is Best For

This repository is well suited for:

- an academic project on dynamic pricing,
- a portfolio project around event-driven systems,
- a hackathon/demo platform,
- a proof-of-concept for real-time commerce analytics,
- a teaching example combining backend, streaming, ML, and frontend layers.

It is less like a production-hardened commerce platform and more like a feature-rich simulation environment that demonstrates many advanced concepts in one place.

## File Guide For New Contributors

If you want to understand the project quickly, read files in this order:

1. `backend/main.py`
2. `backend/routers/orders.py`
3. `backend/routers/events.py`
4. `backend/routers/pricing.py`
5. `ml/pricing_engine.py`
6. `kafka/consumers/storage_consumer.py`
7. `kafka/consumers/pricing_consumer.py`
8. `kafka/consumers/demand_consumer.py`
9. `frontend/src/pages/ProductsPage.jsx`
10. `frontend/src/pages/AdminDashboard.jsx`
11. `scripts/phase_a_tables.py`
12. `scripts/seed_data.py`
13. `scripts/seed_phase_a.py`
14. `scripts/weather_events_simulator.py`
15. `scripts/perishable_job.py`
16. `scripts/cold_chain_monitor.py`

## Final Summary

This repository is a real-time quick-commerce dynamic pricing simulation platform.

It combines:

- customer behavior tracking,
- asynchronous event processing,
- machine-learning-assisted demand scoring,
- dynamic price computation,
- perishables management,
- weather and event-based demand effects,
- cold-chain operational monitoring,
- sustainability and redistribution reporting,
- a shop UI and an admin dashboard.

The project is strongest as a systems demo that shows how multiple real-world retail signals can be brought together into a single pricing and operations platform.
