"""Auth0 access-token verification (RS256, cached JWKS, audience + issuer checked) and role checks.

Roles come from the namespaced claim AUTH0_ROLES_CLAIM, added by an Auth0 Action (see README).
The `admin` role passes every staff check.
"""

import asyncio
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, Header

from app.config import get_settings
from app.errors import AppError


@dataclass
class Principal:
    sub: str
    roles: list[str] = field(default_factory=list)
    email: str | None = None


@lru_cache
def jwks_client(domain: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://{domain}/.well-known/jwks.json", cache_keys=True, lifespan=3600)


async def verify_token(token: str) -> dict[str, Any]:
    s = get_settings()
    if not (s.auth0_domain and s.auth0_audience):
        raise AppError("auth_not_configured", 503)
    try:
        signing_key = await asyncio.to_thread(jwks_client(s.auth0_domain).get_signing_key_from_jwt, token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=s.auth0_audience,
            issuer=f"https://{s.auth0_domain}/",
            options={"require": ["exp", "iat", "sub"]},
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        raise AppError("unauthorized", 401) from exc


async def current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("unauthorized", 401)
    claims = await verify_token(authorization.split(" ", 1)[1].strip())
    roles = claims.get(get_settings().auth0_roles_claim) or []
    if not isinstance(roles, list):
        roles = []
    email = claims.get("email") or claims.get("https://arrive.app/email")
    return Principal(sub=claims["sub"], roles=[str(r) for r in roles], email=email)


def require_role(*allowed: str) -> Callable[..., Coroutine[Any, Any, Principal]]:
    async def dependency(principal: Principal = Depends(current_principal)) -> Principal:
        if "admin" in principal.roles or any(r in principal.roles for r in allowed):
            return principal
        raise AppError("forbidden", 403)

    return dependency
