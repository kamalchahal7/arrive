"""TLS settings for Postgres connections, following libpq's sslmode semantics.

    disable      no TLS
    allow        try without TLS, then with TLS; certificate not verified
    prefer       try TLS first, fall back to no TLS; certificate not verified (libpq's default)
    require      TLS always; certificate NOT verified (encrypted, but not authenticated)
    verify-ca    TLS always; the server certificate must chain to a trusted CA; host name not checked
    verify-full  like verify-ca, and the certificate must match the host name

The trusted CA for verify-ca/verify-full is DB_SSL_ROOT_CERT if set (or `sslrootcert` in the DSN), otherwise the
system trust store. As in libpq, if a root certificate is given with sslmode=require, it behaves like verify-ca.

The result is passed as asyncpg's `ssl=` argument, which takes precedence over the DSN's own sslmode.
"""

import re
import ssl
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

SSL_MODES = ("disable", "allow", "prefer", "require", "verify-ca", "verify-full")
DEFAULT_MODE = "prefer"


def _dsn_param(dsn: str, name: str) -> str | None:
    """Read a parameter from a URL DSN (postgres://...?sslmode=...) or a keyword DSN (host=... sslmode=...)."""
    if "://" in dsn:
        values = parse_qs(urlsplit(dsn).query).get(name)
        return values[-1] if values else None
    match = re.search(rf"(?:^|\s){name}\s*=\s*(?:'([^']*)'|(\S+))", dsn)
    return (match.group(1) or match.group(2)) if match else None


def sslmode_of(dsn: str) -> str:
    mode = (_dsn_param(dsn, "sslmode") or DEFAULT_MODE).strip()
    if mode not in SSL_MODES:
        raise ValueError(f"unsupported sslmode {mode!r}; use one of: {', '.join(SSL_MODES)}")
    return mode


def ssl_context(dsn: str, root_cert: str | None = None) -> ssl.SSLContext | str | bool:
    """What to pass as asyncpg's `ssl=` for this DSN.

    Returns False for disable, the mode name for allow/prefer (asyncpg negotiates and does not verify, as libpq),
    or an SSLContext for require/verify-ca/verify-full.
    """
    mode = sslmode_of(dsn)
    if mode == "disable":
        return False
    if mode in ("allow", "prefer"):
        return mode

    cafile = root_cert or _dsn_param(dsn, "sslrootcert") or None
    if cafile and not Path(cafile).expanduser().is_file():
        raise ValueError(f"DB_SSL_ROOT_CERT / sslrootcert file not found: {cafile}")

    if mode == "require" and not cafile:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    # verify-ca, verify-full, or require with a root certificate (libpq treats that as verify-ca).
    ctx = ssl.create_default_context(cafile=str(Path(cafile).expanduser())) if cafile else ssl.create_default_context()
    ctx.check_hostname = mode == "verify-full"
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx
