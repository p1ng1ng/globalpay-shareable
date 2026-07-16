from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from sqlalchemy import inspect, text

from config import Config
from extensions import db
from models import (
    AuditLog,
    BankCredentialTemplate,
    BankRailRoute,
    BankVerificationJob,
    Chargeback,
    FinanceSettings,
    GatewayCredentialTemplate,
    InternalBankRail,
    Merchant,
    MerchantBankAccount,
    MerchantPricing,
    MidPool,
    OtpAlert,
    OtpDevice,
    OtpEvent,
    PaymentLink,
    PipeRoute,
    Payout,
    Refund,
    Settlement,
    Transaction,
    UsdtSettlement,
    User,
    ensure_test_admin,
    utcnow,
)
from routes import api


BASE_DIR = Path(__file__).resolve().parent


def load_environment() -> None:
    load_dotenv(BASE_DIR / ".env")
    load_dotenv(BASE_DIR / ".env.local", override=True)
    if os.getenv("FLASK_ENV") == "production":
        load_dotenv(BASE_DIR / ".env.production.local", override=True)


def create_app(config_object: type[Config] | None = None) -> Flask:
    load_environment()

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object or Config)
    refresh_runtime_config(app)

    db.init_app(app)
    CORS(
        app,
        origins=[origin.strip() for origin in app.config["CORS_ORIGINS"].split(",") if origin.strip()],
        supports_credentials=True,
    )
    app.register_blueprint(api)

    @app.cli.command("init-db")
    def init_db_command():
        init_database(app)
        print("Initialized Wpay Flask database.")

    @app.cli.command("seed-dev")
    def seed_dev_command():
        init_database(app)
        seed_dev_data(app)
        print("Seeded Wpay Flask development data.")

    @app.cli.command("migrate-gateway-credentials")
    def migrate_gateway_credentials_command():
        with app.app_context():
            imported = migrate_gateway_credentials_from_environment()
            db.session.commit()
        print(
            "Imported gateway credentials into "
            f"{imported['templates']} template(s) and {imported['midPools']} MID pool(s)."
        )

    @app.cli.command("clear-merchant-data")
    def clear_merchant_data_command():
        with app.app_context():
            deleted = clear_merchant_data()
            ensure_defaults(app)
            db.session.commit()
        print(f"Cleared merchant data: {deleted}")

    with app.app_context():
        if os.getenv("AUTO_INIT_DB", "true").lower() == "true":
            db.create_all()
            run_compatibility_migrations()

            ensure_defaults(app)

    return app

# Continue with rest of the file... (copy from original backend/app.py)
