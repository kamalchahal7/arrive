"""TLS for Postgres follows libpq sslmode rules (app/db/tls.py), and every connection site uses it."""

import asyncio
import datetime as dt
import ipaddress
import re
import ssl
from pathlib import Path
from typing import Any

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from app.config import Settings
from app.db import pool as pool_module
from app.db.tls import sslmode_of, ssl_context

HOST = "db.example.tsdb.cloud.timescale.com"
REPO = Path(__file__).resolve().parents[2]


def dsn(mode: str | None = None, extra: str = "") -> str:
    query = f"?sslmode={mode}" if mode else ""
    if extra:
        query = f"{query}&{extra}" if query else f"?{extra}"
    return f"postgres://user:pw@{HOST}:35538/tsdb{query}"


# ---------- certificates for real handshakes ----------

def _name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _ca(cn: str) -> tuple[Any, x509.Certificate]:
    key = ec.generate_private_key(ec.SECP256R1())
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(_name(cn)).issuer_name(_name(cn)).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True, content_commitment=False,
                                     key_encipherment=False, data_encipherment=False, key_agreement=False,
                                     encipher_only=False, decipher_only=False), critical=True)
        .sign(key, hashes.SHA256())
    )
    return key, cert


@pytest.fixture(scope="module")
def pki(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    """A private CA (like Tiger Cloud's chain as seen from the server) plus an unrelated CA."""
    d = tmp_path_factory.mktemp("pki")
    ca_key, ca = _ca("Arrive Test Root CA")
    _, other_ca = _ca("Some Other CA")
    leaf_key = ec.generate_private_key(ec.SECP256R1())
    now = dt.datetime.now(dt.timezone.utc)
    leaf = (
        x509.CertificateBuilder()
        .subject_name(_name("localhost")).issuer_name(ca.subject).public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=30))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    pem = serialization.Encoding.PEM
    (d / "ca.pem").write_bytes(ca.public_bytes(pem))
    (d / "other-ca.pem").write_bytes(other_ca.public_bytes(pem))
    # Server presents leaf + CA: "self-signed certificate in certificate chain" for clients that don't trust the CA.
    (d / "server-chain.pem").write_bytes(leaf.public_bytes(pem) + ca.public_bytes(pem))
    (d / "server-key.pem").write_bytes(leaf_key.private_bytes(pem, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return {"ca": d / "ca.pem", "other_ca": d / "other-ca.pem", "chain": d / "server-chain.pem", "key": d / "server-key.pem"}


async def handshake(pki: dict[str, Path], client: ssl.SSLContext, server_hostname: str) -> None:
    server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_ctx.load_cert_chain(pki["chain"], pki["key"])

    async def on_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.close()

    server = await asyncio.start_server(on_client, "127.0.0.1", 0, ssl=server_ctx)
    port = server.sockets[0].getsockname()[1]
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", port, ssl=client, server_hostname=server_hostname), 10
        )
        writer.close()
    finally:
        server.close()
        await server.wait_closed()


# ---------- sslmode parsing ----------

@pytest.mark.parametrize("mode", ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"])
def test_sslmode_is_read_from_url_dsn(mode: str) -> None:
    assert sslmode_of(dsn(mode)) == mode


def test_sslmode_from_keyword_dsn() -> None:
    assert sslmode_of(f"host={HOST} port=35538 dbname=tsdb sslmode=verify-full") == "verify-full"


def test_missing_sslmode_defaults_to_prefer_like_libpq() -> None:
    assert sslmode_of(dsn()) == "prefer"


def test_unknown_sslmode_is_rejected() -> None:
    with pytest.raises(ValueError, match="unsupported sslmode"):
        ssl_context(dsn("verify"))


# ---------- one test per sslmode ----------

def test_disable_means_no_tls() -> None:
    assert ssl_context(dsn("disable")) is False


@pytest.mark.parametrize("mode", ["allow", "prefer"])
def test_allow_and_prefer_let_asyncpg_negotiate_without_verification(mode: str) -> None:
    assert ssl_context(dsn(mode)) == mode


async def test_require_encrypts_without_verifying(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("require"))
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_NONE and ctx.check_hostname is False
    # The Vultr failure: a chain from a CA we don't trust must still connect under require.
    await handshake(pki, ctx, "wrong.example")


async def test_verify_ca_rejects_untrusted_chain_without_root_cert(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("verify-ca"))
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname is False
    with pytest.raises(ssl.SSLCertVerificationError):
        await handshake(pki, ctx, "localhost")


async def test_verify_ca_with_root_cert_checks_chain_but_not_hostname(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("verify-ca"), str(pki["ca"]))
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname is False
    await handshake(pki, ctx, "wrong.example")  # host name mismatch is fine for verify-ca
    with pytest.raises(ssl.SSLCertVerificationError):
        await handshake(pki, ssl_context(dsn("verify-ca"), str(pki["other_ca"])), "localhost")


async def test_verify_full_checks_chain_and_hostname(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("verify-full"), str(pki["ca"]))
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname is True
    await handshake(pki, ctx, "localhost")
    with pytest.raises(ssl.SSLCertVerificationError):
        await handshake(pki, ssl_context(dsn("verify-full"), str(pki["ca"])), "wrong.example")


async def test_require_with_root_cert_verifies_ca_like_libpq(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("require"), str(pki["ca"]))
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname is False
    await handshake(pki, ctx, "wrong.example")
    with pytest.raises(ssl.SSLCertVerificationError):
        await handshake(pki, ssl_context(dsn("require"), str(pki["other_ca"])), "localhost")


async def test_sslrootcert_in_dsn_is_used_when_env_is_not_set(pki: dict[str, Path]) -> None:
    ctx = ssl_context(dsn("verify-full", f"sslrootcert={pki['ca']}"))
    await handshake(pki, ctx, "localhost")


def test_missing_root_cert_file_gives_a_clear_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="not found"):
        ssl_context(dsn("verify-full"), str(tmp_path / "nope.pem"))


# ---------- every connection site uses the shared helper ----------

async def test_connect_and_pool_pass_the_sslmode_context(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    class FakeConn:
        async def set_type_codec(self, *args: Any, **kwargs: Any) -> None:
            pass

    async def fake_connect(dsn_: str, **kwargs: Any) -> FakeConn:
        seen["connect"] = kwargs["ssl"]
        return FakeConn()

    async def fake_create_pool(dsn_: str, **kwargs: Any) -> object:
        seen["pool"] = kwargs["ssl"]
        return object()

    monkeypatch.setattr(pool_module.asyncpg, "connect", fake_connect)
    monkeypatch.setattr(pool_module.asyncpg, "create_pool", fake_create_pool)
    settings = Settings(database_url=dsn("require"), db_ssl_root_cert="")

    await pool_module.connect(settings)
    await pool_module.open_pool(settings)
    for ctx in (seen["connect"], seen["pool"]):
        assert isinstance(ctx, ssl.SSLContext) and ctx.verify_mode == ssl.CERT_NONE
    pool_module._pool = None
    pool_module._dsn = ""


def test_no_database_connection_bypasses_the_shared_helper() -> None:
    """Migrations, ingestion and scripts must go through app.db.pool.connect, never asyncpg directly."""
    offenders = []
    for path in [*(REPO / "backend").rglob("*.py"), *(REPO / "ingestion").rglob("*.py")]:
        if ".venv" in path.parts or "tests" in path.parts or path.name == "pool.py":
            continue
        if re.search(r"asyncpg\.(connect|create_pool)\(", path.read_text(encoding="utf-8")):
            offenders.append(str(path.relative_to(REPO)))
    assert offenders == []
    for rel in ("backend/app/db/migrate.py", "ingestion/ingest.py", "backend/scripts/seed_sample_insights.py"):
        assert "await connect(" in (REPO / rel).read_text(encoding="utf-8"), rel
