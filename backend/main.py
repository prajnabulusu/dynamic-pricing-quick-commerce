import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.products  import router as products_router
from backend.routers.orders    import router as orders_router
from backend.routers.pricing   import router as pricing_router
from backend.routers.pricing   import dashboard_router
from backend.routers.events import router as events_router
from backend.routers.phase_b import router as phase_b_router

app = FastAPI(
    title="Dynamic Pricing API",
    description=(
        "Real-time dynamic pricing system for quick commerce. "
        "Prices update instantly based on demand, stock, and perishability."
    ),
    version="1.0.0",
)

# Allow the React frontend (running on port 5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(products_router)
app.include_router(orders_router)
app.include_router(pricing_router)
app.include_router(dashboard_router)
app.include_router(events_router)
app.include_router(phase_b_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "status":  "running",
        "message": "Dynamic Pricing API is live",
        "docs":    "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    """Quick health check — used by monitoring tools."""
    return {"status": "ok"}