import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
LOCAL_SQLITE_PATH = BASE_DIR / "instance" / "Wpay.sqlite3"
LOCAL_SQLITE_URI = f"sqlite:///{LOCAL_SQLITE_PATH}"


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET") or "Wpay-dev-secret"
    JWT_SECRET = os.getenv("JWT_SECRET") or SECRET_KEY
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL") or LOCAL_SQLITE_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 240,
    }
    TEST_ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "test21@gmail.com")
    TEST_ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "test21@gmail.com")
    COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://www.sinzouae.com")
    GATEWAY_CREDENTIAL_ENCRYPTION_KEY = os.getenv(
        "GATEWAY_CREDENTIAL_ENCRYPTION_KEY", ""
    )
    BANK_VERIFICATION_INTERNAL_SECRET = os.getenv(
        "BANK_VERIFICATION_INTERNAL_SECRET", ""
    )

    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
            "postgres://", "postgresql://", 1
        )


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    COOKIE_SECURE = False
    BANK_VERIFICATION_INTERNAL_SECRET = "test-bank-verification-secret"
