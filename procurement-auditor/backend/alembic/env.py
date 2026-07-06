"""Alembic environment configuration.

The database URL is read from the DATABASE_URL environment variable so that no
credentials are stored in version control. Target metadata is bound to the existing
SQLAlchemy models — but note: the Supabase schema already exists and is seeded, so do
NOT autogenerate destructive migrations against it.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from config import get_settings
from database import Base
import models  # noqa: F401 - ensure models are imported for metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the runtime DATABASE_URL (converting the legacy postgres:// scheme).
_db_url = get_settings().DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
config.set_main_option("sqlalchemy.url", _db_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
