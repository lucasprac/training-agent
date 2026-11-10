from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.clients.openrouter import OpenRouterClient
from app.clients.sage import SageClient
from app.config import Settings, get_settings
from app.db import get_engine, init_db
from app.harness.orchestrator import Harness


def build_harness(settings: Settings) -> Harness:
    return Harness(
        engine=get_engine(),
        sage=SageClient(settings.sage_base_url, settings.sage_api_key, settings.sage_timeout_s),
        openrouter=OpenRouterClient(
            settings.openrouter_api_key,
            settings.openrouter_base_url,
            app_url=settings.app_url,
            app_title=settings.app_title,
        ),
        settings=settings,
    )


def create_app(harness: Harness | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings = harness.settings if harness else get_settings()
        init_db(sample_data=settings.sample_data)
        app.state.harness = harness or build_harness(settings)
        yield

    app = FastAPI(title="Training Agent", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
