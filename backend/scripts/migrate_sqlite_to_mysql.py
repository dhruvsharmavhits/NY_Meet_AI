"""One-off data migration: copies all existing rows from the old sqlite
database into the new MySQL `nymeet` database (schema + data), preserving
primary keys, relationships, and values as-is. Run once after DB_* in .env
points to the new MySQL database:

    python -m scripts.migrate_sqlite_to_mysql
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, make_transient

from app.config import settings
from app.database import Base, build_database_url
from app.models import (
    Admin,
    ConsultationSession,
    Meeting,
    MeetingParticipant,
    PatientLink,
    TranscriptEntry,
    User,
    UserSettings,
)

SOURCE_DATABASE_URL = os.environ.get("SOURCE_DATABASE_URL", "sqlite:///./linguameet.db")

# Parents before children, so foreign keys always resolve.
MODELS_IN_ORDER = [
    Admin,
    User,
    UserSettings,
    Meeting,
    MeetingParticipant,
    PatientLink,
    ConsultationSession,
    TranscriptEntry,
]


def main() -> None:
    if settings.db_dialect.startswith("sqlite"):
        print("DB_DIALECT still points at sqlite — set DB_* to the MySQL nymeet connection in .env first.")
        sys.exit(1)

    target_url = build_database_url()
    source_engine = create_engine(SOURCE_DATABASE_URL)
    target_engine = create_engine(target_url)

    print(f"Source: {SOURCE_DATABASE_URL}")
    print(f"Target: {target_url.render_as_string(hide_password=True)}")

    Base.metadata.create_all(bind=target_engine)

    with Session(source_engine) as source, Session(target_engine) as target:
        for model in MODELS_IN_ORDER:
            rows = source.query(model).all()
            for row in rows:
                source.expunge(row)
                make_transient(row)
                target.merge(row)
            target.commit()
            print(f"{model.__tablename__}: {len(rows)} rows migrated")

    print("Done.")


if __name__ == "__main__":
    main()
