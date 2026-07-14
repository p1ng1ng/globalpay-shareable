import json
import hmac
from datetime import timedelta

import pyotp
import pytest

from backend.app import create_app
from backend.config import Config, TestConfig
from backend.credential_crypto import CredentialEncryptionError
from backend.extensions import db
from backend.merchant_webhooks import callback_signature
from backend.models import (
    BankRailRoute,
    BankVerificationJob,
    GatewayCredentialTemplate,
    InternalBankRail,
    MidPool,
    PaymentLink,
    PipeRoute,
    Payout,
    Transaction,
    utcnow,
)


def make_client():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    return app.test_client()


def login_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "test21@gmail.com", "password": "test21@gmail.com"},
    )
    assert response.status_code == 200
    assert response.json["success"] is True
    return response


def activate_created_merchant(client, created_response):
    merchant_id = created_response.json["merchant"]["_id"]
    response = client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"})
    assert response.status_code == 200
    return response.json["merchant"]


def create_gateway_template_and_pool(
    client,
    *,
    gateway: str,
    suffix: str,
    merchant_email: str = "",
):
    fields = [
        {
            "key": "apiKey",
            "label": "API Key",
            "type": "secret",
            "value": f"{gateway.lower()}-test-key",
        },
        {
            "key": "mode",
            "label": "Mode",
            "type": "mode",
            "value": "sandbox",
        },
    ]
    if gateway.strip().lower() == "alosheell":
        fields.extend(
            [
                {
                    "key": "loginId",
                    "label": "Login ID",
                    "type": "text",
                    "value": "8827095122",
                },
                {
                    "key": "password",
                    "label": "Password",
                    "type": "secret",
                    "value": "alo-password",
                },
                {
                    "key": "tokenKey",
                    "label": "Token Key",
                    "type": "secret",
                    "value": "alo-token-key",
                },
                {
                    "key": "tokenUrl",
                    "label": "Token URL",
                    "type": "text",
                    "value": "https://apipanel.alosheell.com/auth/user/generateToken",
                },
                {
                    "key": "payoutApiUrl",
                    "label": "Payout API URL",
                    "type": "text",
                    "value": "https://apipanel.alosheell.com/auth/payout/payoutApi",
                },
                {
                    "key": "fundTransferType",
                    "label": "Fund Transfer Type",
                    "type": "text",
                    "value": "imps",
                },
                {
                    "key": "payoutProxyUrl",
                    "label": "Payout Proxy URL",
                    "type": "text",
                    "value": "https://proxy.example.com/payout",
                },
                {
                    "key": "payoutProxySecret",
                    "label": "Payout Proxy Secret",
                    "type": "secret",
                    "value": "proxy-secret",
                },
            ]
        )
    template = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": f"{gateway} {suffix}",
            "fields": fields,
        },
    )
    assert template.status_code == 201
    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": gateway,
            "midName": f"{gateway} test MID",
            "midId": f"{gateway.upper()}_{suffix}",
            "totalLimit": 100000,
            "credentialTemplateId": template.json["template"]["_id"],
        },
    )
    assert pool.status_code == 201
    if merchant_email:
        allocation = client.post(
            "/api/admin/mid-allocations",
            json={
                "merchantEmail": merchant_email,
                "midPoolId": pool.json["midPool"]["_id"],
                "merchantLimit": 50000,
                "commissionPercent": 1,
            },
        )
        assert allocation.status_code == 201
    return template.json["template"], pool.json["midPool"]


def test_database_pool_checks_connections_before_reuse():
    assert Config.SQLALCHEMY_ENGINE_OPTIONS["pool_pre_ping"] is True
    assert Config.SQLALCHEMY_ENGINE_OPTIONS["pool_recycle"] == 240


def test_dummy_admin_login_and_me():
    client = make_client()
    login_admin(client)

    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json["user"]["email"] == "test21@gmail.com"
    assert response.json["user"]["role"] == "admin"


def test_merchant_activation_can_repeat():
    client = make_client()
    login_admin(client)

    create = client.post(
        "/api/merchants",
        json={
            "businessName": "Acme Pay",
            "ownerName": "Acme Owner",
            "email": "acme@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert create.status_code == 201
    merchant_id = create.json["merchant"]["_id"]

    first = client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"})
    second = client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json["merchant"]["activationCount"] == 2


def test_pending_signup_must_be_approved_before_login_and_mid_linking():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Pending Merchant",
            "ownerName": "Pending Owner",
            "email": "pending@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert created.status_code == 201

    client.post("/api/auth/logout")
    pending_login = client.post(
        "/api/auth/login",
        json={"email": "pending@example.com", "password": "secret123"},
    )
    assert pending_login.status_code == 403
    assert "approval" in pending_login.json["message"].lower()

    login_admin(client)
    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "Alosheell",
            "midName": "Alosheell pending test",
            "midId": "ALOSHEELL_PENDING",
            "totalLimit": 100000,
        },
    )
    assert pool.status_code == 201
    rejected_link = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "pending@example.com",
            "midPoolId": pool.json["midPool"]["_id"],
            "merchantLimit": 50000,
        },
    )
    assert rejected_link.status_code == 409

    activate_created_merchant(client, created)
    accepted_link = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "pending@example.com",
            "midPoolId": pool.json["midPool"]["_id"],
            "merchantLimit": 50000,
        },
    )
    assert accepted_link.status_code == 201
    assert accepted_link.json["allocation"]["gatewayName"] == "Alosheell"


def test_admin_assigns_multiple_gateways_and_gets_one_mapping_per_row():
    client = make_client()
    login_admin(client)
    merchant_response = client.post(
        "/api/merchants",
        json={
            "businessName": "Gateway Merchant",
            "ownerName": "Gateway Owner",
            "email": "gateway@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    merchant = activate_created_merchant(client, merchant_response)

    first_pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "RockyPayz",
            "midName": "Rocky primary",
            "midId": "ROCKY_TEST_1",
            "totalLimit": 100000,
        },
    ).json["midPool"]
    second_pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "RupayEx",
            "midName": "Rupay secondary",
            "midId": "RUPAY_TEST_1",
            "totalLimit": 100000,
        },
    ).json["midPool"]

    for pool in (first_pool, second_pool):
        assigned = client.post(
            "/api/admin/mid-allocations",
            json={
                "merchantEmail": merchant["email"],
                "midPoolId": pool["_id"],
                "merchantLimit": 50000,
                "commissionPercent": 1.5,
            },
        )
        assert assigned.status_code == 201

    listing = client.get("/api/merchants")
    row = next(
        item
        for item in listing.json["merchants"]
        if item["email"] == merchant["email"]
    )
    assert len(row["gatewayAllocations"]) == 2
    assert {item["gatewayName"] for item in row["gatewayAllocations"]} == {
        "RockyPayz",
        "RupayEx",
    }


def test_admin_reuses_masked_encrypted_gateway_credential_template_for_mid():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "Rocky reusable production",
            "fields": [
                {"key": "apiKey", "value": "rp_live_private_key"},
                {"key": "secretKey", "value": "rp_secret_private_value"},
                {"key": "mode", "value": "production"},
                {
                    "key": "baseUrl",
                    "label": "Base URL",
                    "type": "text",
                    "value": "https://gateway.example.com",
                },
            ],
        },
    )
    assert created.status_code == 201
    template = created.json["template"]
    response_text = created.get_data(as_text=True)
    assert "rp_live_private_key" not in response_text
    assert "rp_secret_private_value" not in response_text
    assert all("value" not in field or field["type"] == "mode" for field in template["fields"])

    with client.application.app_context():
        stored = db.session.get(GatewayCredentialTemplate, int(template["_id"]))
        assert stored is not None
        assert "rp_live_private_key" not in stored.encrypted_values
        assert stored.get_credentials()["baseUrl"] == "https://gateway.example.com"

    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "RockyPayz",
            "midName": "Reusable MID",
            "midId": "ROCKY_REUSABLE_MID",
            "totalLimit": 250000,
            "credentialTemplateId": template["_id"],
        },
    )
    assert pool.status_code == 201
    assert pool.json["midPool"]["credentialTemplateId"] == template["_id"]
    assert pool.json["midPool"]["credentialTemplate"]["name"] == template["name"]

    listing = client.get("/api/admin/gateway-credential-templates")
    listed = next(
        row for row in listing.json["templates"] if row["_id"] == template["_id"]
    )
    assert listed["usageCount"] == 1
    assert client.delete(
        f"/api/admin/gateway-credential-templates/{template['_id']}"
    ).status_code == 409


def test_gateway_template_update_preserves_stored_values_and_validates_custom_keys():
    client = make_client()
    login_admin(client)
    template, _pool = create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="UPDATE",
    )

    invalid = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "Invalid custom key",
            "fields": [
                {
                    "key": "base-url",
                    "label": "Base URL",
                    "type": "text",
                    "value": "https://gateway.example.com",
                }
            ],
        },
    )
    assert invalid.status_code == 400

    updated = client.patch(
        f"/api/admin/gateway-credential-templates/{template['_id']}",
        json={
            "name": "Rocky updated template",
            "fields": [
                {"key": "apiKey", "value": ""},
                {"key": "mode", "value": "production"},
                {
                    "key": "statusRoute",
                    "label": "Status Route",
                    "type": "text",
                    "value": "4",
                },
            ],
        },
    )
    assert updated.status_code == 200
    with client.application.app_context():
        stored = db.session.get(GatewayCredentialTemplate, int(template["_id"]))
        assert stored is not None
        assert stored.get_credentials() == {
            "apiKey": "rockypayz-test-key",
            "mode": "production",
            "statusRoute": "4",
        }


def test_admin_manages_employee_roles_without_employee_dashboard_access():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/admin/employees",
        json={
            "name": "Finance Operator",
            "email": "finance.operator@example.com",
            "password": "strong-pass-123",
            "employeeRoles": ["finance", "support"],
        },
    )
    assert created.status_code == 201
    employee = created.json["employee"]
    assert employee["employeeRoles"] == ["finance", "support"]

    updated = client.patch(
        f"/api/admin/employees/{employee['_id']}",
        json={"employeeRoles": ["technical", "operations", "tech"]},
    )
    assert updated.status_code == 200
    assert updated.json["employee"]["employeeRoles"] == ["operations", "tech"]

    client.post("/api/auth/logout")
    login = client.post(
        "/api/auth/login",
        json={
            "email": "finance.operator@example.com",
            "password": "strong-pass-123",
        },
    )
    assert login.status_code == 403
    assert "not enabled" in login.json["message"].lower()


def test_paybook_customization_uses_real_sample_url_and_image_logo():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Styled Merchant",
            "ownerName": "Styled Owner",
            "email": "styled@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    activate_created_merchant(client, merchant)
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "styled@example.com", "password": "secret123"},
    )
    payment_link = client.post(
        "/api/payment-links",
        json={"title": "Styled order", "amount": 4000},
    ).json["paymentLink"]

    saved = client.patch(
        "/api/merchant/payment-page-settings",
        json={
            "brandName": "Styled Pay",
            "logoImageUrl": "https://cdn.example.com/styled-logo.png",
            "themeMode": "dark",
            "checkoutTitle": "Pay this invoice",
            "payButtonLabel": "Continue with UPI",
        },
    )
    assert saved.status_code == 200
    assert saved.json["settings"]["logoImageUrl"].endswith(".png")
    assert saved.json["settings"]["themeMode"] == "dark"

    settings = client.get("/api/merchant/payment-page-settings")
    assert settings.json["sampleUrl"].startswith("https://www.sinzouae.com/pay/")
    assert settings.json["sampleUrl"].endswith(f"/pay/{payment_link['linkId']}")
    assert "{linkId}" not in settings.json["sampleUrl"]

    public_link = client.get(f"/api/payment-links/{payment_link['linkId']}")
    assert public_link.json["paymentLink"]["paybook"]["checkoutTitle"] == "Pay this invoice"


def test_postgresql_operational_routes_replace_placeholder_responses():
    client = make_client()
    login_admin(client)
    merchant_response = client.post(
        "/api/merchants",
        json={
            "businessName": "Operations Merchant",
            "ownerName": "Operations Owner",
            "email": "operations@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    merchant = activate_created_merchant(client, merchant_response)
    link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": merchant["email"],
            "title": "Operations order",
            "amount": 750,
        },
    ).json["paymentLink"]

    with client.application.app_context():
        transaction = Transaction(
            transaction_id="txn_operations_success",
            payment_link_id=link["linkId"],
            merchant_email=merchant["email"],
            customer_name="Operations Customer",
            customer_email="customer@example.com",
            title="Operations order",
            amount=750,
            currency="INR",
            status="success",
            gateway="Wpay",
        )
        db.session.add(transaction)
        db.session.commit()

    client.post("/api/auth/logout")
    merchant_login = client.post(
        "/api/auth/login",
        json={"email": merchant["email"], "password": "secret123"},
    )
    assert merchant_login.status_code == 200
    refund = client.post(
        "/api/refunds",
        json={
            "transactionId": "txn_operations_success",
            "reason": "Customer requested cancellation",
        },
    )
    assert refund.status_code == 201

    client.post("/api/auth/logout")
    login_admin(client)
    approved = client.patch(
        f"/api/refunds/{refund.json['refund']['refundId']}",
        json={"status": "approved", "adminNote": "Verified"},
    )
    assert approved.status_code == 200
    settlement = client.post(
        "/api/settlements",
        json={
            "merchantEmail": merchant["email"],
            "note": "Operational route test",
        },
    )
    assert settlement.status_code == 201
    assert settlement.json["settlement"]["totalRefundedAmount"] == 750

    mismatches = client.get("/api/admin/mismatches")
    assert mismatches.status_code == 200
    assert any(
        row["transactionId"] == "txn_operations_success"
        for row in mismatches.json["mismatches"]
    )
    fixed = client.post(
        "/api/admin/mismatches/fix",
        json={
            "transactionId": "txn_operations_success",
            "status": "success",
            "adminNote": "Aligned during migration test",
        },
    )
    assert fixed.status_code == 200

    audit = client.get("/api/admin/audit-logs")
    assert audit.status_code == 200
    assert len(audit.json["auditLogs"]) >= 3
    merchant_logs = [
        row
        for row in audit.json["auditLogs"]
        if row["merchantEmail"] == merchant["email"]
    ]
    assert merchant_logs
    assert all(row["merchantName"] == "Operations Merchant" for row in merchant_logs)

    ops_user = client.post(
        "/api/admin/ops-users",
        json={
            "name": "Ops Tester",
            "email": "ops.tester@example.com",
            "password": "strong-pass-123",
        },
    )
    assert ops_user.status_code == 201
    client.post("/api/auth/logout")
    ops_login = client.post(
        "/api/auth/login",
        json={
            "email": "ops.tester@example.com",
            "password": "strong-pass-123",
        },
    )
    assert ops_login.status_code == 200
    dashboard = client.get("/api/ops/dashboard")
    assert dashboard.status_code == 200
    assert "summary" in dashboard.json
    payment_check = client.get("/api/ops/payment-check?q=txn_operations")
    assert payment_check.status_code == 200
    assert len(payment_check.json["transactions"]) == 1


def test_merchant_two_factor_authentication_flow_and_admin_reset():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Secure Merchant",
            "ownerName": "Secure Owner",
            "email": "secure@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    merchant = activate_created_merchant(client, merchant)
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": merchant["email"], "password": "secret123"},
    )

    setup = client.post("/api/merchant/2fa/setup")
    assert setup.status_code == 200
    assert setup.json["qrCodeDataUrl"].startswith("data:image/png;base64,")
    code = pyotp.TOTP(setup.json["secret"]).now()
    verified = client.post("/api/merchant/2fa/verify", json={"code": code})
    assert verified.status_code == 200

    client.post("/api/auth/logout")
    missing_code = client.post(
        "/api/auth/login",
        json={"email": merchant["email"], "password": "secret123"},
    )
    assert missing_code.status_code == 401
    assert missing_code.json["requiresTwoFactor"] is True
    valid_code = pyotp.TOTP(setup.json["secret"]).now()
    logged_in = client.post(
        "/api/auth/login",
        json={
            "email": merchant["email"],
            "password": "secret123",
            "twoFactorCode": valid_code,
        },
    )
    assert logged_in.status_code == 200

    client.post("/api/auth/logout")
    login_admin(client)
    reset = client.post(
        "/api/admin/merchants/reset-2fa",
        json={"merchantEmail": merchant["email"]},
    )
    assert reset.status_code == 200
    client.post("/api/auth/logout")
    login_without_code = client.post(
        "/api/auth/login",
        json={"email": merchant["email"], "password": "secret123"},
    )
    assert login_without_code.status_code == 200


def test_pipe_route_and_usdt_settlement():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Pipe Merchant",
            "ownerName": "Pipe Owner",
            "email": "pipe@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    activate_created_merchant(client, merchant)

    pipe = client.post(
        "/api/admin/pipe-routing",
        json={
            "merchantEmail": "pipe@example.com",
            "gatewayName": "openpay",
            "pipeName": "OpenPay",
            "minAmount": 100,
            "maxAmount": 5000,
            "priority": 1,
        },
    )
    assert pipe.status_code == 200
    assert pipe.json["route"]["priority"] == 1

    usdt = client.post(
        "/api/admin/finance/usdt-settlements",
        json={
            "merchantEmail": "pipe@example.com",
            "inrAmount": 8800,
            "usdtRateInr": 88,
            "network": "TRC20",
        },
    )
    assert usdt.status_code == 200
    assert usdt.json["settlement"]["usdtAmount"] == 100


def test_rockypayz_initiation_and_callback(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Rocky Merchant",
            "ownerName": "Rocky Owner",
            "email": "rocky@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="PAYIN",
        merchant_email="rocky@example.com",
    )

    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "rocky@example.com",
            "title": "Order payment",
            "amount": 499,
            "customerName": "Aarav Mehta",
            "customerEmail": "aarav@example.com",
            "notifyUrl": "https://merchant.example.com/Wpay-callback",
            "callbackSecret": "merchant-test-secret",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]

    provider_calls = []

    def fake_create_order(**kwargs):
        provider_calls.append(kwargs)
        return {
            "status": "True",
            "validity": "One-time use. Valid 15 mins.",
            "msg": "Payment Link Created Successfully",
            "client_txn_id": kwargs["client_txn_id"],
            "payment_url": "https://pay.rockypayz.shop/pay/RTEST123",
        }

    monkeypatch.setattr("backend.routes.create_rockypayz_order", fake_create_order)
    monkeypatch.setattr("backend.routes.extract_upi_intent", lambda _url: "upi://pay?pa=test@upi&am=499")
    delivered = []
    monkeypatch.setattr(
        "backend.routes.send_merchant_payment_callback",
        lambda link, transaction, event="payment.success": delivered.append(
            (link.link_id, transaction.transaction_id, event)
        )
        or {"delivered": True, "response": "ok"},
    )

    initiated = client.post(
        f"/api/payment-links/{link_id}/initiate",
        json={"customerMobile": "9876543210"},
    )
    assert initiated.status_code == 200
    assert initiated.json["expiresInSeconds"] == 300
    assert initiated.json["hostedPaymentUrl"] == "https://pay.rockypayz.shop/pay/RTEST123"
    assert initiated.json["upiLink"] == "upi://pay?pa=test@upi&am=499"
    assert provider_calls[0]["customer_mobile"] == "9876543210"
    assert provider_calls[0]["credentials"]["apiKey"] == "rockypayz-test-key"

    client_txn_id = initiated.json["clientTxnId"]
    callback = client.post(
        "/api/rockypayz/callback",
        json=[
            {
                "Txn_ID": client_txn_id,
                "TXN_amount": "499.00",
                "UTR": "HDFC12345XYZ",
                "TXN_Status": "success",
            }
        ],
    )
    assert callback.status_code == 200
    assert callback.json["paid"] is True
    assert callback.json["transaction"]["utr"] == "HDFC12345XYZ"
    assert callback.json["transaction"]["merchantCallbackStatus"] == "delivered"
    assert delivered == [(link_id, client_txn_id, "payment.success")]

    refreshed = client.get(f"/api/payment-links/{link_id}")
    assert refreshed.json["paymentLink"]["status"] == "paid"


def test_payment_link_status_get_updates_paid_link_from_provider(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Status Merchant",
            "ownerName": "Status Owner",
            "email": "status@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="STATUS",
        merchant_email="status@example.com",
    )

    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "status@example.com",
            "title": "Status order",
            "amount": 999,
            "customerName": "Status Customer",
            "customerEmail": "status@example.net",
            "notifyUrl": "https://merchant.example.com/Wpay-callback",
            "callbackSecret": "merchant-test-secret",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]

    monkeypatch.setattr(
        "backend.routes.create_rockypayz_order",
        lambda **kwargs: {
            "status": "True",
            "client_txn_id": kwargs["client_txn_id"],
            "payment_url": "upi://pay?pa=test@upi&am=999",
        },
    )
    delivered = []
    monkeypatch.setattr(
        "backend.routes.send_merchant_payment_callback",
        lambda link, transaction, event="payment.success": delivered.append(
            (link.link_id, transaction.transaction_id, event)
        )
        or {"delivered": True, "response": "ok"},
    )

    initiated = client.post(f"/api/payment-links/{link_id}/initiate", json={})
    assert initiated.status_code == 200
    client_txn_id = initiated.json["clientTxnId"]

    with client.application.app_context():
        transaction = Transaction.query.filter_by(
            transaction_id=client_txn_id
        ).first()
        stored_link = PaymentLink.query.filter_by(link_id=link_id).first()
        transaction.status = "failed"
        stored_link.status = "failed"
        db.session.commit()

    monkeypatch.setattr(
        "backend.routes.check_rockypayz_order_status",
        lambda *_args, **_kwargs: {
            "Txn_ID": client_txn_id,
            "TXN_Status": "success",
            "UTR": "STATUSUTR123",
        },
    )

    status = client.get(f"/api/payment-links/{link_id}/status?clientTxnId={client_txn_id}")
    assert status.status_code == 200
    assert status.json["success"] is True
    assert status.json["paid"] is True
    assert status.json["status"] == "paid"
    assert status.json["paymentLink"]["status"] == "paid"
    assert status.json["paymentLink"]["transactionId"] == client_txn_id
    assert status.json["paymentLink"]["utr"] == "STATUSUTR123"
    assert "callbackSecret" not in status.json["paymentLink"]
    assert delivered == [(link_id, client_txn_id, "payment.success")]

    refreshed = client.get(f"/api/payment-links/{link_id}")
    assert refreshed.json["paymentLink"]["status"] == "paid"


def test_payin_auto_selection_skips_paused_mid_pool(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Paused Route Merchant",
            "ownerName": "Paused Owner",
            "email": "paused-route@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    _rx_template, rx_pool = create_gateway_template_and_pool(
        client,
        gateway="RupayEx",
        suffix="PAUSEDPAYIN",
        merchant_email="paused-route@example.com",
    )
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="ACTIVEPAYIN",
        merchant_email="paused-route@example.com",
    )
    paused = client.patch(
        f"/api/admin/mid-pools/{rx_pool['_id']}",
        json={"status": "paused"},
    )
    assert paused.status_code == 200

    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "paused-route@example.com",
            "title": "Paused route order",
            "amount": 499,
            "customerName": "Aarav Mehta",
            "customerEmail": "aarav@example.com",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]

    monkeypatch.setattr(
        "backend.routes.create_rockypayz_order",
        lambda **kwargs: {
            "status": "True",
            "client_txn_id": kwargs["client_txn_id"],
            "payment_url": "upi://pay?pa=rocky@upi&am=499",
        },
    )
    initiated = client.post(f"/api/payment-links/{link_id}/initiate", json={})
    assert initiated.status_code == 200
    assert initiated.json["selectedGateway"] == "rockypayz"
    assert initiated.json["paymentTarget"] == "upi://pay?pa=rocky@upi&am=499"


def test_rockypayz_payin_enforces_configured_amount_limits(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Rocky Payin Limit Merchant",
            "ownerName": "Rocky Owner",
            "email": "rocky-payin-limit@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)

    template = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "RockyPayz payin limit test",
            "fields": [
                {
                    "key": "apiKey",
                    "label": "API Key",
                    "type": "secret",
                    "value": "rocky-key",
                },
                {"key": "mode", "label": "Mode", "type": "mode", "value": "production"},
                {
                    "key": "payinMinAmount",
                    "label": "Pay-in Min Amount",
                    "type": "text",
                    "value": "100",
                },
                {
                    "key": "payinMaxAmount",
                    "label": "Pay-in Max Amount",
                    "type": "text",
                    "value": "100000",
                },
            ],
        },
    )
    assert template.status_code == 201
    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "RockyPayz",
            "midName": "RockyPayz payin limited MID",
            "midId": "ROCKY_PAYIN_LIMIT_TEST",
            "totalLimit": 1000000,
            "credentialTemplateId": template.json["template"]["_id"],
        },
    )
    assert pool.status_code == 201
    allocation = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "rocky-payin-limit@example.com",
            "midPoolId": pool.json["midPool"]["_id"],
            "merchantLimit": 100000,
            "commissionPercent": 2,
        },
    )
    assert allocation.status_code == 201

    called = False

    def fake_create_order(**kwargs):
        nonlocal called
        called = True
        return {"payment_url": "upi://pay?pa=rocky@upi&am=50"}

    monkeypatch.setattr("backend.routes.create_rockypayz_order", fake_create_order)
    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "rocky-payin-limit@example.com",
            "title": "Below limit",
            "amount": 50,
            "customerName": "Aarav Mehta",
            "customerEmail": "aarav@example.com",
        },
    )
    assert payment_link.status_code == 201

    initiated = client.post(
        f"/api/payment-links/{payment_link.json['paymentLink']['linkId']}/initiate",
        json={},
    )
    assert initiated.status_code == 400
    assert "between INR 100 and INR 100000" in initiated.json["message"]
    assert called is False


def test_rockypayz_callback_endpoint_is_public():
    client = make_client()
    response = client.get("/api/rockypayz/callback")
    assert response.status_code == 200
    assert response.json["success"] is True


def test_rockypayz_callback_does_not_match_other_provider_transaction():
    client = make_client()

    with client.application.app_context():
        transaction = Transaction(
            transaction_id="SHARED_PROVIDER_REF",
            gateway_transaction_id="SHARED_PROVIDER_REF",
            payment_link_id="plink_shared_provider",
            merchant_email="callback-scope@example.com",
            customer_name="Callback Scope",
            customer_email="scope@example.com",
            title="Callback scope",
            amount=500,
            currency="INR",
            status="pending",
            provider="rupayex",
            gateway="RupayEx Payin",
            paid_at=None,
        )
        db.session.add(transaction)
        db.session.commit()

    callback = client.post(
        "/api/rockypayz/callback",
        json={
            "client_txn_id": "SHARED_PROVIDER_REF",
            "TXN_Status": "success",
            "UTR": "ROCKYSHOULDNOTAPPLY",
        },
    )
    assert callback.status_code == 404

    with client.application.app_context():
        refreshed = Transaction.query.filter_by(
            transaction_id="SHARED_PROVIDER_REF"
        ).first()
        assert refreshed.status == "pending"
        assert refreshed.utr == ""


def test_unknown_failed_provider_callbacks_are_ignored_without_retry():
    client = make_client()

    rocky = client.post(
        "/api/rockypayz/callback",
        json={
            "client_txn_id": "OLD_ROCKY_FAILED_REF",
            "TXN_Status": "Failed",
        },
    )
    assert rocky.status_code == 200
    assert rocky.json["ignored"] is True

    rupayex = client.post(
        "/api/rupayex/callback",
        json={
            "order_id": "OLD_RUPAYEX_FAILED_REF",
            "payment_status": "FAILED",
        },
    )
    assert rupayex.status_code == 200
    assert rupayex.json["ignored"] is True

    alosheell = client.post(
        "/api/alosheell/callback",
        json={
            "merchantTransactionId": "OLD_ALOSHEELL_FAILED_REF",
            "status": "failed",
        },
    )
    assert alosheell.status_code == 200
    assert alosheell.json["ignored"] is True


def test_unknown_successful_provider_callback_still_returns_not_found():
    client = make_client()
    response = client.post(
        "/api/rockypayz/callback",
        json={
            "client_txn_id": "UNKNOWN_SUCCESS_REF",
            "TXN_Status": "success",
        },
    )
    assert response.status_code == 404


def test_rupayex_initiation_and_callback(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "RupayEx Merchant",
            "ownerName": "RupayEx Owner",
            "email": "rupayex@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    create_gateway_template_and_pool(
        client,
        gateway="RupayEx",
        suffix="PAYIN",
        merchant_email="rupayex@example.com",
    )

    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "rupayex@example.com",
            "title": "RupayEx order",
            "amount": 250,
            "customerName": "Aarav Mehta",
            "customerEmail": "aarav@example.com",
            "notifyUrl": "https://merchant.example.com/Wpay-callback",
            "callbackSecret": "merchant-test-secret",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]

    provider_calls = []

    def fake_create_order(**kwargs):
        provider_calls.append(kwargs)
        return {
            "status": True,
            "message": "Order created successfully.",
            "payment_url": "https://paymentpage.shop/pay/RXTEST123",
            "order_id": kwargs["order_id"],
            "amount": 250,
        }

    monkeypatch.setenv("FORCE_PAYIN_GATEWAY", "rupayex")
    monkeypatch.setattr("backend.routes.create_rupayex_order", fake_create_order)
    monkeypatch.setattr(
        "backend.routes.extract_rupayex_upi_intent",
        lambda _url: "upi://pay?pa=rupayex@upi&am=250",
    )
    delivered = []
    monkeypatch.setattr(
        "backend.routes.send_merchant_payment_callback",
        lambda link, transaction, event="payment.success": delivered.append(
            (link.link_id, transaction.transaction_id, event)
        )
        or {"delivered": True, "response": "ok"},
    )

    initiated = client.post(
        f"/api/payment-links/{link_id}/initiate",
        json={},
    )
    assert initiated.status_code == 200
    assert initiated.json["selectedGateway"] == "rupayex"
    assert initiated.json["paymentTarget"] == "upi://pay?pa=rupayex@upi&am=250"
    assert initiated.json["paymentUrl"] == "upi://pay?pa=rupayex@upi&am=250"
    assert initiated.json["upiLink"] == "upi://pay?pa=rupayex@upi&am=250"
    assert initiated.json["qrPayload"] == "upi://pay?pa=rupayex@upi&am=250"
    assert initiated.json["hostedPaymentUrl"] == "https://paymentpage.shop/pay/RXTEST123"
    assert provider_calls[0]["customer_mobile"] == "9999999999"
    assert provider_calls[0]["credentials"]["apiKey"] == "rupayex-test-key"

    order_id = initiated.json["clientTxnId"]
    callback = client.post(
        "/api/rupayex/callback",
        json={
            "order_id": order_id,
            "amount": "250.00",
            "status": "SUCCESS",
            "utr": "RXUTR12345",
        },
    )
    assert callback.status_code == 200
    assert callback.json["paid"] is True
    assert callback.json["transaction"]["provider"] == "rupayex"
    assert callback.json["transaction"]["utr"] == "RXUTR12345"
    assert delivered == [(link_id, order_id, "payment.success")]

    refreshed = client.get(f"/api/payment-links/{link_id}")
    assert refreshed.json["paymentLink"]["status"] == "paid"


def test_rupayex_extracts_upi_intent_from_checkout_html(monkeypatch):
    from backend import rupayex

    monkeypatch.setattr(
        rupayex,
        "_get_text",
        lambda _url: '<img src="https://api.qrserver.com/v1/create-qr-code/?data=upi%3A%2F%2Fpay%3Fpa%3Dmerchant%40upi%26am%3D250" />',
    )

    assert (
        rupayex.extract_upi_intent("https://paymentpage.shop/pay/RXTEST123")
        == "upi://pay?pa=merchant@upi&am=250"
    )


def test_alosheell_selected_mid_initiation_and_callback(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Alosheell Merchant",
            "ownerName": "Alosheell Owner",
            "email": "alosheell@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="ALOROCKY",
        merchant_email="alosheell@example.com",
    )
    create_gateway_template_and_pool(
        client,
        gateway="Alosheell",
        suffix="PAYIN",
        merchant_email="alosheell@example.com",
    )

    allocations = client.get("/api/admin/mid-allocations")
    alosheell_allocation = next(
        row
        for row in allocations.json["allocations"]
        if row["merchantEmail"] == "alosheell@example.com"
        and row["gatewayName"] == "Alosheell"
    )
    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "alosheell@example.com",
            "title": "Alosheell order",
            "amount": 500,
            "customerName": "Aarav Mehta",
            "customerEmail": "aarav@example.com",
            "merchantMidAllocationId": alosheell_allocation["_id"],
        },
    )
    assert payment_link.status_code == 201
    assert payment_link.json["paymentLink"]["merchantMidLabel"] == "MID 2"
    link_id = payment_link.json["paymentLink"]["linkId"]

    provider_calls = []

    def fake_create_order(**kwargs):
        provider_calls.append(kwargs)
        return {
            "upiLink": "upi://pay?pa=alosheell@upi&am=500",
            "gatewayResponse": {
                "data": {
                    "data": {
                        "merchantTransactionId": "ALOSHEELL_TXN_1",
                    }
                }
            },
        }

    monkeypatch.setattr("backend.routes.create_alosheell_order", fake_create_order)
    initiated = client.post(
        f"/api/payment-links/{link_id}/initiate",
        json={"customerMobile": "9876543210"},
    )
    assert initiated.status_code == 200
    assert initiated.json["selectedGateway"] == "alosheell"
    assert initiated.json["upiLink"] == "upi://pay?pa=alosheell@upi&am=500"
    assert provider_calls[0]["customer_mobile"] == "9876543210"

    callback = client.post(
        "/api/alosheell/callback",
        json={
            "merchantTransactionId": "ALOSHEELL_TXN_1",
            "amount": "500.00",
            "utr": "ALO123456",
            "status": "success",
        },
    )
    assert callback.status_code == 200
    assert callback.json["paid"] is True
    assert callback.json["transaction"]["provider"] == "alosheell"
    assert callback.json["transaction"]["utr"] == "ALO123456"


def test_alosheell_create_order_sends_provider_amount_without_trailing_decimals(monkeypatch):
    from backend import alosheell

    captured = {}

    def fake_post_json(url, body, *, proxy_secret=""):
        captured["url"] = url
        captured["body"] = body
        captured["proxy_secret"] = proxy_secret
        return {
            "upiLink": "upi://pay?pa=alosheell@upi&am=300",
            "gatewayResponse": {
                "data": {
                    "data": {
                        "merchantTransactionId": "ALOSHEELL_TXN_AMOUNT",
                    }
                }
            },
        }

    monkeypatch.setattr(alosheell, "_post_json", fake_post_json)

    response = alosheell.create_order(
        client_reference_no="ALOTESTAMOUNT",
        amount=300,
        customer_name="Test Customer",
        customer_email="test@example.com",
        customer_mobile="9999999999",
        credentials={
            "proxyUrl": "https://proxy.example.com/payin",
            "proxySecret": "proxy-secret",
            "userIp": "145.223.23.93",
        },
    )

    assert captured["body"]["amount"] == "300"
    assert alosheell.payment_target(response) == "upi://pay?pa=alosheell@upi&am=300"


def test_alosheell_direct_payin_uses_token_and_documented_form_fields(monkeypatch):
    from backend import alosheell

    calls = []

    def fake_post_form(url, body, *, authorization=""):
        calls.append(
            {
                "url": url,
                "body": body,
                "authorization": authorization,
            }
        )
        if url.endswith("/generateToken"):
            return {"status": True, "data": {"token": "provider-token"}}
        return {
            "status": True,
            "data": {
                "url": "upi://pay?pa=alosheell@upi&am=300",
                "merchantTransactionId": "ALO-DIRECT-1",
            },
        }

    monkeypatch.setattr(alosheell, "_post_form", fake_post_form)
    monkeypatch.delenv("ALOSHEELL_PROXY_URL", raising=False)

    response = alosheell.create_order(
        client_reference_no="ALO-DIRECT-REF",
        amount=300,
        customer_name="Test Customer",
        customer_email="test@example.com",
        customer_mobile="9999999999",
        credentials={
            "proxyUrl": "",
            "tokenUrl": "https://apipanel.alosheell.com/auth/user/generateToken",
            "payinApiUrl": "https://apipanel.alosheell.com/api/v1/Payin",
            "loginId": "8827095122",
            "password": "secret",
            "tokenKey": "ip-bound-token",
            "userIp": "216.97.238.155",
        },
    )

    assert calls == [
        {
            "url": "https://apipanel.alosheell.com/auth/user/generateToken",
            "body": {
                "user_name": "8827095122",
                "password": "secret",
            },
            "authorization": "ip-bound-token",
        },
        {
            "url": "https://apipanel.alosheell.com/api/v1/Payin",
            "body": {
                "clientReferenceNo": "ALO-DIRECT-REF",
                "amount": "300",
                "customer_name": "Test Customer",
                "customer_email": "test@example.com",
                "customer_mobile": "9999999999",
                "user_ip": "216.97.238.155",
                "option": "INTENT",
                "token_key": "ip-bound-token",
            },
            "authorization": "provider-token",
        },
    ]
    assert alosheell.payment_target(response).startswith("upi://pay?")


def test_gateway_http_uses_configured_outbound_proxy(monkeypatch):
    from backend import gateway_http

    calls = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    class FakeOpener:
        def open(self, request, timeout):
            calls.append(
                (
                    "open",
                    request.full_url,
                    timeout,
                    request.get_header("Proxy-authorization"),
                )
            )
            return FakeResponse()

    def fake_build_opener(handler):
        calls.append(("handler", handler.proxies))
        return FakeOpener()

    monkeypatch.setenv(
        "GATEWAY_OUTBOUND_PROXY_URL",
        "http://proxy-user:proxy-pass@proxy.example.com:12323",
    )
    monkeypatch.setattr(gateway_http, "build_opener", fake_build_opener)

    request = gateway_http.Request("https://provider.example.com/status")
    with gateway_http.open_gateway_url(request, timeout=17):
        pass

    assert calls == [
        (
            "handler",
            {
                "http": "http://proxy.example.com:12323",
                "https": "http://proxy.example.com:12323",
            },
        ),
        (
            "open",
            "https://provider.example.com/status",
            17,
            "Basic cHJveHktdXNlcjpwcm94eS1wYXNz",
        ),
    ]


def test_gateway_http_uses_direct_connection_without_proxy(monkeypatch):
    from backend import gateway_http

    calls = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, timeout))
        return FakeResponse()

    monkeypatch.delenv("GATEWAY_OUTBOUND_PROXY_URL", raising=False)
    monkeypatch.setattr(gateway_http, "urlopen", fake_urlopen)

    request = gateway_http.Request("https://provider.example.com/status")
    with gateway_http.open_gateway_url(request, timeout=11):
        pass

    assert calls == [("https://provider.example.com/status", 11)]


def test_pending_transaction_has_no_paid_timestamp():
    client = make_client()
    app = client.application

    with app.app_context():
        transaction = Transaction(
            transaction_id="PENDING_WITHOUT_PAID_AT",
            payment_link_id="plink_pending_timestamp",
            merchant_email="merchant@example.com",
            amount=10,
            status="pending",
        )
        db.session.add(transaction)
        db.session.commit()

        assert transaction.paid_at is None
        assert transaction.to_dict()["paidAt"] is None


def test_alosheell_direct_payout_uses_token_and_documented_form_fields(monkeypatch):
    from backend import alosheell

    monkeypatch.delenv("ALOSHEELL_PAYOUT_PROXY_URL", raising=False)
    monkeypatch.delenv("ALOSHEELL_PAYOUT_PROXY_SECRET", raising=False)

    calls = []

    def fake_post_form(url, body, *, authorization=""):
        calls.append({"url": url, "body": body, "authorization": authorization})
        if url.endswith("/generateToken"):
            return {
                "status": True,
                "data": {"token": "generated-jwt-token"},
                "message": "Token Generated Successfully",
            }
        return {
            "timestamp": "20230722210527",
            "status": True,
            "data": {
                "status": "success",
                "message": "Transfer request pending at the bank",
                "data": {
                    "clientTransid": "T5111",
                    "merchantid": "PLCT210525",
                    "status": "PENDING",
                    "referenceId": "1149",
                    "utrNo": "",
                },
            },
        }

    monkeypatch.setattr(alosheell, "_post_form", fake_post_form)

    response = alosheell.submit_payout(
        payout_id="pout_test_1",
        amount=100,
        beneficiary_name="Test Beneficiary",
        account_number="401705000777",
        ifsc="ICIC0004017",
        bank_name="ICICI Bank",
        beneficiary_mobile="9999999999",
        callback_url="https://www.sinzouae.com/api/alosheell/payout-callback",
        credentials={
            "loginId": "8827095122",
            "password": "alo-password",
            "tokenKey": "token-key-123",
            "tokenUrl": "https://apipanel.alosheell.com/auth/user/generateToken",
            "payoutApiUrl": "https://apipanel.alosheell.com/auth/payout/payoutApi",
            "fundTransferType": "imps",
            "lat": "22.8031731",
            "long": "22.8031731",
        },
    )

    assert calls[0] == {
        "url": "https://apipanel.alosheell.com/auth/user/generateToken",
        "body": {"user_name": "8827095122", "password": "alo-password"},
        "authorization": "token-key-123",
    }
    assert calls[1]["url"] == "https://apipanel.alosheell.com/auth/payout/payoutApi"
    assert calls[1]["authorization"] == "generated-jwt-token"
    assert calls[1]["body"] == {
        "beneName": "Test Beneficiary",
        "beneAccountNo": "401705000777",
        "beneifsc": "ICIC0004017",
        "benePhoneNo": "9999999999",
        "beneBankName": "ICICI Bank",
        "clientReferenceNo": "pout_test_1",
        "amount": 100.0,
        "fundTransferType": "imps",
        "token_key": "token-key-123",
        "lat": "22.8031731",
        "remarks": "Wpay payout",
        "long": "22.8031731",
        "callbackUrl": "https://www.sinzouae.com/api/alosheell/payout-callback",
    }
    assert response["data"]["data"]["referenceId"] == "1149"
    assert alosheell.payout_provider_reference(response) == "1149"
    assert alosheell.payout_status(response) == "processing"
    assert (
        alosheell.payout_status(
            {
                "StatusCode": "02",
                "status": False,
                "data": {"status": "error", "message": "Invaild API Key"},
            }
        )
        == "failed"
    )


def test_alosheell_payout_callback_top_level_provider_fields():
    from backend import alosheell

    payload = {
        "clientTransid": "pout_1782980437_762ca458",
        "merchantid": "RB9548974363",
        "status": "TRANSFER_SUCCESS",
        "referenceId": "provider-reference",
        "utrNo": "618325067534",
    }

    assert alosheell.payout_reference(payload) == "pout_1782980437_762ca458"
    assert alosheell.payout_provider_reference(payload) == "RB9548974363"
    assert alosheell.payout_status(payload) == "paid"
    assert alosheell.transaction_utr(payload) == "618325067534"


def test_alosheell_payout_uses_configured_proxy(monkeypatch):
    from backend import alosheell

    calls = []

    def fake_post_json(url, body, *, proxy_secret=""):
        calls.append({"url": url, "body": body, "proxy_secret": proxy_secret})
        return {
            "status": True,
            "data": {
                "status": "success",
                "data": {"referenceId": "PX1149", "status": "PENDING"},
            },
        }

    monkeypatch.setattr(alosheell, "_post_json", fake_post_json)
    monkeypatch.setattr(
        alosheell,
        "_post_form",
        lambda *args, **kwargs: pytest.fail("direct Alosheell form API should not be called"),
    )

    response = alosheell.submit_payout(
        payout_id="pout_proxy_1",
        amount=100,
        beneficiary_name="Test Beneficiary",
        account_number="401705000777",
        ifsc="ICIC0004017",
        bank_name="ICICI Bank",
        beneficiary_mobile="9999999999",
        callback_url="https://www.sinzouae.com/api/alosheell/payout-callback",
        credentials={
            "loginId": "8827095122",
            "password": "password",
            "tokenKey": "token-key-123",
            "payoutProxyUrl": "http://145.223.23.93:4030/payout",
            "payoutProxySecret": "proxy-secret",
        },
    )

    assert response["data"]["data"]["referenceId"] == "PX1149"
    assert calls == [
        {
            "url": "http://145.223.23.93:4030/payout",
            "proxy_secret": "proxy-secret",
            "body": {
                "beneName": "Test Beneficiary",
                "beneAccountNo": "401705000777",
                "beneifsc": "ICIC0004017",
                "benePhoneNo": "9999999999",
                "beneBankName": "ICICI Bank",
                "clientReferenceNo": "pout_proxy_1",
                "amount": 100.0,
                "fundTransferType": "imps",
                "token_key": "token-key-123",
                "lat": "22.8031731",
                "remarks": "Wpay payout",
                "long": "22.8031731",
                "callbackUrl": "https://www.sinzouae.com/api/alosheell/payout-callback",
            },
        }
    ]


def test_alosheell_callback_rejects_amount_mismatch(monkeypatch):
    client = make_client()
    login_admin(client)

    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Alosheell Guard Merchant",
            "ownerName": "Alosheell Guard",
            "email": "aloguard@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "secret123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    create_gateway_template_and_pool(
        client,
        gateway="Alosheell",
        suffix="GUARD",
        merchant_email="aloguard@example.com",
    )
    link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "aloguard@example.com",
            "title": "Guard order",
            "amount": 500,
            "customerName": "Guard Customer",
            "customerEmail": "guard@example.com",
        },
    )
    link_id = link.json["paymentLink"]["linkId"]

    monkeypatch.setattr(
        "backend.routes.create_alosheell_order",
        lambda **_kwargs: {"upiLink": "upi://pay?pa=guard@upi&am=500"},
    )
    initiated = client.post(
        f"/api/payment-links/{link_id}/initiate",
        json={"customerMobile": "9876543210"},
    )
    assert initiated.status_code == 200
    tx_id = initiated.json["clientTxnId"]

    callback = client.post(
        "/api/alosheell/callback",
        json={
            "merchantTransactionId": tx_id,
            "amount": "300.00",
            "status": "success",
        },
    )
    assert callback.status_code == 200
    assert callback.json["paid"] is False
    assert callback.json["transaction"]["status"] == "failed"
    assert callback.json["transaction"]["merchantCallbackStatus"] == "blocked"


def test_merchant_can_send_signed_test_webhook(monkeypatch):
    client = make_client()
    login_admin(client)
    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Test Merchant",
            "ownerName": "Test Merchant",
            "email": "test@merchant.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "test@merchant.com",
            "title": "Merchant webhook test",
            "amount": 100,
            "notifyUrl": "https://merchant.example.com/Wpay-callback",
            "callbackSecret": "merchant-secret",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]

    calls = []
    monkeypatch.setattr(
        "backend.routes.send_merchant_payment_callback",
        lambda link, transaction, event="payment.success": calls.append(event)
        or {"delivered": True, "httpStatus": 200, "response": "accepted"},
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "TEST@MERCHANT.COM", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    delivery = client.post("/api/merchant/webhooks/test", json={"linkId": link_id})
    assert delivery.status_code == 200
    assert delivery.json["success"] is True
    assert delivery.json["transaction"]["merchantCallbackStatus"] == "delivered"
    assert calls == ["payment.test"]


def test_callback_test_receiver_validates_Wpay_signature():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Callback Merchant",
            "ownerName": "Callback Owner",
            "email": "merchant@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)
    payment_link = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "merchant@example.com",
            "title": "Signed callback",
            "amount": 100,
            "callbackSecret": "signed-callback-secret",
        },
    )
    link_id = payment_link.json["paymentLink"]["linkId"]
    body = json.dumps(
        {"event": "payment.test", "brand": "Wpay", "linkId": link_id},
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    signature = callback_signature("signed-callback-secret", body)

    response = client.post(
        "/api/test/merchant-callback",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Wpay-Signature": signature,
        },
    )
    assert response.status_code == 200
    assert response.json["brand"] == "Wpay"


def test_payment_link_accepts_common_callback_url_aliases():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Alias Callback Merchant",
            "ownerName": "Alias Owner",
            "email": "alias-callback@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)

    created = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "alias-callback@example.com",
            "title": "ORDER-CALLBACK-ALIAS",
            "amount": 100,
            "currency": "INR",
            "customerName": "Callback Tester",
            "customerEmail": "callback@example.com",
            "webhookUrl": "https://merchant.example.com/Wpay/payments",
            "callbackSecret": "callback-alias-secret",
        },
    )

    assert created.status_code == 201
    payment_link = created.json["paymentLink"]
    assert payment_link["notifyUrl"] == "https://merchant.example.com/Wpay/payments"
    assert payment_link["callbackSecret"] == "callback-alias-secret"


def test_payment_callback_payload_matches_end_to_end_script_contract():
    from backend.routes import merchant_callback_payload

    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Payload Callback Merchant",
            "ownerName": "Payload Owner",
            "email": "payload-callback@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert merchant.status_code == 201
    activate_created_merchant(client, merchant)

    created = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "payload-callback@example.com",
            "title": "ORDER-202607010001",
            "amount": 100,
            "currency": "INR",
            "customerName": "Test Customer",
            "customerEmail": "test@gmail.com",
            "callbackSecret": "payload-callback-secret",
        },
    )
    assert created.status_code == 201
    link_id = created.json["paymentLink"]["linkId"]

    with client.application.app_context():
        link = PaymentLink.query.filter_by(link_id=link_id).first()
        transaction = Transaction(
            transaction_id="GP1782653099FADA2E",
            payment_link_id=link_id,
            merchant_email="payload-callback@example.com",
            customer_name="Test Customer",
            customer_email="test@gmail.com",
            title="ORDER-202607010001",
            amount=100,
            currency="INR",
            status="success",
            utr="601321087819",
        )
        payload = merchant_callback_payload(link, transaction, "payment.success")

    assert payload["event"] == "payment.success"
    assert payload["status"] == "SUCCESS"
    assert payload["success"] is True
    assert payload["merchantOrderId"] == "ORDER-202607010001"
    assert payload["linkId"] == link_id
    assert payload["paymentLinkId"] == link_id
    assert payload["transactionId"] == "GP1782653099FADA2E"
    assert payload["amount"] == 100.0
    assert payload["currency"] == "INR"
    assert payload["customerName"] == "Test Customer"
    assert payload["customerEmail"] == "test@gmail.com"
    assert payload["utr"] == "601321087819"

    raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    signature = callback_signature("payload-callback-secret", raw_body)
    assert hmac.compare_digest(
        signature,
        hmac.new(
            b"payload-callback-secret",
            raw_body,
            digestmod="sha256",
        ).hexdigest(),
    )


def test_rockypayz_payout_request_submit_status_and_callback(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Payout Merchant",
            "ownerName": "Payout Owner",
            "email": "payout@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="PAYOUT",
        merchant_email="payout@example.com",
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "payout@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200
    webhook_settings = client.patch(
        "/api/merchant/webhook-settings",
        json={"payoutWebhookUrl": "https://merchant.example.com/Wpay/payouts"},
    )
    assert webhook_settings.status_code == 200
    login_admin(client)

    submitted_payloads = []

    def fake_submit_payout(**kwargs):
        submitted_payloads.append(kwargs)
        return {
            "statuscode": "TXN",
            "message": "Transfer accepted",
            "data": {
                "TXN_ID": kwargs["payout_id"],
                "status": "processing",
            },
        }

    monkeypatch.setattr(
        "backend.routes.submit_rockypayz_provider_payout", fake_submit_payout
    )
    delivered_callbacks = []
    monkeypatch.setattr(
        "backend.routes.deliver_callback",
        lambda url, secret, payload: delivered_callbacks.append((url, secret, payload))
        or {"delivered": True, "httpStatus": 200, "response": "accepted"},
    )
    payout = client.post(
        "/api/admin/finance/payouts",
        json={
            "merchantEmail": "payout@example.com",
            "amount": 1500,
            "beneficiaryName": "Payout Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
            "note": "test payout",
        },
    )
    assert payout.status_code == 201
    payout_id = payout.json["payout"]["payoutId"]
    assert payout.json["payout"]["provider"] == "rockypayz"
    assert payout.json["payout"]["status"] == "processing"
    assert submitted_payloads[0]["customer_mobile"] == "9876543210"

    monkeypatch.setattr(
        "backend.routes.check_rockypayz_payout_status",
        lambda _reference, **_kwargs: {
            "status": True,
            "data": {
                "TXN_ID": payout_id,
                "UTR": "601321087819",
                "status": "success",
            },
        },
    )
    status = client.post(f"/api/admin/finance/payouts/{payout_id}/rockypayz-status")
    assert status.status_code == 200
    assert status.json["payout"]["status"] == "paid"
    assert status.json["payout"]["utr"] == "601321087819"
    assert status.json["payout"]["merchantCallbackStatus"] == "delivered"
    assert delivered_callbacks[0][0] == "https://merchant.example.com/Wpay/payouts"
    assert delivered_callbacks[0][2]["event"] == "payout.success"
    assert delivered_callbacks[0][2]["payoutId"] == payout_id

    callback = client.post(
        "/api/rockypayz/payout-callback",
        json=[
            {
                "Txn_ID": payout_id,
                "TXN_amount": "1500.00",
                "UTR": "HDFC12345XYZ",
                "TXN_Status": "success",
            }
        ],
    )
    assert callback.status_code == 200
    assert callback.json["paid"] is True
    assert callback.json["payout"]["utr"] == "HDFC12345XYZ"
    assert len(delivered_callbacks) == 1


def test_rupayex_payout_submit_and_status(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "RupayEx Payout Merchant",
            "ownerName": "RupayEx Payout Owner",
            "email": "rxpayout@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)
    create_gateway_template_and_pool(
        client,
        gateway="RupayEx",
        suffix="PAYOUT",
        merchant_email="rxpayout@example.com",
    )

    submitted_payloads = []

    def fake_submit_payout(**kwargs):
        submitted_payloads.append(kwargs)
        return {
            "status": True,
            "message": "Payout request created",
            "payout_id": kwargs["payout_id"],
            "payment_status": "PROCESSING",
        }

    monkeypatch.setattr("backend.routes.submit_rupayex_payout", fake_submit_payout)
    payout = client.post(
        "/api/admin/finance/payouts",
        json={
            "merchantEmail": "rxpayout@example.com",
            "amount": 1200,
            "beneficiaryName": "RX Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
            "note": "test rupayex payout",
        },
    )
    assert payout.status_code == 201
    payout_id = payout.json["payout"]["payoutId"]
    assert payout.json["payout"]["provider"] == "rupayex"
    assert payout.json["payout"]["status"] == "processing"
    assert submitted_payloads[0]["ifsc"] == "HDFC0001234"

    monkeypatch.setattr(
        "backend.routes.check_rupayex_payout_status",
        lambda _reference, **_kwargs: {
            "status": True,
            "payout_id": payout_id,
            "payment_status": "SUCCESS",
            "utr": "RX601321087819",
        },
    )
    status = client.post(f"/api/admin/finance/payouts/{payout_id}/rupayex-status")
    assert status.status_code == 200
    assert status.json["payout"]["status"] == "paid"
    assert status.json["payout"]["utr"] == "RX601321087819"


def test_merchant_payout_is_submitted_directly_to_active_gateway(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Direct Payout Merchant",
            "ownerName": "Direct Owner",
            "email": "direct-payout@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="DIRECTPAYOUT",
        merchant_email="direct-payout@example.com",
    )

    submitted_payloads = []

    def fake_submit_payout(**kwargs):
        submitted_payloads.append(kwargs)
        return {
            "status": "success",
            "ref_no": kwargs["payout_id"],
            "UTR": "DIRECTUTR123",
        }

    monkeypatch.setattr(
        "backend.routes.submit_rockypayz_provider_payout",
        fake_submit_payout,
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "direct-payout@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    payout = client.post(
        "/api/merchant/payouts",
        json={
            "amount": 850,
            "beneficiaryName": "Direct Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
            "note": "merchant proxy payout",
        },
    )
    assert payout.status_code == 201
    assert payout.json["selectedGateway"] == "rockypayz"
    assert payout.json["payout"]["provider"] == "rockypayz"
    assert payout.json["payout"]["status"] == "paid"
    assert payout.json["payout"]["utr"] == "DIRECTUTR123"
    assert submitted_payloads[0]["account_number"] == "123456789012"
    assert len(submitted_payloads[0]["payout_id"]) < 20
    assert submitted_payloads[0]["payout_id"].startswith("R")
    assert payout.json["payout"]["providerTxnId"] == submitted_payloads[0]["payout_id"]


def test_merchant_payout_skips_disabled_payout_pipe(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Routed Payout Merchant",
            "ownerName": "Routed Owner",
            "email": "routed-payout@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    disabled_template = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "Alosheell payout disabled",
            "fields": [
                {"key": "apiKey", "label": "API Key", "type": "secret", "value": "alo-key"},
                {"key": "mode", "label": "Mode", "type": "mode", "value": "production"},
                {"key": "loginId", "label": "Login ID", "type": "text", "value": "8827095122"},
                {"key": "password", "label": "Password", "type": "secret", "value": "alo-password"},
                {"key": "tokenKey", "label": "Token Key", "type": "secret", "value": "alo-token-key"},
                {
                    "key": "payoutApiUrl",
                    "label": "Payout API URL",
                    "type": "text",
                    "value": "https://apipanel.alosheell.com/auth/payout/payoutApi",
                },
                {
                    "key": "payoutProxyUrl",
                    "label": "Payout Proxy URL",
                    "type": "text",
                    "value": "https://proxy.example.com/payout",
                },
                {
                    "key": "payoutEnabled",
                    "label": "Payout Enabled",
                    "type": "text",
                    "value": "false",
                },
            ],
        },
    )
    assert disabled_template.status_code == 201
    disabled_pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "Alosheell",
            "midName": "Alosheell disabled payout MID",
            "midId": "ALOSHEELL_DISABLED_PAYOUT",
            "totalLimit": 100000,
            "credentialTemplateId": disabled_template.json["template"]["_id"],
        },
    )
    assert disabled_pool.status_code == 201
    disabled_allocation = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "routed-payout@example.com",
            "midPoolId": disabled_pool.json["midPool"]["_id"],
            "merchantLimit": 50000,
            "commissionPercent": 1,
        },
    )
    assert disabled_allocation.status_code == 201

    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="PAYOUTFALLBACK",
        merchant_email="routed-payout@example.com",
    )

    submitted_payloads = []

    def fake_submit_payout(**kwargs):
        submitted_payloads.append(kwargs)
        return {
            "status": "success",
            "ref_no": kwargs["payout_id"],
            "UTR": "ROUTEDUTR123",
        }

    monkeypatch.setattr(
        "backend.routes.submit_rockypayz_provider_payout",
        fake_submit_payout,
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "routed-payout@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    payout = client.post(
        "/api/merchant/payouts",
        json={
            "amount": 850,
            "beneficiaryName": "Routed Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
        },
    )
    assert payout.status_code == 201
    assert payout.json["selectedGateway"] == "rockypayz"
    assert payout.json["payout"]["status"] == "paid"
    assert submitted_payloads

    with client.application.app_context():
        before_count = Payout.query.count()
    explicit_disabled = client.post(
        "/api/merchant/payouts",
        json={
            "amount": 850,
            "beneficiaryName": "Routed Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
            "merchantMidAllocationId": disabled_allocation.json["allocation"]["_id"],
        },
    )
    assert explicit_disabled.status_code == 503
    assert "not enabled for payouts" in explicit_disabled.json["message"]
    with client.application.app_context():
        assert Payout.query.count() == before_count


def test_mid_pool_and_allocation_direction_statuses_gate_routing():
    from backend.routes import selected_payin_context, selected_payout_context

    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Directional MID Merchant",
            "ownerName": "Directional Owner",
            "email": "directional@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="DIRECTIONAL",
        merchant_email="directional@example.com",
    )

    with client.application.app_context():
        route = PipeRoute.query.filter_by(merchant_email="directional@example.com").first()
        assert route is not None
        pool = db.session.get(MidPool, int(route.mid_pool_id))
        assert pool is not None
        link = PaymentLink(
            link_id="plink_directional_status",
            merchant_email="directional@example.com",
            title="Directional status",
            amount=850,
            currency="INR",
            status="active",
        )
        db.session.add(link)
        db.session.commit()

        route.payin_status = "paused"
        route.payout_status = "active"
        pool.payin_status = "paused"
        pool.payout_status = "active"
        db.session.commit()

        with pytest.raises(CredentialEncryptionError):
            selected_payin_context(link)
        payout_gateway, payout_pool, _credentials = selected_payout_context(
            "directional@example.com",
            850,
        )
        assert payout_gateway == "rockypayz"
        assert payout_pool.id == pool.id

        route.payin_status = "active"
        route.payout_status = "paused"
        pool.payin_status = "active"
        pool.payout_status = "paused"
        db.session.commit()

        payin_gateway, payin_pool, _credentials = selected_payin_context(link)
        assert payin_gateway == "rockypayz"
        assert payin_pool.id == pool.id
        with pytest.raises(CredentialEncryptionError):
            selected_payout_context("directional@example.com", 850)


def test_rockypayz_merchant_payout_enforces_configured_amount_limits(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Rocky Limit Merchant",
            "ownerName": "Rocky Owner",
            "email": "rocky-limit@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    template = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "RockyPayz payout limit test",
            "fields": [
                {
                    "key": "apiKey",
                    "label": "API Key",
                    "type": "secret",
                    "value": "rocky-key",
                },
                {"key": "mode", "label": "Mode", "type": "mode", "value": "production"},
                {
                    "key": "payoutMinAmount",
                    "label": "Payout Min Amount",
                    "type": "text",
                    "value": "100",
                },
                {
                    "key": "payoutMaxAmount",
                    "label": "Payout Max Amount",
                    "type": "text",
                    "value": "50000",
                },
            ],
        },
    )
    assert template.status_code == 201
    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "RockyPayz",
            "midName": "RockyPayz payout limited MID",
            "midId": "ROCKY_LIMIT_TEST",
            "totalLimit": 1000000,
            "credentialTemplateId": template.json["template"]["_id"],
        },
    )
    assert pool.status_code == 201
    allocation = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "rocky-limit@example.com",
            "midPoolId": pool.json["midPool"]["_id"],
            "merchantLimit": 100000,
            "commissionPercent": 2,
        },
    )
    assert allocation.status_code == 201

    called = False

    def fake_submit_payout(**kwargs):
        nonlocal called
        called = True
        return {"status": "success"}

    monkeypatch.setattr(
        "backend.routes.submit_rockypayz_provider_payout",
        fake_submit_payout,
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "rocky-limit@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    payout = client.post(
        "/api/merchant/payouts",
        json={
            "amount": 75000,
            "beneficiaryName": "Rocky Limit",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
        },
    )
    assert payout.status_code == 400
    assert "between INR 100 and INR 50000" in payout.json["message"]
    assert called is False


def test_alosheell_merchant_payout_enforces_configured_amount_limits(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Alosheell Limit Merchant",
            "ownerName": "Alosheell Owner",
            "email": "alo-limit@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    template = client.post(
        "/api/admin/gateway-credential-templates",
        json={
            "name": "Alosheell payout limit test",
            "fields": [
                {"key": "apiKey", "label": "API Key", "type": "secret", "value": "alo-key"},
                {"key": "mode", "label": "Mode", "type": "mode", "value": "production"},
                {"key": "loginId", "label": "Login ID", "type": "text", "value": "8827095122"},
                {"key": "password", "label": "Password", "type": "secret", "value": "alo-password"},
                {"key": "tokenKey", "label": "Token Key", "type": "secret", "value": "alo-token-key"},
                {
                    "key": "payoutApiUrl",
                    "label": "Payout API URL",
                    "type": "text",
                    "value": "https://apipanel.alosheell.com/auth/payout/payoutApi",
                },
                {
                    "key": "payoutProxyUrl",
                    "label": "Payout Proxy URL",
                    "type": "text",
                    "value": "https://proxy.example.com/payout",
                },
                {
                    "key": "payoutProxySecret",
                    "label": "Payout Proxy Secret",
                    "type": "secret",
                    "value": "proxy-secret",
                },
                {
                    "key": "payoutMinAmount",
                    "label": "Payout Min Amount",
                    "type": "text",
                    "value": "100",
                },
                {
                    "key": "payoutMaxAmount",
                    "label": "Payout Max Amount",
                    "type": "text",
                    "value": "40000",
                },
            ],
        },
    )
    assert template.status_code == 201

    pool = client.post(
        "/api/admin/mid-pools",
        json={
            "gatewayName": "Alosheell",
            "midName": "Alosheell payout limited MID",
            "midId": "ALOSHEELL_LIMIT_TEST",
            "totalLimit": 1000000,
            "credentialTemplateId": template.json["template"]["_id"],
        },
    )
    assert pool.status_code == 201
    allocation = client.post(
        "/api/admin/mid-allocations",
        json={
            "merchantEmail": "alo-limit@example.com",
            "midPoolId": pool.json["midPool"]["_id"],
            "merchantLimit": 100000,
            "commissionPercent": 2.18,
        },
    )
    assert allocation.status_code == 201

    called = False

    def fake_submit_payout(**kwargs):
        nonlocal called
        called = True
        return {"status": "success"}

    monkeypatch.setattr("backend.routes.submit_alosheell_payout", fake_submit_payout)

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "alo-limit@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    payout = client.post(
        "/api/merchant/payouts",
        json={
            "amount": 45000,
            "beneficiaryName": "Limit Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
        },
    )
    assert payout.status_code == 400
    assert "between INR 100 and INR 40000" in payout.json["message"]
    assert called is False


def test_alosheell_payout_submit_and_callback(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Alosheell Payout Merchant",
            "ownerName": "Alosheell Payout Owner",
            "email": "alopayout@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)
    create_gateway_template_and_pool(
        client,
        gateway="Alosheell",
        suffix="PAYOUT",
        merchant_email="alopayout@example.com",
    )

    submitted_payloads = []

    def fake_submit_payout(**kwargs):
        submitted_payloads.append(kwargs)
        return {
            "merchantTxnId": kwargs["payout_id"],
            "providerTxnId": "ALO_PAYOUT_1",
            "status": "processing",
        }

    monkeypatch.setattr("backend.routes.submit_alosheell_payout", fake_submit_payout)
    payout = client.post(
        "/api/admin/finance/payouts",
        json={
            "merchantEmail": "alopayout@example.com",
            "amount": 1500,
            "beneficiaryName": "ALO Beneficiary",
            "accountNumber": "123456789012",
            "ifsc": "HDFC0001234",
            "bankName": "HDFC Bank",
            "beneficiaryMobile": "9876543210",
            "note": "test alosheell payout",
        },
    )
    assert payout.status_code == 201
    payout_id = payout.json["payout"]["payoutId"]
    assert payout.json["payout"]["provider"] == "alosheell"
    assert payout.json["payout"]["status"] == "processing"
    assert submitted_payloads[0]["callback_url"].endswith("/api/alosheell/payout-callback")

    callback = client.post(
        "/api/alosheell/payout-callback",
        json={
            "merchantTxnId": payout_id,
            "providerTxnId": "ALO_PAYOUT_1",
            "status": "success",
            "utr": "ALO601321087819",
        },
    )
    assert callback.status_code == 200
    assert callback.json["payout"]["status"] == "paid"
    assert callback.json["payout"]["utr"] == "ALO601321087819"


def test_active_merchant_api_key_can_create_payment_link():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Docs Merchant",
            "ownerName": "Docs Owner",
            "email": "docs@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant_id = created.json["merchant"]["_id"]
    api_key = created.json["merchant"]["apiKey"]

    activated = client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"})
    assert activated.status_code == 200

    response = client.post(
        "/api/payment-links",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "title": "Merchant API order",
            "amount": 250,
            "currency": "INR",
            "customerName": "API Customer",
            "notifyUrl": "https://merchant.example.com/Wpay/webhook",
        },
    )
    assert response.status_code == 201
    assert response.json["paymentLink"]["merchantEmail"] == "docs@example.com"
    assert response.json["paymentLink"]["amount"] == 250
    assert response.json.get("paymentInitiated") is None


def test_api_key_payment_link_creation_returns_upi_intent_when_mid_is_assigned(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Intent Merchant",
            "ownerName": "Intent Owner",
            "email": "intent@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant_id = created.json["merchant"]["_id"]
    api_key = created.json["merchant"]["apiKey"]
    assert client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"}).status_code == 200
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="INTENT",
        merchant_email="intent@example.com",
    )

    provider_calls = []

    def fake_create_order(**kwargs):
        provider_calls.append(kwargs)
        return {
            "status": "True",
            "client_txn_id": kwargs["client_txn_id"],
            "payment_url": "https://pay.rockypayz.shop/pay/RINTENT123",
        }

    monkeypatch.setattr("backend.routes.create_rockypayz_order", fake_create_order)
    monkeypatch.setattr(
        "backend.routes.extract_upi_intent",
        lambda _url: "upi://pay?pa=intent@upi&am=234",
    )

    response = client.post(
        "/api/payment-links",
        headers={"X-API-Key": api_key},
        json={
            "title": "1782812396A2163F3E312980",
            "amount": 234,
            "currency": "INR",
            "customerName": "samir singh",
            "customerEmail": "test@gmail.com",
            "successRedirectUrl": "https://payment.globaltec.digital/callbackProcess185",
            "failedRedirectUrl": "https://payment.globaltec.digital/callbackProcess185",
        },
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )

    assert response.status_code == 201
    assert response.json["paymentInitiated"] is True
    assert response.json["paymentLink"]["merchantEmail"] == "intent@example.com"
    assert response.json["paymeEnabled"] is True
    assert response.json["payme"]["enabled"] is True
    assert response.json["payme"]["mode"] == "payme"
    assert response.json["payme"]["paymentPageUrl"].endswith(f"/pay/{response.json['paymentLink']['linkId']}")
    assert response.json["paymentPageUrl"] == response.json["payme"]["paymentPageUrl"]
    assert response.json["standardPaymentPageUrl"] == response.json["payme"]["standardPaymentPageUrl"]
    assert response.json["upiLink"] == "upi://pay?pa=intent@upi&am=234"
    assert response.json["paymentTarget"] == "upi://pay?pa=intent@upi&am=234"
    assert response.json["qrPayload"] == "upi://pay?pa=intent@upi&am=234"
    assert response.json["payment"]["upiLink"] == "upi://pay?pa=intent@upi&am=234"
    assert "providerResponse" not in response.json
    assert provider_calls[0]["customer_mobile"] == "9999999999"
    assert response.json["transaction"]["upiLink"] == "upi://pay?pa=intent@upi&am=234"

    link_id = response.json["paymentLink"]["linkId"]
    detail = client.get(
        f"/api/payment-links/{link_id}",
        headers={"X-API-Key": api_key},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert detail.status_code == 200
    assert detail.json["paymentInitiated"] is True
    assert detail.json["payme"]["enabled"] is True
    assert detail.json["upiLink"] == "upi://pay?pa=intent@upi&am=234"
    assert detail.json["paymentTarget"] == "upi://pay?pa=intent@upi&am=234"
    assert detail.json["qrPayload"] == "upi://pay?pa=intent@upi&am=234"


def test_explicit_intent_request_reports_initiation_failure_with_created_link():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "No Route Merchant",
            "ownerName": "No Route Owner",
            "email": "noroute@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant_id = created.json["merchant"]["_id"]
    assert client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"}).status_code == 200

    response = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": "noroute@example.com",
            "title": "No route order",
            "amount": 234,
            "returnIntent": True,
        },
    )

    assert response.status_code == 503
    assert response.json["success"] is False
    assert response.json["paymentLink"]["merchantEmail"] == "noroute@example.com"
    assert response.json["paymentInitiated"] is False


def test_disabled_payme_returns_direct_intent_and_standard_page_link(monkeypatch):
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Direct Intent Merchant",
            "ownerName": "Direct Intent Owner",
            "email": "directintent@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant_id = created.json["merchant"]["_id"]
    api_key = created.json["merchant"]["apiKey"]
    assert client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"}).status_code == 200
    create_gateway_template_and_pool(
        client,
        gateway="RockyPayz",
        suffix="DIRECTINTENT",
        merchant_email="directintent@example.com",
    )

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "directintent@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200
    saved = client.patch(
        "/api/merchant/payment-page-settings",
        json={"paymeEnabled": False},
    )
    assert saved.status_code == 200
    assert saved.json["paymeEnabled"] is False

    monkeypatch.setattr(
        "backend.routes.create_rockypayz_order",
        lambda **kwargs: {
            "status": "True",
            "client_txn_id": kwargs["client_txn_id"],
            "payment_url": "https://pay.rockypayz.shop/pay/RDIRECT123",
        },
    )
    monkeypatch.setattr(
        "backend.routes.extract_upi_intent",
        lambda _url: "upi://pay?pa=direct@upi&am=321",
    )

    response = client.post(
        "/api/payment-links",
        headers={"X-API-Key": api_key},
        json={
            "title": "Direct intent order",
            "amount": 321,
            "customerName": "Direct Customer",
        },
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )

    assert response.status_code == 201
    assert response.json["paymentInitiated"] is True
    assert response.json["paymeEnabled"] is False
    assert response.json["payme"]["enabled"] is False
    assert response.json["payme"]["mode"] == "intent"
    assert response.json["upiLink"] == "upi://pay?pa=direct@upi&am=321"
    assert response.json["paymentTarget"] == "upi://pay?pa=direct@upi&am=321"
    assert response.json["qrPayload"] == "upi://pay?pa=direct@upi&am=321"
    assert response.json["standardPaymentPageUrl"].endswith(f"/pay/{response.json['paymentLink']['linkId']}")
    assert response.json["paymeSetupUrl"].endswith("/merchant/payment-page")

    detail = client.get(f"/api/payment-links/{response.json['paymentLink']['linkId']}")
    assert detail.status_code == 200
    assert detail.json["payme"]["enabled"] is False
    assert detail.json["paymentLink"]["paybook"]["brandName"] == "Wpay"


def test_merchant_metrics_count_failed_links_without_transactions():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Metrics Merchant",
            "ownerName": "Metrics Owner",
            "email": "metrics@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    with client.application.app_context():
        db.session.add(
            PaymentLink(
                link_id="plink_failed_without_txn",
                merchant_email="metrics@example.com",
                title="Failed link without txn",
                amount=123,
                status="failed",
            )
        )
        db.session.add(
            Transaction(
                transaction_id="txn_failed_metrics",
                payment_link_id="plink_failed_with_txn",
                merchant_email="metrics@example.com",
                title="Failed txn",
                amount=200,
                status="failed",
                paid_at=None,
            )
        )
        db.session.commit()

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "metrics@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    response = client.get("/api/merchant/metrics")

    assert response.status_code == 200
    assert response.json["metrics"]["failedCount"] == 2
    assert response.json["metrics"]["failedVolume"] == 323
    assert response.json["metrics"]["totalTransactions"] == 2


def test_merchant_can_configure_paybook_for_payment_links():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Brand Merchant",
            "ownerName": "Brand Owner",
            "email": "brand@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "brand@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    saved = client.patch(
        "/api/merchant/payment-page-settings",
        json={
            "brandName": "Mandi2Mandi",
            "subtitle": "Pay safely",
            "vendorLabel": "Mandi Store",
                "accentColor": "#2563eb",
                "supportText": "Mandi2Mandi secure payment.",
                "logoImageUrl": "https://cdn.example.com/mandi-logo.jpg",
                "showPoweredBy": False,
        },
    )
    assert saved.status_code == 200
    assert saved.json["settings"]["brandName"] == "Mandi2Mandi"
    assert saved.json["settings"]["showPoweredBy"] is False

    link = client.post(
        "/api/payment-links",
        json={
            "title": "Brand order",
            "amount": 100,
        },
    )
    assert link.status_code == 201
    link_id = link.json["paymentLink"]["linkId"]

    public_link = client.get(f"/api/payment-links/{link_id}")
    assert public_link.status_code == 200
    paybook = public_link.json["paymentLink"]["paybook"]
    assert paybook["brandName"] == "Mandi2Mandi"
    assert paybook["vendorLabel"] == "Mandi Store"
    assert paybook["accentColor"] == "#2563eb"
    assert paybook["logoImageUrl"] == "https://cdn.example.com/mandi-logo.jpg"
    assert paybook["showPoweredBy"] is False


def test_merchant_profile_and_bank_accounts():
    client = make_client()
    login_admin(client)
    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Bank Merchant",
            "ownerName": "Bank Owner",
            "email": "bank@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    activate_created_merchant(client, created)

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "bank@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    profile = client.patch(
        "/api/merchant/profile",
        json={
            "businessName": "Bank Merchant Updated",
            "ownerName": "Updated Owner",
            "phone": "8888888888",
            "businessType": "Retail",
        },
    )
    assert profile.status_code == 200
    assert profile.json["profile"]["businessName"] == "Bank Merchant Updated"
    assert profile.json["profile"]["ownerName"] == "Updated Owner"

    account = client.post(
        "/api/merchant/bank-accounts",
        json={
            "label": "Primary HDFC",
            "accountType": "bank",
            "beneficiaryName": "Updated Owner",
            "beneficiaryMobile": "9876543210",
            "accountNumber": "123456789012",
            "ifsc": "hdfc0001234",
            "bankName": "HDFC Bank",
            "isPrimary": True,
        },
    )
    assert account.status_code == 201
    assert account.json["account"]["isPrimary"] is True
    assert account.json["account"]["ifsc"] == "HDFC0001234"

    accounts = client.get("/api/merchant/bank-accounts")
    assert accounts.status_code == 200
    assert accounts.json["count"] == 1
    assert accounts.json["primaryAccount"]["label"] == "Primary HDFC"


def test_stale_payment_links_and_pending_transactions_expire():
    client = make_client()
    login_admin(client)
    merchant = client.post(
        "/api/merchants",
        json={
            "businessName": "Expiry Merchant",
            "ownerName": "Expiry Owner",
            "email": "expiry@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    activate_created_merchant(client, merchant)

    with client.application.app_context():
        old_link = PaymentLink(
            link_id="plink_old_active",
            merchant_email="expiry@example.com",
            title="Old active link",
            amount=100,
            status="active",
            created_at=utcnow() - timedelta(minutes=31),
            updated_at=utcnow() - timedelta(minutes=31),
        )
        pending_link = PaymentLink(
            link_id="plink_old_pending",
            merchant_email="expiry@example.com",
            title="Old pending transaction link",
            amount=100,
            status="active",
        )
        pending_txn = Transaction(
            transaction_id="txn_old_pending",
            payment_link_id="plink_old_pending",
            merchant_email="expiry@example.com",
            title="Old pending transaction",
            amount=100,
            status="pending",
            paid_at=None,
            created_at=utcnow() - timedelta(minutes=16),
            updated_at=utcnow() - timedelta(minutes=16),
        )
        db.session.add_all([old_link, pending_link, pending_txn])
        db.session.commit()

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "expiry@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    links = client.get("/api/payment-links")
    assert links.status_code == 200
    rows = {item["linkId"]: item for item in links.json["paymentLinks"]}
    assert rows["plink_old_active"]["status"] == "failed"
    assert rows["plink_old_pending"]["status"] == "failed"

    transactions = client.get("/api/transactions")
    assert transactions.status_code == 200
    txn = next(item for item in transactions.json["transactions"] if item["transactionId"] == "txn_old_pending")
    assert txn["status"] == "failed"


def test_merchant_webhook_defaults_apply_to_payment_links_and_whitelist_api_keys():
    client = make_client()
    login_admin(client)

    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Webhook Merchant",
            "ownerName": "Webhook Owner",
            "email": "hooks@example.com",
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant_id = created.json["merchant"]["_id"]
    api_key = created.json["merchant"]["apiKey"]
    assert client.patch(f"/api/merchants/{merchant_id}", json={"status": "active"}).status_code == 200

    merchant_login = client.post(
        "/api/auth/login",
        json={"email": "hooks@example.com", "password": "test@123"},
    )
    assert merchant_login.status_code == 200

    saved = client.patch(
        "/api/merchant/webhook-settings",
        json={
            "payinWebhookUrl": "https://merchant.example.com/Wpay/payments",
            "payoutWebhookUrl": "https://merchant.example.com/Wpay/payouts",
            "successRedirectUrl": "https://merchant.example.com/payment-success",
            "failedRedirectUrl": "https://merchant.example.com/payment-failed",
            "ipWhitelist": ["127.0.0.1"],
        },
    )
    assert saved.status_code == 200
    assert saved.json["settings"]["ipWhitelistCount"] == 1
    secret = saved.json["settings"]["webhookSecret"]
    assert secret

    link = client.post(
        "/api/payment-links",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "title": "Webhook default order",
            "amount": 100,
        },
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert link.status_code == 201
    payment_link = link.json["paymentLink"]
    assert payment_link["notifyUrl"] == "https://merchant.example.com/Wpay/payments"
    assert payment_link["callbackSecret"] == secret
    assert payment_link["successRedirectUrl"] == "https://merchant.example.com/payment-success"
    assert payment_link["failedRedirectUrl"] == "https://merchant.example.com/payment-failed"

    blocked = client.post(
        "/api/payment-links",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"title": "Blocked order", "amount": 100},
        environ_overrides={"REMOTE_ADDR": "203.0.113.15"},
    )
    assert blocked.status_code == 403
    assert "IP not whitelisted" in blocked.json["message"]

    x_api_key_link = client.post(
        "/api/payment-links",
        headers={"X-API-Key": api_key},
        json={"title": "X API key order", "amount": 100},
        environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert x_api_key_link.status_code == 201

    x_api_key_blocked = client.post(
        "/api/payment-links",
        headers={"X-API-Key": api_key},
        json={"title": "Blocked X API key order", "amount": 100},
        environ_overrides={"REMOTE_ADDR": "203.0.113.15"},
    )
    assert x_api_key_blocked.status_code == 403
    assert "IP not whitelisted" in x_api_key_blocked.json["message"]


def test_unknown_api_routes_fail_loudly():
    client = make_client()

    assert client.get("/api/not-implemented").status_code == 404
    assert client.post("/api/not-implemented", json={}).status_code == 404


def create_active_merchant(client, *, email="bankrail@example.com"):
    created = client.post(
        "/api/merchants",
        json={
            "businessName": "Bank Rail Merchant",
            "ownerName": "Rail Owner",
            "email": email,
            "phone": "9999999999",
            "businessType": "Online Business",
            "password": "test@123",
        },
    )
    assert created.status_code == 201
    merchant = activate_created_merchant(client, created)
    return merchant


def create_bank_rail_and_route(client, merchant_email: str):
    rail = client.post(
        "/api/admin/bank-rails",
        json={
            "bankName": "HDFC Bank",
            "accountLabel": "HDFC UPI Rail",
            "accountHolderName": "Wpay",
            "upiId": "Wpay@hdfcbank",
            "payeeName": "Wpay",
            "minAmount": 1,
            "maxAmount": 50000,
            "dailyLimit": 100000,
            "monthlyLimit": 1000000,
        },
    )
    assert rail.status_code == 201
    route = client.post(
        "/api/admin/bank-rail-routes",
        json={
            "merchantEmail": merchant_email,
            "railId": rail.json["rail"]["railId"],
            "routeName": "Primary HDFC rail",
            "minAmount": 1,
            "maxAmount": 50000,
            "priority": 1,
            "volumeLimit": 100000,
        },
    )
    assert route.status_code == 201
    return rail.json["rail"], route.json["route"]


def test_admin_can_create_bank_rail_and_assign_route():
    client = make_client()
    login_admin(client)
    merchant = create_active_merchant(client)

    rail, route = create_bank_rail_and_route(client, merchant["email"])

    assert rail["upiId"] == "Wpay@hdfcbank"
    assert rail["accountNumberMasked"] == ""
    assert route["merchantEmail"] == merchant["email"]
    assert route["railId"] == rail["railId"]
    with client.application.app_context():
        assert BankRailRoute.query.count() == 1
        assert InternalBankRail.query.count() == 1


def test_bank_rail_payment_link_returns_upi_intent_and_queues_utr():
    client = make_client()
    login_admin(client)
    merchant = create_active_merchant(client, email="upi-flow@example.com")
    rail, _ = create_bank_rail_and_route(client, merchant["email"])

    created = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": merchant["email"],
            "title": "Bank rail order",
            "amount": 1234.56,
            "returnIntent": True,
        },
    )

    assert created.status_code == 201
    assert created.json["paymentInitiated"] is True
    assert created.json["selectedGateway"] == "bank_rail"
    assert created.json["requiresUtr"] is True
    assert created.json["upiLink"].startswith("upi://pay?")
    assert "pa=Wpay%40hdfcbank" in created.json["upiLink"]
    assert "am=1234.56" in created.json["upiLink"]

    link_id = created.json["paymentLink"]["linkId"]
    client_txn_id = created.json["clientTxnId"]
    with client.application.app_context():
        txn = Transaction.query.filter_by(transaction_id=client_txn_id).first()
        assert txn is not None
        assert txn.provider == "bank_rail"
        assert txn.route_type == "bank_rail"
        assert txn.bank_rail_id == rail["railId"]

    utr_response = client.post(
        f"/api/payment-links/{link_id}/utr",
        json={"clientTxnId": client_txn_id, "utr": "123456789012"},
    )
    assert utr_response.status_code == 200
    assert utr_response.json["status"] == "verification_queued"

    with client.application.app_context():
        txn = Transaction.query.filter_by(transaction_id=client_txn_id).first()
        assert txn.utr == "123456789012"
        assert txn.utr_verification_status == "queued"
        job = BankVerificationJob.query.filter_by(transaction_id=client_txn_id).first()
        assert job is not None
        assert job.status == "queued"

    status = client.get(
        f"/api/payment-links/{link_id}/status?clientTxnId={client_txn_id}"
    )
    assert status.status_code == 200
    assert status.json["status"] == "verification_queued"
    assert status.json["requiresUtr"] is True


def test_bank_rail_manual_verification_marks_paid_and_blocks_duplicate_utr():
    client = make_client()
    login_admin(client)
    merchant = create_active_merchant(client, email="manual-bank@example.com")
    create_bank_rail_and_route(client, merchant["email"])

    created = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": merchant["email"],
            "title": "Manual UTR order",
            "amount": 2500,
            "returnIntent": True,
        },
    )
    assert created.status_code == 201
    link_id = created.json["paymentLink"]["linkId"]
    client_txn_id = created.json["clientTxnId"]

    utr_response = client.post(
        f"/api/payment-links/{link_id}/utr",
        json={"clientTxnId": client_txn_id, "utr": "987654321098"},
    )
    assert utr_response.status_code == 200
    with client.application.app_context():
        job = BankVerificationJob.query.filter_by(transaction_id=client_txn_id).first()
        assert job is not None
        job_id = job.job_id

    matched = client.post(
        f"/api/admin/bank-verification-jobs/{job_id}/mark-matched",
        json={"bankReferenceId": "BANKREF123", "note": "Statement checked"},
    )
    assert matched.status_code == 200
    assert matched.json["transaction"]["status"] == "success"
    assert matched.json["transaction"]["utrVerificationStatus"] == "matched"

    status = client.get(
        f"/api/payment-links/{link_id}/status?clientTxnId={client_txn_id}"
    )
    assert status.status_code == 200
    assert status.json["paid"] is True
    assert status.json["status"] == "paid"

    second = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": merchant["email"],
            "title": "Duplicate UTR order",
            "amount": 2500,
            "returnIntent": True,
        },
    )
    assert second.status_code == 201
    duplicate = client.post(
        f"/api/payment-links/{second.json['paymentLink']['linkId']}/utr",
        json={
            "clientTxnId": second.json["clientTxnId"],
            "utr": "987654321098",
        },
    )
    assert duplicate.status_code == 409
    assert "already used" in duplicate.json["message"]


def test_internal_bank_verification_runner_requires_secret_and_moves_to_review():
    client = make_client()
    login_admin(client)
    merchant = create_active_merchant(client, email="runner-bank@example.com")
    create_bank_rail_and_route(client, merchant["email"])

    created = client.post(
        "/api/payment-links",
        json={
            "merchantEmail": merchant["email"],
            "title": "Runner UTR order",
            "amount": 500,
            "returnIntent": True,
        },
    )
    assert created.status_code == 201
    queued = client.post(
        f"/api/payment-links/{created.json['paymentLink']['linkId']}/utr",
        json={"clientTxnId": created.json["clientTxnId"], "utr": "111122223333"},
    )
    assert queued.status_code == 200

    unauthorized = client.post("/api/internal/bank-verification/run")
    assert unauthorized.status_code == 401

    processed = client.post(
        "/api/internal/bank-verification/run",
        headers={"X-Internal-Secret": "test-bank-verification-secret"},
    )
    assert processed.status_code == 200
    assert processed.json["processed"] == 1
    assert processed.json["results"][0]["status"] == "manual_review"

    status = client.get(
        f"/api/payment-links/{created.json['paymentLink']['linkId']}/status?clientTxnId={created.json['clientTxnId']}"
    )
    assert status.status_code == 200
    assert status.json["status"] == "manual_review"
