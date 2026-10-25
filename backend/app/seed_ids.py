"""Deterministic UUID generation shared by the demo-user registry
(app.auth.dev_auth) and the seed script (app.scripts.seed_demo) - both
need to agree on the same customer/tenant ids without importing each
other (dev_auth is imported BY seed_demo, so the reverse would cycle).
"""
import uuid

SEED_NAMESPACE = uuid.UUID("00000000-0000-0000-0000-000000000000")


def deterministic_id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, ":".join(parts))
