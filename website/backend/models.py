from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(32), nullable=False, default="merchant", index=True)
    merchant_email = db.Column(db.String(255), nullable=False, default="", index=True)
    status = db.Column(db.String(32), nullable=False, default="active")
    two_factor_enabled = db.Column(db.Boolean, nullable=False, default=False)
    two_factor_secret = db.Column(db.String(255), nullable=False, default="")
    employee_roles = db.Column(db.Text, nullable=False, default="[]")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "merchantEmail": self.merchant_email or self.email,
            "status": self.status,
            "twoFactorEnabled": self.two_factor_enabled,
            "employeeRoles": self.get_employee_roles(),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }

    def get_employee_roles(self) -> list[str]:
        try:
            roles = json.loads(self.employee_roles or "[]")
        except (TypeError, ValueError):
            return []
        return [
            role
            for role in roles
            if role in {"finance", "tech", "operations", "support"}
        ]

    def set_employee_roles(self, roles) -> None:
        normalized = []
        for role in roles if isinstance(roles, list) else []:
            value = str(role or "").strip().lower()
            if (
                value in {"finance", "tech", "operations", "support"}
                and value not in normalized
            ):
                normalized.append(value)
        self.employee_roles = json.dumps(normalized)


class Merchant(TimestampMixin, db.Model):
    __tablename__ = "merchants"

    id = db.Column(db.Integer, primary_key=True)
    merchant_id = db.Column(db.String(80), unique=True, index=True)
    merchant_key = db.Column(db.String(128), default="")
    api_key = db.Column(db.String(128), default="")
    secret_key = db.Column(db.String(128), default="")
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    business_name = db.Column(db.String(200), nullable=False)
    owner_name = db.Column(db.String(160), nullable=False, default="Merchant")
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    phone = db.Column(db.String(40), nullable=False, default="")
    business_type = db.Column(db.String(120), nullable=False, default="Online Business")
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    gateway_assigned = db.Column(db.String(160), nullable=False, default="Not Assigned")
    total_volume = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    total_transactions = db.Column(db.Integer, nullable=False, default=0)
    activation_count = db.Column(db.Integer, nullable=False, default=0)
    last_activated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paybook_brand_name = db.Column(db.String(120), nullable=False, default="")
    paybook_subtitle = db.Column(db.String(160), nullable=False, default="Secure checkout")
    paybook_vendor_label = db.Column(db.String(160), nullable=False, default="")
    paybook_accent_color = db.Column(db.String(16), nullable=False, default="#087f5b")
    paybook_support_text = db.Column(
        db.String(220),
        nullable=False,
        default="Encrypted checkout. Your UPI PIN stays inside your payment app.",
    )
    paybook_logo_text = db.Column(db.String(8), nullable=False, default="")
    paybook_show_powered_by = db.Column(db.Boolean, nullable=False, default=True)
    payme_enabled = db.Column(db.Boolean, nullable=False, default=True)
    paybook_config = db.Column(db.Text, nullable=False, default="{}")
    webhook_payin_url = db.Column(db.Text, nullable=False, default="")
    webhook_payout_url = db.Column(db.Text, nullable=False, default="")
    webhook_secret = db.Column(db.String(255), nullable=False, default="")
    default_success_redirect_url = db.Column(db.Text, nullable=False, default="")
    default_failed_redirect_url = db.Column(db.Text, nullable=False, default="")
    api_ip_whitelist = db.Column(db.Text, nullable=False, default="")

    def ensure_credentials(self) -> None:
        if not self.merchant_id:
            self.merchant_id = f"m_{secrets.token_hex(6)}"
        if not self.merchant_key:
            self.merchant_key = secrets.token_urlsafe(18)
        if not self.api_key:
            self.api_key = f"gp_live_{secrets.token_urlsafe(24)}"
        if not self.secret_key:
            self.secret_key = f"gp_secret_{secrets.token_urlsafe(28)}"

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "merchantId": self.merchant_id,
            "merchantKey": self.merchant_key,
            "apiKey": self.api_key,
            "secretKey": self.secret_key,
            "userId": str(self.user_id) if self.user_id else "",
            "businessName": self.business_name,
            "name": self.business_name,
            "companyName": self.business_name,
            "ownerName": self.owner_name,
            "email": self.email,
            "businessEmail": self.email,
            "contactEmail": self.email,
            "merchantEmail": self.email,
            "username": self.email,
            "phone": self.phone,
            "businessType": self.business_type,
            "status": self.status,
            "gatewayAssigned": self.gateway_assigned,
            "totalVolume": float(self.total_volume or 0),
            "totalTransactions": self.total_transactions,
            "activationCount": self.activation_count,
            "lastActivatedAt": iso(self.last_activated_at),
            "paybook": self.paybook_settings(),
            "paymeEnabled": bool(self.payme_enabled),
            "webhooks": self.webhook_settings(),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }

    def paybook_settings(self) -> dict:
        brand_name = self.paybook_brand_name or self.business_name or "Wpay"
        defaults = {
            "brandName": brand_name,
            "subtitle": self.paybook_subtitle or "Secure checkout",
            "vendorLabel": self.paybook_vendor_label or self.business_name or brand_name,
            "accentColor": self.paybook_accent_color or "#087f5b",
            "supportText": self.paybook_support_text
            or "Encrypted checkout. Your UPI PIN stays inside your payment app.",
            "logoImageUrl": "",
            "themeMode": "system",
            "showPoweredBy": bool(self.paybook_show_powered_by),
            "showOrderDetails": True,
            "showSupportText": True,
            "protectedPaymentLabel": "Protected payment",
            "paymentRequestLabel": "Payment request",
            "paymentToLabel": "Payment to",
            "orderLabel": "Order",
            "referenceLabel": "Reference",
            "upiPaymentLabel": "UPI payment",
            "checkoutTitle": "Pay from any UPI app",
            "checkoutDescription": "Start a secure UPI payment request and complete it from your preferred app.",
            "mobileNumberLabel": "Mobile number",
            "mobileNumberHelp": "We use this only to create the payment request.",
            "payButtonLabel": "Pay now",
            "paySecurelyLabel": "Pay securely",
            "desktopReadyTitle": "Scan or continue",
            "mobileReadyTitle": "Choose your UPI app",
            "singleUseLabel": "Single-use payment",
            "showQrLabel": "Show QR",
            "qrVisibleLabel": "QR shown",
            "payWithAppLabel": "Pay with an app on this phone",
            "continuePaymentLabel": "Continue to payment",
            "checkStatusLabel": "Check status",
            "copyPaymentLabel": "Copy payment link",
            "successLabel": "Payment complete",
            "successTitle": "Payment received",
            "doneButtonLabel": "Done",
            "footerNote": "Payments are subject to bank confirmation",
        }
        try:
            saved = json.loads(self.paybook_config or "{}")
        except (TypeError, ValueError):
            saved = {}
        if not isinstance(saved, dict):
            saved = {}
        return {**defaults, **saved}

    def webhook_settings(self) -> dict:
        if not self.webhook_secret:
            self.webhook_secret = secrets.token_urlsafe(32)
        allowed_ips = [
            ip.strip()
            for ip in (self.api_ip_whitelist or "").split(",")
            if ip.strip()
        ][:5]
        return {
            "payinWebhookUrl": self.webhook_payin_url or "",
            "payoutWebhookUrl": self.webhook_payout_url or "",
            "webhookSecret": self.webhook_secret,
            "successRedirectUrl": self.default_success_redirect_url or "",
            "failedRedirectUrl": self.default_failed_redirect_url or "",
            "ipWhitelist": allowed_ips,
            "ipWhitelistCount": len(allowed_ips),
            "ipWhitelistLimit": 5,
        }


class Transaction(TimestampMixin, db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    payment_link_id = db.Column(db.String(120), nullable=False, default="")
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    customer_name = db.Column(db.String(160), nullable=False, default="")
    customer_email = db.Column(db.String(255), nullable=False, default="")
    title = db.Column(db.String(200), nullable=False, default="Payment")
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    payment_method = db.Column(db.String(120), nullable=False, default="Wpay Checkout")
    gateway = db.Column(db.String(120), nullable=False, default="Wpay Gateway")
    gateway_transaction_id = db.Column(db.String(160), default="")
    utr = db.Column(db.String(120), default="")
    status = db.Column(db.String(32), nullable=False, default="success", index=True)
    provider = db.Column(db.String(80), default="")
    mid_pool_id = db.Column(db.String(80), nullable=False, default="")
    payment_target = db.Column(db.Text, nullable=False, default="")
    payment_url = db.Column(db.Text, nullable=False, default="")
    hosted_payment_url = db.Column(db.Text, nullable=False, default="")
    upi_link = db.Column(db.Text, nullable=False, default="")
    qr_payload = db.Column(db.Text, nullable=False, default="")
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    merchant_callback_status = db.Column(db.String(32), nullable=False, default="")
    merchant_callback_response = db.Column(db.Text, nullable=False, default="")
    merchant_callback_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    route_type = db.Column(db.String(32), nullable=False, default="gateway", index=True)
    bank_rail_id = db.Column(db.String(120), nullable=False, default="", index=True)
    utr_submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    utr_verification_status = db.Column(
        db.String(32), nullable=False, default="not_submitted", index=True
    )
    utr_verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    bank_reference_id = db.Column(db.String(160), nullable=False, default="")
    bank_posted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    verification_attempts = db.Column(db.Integer, nullable=False, default=0)
    verification_notes = db.Column(db.Text, nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "transactionId": self.transaction_id,
            "paymentLinkId": self.payment_link_id,
            "merchantEmail": self.merchant_email,
            "customerName": self.customer_name,
            "customerEmail": self.customer_email,
            "title": self.title,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "paymentMethod": self.payment_method,
            "gateway": self.gateway,
            "gatewayTransactionId": self.gateway_transaction_id,
            "utr": self.utr,
            "status": self.status,
            "provider": self.provider,
            "midPoolId": self.mid_pool_id,
            "paymentTarget": self.payment_target,
            "paymentUrl": self.payment_url,
            "hostedPaymentUrl": self.hosted_payment_url,
            "upiLink": self.upi_link,
            "qrPayload": self.qr_payload,
            "expiresAt": iso(self.expires_at),
            "merchantCallbackStatus": self.merchant_callback_status,
            "merchantCallbackResponse": self.merchant_callback_response,
            "merchantCallbackSentAt": iso(self.merchant_callback_sent_at),
            "routeType": self.route_type,
            "bankRailId": self.bank_rail_id,
            "utrSubmittedAt": iso(self.utr_submitted_at),
            "utrVerificationStatus": self.utr_verification_status,
            "utrVerifiedAt": iso(self.utr_verified_at),
            "bankReferenceId": self.bank_reference_id,
            "bankPostedAt": iso(self.bank_posted_at),
            "verificationAttempts": self.verification_attempts,
            "verificationNotes": self.verification_notes,
            "paidAt": iso(self.paid_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class FinanceSettings(TimestampMixin, db.Model):
    __tablename__ = "finance_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), nullable=False, unique=True, default="default")
    payin_selling_fee_percent = db.Column(db.Numeric(8, 3), nullable=False, default=2)
    payout_selling_fee_percent = db.Column(db.Numeric(8, 3), nullable=False, default=1)
    usdt_rate_inr = db.Column(db.Numeric(14, 2), nullable=False, default=88)
    usdt_network = db.Column(db.String(40), nullable=False, default="TRC20")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "key": self.key,
            "payinSellingFeePercent": float(self.payin_selling_fee_percent or 0),
            "payoutSellingFeePercent": float(self.payout_selling_fee_percent or 0),
            "usdtRateInr": float(self.usdt_rate_inr or 0),
            "usdtNetwork": self.usdt_network,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class MerchantPricing(TimestampMixin, db.Model):
    __tablename__ = "merchant_pricing"

    id = db.Column(db.Integer, primary_key=True)
    merchant_email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    payin_selling_fee_percent = db.Column(db.Numeric(8, 3), nullable=True)
    payout_selling_fee_percent = db.Column(db.Numeric(8, 3), nullable=True)
    usdt_settlement_allowed = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "merchantEmail": self.merchant_email,
            "payinSellingFeePercent": optional_float(self.payin_selling_fee_percent),
            "payoutSellingFeePercent": optional_float(self.payout_selling_fee_percent),
            "usdtSettlementAllowed": self.usdt_settlement_allowed,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class UsdtSettlement(TimestampMixin, db.Model):
    __tablename__ = "usdt_settlements"

    id = db.Column(db.Integer, primary_key=True)
    usdt_settlement_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    inr_amount = db.Column(db.Numeric(14, 2), nullable=False)
    usdt_rate_inr = db.Column(db.Numeric(14, 2), nullable=False)
    usdt_amount = db.Column(db.Numeric(14, 4), nullable=False)
    network = db.Column(db.String(40), nullable=False, default="TRC20")
    wallet_address = db.Column(db.String(255), nullable=False, default="")
    tx_hash = db.Column(db.String(255), nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    note = db.Column(db.Text, nullable=False, default="")
    created_by = db.Column(db.String(255), nullable=False, default="")
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    confirmed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "usdtSettlementId": self.usdt_settlement_id,
            "merchantEmail": self.merchant_email,
            "inrAmount": float(self.inr_amount or 0),
            "usdtRateInr": float(self.usdt_rate_inr or 0),
            "usdtAmount": float(self.usdt_amount or 0),
            "network": self.network,
            "walletAddress": self.wallet_address,
            "txHash": self.tx_hash,
            "status": self.status,
            "note": self.note,
            "createdBy": self.created_by,
            "sentAt": iso(self.sent_at),
            "confirmedAt": iso(self.confirmed_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class Payout(TimestampMixin, db.Model):
    __tablename__ = "payouts"

    id = db.Column(db.Integer, primary_key=True)
    payout_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    beneficiary_name = db.Column(db.String(180), nullable=False, default="")
    account_number = db.Column(db.String(80), nullable=False, default="")
    ifsc = db.Column(db.String(20), nullable=False, default="")
    bank_name = db.Column(db.String(160), nullable=False, default="")
    beneficiary_mobile = db.Column(db.String(40), nullable=False, default="")
    note = db.Column(db.Text, nullable=False, default="")
    merchant_fee_percent = db.Column(db.Numeric(8, 3), nullable=False, default=0)
    merchant_fee_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    provider_cost_percent = db.Column(db.Numeric(8, 3), nullable=False, default=0)
    provider_cost_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    gross_profit_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    provider = db.Column(db.String(80), nullable=False, default="")
    provider_txn_id = db.Column(db.String(160), nullable=False, default="")
    provider_status = db.Column(db.String(80), nullable=False, default="")
    provider_response = db.Column(db.Text, nullable=False, default="")
    utr = db.Column(db.String(120), nullable=False, default="")
    merchant_callback_status = db.Column(db.String(32), nullable=False, default="")
    merchant_callback_response = db.Column(db.Text, nullable=False, default="")
    merchant_callback_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_by = db.Column(db.String(255), nullable=False, default="")
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    failed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "payoutId": self.payout_id,
            "merchantEmail": self.merchant_email,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "beneficiaryName": self.beneficiary_name,
            "accountNumber": self.account_number,
            "ifsc": self.ifsc,
            "bankName": self.bank_name,
            "beneficiaryMobile": self.beneficiary_mobile,
            "mobile": self.beneficiary_mobile,
            "note": self.note,
            "merchantFeePercent": float(self.merchant_fee_percent or 0),
            "merchantFeeAmount": float(self.merchant_fee_amount or 0),
            "providerCostPercent": float(self.provider_cost_percent or 0),
            "providerCostAmount": float(self.provider_cost_amount or 0),
            "grossProfitAmount": float(self.gross_profit_amount or 0),
            "status": self.status,
            "provider": self.provider,
            "providerTxnId": self.provider_txn_id,
            "providerStatus": self.provider_status,
            "providerResponse": self.provider_response,
            "utr": self.utr,
            "merchantCallbackStatus": self.merchant_callback_status,
            "merchantCallbackResponse": self.merchant_callback_response,
            "merchantCallbackSentAt": iso(self.merchant_callback_sent_at),
            "createdBy": self.created_by,
            "submittedAt": iso(self.submitted_at),
            "paidAt": iso(self.paid_at),
            "failedAt": iso(self.failed_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class Settlement(TimestampMixin, db.Model):
    __tablename__ = "settlements"

    id = db.Column(db.Integer, primary_key=True)
    settlement_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    total_success_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    total_refunded_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    total_chargeback_lost_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    platform_fee = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    net_settlement_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    note = db.Column(db.Text, nullable=False, default="")
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "settlementId": self.settlement_id,
            "merchantEmail": self.merchant_email,
            "totalSuccessAmount": float(self.total_success_amount or 0),
            "totalRefundedAmount": float(self.total_refunded_amount or 0),
            "totalChargebackLostAmount": float(
                self.total_chargeback_lost_amount or 0
            ),
            "platformFee": float(self.platform_fee or 0),
            "netSettlementAmount": float(self.net_settlement_amount or 0),
            "currency": self.currency,
            "status": self.status,
            "note": self.note,
            "paidAt": iso(self.paid_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class Refund(TimestampMixin, db.Model):
    __tablename__ = "refunds"

    id = db.Column(db.Integer, primary_key=True)
    refund_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    transaction_id = db.Column(db.String(120), nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    customer_name = db.Column(db.String(160), nullable=False, default="")
    customer_email = db.Column(db.String(255), nullable=False, default="")
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    reason = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    admin_note = db.Column(db.Text, nullable=False, default="")
    processed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "refundId": self.refund_id,
            "transactionId": self.transaction_id,
            "merchantEmail": self.merchant_email,
            "customerName": self.customer_name,
            "customerEmail": self.customer_email,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "reason": self.reason,
            "status": self.status,
            "adminNote": self.admin_note,
            "processedAt": iso(self.processed_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class Chargeback(TimestampMixin, db.Model):
    __tablename__ = "chargebacks"

    id = db.Column(db.Integer, primary_key=True)
    chargeback_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    transaction_id = db.Column(db.String(120), nullable=False, index=True)
    payment_link_id = db.Column(db.String(120), nullable=False, default="")
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    customer_name = db.Column(db.String(160), nullable=False, default="")
    customer_email = db.Column(db.String(255), nullable=False, default="")
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    reason = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="open", index=True)
    admin_note = db.Column(db.Text, nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "chargebackId": self.chargeback_id,
            "transactionId": self.transaction_id,
            "paymentLinkId": self.payment_link_id or None,
            "merchantEmail": self.merchant_email,
            "customerName": self.customer_name,
            "customerEmail": self.customer_email,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "reason": self.reason,
            "status": self.status,
            "adminNote": self.admin_note,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class AuditLog(TimestampMixin, db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(120), nullable=False, index=True)
    actor_name = db.Column(db.String(160), nullable=False, default="")
    actor_email = db.Column(db.String(255), nullable=False, default="", index=True)
    actor_role = db.Column(db.String(40), nullable=False, default="system")
    merchant_email = db.Column(db.String(255), nullable=False, default="", index=True)
    target_type = db.Column(db.String(120), nullable=False, default="")
    target_id = db.Column(db.String(160), nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="success")
    message = db.Column(db.Text, nullable=False, default="")
    metadata_json = db.Column(db.Text, nullable=False, default="{}")

    def to_dict(self) -> dict:
        try:
            metadata = json.loads(self.metadata_json or "{}")
        except (TypeError, ValueError):
            metadata = {}
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "action": self.action,
            "actorName": self.actor_name,
            "actorEmail": self.actor_email,
            "actorRole": self.actor_role,
            "merchantEmail": self.merchant_email,
            "targetType": self.target_type,
            "targetId": self.target_id,
            "status": self.status,
            "message": self.message,
            "metadata": metadata,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class MerchantBankAccount(TimestampMixin, db.Model):
    __tablename__ = "merchant_bank_accounts"

    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    label = db.Column(db.String(120), nullable=False, default="Primary payout account")
    account_type = db.Column(db.String(24), nullable=False, default="bank")
    beneficiary_name = db.Column(db.String(180), nullable=False, default="")
    account_number = db.Column(db.String(80), nullable=False, default="")
    ifsc = db.Column(db.String(20), nullable=False, default="")
    bank_name = db.Column(db.String(160), nullable=False, default="")
    upi_id = db.Column(db.String(160), nullable=False, default="")
    beneficiary_mobile = db.Column(db.String(40), nullable=False, default="")
    is_primary = db.Column(db.Boolean, nullable=False, default=False, index=True)
    status = db.Column(db.String(32), nullable=False, default="active", index=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "accountId": self.account_id,
            "merchantEmail": self.merchant_email,
            "label": self.label,
            "accountType": self.account_type,
            "beneficiaryName": self.beneficiary_name,
            "accountNumber": self.account_number,
            "ifsc": self.ifsc,
            "bankName": self.bank_name,
            "upiId": self.upi_id,
            "beneficiaryMobile": self.beneficiary_mobile,
            "isPrimary": bool(self.is_primary),
            "status": self.status,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class BankCredentialTemplate(TimestampMixin, db.Model):
    __tablename__ = "bank_credential_templates"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False, unique=True, index=True)
    bank_name = db.Column(db.String(160), nullable=False, default="", index=True)
    login_url = db.Column(db.Text, nullable=False, default="")
    field_definitions = db.Column(db.Text, nullable=False, default="[]")
    encrypted_values = db.Column(db.Text, nullable=False, default="")
    scraper_type = db.Column(db.String(40), nullable=False, default="manual")
    scraper_config_json = db.Column(db.Text, nullable=False, default="{}")
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    created_by = db.Column(db.String(255), nullable=False, default="")
    updated_by = db.Column(db.String(255), nullable=False, default="")

    def get_field_definitions(self) -> list[dict]:
        try:
            fields = json.loads(self.field_definitions or "[]")
        except (TypeError, ValueError):
            return []
        return fields if isinstance(fields, list) else []

    def set_field_definitions(self, fields: list[dict]) -> None:
        self.field_definitions = json.dumps(fields, separators=(",", ":"))

    def get_credentials(self) -> dict[str, str]:
        from .credential_crypto import decrypt_credentials

        return decrypt_credentials(self.encrypted_values)

    def set_credentials(self, values: dict[str, str]) -> None:
        from .credential_crypto import encrypt_credentials

        self.encrypted_values = encrypt_credentials(values)

    def scraper_config(self) -> dict:
        try:
            config = json.loads(self.scraper_config_json or "{}")
        except (TypeError, ValueError):
            return {}
        return config if isinstance(config, dict) else {}

    def set_scraper_config(self, config: dict) -> None:
        self.scraper_config_json = json.dumps(config or {}, separators=(",", ":"))

    def to_dict(self, *, usage_count: int = 0) -> dict:
        values = self.get_credentials() if self.encrypted_values else {}
        fields = []
        for definition in self.get_field_definitions():
            key = str(definition.get("key") or "")
            field_type = str(definition.get("type") or "secret")
            field = {
                "key": key,
                "label": str(definition.get("label") or key),
                "type": field_type,
                "common": bool(definition.get("common")),
                "hasValue": bool(values.get(key)),
            }
            if field_type in {"mode", "select"}:
                field["value"] = values.get(key, "")
            fields.append(field)
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "name": self.name,
            "bankName": self.bank_name,
            "loginUrl": self.login_url,
            "scraperType": self.scraper_type,
            "scraperConfig": self.scraper_config(),
            "fields": fields,
            "fieldCount": len(fields),
            "usageCount": usage_count,
            "status": self.status,
            "createdBy": self.created_by,
            "updatedBy": self.updated_by,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class InternalBankRail(TimestampMixin, db.Model):
    __tablename__ = "internal_bank_rails"

    id = db.Column(db.Integer, primary_key=True)
    rail_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    bank_name = db.Column(db.String(160), nullable=False, default="", index=True)
    account_label = db.Column(db.String(160), nullable=False, default="")
    account_holder_name = db.Column(db.String(180), nullable=False, default="")
    account_number_masked = db.Column(db.String(80), nullable=False, default="")
    account_number_encrypted = db.Column(db.Text, nullable=False, default="")
    ifsc = db.Column(db.String(20), nullable=False, default="")
    upi_id = db.Column(db.String(160), nullable=False, default="", index=True)
    payee_name = db.Column(db.String(180), nullable=False, default="")
    rail_type = db.Column(db.String(32), nullable=False, default="upi")
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payin_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    daily_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    monthly_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    min_amount = db.Column(db.Numeric(14, 2), nullable=False, default=1)
    max_amount = db.Column(db.Numeric(14, 2), nullable=False, default=100000)
    used_volume_daily = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    used_volume_monthly = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    priority = db.Column(db.Integer, nullable=False, default=100, index=True)
    settlement_owner = db.Column(db.String(80), nullable=False, default="Wpay")
    credential_template_id = db.Column(
        db.Integer,
        db.ForeignKey("bank_credential_templates.id"),
        nullable=True,
        index=True,
    )
    credential_template = db.relationship(
        "BankCredentialTemplate",
        foreign_keys=[credential_template_id],
    )
    notes = db.Column(db.Text, nullable=False, default="")
    created_by = db.Column(db.String(255), nullable=False, default="")
    updated_by = db.Column(db.String(255), nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "railId": self.rail_id,
            "bankName": self.bank_name,
            "accountLabel": self.account_label,
            "accountHolderName": self.account_holder_name,
            "accountNumberMasked": self.account_number_masked,
            "ifsc": self.ifsc,
            "upiId": self.upi_id,
            "payeeName": self.payee_name,
            "railType": self.rail_type,
            "status": self.status,
            "payinStatus": self.payin_status or self.status,
            "dailyLimit": float(self.daily_limit or 0),
            "monthlyLimit": float(self.monthly_limit or 0),
            "minAmount": float(self.min_amount or 0),
            "maxAmount": float(self.max_amount or 0),
            "usedVolumeDaily": float(self.used_volume_daily or 0),
            "usedVolumeMonthly": float(self.used_volume_monthly or 0),
            "priority": self.priority,
            "settlementOwner": self.settlement_owner,
            "credentialTemplateId": (
                str(self.credential_template_id)
                if self.credential_template_id
                else ""
            ),
            "credentialTemplate": (
                self.credential_template.to_dict()
                if self.credential_template
                else None
            ),
            "notes": self.notes,
            "createdBy": self.created_by,
            "updatedBy": self.updated_by,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class BankRailRoute(TimestampMixin, db.Model):
    __tablename__ = "bank_rail_routes"

    id = db.Column(db.Integer, primary_key=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    rail_id = db.Column(db.String(120), nullable=False, index=True)
    route_name = db.Column(db.String(160), nullable=False, default="")
    min_amount = db.Column(db.Numeric(14, 2), nullable=False, default=1)
    max_amount = db.Column(db.Numeric(14, 2), nullable=False, default=100000)
    priority = db.Column(db.Integer, nullable=False, default=100, index=True)
    volume_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    used_volume = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payin_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    auto_disable_on_limit = db.Column(db.Boolean, nullable=False, default=True)
    smart_routing_weight = db.Column(db.Integer, nullable=False, default=100)
    notes = db.Column(db.Text, nullable=False, default="")
    updated_by = db.Column(db.String(255), nullable=False, default="")

    def to_dict(self, *, rail: InternalBankRail | None = None) -> dict:
        rail_row = rail or InternalBankRail.query.filter_by(rail_id=self.rail_id).first()
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "merchantEmail": self.merchant_email,
            "railId": self.rail_id,
            "routeName": self.route_name,
            "bankName": rail_row.bank_name if rail_row else "",
            "accountLabel": rail_row.account_label if rail_row else "",
            "upiId": rail_row.upi_id if rail_row else "",
            "minAmount": float(self.min_amount or 0),
            "maxAmount": float(self.max_amount or 0),
            "priority": self.priority,
            "volumeLimit": float(self.volume_limit or 0),
            "usedVolume": float(self.used_volume or 0),
            "status": self.status,
            "payinStatus": self.payin_status or self.status,
            "autoDisableOnLimit": self.auto_disable_on_limit,
            "smartRoutingWeight": self.smart_routing_weight,
            "notes": self.notes,
            "updatedBy": self.updated_by,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class BankVerificationJob(TimestampMixin, db.Model):
    __tablename__ = "bank_verification_jobs"

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    transaction_id = db.Column(db.String(120), nullable=False, index=True)
    payment_link_id = db.Column(db.String(120), nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    bank_rail_id = db.Column(db.String(120), nullable=False, index=True)
    utr = db.Column(db.String(120), nullable=False, index=True)
    expected_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default="queued", index=True)
    attempt_count = db.Column(db.Integer, nullable=False, default=0)
    next_run_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_error = db.Column(db.Text, nullable=False, default="")
    raw_match_json = db.Column(db.Text, nullable=False, default="{}")
    matched_amount = db.Column(db.Numeric(14, 2), nullable=True)
    matched_utr = db.Column(db.String(120), nullable=False, default="")
    matched_posted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def raw_match(self) -> dict:
        try:
            data = json.loads(self.raw_match_json or "{}")
        except (TypeError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def set_raw_match(self, data: dict) -> None:
        self.raw_match_json = json.dumps(data or {}, separators=(",", ":"))

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "jobId": self.job_id,
            "transactionId": self.transaction_id,
            "paymentLinkId": self.payment_link_id,
            "merchantEmail": self.merchant_email,
            "bankRailId": self.bank_rail_id,
            "utr": self.utr,
            "expectedAmount": float(self.expected_amount or 0),
            "status": self.status,
            "attemptCount": self.attempt_count,
            "nextRunAt": iso(self.next_run_at),
            "lastError": self.last_error,
            "rawMatch": self.raw_match(),
            "matchedAmount": optional_float(self.matched_amount),
            "matchedUtr": self.matched_utr,
            "matchedPostedAt": iso(self.matched_posted_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class GatewayCredentialTemplate(TimestampMixin, db.Model):
    __tablename__ = "gateway_credential_templates"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False, unique=True, index=True)
    field_definitions = db.Column(db.Text, nullable=False, default="[]")
    encrypted_values = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    created_by = db.Column(db.String(255), nullable=False, default="")
    updated_by = db.Column(db.String(255), nullable=False, default="")

    def get_field_definitions(self) -> list[dict]:
        try:
            fields = json.loads(self.field_definitions or "[]")
        except (TypeError, ValueError):
            return []
        return fields if isinstance(fields, list) else []

    def set_field_definitions(self, fields: list[dict]) -> None:
        self.field_definitions = json.dumps(fields, separators=(",", ":"))

    def get_credentials(self) -> dict[str, str]:
        from .credential_crypto import decrypt_credentials

        return decrypt_credentials(self.encrypted_values)

    def set_credentials(self, values: dict[str, str]) -> None:
        from .credential_crypto import encrypt_credentials

        self.encrypted_values = encrypt_credentials(values)

    def to_dict(self, *, usage_count: int = 0) -> dict:
        values = self.get_credentials()
        fields = []
        for definition in self.get_field_definitions():
            key = str(definition.get("key") or "")
            value = values.get(key, "")
            field = {
                "key": key,
                "label": str(definition.get("label") or key),
                "type": str(definition.get("type") or "secret"),
                "common": bool(definition.get("common")),
                "hasValue": bool(value),
            }
            if field["type"] == "mode":
                field["value"] = value or "production"
            fields.append(field)
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "name": self.name,
            "fields": fields,
            "fieldCount": len(fields),
            "usageCount": usage_count,
            "status": self.status,
            "createdBy": self.created_by,
            "updatedBy": self.updated_by,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class MidPool(TimestampMixin, db.Model):
    __tablename__ = "mid_pools"

    id = db.Column(db.Integer, primary_key=True)
    gateway_name = db.Column(db.String(120), nullable=False, index=True)
    mid_name = db.Column(db.String(160), nullable=False)
    mid_id = db.Column(db.String(160), nullable=False, unique=True, index=True)
    total_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    cycle = db.Column(db.String(32), nullable=False, default="monthly")
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payin_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payout_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    notes = db.Column(db.Text, nullable=False, default="")
    credential_template_id = db.Column(
        db.Integer,
        db.ForeignKey("gateway_credential_templates.id"),
        nullable=True,
        index=True,
    )
    credential_template = db.relationship(
        "GatewayCredentialTemplate",
        foreign_keys=[credential_template_id],
    )

    def to_dict(self, *, used_volume: float = 0, assigned_merchants: int = 0) -> dict:
        total_limit = float(self.total_limit or 0)
        remaining_limit = max(0, total_limit - float(used_volume or 0))
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "gatewayName": self.gateway_name,
            "midName": self.mid_name,
            "midId": self.mid_id,
            "totalLimit": total_limit,
            "usedVolume": float(used_volume or 0),
            "remainingLimit": remaining_limit,
            "utilizationPercent": round(
                (float(used_volume or 0) / total_limit) * 100, 2
            )
            if total_limit
            else 0,
            "assignedMerchants": assigned_merchants,
            "cycle": self.cycle,
            "status": self.status,
            "payinStatus": self.payin_status or self.status,
            "payoutStatus": self.payout_status or self.status,
            "notes": self.notes,
            "credentialTemplateId": (
                str(self.credential_template_id)
                if self.credential_template_id
                else ""
            ),
            "credentialTemplate": (
                self.credential_template.to_dict()
                if self.credential_template
                else None
            ),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class PipeRoute(TimestampMixin, db.Model):
    __tablename__ = "pipe_routes"

    id = db.Column(db.Integer, primary_key=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    pipe_name = db.Column(db.String(160), nullable=False)
    gateway_name = db.Column(db.String(80), nullable=False, index=True)
    mid_pool_id = db.Column(db.String(80), nullable=False, default="")
    mid_id = db.Column(db.String(120), nullable=False, default="")
    provider_merchant_id = db.Column(db.String(120), nullable=False, default="")
    min_amount = db.Column(db.Numeric(14, 2), nullable=False, default=1)
    max_amount = db.Column(db.Numeric(14, 2), nullable=False, default=100000)
    priority = db.Column(db.Integer, nullable=False, default=100, index=True)
    volume_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    used_volume = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payin_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    payout_status = db.Column(db.String(32), nullable=False, default="active", index=True)
    auto_disable_on_limit = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.Text, nullable=False, default="")
    updated_by = db.Column(db.String(255), nullable=False, default="")
    commission_percent = db.Column(db.Numeric(8, 3), nullable=False, default=0)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "merchantEmail": self.merchant_email,
            "pipeName": self.pipe_name,
            "gatewayName": self.gateway_name,
            "midPoolId": self.mid_pool_id,
            "midId": self.mid_id,
            "providerMerchantId": self.provider_merchant_id,
            "minAmount": float(self.min_amount or 0),
            "maxAmount": float(self.max_amount or 0),
            "priority": self.priority,
            "volumeLimit": float(self.volume_limit or 0),
            "usedVolume": float(self.used_volume or 0),
            "status": self.status,
            "payinStatus": self.payin_status or self.status,
            "payoutStatus": self.payout_status or self.status,
            "autoDisableOnLimit": self.auto_disable_on_limit,
            "notes": self.notes,
            "commissionPercent": float(self.commission_percent or 0),
            "updatedBy": self.updated_by,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }

    def to_allocation_dict(self, merchant_name: str = "") -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "merchantEmail": self.merchant_email,
            "merchantName": merchant_name,
            "midPoolId": self.mid_pool_id,
            "gatewayName": self.gateway_name,
            "midId": self.mid_id,
            "merchantLimit": float(self.volume_limit or self.max_amount or 0),
            "commissionPercent": float(self.commission_percent or 0),
            "status": self.status,
            "payinStatus": self.payin_status or self.status,
            "payoutStatus": self.payout_status or self.status,
            "notes": self.notes,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class PaymentLink(TimestampMixin, db.Model):
    __tablename__ = "payment_links"

    id = db.Column(db.Integer, primary_key=True)
    link_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    merchant_email = db.Column(db.String(255), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False, default="Payment")
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    currency = db.Column(db.String(12), nullable=False, default="INR")
    status = db.Column(db.String(32), nullable=False, default="active")
    customer_name = db.Column(db.String(160), nullable=False, default="")
    customer_email = db.Column(db.String(255), nullable=False, default="")
    notify_url = db.Column(db.Text, nullable=False, default="")
    callback_secret = db.Column(db.String(255), nullable=False, default="")
    success_redirect_url = db.Column(db.Text, nullable=False, default="")
    failed_redirect_url = db.Column(db.Text, nullable=False, default="")
    merchant_mid_allocation_id = db.Column(db.String(80), nullable=False, default="")

    def to_dict(self, *, paybook: dict | None = None) -> dict:
        mid_label = "Auto"
        if str(self.merchant_mid_allocation_id or "").isdigit():
            route = db.session.get(PipeRoute, int(self.merchant_mid_allocation_id))
            if route and route.merchant_email == self.merchant_email:
                index = (
                    PipeRoute.query.filter_by(merchant_email=self.merchant_email)
                    .filter(PipeRoute.created_at <= route.created_at)
                    .count()
                )
                mid_label = f"MID {index or 1}"
        result = {
            "_id": str(self.id),
            "id": str(self.id),
            "linkId": self.link_id,
            "merchantEmail": self.merchant_email,
            "title": self.title,
            "amount": float(self.amount or 0),
            "currency": self.currency,
            "status": self.status,
            "customerName": self.customer_name,
            "customerEmail": self.customer_email,
            "notifyUrl": self.notify_url,
            "callbackSecret": self.callback_secret,
            "successRedirectUrl": self.success_redirect_url,
            "failedRedirectUrl": self.failed_redirect_url,
            "merchantMidAllocationId": self.merchant_mid_allocation_id,
            "merchantMidLabel": mid_label,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }
        if paybook is not None:
            result["paybook"] = paybook
        return result


def iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def optional_float(value):
    if value is None:
        return None
    return float(value)


class OtpDevice(TimestampMixin, db.Model):
    __tablename__ = "otp_devices"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone_number = db.Column(db.String(40), nullable=False, default="")
    device_model = db.Column(db.String(160), nullable=False, default="")
    device_manufacturer = db.Column(db.String(160), nullable=False, default="")
    os_version = db.Column(db.String(80), nullable=False, default="")
    app_version = db.Column(db.String(80), nullable=False, default="")
    network_type = db.Column(db.String(40), nullable=False, default="")
    battery_level = db.Column(db.Integer, nullable=True)
    battery_status = db.Column(db.String(40), nullable=False, default="")
    latitude = db.Column(db.Numeric(10, 7), nullable=True)
    longitude = db.Column(db.Numeric(10, 7), nullable=True)
    location_accuracy = db.Column(db.Numeric(10, 2), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="offline", index=True)
    last_seen_at = db.Column(db.DateTime(timezone=True), nullable=True)
    alerts_enabled = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "deviceId": self.device_id,
            "phoneNumber": self.phone_number,
            "deviceModel": self.device_model,
            "deviceManufacturer": self.device_manufacturer,
            "osVersion": self.os_version,
            "appVersion": self.app_version,
            "networkType": self.network_type,
            "batteryLevel": self.battery_level,
            "batteryStatus": self.battery_status,
            "latitude": optional_float(self.latitude),
            "longitude": optional_float(self.longitude),
            "locationAccuracy": optional_float(self.location_accuracy),
            "status": self.status,
            "lastSeenAt": iso(self.last_seen_at),
            "alertsEnabled": self.alerts_enabled,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class OtpEvent(TimestampMixin, db.Model):
    __tablename__ = "otp_events"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(120), nullable=False, index=True)
    otp_code = db.Column(db.String(20), nullable=False)
    sender = db.Column(db.String(80), nullable=False, index=True)
    message_body = db.Column(db.Text, nullable=False, default="")
    source = db.Column(db.String(40), nullable=False, default="sms")
    package_name = db.Column(db.String(160), nullable=False, default="")
    timestamp = db.Column(db.BigInteger, nullable=False, index=True)
    received_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "deviceId": self.device_id,
            "otpCode": self.otp_code,
            "sender": self.sender,
            "messageBody": self.message_body,
            "source": self.source,
            "packageName": self.package_name,
            "timestamp": self.timestamp,
            "receivedAt": iso(self.received_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class OtpAlert(TimestampMixin, db.Model):
    __tablename__ = "otp_alerts"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(120), nullable=False, index=True)
    alert_type = db.Column(db.String(80), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False, default="")
    phone_number = db.Column(db.String(40), nullable=False, default="")
    severity = db.Column(db.String(40), nullable=False, default="info")
    network_type = db.Column(db.String(40), nullable=False, default="")
    timestamp = db.Column(db.BigInteger, nullable=False, index=True)
    received_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "deviceId": self.device_id,
            "type": self.alert_type,
            "message": self.message,
            "phoneNumber": self.phone_number,
            "severity": self.severity,
            "networkType": self.network_type,
            "timestamp": self.timestamp,
            "receivedAt": iso(self.received_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


class DeviceActivationCode(TimestampMixin, db.Model):
    __tablename__ = "device_activation_codes"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    device_id = db.Column(db.String(120), nullable=True, index=True)
    phone_number = db.Column(db.String(40), nullable=False, default="")
    status = db.Column(db.String(32), nullable=False, default="unused", index=True)  # unused, used, reset
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    reset_at = db.Column(db.DateTime(timezone=True), nullable=True)
    notes = db.Column(db.Text, nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "_id": str(self.id),
            "id": str(self.id),
            "code": self.code,
            "deviceId": self.device_id or "",
            "phoneNumber": self.phone_number,
            "status": self.status,
            "usedAt": iso(self.used_at),
            "resetAt": iso(self.reset_at),
            "notes": self.notes,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }


def ensure_test_admin(email: str, password: str) -> User:
    email = email.strip().lower()
    legacy_email = "test@test.com"
    if email != legacy_email:
        legacy = User.query.filter_by(email=legacy_email).first()
        if legacy and legacy.role == "admin" and legacy.name == "Test Admin":
            db.session.delete(legacy)

    user = User.query.filter_by(email=email).first()
    password_hash = generate_password_hash(password)
    if user:
        user.name = "Test Admin"
        user.password_hash = password_hash
        user.role = "admin"
        user.status = "active"
        user.merchant_email = ""
        return user

    user = User(
        name="Test Admin",
        email=email,
        password_hash=password_hash,
        role="admin",
        merchant_email="",
        status="active",
    )
    db.session.add(user)
    return user
