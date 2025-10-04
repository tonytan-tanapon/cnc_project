from logging.config import fileConfig
import os

from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic config
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# --- Your models ---
from database import Base
import models  # noqa: F401  (ensure models import registers all tables)

target_metadata = Base.metadata

# Get URL from alembic.ini or env
def get_url() -> str:
    url = config.get_main_option("sqlalchemy.url", "")
    if not url:
        url = os.getenv("DATABASE_URL", "")
        if url:
            config.set_main_option("sqlalchemy.url", url)
    return url

def include_object(object, name, type_, reflected, compare_to):
    # Skip Alembic's version table in autogenerate diffs
    if type_ == "table" and name == context.get_x_argument(as_dictionary=True).get("version_table", "alembic_version"):
        return False
    return True

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
