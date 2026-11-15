"""Settings read from the environment: which environment the app runs in, and its version."""

import os

ENVIRONMENTS = ("dev", "prod", "local")


def app_environment() -> str:
    """APP_ENV: `dev`, `prod` or `local` (the default, also for unknown or empty values)."""
    value = os.getenv("APP_ENV", "").strip().lower()
    return value if value in ENVIRONMENTS else "local"


def app_version() -> str:
    """The deployed version: APP_VERSION, then RENDER_GIT_COMMIT, then `dev`.

    Empty values count as unset. Telemetry reuses this helper.
    """
    return os.getenv("APP_VERSION", "").strip() or os.getenv("RENDER_GIT_COMMIT", "").strip() or "dev"
