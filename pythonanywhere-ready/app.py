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


BASE_DIR = Path(__file__).resolve().parent.parent


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
            db.session.commit()

    return app


def refresh_runtime_config(app: Flask) -> None:
    if app.config.get("TESTING"):
        return

    secret = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET") or app.config["SECRET_KEY"]
    app.config["SECRET_KEY"] = secret
    app.config["JWT_SECRET"] = os.getenv("JWT_SECRET") or secret

    is_production = os.getenv("FLASK_ENV", "").lower() == "production"
    database_url = os.getenv("DATABASE_URL") or app.config["SQLALCHEMY_DATABASE_URI"]
    if is_production and not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required in production")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    if is_production and not database_url.startswith("postgresql://"):
        raise RuntimeError("Production must use a PostgreSQL DATABASE_URL")
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url

    app.config["TEST_ADMIN_EMAIL"] = os.getenv(
        "TEST_ADMIN_EMAIL", app.config["TEST_ADMIN_EMAIL"]
    )
    app.config["TEST_ADMIN_PASSWORD"] = os.getenv(
        "TEST_ADMIN_PASSWORD", app.config["TEST_ADMIN_PASSWORD"]
    )
    app.config["COOKIE_SECURE"] = (
        os.getenv("COOKIE_SECURE", str(app.config["COOKIE_SECURE"]))
        .lower()
        in {"1", "true", "yes"}
    )
    app.config["CORS_ORIGINS"] = os.getenv("CORS_ORIGINS", app.config["CORS_ORIGINS"])
    app.config["PUBLIC_APP_URL"] = os.getenv(
        "PUBLIC_APP_URL", app.config["PUBLIC_APP_URL"]
    ).rstrip("/")
    app.config["GATEWAY_CREDENTIAL_ENCRYPTION_KEY"] = os.getenv(
        "GATEWAY_CREDENTIAL_ENCRYPTION_KEY",
        app.config.get("GATEWAY_CREDENTIAL_ENCRYPTION_KEY", ""),
    )
    app.config["BANK_VERIFICATION_INTERNAL_SECRET"] = os.getenv(
        "BANK_VERIFICATION_INTERNAL_SECRET",
        app.config.get("BANK_VERIFICATION_INTERNAL_SECRET", ""),
    )


def init_database(app: Flask) -> None:
    with app.app_context():
        db.create_all()
        run_compatibility_migrations()
        ensure_defaults(app)
        db.session.commit()


def run_compatibility_migrations() -> None:
    additions = {
        "payment_links": {
            "notify_url": "TEXT NOT NULL DEFAULT ''",
            "callback_secret": "VARCHAR(255) NOT NULL DEFAULT ''",
            "success_redirect_url": "TEXT NOT NULL DEFAULT ''",
            "failed_redirect_url": "TEXT NOT NULL DEFAULT ''",
            "merchant_mid_allocation_id": "VARCHAR(80) NOT NULL DEFAULT ''",
        },
        "transactions": {
            "merchant_callback_status": "VARCHAR(32) NOT NULL DEFAULT ''",
            "merchant_callback_response": "TEXT NOT NULL DEFAULT ''",
            "merchant_callback_sent_at": "TIMESTAMP NULL",
            "mid_pool_id": "VARCHAR(80) NOT NULL DEFAULT ''",
            "payment_target": "TEXT NOT NULL DEFAULT ''",
            "payment_url": "TEXT NOT NULL DEFAULT ''",
            "hosted_payment_url": "TEXT NOT NULL DEFAULT ''",
            "upi_link": "TEXT NOT NULL DEFAULT ''",
            "qr_payload": "TEXT NOT NULL DEFAULT ''",
            "expires_at": "TIMESTAMP NULL",
            "route_type": "VARCHAR(32) NOT NULL DEFAULT 'gateway'",
            "bank_rail_id": "VARCHAR(120) NOT NULL DEFAULT ''",
            "utr_submitted_at": "TIMESTAMP NULL",
            "utr_verification_status": "VARCHAR(32) NOT NULL DEFAULT 'not_submitted'",
            "utr_verified_at": "TIMESTAMP NULL",
            "bank_reference_id": "VARCHAR(160) NOT NULL DEFAULT ''",
            "bank_posted_at": "TIMESTAMP NULL",
            "verification_attempts": "INTEGER NOT NULL DEFAULT 0",
            "verification_notes": "TEXT NOT NULL DEFAULT ''",
        },
        "payouts": {
            "provider": "VARCHAR(80) NOT NULL DEFAULT ''",
            "provider_txn_id": "VARCHAR(160) NOT NULL DEFAULT ''",
            "provider_status": "VARCHAR(80) NOT NULL DEFAULT ''",
            "provider_response": "TEXT NOT NULL DEFAULT ''",
            "merchant_callback_status": "VARCHAR(32) NOT NULL DEFAULT ''",
            "merchant_callback_response": "TEXT NOT NULL DEFAULT ''",
            "merchant_callback_sent_at": "TIMESTAMP NULL",
            "submitted_at": "TIMESTAMP NULL",
            "paid_at": "TIMESTAMP NULL",
            "failed_at": "TIMESTAMP NULL",
        },
        "merchants": {
            "paybook_brand_name": "VARCHAR(120) NOT NULL DEFAULT ''",
            "paybook_subtitle": "VARCHAR(160) NOT NULL DEFAULT 'Secure checkout'",
            "paybook_vendor_label": "VARCHAR(160) NOT NULL DEFAULT ''",
            "paybook_accent_color": "VARCHAR(16) NOT NULL DEFAULT '#087f5b'",
            "paybook_support_text": "VARCHAR(220) NOT NULL DEFAULT 'Encrypted checkout. Your UPI PIN stays inside your payment app.'",
            "paybook_logo_text": "VARCHAR(8) NOT NULL DEFAULT ''",
            "paybook_show_powered_by": "BOOLEAN NOT NULL DEFAULT TRUE",
            "payme_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
            "paybook_config": "TEXT NOT NULL DEFAULT '{}'",
            "webhook_payin_url": "TEXT NOT NULL DEFAULT ''",
            "webhook_payout_url": "TEXT NOT NULL DEFAULT ''",
            "webhook_secret": "VARCHAR(255) NOT NULL DEFAULT ''",
            "default_success_redirect_url": "TEXT NOT NULL DEFAULT ''",
            "default_failed_redirect_url": "TEXT NOT NULL DEFAULT ''",
            "api_ip_whitelist": "TEXT NOT NULL DEFAULT ''",
        },
        "users": {
            "employee_roles": "TEXT NOT NULL DEFAULT '[]'",
        },
        "pipe_routes": {
            "commission_percent": "NUMERIC(8, 3) NOT NULL DEFAULT 0",
            "payin_status": "VARCHAR(32) NOT NULL DEFAULT 'active'",
            "payout_status": "VARCHAR(32) NOT NULL DEFAULT 'active'",
        },
        "mid_pools": {
            "credential_template_id": "INTEGER NULL",
            "payin_status": "VARCHAR(32) NOT NULL DEFAULT 'active'",
            "payout_status": "VARCHAR(32) NOT NULL DEFAULT 'active'",
        },
    }
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    for table_name, columns in additions.items():
        if table_name not in table_names:
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, definition in columns.items():
            if column_name in existing:
                continue
            db.session.execute(
                text(
                    f'ALTER TABLE "{table_name}" '
                    f'ADD COLUMN "{column_name}" {definition}'
                )
            )
    if "transactions" in table_names:
        db.session.execute(
            text(
                "UPDATE transactions SET paid_at = NULL "
                "WHERE paid_at IS NOT NULL "
                "AND LOWER(status) NOT IN "
                "('success', 'successful', 'paid', 'completed', 'captured', 'approved')"
            )
        )
    db.session.commit()


def ensure_defaults(app: Flask) -> None:
    if not FinanceSettings.query.filter_by(key="default").first():
        db.session.add(FinanceSettings(key="default"))
    ensure_test_admin(app.config["TEST_ADMIN_EMAIL"], app.config["TEST_ADMIN_PASSWORD"])


def clear_merchant_data() -> dict[str, int]:
    tables = [
        BankVerificationJob,
        Transaction,
        PaymentLink,
        Payout,
        Settlement,
        Refund,
        Chargeback,
        UsdtSettlement,
        MerchantBankAccount,
        MerchantPricing,
        BankRailRoute,
        PipeRoute,
        Merchant,
    ]
    deleted: dict[str, int] = {}
    for model in tables:
        count = model.query.delete(synchronize_session=False)
        deleted[model.__tablename__] = int(count or 0)

    audit_count = AuditLog.query.filter(
        (AuditLog.merchant_email != "") | (AuditLog.actor_role == "merchant")
    ).delete(synchronize_session=False)
    deleted["merchant_audit_logs"] = int(audit_count or 0)

    user_count = User.query.filter(
        (User.role == "merchant") | (User.merchant_email != "")
    ).delete(synchronize_session=False)
    deleted["merchant_users"] = int(user_count or 0)
    return deleted


def seed_dev_data(app: Flask) -> None:
    from models import Merchant, Transaction

    with app.app_context():
        ensure_defaults(app)
        merchant = Merchant.query.filter_by(email="merchant@example.com").first()
        if not merchant:
            merchant = Merchant(
                business_name="Demo Merchant",
                owner_name="Demo Owner",
                email="merchant@example.com",
                phone="9999999999",
                business_type="Online Business",
                status="active",
                activation_count=1,
            )
            merchant.ensure_credentials()
            db.session.add(merchant)
            db.session.flush()

        if not Transaction.query.filter_by(transaction_id="txn_demo_success").first():
            db.session.add(
                Transaction(
                    transaction_id="txn_demo_success",
                    payment_link_id="plink_demo",
                    merchant_email=merchant.email,
                    title="Demo successful payment",
                    amount=12500,
                    status="success",
                    gateway="Demo Gateway",
                    paid_at=utcnow(),
                )
            )
        if not Transaction.query.filter_by(transaction_id="txn_demo_failed").first():
            db.session.add(
                Transaction(
                    transaction_id="txn_demo_failed",
                    payment_link_id="plink_demo_failed",
                    merchant_email=merchant.email,
                    title="Demo failed payment",
                    amount=3200,
                    status="failed",
                    gateway="Demo Gateway",
                )
            )
        db.session.commit()


def migrate_gateway_credentials_from_environment() -> dict[str, int]:
    imported_templates = 0
    imported_pools = 0

    providers = [
        {
            "name": "RockyPayz production",
            "gateway": "RockyPayz",
            "mid": str(os.getenv("ROCKYPAYZ_MID") or "").strip(),
            "apiKey": str(os.getenv("ROCKYPAYZ_API_KEY") or "").strip(),
            "baseUrl": str(os.getenv("ROCKYPAYZ_BASE_URL") or "").strip(),
            "custom": [
                ("loginId", "Login ID", os.getenv("ROCKYPAYZ_LOGIN_ID") or ""),
                ("mobile", "Mobile", os.getenv("ROCKYPAYZ_MOBILE") or os.getenv("ROCKYPAYZ_LOGIN_ID") or ""),
                ("password", "Password", os.getenv("ROCKYPAYZ_PASSWORD") or ""),
                (
                    "createOrderUrl",
                    "Create Order URL",
                    os.getenv("ROCKYPAYZ_CREATE_ORDER_URL") or "",
                ),
                (
                    "statusUrl",
                    "Status URL",
                    os.getenv("ROCKYPAYZ_STATUS_URL") or "",
                ),
                (
                    "payoutUrl",
                    "Payout URL",
                    os.getenv("ROCKYPAYZ_PAYOUT_URL") or "",
                ),
                (
                    "payoutStatusUrl",
                    "Payout Status URL",
                    os.getenv("ROCKYPAYZ_PAYOUT_STATUS_URL") or "",
                ),
                ("payinRoute", "Payin Route", os.getenv("ROCKYPAYZ_ROUTE") or "2"),
                (
                    "statusRoute",
                    "Status Route",
                    os.getenv("ROCKYPAYZ_STATUS_ROUTE")
                    or os.getenv("ROCKYPAYZ_ROUTE")
                    or "2",
                ),
                (
                    "payoutRoute",
                    "Payout Route",
                    os.getenv("ROCKYPAYZ_PAYOUT_ROUTE") or "1",
                ),
                (
                    "payoutStatusRoute",
                    "Payout Status Route",
                    os.getenv("ROCKYPAYZ_PAYOUT_STATUS_ROUTE") or "0",
                ),
                ("payinMinAmount", "Pay-in Min Amount", os.getenv("ROCKYPAYZ_PAYIN_MIN_AMOUNT") or "100"),
                ("payinMaxAmount", "Pay-in Max Amount", os.getenv("ROCKYPAYZ_PAYIN_MAX_AMOUNT") or "100000"),
                ("payoutMinAmount", "Payout Min Amount", os.getenv("ROCKYPAYZ_PAYOUT_MIN_AMOUNT") or "100"),
                ("payoutMaxAmount", "Payout Max Amount", os.getenv("ROCKYPAYZ_PAYOUT_MAX_AMOUNT") or "50000"),
                ("payoutEnabled", "Payout Enabled", os.getenv("ROCKYPAYZ_PAYOUT_ENABLED") or "true"),
            ],
        },
        {
            "name": "RupayEx production",
            "gateway": "RupayEx",
            "mid": str(os.getenv("RUPAYEX_MID") or "rupayex-default").strip(),
            "apiKey": str(
                os.getenv("RUPAYEX_API_TOKEN")
                or os.getenv("RUPAYEX_USER_TOKEN")
                or ""
            ).strip(),
            "baseUrl": str(
                os.getenv("RUPAYEX_API_BASE_URL")
                or os.getenv("RUPAYEX_BASE_URL")
                or ""
            ).strip(),
            "custom": [
                ("payoutEnabled", "Payout Enabled", os.getenv("RUPAYEX_PAYOUT_ENABLED") or "true"),
            ],
        },
        {
            "name": "Alosheell production",
            "gateway": "Alosheell",
            "mid": str(os.getenv("ALOSHEELL_MID") or "alosheell-proxy").strip(),
            "apiKey": str(
                os.getenv("ALOSHEELL_PROXY_SECRET")
                or os.getenv("ALOSHEELL_TOKEN_KEY")
                or ""
            ).strip(),
            "baseUrl": "",
            "custom": [
                ("proxyUrl", "Proxy URL", os.getenv("ALOSHEELL_PROXY_URL") or ""),
                ("proxySecret", "Proxy Secret", os.getenv("ALOSHEELL_PROXY_SECRET") or ""),
                ("userIp", "User IP", os.getenv("ALOSHEELL_USER_IP") or ""),
                ("loginId", "Login ID", os.getenv("ALOSHEELL_USER_NAME") or ""),
                ("mobile", "Mobile", os.getenv("ALOSHEELL_MOBILE") or os.getenv("ALOSHEELL_USER_NAME") or ""),
                ("password", "Password", os.getenv("ALOSHEELL_PASSWORD") or ""),
                ("tokenKey", "Token Key", os.getenv("ALOSHEELL_TOKEN_KEY") or ""),
                ("payinMinAmount", "Pay-in Min Amount", os.getenv("ALOSHEELL_PAYIN_MIN_AMOUNT") or "300"),
                ("payinMaxAmount", "Pay-in Max Amount", os.getenv("ALOSHEELL_PAYIN_MAX_AMOUNT") or "5000"),
                ("payoutMinAmount", "Payout Min Amount", os.getenv("ALOSHEELL_PAYOUT_MIN_AMOUNT") or "100"),
                ("payoutMaxAmount", "Payout Max Amount", os.getenv("ALOSHEELL_PAYOUT_MAX_AMOUNT") or "40000"),
                ("payinCostPercent", "Pay-in Cost Percent", os.getenv("ALOSHEELL_PAYIN_COST_PERCENT") or "2.68"),
                ("payoutCostPercent", "Payout Cost Percent", os.getenv("ALOSHEELL_PAYOUT_COST_PERCENT") or "2.18"),
                ("tokenUrl", "Token URL", os.getenv("ALOSHEELL_TOKEN_URL") or "https://apipanel.alosheell.com/auth/user/generateToken"),
                ("payinApiUrl", "Pay-in API URL", os.getenv("ALOSHEELL_PAYIN_API_URL") or "https://apipanel.alosheell.com/api/v1/Payin"),
                ("payoutApiUrl", "Payout API URL", os.getenv("ALOSHEELL_PAYOUT_API_URL") or os.getenv("ALOSHEELL_PAYOUT_URL") or "https://apipanel.alosheell.com/auth/payout/payoutApi"),
                ("fundTransferType", "Fund Transfer Type", os.getenv("ALOSHEELL_FUND_TRANSFER_TYPE") or "imps"),
                ("lat", "Latitude", os.getenv("ALOSHEELL_LAT") or "22.8031731"),
                ("long", "Longitude", os.getenv("ALOSHEELL_LONG") or "22.8031731"),
                ("payoutProxyUrl", "Payout Proxy URL", os.getenv("ALOSHEELL_PAYOUT_PROXY_URL") or os.getenv("ALOSHEELL_PAYOUT_URL") or ""),
                ("payoutProxySecret", "Payout Proxy Secret", os.getenv("ALOSHEELL_PAYOUT_PROXY_SECRET") or os.getenv("ALOSHEELL_PROXY_SECRET") or ""),
                ("payoutEnabled", "Payout Enabled", os.getenv("ALOSHEELL_PAYOUT_ENABLED") or "false"),
            ],
        },
    ]

    for provider in providers:
        if not provider["apiKey"] or not provider["mid"]:
            continue
        template = GatewayCredentialTemplate.query.filter_by(
            name=provider["name"]
        ).first()
        fields = [
            {"key": "apiKey", "label": "API Key", "type": "secret", "common": True},
            {"key": "mode", "label": "Mode", "type": "mode", "common": True},
        ]
        values = {"apiKey": provider["apiKey"], "mode": "production"}
        if provider["baseUrl"]:
            fields.append(
                {
                    "key": "baseUrl",
                    "label": "Base URL",
                    "type": "text",
                    "common": False,
                }
            )
            values["baseUrl"] = provider["baseUrl"]
        for key, label, value in provider["custom"]:
            if not str(value or "").strip():
                continue
            fields.append(
                {
                    "key": key,
                    "label": label,
                    "type": "text",
                    "common": False,
                }
            )
            values[key] = str(value)

        if not template:
            template = GatewayCredentialTemplate(
                name=provider["name"],
                status="active",
                created_by="environment-migration",
                updated_by="environment-migration",
            )
            template.set_field_definitions(fields)
            template.set_credentials(values)
            db.session.add(template)
            db.session.flush()
            imported_templates += 1
        elif template.created_by == "environment-migration":
            template.set_field_definitions(fields)
            template.set_credentials(values)
            template.updated_by = "environment-migration"

        pool = MidPool.query.filter_by(mid_id=provider["mid"]).first()
        if not pool:
            pool = MidPool(
                gateway_name=provider["gateway"],
                mid_name=f"{provider['gateway']} primary MID",
                mid_id=provider["mid"],
                total_limit=1_000_000_000,
                cycle="monthly",
                status="active",
                notes="Created during environment credential migration",
                credential_template_id=template.id,
            )
            db.session.add(pool)
            imported_pools += 1
        elif not pool.credential_template_id:
            pool.credential_template_id = template.id

    return {"templates": imported_templates, "midPools": imported_pools}
