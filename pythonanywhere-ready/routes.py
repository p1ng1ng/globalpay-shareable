from __future__ import annotations

import json
import os
import re
import secrets
import base64
from io import BytesIO
from datetime import datetime, timezone
from datetime import timedelta
from ipaddress import ip_network
from urllib.parse import urlencode, urlparse

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import or_, text
from sqlalchemy.exc import OperationalError
from werkzeug.security import generate_password_hash
import pyotp
import qrcode

from auth import (
    clear_auth_cookies,
    create_token,
    current_user,
    require_roles,
    set_auth_cookies,
    verify_password,
)
from extensions import db
from credential_crypto import CredentialEncryptionError
from merchant_webhooks import (
    MerchantWebhookError,
    callback_signature,
    deliver_callback,
)
from models import (
    AuditLog,
    BankCredentialTemplate,
    BankRailRoute,
    BankVerificationJob,
    Chargeback,
    DeviceActivationCode,
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
    iso,
    utcnow,
)
from rockypayz import (
    RockyPayzError,
    check_order_status as check_rockypayz_order_status,
    check_payout_status as check_rockypayz_payout_status,
    create_order as create_rockypayz_order,
    extract_upi_intent,
    is_failed as is_rockypayz_failed,
    is_paid as is_rockypayz_paid,
    payout_reference as rockypayz_payout_reference,
    payment_target,
    submit_payout as submit_rockypayz_provider_payout,
    transaction_reference as rockypayz_transaction_reference,
    transaction_status as rockypayz_transaction_status,
    transaction_utr as rockypayz_transaction_utr,
)
from rupayex import (
    RupayExError,
    check_order_status as check_rupayex_order_status,
    check_payout_status as check_rupayex_payout_status,
    create_order as create_rupayex_order,
    extract_upi_intent as extract_rupayex_upi_intent,
    is_failed as is_rupayex_failed,
    is_paid as is_rupayex_paid,
    order_reference as rupayex_order_reference,
    payment_url as rupayex_payment_url,
    payout_reference as rupayex_payout_reference,
    payout_status as rupayex_payout_status,
    submit_payout as submit_rupayex_payout,
    transaction_status as rupayex_transaction_status,
    transaction_utr as rupayex_transaction_utr,
)
from alosheell import (
    AlosheellError,
    callback_amount as alosheell_callback_amount,
    client_reference as alosheell_client_reference,
    create_order as create_alosheell_order,
    is_failed as is_alosheell_failed,
    is_paid as is_alosheell_paid,
    payment_target as alosheell_payment_target,
    payout_provider_reference as alosheell_payout_provider_reference,
    payout_reference as alosheell_payout_reference,
    payout_status as alosheell_payout_status,
    submit_payout as submit_alosheell_payout,
    transaction_reference as alosheell_transaction_reference,
    transaction_status as alosheell_transaction_status,
    transaction_utr as alosheell_transaction_utr,
)

api = Blueprint("api", __name__, url_prefix="/api")

COMMON_CREDENTIAL_FIELDS = {
    "apiKey": {"label": "API Key", "type": "secret"},
    "secretKey": {"label": "Secret Key", "type": "secret"},
    "webhookSecret": {"label": "Webhook Secret", "type": "secret"},
    "mode": {"label": "Mode", "type": "mode"},
}
CUSTOM_CREDENTIAL_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_]{1,63}$")


def money(value) -> float:
    return round(float(value or 0), 2)


def gateway_key(value: str) -> str:
    normalized = str(value or "").strip().lower().replace(" ", "")
    if normalized in {"rupayex", "rupay", "rupay-ex"} or "rupay" in normalized:
        return "rupayex"
    if normalized in {"rockypayz", "rockypay"} or "rocky" in normalized:
        return "rockypayz"
    if (
        normalized in {"alosheell", "alooshell", "aloshell"}
        or "alosheell" in normalized
        or "alooshell" in normalized
    ):
        return "alosheell"
    return normalized


def payload() -> dict:
    return request.get_json(silent=True) or {}


def callback_payload() -> dict:
    body = request.get_json(silent=True)
    if isinstance(body, list):
        body = body[0] if body else {}
    if isinstance(body, dict):
        return body
    form_body = request.form.to_dict(flat=True)
    if form_body:
        return form_body
    raw_text = request.get_data(as_text=True) or ""
    if raw_text:
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, dict):
                return parsed
        except ValueError:
            return {"rawText": raw_text}
    return {}


def expire_stale_payments(*, merchant_email: str = "") -> dict:
    now = utcnow()
    txn_cutoff = now - timedelta(minutes=15)
    link_cutoff = now - timedelta(minutes=30)

    txn_query = Transaction.query.filter(
        Transaction.status.in_(("pending", "processing", "initiated", "txn")),
        Transaction.created_at <= txn_cutoff,
    )
    link_query = PaymentLink.query.filter(
        PaymentLink.status == "active",
        PaymentLink.created_at <= link_cutoff,
    )
    if merchant_email:
        txn_query = txn_query.filter_by(merchant_email=merchant_email)
        link_query = link_query.filter_by(merchant_email=merchant_email)

    expired_transactions = 0
    expired_links = 0
    link_ids_from_transactions: set[str] = set()

    for transaction in txn_query.all():
        transaction.status = "failed"
        transaction.paid_at = None
        if transaction.payment_link_id:
            link_ids_from_transactions.add(transaction.payment_link_id)
        expired_transactions += 1

    for link_id in link_ids_from_transactions:
        link = PaymentLink.query.filter_by(link_id=link_id).first()
        if link and link.status == "active":
            link.status = "failed"
            expired_links += 1

    for link in link_query.all():
        link.status = "failed"
        expired_links += 1

    if expired_transactions or expired_links:
        db.session.commit()

    return {
        "expiredTransactions": expired_transactions,
        "expiredLinks": expired_links,
    }


def find_payin_transaction(
    reference: str,
    *,
    provider: str = "",
) -> Transaction | None:
    reference = str(reference or "").strip()
    if not reference:
        return None
    query = Transaction.query.filter(
        or_(
            Transaction.transaction_id == reference,
            Transaction.gateway_transaction_id == reference,
        )
    )
    provider_key = gateway_key(provider)
    if provider_key:
        query = query.filter(
            db.func.lower(Transaction.provider) == provider_key
        )
    try:
        return query.order_by(Transaction.created_at.desc()).first()
    except OperationalError:
        db.session.rollback()
        return query.order_by(Transaction.created_at.desc()).first()


def find_rockypayz_transaction(reference: str) -> Transaction | None:
    return find_payin_transaction(reference, provider="rockypayz")


def pool_for_route(route: PipeRoute | None) -> MidPool | None:
    if not route or not str(route.mid_pool_id or "").isdigit():
        return None
    return db.session.get(MidPool, int(route.mid_pool_id))


def status_allows(value: str, *, allow_empty: bool = True) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return allow_empty
    return normalized == "active"


def route_active_for(route: PipeRoute | None, direction: str) -> bool:
    if not route or not status_allows(route.status):
        return False
    if direction == "payout":
        return status_allows(route.payout_status or route.status)
    return status_allows(route.payin_status or route.status)


def pool_active_for(pool: MidPool | None, direction: str) -> bool:
    if not pool or not status_allows(pool.status) or not pool.credential_template:
        return False
    if direction == "payout":
        return status_allows(pool.payout_status or pool.status)
    return status_allows(pool.payin_status or pool.status)


def active_pool_for_route(route: PipeRoute | None, direction: str = "payin") -> MidPool | None:
    pool = pool_for_route(route)
    if not route_active_for(route, direction) or not pool_active_for(pool, direction):
        return None
    return pool


def configured_pool_for_gateway(
    gateway_name: str, *, merchant_email: str = "", direction: str = "payin"
) -> MidPool | None:
    normalized = str(gateway_name or "").strip().lower()
    if not normalized:
        return None

    if merchant_email:
        routes = (
            PipeRoute.query.filter_by(
                merchant_email=merchant_email,
                status="active",
            )
            .order_by(PipeRoute.priority.asc(), PipeRoute.created_at.asc())
            .all()
        )
        for route in routes:
            route_gateway = str(route.gateway_name or "").strip().lower()
            if normalized not in route_gateway and route_gateway not in normalized:
                continue
            pool = active_pool_for_route(route, direction)
            if pool:
                return pool

    pools = MidPool.query.filter_by(status="active").order_by(MidPool.created_at.asc())
    for pool in pools:
        pool_gateway = str(pool.gateway_name or "").strip().lower()
        if (
            (normalized in pool_gateway or pool_gateway in normalized)
            and pool_active_for(pool, direction)
        ):
            return pool
    return None


def gateway_credentials(pool: MidPool | None) -> dict[str, str]:
    if not pool:
        raise CredentialEncryptionError(
            "No configured MID with gateway credentials is available"
        )
    template = pool.credential_template
    if not template or template.status != "active":
        raise CredentialEncryptionError(
            f"MID {pool.mid_name} has no active credential template"
        )
    credentials = template.get_credentials()
    credentials["mid"] = pool.mid_id
    credentials["gatewayName"] = pool.gateway_name
    credentials["midPoolId"] = str(pool.id)
    return credentials


def payout_gateway_enabled(gateway_name: str, credentials: dict[str, str]) -> bool:
    raw = str(
        credentials.get("payoutEnabled")
        or credentials.get("payout_enabled")
        or credentials.get("payout_enabled_status")
        or "true"
    ).strip().lower()
    if raw in {"0", "false", "no", "off", "disabled", "paused"}:
        return False

    gateway = gateway_key(gateway_name)
    if gateway == "alosheell":
        user_name = str(
            credentials.get("userName")
            or credentials.get("user_name")
            or credentials.get("loginId")
            or credentials.get("mobile")
            or os.getenv("ALOSHEELL_USER_NAME")
            or os.getenv("ALOSHEELL_MOBILE")
            or ""
        ).strip()
        password = str(
            credentials.get("password")
            or os.getenv("ALOSHEELL_PASSWORD")
            or ""
        ).strip()
        token_key = str(
            credentials.get("tokenKey")
            or credentials.get("token_key")
            or os.getenv("ALOSHEELL_TOKEN_KEY")
            or ""
        ).strip()
        return bool(
            user_name
            and password
            and token_key
            and str(
                credentials.get("payoutApiUrl")
                or credentials.get("payoutUrl")
                or os.getenv("ALOSHEELL_PAYOUT_API_URL")
                or os.getenv("ALOSHEELL_PAYOUT_URL")
                or "https://apipanel.alosheell.com/auth/payout/payoutApi"
            ).strip()
        )
    return True


def selected_payin_context(
    payment_link: PaymentLink,
) -> tuple[str, MidPool, dict[str, str]]:
    forced_gateway = gateway_key(os.getenv("FORCE_PAYIN_GATEWAY") or "")
    if forced_gateway:
        pool = configured_pool_for_gateway(
            forced_gateway, merchant_email=payment_link.merchant_email, direction="payin"
        )
        return forced_gateway, pool, gateway_credentials(pool)

    selected_route = (
        db.session.get(PipeRoute, int(payment_link.merchant_mid_allocation_id))
        if str(payment_link.merchant_mid_allocation_id or "").isdigit()
        else None
    )
    if (
        selected_route
        and selected_route.merchant_email == payment_link.merchant_email
        and route_active_for(selected_route, "payin")
    ):
        pool = active_pool_for_route(selected_route, "payin")
        if pool:
            return gateway_key(selected_route.gateway_name), pool, gateway_credentials(pool)
        raise CredentialEncryptionError(
            "Selected merchant MID is paused or missing active gateway credentials"
        )

    routes = (
        PipeRoute.query.filter(
            PipeRoute.merchant_email == payment_link.merchant_email,
            PipeRoute.status == "active",
            PipeRoute.payin_status == "active",
            PipeRoute.min_amount <= payment_link.amount,
            PipeRoute.max_amount >= payment_link.amount,
        )
        .order_by(PipeRoute.priority.asc(), PipeRoute.created_at.asc())
        .all()
    )
    for route in routes:
        pool = active_pool_for_route(route, "payin")
        if not pool:
            continue
        gateway = gateway_key(route.gateway_name)
        return gateway, pool, gateway_credentials(pool)

    merchant = Merchant.query.filter_by(email=payment_link.merchant_email).first()
    gateway = gateway_key(merchant.gateway_assigned if merchant else "") or "rockypayz"
    pool = configured_pool_for_gateway(
        gateway, merchant_email=payment_link.merchant_email, direction="payin"
    )
    return gateway, pool, gateway_credentials(pool)


def bank_rail_active_for(rail: InternalBankRail | None, amount: float) -> bool:
    if not rail:
        return False
    if rail.status != "active" or rail.payin_status != "active":
        return False
    if amount < float(rail.min_amount or 0) or amount > float(rail.max_amount or 0):
        return False
    daily_limit = float(rail.daily_limit or 0)
    monthly_limit = float(rail.monthly_limit or 0)
    if daily_limit and float(rail.used_volume_daily or 0) >= daily_limit:
        return False
    if monthly_limit and float(rail.used_volume_monthly or 0) >= monthly_limit:
        return False
    return bool(rail.upi_id and rail.payee_name)


def bank_rail_route_active_for(
    route: BankRailRoute | None,
    rail: InternalBankRail | None,
    amount: float,
) -> bool:
    if not route or route.status != "active" or route.payin_status != "active":
        return False
    if amount < float(route.min_amount or 0) or amount > float(route.max_amount or 0):
        return False
    volume_limit = float(route.volume_limit or 0)
    if volume_limit and float(route.used_volume or 0) >= volume_limit:
        return False
    return bank_rail_active_for(rail, amount)


def selected_bank_rail_context(payment_link: PaymentLink) -> dict | None:
    amount = float(payment_link.amount or 0)
    routes = (
        BankRailRoute.query.filter(
            BankRailRoute.merchant_email == payment_link.merchant_email,
            BankRailRoute.status == "active",
            BankRailRoute.payin_status == "active",
            BankRailRoute.min_amount <= payment_link.amount,
            BankRailRoute.max_amount >= payment_link.amount,
        )
        .order_by(
            BankRailRoute.priority.asc(),
            BankRailRoute.used_volume.asc(),
            BankRailRoute.created_at.asc(),
        )
        .all()
    )
    for route in routes:
        rail = InternalBankRail.query.filter_by(rail_id=route.rail_id).first()
        if bank_rail_route_active_for(route, rail, amount):
            return {"type": "bank_rail", "route": route, "rail": rail}
    return None


def selected_payin_route_context(payment_link: PaymentLink) -> dict:
    bank_context = selected_bank_rail_context(payment_link)
    if bank_context:
        return bank_context
    gateway, pool, credentials = selected_payin_context(payment_link)
    return {
        "type": "gateway",
        "gateway": gateway,
        "pool": pool,
        "credentials": credentials,
    }


def build_upi_pay_url(
    *,
    upi_id: str,
    payee_name: str,
    amount,
    note: str = "",
) -> str:
    params = {
        "pa": str(upi_id or "").strip(),
        "pn": str(payee_name or "").strip(),
        "am": f"{float(amount or 0):.2f}",
        "cu": "INR",
    }
    if note:
        params["tn"] = str(note).strip()[:80]
    if not params["pa"] or "@" not in params["pa"]:
        raise ValueError("Valid UPI ID is required")
    if not params["pn"]:
        raise ValueError("Payee name is required")
    return f"upi://pay?{urlencode(params)}"


def selected_payout_context(
    merchant_email: str,
    amount: float,
    *,
    route_id: str = "",
) -> tuple[str, MidPool, dict[str, str]]:
    selected_route = (
        db.session.get(PipeRoute, int(route_id))
        if str(route_id or "").isdigit()
        else None
    )
    if (
        selected_route
        and selected_route.merchant_email == merchant_email
        and route_active_for(selected_route, "payout")
    ):
        pool = active_pool_for_route(selected_route, "payout")
        if pool:
            gateway = gateway_key(selected_route.gateway_name)
            credentials = gateway_credentials(pool)
            if not payout_gateway_enabled(gateway, credentials):
                raise CredentialEncryptionError(
                    "Selected merchant MID is not enabled for payouts"
                )
            return gateway, pool, credentials
        raise CredentialEncryptionError(
            "Selected merchant MID is paused or missing active gateway credentials"
        )

    routes = (
        PipeRoute.query.filter(
            PipeRoute.merchant_email == merchant_email,
            PipeRoute.status == "active",
            PipeRoute.payout_status == "active",
            PipeRoute.min_amount <= amount,
            PipeRoute.max_amount >= amount,
        )
        .order_by(PipeRoute.priority.asc(), PipeRoute.created_at.asc())
        .all()
    )
    for route in routes:
        pool = active_pool_for_route(route, "payout")
        if not pool:
            continue
        gateway = gateway_key(route.gateway_name)
        credentials = gateway_credentials(pool)
        if not payout_gateway_enabled(gateway, credentials):
            continue
        return gateway, pool, credentials

    merchant = Merchant.query.filter_by(email=merchant_email).first()
    gateway = gateway_key(merchant.gateway_assigned if merchant else "") or "rockypayz"
    pool = configured_pool_for_gateway(gateway, merchant_email=merchant_email, direction="payout")
    credentials = gateway_credentials(pool)
    if not payout_gateway_enabled(gateway, credentials):
        raise CredentialEncryptionError(
            f"{gateway or 'Selected gateway'} is not enabled for payouts"
        )
    return gateway, pool, credentials


def credentials_for_transaction(transaction: Transaction) -> dict[str, str]:
    pool = (
        db.session.get(MidPool, int(transaction.mid_pool_id))
        if str(transaction.mid_pool_id or "").isdigit()
        else None
    )
    if not pool:
        pool = configured_pool_for_gateway(
            transaction.provider or transaction.gateway,
            merchant_email=transaction.merchant_email,
            direction="payin",
        )
    return gateway_credentials(pool)


def credentials_for_payout(payout: Payout, gateway_name: str) -> dict[str, str]:
    pool = configured_pool_for_gateway(
        gateway_name,
        merchant_email=payout.merchant_email,
        direction="payout",
    )
    return gateway_credentials(pool)


def apply_rockypayz_result(reference: str, provider_payload: dict):
    transaction = find_rockypayz_transaction(reference)
    if not transaction:
        return None, None

    payment_link = PaymentLink.query.filter_by(
        link_id=transaction.payment_link_id
    ).first()
    utr = rockypayz_transaction_utr(provider_payload)

    if utr:
        transaction.utr = utr

    if is_rockypayz_paid(provider_payload):
        transaction.status = "success"
        transaction.paid_at = utcnow()
        if payment_link:
            payment_link.status = "paid"
    elif is_rockypayz_failed(provider_payload):
        transaction.status = "failed"
        transaction.paid_at = None
        if payment_link and payment_link.status != "paid":
            payment_link.status = "failed"

    db.session.commit()

    if (
        transaction.status == "success"
        and payment_link
        and payment_link.notify_url
        and transaction.merchant_callback_status != "delivered"
    ):
        result = send_merchant_payment_callback(payment_link, transaction)
        transaction.merchant_callback_status = (
            "delivered" if result.get("delivered") else "failed"
        )
        transaction.merchant_callback_response = str(
            result.get("response") or result.get("error") or ""
        )[:2000]
        transaction.merchant_callback_sent_at = utcnow()
        db.session.commit()

    return transaction, payment_link


def apply_rupayex_result(reference: str, provider_payload: dict):
    transaction = find_payin_transaction(reference, provider="rupayex")
    if not transaction:
        return None, None

    payment_link = PaymentLink.query.filter_by(
        link_id=transaction.payment_link_id
    ).first()
    utr = rupayex_transaction_utr(provider_payload)

    if utr:
        transaction.utr = utr

    if is_rupayex_paid(provider_payload):
        transaction.status = "success"
        transaction.paid_at = utcnow()
        if payment_link:
            payment_link.status = "paid"
    elif is_rupayex_failed(provider_payload):
        transaction.status = "failed"
        transaction.paid_at = None
        if payment_link and payment_link.status != "paid":
            payment_link.status = "failed"

    db.session.commit()

    if (
        transaction.status == "success"
        and payment_link
        and payment_link.notify_url
        and transaction.merchant_callback_status != "delivered"
    ):
        result = send_merchant_payment_callback(payment_link, transaction)
        transaction.merchant_callback_status = (
            "delivered" if result.get("delivered") else "failed"
        )
        transaction.merchant_callback_response = str(
            result.get("response") or result.get("error") or ""
        )[:2000]
        transaction.merchant_callback_sent_at = utcnow()
        db.session.commit()

    return transaction, payment_link


def apply_alosheell_result(reference: str, provider_payload: dict):
    transaction = find_payin_transaction(reference, provider="alosheell")
    if not transaction:
        client_reference = alosheell_client_reference(provider_payload)
        transaction = find_payin_transaction(client_reference, provider="alosheell")
    if not transaction:
        return None, None

    payment_link = PaymentLink.query.filter_by(
        link_id=transaction.payment_link_id
    ).first()
    utr = alosheell_transaction_utr(provider_payload)
    callback_amount = alosheell_callback_amount(
        provider_payload, float(transaction.amount or 0)
    )

    if utr:
        transaction.utr = utr

    amount_matches = round(callback_amount, 2) == round(float(transaction.amount or 0), 2)
    if is_alosheell_paid(provider_payload) and amount_matches:
        transaction.status = "success"
        transaction.paid_at = utcnow()
        if payment_link:
            payment_link.status = "paid"
    elif is_alosheell_failed(provider_payload):
        transaction.status = "failed"
        transaction.paid_at = None
        if payment_link and payment_link.status != "paid":
            payment_link.status = "failed"
    elif is_alosheell_paid(provider_payload) and not amount_matches:
        transaction.status = "failed"
        transaction.paid_at = None
        if payment_link and payment_link.status != "paid":
            payment_link.status = "failed"
        transaction.merchant_callback_status = "blocked"
        transaction.merchant_callback_response = "Alosheell callback amount mismatch"

    db.session.commit()

    if (
        transaction.status == "success"
        and payment_link
        and payment_link.notify_url
        and transaction.merchant_callback_status != "delivered"
    ):
        result = send_merchant_payment_callback(payment_link, transaction)
        transaction.merchant_callback_status = (
            "delivered" if result.get("delivered") else "failed"
        )
        transaction.merchant_callback_response = str(
            result.get("response") or result.get("error") or ""
        )[:2000]
        transaction.merchant_callback_sent_at = utcnow()
        db.session.commit()

    return transaction, payment_link


def find_payout(reference: str) -> Payout | None:
    reference = str(reference or "").strip()
    if not reference:
        return None
    query = Payout.query.filter(
        or_(
            Payout.payout_id == reference,
            Payout.provider_txn_id == reference,
        )
    )
    try:
        payout = query.first()
    except OperationalError:
        db.session.rollback()
        payout = query.first()
    if not payout and reference.isdigit():
        payout = db.session.get(Payout, int(reference))
    return payout


def provider_payout_reference(payout: Payout, *, prefix: str = "GP") -> str:
    existing = str(payout.provider_txn_id or "").strip()
    if existing and len(existing) < 20:
        return existing

    for _ in range(5):
        reference = f"{prefix}{payout.id}{secrets.token_hex(5).upper()}"[:19]
        duplicate = Payout.query.filter(
            Payout.id != payout.id,
            Payout.provider_txn_id == reference,
        ).first()
        if not duplicate:
            payout.provider_txn_id = reference
            db.session.commit()
            return reference

    reference = f"{prefix}{payout.id}{secrets.token_hex(4).upper()}"[:19]
    payout.provider_txn_id = reference
    db.session.commit()
    return reference


def payout_status_from_provider(provider_payload: dict) -> str:
    if is_rockypayz_paid(provider_payload):
        return "paid"
    if is_rockypayz_failed(provider_payload):
        return "failed"
    status = rockypayz_transaction_status(provider_payload)
    if status in {"processing", "pending", "initiated", "txn"}:
        return "processing"
    return "processing"


def update_payout_from_provider(
    payout: Payout,
    provider_payload: dict,
    *,
    submitted: bool = False,
) -> Payout:
    status = payout_status_from_provider(provider_payload)
    reference = rockypayz_payout_reference(provider_payload)
    utr = rockypayz_transaction_utr(provider_payload)

    payout.provider = "rockypayz"
    payout.provider_status = rockypayz_transaction_status(provider_payload) or status
    payout.provider_response = json.dumps(provider_payload, default=str)[:8000]
    if reference:
        payout.provider_txn_id = reference
    if utr:
        payout.utr = utr
    if submitted and not payout.submitted_at:
        payout.submitted_at = utcnow()

    payout.status = status
    if status == "paid" and not payout.paid_at:
        payout.paid_at = utcnow()
    if status == "failed" and not payout.failed_at:
        payout.failed_at = utcnow()
    db.session.commit()

    if status in {"paid", "failed"} and payout.merchant_callback_status != "delivered":
        result = send_merchant_payout_callback(payout)
        if result.get("skipped"):
            payout.merchant_callback_status = ""
            payout.merchant_callback_response = ""
        else:
            payout.merchant_callback_status = (
                "delivered" if result.get("delivered") else "failed"
            )
            payout.merchant_callback_response = str(
                result.get("response") or result.get("error") or ""
            )[:2000]
            payout.merchant_callback_sent_at = utcnow()
    db.session.commit()
    return payout


def update_rupayex_payout_from_provider(
    payout: Payout,
    provider_payload: dict,
    *,
    submitted: bool = False,
) -> Payout:
    status = rupayex_payout_status(provider_payload)
    if submitted and status == "pending":
        status = "processing"
    reference = rupayex_payout_reference(provider_payload)
    utr = rupayex_transaction_utr(provider_payload)

    payout.provider = "rupayex"
    payout.provider_status = rupayex_transaction_status(provider_payload) or status
    payout.provider_response = json.dumps(provider_payload, default=str)[:8000]
    if reference:
        payout.provider_txn_id = reference
    elif not payout.provider_txn_id:
        payout.provider_txn_id = payout.payout_id
    if utr:
        payout.utr = utr
    if submitted and not payout.submitted_at:
        payout.submitted_at = utcnow()

    payout.status = status
    if status == "paid" and not payout.paid_at:
        payout.paid_at = utcnow()
    if status == "failed" and not payout.failed_at:
        payout.failed_at = utcnow()
    db.session.commit()

    if status in {"paid", "failed"} and payout.merchant_callback_status != "delivered":
        result = send_merchant_payout_callback(payout)
        if result.get("skipped"):
            payout.merchant_callback_status = ""
            payout.merchant_callback_response = ""
        else:
            payout.merchant_callback_status = (
                "delivered" if result.get("delivered") else "failed"
            )
            payout.merchant_callback_response = str(
                result.get("response") or result.get("error") or ""
            )[:2000]
            payout.merchant_callback_sent_at = utcnow()
        db.session.commit()
    return payout


def update_alosheell_payout_from_provider(
    payout: Payout,
    provider_payload: dict,
    *,
    submitted: bool = False,
) -> Payout:
    status = alosheell_payout_status(provider_payload)
    reference = (
        alosheell_payout_provider_reference(provider_payload)
        or alosheell_payout_reference(provider_payload)
    )
    utr = alosheell_transaction_utr(provider_payload)

    payout.provider = "alosheell"
    payout.provider_status = status
    payout.provider_response = json.dumps(provider_payload, default=str)[:8000]
    if reference:
        payout.provider_txn_id = reference
    elif not payout.provider_txn_id:
        payout.provider_txn_id = payout.payout_id
    if utr:
        payout.utr = utr
    if submitted and not payout.submitted_at:
        payout.submitted_at = utcnow()

    payout.status = status
    if status == "paid" and not payout.paid_at:
        payout.paid_at = utcnow()
    if status == "failed" and not payout.failed_at:
        payout.failed_at = utcnow()
    db.session.commit()

    if status in {"paid", "failed"} and payout.merchant_callback_status != "delivered":
        result = send_merchant_payout_callback(payout)
        if result.get("skipped"):
            payout.merchant_callback_status = ""
            payout.merchant_callback_response = ""
        else:
            payout.merchant_callback_status = (
                "delivered" if result.get("delivered") else "failed"
            )
            payout.merchant_callback_response = str(
                result.get("response") or result.get("error") or ""
            )[:2000]
            payout.merchant_callback_sent_at = utcnow()
        db.session.commit()
    return payout


def payout_fee_parts(merchant_email: str, amount: float) -> dict:
    settings = settings_row()
    pricing = MerchantPricing.query.filter_by(merchant_email=merchant_email).first()
    merchant_fee_percent = (
        float(pricing.payout_selling_fee_percent)
        if pricing and pricing.payout_selling_fee_percent is not None
        else float(settings.payout_selling_fee_percent or 0)
    )
    provider_cost_percent = 0.0
    merchant_fee_amount = money(amount * merchant_fee_percent / 100)
    provider_cost_amount = money(amount * provider_cost_percent / 100)
    return {
        "merchant_fee_percent": merchant_fee_percent,
        "merchant_fee_amount": merchant_fee_amount,
        "provider_cost_percent": provider_cost_percent,
        "provider_cost_amount": provider_cost_amount,
        "gross_profit_amount": money(merchant_fee_amount - provider_cost_amount),
    }


def payout_summary_for_merchant(merchant_email: str) -> dict:
    payouts = Payout.query.filter_by(merchant_email=merchant_email).all()
    paid = [p for p in payouts if p.status in {"paid", "success", "completed"}]
    pending = [p for p in payouts if p.status in {"pending", "processing", "queued"}]
    failed = [p for p in payouts if p.status in {"failed", "failure", "cancelled"}]
    return {
        "paidAmount": money(sum(float(p.amount or 0) for p in paid)),
        "pendingAmount": money(sum(float(p.amount or 0) for p in pending)),
        "failedAmount": money(sum(float(p.amount or 0) for p in failed)),
        "paidCount": len(paid),
        "pendingCount": len(pending),
        "failedCount": len(failed),
        "merchantFeeCollected": money(sum(float(p.merchant_fee_amount or 0) for p in paid)),
        "providerCost": money(sum(float(p.provider_cost_amount or 0) for p in paid)),
        "grossProfit": money(sum(float(p.gross_profit_amount or 0) for p in paid)),
    }


def merchant_callback_payload(
    payment_link: PaymentLink, transaction: Transaction, event: str = "payment.success"
) -> dict:
    return {
        "event": event,
        "brand": "Wpay",
        "success": event in {"payment.success", "payment.test"},
        "status": "SUCCESS" if event == "payment.success" else "TEST",
        "message": (
            "Payment successful"
            if event == "payment.success"
            else "Wpay webhook test"
        ),
        "merchantOrderId": payment_link.title or payment_link.link_id,
        "linkId": payment_link.link_id,
        "paymentLinkId": payment_link.link_id,
        "merchantEmail": payment_link.merchant_email,
        "transactionId": transaction.transaction_id,
        "amount": float(payment_link.amount or 0),
        "currency": payment_link.currency or "INR",
        "gateway": "Wpay",
        "utr": transaction.utr or "",
        "customerName": payment_link.customer_name or "",
        "customerEmail": payment_link.customer_email or "",
        "timestamp": utcnow().isoformat(),
    }


def send_merchant_payment_callback(
    payment_link: PaymentLink,
    transaction: Transaction,
    event: str = "payment.success",
) -> dict:
    callback_body = merchant_callback_payload(payment_link, transaction, event)
    try:
        return deliver_callback(
            payment_link.notify_url,
            payment_link.callback_secret,
            callback_body,
        )
    except MerchantWebhookError as error:
        return {"delivered": False, "error": str(error)}


def merchant_payout_callback_payload(payout: Payout) -> dict:
    event = "payout.success" if payout.status == "paid" else "payout.failed"
    return {
        "event": event,
        "brand": "Wpay",
        "success": payout.status == "paid",
        "status": "SUCCESS" if payout.status == "paid" else "FAILED",
        "message": "Payout successful" if payout.status == "paid" else "Payout failed",
        "payoutId": payout.payout_id,
        "merchantEmail": payout.merchant_email,
        "amount": float(payout.amount or 0),
        "currency": payout.currency or "INR",
        "gateway": "Wpay",
        "utr": payout.utr or "",
        "beneficiaryName": payout.beneficiary_name or "",
        "bankName": payout.bank_name or "",
        "providerStatus": payout.provider_status or payout.status,
        "timestamp": utcnow().isoformat(),
    }


def send_merchant_payout_callback(payout: Payout) -> dict:
    merchant = Merchant.query.filter_by(email=payout.merchant_email).first()
    if not merchant or not merchant.webhook_payout_url:
        return {"skipped": True, "reason": "No merchant payout webhook URL configured"}
    merchant.webhook_settings()
    callback_body = merchant_payout_callback_payload(payout)
    try:
        return deliver_callback(
            merchant.webhook_payout_url,
            merchant.webhook_secret,
            callback_body,
        )
    except MerchantWebhookError as error:
        return {"delivered": False, "error": str(error)}


def settings_row() -> FinanceSettings:
    settings = FinanceSettings.query.filter_by(key="default").first()
    if not settings:
        settings = FinanceSettings(key="default")
        db.session.add(settings)
        db.session.flush()
    return settings


def add_audit_log(
    action: str,
    *,
    merchant_email: str = "",
    target_type: str = "",
    target_id: str = "",
    message: str = "",
    status: str = "success",
    metadata: dict | None = None,
) -> AuditLog:
    user = current_user() or {}
    row = AuditLog(
        action=action,
        actor_name=str(user.get("name") or ""),
        actor_email=str(user.get("email") or ""),
        actor_role=str(user.get("role") or "system"),
        merchant_email=merchant_email,
        target_type=target_type,
        target_id=target_id,
        status=status,
        message=message,
        metadata_json=json.dumps(metadata or {}, default=str),
    )
    db.session.add(row)
    g.audit_logged = True
    return row


@api.after_request
def write_generic_audit_log(response):
    if request.method not in {"POST", "PATCH", "DELETE"}:
        return response
    if getattr(g, "audit_logged", False):
        return response
    if request.path.endswith("/admin/audit-logs"):
        return response

    try:
        user = current_user() or {}
        action = f"{request.method.lower()} {request.path.replace('/api/', '', 1).strip('/')}"
        path_parts = [
            part
            for part in request.path.replace("/api/", "", 1).strip("/").split("/")
            if part
        ]
        target_type = path_parts[0] if path_parts else "api"
        target_id = path_parts[-1] if len(path_parts) > 1 else ""
        body_merchant_email = str(
            payload().get("merchantEmail") if request.is_json else ""
        ).strip().lower()
        merchant_email = (
            str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
            if user.get("role") == "merchant"
            else body_merchant_email
        )

        row = AuditLog(
            action=action[:120],
            actor_name=str(user.get("name") or ""),
            actor_email=str(user.get("email") or ""),
            actor_role=str(user.get("role") or "system"),
            merchant_email=merchant_email,
            target_type=target_type[:120],
            target_id=target_id[:160],
            status="success" if response.status_code < 400 else "failed",
            message=f"{request.method} {request.path} returned HTTP {response.status_code}",
            metadata_json=json.dumps(
                {
                    "method": request.method,
                    "path": request.path,
                    "endpoint": request.endpoint,
                    "statusCode": response.status_code,
                    "remoteAddr": request.headers.get("X-Forwarded-For")
                    or request.remote_addr
                    or "",
                },
                default=str,
            ),
        )
        db.session.add(row)
        db.session.commit()
    except Exception:
        db.session.rollback()
    return response


def valid_hex_color(value: str) -> str:
    value = str(value or "").strip()
    if len(value) == 7 and value.startswith("#"):
        try:
            int(value[1:], 16)
            return value.lower()
        except ValueError:
            return "#087f5b"
    return "#087f5b"


def valid_public_url(value: str, *, field_label: str, required: bool = False) -> tuple[str, str]:
    url = str(value or "").strip()
    if not url:
        return ("", f"{field_label} is required") if required else ("", "")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return "", f"{field_label} must be a valid HTTPS URL"
    return url[:1000], ""


EMPLOYEE_ROLES = {"finance", "tech", "operations", "support"}
PAYBOOK_TEXT_FIELDS = {
    "brandName": 120,
    "subtitle": 160,
    "vendorLabel": 160,
    "supportText": 240,
    "protectedPaymentLabel": 50,
    "paymentRequestLabel": 50,
    "paymentToLabel": 50,
    "orderLabel": 40,
    "referenceLabel": 40,
    "upiPaymentLabel": 50,
    "checkoutTitle": 90,
    "checkoutDescription": 180,
    "mobileNumberLabel": 60,
    "mobileNumberHelp": 140,
    "payButtonLabel": 40,
    "paySecurelyLabel": 50,
    "desktopReadyTitle": 70,
    "mobileReadyTitle": 70,
    "singleUseLabel": 60,
    "showQrLabel": 30,
    "qrVisibleLabel": 30,
    "payWithAppLabel": 80,
    "continuePaymentLabel": 60,
    "checkStatusLabel": 40,
    "copyPaymentLabel": 50,
    "successLabel": 50,
    "successTitle": 70,
    "doneButtonLabel": 30,
    "footerNote": 140,
}


def normalize_employee_roles(value) -> list[str]:
    roles = []
    for item in value if isinstance(value, list) else []:
        role = str(item or "").strip().lower()
        if role in EMPLOYEE_ROLES and role not in roles:
            roles.append(role)
    return roles


def valid_logo_image_url(value) -> tuple[str, str]:
    url = str(value or "").strip()
    if not url:
        return "", ""
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or not path.endswith((".png", ".jpg", ".jpeg"))
    ):
        return (
            "",
            "Logo image must be a complete HTTP or HTTPS URL ending in .png, .jpg or .jpeg",
        )
    return url[:1000], ""


def normalize_paybook_settings(merchant: Merchant, body: dict) -> tuple[dict, str]:
    settings = merchant.paybook_settings()

    for key, limit in PAYBOOK_TEXT_FIELDS.items():
        if key in body:
            settings[key] = str(body.get(key) or "").strip()[:limit]

    if "accentColor" in body:
        settings["accentColor"] = valid_hex_color(str(body.get("accentColor") or ""))

    if "logoImageUrl" in body:
        logo_url, error = valid_logo_image_url(body.get("logoImageUrl"))
        if error:
            return {}, error
        settings["logoImageUrl"] = logo_url

    if "themeMode" in body:
        theme_mode = str(body.get("themeMode") or "system").strip().lower()
        if theme_mode not in {"system", "light", "dark"}:
            return {}, "Theme mode must be system, light or dark"
        settings["themeMode"] = theme_mode

    for key in ("showPoweredBy", "showOrderDetails", "showSupportText"):
        if key in body:
            settings[key] = body.get(key) is not False

    if not settings.get("brandName"):
        settings["brandName"] = merchant.business_name or "Wpay"
    return settings, ""


def normalize_ip_whitelist(value) -> tuple[str, str]:
    if isinstance(value, str):
        candidates = value.replace("\n", ",").split(",")
    elif isinstance(value, list):
        candidates = value
    else:
        candidates = []

    normalized: list[str] = []
    for item in candidates:
        entry = str(item or "").strip()
        if not entry:
            continue
        if len(normalized) >= 5:
            return "", "Only 5 IP whitelist entries are allowed"
        try:
            if "/" in entry:
                normalized.append(str(ip_network(entry, strict=False)))
            else:
                normalized.append(str(ip_network(f"{entry}/32", strict=False).network_address))
        except ValueError:
            return "", f"Invalid IP whitelist entry: {entry}"
    return ",".join(dict.fromkeys(normalized)), ""


def current_merchant_row() -> Merchant | None:
    user = current_user() or {}
    email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    if not email:
        return None
    return Merchant.query.filter_by(email=email).first()


def find_merchant_bank_account(account_id: str) -> MerchantBankAccount | None:
    account_id = str(account_id or "").strip()
    if not account_id:
        return None
    account = MerchantBankAccount.query.filter_by(account_id=account_id).first()
    if not account and account_id.isdigit():
        account = db.session.get(MerchantBankAccount, int(account_id))
    return account


def set_primary_bank_account(account: MerchantBankAccount) -> None:
    MerchantBankAccount.query.filter_by(
        merchant_email=account.merchant_email,
        is_primary=True,
    ).update({"is_primary": False})
    account.is_primary = True


def sync_merchant_gateway_summary(merchant_email: str) -> None:
    merchant = Merchant.query.filter_by(email=merchant_email).first()
    if not merchant:
        return
    gateways = [
        row[0]
        for row in db.session.query(PipeRoute.gateway_name)
        .filter(
            PipeRoute.merchant_email == merchant_email,
            PipeRoute.status == "active",
        )
        .distinct()
        .all()
        if row[0]
    ]
    merchant.gateway_assigned = ", ".join(gateways) or "Not Assigned"


RAIL_STATUSES = {"active", "paused", "blocked"}
RAIL_TYPES = {"upi", "bank", "upi_bank"}
SCRAPER_TYPES = {"manual", "html", "playwright", "api"}
UTR_RE = re.compile(r"^\d{12}$")


def normalize_status(value: str, *, default: str = "active") -> str:
    status = str(value or default).strip().lower()
    if status not in RAIL_STATUSES:
        raise ValueError("Status must be active, paused or blocked")
    return status


def normalize_upi_id(value: str) -> str:
    upi_id = str(value or "").strip()
    if not upi_id or "@" not in upi_id or len(upi_id) > 160:
        raise ValueError("Valid UPI ID is required")
    return upi_id


def masked_account_number(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) <= 4:
        return digits
    return f"{'x' * max(0, len(digits) - 4)}{digits[-4:]}"


def bank_credential_template_usage(template_id: int) -> int:
    return InternalBankRail.query.filter_by(credential_template_id=template_id).count()


def find_bank_credential_template(template_id: str) -> BankCredentialTemplate | None:
    if not str(template_id or "").isdigit():
        return None
    return db.session.get(BankCredentialTemplate, int(template_id))


def find_bank_rail(rail_id: str) -> InternalBankRail | None:
    rail_id = str(rail_id or "").strip()
    if not rail_id:
        return None
    rail = InternalBankRail.query.filter_by(rail_id=rail_id).first()
    if not rail and rail_id.isdigit():
        rail = db.session.get(InternalBankRail, int(rail_id))
    return rail


def find_bank_rail_route(route_id: str) -> BankRailRoute | None:
    route_id = str(route_id or "").strip()
    if not route_id or not route_id.isdigit():
        return None
    return db.session.get(BankRailRoute, int(route_id))


def validate_amount_range(min_amount: float, max_amount: float) -> tuple[float, float]:
    min_amount = money(min_amount or 1)
    max_amount = money(max_amount or 0)
    if min_amount <= 0 or max_amount <= 0 or min_amount > max_amount:
        raise ValueError("Valid min and max amount are required")
    return min_amount, max_amount


@api.get("/health")
def health():
    return jsonify(
        {
            "success": True,
            "status": "ok",
            "backend": "flask",
            "database": db.engine.url.get_backend_name(),
        }
    )


@api.post("/auth/login")
def login():
    body = payload()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "").strip()

    if not email or not password:
        return jsonify({"success": False, "message": "Email and password are required"}), 400

    if (
        email == current_app.config["TEST_ADMIN_EMAIL"]
        and password == current_app.config["TEST_ADMIN_PASSWORD"]
    ):
        user = ensure_test_admin(email, password)
        db.session.commit()
    else:
        user = User.query.filter_by(email=email).first()
        if not user or not verify_password(user, password):
            return jsonify({"success": False, "message": "Invalid email or password"}), 401

    if user.status != "active":
        return jsonify({"success": False, "message": "User account is not active"}), 403

    if user.role == "employee":
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Employee dashboards are not enabled yet",
                }
            ),
            403,
        )

    if user.role == "merchant":
        merchant = Merchant.query.filter_by(email=user.merchant_email or user.email).first()
        if not merchant or merchant.status != "active":
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Merchant account is pending admin approval",
                    }
                ),
                403,
            )

    if user.two_factor_enabled:
        two_factor_code = str(body.get("twoFactorCode") or "").strip()
        if (
            not two_factor_code
            or not user.two_factor_secret
            or not pyotp.TOTP(user.two_factor_secret).verify(
                two_factor_code, valid_window=1
            )
        ):
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Enter a valid authenticator code",
                        "requiresTwoFactor": True,
                    }
                ),
                401,
            )

    token = create_token(user)
    token_payload = user.to_dict()
    redirect_to = (
        "/admin/dashboard"
        if user.role == "admin"
        else "/ops/dashboard"
        if user.role == "ops"
        else "/merchant/dashboard"
    )
    response = jsonify(
        {
            "success": True,
            "message": "Login successful",
            "user": token_payload,
            "redirectTo": redirect_to,
            "token": token,
        }
    )
    db.session.add(
        AuditLog(
            action="auth.login",
            actor_name=user.name,
            actor_email=user.email,
            actor_role=user.role,
            merchant_email=(user.merchant_email or user.email) if user.role == "merchant" else "",
            target_type="auth",
            target_id=str(user.id),
            status="success",
            message="User logged in",
            metadata_json=json.dumps(
                {
                    "redirectTo": redirect_to,
                    "remoteAddr": request.headers.get("X-Forwarded-For")
                    or request.remote_addr
                    or "",
                },
                default=str,
            ),
        )
    )
    g.audit_logged = True
    db.session.commit()
    return set_auth_cookies(response, token)


@api.get("/auth/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"success": False, "user": None}), 401
    return jsonify({"success": True, "user": user})


@api.post("/auth/logout")
@api.post("/auth/clear-session")
def logout():
    return clear_auth_cookies(jsonify({"success": True, "message": "Logged out"}))


@api.post("/auth/setup")
def setup_auth():
    body = payload()
    email = str(body.get("email") or current_app.config["TEST_ADMIN_EMAIL"]).strip().lower()
    password = str(body.get("password") or current_app.config["TEST_ADMIN_PASSWORD"]).strip()
    user = ensure_test_admin(email, password)
    db.session.commit()
    return jsonify({"success": True, "message": "Admin user ready", "user": user.to_dict()})


@api.get("/merchants")
@require_roles("admin", "ops")
def list_merchants():
    merchants = Merchant.query.order_by(Merchant.created_at.desc()).all()
    routes = PipeRoute.query.order_by(PipeRoute.created_at.asc()).all()
    routes_by_email: dict[str, list[PipeRoute]] = {}
    for route in routes:
        routes_by_email.setdefault(route.merchant_email.lower(), []).append(route)

    result = []
    for merchant in merchants:
        item = merchant.to_dict()
        item["gatewayAllocations"] = [
            route.to_allocation_dict(merchant.business_name)
            for route in routes_by_email.get(merchant.email.lower(), [])
        ]
        result.append(item)

    return jsonify(
        {"success": True, "count": len(merchants), "merchants": result}
    )


@api.post("/merchants")
def create_merchant():
    body = payload()
    business_name = str(body.get("businessName") or "").strip()
    owner_name = str(body.get("ownerName") or "").strip()
    email = str(body.get("email") or body.get("merchantEmail") or "").strip().lower()
    phone = str(body.get("phone") or "").strip()
    business_type = str(body.get("businessType") or "Online Business").strip()
    password = str(body.get("password") or "").strip()

    if not business_name or not owner_name or not email or not phone or not password:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Business name, owner name, email, phone and password are required",
                }
            ),
            400,
        )

    if Merchant.query.filter_by(email=email).first() or User.query.filter_by(email=email).first():
        return jsonify({"success": False, "message": "Merchant already exists"}), 409

    user = User(
        name=owner_name,
        email=email,
        password_hash=generate_password_hash(password),
        role="merchant",
        merchant_email=email,
        status="active",
    )
    db.session.add(user)
    db.session.flush()

    merchant = Merchant(
        user_id=user.id,
        business_name=business_name,
        owner_name=owner_name,
        email=email,
        phone=phone,
        business_type=business_type,
        status="pending",
    )
    merchant.ensure_credentials()
    db.session.add(merchant)
    db.session.commit()

    return (
        jsonify(
            {
                "success": True,
                "message": "Merchant account created successfully",
                "merchant": merchant.to_dict(),
                "user": user.to_dict(),
            }
        ),
        201,
    )


@api.get("/merchants/<merchant_id>")
@require_roles("admin", "ops", "merchant")
def get_merchant(merchant_id: str):
    merchant = find_merchant(merchant_id)
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    return jsonify({"success": True, "merchant": merchant.to_dict()})


@api.patch("/merchants/<merchant_id>")
@require_roles("admin")
def update_merchant(merchant_id: str):
    merchant = find_merchant(merchant_id)
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404

    body = payload()
    next_status = body.get("status")
    if next_status:
        merchant.status = str(next_status)
        if merchant.status == "active":
            merchant.activation_count = int(merchant.activation_count or 0) + 1
            merchant.last_activated_at = utcnow()

    if "gatewayAssigned" in body:
        merchant.gateway_assigned = str(body.get("gatewayAssigned") or "Not Assigned")

    user = User.query.filter_by(email=merchant.email).first()
    if user and next_status:
        user.status = "blocked" if merchant.status == "blocked" else "active"

    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Merchant updated successfully",
            "merchant": merchant.to_dict(),
        }
    )


@api.get("/admin/employees")
@require_roles("admin")
def list_employees():
    employees = (
        User.query.filter_by(role="employee")
        .order_by(User.created_at.desc())
        .all()
    )
    return jsonify(
        {
            "success": True,
            "count": len(employees),
            "employees": [employee.to_dict() for employee in employees],
        }
    )


@api.post("/admin/employees")
@require_roles("admin")
def create_employee():
    body = payload()
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    employee_roles = normalize_employee_roles(body.get("employeeRoles"))

    if not name or not email or not password:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Name, email and password are required",
                }
            ),
            400,
        )
    if len(password) < 8:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Password must be at least 8 characters",
                }
            ),
            400,
        )
    if not employee_roles:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Select at least one employee role",
                }
            ),
            400,
        )
    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "message": "User already exists"}), 409

    employee = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role="employee",
        merchant_email="",
        status="active",
    )
    employee.set_employee_roles(employee_roles)
    db.session.add(employee)
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Employee created successfully",
                "employee": employee.to_dict(),
            }
        ),
        201,
    )


@api.patch("/admin/employees/<employee_id>")
@require_roles("admin")
def update_employee(employee_id: str):
    employee = (
        db.session.get(User, int(employee_id))
        if str(employee_id).isdigit()
        else None
    )
    if not employee or employee.role != "employee":
        return jsonify({"success": False, "message": "Employee not found"}), 404

    body = payload()
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            return jsonify({"success": False, "message": "Employee name is required"}), 400
        employee.name = name

    if "employeeRoles" in body:
        employee_roles = normalize_employee_roles(body.get("employeeRoles"))
        if not employee_roles:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Select at least one employee role",
                    }
                ),
                400,
            )
        employee.set_employee_roles(employee_roles)

    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in {"active", "blocked"}:
            return jsonify({"success": False, "message": "Invalid employee status"}), 400
        employee.status = status

    if body.get("password"):
        password = str(body.get("password") or "")
        if len(password) < 8:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": "Password must be at least 8 characters",
                    }
                ),
                400,
            )
        employee.password_hash = generate_password_hash(password)

    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Employee updated successfully",
            "employee": employee.to_dict(),
        }
    )


@api.get("/users")
@require_roles("admin")
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "count": len(users),
            "users": [user.to_dict() for user in users],
        }
    )


@api.patch("/users/<user_id>")
@require_roles("admin")
def update_user(user_id: str):
    user = db.session.get(User, int(user_id)) if user_id.isdigit() else None
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404
    status = str(payload().get("status") or "").strip().lower()
    if status not in {"active", "blocked"}:
        return jsonify({"success": False, "message": "Invalid user status"}), 400
    user.status = status
    if user.role == "merchant":
        merchant = Merchant.query.filter_by(email=user.email).first()
        if merchant:
            merchant.status = "blocked" if status == "blocked" else "active"
    add_audit_log(
        "USER_STATUS_UPDATED",
        merchant_email=user.merchant_email,
        target_type="user",
        target_id=str(user.id),
        message=f"User status changed to {status}",
        metadata={"status": status, "userEmail": user.email},
    )
    db.session.commit()
    return jsonify(
        {"success": True, "message": "User updated", "user": user.to_dict()}
    )


@api.get("/transactions")
@require_roles("admin", "ops", "merchant")
def transactions():
    user = current_user() or {}
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    query = Transaction.query
    if user.get("role") != "admin":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()
    expire_stale_payments(merchant_email=merchant_email if user.get("role") == "merchant" else "")
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(Transaction.created_at.desc()).all()
    return jsonify({"success": True, "count": len(rows), "transactions": [r.to_dict() for r in rows]})


@api.get("/admin/finance/settings")
@require_roles("admin")
def get_finance_settings():
    settings = settings_row()
    db.session.commit()
    return jsonify({"success": True, "settings": settings.to_dict()})


@api.patch("/admin/finance/settings")
@api.post("/admin/finance/settings")
@require_roles("admin")
def update_finance_settings():
    body = payload()
    settings = settings_row()
    if "payinSellingFeePercent" in body:
        settings.payin_selling_fee_percent = money(body["payinSellingFeePercent"])
    if "payoutSellingFeePercent" in body:
        settings.payout_selling_fee_percent = money(body["payoutSellingFeePercent"])
    if "usdtRateInr" in body:
        settings.usdt_rate_inr = money(body["usdtRateInr"])
    if "usdtNetwork" in body:
        settings.usdt_network = str(body["usdtNetwork"] or "TRC20")
    db.session.commit()
    return jsonify({"success": True, "message": "Finance settings saved", "settings": settings.to_dict()})


@api.get("/admin/payable-balances")
@require_roles("admin")
def payable_balances():
    balances = []
    merchants = Merchant.query.order_by(Merchant.email.asc()).all()
    settings = settings_row()
    usdt_open_statuses = {"pending", "sent", "confirmed"}

    for merchant in merchants:
        transactions = Transaction.query.filter_by(merchant_email=merchant.email).all()
        settlements = UsdtSettlement.query.filter_by(merchant_email=merchant.email).all()
        payout_summary = payout_summary_for_merchant(merchant.email)
        success_rows = [t for t in transactions if t.status in {"success", "paid", "completed"}]
        failed_rows = [t for t in transactions if t.status in {"failed", "failure", "cancelled"}]
        successful_volume = money(sum(float(t.amount or 0) for t in success_rows))
        failed_volume = money(sum(float(t.amount or 0) for t in failed_rows))
        pricing = MerchantPricing.query.filter_by(merchant_email=merchant.email).first()
        fee_percent = (
            float(pricing.payin_selling_fee_percent)
            if pricing and pricing.payin_selling_fee_percent is not None
            else float(settings.payin_selling_fee_percent or 0)
        )
        fee_amount = money(successful_volume * fee_percent / 100)
        usdt_reserved = money(
            sum(float(s.inr_amount or 0) for s in settlements if s.status in usdt_open_statuses)
        )
        payable = money(
            successful_volume
            - fee_amount
            - usdt_reserved
            - payout_summary["paidAmount"]
            - payout_summary["pendingAmount"]
        )
        balances.append(
            {
                "merchantEmail": merchant.email,
                "successfulVolume": successful_volume,
                "failedVolume": failed_volume,
                "payinSellingFeePercent": fee_percent,
                "payinFeeAmount": fee_amount,
                "refundedVolume": 0,
                "chargebackAmount": 0,
                "paidSettlementAmount": 0,
                "pendingSettlementAmount": 0,
                "paidPayoutAmount": payout_summary["paidAmount"],
                "pendingPayoutAmount": payout_summary["pendingAmount"],
                "confirmedUsdtInrAmount": usdt_reserved,
                "pendingUsdtInrAmount": usdt_reserved,
                "payableBalance": payable,
                "successCount": len(success_rows),
                "failedCount": len(failed_rows),
                "currency": "INR",
            }
        )

    return jsonify({"success": True, "count": len(balances), "balances": balances})


@api.get("/admin/finance/usdt-settlements")
@require_roles("admin")
def list_usdt_settlements():
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    query = UsdtSettlement.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(UsdtSettlement.created_at.desc()).all()
    return jsonify(
        {"success": True, "count": len(rows), "settlements": [row.to_dict() for row in rows]}
    )


@api.post("/admin/finance/usdt-settlements")
@require_roles("admin")
def create_usdt_settlement():
    user = current_user() or {}
    body = payload()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    inr_amount = money(body.get("inrAmount"))
    if not merchant_email:
        return jsonify({"success": False, "message": "Merchant email is required"}), 400
    if inr_amount <= 0:
        return jsonify({"success": False, "message": "Valid INR amount is required"}), 400

    settings = settings_row()
    rate = money(body.get("usdtRateInr") or settings.usdt_rate_inr)
    if rate <= 0:
        return jsonify({"success": False, "message": "Valid USDT rate is required"}), 400

    settlement = UsdtSettlement(
        usdt_settlement_id=f"usdt_{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(3)}",
        merchant_email=merchant_email,
        inr_amount=inr_amount,
        usdt_rate_inr=rate,
        usdt_amount=round(inr_amount / rate, 4),
        network=str(body.get("network") or settings.usdt_network or "TRC20"),
        wallet_address=str(body.get("walletAddress") or "").strip(),
        note=str(body.get("note") or "").strip(),
        created_by=str(user.get("email") or ""),
    )
    db.session.add(settlement)
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "USDT settlement created successfully",
            "settlement": settlement.to_dict(),
        }
    )


@api.patch("/admin/finance/usdt-settlements/<settlement_id>")
@require_roles("admin")
def update_usdt_settlement(settlement_id: str):
    settlement = UsdtSettlement.query.filter_by(usdt_settlement_id=settlement_id).first()
    if not settlement and settlement_id.isdigit():
        settlement = db.session.get(UsdtSettlement, int(settlement_id))
    if not settlement:
        return jsonify({"success": False, "message": "USDT settlement not found"}), 404

    body = payload()
    if "status" in body:
        settlement.status = str(body.get("status") or settlement.status)
        if settlement.status == "sent":
            settlement.sent_at = utcnow()
        if settlement.status == "confirmed":
            settlement.confirmed_at = utcnow()
    if "txHash" in body:
        settlement.tx_hash = str(body.get("txHash") or "")
    if "note" in body:
        settlement.note = str(body.get("note") or "")
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "USDT settlement updated successfully",
            "settlement": settlement.to_dict(),
        }
    )


def normalize_credential_fields(
    raw_fields,
    *,
    existing_values: dict[str, str] | None = None,
    require_values: bool,
) -> tuple[list[dict], dict[str, str]]:
    if not isinstance(raw_fields, list) or not raw_fields:
        raise ValueError("Select at least one credential field")
    if len(raw_fields) > 24:
        raise ValueError("A template can contain at most 24 fields")

    existing_values = existing_values or {}
    definitions: list[dict] = []
    values: dict[str, str] = {}
    seen: set[str] = set()

    for raw in raw_fields:
        if not isinstance(raw, dict):
            raise ValueError("Credential fields must be objects")
        key = str(raw.get("key") or "").strip()
        is_common = key in COMMON_CREDENTIAL_FIELDS

        if is_common:
            canonical = COMMON_CREDENTIAL_FIELDS[key]
            label = canonical["label"]
            field_type = canonical["type"]
        else:
            label = str(raw.get("label") or "").strip()
            field_type = str(raw.get("type") or "secret").strip().lower()
            if not CUSTOM_CREDENTIAL_KEY.fullmatch(key):
                raise ValueError(
                    "Custom field keys must start with a letter and use only letters, numbers, or underscores"
                )
            if not label:
                raise ValueError("Custom field labels are required")
            if field_type not in {"secret", "text"}:
                raise ValueError("Custom fields must be text or secret fields")

        normalized_key = key.lower()
        if normalized_key in seen:
            raise ValueError(f"Credential field {key} is duplicated")
        seen.add(normalized_key)

        value = str(raw.get("value") or "").strip()
        if not value:
            value = str(existing_values.get(key) or "")
        if field_type == "mode":
            value = value.lower() or "production"
            if value not in {"sandbox", "production"}:
                raise ValueError("Mode must be sandbox or production")
        elif require_values and not value:
            raise ValueError(f"{label} is required")

        definitions.append(
            {
                "key": key,
                "label": label[:120],
                "type": field_type,
                "common": is_common,
            }
        )
        if value:
            values[key] = value

    return definitions, values


def credential_template_usage(template_id: int) -> int:
    return MidPool.query.filter_by(credential_template_id=template_id).count()


def find_credential_template(template_id: str) -> GatewayCredentialTemplate | None:
    if not template_id.isdigit():
        return None
    return db.session.get(GatewayCredentialTemplate, int(template_id))


@api.get("/admin/bank-credential-templates")
@require_roles("admin")
def list_bank_credential_templates():
    rows = BankCredentialTemplate.query.order_by(
        BankCredentialTemplate.name.asc()
    ).all()
    return jsonify(
        {
            "success": True,
            "templates": [
                row.to_dict(usage_count=bank_credential_template_usage(row.id))
                for row in rows
            ],
        }
    )


@api.post("/admin/bank-credential-templates")
@require_roles("admin")
def create_bank_credential_template():
    user = current_user() or {}
    body = payload()
    name = str(body.get("name") or "").strip()
    bank_name = str(body.get("bankName") or body.get("bank_name") or "").strip()
    login_url = str(body.get("loginUrl") or body.get("login_url") or "").strip()
    scraper_type = str(body.get("scraperType") or "manual").strip().lower()
    if not name or not bank_name:
        return jsonify({"success": False, "message": "Template name and bank name are required"}), 400
    if scraper_type not in SCRAPER_TYPES:
        return jsonify({"success": False, "message": "Invalid scraper type"}), 400
    duplicate = BankCredentialTemplate.query.filter(
        db.func.lower(BankCredentialTemplate.name) == name.lower()
    ).first()
    if duplicate:
        return jsonify({"success": False, "message": "Template name already exists"}), 409

    try:
        definitions, values = normalize_credential_fields(
            body.get("fields"),
            require_values=True,
        )
        row = BankCredentialTemplate(
            name=name[:160],
            bank_name=bank_name[:160],
            login_url=login_url[:1000],
            scraper_type=scraper_type,
            status="active",
            created_by=str(user.get("email") or ""),
            updated_by=str(user.get("email") or ""),
        )
        row.set_field_definitions(definitions)
        row.set_credentials(values)
        row.set_scraper_config(body.get("scraperConfig") if isinstance(body.get("scraperConfig"), dict) else {})
    except (ValueError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 400

    db.session.add(row)
    add_audit_log(
        "BANK_CREDENTIAL_TEMPLATE_CREATED",
        target_type="bank_credential_template",
        target_id=name,
        message=f"Bank credential template created for {bank_name}",
    )
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Bank credential template created",
                "template": row.to_dict(),
            }
        ),
        201,
    )


@api.patch("/admin/bank-credential-templates/<template_id>")
@require_roles("admin")
def update_bank_credential_template(template_id: str):
    row = find_bank_credential_template(template_id)
    if not row:
        return jsonify({"success": False, "message": "Bank credential template not found"}), 404

    user = current_user() or {}
    body = payload()
    name = str(body.get("name") or row.name).strip()
    bank_name = str(body.get("bankName") or row.bank_name).strip()
    scraper_type = str(body.get("scraperType") or row.scraper_type).strip().lower()
    status = str(body.get("status") or row.status).strip().lower()
    if scraper_type not in SCRAPER_TYPES:
        return jsonify({"success": False, "message": "Invalid scraper type"}), 400
    if status not in RAIL_STATUSES:
        return jsonify({"success": False, "message": "Invalid template status"}), 400
    duplicate = BankCredentialTemplate.query.filter(
        db.func.lower(BankCredentialTemplate.name) == name.lower(),
        BankCredentialTemplate.id != row.id,
    ).first()
    if duplicate:
        return jsonify({"success": False, "message": "Template name already exists"}), 409

    try:
        existing_values = row.get_credentials()
        definitions, values = normalize_credential_fields(
            body.get("fields"),
            existing_values=existing_values,
            require_values=True,
        )
        row.name = name[:160]
        row.bank_name = bank_name[:160]
        row.login_url = str(body.get("loginUrl") or row.login_url).strip()[:1000]
        row.scraper_type = scraper_type
        row.status = status
        row.updated_by = str(user.get("email") or "")
        row.set_field_definitions(definitions)
        row.set_credentials(values)
        if isinstance(body.get("scraperConfig"), dict):
            row.set_scraper_config(body.get("scraperConfig") or {})
    except (ValueError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 400

    add_audit_log(
        "BANK_CREDENTIAL_TEMPLATE_UPDATED",
        target_type="bank_credential_template",
        target_id=str(row.id),
        message=f"Bank credential template updated for {row.bank_name}",
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Bank credential template updated",
            "template": row.to_dict(
                usage_count=bank_credential_template_usage(row.id)
            ),
        }
    )


@api.get("/admin/bank-rails")
@require_roles("admin", "ops")
def list_bank_rails():
    rows = InternalBankRail.query.order_by(
        InternalBankRail.status.asc(),
        InternalBankRail.priority.asc(),
        InternalBankRail.created_at.desc(),
    ).all()
    routes = BankRailRoute.query.all()
    assigned_counts = {
        rail.rail_id: len([route for route in routes if route.rail_id == rail.rail_id])
        for rail in rows
    }
    rails = []
    for row in rows:
        item = row.to_dict()
        item["assignedMerchants"] = assigned_counts.get(row.rail_id, 0)
        rails.append(item)
    return jsonify({"success": True, "count": len(rails), "rails": rails})


@api.post("/admin/bank-rails")
@require_roles("admin", "ops")
def create_bank_rail():
    user = current_user() or {}
    body = payload()
    try:
        bank_name = str(body.get("bankName") or "").strip()
        account_label = str(body.get("accountLabel") or bank_name or "UPI Rail").strip()
        upi_id = normalize_upi_id(body.get("upiId") or body.get("upiID"))
        payee_name = str(body.get("payeeName") or body.get("accountHolderName") or "").strip()
        rail_type = str(body.get("railType") or "upi").strip().lower()
        status = normalize_status(body.get("status"), default="active")
        payin_status = normalize_status(body.get("payinStatus"), default=status)
        min_amount, max_amount = validate_amount_range(
            body.get("minAmount") or 1,
            body.get("maxAmount") or 100000,
        )
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    if not bank_name or not payee_name:
        return jsonify({"success": False, "message": "Bank name and payee name are required"}), 400
    if rail_type not in RAIL_TYPES:
        return jsonify({"success": False, "message": "Invalid rail type"}), 400
    if InternalBankRail.query.filter(db.func.lower(InternalBankRail.upi_id) == upi_id.lower()).first():
        return jsonify({"success": False, "message": "UPI ID already exists"}), 409

    template_id = str(body.get("credentialTemplateId") or "").strip()
    template = find_bank_credential_template(template_id) if template_id else None
    if template_id and not template:
        return jsonify({"success": False, "message": "Bank credential template not found"}), 404

    account_number = str(body.get("accountNumber") or "").strip()
    rail = InternalBankRail(
        rail_id=f"ibr_{secrets.token_hex(8)}",
        bank_name=bank_name[:160],
        account_label=account_label[:160],
        account_holder_name=str(body.get("accountHolderName") or payee_name).strip()[:180],
        account_number_masked=masked_account_number(account_number),
        ifsc=str(body.get("ifsc") or "").strip().upper()[:20],
        upi_id=upi_id,
        payee_name=payee_name[:180],
        rail_type=rail_type,
        status=status,
        payin_status=payin_status,
        daily_limit=money(body.get("dailyLimit") or 0),
        monthly_limit=money(body.get("monthlyLimit") or 0),
        min_amount=min_amount,
        max_amount=max_amount,
        priority=int(body.get("priority") or 100),
        settlement_owner=str(body.get("settlementOwner") or "Wpay").strip()[:80],
        credential_template_id=template.id if template else None,
        notes=str(body.get("notes") or "").strip(),
        created_by=str(user.get("email") or ""),
        updated_by=str(user.get("email") or ""),
    )
    db.session.add(rail)
    add_audit_log(
        "BANK_RAIL_CREATED",
        target_type="bank_rail",
        target_id=rail.rail_id,
        message=f"Bank rail created for {bank_name}",
        metadata={"upiId": upi_id, "railType": rail_type},
    )
    db.session.commit()
    return (
        jsonify({"success": True, "message": "Bank rail created", "rail": rail.to_dict()}),
        201,
    )


@api.patch("/admin/bank-rails/<rail_id>")
@require_roles("admin", "ops")
def update_bank_rail(rail_id: str):
    user = current_user() or {}
    rail = find_bank_rail(rail_id)
    if not rail:
        return jsonify({"success": False, "message": "Bank rail not found"}), 404
    body = payload()

    try:
        if "upiId" in body or "upiID" in body:
            upi_id = normalize_upi_id(body.get("upiId") or body.get("upiID"))
            duplicate = InternalBankRail.query.filter(
                db.func.lower(InternalBankRail.upi_id) == upi_id.lower(),
                InternalBankRail.id != rail.id,
            ).first()
            if duplicate:
                return jsonify({"success": False, "message": "UPI ID already exists"}), 409
            rail.upi_id = upi_id
        if "status" in body:
            rail.status = normalize_status(body.get("status"))
        if "payinStatus" in body:
            rail.payin_status = normalize_status(body.get("payinStatus"))
        if "railType" in body:
            rail_type = str(body.get("railType") or rail.rail_type).strip().lower()
            if rail_type not in RAIL_TYPES:
                return jsonify({"success": False, "message": "Invalid rail type"}), 400
            rail.rail_type = rail_type
        if "minAmount" in body or "maxAmount" in body:
            rail.min_amount, rail.max_amount = validate_amount_range(
                body.get("minAmount") if "minAmount" in body else rail.min_amount,
                body.get("maxAmount") if "maxAmount" in body else rail.max_amount,
            )
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    for api_key, attr, limit in (
        ("bankName", "bank_name", 160),
        ("accountLabel", "account_label", 160),
        ("accountHolderName", "account_holder_name", 180),
        ("payeeName", "payee_name", 180),
        ("ifsc", "ifsc", 20),
        ("settlementOwner", "settlement_owner", 80),
        ("notes", "notes", 2000),
    ):
        if api_key in body:
            value = str(body.get(api_key) or "").strip()
            if attr == "ifsc":
                value = value.upper()
            setattr(rail, attr, value[:limit])
    if "accountNumber" in body:
        rail.account_number_masked = masked_account_number(str(body.get("accountNumber") or ""))
    if "dailyLimit" in body:
        rail.daily_limit = money(body.get("dailyLimit"))
    if "monthlyLimit" in body:
        rail.monthly_limit = money(body.get("monthlyLimit"))
    if "priority" in body:
        rail.priority = int(body.get("priority") or 100)
    if "credentialTemplateId" in body:
        template_id = str(body.get("credentialTemplateId") or "").strip()
        template = find_bank_credential_template(template_id) if template_id else None
        if template_id and not template:
            return jsonify({"success": False, "message": "Bank credential template not found"}), 404
        rail.credential_template_id = template.id if template else None
    rail.updated_by = str(user.get("email") or "")
    add_audit_log(
        "BANK_RAIL_UPDATED",
        target_type="bank_rail",
        target_id=rail.rail_id,
        message=f"Bank rail updated: {rail.account_label or rail.bank_name}",
    )
    db.session.commit()
    return jsonify({"success": True, "message": "Bank rail updated", "rail": rail.to_dict()})


@api.get("/admin/bank-rail-routes")
@require_roles("admin", "ops")
def list_bank_rail_routes():
    routes = BankRailRoute.query.order_by(
        BankRailRoute.merchant_email.asc(),
        BankRailRoute.priority.asc(),
        BankRailRoute.created_at.desc(),
    ).all()
    rails = {rail.rail_id: rail for rail in InternalBankRail.query.all()}
    merchants = Merchant.query.order_by(Merchant.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "success": True,
            "routes": [
                route.to_dict(rail=rails.get(route.rail_id))
                for route in routes
            ],
            "rails": [rail.to_dict() for rail in rails.values()],
            "merchants": [merchant.to_dict() for merchant in merchants],
        }
    )


@api.post("/admin/bank-rail-routes")
@require_roles("admin", "ops")
def save_bank_rail_route():
    user = current_user() or {}
    body = payload()
    route_id = str(body.get("id") or body.get("_id") or "").strip()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    rail_id = str(body.get("railId") or "").strip()
    merchant = Merchant.query.filter_by(email=merchant_email).first()
    rail = find_bank_rail(rail_id)
    if not merchant:
        return jsonify({"success": False, "message": "Merchant account not found"}), 404
    if merchant.status != "active":
        return jsonify({"success": False, "message": "Approve this merchant before assigning a bank rail"}), 409
    if not rail:
        return jsonify({"success": False, "message": "Bank rail not found"}), 404

    try:
        status = normalize_status(body.get("status"), default="active")
        payin_status = normalize_status(body.get("payinStatus"), default=status)
        min_amount, max_amount = validate_amount_range(
            body.get("minAmount") or 1,
            body.get("maxAmount") or rail.max_amount or 100000,
        )
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    route = find_bank_rail_route(route_id) if route_id else None
    if not route:
        duplicate = BankRailRoute.query.filter_by(
            merchant_email=merchant_email,
            rail_id=rail.rail_id,
        ).first()
        if duplicate:
            return jsonify({"success": False, "message": "This bank rail is already assigned to the merchant"}), 409
        route = BankRailRoute(merchant_email=merchant_email, rail_id=rail.rail_id)
        db.session.add(route)

    route.merchant_email = merchant_email
    route.rail_id = rail.rail_id
    route.route_name = str(body.get("routeName") or rail.account_label or rail.bank_name).strip()[:160]
    route.min_amount = min_amount
    route.max_amount = max_amount
    route.priority = int(body.get("priority") or 100)
    route.volume_limit = money(body.get("volumeLimit") or 0)
    route.status = status
    route.payin_status = payin_status
    route.auto_disable_on_limit = body.get("autoDisableOnLimit") is not False
    route.smart_routing_weight = int(body.get("smartRoutingWeight") or 100)
    route.notes = str(body.get("notes") or "").strip()
    route.updated_by = str(user.get("email") or "")
    add_audit_log(
        "BANK_RAIL_ROUTE_SAVED",
        merchant_email=merchant_email,
        target_type="bank_rail_route",
        target_id=rail.rail_id,
        message=f"Bank rail assigned to {merchant_email}",
    )
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Bank rail route saved",
                "route": route.to_dict(rail=rail),
            }
        ),
        201 if not route_id else 200,
    )


@api.get("/admin/gateway-credential-templates")
@require_roles("admin")
def list_gateway_credential_templates():
    rows = GatewayCredentialTemplate.query.order_by(
        GatewayCredentialTemplate.name.asc()
    ).all()
    return jsonify(
        {
            "success": True,
            "templates": [
                row.to_dict(usage_count=credential_template_usage(row.id))
                for row in rows
            ],
        }
    )


@api.post("/admin/gateway-credential-templates")
@require_roles("admin")
def create_gateway_credential_template():
    user = current_user() or {}
    body = payload()
    name = str(body.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Template name is required"}), 400
    duplicate = GatewayCredentialTemplate.query.filter(
        db.func.lower(GatewayCredentialTemplate.name) == name.lower()
    ).first()
    if duplicate:
        return jsonify({"success": False, "message": "Template name already exists"}), 409

    try:
        definitions, values = normalize_credential_fields(
            body.get("fields"),
            require_values=True,
        )
        row = GatewayCredentialTemplate(
            name=name[:160],
            status="active",
            created_by=str(user.get("email") or ""),
            updated_by=str(user.get("email") or ""),
        )
        row.set_field_definitions(definitions)
        row.set_credentials(values)
    except (ValueError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 400

    db.session.add(row)
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Credential template created",
                "template": row.to_dict(),
            }
        ),
        201,
    )


@api.patch("/admin/gateway-credential-templates/<template_id>")
@require_roles("admin")
def update_gateway_credential_template(template_id: str):
    row = find_credential_template(template_id)
    if not row:
        return jsonify({"success": False, "message": "Template not found"}), 404

    user = current_user() or {}
    body = payload()
    name = str(body.get("name") or row.name).strip()
    duplicate = GatewayCredentialTemplate.query.filter(
        db.func.lower(GatewayCredentialTemplate.name) == name.lower(),
        GatewayCredentialTemplate.id != row.id,
    ).first()
    if duplicate:
        return jsonify({"success": False, "message": "Template name already exists"}), 409

    try:
        existing_values = row.get_credentials()
        definitions, values = normalize_credential_fields(
            body.get("fields"),
            existing_values=existing_values,
            require_values=True,
        )
        row.name = name[:160]
        row.set_field_definitions(definitions)
        row.set_credentials(values)
        row.updated_by = str(user.get("email") or "")
    except (ValueError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 400

    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Credential template updated",
            "template": row.to_dict(
                usage_count=credential_template_usage(row.id)
            ),
        }
    )


@api.delete("/admin/gateway-credential-templates/<template_id>")
@require_roles("admin")
def delete_gateway_credential_template(template_id: str):
    row = find_credential_template(template_id)
    if not row:
        return jsonify({"success": False, "message": "Template not found"}), 404
    usage_count = credential_template_usage(row.id)
    if usage_count:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Detach this template from all MID pools before deleting it",
                    "usageCount": usage_count,
                }
            ),
            409,
        )
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True, "message": "Credential template deleted"})


@api.get("/admin/mid-pools")
@require_roles("admin")
def list_mid_pools():
    pools = MidPool.query.order_by(MidPool.created_at.desc()).all()
    allocations = PipeRoute.query.order_by(PipeRoute.created_at.desc()).all()
    merchants = {
        merchant.email: merchant.business_name
        for merchant in Merchant.query.all()
    }

    pool_data = []
    for pool in pools:
        pool_allocations = [
            allocation
            for allocation in allocations
            if allocation.mid_pool_id == str(pool.id)
        ]
        used_volume = sum(
            float(allocation.used_volume or 0)
            for allocation in pool_allocations
        )
        pool_data.append(
            pool.to_dict(
                used_volume=used_volume,
                assigned_merchants=len(pool_allocations),
            )
        )

    allocation_data = [
        allocation.to_allocation_dict(
            merchants.get(allocation.merchant_email, "")
        )
        for allocation in allocations
    ]
    return jsonify(
        {
            "success": True,
            "midPools": pool_data,
            "allocations": allocation_data,
        }
    )


@api.post("/admin/mid-pools")
@require_roles("admin")
def create_mid_pool():
    body = payload()
    gateway_name = str(body.get("gatewayName") or "").strip()
    mid_name = str(body.get("midName") or "").strip()
    mid_id = str(body.get("midId") or "").strip()
    total_limit = money(body.get("totalLimit"))
    cycle = str(body.get("cycle") or "monthly").strip().lower()
    template_id = str(body.get("credentialTemplateId") or "").strip()
    template = find_credential_template(template_id)
    payin_status = str(body.get("payinStatus") or "active").strip().lower()
    payout_status = str(body.get("payoutStatus") or "active").strip().lower()

    if (
        not gateway_name
        or not mid_name
        or not mid_id
        or total_limit <= 0
    ):
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Gateway, MID name, MID ID and total limit are required",
                }
            ),
            400,
        )
    if cycle not in {"daily", "monthly"}:
        return jsonify({"success": False, "message": "Invalid MID cycle"}), 400
    if payin_status not in {"active", "paused", "blocked"} or payout_status not in {"active", "paused", "blocked"}:
        return jsonify({"success": False, "message": "Invalid pay-in or payout status"}), 400
    if MidPool.query.filter_by(mid_id=mid_id).first():
        return jsonify({"success": False, "message": "MID ID already exists"}), 409

    pool = MidPool(
        gateway_name=gateway_name,
        mid_name=mid_name,
        mid_id=mid_id,
        total_limit=total_limit,
        cycle=cycle,
        status="active",
        payin_status=payin_status,
        payout_status=payout_status,
        notes=str(body.get("notes") or "").strip(),
        credential_template_id=template.id if template else None,
    )
    db.session.add(pool)
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "MID pool created successfully",
                "midPool": pool.to_dict(),
            }
        ),
        201,
    )


@api.patch("/admin/mid-pools/<mid_pool_id>")
@require_roles("admin")
def update_mid_pool(mid_pool_id: str):
    pool = db.session.get(MidPool, int(mid_pool_id)) if mid_pool_id.isdigit() else None
    if not pool:
        return jsonify({"success": False, "message": "MID pool not found"}), 404
    body = payload()
    if "credentialTemplateId" in body:
        template_id = str(body.get("credentialTemplateId") or "").strip()
        template = find_credential_template(template_id)
        if not template:
            return jsonify({"success": False, "message": "Template not found"}), 404
        pool.credential_template_id = template.id
    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in {"active", "paused", "blocked"}:
            return jsonify({"success": False, "message": "Invalid MID status"}), 400
        pool.status = status
    for api_key, attr in (("payinStatus", "payin_status"), ("payoutStatus", "payout_status")):
        if api_key in body:
            status = str(body.get(api_key) or "").strip().lower()
            if status not in {"active", "paused", "blocked"}:
                return jsonify({"success": False, "message": f"Invalid {api_key}"}), 400
            setattr(pool, attr, status)
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "MID pool updated",
            "midPool": pool.to_dict(),
        }
    )


@api.get("/admin/mid-allocations")
@require_roles("admin")
def list_mid_allocations():
    merchants = {
        merchant.email: merchant.business_name
        for merchant in Merchant.query.all()
    }
    rows = PipeRoute.query.order_by(PipeRoute.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "allocations": [
                row.to_allocation_dict(merchants.get(row.merchant_email, ""))
                for row in rows
            ],
        }
    )


@api.post("/admin/mid-allocations")
@require_roles("admin")
def create_mid_allocation():
    user = current_user() or {}
    body = payload()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    mid_pool_id = str(body.get("midPoolId") or "").strip()
    merchant_limit = money(body.get("merchantLimit"))
    commission_percent = float(body.get("commissionPercent") or 0)
    payin_status = str(body.get("payinStatus") or "active").strip().lower()
    payout_status = str(body.get("payoutStatus") or "active").strip().lower()

    merchant = Merchant.query.filter_by(email=merchant_email).first()
    pool = (
        db.session.get(MidPool, int(mid_pool_id))
        if mid_pool_id.isdigit()
        else None
    )
    if not merchant:
        return jsonify({"success": False, "message": "Merchant account not found"}), 404
    if merchant.status != "active":
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Approve this merchant before linking a MID",
                }
            ),
            409,
        )
    if not pool:
        return jsonify({"success": False, "message": "MID pool not found"}), 404
    if merchant_limit <= 0 or merchant_limit > float(pool.total_limit or 0):
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Merchant limit must be within the MID pool limit",
                }
            ),
            400,
        )
    if commission_percent < 0 or commission_percent > 100:
        return jsonify({"success": False, "message": "Invalid commission"}), 400
    if payin_status not in {"active", "paused", "blocked"} or payout_status not in {"active", "paused", "blocked"}:
        return jsonify({"success": False, "message": "Invalid pay-in or payout status"}), 400
    duplicate = PipeRoute.query.filter_by(
        merchant_email=merchant_email,
        mid_pool_id=str(pool.id),
    ).first()
    if duplicate:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "This MID pool is already assigned to the merchant",
                }
            ),
            409,
        )

    route = PipeRoute(
        merchant_email=merchant_email,
        pipe_name=pool.mid_name,
        gateway_name=pool.gateway_name,
        mid_pool_id=str(pool.id),
        mid_id=pool.mid_id,
        provider_merchant_id=pool.mid_id,
        min_amount=1,
        max_amount=merchant_limit,
        volume_limit=merchant_limit,
        priority=PipeRoute.query.filter_by(merchant_email=merchant_email).count()
        + 1,
        commission_percent=commission_percent,
        status="active",
        payin_status=payin_status,
        payout_status=payout_status,
        notes=str(body.get("notes") or "").strip(),
        updated_by=str(user.get("email") or ""),
    )
    db.session.add(route)
    db.session.flush()
    sync_merchant_gateway_summary(merchant_email)
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Merchant gateway assigned successfully",
                "allocation": route.to_allocation_dict(merchant.business_name),
            }
        ),
        201,
    )


@api.patch("/admin/mid-allocations/<allocation_id>")
@require_roles("admin")
def update_mid_allocation(allocation_id: str):
    route = (
        db.session.get(PipeRoute, int(allocation_id))
        if allocation_id.isdigit()
        else None
    )
    if not route:
        return jsonify({"success": False, "message": "Gateway assignment not found"}), 404
    body = payload()
    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in {"active", "paused", "blocked"}:
            return jsonify({"success": False, "message": "Invalid assignment status"}), 400
        route.status = status
    for api_key, attr in (("payinStatus", "payin_status"), ("payoutStatus", "payout_status")):
        if api_key in body:
            status = str(body.get(api_key) or "").strip().lower()
            if status not in {"active", "paused", "blocked"}:
                return jsonify({"success": False, "message": f"Invalid {api_key}"}), 400
            setattr(route, attr, status)
    sync_merchant_gateway_summary(route.merchant_email)
    db.session.commit()
    status_label = route.status
    return jsonify(
        {
            "success": True,
            "message": f"Gateway assignment {status_label}",
            "allocation": route.to_allocation_dict(),
        }
    )


@api.delete("/admin/mid-allocations/<allocation_id>")
@require_roles("admin")
def delete_mid_allocation(allocation_id: str):
    route = (
        db.session.get(PipeRoute, int(allocation_id))
        if allocation_id.isdigit()
        else None
    )
    if not route:
        return jsonify({"success": False, "message": "Gateway assignment not found"}), 404
    merchant_email = route.merchant_email
    db.session.delete(route)
    db.session.flush()
    sync_merchant_gateway_summary(merchant_email)
    db.session.commit()
    return jsonify(
        {"success": True, "message": "Gateway assignment removed"}
    )


@api.get("/admin/pipe-routing")
@require_roles("admin", "ops")
def list_pipe_routes():
    routes = PipeRoute.query.order_by(
        PipeRoute.merchant_email.asc(), PipeRoute.priority.asc(), PipeRoute.created_at.desc()
    ).all()
    merchants = Merchant.query.order_by(Merchant.created_at.desc()).limit(500).all()
    pools = MidPool.query.order_by(MidPool.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "routes": [row.to_dict() for row in routes],
            "midPools": [row.to_dict() for row in pools],
            "merchants": [row.to_dict() for row in merchants],
        }
    )


@api.post("/admin/pipe-routing")
@require_roles("admin", "ops")
def save_pipe_route():
    user = current_user() or {}
    body = payload()
    route_id = str(body.get("id") or body.get("_id") or "").strip()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    gateway_name = str(body.get("gatewayName") or "").strip().lower()
    if not merchant_email or not gateway_name:
        return jsonify({"success": False, "message": "merchantEmail and gatewayName are required"}), 400

    route = db.session.get(PipeRoute, int(route_id)) if route_id.isdigit() else None
    if not route:
        route = PipeRoute(merchant_email=merchant_email, gateway_name=gateway_name)
        db.session.add(route)

    route.merchant_email = merchant_email
    route.pipe_name = str(body.get("pipeName") or gateway_name).strip()
    route.gateway_name = gateway_name
    route.mid_pool_id = str(body.get("midPoolId") or "").strip()
    route.mid_id = str(body.get("midId") or "").strip()
    route.provider_merchant_id = str(body.get("providerMerchantId") or route.mid_id or "").strip()
    route.min_amount = money(body.get("minAmount") or 1)
    route.max_amount = money(body.get("maxAmount") or 100000)
    route.priority = int(body.get("priority") or 100)
    route.volume_limit = money(body.get("volumeLimit") or 0)
    route.status = str(body.get("status") or "active").strip()
    route.payin_status = str(body.get("payinStatus") or route.status or "active").strip()
    route.payout_status = str(body.get("payoutStatus") or route.status or "active").strip()
    route.auto_disable_on_limit = body.get("autoDisableOnLimit") is not False
    route.notes = str(body.get("notes") or "").strip()
    route.commission_percent = float(body.get("commissionPercent") or 0)
    route.updated_by = str(user.get("email") or "")
    db.session.commit()
    return jsonify({"success": True, "message": "Pipe route saved successfully", "route": route.to_dict()})


@api.get("/admin/finance/profit-report")
@require_roles("admin")
def profit_report():
    transactions = Transaction.query.all()
    success = [t for t in transactions if t.status in {"success", "paid", "completed"}]
    failed = [t for t in transactions if t.status in {"failed", "failure", "cancelled"}]
    successful_volume = money(sum(float(t.amount or 0) for t in success))
    failed_volume = money(sum(float(t.amount or 0) for t in failed))
    merchant_emails = sorted(
        {
            *(t.merchant_email for t in transactions if t.merchant_email),
            *(p.merchant_email for p in Payout.query.all() if p.merchant_email),
        }
    )
    reports = []
    totals = {
        "payinVolume": 0,
        "payinGrossProfit": 0,
        "payoutPaidAmount": 0,
        "payoutGrossProfit": 0,
        "totalGrossProfit": 0,
        "payinFeeCollected": 0,
        "totalPayinCost": 0,
        "usdtConfirmedInrAmount": 0,
    }
    for merchant_email in merchant_emails:
        merchant_success = [
            t for t in success if t.merchant_email == merchant_email
        ]
        payin_volume = money(sum(float(t.amount or 0) for t in merchant_success))
        payout_summary = payout_summary_for_merchant(merchant_email)
        total_gross_profit = money(payout_summary["grossProfit"])
        reports.append(
            {
                "merchantEmail": merchant_email,
                "payin": {
                    "volume": payin_volume,
                    "grossProfit": 0,
                },
                "payout": payout_summary,
                "usdt": {"confirmedInrAmount": 0},
                "totalGrossProfit": total_gross_profit,
                "merchantPayableBeforePayoutUsdt": money(
                    payin_volume
                    - payout_summary["paidAmount"]
                    - payout_summary["pendingAmount"]
                ),
            }
        )
        totals["payinVolume"] = money(totals["payinVolume"] + payin_volume)
        totals["payoutPaidAmount"] = money(
            totals["payoutPaidAmount"] + payout_summary["paidAmount"]
        )
        totals["payoutGrossProfit"] = money(
            totals["payoutGrossProfit"] + payout_summary["grossProfit"]
        )
        totals["totalGrossProfit"] = money(
            totals["totalGrossProfit"] + total_gross_profit
        )
    return jsonify(
        {
            "success": True,
            "reports": reports,
            "totals": totals,
            "report": {
                "successfulVolume": successful_volume,
                "failedVolume": failed_volume,
                "successCount": len(success),
                "failedCount": len(failed),
                "grossProfit": totals["totalGrossProfit"],
                "netProfit": totals["totalGrossProfit"],
            },
        }
    )


@api.get("/admin/finance/payouts")
@require_roles("admin")
def finance_payouts():
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    query = Payout.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(Payout.created_at.desc()).all()
    return jsonify({"success": True, "count": len(rows), "payouts": [row.to_dict() for row in rows]})


@api.post("/admin/finance/payouts")
@require_roles("admin")
def admin_create_payout():
    return create_payout_for_current_context(admin_request=True)


@api.get("/merchant/payouts")
@require_roles("merchant", "admin")
def merchant_payouts():
    user = current_user() or {}
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    if user.get("role") == "merchant":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()
    query = Payout.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(Payout.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "payouts": [row.to_dict() for row in rows],
            "summary": payout_summary_for_merchant(merchant_email) if merchant_email else {},
        }
    )


@api.post("/merchant/payouts")
@require_roles("merchant", "admin")
def merchant_create_payout():
    return create_payout_for_current_context(admin_request=False)


@api.post("/merchant/payouts/status")
@require_roles("merchant", "admin")
def merchant_payout_status():
    user = current_user() or {}
    body = payload()
    payout_id = str(body.get("payoutId") or body.get("id") or "").strip()
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    if (
        user.get("role") == "merchant"
        and payout.merchant_email != str(user.get("merchantEmail") or "").strip().lower()
    ):
        return jsonify({"success": False, "message": "Access denied"}), 403
    provider = str(payout.provider or "").lower()
    if provider not in {"rockypayz", "rupayex", "alosheell"} and not payout.provider_txn_id:
        return jsonify({"success": True, "message": "Payout has not been submitted to a provider yet", "payout": payout.to_dict()})
    if provider == "alosheell":
        return jsonify({"success": True, "message": "Alosheell payout status is callback-driven", "payout": payout.to_dict()})
    if provider == "rupayex":
        try:
            provider_response = check_rupayex_payout_status(
                payout.provider_txn_id or payout.payout_id,
                credentials=credentials_for_payout(payout, "rupayex"),
            )
        except (RupayExError, CredentialEncryptionError) as error:
            return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502
        update_rupayex_payout_from_provider(payout, provider_response)
        return jsonify({"success": True, "message": "Payout status refreshed", "payout": payout.to_dict(), "rupayex": provider_response})
    try:
        provider_response = check_rockypayz_payout_status(
            payout.provider_txn_id or payout.payout_id,
            credentials=credentials_for_payout(payout, "rockypayz"),
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502
    update_payout_from_provider(payout, provider_response)
    return jsonify({"success": True, "message": "Payout status refreshed", "payout": payout.to_dict(), "rockypayz": provider_response})


def create_payout_for_current_context(*, admin_request: bool):
    user = current_user() or {}
    body = payload()
    merchant_email = str(body.get("merchantEmail") or user.get("merchantEmail") or "").strip().lower()
    if user.get("role") == "merchant":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()

    amount = money(body.get("amount"))
    beneficiary_name = str(body.get("beneficiaryName") or body.get("customerName") or "").strip()
    account_number = str(body.get("accountNumber") or "").strip()
    ifsc = str(body.get("ifsc") or "").strip().upper()
    beneficiary_mobile = str(
        body.get("beneficiaryMobile") or body.get("mobile") or body.get("customerMobile") or ""
    ).strip()

    if not merchant_email:
        return jsonify({"success": False, "message": "Merchant email is required"}), 400
    if amount <= 0:
        return jsonify({"success": False, "message": "Valid payout amount is required"}), 400
    if not beneficiary_name or not account_number or not ifsc:
        return jsonify({"success": False, "message": "Beneficiary name, account number and IFSC are required"}), 400
    if not beneficiary_mobile.isdigit() or len(beneficiary_mobile) != 10:
        return jsonify({"success": False, "message": "Valid 10-digit beneficiary mobile is required"}), 400

    try:
        gateway, _selected_pool, provider_credentials = selected_payout_context(
            merchant_email,
            amount,
            route_id=str(
                body.get("merchantMidAllocationId")
                or body.get("midAllocationId")
                or ""
            ).strip(),
        )
    except CredentialEncryptionError as error:
        return jsonify({"success": False, "message": str(error)}), 503

    if gateway == "alosheell":
        min_amount = float(provider_credentials.get("payoutMinAmount") or 100)
        max_amount = float(provider_credentials.get("payoutMaxAmount") or 40000)
        if amount < min_amount or amount > max_amount:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"Alosheell payout amount must be between INR {min_amount:g} and INR {max_amount:g}",
                    }
                ),
                400,
            )
    if gateway == "rockypayz":
        min_amount = float(provider_credentials.get("payoutMinAmount") or 100)
        max_amount = float(provider_credentials.get("payoutMaxAmount") or 50000)
        if amount < min_amount or amount > max_amount:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"RockyPayz payout amount must be between INR {min_amount:g} and INR {max_amount:g}",
                    }
                ),
                400,
            )

    parts = payout_fee_parts(merchant_email, amount)
    payout = Payout(
        payout_id=f"pout_{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(4)}",
        merchant_email=merchant_email,
        amount=amount,
        currency=str(body.get("currency") or "INR").strip().upper(),
        beneficiary_name=beneficiary_name,
        account_number=account_number,
        ifsc=ifsc,
        bank_name=str(body.get("bankName") or "").strip(),
        beneficiary_mobile=beneficiary_mobile,
        note=str(body.get("note") or body.get("remarks") or "").strip(),
        merchant_fee_percent=parts["merchant_fee_percent"],
        merchant_fee_amount=parts["merchant_fee_amount"],
        provider_cost_percent=parts["provider_cost_percent"],
        provider_cost_amount=parts["provider_cost_amount"],
        gross_profit_amount=parts["gross_profit_amount"],
        status="pending",
        created_by=str(user.get("email") or ""),
    )
    db.session.add(payout)
    db.session.commit()

    try:
        payout, provider_response = submit_payout_to_selected_gateway(
            payout,
            gateway,
            provider_credentials,
        )
    except (
        RockyPayzError,
        RupayExError,
        AlosheellError,
        CredentialEncryptionError,
    ) as error:
        payout.provider = gateway_key(gateway)
        payout.provider_status = "submit_failed"
        payout.provider_response = str(error)[:8000]
        payout.status = "failed"
        payout.failed_at = utcnow()
        db.session.commit()
        return (
            jsonify(
                {
                    "success": False,
                    "message": str(error),
                    "payout": payout.to_dict(),
                }
            ),
            502,
        )

    return (
        jsonify(
            {
                "success": True,
                "message": f"Payout submitted to {payout.provider or gateway}",
                "payout": payout.to_dict(),
                "selectedGateway": payout.provider or gateway_key(gateway),
                "providerResponse": provider_response,
            }
        ),
        201,
    )


@api.post("/admin/finance/payouts/<payout_id>/rockypayz-submit")
@require_roles("admin")
def submit_rockypayz_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    if payout.status not in {"pending", "processing"}:
        return jsonify({"success": False, "message": "Only pending or processing payouts can be submitted", "status": payout.status}), 409

    try:
        provider_reference = provider_payout_reference(payout, prefix="R")
        provider_response = submit_rockypayz_provider_payout(
            payout_id=provider_reference,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            customer_mobile=payout.beneficiary_mobile,
            credentials=credentials_for_payout(payout, "rockypayz"),
            remarks=payout.note or "Wpay payout",
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        payout.provider = "rockypayz"
        payout.provider_status = "submit_failed"
        payout.provider_response = str(error)[:8000]
        payout.status = "failed"
        payout.failed_at = utcnow()
        db.session.commit()
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502

    update_payout_from_provider(payout, provider_response, submitted=True)
    return jsonify(
        {
            "success": True,
            "message": "Payout submitted to RockyPayz",
            "payout": payout.to_dict(),
            "rockypayz": provider_response,
        }
    )


@api.post("/admin/finance/payouts/<payout_id>/rockypayz-status")
@require_roles("admin")
def check_rockypayz_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    try:
        provider_response = check_rockypayz_payout_status(
            payout.provider_txn_id or payout.payout_id,
            credentials=credentials_for_payout(payout, "rockypayz"),
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502

    update_payout_from_provider(payout, provider_response)
    return jsonify(
        {
            "success": True,
            "message": "RockyPayz payout status refreshed",
            "payout": payout.to_dict(),
            "rockypayz": provider_response,
        }
    )


@api.post("/admin/finance/payouts/<payout_id>/rupayex-submit")
@require_roles("admin")
def submit_rupayex_finance_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    if payout.status not in {"pending", "processing"}:
        return jsonify({"success": False, "message": "Only pending or processing payouts can be submitted", "status": payout.status}), 409

    try:
        provider_response = submit_rupayex_payout(
            payout_id=payout.payout_id,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            credentials=credentials_for_payout(payout, "rupayex"),
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            bank_name=payout.bank_name,
        )
    except (RupayExError, CredentialEncryptionError) as error:
        payout.provider = "rupayex"
        payout.provider_status = "submit_failed"
        payout.provider_response = str(error)[:8000]
        payout.status = "failed"
        payout.failed_at = utcnow()
        db.session.commit()
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502

    update_rupayex_payout_from_provider(payout, provider_response, submitted=True)
    return jsonify(
        {
            "success": True,
            "message": "Payout submitted to RupayEx",
            "payout": payout.to_dict(),
            "rupayex": provider_response,
        }
    )


@api.post("/admin/finance/payouts/<payout_id>/rupayex-status")
@require_roles("admin")
def check_rupayex_finance_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    try:
        provider_response = check_rupayex_payout_status(
            payout.provider_txn_id or payout.payout_id,
            credentials=credentials_for_payout(payout, "rupayex"),
        )
    except (RupayExError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502

    update_rupayex_payout_from_provider(payout, provider_response)
    return jsonify(
        {
            "success": True,
            "message": "RupayEx payout status refreshed",
            "payout": payout.to_dict(),
            "rupayex": provider_response,
        }
    )


@api.post("/admin/finance/payouts/<payout_id>/alosheell-submit")
@require_roles("admin")
def submit_alosheell_finance_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    if payout.status not in {"pending", "processing"}:
        return jsonify({"success": False, "message": "Only pending or processing payouts can be submitted", "status": payout.status}), 409

    callback_url = str(
        os.getenv("ALOSHEELL_PAYOUT_CALLBACK_URL")
        or f"{request.host_url.rstrip('/')}/api/alosheell/payout-callback"
    ).strip()
    try:
        provider_response = submit_alosheell_payout(
            payout_id=payout.payout_id,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            bank_name=payout.bank_name,
            beneficiary_mobile=payout.beneficiary_mobile,
            callback_url=callback_url,
            credentials=credentials_for_payout(payout, "alosheell"),
            remarks=payout.note or "Wpay payout",
        )
    except (AlosheellError, CredentialEncryptionError) as error:
        payout.provider = "alosheell"
        payout.provider_status = "submit_failed"
        payout.provider_response = str(error)[:8000]
        payout.status = "failed"
        payout.failed_at = utcnow()
        db.session.commit()
        return jsonify({"success": False, "message": str(error), "payout": payout.to_dict()}), 502

    update_alosheell_payout_from_provider(payout, provider_response, submitted=True)
    return jsonify(
        {
            "success": True,
            "message": "Payout submitted to Alosheell",
            "payout": payout.to_dict(),
            "alosheell": provider_response,
        }
    )


@api.post("/admin/finance/payouts/<payout_id>/alosheell-status")
@require_roles("admin")
def check_alosheell_finance_payout(payout_id: str):
    payout = find_payout(payout_id)
    if not payout:
        return jsonify({"success": False, "message": "Payout request not found"}), 404
    return jsonify(
        {
            "success": True,
            "message": "Alosheell payout status is callback-driven",
            "payout": payout.to_dict(),
        }
    )


def submit_payout_to_selected_gateway(
    payout: Payout,
    gateway: str,
    credentials: dict[str, str],
) -> tuple[Payout, dict]:
    gateway_name = gateway_key(gateway)
    if gateway_name == "rockypayz":
        provider_reference = provider_payout_reference(payout, prefix="R")
        provider_response = submit_rockypayz_provider_payout(
            payout_id=provider_reference,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            customer_mobile=payout.beneficiary_mobile,
            credentials=credentials,
            remarks=payout.note or "Wpay payout",
        )
        update_payout_from_provider(payout, provider_response, submitted=True)
        return payout, provider_response

    if gateway_name == "rupayex":
        provider_response = submit_rupayex_payout(
            payout_id=payout.payout_id,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            credentials=credentials,
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            bank_name=payout.bank_name,
        )
        update_rupayex_payout_from_provider(payout, provider_response, submitted=True)
        return payout, provider_response

    if gateway_name == "alosheell":
        callback_url = str(
            os.getenv("ALOSHEELL_PAYOUT_CALLBACK_URL")
            or f"{request.host_url.rstrip('/')}/api/alosheell/payout-callback"
        ).strip()
        provider_response = submit_alosheell_payout(
            payout_id=payout.payout_id,
            amount=payout.amount,
            beneficiary_name=payout.beneficiary_name,
            account_number=payout.account_number,
            ifsc=payout.ifsc,
            bank_name=payout.bank_name,
            beneficiary_mobile=payout.beneficiary_mobile,
            callback_url=callback_url,
            credentials=credentials,
            remarks=payout.note or "Wpay payout",
        )
        update_alosheell_payout_from_provider(payout, provider_response, submitted=True)
        return payout, provider_response

    raise CredentialEncryptionError(
        f"Gateway {gateway_name or gateway or 'unknown'} is not available for payouts"
    )


@api.get("/admin/merchant-pricing")
@require_roles("admin")
def list_merchant_pricing():
    rows = MerchantPricing.query.order_by(MerchantPricing.merchant_email.asc()).all()
    return jsonify({"success": True, "pricing": [row.to_dict() for row in rows]})


@api.post("/admin/merchant-pricing")
@api.patch("/admin/merchant-pricing")
@require_roles("admin")
def save_merchant_pricing():
    body = payload()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    if not merchant_email:
        return jsonify({"success": False, "message": "Merchant email is required"}), 400
    row = MerchantPricing.query.filter_by(merchant_email=merchant_email).first()
    if not row:
        row = MerchantPricing(merchant_email=merchant_email)
        db.session.add(row)
    if "payinSellingFeePercent" in body:
        row.payin_selling_fee_percent = money(body.get("payinSellingFeePercent"))
    if "payoutSellingFeePercent" in body:
        row.payout_selling_fee_percent = money(body.get("payoutSellingFeePercent"))
    if "usdtSettlementAllowed" in body:
        row.usdt_settlement_allowed = bool(body.get("usdtSettlementAllowed"))
    db.session.commit()
    return jsonify({"success": True, "message": "Merchant pricing saved", "pricing": row.to_dict()})


@api.get("/payment-links")
@require_roles("admin", "merchant", "ops")
def list_payment_links():
    user = current_user() or {}
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    if user.get("role") == "merchant":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()
    expire_stale_payments(merchant_email=merchant_email if user.get("role") == "merchant" else "")
    query = PaymentLink.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(PaymentLink.created_at.desc()).all()
    return jsonify({"success": True, "count": len(rows), "paymentLinks": [row.to_dict() for row in rows], "links": [row.to_dict() for row in rows]})


PAYMENT_INTENT_KEYS = (
    "clientTxnId",
    "clientReferenceNo",
    "paymentTarget",
    "paymentUrl",
    "hostedPaymentUrl",
    "upiLink",
    "qrPayload",
    "expiresInSeconds",
    "selectedGateway",
    "requiresUtr",
    "utrLength",
    "verificationMode",
)


def payment_intent_payload_from_response(data: dict) -> dict:
    return {key: data.get(key) for key in PAYMENT_INTENT_KEYS if key in data}


def payment_intent_payload_from_transaction(transaction: Transaction | None) -> dict:
    if not transaction:
        return {}
    payload = {
        "clientTxnId": transaction.transaction_id,
        "paymentTarget": transaction.payment_target,
        "paymentUrl": transaction.payment_url,
        "hostedPaymentUrl": transaction.hosted_payment_url,
        "upiLink": transaction.upi_link,
        "qrPayload": transaction.qr_payload,
    }
    if transaction.route_type == "bank_rail" or transaction.provider == "bank_rail":
        payload.update(
            {
                "selectedGateway": "bank_rail",
                "requiresUtr": True,
                "utrLength": 12,
                "verificationMode": "bank_scrape",
            }
        )
    if transaction.expires_at:
        now = utcnow()
        expires_at = transaction.expires_at
        if expires_at.tzinfo is None and now.tzinfo is not None:
            now = now.replace(tzinfo=None)
        remaining = max(0, int((expires_at - now).total_seconds()))
        payload["expiresInSeconds"] = remaining
    return {key: value for key, value in payload.items() if value not in (None, "")}


def latest_payment_intent_transaction(link_id: str) -> Transaction | None:
    return (
        Transaction.query.filter(
            Transaction.payment_link_id == link_id,
            Transaction.status == "pending",
            or_(
                Transaction.payment_target != "",
                Transaction.upi_link != "",
                Transaction.qr_payload != "",
            ),
        )
        .order_by(Transaction.created_at.desc())
        .first()
    )


def payment_page_url(link_id: str) -> str:
    return f"{current_app.config['PUBLIC_APP_URL'].rstrip('/')}/pay/{link_id}"


def standard_paybook_for_link(link: PaymentLink, merchant: Merchant | None) -> dict:
    merchant_name = merchant.business_name if merchant else link.merchant_email.split("@", 1)[0]
    return {
        "brandName": "Wpay",
        "subtitle": "Secure checkout",
        "vendorLabel": merchant_name,
        "accentColor": "#087f5b",
        "supportText": "Encrypted checkout. Your UPI PIN stays inside your payment app.",
        "logoImageUrl": "",
        "themeMode": "system",
        "showPoweredBy": True,
        "showOrderDetails": True,
        "showSupportText": True,
    }


def paybook_for_payment_link(link: PaymentLink, merchant: Merchant | None) -> dict:
    if merchant and merchant.payme_enabled:
        return merchant.paybook_settings()
    return standard_paybook_for_link(link, merchant)


def payme_payload(merchant: Merchant | None, link: PaymentLink) -> dict:
    enabled = bool(merchant and merchant.payme_enabled)
    url = payment_page_url(link.link_id)
    setup_url = f"{current_app.config['PUBLIC_APP_URL'].rstrip('/')}/merchant/payment-page"
    payload = {
        "enabled": enabled,
        "mode": "payme" if enabled else "intent",
        "linkId": link.link_id,
        "paymentPageUrl": url,
        "standardPaymentPageUrl": url,
        "setupUrl": setup_url,
        "paymeSetupUrl": setup_url,
    }
    if enabled and merchant:
        payload["settings"] = merchant.paybook_settings()
        payload["brandName"] = merchant.paybook_settings().get("brandName")
        payload["vendorLabel"] = merchant.paybook_settings().get("vendorLabel")
    return payload


def attach_payment_link_urls(response_payload: dict, merchant: Merchant | None, link: PaymentLink) -> dict:
    payme = payme_payload(merchant, link)
    response_payload["payme"] = payme
    response_payload["paymeEnabled"] = payme["enabled"]
    response_payload["paymentPageUrl"] = payme["paymentPageUrl"]
    response_payload["standardPaymentPageUrl"] = payme["standardPaymentPageUrl"]
    response_payload["paymeSetupUrl"] = payme["paymeSetupUrl"]
    return response_payload


@api.post("/payment-links")
@require_roles("admin", "merchant", "ops")
def create_payment_link():
    user = current_user() or {}
    body = payload()
    merchant_email = str(body.get("merchantEmail") or user.get("merchantEmail") or "").strip().lower()
    amount = money(body.get("amount"))
    if not merchant_email or amount <= 0:
        return jsonify({"success": False, "message": "Merchant email and amount are required"}), 400
    merchant = Merchant.query.filter_by(email=merchant_email).first()
    if not merchant or merchant.status != "active":
        return jsonify({"success": False, "message": "Merchant must be approved before creating payment links"}), 403
    allocation_id = str(body.get("merchantMidAllocationId") or "").strip()
    if allocation_id:
        allocation = db.session.get(PipeRoute, int(allocation_id)) if allocation_id.isdigit() else None
        if (
            not allocation
            or allocation.merchant_email != merchant_email
            or allocation.status != "active"
        ):
            return jsonify({"success": False, "message": "Selected MID is not assigned to this merchant"}), 400
    settings = merchant.webhook_settings() if merchant else {}
    notify_url = str(
        body.get("notifyUrl")
        or body.get("notify_url")
        or body.get("callbackNotifyUrl")
        or body.get("callbackUrl")
        or body.get("callback_url")
        or body.get("webhookUrl")
        or body.get("webhook_url")
        or settings.get("payinWebhookUrl")
        or ""
    ).strip()
    success_redirect_url = str(
        body.get("successRedirectUrl")
        or body.get("redirectUrl")
        or settings.get("successRedirectUrl")
        or ""
    ).strip()
    failed_redirect_url = str(
        body.get("failedRedirectUrl")
        or body.get("redirectUrl")
        or body.get("successRedirectUrl")
        or settings.get("failedRedirectUrl")
        or ""
    ).strip()
    link = PaymentLink(
        link_id=f"plink_{secrets.token_hex(8)}",
        merchant_email=merchant_email,
        title=str(body.get("title") or "Payment").strip(),
        amount=amount,
        currency=str(body.get("currency") or "INR").strip(),
        customer_name=str(body.get("customerName") or "").strip(),
        customer_email=str(body.get("customerEmail") or "").strip().lower(),
        notify_url=notify_url,
        callback_secret=str(
            body.get("callbackSecret") or settings.get("webhookSecret") or secrets.token_urlsafe(24)
        ).strip(),
        success_redirect_url=success_redirect_url,
        failed_redirect_url=failed_redirect_url,
        merchant_mid_allocation_id=allocation_id,
    )
    db.session.add(link)
    db.session.commit()
    link_data = link.to_dict()
    response_payload = {
        "success": True,
        "message": "Payment link created",
        "paymentLink": link_data,
        "link": link_data,
    }
    attach_payment_link_urls(response_payload, merchant, link)

    explicit_intent_request = bool(
        body.get("autoInitiate")
        or body.get("returnIntent")
        or body.get("generateIntent")
        or body.get("initiatePayment")
    )
    has_active_payin_route = (
        PipeRoute.query.filter_by(merchant_email=merchant_email, status="active").first()
        is not None
        or BankRailRoute.query.filter_by(
            merchant_email=merchant_email,
            status="active",
            payin_status="active",
        ).first()
        is not None
    )
    auto_initiate = explicit_intent_request or (
        user.get("authType") == "apiKey" and has_active_payin_route
    )
    if not auto_initiate:
        return jsonify(response_payload), 201

    initiated = initiate_payment_link(link.link_id)
    initiate_status = 200
    initiate_response = initiated
    if isinstance(initiated, tuple):
        initiate_response = initiated[0]
        initiate_status = int(initiated[1] or 500)
    initiate_data = initiate_response.get_json(silent=True) if hasattr(initiate_response, "get_json") else None
    initiate_data = initiate_data if isinstance(initiate_data, dict) else {}

    if initiate_status >= 400 or not initiate_data.get("success"):
        return (
            jsonify(
                {
                    **response_payload,
                    "success": False,
                    "message": f"Payment link created but payment initiation failed: {initiate_data.get('message') or 'Unable to generate payment intent'}",
                    "paymentInitiated": False,
                    "initiateError": initiate_data,
                }
            ),
            initiate_status,
        )

    payment = payment_intent_payload_from_response(initiate_data)
    return (
        jsonify(
            {
                **response_payload,
                "message": "Payment link created and payment initiated",
                "paymentInitiated": True,
                "payment": payment,
                "transaction": initiate_data.get("transaction"),
                "clientTxnId": payment.get("clientTxnId"),
                "paymentTarget": payment.get("paymentTarget"),
                "paymentUrl": payment.get("paymentUrl"),
                "hostedPaymentUrl": payment.get("hostedPaymentUrl"),
                "upiLink": payment.get("upiLink"),
                "qrPayload": payment.get("qrPayload"),
                "expiresInSeconds": payment.get("expiresInSeconds"),
                "selectedGateway": payment.get("selectedGateway"),
                "requiresUtr": payment.get("requiresUtr"),
                "utrLength": payment.get("utrLength"),
                "verificationMode": payment.get("verificationMode"),
            }
        ),
        201,
    )


@api.get("/payment-links/<link_id>")
def get_payment_link(link_id: str):
    expire_stale_payments()
    link = PaymentLink.query.filter_by(link_id=link_id).first()
    if not link:
        return jsonify({"success": False, "message": "Payment link not found"}), 404
    link_data = link.to_dict()
    merchant = Merchant.query.filter_by(email=link.merchant_email).first()
    link_data["merchantName"] = (
        merchant.business_name if merchant else link.merchant_email.split("@", 1)[0]
    )
    link_data["paybook"] = paybook_for_payment_link(link, merchant)
    link_data["paymeEnabled"] = bool(merchant and merchant.payme_enabled)
    response_payload = {"success": True, "paymentLink": link_data, "link": link_data}
    attach_payment_link_urls(response_payload, merchant, link)

    user = current_user() or {}
    user_merchant_email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    is_link_owner = bool(user_merchant_email and user_merchant_email == link.merchant_email.lower())
    explicit_intent_request = str(request.args.get("returnIntent") or "").lower() in {"1", "true", "yes"} or str(
        request.args.get("autoInitiate") or ""
    ).lower() in {"1", "true", "yes"}
    can_return_intent = (
        user.get("authType") == "apiKey"
        and is_link_owner
    ) or (
        explicit_intent_request
        and (user.get("role") in {"admin", "ops"} or is_link_owner)
    )

    existing_intent = latest_payment_intent_transaction(link.link_id)
    if existing_intent:
        payment = payment_intent_payload_from_transaction(existing_intent)
        response_payload.update(
            {
                "paymentInitiated": True,
                "payment": payment,
                "transaction": existing_intent.to_dict(),
                "clientTxnId": payment.get("clientTxnId"),
                "paymentTarget": payment.get("paymentTarget"),
                "paymentUrl": payment.get("paymentUrl"),
                "hostedPaymentUrl": payment.get("hostedPaymentUrl"),
                "upiLink": payment.get("upiLink"),
                "qrPayload": payment.get("qrPayload"),
                "expiresInSeconds": payment.get("expiresInSeconds"),
            }
        )
        return jsonify(response_payload)

    if not can_return_intent:
        return jsonify(response_payload)

    initiated = initiate_payment_link(link.link_id)
    initiate_status = 200
    initiate_response = initiated
    if isinstance(initiated, tuple):
        initiate_response = initiated[0]
        initiate_status = int(initiated[1] or 500)
    initiate_data = initiate_response.get_json(silent=True) if hasattr(initiate_response, "get_json") else None
    initiate_data = initiate_data if isinstance(initiate_data, dict) else {}
    if initiate_status >= 400 or not initiate_data.get("success"):
        response_payload.update(
            {
                "paymentInitiated": False,
                "initiateError": initiate_data,
            }
        )
        return jsonify(response_payload), initiate_status

    payment = payment_intent_payload_from_response(initiate_data)
    response_payload.update(
        {
            "paymentInitiated": True,
            "payment": payment,
            "transaction": initiate_data.get("transaction"),
            "clientTxnId": payment.get("clientTxnId"),
            "paymentTarget": payment.get("paymentTarget"),
            "paymentUrl": payment.get("paymentUrl"),
            "hostedPaymentUrl": payment.get("hostedPaymentUrl"),
            "upiLink": payment.get("upiLink"),
            "qrPayload": payment.get("qrPayload"),
            "expiresInSeconds": payment.get("expiresInSeconds"),
            "selectedGateway": payment.get("selectedGateway"),
            "requiresUtr": payment.get("requiresUtr"),
            "utrLength": payment.get("utrLength"),
            "verificationMode": payment.get("verificationMode"),
        }
    )
    return jsonify(response_payload)


@api.post("/payment-links/<link_id>/initiate")
def initiate_payment_link(link_id: str):
    expire_stale_payments()
    link = PaymentLink.query.filter_by(link_id=link_id).first()
    if not link:
        return jsonify({"success": False, "message": "Payment link not found"}), 404
    if link.status == "paid":
        return jsonify({"success": False, "message": "Payment already completed"}), 409
    if link.status != "active":
        return jsonify({"success": False, "message": f"Payment link is {link.status}"}), 409

    body = payload()
    customer_mobile = str(
        body.get("customerMobile") or body.get("customer_mobile") or ""
    ).strip()
    customer_mobile = "".join(ch for ch in customer_mobile if ch.isdigit())[-10:]
    if len(customer_mobile) != 10:
        customer_mobile = "9999999999"

    client_txn_id = f"GP{int(datetime.now(timezone.utc).timestamp())}{secrets.token_hex(3).upper()}"
    try:
        route_context = selected_payin_route_context(link)
    except CredentialEncryptionError as error:
        return jsonify({"success": False, "message": str(error)}), 503
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    if route_context.get("type") == "bank_rail":
        rail = route_context["rail"]
        route = route_context["route"]
        try:
            upi_link = build_upi_pay_url(
                upi_id=rail.upi_id,
                payee_name=rail.payee_name,
                amount=link.amount,
                note=client_txn_id,
            )
        except ValueError as error:
            return jsonify({"success": False, "message": str(error)}), 400

        txn = Transaction(
            transaction_id=client_txn_id,
            payment_link_id=link.link_id,
            merchant_email=link.merchant_email,
            customer_name=link.customer_name,
            customer_email=link.customer_email,
            title=link.title,
            amount=link.amount,
            currency=link.currency,
            payment_method="UPI",
            gateway="Wpay UPI",
            gateway_transaction_id=client_txn_id,
            provider="bank_rail",
            mid_pool_id="",
            payment_target=upi_link,
            payment_url=upi_link,
            hosted_payment_url="",
            upi_link=upi_link,
            qr_payload=upi_link,
            expires_at=utcnow() + timedelta(seconds=900),
            status="pending",
            paid_at=None,
            route_type="bank_rail",
            bank_rail_id=rail.rail_id,
            utr_verification_status="not_submitted",
        )
        db.session.add(txn)
        db.session.commit()
        return jsonify(
            {
                "success": True,
                "message": "Payment initiated",
                "clientTxnId": client_txn_id,
                "paymentTarget": upi_link,
                "paymentUrl": upi_link,
                "hostedPaymentUrl": "",
                "upiLink": upi_link,
                "qrPayload": upi_link,
                "expiresInSeconds": 900,
                "selectedGateway": "bank_rail",
                "requiresUtr": True,
                "utrLength": 12,
                "verificationMode": "bank_scrape",
                "bankRailRouteId": str(route.id),
                "transaction": txn.to_dict(),
            }
        )

    gateway = route_context["gateway"]
    selected_pool = route_context["pool"]
    provider_credentials = route_context["credentials"]

    if gateway == "rupayex":
        order_id = f"RX{int(datetime.now(timezone.utc).timestamp())}{secrets.token_hex(3).upper()}"
        callback_url = str(
            os.getenv("RUPAYEX_CALLBACK_URL")
            or f"{request.host_url.rstrip('/')}/api/rupayex/callback"
        ).strip()
        try:
            provider_response = create_rupayex_order(
                order_id=order_id,
                amount=link.amount,
                redirect_url=callback_url,
                credentials=provider_credentials,
                customer_mobile=customer_mobile,
                remark1=link.link_id,
            )
        except (RupayExError, CredentialEncryptionError) as error:
            return jsonify({"success": False, "message": str(error)}), 502

        hosted_target = rupayex_payment_url(provider_response)
        upi_intent = extract_rupayex_upi_intent(hosted_target)
        target = upi_intent or hosted_target
        txn = Transaction(
            transaction_id=order_id,
            payment_link_id=link.link_id,
            merchant_email=link.merchant_email,
            customer_name=link.customer_name,
            customer_email=link.customer_email,
            title=link.title,
            amount=link.amount,
            currency=link.currency,
            payment_method="UPI",
            gateway="RupayEx Payin",
            gateway_transaction_id=order_id,
            provider="rupayex",
            mid_pool_id=str(selected_pool.id),
            payment_target=target,
            payment_url=target,
            hosted_payment_url=hosted_target,
            upi_link=upi_intent,
            qr_payload=target,
            expires_at=utcnow() + timedelta(seconds=900),
            status="pending",
            paid_at=None,
        )
        db.session.add(txn)
        db.session.commit()
        return jsonify(
            {
                "success": True,
                "message": "Payment initiated",
                "clientTxnId": order_id,
                "paymentTarget": target,
                "paymentUrl": target,
                "hostedPaymentUrl": hosted_target,
                "upiLink": upi_intent,
                "qrPayload": target,
                "expiresInSeconds": 900,
                "selectedGateway": "rupayex",
                "providerResponse": provider_response,
                "transaction": txn.to_dict(),
            }
        )

    if gateway == "alosheell":
        amount = float(link.amount or 0)
        min_amount = float(provider_credentials.get("payinMinAmount") or 300)
        max_amount = float(provider_credentials.get("payinMaxAmount") or 5000)
        if amount < min_amount or amount > max_amount:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"Alosheell pay-in amount must be between INR {min_amount:g} and INR {max_amount:g}",
                    }
                ),
                400,
            )
        client_reference_no = f"ALLO{int(datetime.now(timezone.utc).timestamp())}{secrets.token_hex(3).upper()}"[:28]
        try:
            provider_response = create_alosheell_order(
                client_reference_no=client_reference_no,
                amount=link.amount,
                customer_name=link.customer_name,
                customer_email=link.customer_email,
                customer_mobile=customer_mobile,
                credentials=provider_credentials,
            )
        except (AlosheellError, CredentialEncryptionError) as error:
            return jsonify({"success": False, "message": str(error)}), 502

        hosted_target = alosheell_payment_target(provider_response)
        provider_txn_id = (
            alosheell_transaction_reference(provider_response)
            or alosheell_client_reference(provider_response)
            or client_reference_no
        )
        is_upi_intent = hosted_target.lower().startswith("upi://")
        txn = Transaction(
            transaction_id=provider_txn_id,
            payment_link_id=link.link_id,
            merchant_email=link.merchant_email,
            customer_name=link.customer_name,
            customer_email=link.customer_email,
            title=link.title,
            amount=link.amount,
            currency=link.currency,
            payment_method="UPI",
            gateway="Alosheell",
            gateway_transaction_id=provider_txn_id,
            provider="alosheell",
            mid_pool_id=str(selected_pool.id),
            payment_target=hosted_target,
            payment_url=hosted_target,
            hosted_payment_url="" if is_upi_intent else hosted_target,
            upi_link=hosted_target if is_upi_intent else "",
            qr_payload=hosted_target,
            expires_at=utcnow() + timedelta(seconds=900),
            status="pending",
            paid_at=None,
        )
        db.session.add(txn)
        db.session.commit()
        return jsonify(
            {
                "success": True,
                "message": "Payment initiated",
                "clientTxnId": provider_txn_id,
                "clientReferenceNo": client_reference_no,
                "paymentTarget": hosted_target,
                "paymentUrl": hosted_target,
                "hostedPaymentUrl": "" if is_upi_intent else hosted_target,
                "upiLink": hosted_target if is_upi_intent else "",
                "qrPayload": hosted_target,
                "expiresInSeconds": 900,
                "selectedGateway": "alosheell",
                "providerResponse": provider_response,
                "transaction": txn.to_dict(),
            }
        )

    if gateway != "rockypayz":
        return (
            jsonify(
                {
                    "success": False,
                    "message": f"Gateway {gateway or 'unknown'} is not available for hosted pay-ins",
                }
            ),
            503,
        )

    amount = float(link.amount or 0)
    min_amount = float(provider_credentials.get("payinMinAmount") or 100)
    max_amount = float(provider_credentials.get("payinMaxAmount") or 100000)
    if amount < min_amount or amount > max_amount:
        return (
            jsonify(
                {
                    "success": False,
                    "message": f"RockyPayz pay-in amount must be between INR {min_amount:g} and INR {max_amount:g}",
                }
            ),
            400,
        )

    try:
        provider_response = create_rockypayz_order(
            client_txn_id=client_txn_id,
            amount=link.amount,
            customer_mobile=customer_mobile,
            credentials=provider_credentials,
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 502

    hosted_target = payment_target(provider_response)
    upi_intent = (
        extract_upi_intent(hosted_target)
        if hosted_target.lower().startswith("https://")
        else hosted_target
    )
    target = upi_intent or hosted_target
    is_upi_intent = target.lower().startswith("upi://")
    txn = Transaction(
        transaction_id=client_txn_id,
        payment_link_id=link.link_id,
        merchant_email=link.merchant_email,
        customer_name=link.customer_name,
        customer_email=link.customer_email,
        title=link.title,
        amount=link.amount,
        currency=link.currency,
        payment_method="UPI",
        gateway="RockyPayz",
        gateway_transaction_id=client_txn_id,
        provider="rockypayz",
        mid_pool_id=str(selected_pool.id),
        payment_target=target,
        payment_url=target,
        hosted_payment_url=hosted_target if hosted_target.lower().startswith("https://") else "",
        upi_link=target if is_upi_intent else "",
        qr_payload=target,
        expires_at=utcnow() + timedelta(seconds=300),
        status="pending",
        paid_at=None,
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Payment initiated",
            "clientTxnId": client_txn_id,
            "paymentTarget": target,
            "paymentUrl": target,
            "hostedPaymentUrl": hosted_target if hosted_target.lower().startswith("https://") else "",
            "upiLink": target if is_upi_intent else "",
            "qrPayload": target,
            "expiresInSeconds": 300,
            "selectedGateway": "rockypayz",
            "transaction": txn.to_dict(),
        }
    )


def payment_link_status_value(
    payment_link: PaymentLink | None,
    transaction: Transaction | None,
) -> str:
    transaction_status = str(transaction.status if transaction else "").lower()
    link_status = str(payment_link.status if payment_link else "").lower()
    if transaction_status in {"success", "paid", "completed"} or link_status == "paid":
        return "paid"
    if transaction_status in {"failed", "failure", "cancelled", "canceled", "declined"}:
        return "failed"
    if link_status in {"failed", "failure", "cancelled", "canceled", "declined", "expired"}:
        return link_status
    if transaction_status in {"pending", "processing", "initiated", "txn"}:
        return "pending_transaction"
    return link_status or "active"


def ignored_unknown_callback_response(provider_name: str, reference: str):
    return jsonify(
        {
            "success": True,
            "ignored": True,
            "message": f"{provider_name} failed callback ignored for unknown transaction",
            "reference": reference,
        }
    )


def payment_link_status_response(
    payment_link: PaymentLink | None,
    transaction: Transaction | None,
    *,
    provider_response: dict | None = None,
) -> dict:
    status = payment_link_status_value(payment_link, transaction)
    link_id = payment_link.link_id if payment_link else transaction.payment_link_id if transaction else ""
    amount = payment_link.amount if payment_link else transaction.amount if transaction else 0
    currency = payment_link.currency if payment_link else transaction.currency if transaction else "INR"
    paid_at = transaction.paid_at if transaction and transaction.paid_at else None
    response = {
        "success": True,
        "paid": status == "paid",
        "status": status,
        "paymentLink": {
            "linkId": link_id,
            "status": status,
            "amount": float(amount or 0),
            "currency": currency or "INR",
            "transactionId": transaction.transaction_id if transaction else "",
            "utr": transaction.utr if transaction else "",
            "paidAt": iso(paid_at),
            "expiresAt": iso(transaction.expires_at if transaction else None),
        },
        "transaction": transaction.to_dict() if transaction else None,
    }
    if provider_response is not None:
        response["providerResponse"] = provider_response
    return response


def reconcile_link_status_from_transaction(
    payment_link: PaymentLink | None,
    transaction: Transaction | None,
) -> None:
    if not payment_link or not transaction:
        return
    transaction_status = str(transaction.status or "").lower()
    changed = False
    if transaction_status in {"success", "paid", "completed"} and payment_link.status != "paid":
        payment_link.status = "paid"
        changed = True
    elif (
        transaction_status in {"failed", "failure", "cancelled", "canceled", "declined"}
        and payment_link.status not in {"paid", "failed"}
    ):
        payment_link.status = "failed"
        changed = True
    if changed:
        db.session.commit()


def bank_rail_status_value(transaction: Transaction | None) -> str:
    if not transaction:
        return "active"
    if transaction.status in {"success", "paid", "completed"}:
        return "paid"
    if transaction.status in {"failed", "failure", "cancelled", "canceled", "declined"}:
        return "failed"
    verification = str(transaction.utr_verification_status or "not_submitted").lower()
    if verification == "queued":
        return "verification_queued"
    if verification == "running":
        return "verification_running"
    if verification == "matched":
        return "paid"
    if verification in {"manual_review", "amount_mismatch", "duplicate"}:
        return "manual_review"
    if verification in {"not_found", "failed"}:
        return verification
    return "pending_transaction"


def bank_rail_status_response(
    payment_link: PaymentLink,
    transaction: Transaction | None,
) -> dict:
    response = payment_link_status_response(payment_link, transaction)
    status = bank_rail_status_value(transaction)
    response["status"] = status
    response["paid"] = status == "paid"
    response["requiresUtr"] = True
    response["utrLength"] = 12
    response["verificationMode"] = "bank_scrape"
    if response.get("paymentLink"):
        response["paymentLink"]["status"] = status
        response["paymentLink"]["utrVerificationStatus"] = (
            transaction.utr_verification_status if transaction else "not_submitted"
        )
    return response


def queue_bank_verification_job(transaction: Transaction) -> BankVerificationJob:
    job = BankVerificationJob.query.filter_by(
        transaction_id=transaction.transaction_id
    ).first()
    if not job:
        job = BankVerificationJob(
            job_id=f"bvj_{secrets.token_hex(8)}",
            transaction_id=transaction.transaction_id,
            payment_link_id=transaction.payment_link_id,
            merchant_email=transaction.merchant_email,
            bank_rail_id=transaction.bank_rail_id,
        )
        db.session.add(job)
    job.utr = transaction.utr
    job.expected_amount = transaction.amount
    job.status = "queued"
    job.next_run_at = utcnow()
    job.last_error = ""
    return job


def apply_bank_verification_match(
    job: BankVerificationJob,
    *,
    bank_reference_id: str = "",
    note: str = "",
) -> tuple[Transaction, PaymentLink | None, dict]:
    transaction = find_payin_transaction(job.transaction_id, provider="bank_rail")
    if not transaction:
        raise ValueError("Transaction not found")
    payment_link = PaymentLink.query.filter_by(link_id=transaction.payment_link_id).first()
    if not payment_link:
        raise ValueError("Payment link not found")
    if round(float(transaction.amount or 0), 2) != round(float(job.expected_amount or 0), 2):
        transaction.utr_verification_status = "amount_mismatch"
        job.status = "manual_review"
        job.last_error = "Expected amount does not match transaction amount"
        raise ValueError("Expected amount does not match transaction amount")

    now = utcnow()
    transaction.status = "success"
    transaction.paid_at = transaction.paid_at or now
    transaction.utr = job.utr
    transaction.utr_verification_status = "matched"
    transaction.utr_verified_at = now
    transaction.bank_reference_id = bank_reference_id[:160]
    transaction.bank_posted_at = job.matched_posted_at or now
    transaction.verification_attempts = max(
        int(transaction.verification_attempts or 0),
        int(job.attempt_count or 0),
    )
    transaction.verification_notes = note[:2000]
    payment_link.status = "paid"
    job.status = "matched"
    job.matched_amount = transaction.amount
    job.matched_utr = job.utr
    job.matched_posted_at = job.matched_posted_at or now
    job.set_raw_match(
        {
            **job.raw_match(),
            "manual": True,
            "bankReferenceId": bank_reference_id,
            "matchedAt": iso(now),
            "note": note,
        }
    )

    route = BankRailRoute.query.filter_by(
        merchant_email=transaction.merchant_email,
        rail_id=transaction.bank_rail_id,
    ).first()
    if route:
        route.used_volume = money(float(route.used_volume or 0) + float(transaction.amount or 0))
    rail = InternalBankRail.query.filter_by(rail_id=transaction.bank_rail_id).first()
    if rail:
        rail.used_volume_daily = money(float(rail.used_volume_daily or 0) + float(transaction.amount or 0))
        rail.used_volume_monthly = money(float(rail.used_volume_monthly or 0) + float(transaction.amount or 0))

    delivery = {}
    if transaction.merchant_callback_status != "delivered":
        delivery = send_merchant_payment_callback(payment_link, transaction, "payment.success")
        transaction.merchant_callback_status = (
            "delivered" if delivery.get("delivered") else "failed"
        )
        transaction.merchant_callback_response = str(
            delivery.get("response") or delivery.get("error") or ""
        )[:2000]
        transaction.merchant_callback_sent_at = now
    return transaction, payment_link, delivery


@api.get("/admin/bank-verification-jobs")
@require_roles("admin", "ops")
def list_bank_verification_jobs():
    status = str(request.args.get("status") or "").strip().lower()
    query = BankVerificationJob.query
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(BankVerificationJob.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "jobs": [row.to_dict() for row in rows],
        }
    )


def process_bank_verification_job(job: BankVerificationJob) -> dict:
    transaction = find_payin_transaction(job.transaction_id, provider="bank_rail")
    if not transaction:
        job.status = "failed"
        job.last_error = "Transaction not found"
        return {"jobId": job.job_id, "status": job.status, "message": job.last_error}
    if transaction.status in {"success", "paid", "completed"}:
        job.status = "matched"
        return {"jobId": job.job_id, "status": job.status, "message": "Already paid"}
    rail = InternalBankRail.query.filter_by(rail_id=job.bank_rail_id).first()
    template = rail.credential_template if rail else None
    scraper_type = template.scraper_type if template else "manual"
    job.attempt_count = int(job.attempt_count or 0) + 1
    transaction.verification_attempts = int(transaction.verification_attempts or 0) + 1
    if scraper_type == "manual":
        job.status = "manual_review"
        job.last_error = "Manual bank verification required"
        transaction.utr_verification_status = "manual_review"
        transaction.verification_notes = job.last_error
        return {"jobId": job.job_id, "status": job.status, "message": job.last_error}

    job.status = "manual_review"
    job.last_error = f"No automated scraper adapter configured for {scraper_type}"
    transaction.utr_verification_status = "manual_review"
    transaction.verification_notes = job.last_error
    return {"jobId": job.job_id, "status": job.status, "message": job.last_error}


@api.post("/internal/bank-verification/run")
def run_bank_verification_jobs():
    configured_secret = str(current_app.config.get("BANK_VERIFICATION_INTERNAL_SECRET") or "")
    provided_secret = str(request.headers.get("X-Internal-Secret") or "")
    if not configured_secret or not secrets.compare_digest(configured_secret, provided_secret):
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    limit = min(50, max(1, int((payload().get("limit") if request.is_json else request.args.get("limit")) or 10)))
    now = utcnow()
    jobs = (
        BankVerificationJob.query.filter(
            BankVerificationJob.status.in_(("queued", "retrying")),
            or_(
                BankVerificationJob.next_run_at.is_(None),
                BankVerificationJob.next_run_at <= now,
            ),
        )
        .order_by(BankVerificationJob.created_at.asc())
        .limit(limit)
        .all()
    )
    results = [process_bank_verification_job(job) for job in jobs]
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "processed": len(results),
            "results": results,
        }
    )


@api.post("/admin/bank-verification-jobs/<job_id>/mark-matched")
@require_roles("admin", "ops")
def mark_bank_verification_job_matched(job_id: str):
    body = payload()
    job = BankVerificationJob.query.filter_by(job_id=job_id).first()
    if not job and job_id.isdigit():
        job = db.session.get(BankVerificationJob, int(job_id))
    if not job:
        return jsonify({"success": False, "message": "Verification job not found"}), 404
    bank_reference_id = str(body.get("bankReferenceId") or body.get("bank_reference_id") or "").strip()
    note = str(body.get("note") or body.get("adminNote") or "Manual UTR verification").strip()
    try:
        transaction, payment_link, delivery = apply_bank_verification_match(
            job,
            bank_reference_id=bank_reference_id,
            note=note,
        )
    except ValueError as error:
        db.session.commit()
        return jsonify({"success": False, "message": str(error), "job": job.to_dict()}), 400

    add_audit_log(
        "BANK_VERIFICATION_MATCHED",
        merchant_email=transaction.merchant_email,
        target_type="bank_verification_job",
        target_id=job.job_id,
        message=f"UTR {job.utr} manually matched",
        metadata={"transactionId": transaction.transaction_id, "linkId": payment_link.link_id},
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Payment marked verified",
            "job": job.to_dict(),
            "transaction": transaction.to_dict(),
            "delivery": delivery,
        }
    )


@api.post("/admin/bank-verification-jobs/<job_id>/mark-review")
@require_roles("admin", "ops")
def mark_bank_verification_job_review(job_id: str):
    body = payload()
    job = BankVerificationJob.query.filter_by(job_id=job_id).first()
    if not job and job_id.isdigit():
        job = db.session.get(BankVerificationJob, int(job_id))
    if not job:
        return jsonify({"success": False, "message": "Verification job not found"}), 404
    transaction = find_payin_transaction(job.transaction_id, provider="bank_rail")
    note = str(body.get("note") or body.get("adminNote") or "Manual review required").strip()
    job.status = "manual_review"
    job.last_error = note[:2000]
    if transaction:
        transaction.utr_verification_status = "manual_review"
        transaction.verification_notes = note[:2000]
    add_audit_log(
        "BANK_VERIFICATION_REVIEW",
        merchant_email=job.merchant_email,
        target_type="bank_verification_job",
        target_id=job.job_id,
        message=note,
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Verification job moved to manual review",
            "job": job.to_dict(),
            "transaction": transaction.to_dict() if transaction else None,
        }
    )


@api.post("/payment-links/<link_id>/utr")
def submit_payment_link_utr(link_id: str):
    expire_stale_payments()
    body = payload()
    utr = str(body.get("utr") or "").strip()
    reference = str(
        body.get("clientTxnId")
        or body.get("client_txn_id")
        or body.get("transactionId")
        or ""
    ).strip()
    if not UTR_RE.match(utr):
        return jsonify({"success": False, "message": "UTR must be exactly 12 digits"}), 400
    payment_link = PaymentLink.query.filter_by(link_id=link_id).first()
    if not payment_link:
        return jsonify({"success": False, "message": "Payment link not found"}), 404
    query = Transaction.query.filter_by(payment_link_id=link_id)
    if reference:
        query = query.filter(
            or_(
                Transaction.transaction_id == reference,
                Transaction.gateway_transaction_id == reference,
            )
        )
    transaction = query.order_by(Transaction.created_at.desc()).first()
    if not transaction:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    if transaction.route_type != "bank_rail" and transaction.provider != "bank_rail":
        return jsonify({"success": False, "message": "UTR submission is only available for bank rail payments"}), 400
    if transaction.status in {"success", "paid", "completed"}:
        return jsonify({"success": False, "message": "Payment is already completed"}), 409
    if transaction.status in {"failed", "failure", "cancelled", "canceled", "declined"}:
        return jsonify({"success": False, "message": "Payment is no longer active"}), 409
    duplicate = Transaction.query.filter(
        Transaction.utr == utr,
        Transaction.id != transaction.id,
        or_(
            Transaction.status.in_(("success", "paid", "completed")),
            Transaction.utr_verification_status.in_(("matched", "queued", "running")),
        ),
    ).first()
    if duplicate:
        transaction.utr_verification_status = "duplicate"
        transaction.verification_notes = "Submitted UTR is already linked to another transaction"
        db.session.commit()
        return jsonify({"success": False, "message": "This UTR is already used"}), 409

    transaction.utr = utr
    transaction.utr_submitted_at = utcnow()
    transaction.utr_verification_status = "queued"
    transaction.verification_notes = ""
    queue_bank_verification_job(transaction)
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "UTR submitted for verification",
            "status": "verification_queued",
            "transaction": transaction.to_dict(),
        }
    )


@api.get("/payment-links/<link_id>/status")
@api.post("/payment-links/<link_id>/status")
def payment_link_status(link_id: str):
    expire_stale_payments()
    body = payload() if request.method == "POST" else {}
    reference = str(
        request.args.get("clientTxnId")
        or request.args.get("transactionId")
        or body.get("clientTxnId")
        or body.get("client_txn_id")
        or body.get("transactionId")
        or ""
    ).strip()
    payment_link = PaymentLink.query.filter_by(link_id=link_id).first()
    if not payment_link:
        return jsonify({"success": False, "message": "Payment link not found"}), 404

    query = Transaction.query.filter_by(payment_link_id=link_id)
    if reference:
        query = query.filter(
            or_(
                Transaction.transaction_id == reference,
                Transaction.gateway_transaction_id == reference,
            )
        )
    transaction = query.order_by(Transaction.created_at.desc()).first()
    if not transaction:
        return jsonify(payment_link_status_response(payment_link, None))

    if transaction.route_type == "bank_rail" or transaction.provider == "bank_rail":
        reconcile_link_status_from_transaction(payment_link, transaction)
        return jsonify(bank_rail_status_response(payment_link, transaction))

    reconcile_link_status_from_transaction(payment_link, transaction)
    provider = str(transaction.provider or transaction.gateway or "").lower()

    if transaction.status in {"success", "paid", "completed"}:
        return jsonify(payment_link_status_response(payment_link, transaction))

    if "alosheell" in provider:
        return jsonify(payment_link_status_response(payment_link, transaction))

    if "rupayex" in provider:
        try:
            provider_response = check_rupayex_order_status(
                transaction.gateway_transaction_id or transaction.transaction_id,
                credentials=credentials_for_transaction(transaction),
            )
        except (RupayExError, CredentialEncryptionError) as error:
            return jsonify({"success": False, "message": str(error)}), 502

        provider_reference = rupayex_order_reference(provider_response) or transaction.transaction_id
        transaction, payment_link = apply_rupayex_result(provider_reference, provider_response)
        return jsonify(
            payment_link_status_response(
                payment_link, transaction, provider_response=provider_response
            )
        )

    try:
        provider_response = check_rockypayz_order_status(
            transaction.gateway_transaction_id or transaction.transaction_id,
            credentials=credentials_for_transaction(transaction),
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 502

    provider_reference = rockypayz_transaction_reference(provider_response) or transaction.transaction_id
    transaction, payment_link = apply_rockypayz_result(provider_reference, provider_response)
    return jsonify(
        payment_link_status_response(
            payment_link, transaction, provider_response=provider_response
        )
    )


@api.post("/merchant/webhooks/test")
@require_roles("admin", "merchant")
def test_merchant_webhook():
    user = current_user() or {}
    body = payload()
    link_id = str(body.get("linkId") or "").strip()
    link = PaymentLink.query.filter_by(link_id=link_id).first() if link_id else None
    merchant = current_merchant_row()
    if link:
        if (
            user.get("role") == "merchant"
            and str(user.get("merchantEmail") or "").lower() != link.merchant_email.lower()
        ):
            return jsonify({"success": False, "message": "Access denied"}), 403
    else:
        if not merchant:
            return jsonify({"success": False, "message": "Merchant not found"}), 404
        merchant.webhook_settings()
        link = PaymentLink(
            link_id=f"test_{secrets.token_hex(6)}",
            merchant_email=merchant.email,
            title=str(body.get("title") or "Wpay webhook test").strip(),
            amount=money(body.get("amount") or 100),
            currency=str(body.get("currency") or "INR").strip().upper(),
            customer_name=str(body.get("customerName") or "Webhook Tester").strip(),
            customer_email=str(body.get("customerEmail") or "").strip().lower(),
            notify_url=merchant.webhook_payin_url,
            callback_secret=merchant.webhook_secret,
        )
    if not link.notify_url:
        return jsonify({"success": False, "message": "No merchant callback URL configured"}), 400

    transaction = Transaction(
        transaction_id=f"webhook_test_{secrets.token_hex(6)}",
        payment_link_id=link.link_id,
        merchant_email=link.merchant_email,
        customer_name=link.customer_name,
        customer_email=link.customer_email,
        title=link.title,
        amount=link.amount,
        currency=link.currency,
        payment_method="Webhook test",
        gateway="Wpay",
        provider="Wpay",
        status="pending",
        paid_at=None,
    )
    db.session.add(transaction)
    db.session.commit()

    simulate = bool(body.get("simulate") or body.get("productionParams"))
    event = "payment.success" if simulate else "payment.test"
    result = send_merchant_payment_callback(link, transaction, event)
    transaction.merchant_callback_status = (
        "delivered" if result.get("delivered") else "failed"
    )
    transaction.merchant_callback_response = str(
        result.get("response") or result.get("error") or ""
    )[:2000]
    transaction.merchant_callback_sent_at = utcnow()
    db.session.commit()
    return jsonify(
        {
            "success": bool(result.get("delivered")),
            "message": (
                "Wpay test webhook delivered"
                if result.get("delivered")
                else "Wpay test webhook failed"
            ),
            "delivery": result,
            "transaction": transaction.to_dict(),
        }
    ), (200 if result.get("delivered") else 502)


@api.post("/merchant/webhooks/resend")
@require_roles("admin", "merchant")
def resend_merchant_webhook():
    user = current_user() or {}
    body = payload()
    transaction_id = str(body.get("transactionId") or "").strip()
    if not transaction_id:
        return jsonify({"success": False, "message": "transactionId is required"}), 400
    transaction = Transaction.query.filter_by(transaction_id=transaction_id).first()
    if not transaction:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    if (
        user.get("role") == "merchant"
        and str(user.get("merchantEmail") or "").lower() != transaction.merchant_email.lower()
    ):
        return jsonify({"success": False, "message": "Access denied"}), 403
    link = PaymentLink.query.filter_by(link_id=transaction.payment_link_id).first()
    if not link:
        return jsonify({"success": False, "message": "Payment link not found"}), 404
    if not link.notify_url:
        return jsonify({"success": False, "message": "No callback URL configured for this order"}), 400
    event = "payment.success" if transaction.status == "success" else "payment." + transaction.status
    result = send_merchant_payment_callback(link, transaction, event)
    transaction.merchant_callback_status = "delivered" if result.get("delivered") else "failed"
    transaction.merchant_callback_response = str(result.get("response") or result.get("error") or "")[:2000]
    transaction.merchant_callback_sent_at = utcnow()
    db.session.commit()
    return jsonify({
        "success": bool(result.get("delivered")),
        "message": "Callback delivered" if result.get("delivered") else "Callback failed",
        "delivery": result,
    }), (200 if result.get("delivered") else 502)


@api.post("/test/merchant-callback")
def merchant_callback_test_receiver():
    raw_body = request.get_data(cache=True)
    body = request.get_json(silent=True) or {}
    link_id = str(body.get("linkId") or "").strip()
    link = PaymentLink.query.filter_by(link_id=link_id).first()
    if not link or not link.callback_secret:
        return jsonify({"success": False, "message": "Unknown test callback"}), 404

    received_signature = str(request.headers.get("X-Wpay-Signature") or "")
    expected_signature = callback_signature(link.callback_secret, raw_body)
    if not secrets.compare_digest(received_signature, expected_signature):
        return jsonify({"success": False, "message": "Invalid Wpay signature"}), 401

    return jsonify(
        {
            "success": True,
            "message": "Merchant callback received",
            "brand": "Wpay",
            "event": body.get("event"),
            "linkId": link_id,
        }
    )


@api.get("/rupayex/callback")
def rupayex_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "RupayEx callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/rupayex/callback",
        }
    )


@api.get("/alosheell/callback")
def alosheell_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "Alosheell callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/alosheell/callback",
        }
    )


@api.post("/alosheell/callback")
def alosheell_callback():
    body = callback_payload()
    reference = (
        alosheell_transaction_reference(body)
        or alosheell_client_reference(body)
    )
    if not reference:
        return jsonify({"success": False, "message": "Missing Alosheell transaction reference"}), 400

    transaction, payment_link = apply_alosheell_result(reference, body)
    if not transaction:
        if is_alosheell_failed(body):
            return ignored_unknown_callback_response("Alosheell", reference)
        return jsonify({"success": False, "message": "Alosheell transaction not found"}), 404

    return jsonify(
        {
            "success": True,
            "message": "Alosheell callback processed",
            "paid": transaction.status == "success",
            "status": transaction.status,
            "providerStatus": alosheell_transaction_status(body),
            "transaction": transaction.to_dict(),
            "paymentLink": payment_link.to_dict() if payment_link else None,
        }
    )


@api.post("/rupayex/callback")
def rupayex_callback():
    body = callback_payload()
    reference = rupayex_order_reference(body)
    if not reference:
        return jsonify({"success": False, "message": "Missing RupayEx order reference"}), 400

    transaction, payment_link = apply_rupayex_result(reference, body)
    if not transaction:
        if is_rupayex_failed(body):
            return ignored_unknown_callback_response("RupayEx", reference)
        return jsonify({"success": False, "message": "RupayEx transaction not found"}), 404

    return jsonify(
        {
            "success": True,
            "message": "RupayEx callback processed",
            "paid": transaction.status == "success",
            "status": transaction.status,
            "transaction": transaction.to_dict(),
            "paymentLink": payment_link.to_dict() if payment_link else None,
        }
    )


@api.get("/rockypayz/callback")
def rockypayz_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "RockyPayz callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/rockypayz/callback",
        }
    )


@api.post("/rockypayz/callback")
def rockypayz_callback():
    body = callback_payload()
    reference = rockypayz_transaction_reference(body)
    if not reference:
        return jsonify({"success": False, "message": "Missing RockyPayz transaction reference"}), 400

    transaction, payment_link = apply_rockypayz_result(reference, body)
    if not transaction:
        if is_rockypayz_failed(body):
            return ignored_unknown_callback_response("RockyPayz", reference)
        return jsonify({"success": False, "message": "RockyPayz transaction not found"}), 404

    return jsonify(
        {
            "success": True,
            "message": "RockyPayz callback processed",
            "paid": transaction.status == "success",
            "status": transaction.status,
            "transaction": transaction.to_dict(),
            "paymentLink": payment_link.to_dict() if payment_link else None,
        }
    )


@api.post("/rockypayz/status")
def rockypayz_status():
    body = payload()
    reference = str(
        body.get("clientTxnId")
        or body.get("client_txn_id")
        or body.get("transactionId")
        or ""
    ).strip()
    if not reference:
        return jsonify({"success": False, "message": "Missing client transaction ID"}), 400

    transaction = find_rockypayz_transaction(reference)
    if not transaction:
        return jsonify({"success": False, "message": "Transaction not found"}), 404

    if transaction.status == "success":
        payment_link = PaymentLink.query.filter_by(
            link_id=transaction.payment_link_id
        ).first()
        return jsonify(
            {
                "success": True,
                "paid": True,
                "status": "success",
                "transaction": transaction.to_dict(),
                "paymentLink": payment_link.to_dict() if payment_link else None,
            }
        )

    try:
        provider_response = check_rockypayz_order_status(
            reference,
            credentials=credentials_for_transaction(transaction),
        )
    except (RockyPayzError, CredentialEncryptionError) as error:
        return jsonify({"success": False, "message": str(error)}), 502

    provider_reference = rockypayz_transaction_reference(provider_response) or reference
    transaction, payment_link = apply_rockypayz_result(
        provider_reference, provider_response
    )
    status = transaction.status if transaction else rockypayz_transaction_status(provider_response) or "pending"
    return jsonify(
        {
            "success": True,
            "paid": bool(transaction and transaction.status == "success"),
            "status": status,
            "providerResponse": provider_response,
            "transaction": transaction.to_dict() if transaction else None,
            "paymentLink": payment_link.to_dict() if payment_link else None,
        }
    )


@api.get("/rockypayz/payout-callback")
def rockypayz_payout_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "RockyPayz payout callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/rockypayz/payout-callback",
        }
    )


@api.post("/rockypayz/payout-callback")
def rockypayz_payout_callback():
    body = callback_payload()
    reference = rockypayz_payout_reference(body)
    if not reference:
        return jsonify({"success": False, "message": "Missing RockyPayz payout reference"}), 400

    payout = find_payout(reference)
    if not payout:
        return jsonify({"success": False, "message": "RockyPayz payout not found"}), 404

    update_payout_from_provider(payout, body)
    return jsonify(
        {
            "success": True,
            "message": "RockyPayz payout callback processed",
            "paid": payout.status == "paid",
            "status": payout.status,
            "payout": payout.to_dict(),
        }
    )


@api.get("/rupayex/payout-callback")
def rupayex_payout_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "RupayEx payout callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/rupayex/payout-callback",
        }
    )


@api.post("/rupayex/payout-callback")
def rupayex_payout_callback():
    body = callback_payload()
    reference = rupayex_payout_reference(body)
    if not reference:
        return jsonify({"success": False, "message": "Missing RupayEx payout reference"}), 400

    payout = find_payout(reference)
    if not payout:
        return jsonify({"success": False, "message": "RupayEx payout not found"}), 404

    update_rupayex_payout_from_provider(payout, body)
    return jsonify(
        {
            "success": True,
            "message": "RupayEx payout callback processed",
            "paid": payout.status == "paid",
            "status": payout.status,
            "payout": payout.to_dict(),
        }
    )


@api.get("/alosheell/payout-callback")
def alosheell_payout_callback_health():
    return jsonify(
        {
            "success": True,
            "message": "Alosheell payout callback endpoint is live",
            "callbackUrl": "https://www.sinzouae.com/api/alosheell/payout-callback",
        }
    )


@api.post("/alosheell/payout-callback")
def alosheell_payout_callback():
    body = callback_payload()
    reference = (
        alosheell_payout_reference(body)
        or alosheell_payout_provider_reference(body)
    )
    if not reference:
        return jsonify({"success": False, "message": "Missing Alosheell payout reference"}), 400

    payout = find_payout(reference)
    if not payout:
        return jsonify({"success": False, "message": "Alosheell payout not found"}), 404

    update_alosheell_payout_from_provider(payout, body)
    return jsonify(
        {
            "success": True,
            "message": "Alosheell payout callback processed",
            "paid": payout.status == "paid",
            "status": payout.status,
            "payout": payout.to_dict(),
        }
    )


def current_user_row() -> User | None:
    auth_user = current_user() or {}
    user_id = str(auth_user.get("id") or "")
    if user_id.isdigit():
        row = db.session.get(User, int(user_id))
        if row:
            return row
    email = str(auth_user.get("email") or "").strip().lower()
    return User.query.filter_by(email=email).first() if email else None


@api.post("/merchant/2fa/setup")
@require_roles("merchant")
def setup_merchant_two_factor():
    user = current_user_row()
    if not user:
        return jsonify({"success": False, "message": "Merchant user not found"}), 404
    secret = pyotp.random_base32()
    user.two_factor_secret = secret
    user.two_factor_enabled = False
    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name="Wpay",
    )
    image = qrcode.make(provisioning_uri)
    output = BytesIO()
    image.save(output, format="PNG")
    qr_code_data_url = (
        "data:image/png;base64,"
        + base64.b64encode(output.getvalue()).decode("ascii")
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "secret": secret,
            "qrCodeDataUrl": qr_code_data_url,
        }
    )


@api.post("/merchant/2fa/verify")
@require_roles("merchant")
def verify_merchant_two_factor():
    user = current_user_row()
    code = str(payload().get("code") or "").strip()
    if (
        not user
        or not user.two_factor_secret
        or not pyotp.TOTP(user.two_factor_secret).verify(code, valid_window=1)
    ):
        return jsonify({"success": False, "message": "Invalid authenticator code"}), 400
    user.two_factor_enabled = True
    db.session.commit()
    return jsonify({"success": True, "message": "Two-factor authentication enabled"})


@api.post("/merchant/2fa/disable")
@require_roles("merchant")
def disable_merchant_two_factor():
    user = current_user_row()
    if not user:
        return jsonify({"success": False, "message": "Merchant user not found"}), 404
    user.two_factor_enabled = False
    user.two_factor_secret = ""
    db.session.commit()
    return jsonify({"success": True, "message": "Two-factor authentication disabled"})


@api.post("/admin/merchants/reset-2fa")
@require_roles("admin")
def reset_merchant_two_factor():
    merchant_email = str(payload().get("merchantEmail") or "").strip().lower()
    user = User.query.filter_by(email=merchant_email, role="merchant").first()
    if not user:
        return jsonify({"success": False, "message": "Merchant user not found"}), 404
    user.two_factor_enabled = False
    user.two_factor_secret = ""
    add_audit_log(
        "MERCHANT_2FA_RESET",
        merchant_email=merchant_email,
        target_type="user",
        target_id=str(user.id),
        message="Admin reset merchant two-factor authentication",
    )
    db.session.commit()
    return jsonify({"success": True, "message": "Merchant 2FA reset successfully"})


@api.get("/merchant/metrics")
@require_roles("merchant", "admin")
def merchant_metrics():
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or request.args.get("merchantEmail") or "").lower()
    if merchant_email:
        expire_stale_payments(merchant_email=merchant_email)
    rows = Transaction.query.filter_by(merchant_email=merchant_email).all() if merchant_email else []
    links = PaymentLink.query.filter_by(merchant_email=merchant_email).all() if merchant_email else []
    success = [t for t in rows if t.status in {"success", "paid", "completed"}]
    failed_statuses = {"failed", "failure", "cancelled", "canceled", "expired", "declined"}
    failed_transactions = [t for t in rows if t.status in failed_statuses]
    failed_transaction_link_ids = {t.payment_link_id for t in failed_transactions if t.payment_link_id}
    failed_links_without_transaction = [
        link
        for link in links
        if link.status in failed_statuses and link.link_id not in failed_transaction_link_ids
    ]
    failed_count = len(failed_transactions) + len(failed_links_without_transaction)
    failed_volume = money(
        sum(float(t.amount or 0) for t in failed_transactions)
        + sum(float(link.amount or 0) for link in failed_links_without_transaction)
    )
    total_count = len(rows) + len(failed_links_without_transaction)
    success_rate = round((len(success) / total_count) * 100) if total_count else 0
    return jsonify(
        {
            "success": True,
            "metrics": {
                "totalTransactions": total_count,
                "successCount": len(success),
                "successfulTransactions": len(success),
                "failedCount": failed_count,
                "failedVolume": failed_volume,
                "successRate": success_rate,
                "totalVolume": money(sum(float(t.amount or 0) for t in success)),
                "currency": "INR",
            },
        }
    )


@api.get("/merchant/balance")
@require_roles("merchant", "admin")
def merchant_balance():
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or request.args.get("merchantEmail") or "").lower()
    rows = Transaction.query.filter_by(merchant_email=merchant_email).all() if merchant_email else []
    successful_volume = money(sum(float(t.amount or 0) for t in rows if t.status in {"success", "paid"}))
    summary = payout_summary_for_merchant(merchant_email) if merchant_email else {}
    paid_payout = float(summary.get("paidAmount") or 0)
    pending_payout = float(summary.get("pendingAmount") or 0)
    balance = money(successful_volume - paid_payout - pending_payout)
    return jsonify(
        {
            "success": True,
            "balance": {
                "available": max(balance, 0),
                "pending": pending_payout,
                "successfulVolume": successful_volume,
                "paidPayoutVolume": paid_payout,
                "currency": "INR",
            },
        }
    )


@api.get("/merchant/analytics/hourly")
@require_roles("merchant", "admin")
def merchant_hourly():
    user = current_user() or {}
    merchant_email = str(
        user.get("merchantEmail")
        or request.args.get("merchantEmail")
        or ""
    ).strip().lower()
    data = hourly_transaction_data(merchant_email)
    return jsonify({"success": True, "data": data, "analytics": data})


@api.get("/merchant/api-credentials")
@require_roles("merchant", "admin")
def merchant_api_credentials():
    user = current_user() or {}
    email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    merchant = Merchant.query.filter_by(email=email).first()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant credentials not available"}), 404

    merchant.ensure_credentials()
    db.session.commit()
    data = merchant.to_dict()
    data["payinApiKey"] = merchant.api_key
    data["payoutApiKey"] = merchant.api_key
    data["payinMerchantKey"] = merchant.merchant_key
    data["payoutMerchantKey"] = merchant.merchant_key
    data["credentialOwner"] = "Wpay"
    data["credentialScope"] = "payin,payout"
    routes = (
        PipeRoute.query.filter_by(merchant_email=email, status="active")
        .order_by(PipeRoute.created_at.asc())
        .all()
    )
    data["assignedMids"] = [
        {
            "allocationId": str(route.id),
            "label": f"MID {index + 1}",
            "status": route.status,
        }
        for index, route in enumerate(routes)
    ]
    return jsonify({"success": True, "credentials": data, "merchant": data})


@api.get("/merchant/profile")
@require_roles("merchant", "admin")
def get_merchant_profile():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    return jsonify({"success": True, "merchant": merchant.to_dict(), "profile": merchant.to_dict()})


@api.patch("/merchant/profile")
@api.post("/merchant/profile")
@require_roles("merchant", "admin")
def update_merchant_profile():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    body = payload()

    if "businessName" in body:
        business_name = str(body.get("businessName") or "").strip()
        if not business_name:
            return jsonify({"success": False, "message": "Business name is required"}), 400
        merchant.business_name = business_name[:200]
    if "ownerName" in body:
        owner_name = str(body.get("ownerName") or "").strip()
        if not owner_name:
            return jsonify({"success": False, "message": "Owner name is required"}), 400
        merchant.owner_name = owner_name[:160]
    if "phone" in body:
        phone = str(body.get("phone") or "").strip()
        if phone and (not phone.isdigit() or len(phone) < 8 or len(phone) > 15):
            return jsonify({"success": False, "message": "Enter a valid phone number"}), 400
        merchant.phone = phone[:40]
    if "businessType" in body:
        merchant.business_type = str(body.get("businessType") or "Online Business").strip()[:120]

    user = User.query.filter_by(email=merchant.email).first()
    if user:
        user.name = merchant.owner_name

    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Merchant profile saved",
            "merchant": merchant.to_dict(),
            "profile": merchant.to_dict(),
        }
    )


@api.get("/merchant/bank-accounts")
@require_roles("merchant", "admin")
def list_merchant_bank_accounts():
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    rows = MerchantBankAccount.query.filter_by(merchant_email=merchant_email).order_by(
        MerchantBankAccount.is_primary.desc(),
        MerchantBankAccount.created_at.desc(),
    ).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "accounts": [row.to_dict() for row in rows],
            "primaryAccount": next((row.to_dict() for row in rows if row.is_primary), None),
        }
    )


@api.post("/merchant/bank-accounts")
@require_roles("merchant", "admin")
def create_merchant_bank_account():
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    body = payload()
    account_type = str(body.get("accountType") or "bank").strip().lower()
    if account_type not in {"bank", "upi"}:
        return jsonify({"success": False, "message": "Account type must be bank or upi"}), 400

    beneficiary_name = str(body.get("beneficiaryName") or "").strip()
    beneficiary_mobile = str(body.get("beneficiaryMobile") or body.get("mobile") or "").strip()
    account_number = str(body.get("accountNumber") or "").strip()
    ifsc = str(body.get("ifsc") or "").strip().upper()
    upi_id = str(body.get("upiId") or body.get("upiID") or "").strip()

    if not beneficiary_name:
        return jsonify({"success": False, "message": "Beneficiary name is required"}), 400
    if beneficiary_mobile and (not beneficiary_mobile.isdigit() or len(beneficiary_mobile) != 10):
        return jsonify({"success": False, "message": "Beneficiary mobile must be 10 digits"}), 400
    if account_type == "bank" and (not account_number or not ifsc):
        return jsonify({"success": False, "message": "Account number and IFSC are required"}), 400
    if account_type == "upi" and "@" not in upi_id:
        return jsonify({"success": False, "message": "Valid UPI ID is required"}), 400

    existing_count = MerchantBankAccount.query.filter_by(merchant_email=merchant_email).count()
    account = MerchantBankAccount(
        account_id=f"mba_{secrets.token_hex(8)}",
        merchant_email=merchant_email,
        label=str(body.get("label") or ("Primary payout account" if existing_count == 0 else "Payout account")).strip()[:120],
        account_type=account_type,
        beneficiary_name=beneficiary_name[:180],
        account_number=account_number[:80],
        ifsc=ifsc[:20],
        bank_name=str(body.get("bankName") or "").strip()[:160],
        upi_id=upi_id[:160],
        beneficiary_mobile=beneficiary_mobile[:40],
        status="active",
        is_primary=existing_count == 0 or body.get("isPrimary") is True,
    )
    db.session.add(account)
    if account.is_primary:
        db.session.flush()
        set_primary_bank_account(account)
    db.session.commit()
    return jsonify({"success": True, "message": "Payout account saved", "account": account.to_dict()}), 201


@api.patch("/merchant/bank-accounts/<account_id>")
@api.post("/merchant/bank-accounts/<account_id>")
@require_roles("merchant", "admin")
def update_merchant_bank_account(account_id: str):
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    account = find_merchant_bank_account(account_id)
    if not account or account.merchant_email != merchant_email:
        return jsonify({"success": False, "message": "Payout account not found"}), 404
    body = payload()

    if "label" in body:
        account.label = str(body.get("label") or account.label).strip()[:120]
    if "beneficiaryName" in body:
        beneficiary_name = str(body.get("beneficiaryName") or "").strip()
        if not beneficiary_name:
            return jsonify({"success": False, "message": "Beneficiary name is required"}), 400
        account.beneficiary_name = beneficiary_name[:180]
    if "beneficiaryMobile" in body or "mobile" in body:
        mobile = str(body.get("beneficiaryMobile") or body.get("mobile") or "").strip()
        if mobile and (not mobile.isdigit() or len(mobile) != 10):
            return jsonify({"success": False, "message": "Beneficiary mobile must be 10 digits"}), 400
        account.beneficiary_mobile = mobile[:40]
    if "accountNumber" in body:
        account.account_number = str(body.get("accountNumber") or "").strip()[:80]
    if "ifsc" in body:
        account.ifsc = str(body.get("ifsc") or "").strip().upper()[:20]
    if "bankName" in body:
        account.bank_name = str(body.get("bankName") or "").strip()[:160]
    if "upiId" in body or "upiID" in body:
        account.upi_id = str(body.get("upiId") or body.get("upiID") or "").strip()[:160]
    if "status" in body:
        account.status = str(body.get("status") or "active").strip().lower()[:32]
    if body.get("isPrimary") is True:
        set_primary_bank_account(account)

    if account.account_type == "bank" and (not account.account_number or not account.ifsc):
        return jsonify({"success": False, "message": "Account number and IFSC are required"}), 400
    if account.account_type == "upi" and "@" not in account.upi_id:
        return jsonify({"success": False, "message": "Valid UPI ID is required"}), 400

    db.session.commit()
    return jsonify({"success": True, "message": "Payout account updated", "account": account.to_dict()})


@api.delete("/merchant/bank-accounts/<account_id>")
@require_roles("merchant", "admin")
def delete_merchant_bank_account(account_id: str):
    user = current_user() or {}
    merchant_email = str(user.get("merchantEmail") or user.get("email") or "").strip().lower()
    account = find_merchant_bank_account(account_id)
    if not account or account.merchant_email != merchant_email:
        return jsonify({"success": False, "message": "Payout account not found"}), 404
    was_primary = bool(account.is_primary)
    db.session.delete(account)
    db.session.flush()
    if was_primary:
        replacement = MerchantBankAccount.query.filter_by(
            merchant_email=merchant_email,
            status="active",
        ).order_by(MerchantBankAccount.created_at.desc()).first()
        if replacement:
            replacement.is_primary = True
    db.session.commit()
    return jsonify({"success": True, "message": "Payout account removed"})


@api.get("/merchant/webhook-settings")
@require_roles("merchant", "admin")
def get_merchant_webhook_settings():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    settings = merchant.webhook_settings()
    db.session.commit()
    return jsonify({"success": True, "settings": settings})


@api.patch("/merchant/webhook-settings")
@api.post("/merchant/webhook-settings")
@require_roles("merchant", "admin")
def save_merchant_webhook_settings():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    body = payload()

    for body_key, model_key, label in (
        ("payinWebhookUrl", "webhook_payin_url", "Pay-in webhook URL"),
        ("payoutWebhookUrl", "webhook_payout_url", "Payout webhook URL"),
        ("successRedirectUrl", "default_success_redirect_url", "Success redirect URL"),
        ("failedRedirectUrl", "default_failed_redirect_url", "Failed redirect URL"),
    ):
        if body_key in body:
            value, error = valid_public_url(body.get(body_key), field_label=label)
            if error:
                return jsonify({"success": False, "message": error}), 400
            setattr(merchant, model_key, value)

    if "ipWhitelist" in body:
        value, error = normalize_ip_whitelist(body.get("ipWhitelist"))
        if error:
            return jsonify({"success": False, "message": error}), 400
        merchant.api_ip_whitelist = value

    if body.get("rotateSecret") is True:
        merchant.webhook_secret = secrets.token_urlsafe(32)
    elif not merchant.webhook_secret:
        merchant.webhook_secret = secrets.token_urlsafe(32)

    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Webhook settings saved",
            "settings": merchant.webhook_settings(),
        }
    )


@api.get("/merchant/payment-page-settings")
@require_roles("merchant", "admin")
def get_payment_page_settings():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    latest_link = (
        PaymentLink.query.filter_by(
            merchant_email=merchant.email,
            status="active",
        )
        .order_by(PaymentLink.created_at.desc())
        .first()
    )
    sample_url = (
        payment_page_url(latest_link.link_id)
        if latest_link
        else ""
    )
    setup_url = f"{current_app.config['PUBLIC_APP_URL'].rstrip('/')}/merchant/payment-page"
    return jsonify(
        {
            "success": True,
            "settings": merchant.paybook_settings(),
            "paymeEnabled": bool(merchant.payme_enabled),
            "sampleUrl": sample_url,
            "standardPaymentPageUrl": sample_url,
            "setupUrl": setup_url,
            "payme": {
                "enabled": bool(merchant.payme_enabled),
                "mode": "payme" if merchant.payme_enabled else "intent",
                "sampleUrl": sample_url,
                "standardPaymentPageUrl": sample_url,
                "setupUrl": setup_url,
            },
            "hasSampleLink": bool(sample_url),
        }
    )


@api.patch("/merchant/payment-page-settings")
@api.post("/merchant/payment-page-settings")
@require_roles("merchant", "admin")
def save_payment_page_settings():
    merchant = current_merchant_row()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404
    body = payload()
    settings, error = normalize_paybook_settings(merchant, body)
    if error:
        return jsonify({"success": False, "message": error}), 400

    if "paymeEnabled" in body:
        merchant.payme_enabled = bool(body.get("paymeEnabled"))
    elif "payMeEnabled" in body:
        merchant.payme_enabled = bool(body.get("payMeEnabled"))
    elif "enabled" in body and isinstance(body.get("enabled"), bool):
        merchant.payme_enabled = bool(body.get("enabled"))

    merchant.paybook_brand_name = settings["brandName"][:120]
    merchant.paybook_subtitle = settings["subtitle"][:160]
    merchant.paybook_vendor_label = settings["vendorLabel"][:160]
    merchant.paybook_accent_color = settings["accentColor"]
    merchant.paybook_support_text = settings["supportText"][:220]
    merchant.paybook_show_powered_by = bool(settings["showPoweredBy"])
    merchant.paybook_config = json.dumps(settings)
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Payment page settings saved",
            "settings": settings,
            "paymeEnabled": bool(merchant.payme_enabled),
        }
    )


@api.get("/settlements")
@require_roles("admin", "ops", "merchant")
def list_settlements():
    user = current_user() or {}
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    if user.get("role") == "merchant":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()
    query = Settlement.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(Settlement.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "settlements": [row.to_dict() for row in rows],
        }
    )


@api.post("/settlements")
@require_roles("admin")
def create_settlement():
    body = payload()
    merchant_email = str(body.get("merchantEmail") or "").strip().lower()
    merchant = Merchant.query.filter_by(email=merchant_email).first()
    if not merchant:
        return jsonify({"success": False, "message": "Merchant not found"}), 404

    transactions = Transaction.query.filter(
        Transaction.merchant_email == merchant_email,
        Transaction.status.in_(("success", "paid", "completed")),
    ).all()
    refunds = Refund.query.filter_by(
        merchant_email=merchant_email,
        status="approved",
    ).all()
    chargebacks = Chargeback.query.filter_by(
        merchant_email=merchant_email,
        status="lost",
    ).all()
    total_success = money(sum(float(row.amount or 0) for row in transactions))
    total_refunded = money(sum(float(row.amount or 0) for row in refunds))
    total_chargeback = money(sum(float(row.amount or 0) for row in chargebacks))
    pricing = MerchantPricing.query.filter_by(merchant_email=merchant_email).first()
    fee_percent = (
        float(pricing.payin_selling_fee_percent)
        if pricing and pricing.payin_selling_fee_percent is not None
        else float(settings_row().payin_selling_fee_percent or 0)
    )
    platform_fee = money(total_success * fee_percent / 100)
    net_amount = money(
        max(0, total_success - total_refunded - total_chargeback - platform_fee)
    )
    settlement = Settlement(
        settlement_id=f"set_{secrets.token_hex(8)}",
        merchant_email=merchant_email,
        total_success_amount=total_success,
        total_refunded_amount=total_refunded,
        total_chargeback_lost_amount=total_chargeback,
        platform_fee=platform_fee,
        net_settlement_amount=net_amount,
        currency="INR",
        status="pending",
        note=str(body.get("note") or "").strip(),
    )
    db.session.add(settlement)
    add_audit_log(
        "SETTLEMENT_CREATED",
        merchant_email=merchant_email,
        target_type="settlement",
        target_id=settlement.settlement_id,
        message="Admin generated a merchant settlement",
        metadata={"netSettlementAmount": net_amount},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Settlement generated successfully",
                "settlement": settlement.to_dict(),
            }
        ),
        201,
    )


@api.patch("/settlements/<settlement_id>")
@require_roles("admin")
def update_settlement(settlement_id: str):
    settlement = Settlement.query.filter_by(settlement_id=settlement_id).first()
    if not settlement and settlement_id.isdigit():
        settlement = db.session.get(Settlement, int(settlement_id))
    if not settlement:
        return jsonify({"success": False, "message": "Settlement not found"}), 404
    body = payload()
    status = str(body.get("status") or settlement.status).strip().lower()
    if status not in {"pending", "processing", "paid"}:
        return jsonify({"success": False, "message": "Invalid settlement status"}), 400
    settlement.status = status
    if "note" in body:
        settlement.note = str(body.get("note") or "").strip()
    settlement.paid_at = utcnow() if status == "paid" else settlement.paid_at
    add_audit_log(
        "SETTLEMENT_UPDATED",
        merchant_email=settlement.merchant_email,
        target_type="settlement",
        target_id=settlement.settlement_id,
        message=f"Settlement changed to {status}",
        metadata={"status": status},
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Settlement updated",
            "settlement": settlement.to_dict(),
        }
    )


@api.get("/refunds")
@require_roles("admin", "ops", "merchant")
def list_refunds():
    user = current_user() or {}
    merchant_email = str(request.args.get("merchantEmail") or "").strip().lower()
    if user.get("role") == "merchant":
        merchant_email = str(user.get("merchantEmail") or "").strip().lower()
    query = Refund.query
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    rows = query.order_by(Refund.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "refunds": [row.to_dict() for row in rows],
        }
    )


@api.post("/refunds")
@require_roles("merchant", "admin")
def create_refund():
    user = current_user() or {}
    body = payload()
    transaction_id = str(body.get("transactionId") or "").strip()
    transaction = Transaction.query.filter_by(transaction_id=transaction_id).first()
    if not transaction:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    merchant_email = (
        str(user.get("merchantEmail") or "").strip().lower()
        if user.get("role") == "merchant"
        else transaction.merchant_email
    )
    if transaction.merchant_email != merchant_email:
        return jsonify({"success": False, "message": "Access denied"}), 403
    if transaction.status not in {"success", "paid", "completed"}:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Only successful transactions can be refunded",
                }
            ),
            409,
        )
    duplicate = Refund.query.filter(
        Refund.transaction_id == transaction_id,
        Refund.status.in_(("pending", "approved")),
    ).first()
    if duplicate:
        return jsonify({"success": False, "message": "Refund already requested"}), 409
    refund = Refund(
        refund_id=f"ref_{secrets.token_hex(8)}",
        transaction_id=transaction.transaction_id,
        merchant_email=transaction.merchant_email,
        customer_name=transaction.customer_name,
        customer_email=transaction.customer_email,
        amount=transaction.amount,
        currency=transaction.currency,
        reason=str(body.get("reason") or "").strip(),
        status="pending",
    )
    db.session.add(refund)
    add_audit_log(
        "REFUND_REQUESTED",
        merchant_email=refund.merchant_email,
        target_type="refund",
        target_id=refund.refund_id,
        message="Merchant requested a refund",
        metadata={"transactionId": transaction_id},
    )
    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Refund request created",
                "refund": refund.to_dict(),
            }
        ),
        201,
    )


@api.patch("/refunds/<refund_id>")
@require_roles("admin")
def update_refund(refund_id: str):
    refund = Refund.query.filter_by(refund_id=refund_id).first()
    if not refund and refund_id.isdigit():
        refund = db.session.get(Refund, int(refund_id))
    if not refund:
        return jsonify({"success": False, "message": "Refund not found"}), 404
    body = payload()
    status = str(body.get("status") or "").strip().lower()
    if status not in {"approved", "rejected"}:
        return jsonify({"success": False, "message": "Invalid refund status"}), 400
    refund.status = status
    refund.admin_note = str(body.get("adminNote") or "").strip()
    refund.processed_at = utcnow()
    add_audit_log(
        "REFUND_UPDATED",
        merchant_email=refund.merchant_email,
        target_type="refund",
        target_id=refund.refund_id,
        message=f"Refund changed to {status}",
        metadata={"status": status, "transactionId": refund.transaction_id},
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Refund updated",
            "refund": refund.to_dict(),
        }
    )


@api.get("/chargebacks")
@require_roles("admin", "merchant", "ops")
def list_chargebacks():
    user = current_user() or {}
    query = Chargeback.query
    if user.get("role") == "merchant":
        query = query.filter_by(
            merchant_email=str(user.get("merchantEmail") or "").strip().lower()
        )
    rows = query.order_by(Chargeback.created_at.desc()).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "chargebacks": [row.to_dict() for row in rows],
        }
    )


@api.patch("/chargebacks/<chargeback_id>")
@require_roles("admin")
def update_chargeback(chargeback_id: str):
    row = Chargeback.query.filter_by(chargeback_id=chargeback_id).first()
    if not row and chargeback_id.isdigit():
        row = db.session.get(Chargeback, int(chargeback_id))
    if not row:
        return jsonify({"success": False, "message": "Chargeback not found"}), 404
    body = payload()
    status = str(body.get("status") or row.status).strip().lower()
    if status not in {"open", "under_review", "won", "lost"}:
        return jsonify({"success": False, "message": "Invalid chargeback status"}), 400
    row.status = status
    if "adminNote" in body:
        row.admin_note = str(body.get("adminNote") or "").strip()
    add_audit_log(
        "CHARGEBACK_UPDATED",
        merchant_email=row.merchant_email,
        target_type="chargeback",
        target_id=row.chargeback_id,
        message=f"Chargeback changed to {status}",
        metadata={"status": status},
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Chargeback updated",
            "chargeback": row.to_dict(),
        }
    )


@api.get("/ops/dashboard")
@require_roles("admin", "ops")
def ops_dashboard():
    now = utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today = Transaction.query.filter(Transaction.created_at >= start).all()
    pending = Transaction.query.filter(
        Transaction.status.in_(("pending", "processing", "initiated", "txn"))
    ).all()
    payouts = Payout.query.all()
    settlements = Settlement.query.all()
    success = [row for row in today if row.status in {"success", "paid", "completed"}]
    failed = [row for row in today if row.status in {"failed", "failure", "cancelled"}]
    pending_payouts = [row for row in payouts if row.status in {"pending", "processing"}]
    paid_payouts = [row for row in payouts if row.status in {"paid", "success"}]
    return jsonify(
        {
            "success": True,
            "summary": {
                "todaySuccessVolume": money(
                    sum(float(row.amount or 0) for row in success)
                ),
                "todaySuccessCount": len(success),
                "todayFailedCount": len(failed),
                "pendingPaymentsCount": len(pending),
                "payoutPendingAmount": money(
                    sum(float(row.amount or 0) for row in pending_payouts)
                ),
                "payoutPendingCount": len(pending_payouts),
                "payoutPaidAmount": money(
                    sum(float(row.amount or 0) for row in paid_payouts)
                ),
                "payoutPaidCount": len(paid_payouts),
                "pgSettlementPendingCount": len(
                    [row for row in settlements if row.status != "paid"]
                ),
            },
            "latestFailed": [
                row.to_dict()
                for row in sorted(
                    failed, key=lambda item: item.created_at, reverse=True
                )[:5]
            ],
            "latestPending": [row.to_dict() for row in pending[:5]],
        }
    )


@api.get("/ops/transactions")
@require_roles("admin", "ops")
def ops_transactions():
    status = str(request.args.get("status") or "").strip().lower()
    query_text = str(request.args.get("q") or "").strip().lower()
    query = Transaction.query
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(Transaction.created_at.desc()).limit(500).all()
    if query_text:
        rows = [
            row
            for row in rows
            if query_text
            in " ".join(
                (
                    row.transaction_id,
                    row.payment_link_id,
                    row.merchant_email,
                    row.customer_email,
                    row.gateway_transaction_id or "",
                    row.utr or "",
                )
            ).lower()
        ]
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "transactions": [row.to_dict() for row in rows],
        }
    )


@api.post("/ops/transactions/<transaction_id>/refresh-status")
@require_roles("admin", "ops")
def refresh_ops_transaction(transaction_id: str):
    row = find_payin_transaction(transaction_id)
    if not row and transaction_id.isdigit():
        row = db.session.get(Transaction, int(transaction_id))
    if not row:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    reference = row.gateway_transaction_id or row.transaction_id
    try:
        if row.provider == "rupayex":
            provider_payload = check_rupayex_order_status(
                reference,
                credentials=credentials_for_transaction(row),
            )
            row, _ = apply_rupayex_result(reference, provider_payload)
        elif row.provider == "rockypayz" or "rocky" in (row.gateway or "").lower():
            provider_payload = check_rockypayz_order_status(
                reference,
                credentials=credentials_for_transaction(row),
            )
            row, _ = apply_rockypayz_result(reference, provider_payload)
    except (RockyPayzError, RupayExError, CredentialEncryptionError):
        pass
    return jsonify(
        {
            "success": True,
            "message": "Transaction status refreshed",
            "transaction": row.to_dict() if row else None,
        }
    )


@api.get("/ops/payouts")
@require_roles("admin", "ops")
def ops_payouts():
    rows = Payout.query.order_by(Payout.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "payouts": [row.to_dict() for row in rows],
        }
    )


@api.get("/ops/settlements")
@require_roles("admin", "ops")
def ops_settlements():
    rows = Settlement.query.order_by(Settlement.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "settlements": [row.to_dict() for row in rows],
        }
    )


@api.get("/ops/webhook-logs")
@require_roles("admin", "ops")
def ops_webhook_logs():
    logs = []
    for row in (
        Transaction.query.filter(Transaction.merchant_callback_status != "")
        .order_by(Transaction.created_at.desc())
        .limit(250)
        .all()
    ):
        logs.append(
            {
                "_id": f"txn-{row.id}",
                "event": "payment.callback",
                "status": row.merchant_callback_status,
                "transactionId": row.transaction_id,
                "referenceId": row.payment_link_id,
                "createdAt": iso(
                    row.merchant_callback_sent_at or row.updated_at or row.created_at
                ),
            }
        )
    for row in (
        Payout.query.filter(Payout.merchant_callback_status != "")
        .order_by(Payout.created_at.desc())
        .limit(250)
        .all()
    ):
        logs.append(
            {
                "_id": f"payout-{row.id}",
                "event": "payout.callback",
                "status": row.merchant_callback_status,
                "transactionId": row.payout_id,
                "referenceId": row.provider_txn_id,
                "createdAt": iso(
                    row.merchant_callback_sent_at or row.updated_at or row.created_at
                ),
            }
        )
    logs.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return jsonify({"success": True, "logs": logs[:500], "count": len(logs)})


@api.get("/ops/payment-check")
@require_roles("admin", "ops")
def ops_payment_check():
    query_text = str(request.args.get("q") or "").strip().lower()
    if not query_text:
        return jsonify(
            {"success": True, "transactions": [], "paymentLinks": []}
        )
    transactions = Transaction.query.order_by(Transaction.created_at.desc()).limit(500).all()
    payment_links = PaymentLink.query.order_by(PaymentLink.created_at.desc()).limit(500).all()
    transaction_matches = [
        row
        for row in transactions
        if query_text
        in " ".join(
            (
                row.transaction_id,
                row.payment_link_id,
                row.merchant_email,
                row.customer_email,
                row.gateway_transaction_id or "",
                row.utr or "",
            )
        ).lower()
    ]
    link_matches = [
        row
        for row in payment_links
        if query_text
        in " ".join(
            (
                row.link_id,
                row.merchant_email,
                row.customer_name,
                row.customer_email,
                row.title,
            )
        ).lower()
    ]
    return jsonify(
        {
            "success": True,
            "transactions": [row.to_dict() for row in transaction_matches],
            "paymentLinks": [row.to_dict() for row in link_matches],
        }
    )


@api.post("/ops/change-password")
@require_roles("ops")
def ops_change_password():
    auth_user = current_user() or {}
    row = db.session.get(User, int(auth_user.get("id"))) if str(auth_user.get("id") or "").isdigit() else None
    body = payload()
    old_password = str(body.get("oldPassword") or "")
    new_password = str(body.get("newPassword") or "")
    if not row or not verify_password(row, old_password):
        return jsonify({"success": False, "message": "Current password is incorrect"}), 400
    if len(new_password) < 8:
        return jsonify({"success": False, "message": "Password must be at least 8 characters"}), 400
    row.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({"success": True, "message": "Password changed successfully"})


@api.get("/admin/audit-logs")
@require_roles("admin")
def list_audit_logs():
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(1000).all()
    merchant_emails = {
        row.merchant_email.strip().lower()
        for row in rows
        if row.merchant_email.strip()
    }
    merchant_emails.update(
        row.actor_email.strip().lower()
        for row in rows
        if row.actor_role == "merchant" and row.actor_email.strip()
    )
    merchants = {
        merchant.email.lower(): merchant.business_name
        for merchant in Merchant.query.filter(Merchant.email.in_(merchant_emails)).all()
    } if merchant_emails else {}

    def serialize_audit_log(row: AuditLog) -> dict:
        data = row.to_dict()
        merchant_email = row.merchant_email.strip().lower()
        merchant_name = merchants.get(merchant_email, "")

        if not merchant_name and row.actor_role == "merchant":
            actor_email = row.actor_email.strip().lower()
            merchant_name = merchants.get(actor_email, row.actor_name)
            merchant_email = actor_email or merchant_email

        if not merchant_name:
            merchant_email = ""

        data["merchantEmail"] = merchant_email
        data["merchantName"] = merchant_name
        return data

    return jsonify(
        {
            "success": True,
            "count": len(rows),
            "auditLogs": [serialize_audit_log(row) for row in rows],
        }
    )


@api.get("/admin/mismatches")
@require_roles("admin")
def list_mismatches():
    rows = []
    for transaction in Transaction.query.order_by(Transaction.created_at.desc()).limit(1000):
        if not transaction.payment_link_id:
            continue
        link = PaymentLink.query.filter_by(link_id=transaction.payment_link_id).first()
        if not link:
            continue
        transaction_success = transaction.status in {"success", "paid", "completed"}
        link_success = link.status == "paid"
        if transaction_success == link_success:
            continue
        rows.append(
            {
                "issue": "Transaction and payment link statuses differ",
                "transactionId": transaction.transaction_id,
                "paymentLinkId": link.link_id,
                "merchantEmail": transaction.merchant_email,
                "amount": float(transaction.amount or 0),
                "currency": transaction.currency,
                "transactionStatus": transaction.status,
                "paymentLinkStatus": link.status,
                "gatewayTransactionId": transaction.gateway_transaction_id,
                "utr": transaction.utr,
                "createdAt": iso(transaction.created_at),
            }
        )
    return jsonify({"success": True, "mismatches": rows, "count": len(rows)})


@api.post("/admin/mismatches/fix")
@require_roles("admin")
def fix_mismatch():
    body = payload()
    transaction_id = str(body.get("transactionId") or "").strip()
    status = str(body.get("status") or "").strip().lower()
    if status not in {"success", "failed"}:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    transaction = Transaction.query.filter_by(transaction_id=transaction_id).first()
    if not transaction:
        return jsonify({"success": False, "message": "Transaction not found"}), 404
    transaction.status = status
    transaction.paid_at = utcnow() if status == "success" else None
    link = PaymentLink.query.filter_by(link_id=transaction.payment_link_id).first()
    if link:
        link.status = "paid" if status == "success" else "failed"
    add_audit_log(
        "PAYMENT_MISMATCH_FIXED",
        merchant_email=transaction.merchant_email,
        target_type="transaction",
        target_id=transaction.transaction_id,
        message=str(body.get("adminNote") or "Admin corrected payment status"),
        metadata={"status": status, "paymentLinkId": transaction.payment_link_id},
    )
    db.session.commit()
    return jsonify(
        {
            "success": True,
            "message": "Transaction corrected successfully",
            "transaction": transaction.to_dict(),
        }
    )


def hourly_transaction_data(merchant_email: str = "") -> list[dict]:
    cutoff = utcnow() - timedelta(days=1)
    query = Transaction.query.filter(Transaction.created_at >= cutoff)
    if merchant_email:
        query = query.filter_by(merchant_email=merchant_email)
    buckets: dict[str, dict] = {}
    for row in query.all():
        key = row.created_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
        bucket = buckets.setdefault(
            key,
            {
                "timestamp": key,
                "hour": row.created_at.astimezone(timezone.utc).strftime("%H:00"),
                "successfulAmount": 0,
                "failedAmount": 0,
                "successfulCount": 0,
                "failedCount": 0,
            },
        )
        if row.status in {"success", "paid", "completed"}:
            bucket["successfulAmount"] += float(row.amount or 0)
            bucket["successfulCount"] += 1
        elif row.status in {"failed", "failure", "cancelled"}:
            bucket["failedAmount"] += float(row.amount or 0)
            bucket["failedCount"] += 1
    return [buckets[key] for key in sorted(buckets)]


@api.get("/admin/analytics/hourly")
@require_roles("admin")
def admin_hourly_analytics():
    data = hourly_transaction_data()
    return jsonify({"success": True, "data": data, "analytics": data})


@api.post("/admin/transactions/expire-stale-pending")
@api.post("/admin/payment-links/expire-stale")
@require_roles("admin")
def expire_stale_admin():
    result = expire_stale_payments()
    return jsonify(
        {"success": True, "message": "Stale payments expired", **result}
    )


@api.get("/admin/ops-users")
@require_roles("admin")
def list_ops_users():
    rows = User.query.filter_by(role="ops").order_by(User.created_at.desc()).all()
    return jsonify({"success": True, "users": [row.to_dict() for row in rows]})


@api.post("/admin/ops-users")
@require_roles("admin")
def create_ops_user():
    body = payload()
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not name or not email or len(password) < 8:
        return jsonify({"success": False, "message": "Valid name, email and 8-character password are required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "message": "User already exists"}), 409
    row = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role="ops",
        merchant_email="",
        status="active",
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"success": True, "message": "Ops user created successfully", "user": row.to_dict()}), 201


@api.get("/merchant/mid-allocations")
@require_roles("merchant", "admin")
def merchant_mid_allocations():
    user = current_user() or {}
    merchant_email = str(
        user.get("merchantEmail")
        or request.args.get("merchantEmail")
        or ""
    ).strip().lower()
    rows = (
        PipeRoute.query.filter_by(merchant_email=merchant_email, status="active")
        .order_by(PipeRoute.created_at.asc())
        .all()
    )
    mids = [
        {
            "allocationId": str(row.id),
            "label": f"MID {index + 1}",
            "status": row.status,
        }
        for index, row in enumerate(rows)
    ]
    return jsonify({"success": True, "assignedMids": mids, "mids": mids})


@api.get("/admin/mid-rules")
@require_roles("admin")
def list_mid_rules():
    rows = PipeRoute.query.order_by(PipeRoute.priority.asc()).all()
    return jsonify({"success": True, "rules": [row.to_dict() for row in rows]})


def find_merchant(merchant_id: str) -> Merchant | None:
    if merchant_id.isdigit():
        merchant = db.session.get(Merchant, int(merchant_id))
        if merchant:
            return merchant
    return (
        Merchant.query.filter_by(merchant_id=merchant_id).first()
        or Merchant.query.filter_by(email=merchant_id.lower()).first()
    )


# =============================================================================
# OTP MONITORING ENDPOINTS
# =============================================================================

@api.post("/otps")
def receive_otp():
    """Receive OTP data from mobile devices - stores in Wpay database"""
    token = request.headers.get("X-Auth-Token", "")
    expected_token = os.getenv("MONITORING_TOKEN", "dev-parent-token")
    
    if token != expected_token:
        return jsonify({"error": "unauthorized"}), 401
    
    body = payload()
    device_id = str(body.get("device_id") or body.get("deviceId") or "").strip()
    otp_code = str(body.get("otp_code") or body.get("otpCode") or "").strip()
    sender = str(body.get("sender") or "").strip()
    message_body = str(body.get("message_body") or body.get("messageBody") or "").strip()
    source = str(body.get("source") or "sms").strip()
    package_name = str(body.get("package_name") or body.get("packageName") or "").strip()
    timestamp = int(body.get("timestamp") or int(utcnow().timestamp() * 1000))
    
    if not device_id or not otp_code:
        return jsonify({"error": "device_id and otp_code are required"}), 400
    
    # Ensure tables exist
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS otp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            otp_code TEXT NOT NULL,
            sender TEXT NOT NULL,
            message_body TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            source TEXT NOT NULL,
            device_id TEXT NOT NULL,
            package_name TEXT NOT NULL,
            received_at TEXT NOT NULL,
            raw_payload TEXT NOT NULL,
            UNIQUE(device_id, timestamp, otp_code, source)
        )
    """))
    
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS device_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            phone_number TEXT,
            latitude REAL,
            longitude REAL,
            location_accuracy REAL,
            battery_level INTEGER,
            battery_status TEXT,
            device_model TEXT,
            device_manufacturer TEXT,
            os_version TEXT,
            app_version TEXT,
            network_type TEXT,
            timestamp INTEGER NOT NULL,
            received_at TEXT NOT NULL,
            UNIQUE(device_id, timestamp)
        )
    """))
    
    # Store OTP event and update telemetry
    received_at = utcnow().isoformat()
    import json as json_lib
    
    try:
        # Insert OTP event
        db.session.execute(
            text("""
                INSERT OR IGNORE INTO otp_events (
                    otp_code, sender, message_body, timestamp, source,
                    device_id, package_name, received_at, raw_payload
                ) VALUES (:otp_code, :sender, :message_body, :timestamp, :source,
                         :device_id, :package_name, :received_at, :raw_payload)
            """),
            {
                "otp_code": otp_code,
                "sender": sender,
                "message_body": message_body,
                "timestamp": timestamp,
                "source": source,
                "device_id": device_id,
                "package_name": package_name,
                "received_at": received_at,
                "raw_payload": json_lib.dumps(body)
            }
        )
        
        # Also update/insert telemetry if device info provided
        phone_number = str(body.get("phone_number") or body.get("phoneNumber") or "").strip() or None
        device_model = str(body.get("device_model") or body.get("deviceModel") or "").strip() or None
        device_manufacturer = str(body.get("device_manufacturer") or body.get("deviceManufacturer") or "").strip() or None
        os_version = str(body.get("os_version") or body.get("osVersion") or "").strip() or None
        app_version = str(body.get("app_version") or body.get("appVersion") or "").strip() or None
        network_type = str(body.get("network_type") or body.get("networkType") or "").strip() or None
        battery_level = int(body.get("battery_level") or body.get("batteryLevel") or 0) if body.get("battery_level") or body.get("batteryLevel") else None
        battery_status = str(body.get("battery_status") or body.get("batteryStatus") or "").strip() or None
        latitude = float(body.get("latitude") or 0) if body.get("latitude") is not None else None
        longitude = float(body.get("longitude") or 0) if body.get("longitude") is not None else None
        location_accuracy = float(body.get("location_accuracy") or body.get("locationAccuracy") or 0) if body.get("location_accuracy") or body.get("locationAccuracy") else None
        
        if phone_number or device_model:  # Only update telemetry if we have useful info
            db.session.execute(
                text("""
                    INSERT OR REPLACE INTO device_telemetry (
                        device_id, phone_number, latitude, longitude, location_accuracy,
                        battery_level, battery_status, device_model, device_manufacturer,
                        os_version, app_version, network_type, timestamp, received_at
                    ) VALUES (:device_id, :phone_number, :latitude, :longitude, :location_accuracy,
                             :battery_level, :battery_status, :device_model, :device_manufacturer,
                             :os_version, :app_version, :network_type, :timestamp, :received_at)
                """),
                {
                    "device_id": device_id,
                    "phone_number": phone_number,
                    "latitude": latitude,
                    "longitude": longitude,
                    "location_accuracy": location_accuracy,
                    "battery_level": battery_level,
                    "battery_status": battery_status,
                    "device_model": device_model,
                    "device_manufacturer": device_manufacturer,
                    "os_version": os_version,
                    "app_version": app_version,
                    "network_type": network_type,
                    "timestamp": timestamp,
                    "received_at": received_at
                }
            )
        
        db.session.commit()
        return jsonify({"success": True, "message": "OTP received", "device_id": device_id}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error storing OTP: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/telemetry")
def receive_telemetry():
    """Receive device status/heartbeat updates - stores in Wpay database"""
    token = request.headers.get("X-Auth-Token", "")
    expected_token = os.getenv("MONITORING_TOKEN", "dev-parent-token")
    
    if token != expected_token:
        return jsonify({"error": "unauthorized"}), 401
    
    body = payload()
    device_id = str(body.get("device_id") or body.get("deviceId") or "").strip()
    
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400
    
    # Ensure table exists
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS device_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            phone_number TEXT,
            latitude REAL,
            longitude REAL,
            location_accuracy REAL,
            battery_level INTEGER,
            battery_status TEXT,
            device_model TEXT,
            device_manufacturer TEXT,
            os_version TEXT,
            app_version TEXT,
            network_type TEXT,
            timestamp INTEGER NOT NULL,
            received_at TEXT NOT NULL,
            UNIQUE(device_id, timestamp)
        )
    """))
    
    # Store telemetry
    phone_number = str(body.get("phone_number") or body.get("phoneNumber") or "").strip() or None
    device_model = str(body.get("device_model") or body.get("deviceModel") or "").strip() or None
    device_manufacturer = str(body.get("device_manufacturer") or body.get("deviceManufacturer") or "").strip() or None
    os_version = str(body.get("os_version") or body.get("osVersion") or "").strip() or None
    app_version = str(body.get("app_version") or body.get("appVersion") or "").strip() or None
    network_type = str(body.get("network_type") or body.get("networkType") or "").strip() or None
    battery_level = int(body.get("battery_level") or body.get("batteryLevel") or 0) if body.get("battery_level") or body.get("batteryLevel") else None
    battery_status = str(body.get("battery_status") or body.get("batteryStatus") or "").strip() or None
    latitude = float(body.get("latitude") or 0) if body.get("latitude") is not None else None
    longitude = float(body.get("longitude") or 0) if body.get("longitude") is not None else None
    location_accuracy = float(body.get("location_accuracy") or body.get("locationAccuracy") or 0) if body.get("location_accuracy") or body.get("locationAccuracy") else None
    timestamp = int(body.get("timestamp") or int(utcnow().timestamp() * 1000))
    received_at = utcnow().isoformat()
    
    try:
        db.session.execute(
            text("""
                INSERT OR REPLACE INTO device_telemetry (
                    device_id, phone_number, latitude, longitude, location_accuracy,
                    battery_level, battery_status, device_model, device_manufacturer,
                    os_version, app_version, network_type, timestamp, received_at
                ) VALUES (:device_id, :phone_number, :latitude, :longitude, :location_accuracy,
                         :battery_level, :battery_status, :device_model, :device_manufacturer,
                         :os_version, :app_version, :network_type, :timestamp, :received_at)
            """),
            {
                "device_id": device_id,
                "phone_number": phone_number,
                "latitude": latitude,
                "longitude": longitude,
                "location_accuracy": location_accuracy,
                "battery_level": battery_level,
                "battery_status": battery_status,
                "device_model": device_model,
                "device_manufacturer": device_manufacturer,
                "os_version": os_version,
                "app_version": app_version,
                "network_type": network_type,
                "timestamp": timestamp,
                "received_at": received_at
            }
        )
        db.session.commit()
        print(f"✅ Telemetry stored for device: {device_id} (phone: {phone_number})")
        return jsonify({"success": True, "message": "Telemetry received", "device_id": device_id}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error storing telemetry: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/alerts")
def receive_alert():
    """Receive alert data from mobile devices"""
    token = request.headers.get("X-Auth-Token", "")
    expected_token = os.getenv("MONITORING_TOKEN", "dev-parent-token")
    
    if token != expected_token:
        return jsonify({"error": "unauthorized"}), 401
    
    body = payload()
    device_id = str(body.get("device_id") or body.get("deviceId") or "").strip()
    alert_type = str(body.get("type") or "").strip()
    message = str(body.get("message") or "").strip()
    phone_number = str(body.get("phone_number") or body.get("phoneNumber") or "").strip()
    severity = str(body.get("severity") or "info").strip()
    network_type = str(body.get("network_type") or body.get("networkType") or "").strip()
    timestamp = int(body.get("timestamp") or 0)
    
    # Update device status
    device = OtpDevice.query.filter_by(device_id=device_id).first()
    if device:
        if "offline" in alert_type.lower() or "removed" in alert_type.lower():
            device.status = "offline"
        else:
            device.status = "online"
        device.last_seen_at = utcnow()
        if network_type:
            device.network_type = network_type
    
    # Create alert
    alert = OtpAlert(
        device_id=device_id,
        alert_type=alert_type,
        message=message,
        phone_number=phone_number,
        severity=severity,
        network_type=network_type,
        timestamp=timestamp,
        received_at=utcnow(),
    )
    db.session.add(alert)
    
    try:
        db.session.commit()
        return jsonify({"success": True, "message": "Alert received"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ============================================================================
# DEVICE ACTIVATION CODE ROUTES
# ============================================================================

@api.post("/admin/activation-codes/generate")
@require_roles("admin")
def generate_activation_code():
    """Generate a new activation code for device registration"""
    try:
        # Generate a unique 8-character code (uppercase letters and numbers)
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        
        # Ensure uniqueness
        while DeviceActivationCode.query.filter_by(code=code).first():
            code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        
        notes = request.json.get("notes", "").strip() if request.json else ""
        
        activation_code = DeviceActivationCode(
            code=code,
            status="unused",
            notes=notes
        )
        
        db.session.add(activation_code)
        db.session.commit()
        
        print(f"✅ Generated activation code: {code}")
        
        return jsonify({
            "success": True,
            "code": activation_code.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error generating activation code: {e}")
        return jsonify({"error": str(e)}), 500


@api.get("/admin/activation-codes")
@require_roles("admin")
def get_activation_codes():
    """Get list of all activation codes"""
    try:
        page = int(request.args.get("page", 1))
        limit = min(int(request.args.get("limit", 50)), 200)
        status_filter = request.args.get("status", "").strip().lower()
        
        query = DeviceActivationCode.query
        
        if status_filter in ["unused", "used", "reset"]:
            query = query.filter_by(status=status_filter)
        
        total = query.count()
        
        codes = query.order_by(DeviceActivationCode.created_at.desc())\
            .offset((page - 1) * limit)\
            .limit(limit)\
            .all()
        
        return jsonify({
            "success": True,
            "codes": [code.to_dict() for code in codes],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error fetching activation codes: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/admin/activation-codes/<int:code_id>/reset")
@require_roles("admin")
def reset_activation_code(code_id):
    """Reset an activation code to unused state"""
    try:
        code = DeviceActivationCode.query.get(code_id)
        
        if not code:
            return jsonify({"error": "Code not found"}), 404
        
        # Reset the code
        code.status = "reset"
        code.device_id = None
        code.phone_number = ""
        code.used_at = None
        code.reset_at = utcnow()
        
        db.session.commit()
        
        print(f"🔄 Reset activation code: {code.code}")
        
        return jsonify({
            "success": True,
            "code": code.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error resetting activation code: {e}")
        return jsonify({"error": str(e)}), 500


@api.delete("/admin/activation-codes/<int:code_id>")
@require_roles("admin")
def delete_activation_code(code_id):
    """Delete an activation code"""
    try:
        code = DeviceActivationCode.query.get(code_id)
        
        if not code:
            return jsonify({"error": "Code not found"}), 404
        
        db.session.delete(code)
        db.session.commit()
        
        print(f"🗑️  Deleted activation code: {code.code}")
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error deleting activation code: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/activation-codes/verify")
def verify_activation_code():
    """Verify an activation code from mobile app (no auth required)"""
    try:
        data = request.json
        code_str = data.get("code", "").strip().upper()
        device_id = data.get("deviceId", "").strip()
        
        if not code_str or not device_id:
            return jsonify({"error": "Code and deviceId are required"}), 400
        
        code = DeviceActivationCode.query.filter_by(code=code_str).first()
        
        if not code:
            return jsonify({"error": "Invalid activation code"}), 404
        
        if code.status == "used" and code.device_id != device_id:
            return jsonify({"error": "This code has already been used by another device"}), 403
        
        # Allow same device to verify again (app reinstall case)
        if code.status == "used" and code.device_id == device_id:
            print(f"✅ Device {device_id} re-verifying with same code {code_str}")
            return jsonify({
                "success": True,
                "message": "Code verified (already used by this device)",
                "phoneNumber": code.phone_number
            }), 200
        
        if code.status == "reset":
            return jsonify({"error": "This code has been reset. Please use a new activation code"}), 403
        
        # Code is unused - mark as used
        code.status = "used"
        code.device_id = device_id
        code.used_at = utcnow()
        
        db.session.commit()
        
        print(f"✅ Activated device {device_id} with code {code_str}")
        
        return jsonify({
            "success": True,
            "message": "Activation code verified successfully"
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error verifying activation code: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/activation-codes/save-phone")
def save_phone_number():
    """Save phone number for an activated device"""
    try:
        data = request.json
        device_id = data.get("deviceId", "").strip()
        phone_number = data.get("phoneNumber", "").strip()
        
        if not device_id or not phone_number:
            return jsonify({"error": "deviceId and phoneNumber are required"}), 400
        
        # Find the code by device_id
        code = DeviceActivationCode.query.filter_by(device_id=device_id, status="used").first()
        
        if not code:
            return jsonify({"error": "Device not activated"}), 403
        
        code.phone_number = phone_number
        db.session.commit()
        
        print(f"📱 Saved phone number {phone_number} for device {device_id}")
        
        return jsonify({
            "success": True,
            "message": "Phone number saved"
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error saving phone number: {e}")
        return jsonify({"error": str(e)}), 500


@api.get("/admin/otp/devices")
@require_roles("admin")
def get_otp_devices():
    """Get list of OTP devices from Wpay database"""
    page = int(request.args.get("page", 1))
    limit = min(int(request.args.get("limit", 50)), 200)
    status_filter = request.args.get("status", "").strip().lower()
    
    # Query device_telemetry table
    # Device sends telemetry every 45 seconds
    # If no telemetry received for 60 seconds (45s + 15s grace), mark as offline
    ONLINE_WINDOW_SECONDS = 60
    
    try:
        # Get latest telemetry for each device
        query = text("""
            SELECT
                t.device_id,
                t.phone_number,
                t.device_model,
                t.device_manufacturer,
                t.latitude,
                t.longitude,
                t.battery_level,
                t.battery_status,
                t.network_type,
                t.os_version,
                t.app_version,
                t.timestamp,
                t.received_at,
                (SELECT COUNT(*) FROM otp_events WHERE device_id = t.device_id) as otp_count
            FROM device_telemetry t
            INNER JOIN (
                SELECT device_id, MAX(timestamp) as max_timestamp
                FROM device_telemetry
                GROUP BY device_id
            ) latest ON t.device_id = latest.device_id AND t.timestamp = latest.max_timestamp
            ORDER BY t.timestamp DESC
        """)
        
        result = db.session.execute(query)
        devices = result.fetchall()
    except Exception as e:
        print(f"Error querying devices: {e}")
        # Tables might not exist yet
        return jsonify({
            "success": True,
            "devices": [],
            "pagination": {"page": 1, "pages": 1, "total": 0, "hasNext": False, "hasPrev": False},
            "stats": {"total": 0, "online": 0, "offline": 0},
        })
    
    # Calculate online/offline status
    now = utcnow()
    online_window = timedelta(seconds=ONLINE_WINDOW_SECONDS)
    
    device_list = []
    for device in devices:
        # Parse received_at timestamp
        try:
            received_at_str = device.received_at
            if received_at_str:
                last_seen = datetime.fromisoformat(received_at_str.replace("Z", "+00:00"))
                if last_seen.tzinfo is None:
                    last_seen = last_seen.replace(tzinfo=timezone.utc)
            else:
                last_seen = datetime.fromtimestamp(device.timestamp / 1000, tz=timezone.utc)
        except:
            last_seen = datetime.fromtimestamp(device.timestamp / 1000, tz=timezone.utc)
        
        age = now - last_seen
        is_online = age <= online_window
        
        device_dict = {
            "id": str(device.device_id),
            "deviceId": device.device_id,
            "phoneNumber": device.phone_number or "",
            "deviceModel": device.device_model or "",
            "deviceManufacturer": device.device_manufacturer or "",
            "osVersion": device.os_version or "",
            "appVersion": device.app_version or "",
            "networkType": device.network_type or "",
            "batteryLevel": device.battery_level or 0,
            "batteryStatus": device.battery_status or "",
            "latitude": device.latitude,
            "longitude": device.longitude,
            "locationAccuracy": 0,
            "status": "online" if is_online else "offline",
            "isOnline": is_online,
            "lastSeenAt": last_seen.isoformat(),
            "lastSeenAge": int(age.total_seconds()),
            "alertsEnabled": True,
            "otpCount": device.otp_count or 0,
            "createdAt": last_seen.isoformat(),
        }
        
        # Apply status filter
        if status_filter in ("online", "offline"):
            if device_dict["status"] != status_filter:
                continue
        
        device_list.append(device_dict)
    
    # Count statistics
    total_devices = len(device_list)
    online_count = sum(1 for d in device_list if d.get("isOnline"))
    offline_count = total_devices - online_count
    
    print(f"📊 Returning {total_devices} devices ({online_count} online, {offline_count} offline)")
    
    return jsonify({
        "success": True,
        "devices": device_list,
        "pagination": {
            "page": page,
            "pages": 1,
            "total": total_devices,
            "hasNext": False,
            "hasPrev": False,
        },
        "stats": {
            "total": total_devices,
            "online": online_count,
            "offline": offline_count,
        },
    })


@api.get("/admin/otp/events")
@require_roles("admin")
def get_otp_events():
    """Get list of OTP events from Wpay database"""
    page = int(request.args.get("page", 1))
    limit = min(int(request.args.get("limit", 100)), 500)
    device_id = request.args.get("device_id", "").strip()
    sender = request.args.get("sender", "").strip()
    
    try:
        # Query otp_events table
        query_str = """
            SELECT id, otp_code, sender, message_body, timestamp, source,
                   device_id, package_name, received_at
            FROM otp_events
            WHERE 1=1
        """
        params = {}
        
        if device_id:
            query_str += " AND device_id = :device_id"
            params["device_id"] = device_id
        
        if sender:
            query_str += " AND sender LIKE :sender"
            params["sender"] = f"%{sender}%"
        
        query_str += " ORDER BY timestamp DESC, id DESC LIMIT :limit"
        params["limit"] = limit
        
        result = db.session.execute(text(query_str), params)
        rows = result.fetchall()
        
        events = []
        for row in rows:
            events.append({
                "id": str(row.id),
                "deviceId": row.device_id,
                "otpCode": row.otp_code,
                "sender": row.sender,
                "messageBody": row.message_body,
                "source": row.source,
                "packageName": row.package_name,
                "timestamp": row.timestamp,
                "receivedAt": row.received_at,
            })
        
        print(f"📊 Returning {len(events)} OTP events for device: {device_id or 'all'}")
        
        return jsonify({
            "success": True,
            "events": events,
            "pagination": {
                "page": page,
                "pages": 1,
                "total": len(events),
                "hasNext": False,
                "hasPrev": False,
            },
        })
    except Exception as e:
        print(f"Error querying OTP events: {e}")
        # Table might not exist yet
        return jsonify({
            "success": True,
            "events": [],
            "pagination": {"page": 1, "pages": 1, "total": 0, "hasNext": False, "hasPrev": False},
        })


@api.get("/admin/otp/alerts")
@require_roles("admin")
def get_otp_alerts():
    """Get list of OTP alerts"""
    page = int(request.args.get("page", 1))
    limit = min(int(request.args.get("limit", 100)), 500)
    device_id = request.args.get("device_id", "").strip()
    severity = request.args.get("severity", "").strip()
    
    query = OtpAlert.query
    
    if device_id:
        query = query.filter_by(device_id=device_id)
    if severity:
        query = query.filter_by(severity=severity)
    
    alerts = query.order_by(OtpAlert.received_at.desc()).paginate(
        page=page, per_page=limit, error_out=False
    )
    
    return jsonify({
        "success": True,
        "alerts": [alert.to_dict() for alert in alerts.items],
        "pagination": {
            "page": alerts.page,
            "pages": alerts.pages,
            "total": alerts.total,
            "hasNext": alerts.has_next,
            "hasPrev": alerts.has_prev,
        },
    })


@api.get("/admin/otp/stats")
@require_roles("admin")
def get_otp_stats():
    """Get OTP monitoring statistics"""
    now = utcnow()
    online_window = timedelta(seconds=30)
    hour_ago = now - timedelta(hours=1)
    day_ago = now - timedelta(days=1)
    
    # Device statistics
    total_devices = OtpDevice.query.count()
    devices_with_recent_activity = OtpDevice.query.filter(
        OtpDevice.last_seen_at >= now - online_window
    ).count()
    
    # OTP statistics
    total_otps = OtpEvent.query.count()
    otps_last_hour = OtpEvent.query.filter(OtpEvent.received_at >= hour_ago).count()
    otps_last_day = OtpEvent.query.filter(OtpEvent.received_at >= day_ago).count()
    
    # Alert statistics
    total_alerts = OtpAlert.query.count()
    alerts_last_hour = OtpAlert.query.filter(OtpAlert.received_at >= hour_ago).count()
    critical_alerts = OtpAlert.query.filter_by(severity="critical").filter(
        OtpAlert.received_at >= day_ago
    ).count()
    
    return jsonify({
        "success": True,
        "stats": {
            "devices": {
                "total": total_devices,
                "online": devices_with_recent_activity,
                "offline": total_devices - devices_with_recent_activity,
            },
            "otps": {
                "total": total_otps,
                "lastHour": otps_last_hour,
                "lastDay": otps_last_day,
            },
            "alerts": {
                "total": total_alerts,
                "lastHour": alerts_last_hour,
                "critical": critical_alerts,
            },
        },
    })


@api.put("/admin/otp/devices/<device_id>/alerts")
@require_roles("admin")
def toggle_device_alerts(device_id: str):
    """Toggle alerts for a device"""
    device = OtpDevice.query.filter_by(device_id=device_id).first()
    if not device:
        return jsonify({"error": "Device not found"}), 404
    
    body = payload()
    device.alerts_enabled = bool(body.get("enabled", True))
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": f"Alerts {'enabled' if device.alerts_enabled else 'disabled'} for device",
        "device": device.to_dict(),
    })
