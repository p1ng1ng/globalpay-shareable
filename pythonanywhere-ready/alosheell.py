from __future__ import annotations

import json
import os
from decimal import Decimal
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.request import Request

from gateway_http import open_gateway_url


class AlosheellError(RuntimeError):
    pass


def _value(credentials: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = str(credentials.get(key) or "").strip()
        if value:
            return value
    return default


def _find_value(payload: dict, *paths: str) -> str:
    for path in paths:
        value: object = payload
        for part in path.split("."):
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(part)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _parse_json_response(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise AlosheellError("Alosheell returned an invalid JSON response") from error
    if not isinstance(parsed, dict):
        raise AlosheellError("Alosheell returned an unexpected response")
    return parsed


def _post_json(url: str, body: dict, *, proxy_secret: str = "") -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Wpay-Alosheell/1.0",
    }
    if proxy_secret:
        headers["x-proxy-secret"] = proxy_secret

    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with open_gateway_url(request, timeout=25) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise AlosheellError(
            f"Alosheell returned HTTP {error.code}: {raw[:500]}"
        ) from error
    except URLError as error:
        raise AlosheellError(f"Unable to reach Alosheell: {error.reason}") from error

    return _parse_json_response(raw)


def _post_form(url: str, body: dict, *, authorization: str = "") -> dict:
    boundary = f"----WpayAlosheell{uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in body.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8")
        )
        chunks.append(str(value if value is not None else "").encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    payload = b"".join(chunks)

    headers = {
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "Wpay-Alosheell/1.0",
    }
    if authorization:
        headers["Authorization"] = authorization

    request = Request(url, data=payload, headers=headers, method="POST")
    try:
        with open_gateway_url(request, timeout=25) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise AlosheellError(
            f"Alosheell returned HTTP {error.code}: {raw[:500]}"
        ) from error
    except URLError as error:
        raise AlosheellError(f"Unable to reach Alosheell: {error.reason}") from error

    return _parse_json_response(raw)


def clean_customer_name(value: object) -> str:
    text = "".join(char if char.isalpha() or char == " " else " " for char in str(value or ""))
    text = " ".join(text.split())
    return text if len(text) >= 3 else "Customer"


def clean_mobile(value: object) -> str:
    digits = "".join(char for char in str(value or "") if char.isdigit())[-10:]
    return digits if len(digits) == 10 else "9999999999"


def payin_amount(value: Decimal | float) -> str:
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    return format(amount, "f").rstrip("0").rstrip(".") or "0"


def create_order(
    *,
    client_reference_no: str,
    amount: Decimal | float,
    customer_name: str,
    customer_email: str,
    customer_mobile: str,
    credentials: dict,
) -> dict:
    proxy_url = _value(credentials, "proxyUrl", default=os.getenv("ALOSHEELL_PROXY_URL", ""))
    proxy_secret = _value(
        credentials,
        "proxySecret",
        default=os.getenv("ALOSHEELL_PROXY_SECRET", ""),
    )
    user_ip = _value(
        credentials,
        "userIp",
        default=os.getenv("ALOSHEELL_USER_IP", ""),
    )
    request_body = {
        "clientReferenceNo": client_reference_no,
        "amount": payin_amount(amount),
        "customer_name": clean_customer_name(customer_name),
        "customer_email": str(customer_email or "customer@example.com").strip()
        or "customer@example.com",
        "customer_mobile": clean_mobile(customer_mobile),
        "user_ip": user_ip,
    }
    if proxy_url:
        response = _post_json(
            proxy_url,
            request_body,
            proxy_secret=proxy_secret,
        )
    else:
        token_url = _value(
            credentials,
            "tokenUrl",
            "generateTokenUrl",
            default=os.getenv("ALOSHEELL_TOKEN_URL")
            or "https://apipanel.alosheell.com/auth/user/generateToken",
        )
        payin_url = _value(
            credentials,
            "payinApiUrl",
            "payinUrl",
            default=os.getenv("ALOSHEELL_PAYIN_API_URL")
            or "https://apipanel.alosheell.com/api/v1/Payin",
        )
        user_name = _value(
            credentials,
            "userName",
            "user_name",
            "loginId",
            "mobile",
            default=os.getenv("ALOSHEELL_USER_NAME")
            or os.getenv("ALOSHEELL_MOBILE", ""),
        )
        password = _value(
            credentials,
            "password",
            default=os.getenv("ALOSHEELL_PASSWORD", ""),
        )
        token_key = _value(
            credentials,
            "tokenKey",
            "token_key",
            default=os.getenv("ALOSHEELL_TOKEN_KEY", ""),
        )
        if not user_name or not password or not token_key or not user_ip:
            raise AlosheellError("Missing Alosheell direct pay-in credentials")

        token_response = _post_form(
            token_url,
            {
                "user_name": user_name,
                "password": password,
            },
            authorization=token_key,
        )
        token = _find_value(token_response, "data.token", "token")
        if not token:
            message = _find_value(token_response, "message", "msg") or "token missing"
            raise AlosheellError(f"Alosheell token generation failed: {message}")

        response = _post_form(
            payin_url,
            {
                **request_body,
                "option": "INTENT",
                "token_key": token_key,
            },
            authorization=token,
        )
    if not payment_target(response):
        message = _find_value(
            response,
            "message",
            "gatewayResponse.message",
            "gatewayResponse.data.message",
        ) or "payment URL missing"
        raise AlosheellError(f"Alosheell could not create the order: {message}")
    return response


def submit_payout(
    *,
    payout_id: str,
    amount: Decimal | float,
    beneficiary_name: str,
    account_number: str,
    ifsc: str,
    bank_name: str,
    beneficiary_mobile: str,
    callback_url: str,
    credentials: dict,
    remarks: str = "Wpay payout",
) -> dict:
    token_url = _value(
        credentials,
        "tokenUrl",
        "generateTokenUrl",
        default=os.getenv("ALOSHEELL_TOKEN_URL")
        or "https://apipanel.alosheell.com/auth/user/generateToken",
    )
    payout_url = _value(
        credentials,
        "payoutApiUrl",
        "payoutUrl",
        default=os.getenv("ALOSHEELL_PAYOUT_API_URL")
        or os.getenv("ALOSHEELL_PAYOUT_URL")
        or "https://apipanel.alosheell.com/auth/payout/payoutApi",
    )
    user_name = _value(
        credentials,
        "userName",
        "user_name",
        "loginId",
        "mobile",
        default=os.getenv("ALOSHEELL_USER_NAME") or os.getenv("ALOSHEELL_MOBILE", ""),
    )
    password = _value(
        credentials,
        "password",
        default=os.getenv("ALOSHEELL_PASSWORD", ""),
    )
    token_key = _value(
        credentials,
        "tokenKey",
        "token_key",
        default=os.getenv("ALOSHEELL_TOKEN_KEY", ""),
    )
    if not user_name or not password:
        raise AlosheellError("Missing Alosheell payout username or password")
    if not token_key:
        raise AlosheellError("Missing Alosheell token_key")

    proxy_url = _value(
        credentials,
        "payoutProxyUrl",
        default=os.getenv("ALOSHEELL_PAYOUT_PROXY_URL", ""),
    )
    proxy_secret = _value(
        credentials,
        "payoutProxySecret",
        default=os.getenv("ALOSHEELL_PAYOUT_PROXY_SECRET")
        or os.getenv("ALOSHEELL_PROXY_SECRET", ""),
    )
    payout_body = {
        "beneName": beneficiary_name,
        "beneAccountNo": account_number,
        "beneifsc": ifsc,
        "benePhoneNo": clean_mobile(beneficiary_mobile),
        "beneBankName": bank_name or "",
        "clientReferenceNo": payout_id,
        "amount": money(amount),
        "fundTransferType": _value(
            credentials,
            "fundTransferType",
            default=os.getenv("ALOSHEELL_FUND_TRANSFER_TYPE") or "imps",
        ),
        "token_key": token_key,
        "lat": _value(
            credentials,
            "lat",
            "latitude",
            default=os.getenv("ALOSHEELL_LAT") or "22.8031731",
        ),
        "remarks": remarks or "Wpay payout",
        "long": _value(
            credentials,
            "long",
            "longitude",
            default=os.getenv("ALOSHEELL_LONG") or "22.8031731",
        ),
        "callbackUrl": callback_url,
    }
    if proxy_url:
        return _post_json(proxy_url, payout_body, proxy_secret=proxy_secret)

    if not token_url:
        raise AlosheellError("Missing Alosheell token URL")
    if not payout_url:
        raise AlosheellError("Missing Alosheell payout API URL")

    token_response = _post_form(
        token_url,
        {
            "user_name": user_name,
            "password": password,
        },
        authorization=token_key,
    )
    token = _find_value(token_response, "data.token", "token")
    if not token:
        message = _find_value(token_response, "message", "msg") or "token missing"
        raise AlosheellError(f"Alosheell token generation failed: {message}")

    payout_response = _post_form(
        payout_url,
        payout_body,
        authorization=token,
    )
    payout_response.setdefault("tokenResponseStatus", token_response.get("status"))
    return payout_response


def money(value: Decimal | float) -> float:
    return round(float(value or 0), 2)


def payment_target(payload: dict) -> str:
    return _find_value(
        payload,
        "upiLink",
        "paymentUrl",
        "gatewayResponse.data.data.url",
        "gatewayResponse.data.url",
        "data.data.url",
        "data.url",
        "url",
    )


def transaction_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "merchantTransactionId",
        "merchant_transaction_id",
        "merchanttransid",
        "merchantTransId",
        "id",
        "transactionId",
        "transaction_id",
        "Txn_ID",
        "txn_id",
        "data.merchantTransactionId",
        "data.merchanttransid",
        "data.merchantTransId",
        "data.id",
        "data.transactionId",
        "data.transaction_id",
        "result.merchantTransactionId",
        "result.transactionId",
        "gatewayResponse.data.data.merchantTransactionId",
        "gatewayResponse.data.merchantTransactionId",
    )


def client_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "clientReferenceNo",
        "client_reference_no",
        "clientid",
        "client_id",
        "order_id",
        "orderId",
        "referenceNo",
        "reference_no",
        "data.clientReferenceNo",
        "data.clientid",
        "data.client_id",
        "data.order_id",
        "result.clientReferenceNo",
        "result.order_id",
        "gatewayResponse.data.data.clientid",
        "gatewayResponse.data.clientid",
    )


def transaction_utr(payload: dict) -> str:
    return _find_value(
        payload,
        "utr",
        "utrno",
        "utrNo",
        "UTR",
        "rrn",
        "RRN",
        "bank_ref_no",
        "bankReferenceNo",
        "bank_reference_no",
        "npciRefId",
        "npci_ref_id",
        "data.utr",
        "data.utrno",
        "data.utrNo",
        "data.UTR",
        "data.rrn",
        "data.RRN",
        "data.bank_ref_no",
        "result.utr",
        "result.rrn",
        "data.data.utrNo",
        "data.data.utr",
    )


def transaction_status(payload: dict) -> str:
    status_text = " ".join(
        [
            _find_value(
                payload,
                "status",
                "txn_status",
                "TXN_Status",
                "payment_status",
                "data.status",
                "data.payment_status",
                "result.status",
                "gatewayResponse.status",
                "gatewayResponse.data.status",
            ),
            _find_value(
                payload,
                "message",
                "data.message",
                "result.message",
                "gatewayResponse.message",
            ),
        ]
    ).lower()
    if any(part in status_text for part in ("success", "paid", "captured", "approved")):
        return "paid"
    if any(part in status_text for part in ("fail", "declined", "cancel", "rejected", "expired")):
        return "failed"
    return "pending"


def is_paid(payload: dict) -> bool:
    return transaction_status(payload) == "paid"


def is_failed(payload: dict) -> bool:
    return transaction_status(payload) == "failed"


def callback_amount(payload: dict, fallback: float) -> float:
    value = _find_value(
        payload,
        "amount",
        "txn_amount",
        "TXN_amount",
        "payment_amount",
        "data.amount",
        "result.amount",
        "gatewayResponse.data.amount",
    )
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def payout_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "clientTransid",
        "clientTransId",
        "client_transid",
        "clientTxnId",
        "client_txn_id",
        "payoutId",
        "payout_id",
        "merchantPayoutId",
        "merchant_payout_id",
        "merchantTxnId",
        "merchant_txn_id",
        "transactionId",
        "transaction_id",
        "clientReferenceNo",
        "client_reference_no",
        "data.payoutId",
        "data.merchantPayoutId",
        "data.merchantTxnId",
        "data.transactionId",
        "data.clientReferenceNo",
        "data.data.clientReferenceNo",
        "data.data.clientTransid",
        "data.data.merchantid",
    )


def payout_provider_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "merchantid",
        "merchantId",
        "merchant_id",
        "orderId",
        "order_id",
        "providerTxnId",
        "provider_txn_id",
        "gatewayTransactionId",
        "gateway_transaction_id",
        "transactionId",
        "transaction_id",
        "data.providerTxnId",
        "data.transactionId",
        "data.data.referenceId",
        "data.data.clientTransid",
        "data.data.merchantid",
    )


def payout_status(payload: dict) -> str:
    status = _find_value(
        payload,
        "status",
        "payoutStatus",
        "payout_status",
        "data.status",
        "data.payoutStatus",
        "data.data.status",
    ).lower()
    normalized_status = status.replace("-", "_").replace(" ", "_")
    if normalized_status in {
        "success",
        "successful",
        "paid",
        "completed",
        "transfer_success",
        "1",
    }:
        return "paid"
    status_code = _find_value(payload, "StatusCode", "statusCode", "code").lower()
    if normalized_status in {
        "failed",
        "failure",
        "rejected",
        "error",
        "transfer_failed",
        "false",
        "0",
        "2",
    }:
        return "failed"
    if status_code in {"02", "2", "failed", "error"}:
        return "failed"
    return "processing"
