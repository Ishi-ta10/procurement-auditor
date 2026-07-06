"""SQLAlchemy engine and session management."""
from urllib.parse import quote

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from config import get_settings

settings = get_settings()


def _normalize_db_url(raw: str) -> str:
    """Normalize the DATABASE_URL so it is safe for SQLAlchemy/psycopg2.

    - Rewrites the legacy ``postgres://`` scheme to ``postgresql://``.
    - Percent-encodes the username/password so special characters in the
      password (e.g. ``@``, ``:``, ``/``, ``#``) don't break URL parsing.
      The host portion never contains ``@``, so splitting the credentials at
      the LAST ``@`` reliably isolates them from ``host:port/db``.
    """
    url = raw.strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Only touch URLs that carry credentials (contain an '@').
    if "://" not in url or "@" not in url:
        return url

    scheme, rest = url.split("://", 1)
    credentials, host_part = rest.rsplit("@", 1)

    if ":" in credentials:
        user, password = credentials.split(":", 1)
    else:
        user, password = credentials, ""

    safe_user = quote(user, safe="")
    safe_password = quote(password, safe="")
    userinfo = f"{safe_user}:{safe_password}" if password != "" else safe_user

    return f"{scheme}://{userinfo}@{host_part}"


_db_url = _normalize_db_url(settings.DATABASE_URL)

engine = create_engine(
    _db_url,
    pool_pre_ping=True,
    pool_recycle=300,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
