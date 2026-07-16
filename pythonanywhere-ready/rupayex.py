from __future__ import annotations

import json
import re
from html import unescape
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlparse
from urllib.request import Request

from gateway_http import open_gateway_url


DEFAULT_BASE_URL = "https://rupayex.net/api"


class RupayExError(RuntimeError):
    pass


def _value(credentials: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = str(credentials.get(key) or "").strip()
        if value:
            return value
    return default


def _base_url(credentials: dict) -> str:
    return _value(credentials, "baseUrl", default=DEFAULT_BASE_URL).rstrip("/")


def _required_token(credentials: dict) -> str:
    token = _value(credentials, "apiKey", "apiToken", "userToken")
    if not token:
        raise RupayExError("Missing gateway credential: apiKey")
    return token


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


def _parse_response(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}
    return parsed if isinstance(parsed, dict) else {"raw": parsed}


def _get_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Wpay-RupayEx/1.0",
        },
        method="GET",
    )
    try:
        with open_gateway_url(request, timeout=15) as response:
            return response.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError):
        return ""


def _request_form(method: str, endpoint: str, fields: dict, credentials: dict) -> dict:
    token = _required_token(credentials)
    url = f"{_base_url(credentials)}/{endpoint.lstrip('/')}"
    encoded = urlencode(fields).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Wpay-RupayEx/1.0",
        "X-Api-Token": token,
    }
    request_url = url
    data = encoded
    if method.upper() == "GET":
        request_url = f"{url}?{encoded.decode('utf-8')}"
        data = None
    request = Request(request_url, data=data, headers=headers, method=method.upper())

    try:
        with open_gateway_url(request, timeout=25) as response:
            raw = response.read().decode("utf-8", errors="replace")
            parsed = _parse_response(raw)
            parsed["_http_status"] = response.status
            return parsed
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RupayExError(f"RupayEx returned HTTP {error.code}: {raw[:500]}") from error
    except URLError as error:
        raise RupayExError(f"Unable to reach RupayEx: {error.reason}") from error


def create_order(
    *,
    order_id: str,
    amount: Decimal | float,
    redirect_url: str,
    credentials: dict,
    customer_mobile: str = "",
    remark1: str = "Wpay",
) -> dict:
    token = _required_token(credentials)
    body = {
        "user_token": token,
        "amount": f"{Decimal(str(amount)):.2f}",
        "order_id": order_id,
        "redirect_url": redirect_url,
    }
    if customer_mobile:
        body["customer_mobile"] = customer_mobile
    if remark1:
        body["remark1"] = remark1
    response = _request_form("POST", "create-order", body, credentials)
    if not payment_url(response):
        message = _find_value(response, "message", "msg", "data.message") or "payment URL missing"
        raise RupayExError(f"RupayEx could not create the order: {message}")
    return response


def check_order_status(order_id: str, *, credentials: dict) -> dict:
    token = _required_token(credentials)
    return _request_form(
        "GET",
        "order-status",
        {
            "user_token": token,
            "order_id": order_id,
        },
        credentials,
    )


def submit_payout(
    *,
    payout_id: str,
    amount: Decimal | float,
    beneficiary_name: str,
    credentials: dict,
    account_number: str = "",
    ifsc: str = "",
    bank_name: str = "",
    upi_id: str = "",
) -> dict:
    token = _required_token(credentials)
    method = "upi" if upi_id else "bank"
    body = {
        "user_token": token,
        "amount": f"{Decimal(str(amount)):.2f}",
        "method": method,
        "account_holder": beneficiary_name,
        "payout_id": payout_id,
    }
    if method == "upi":
        body["upi_id"] = upi_id
    else:
        body["account_number"] = account_number
        body["ifsc_code"] = ifsc
        body["bank_name"] = bank_name
    return _request_form("POST", "create-payout", body, credentials)


def check_payout_status(payout_id: str, *, credentials: dict) -> dict:
    token = _required_token(credentials)
    return _request_form(
        "GET",
        "payout-status",
        {
            "user_token": token,
            "payout_id": payout_id,
        },
        credentials,
    )


def wallet_balance(*, credentials: dict) -> dict:
    token = _required_token(credentials)
    return _request_form(
        "GET", "wallet-balance", {"user_token": token}, credentials
    )


def payment_url(payload: dict) -> str:
    return _find_value(payload, "payment_url", "paymentUrl", "url", "data.payment_url", "data.url")


def extract_upi_intent(hosted_payment_url: str) -> str:
    value = str(hosted_payment_url or "").strip()
    if value.lower().startswith("upi://pay?"):
        return value
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""

    html = _get_text(value)
    if not html:
        return ""

    candidates = [html]
    candidates.extend(unquote(item) for item in re.findall(r"upi%3A%2F%2Fpay%3F[^'\"<>\s]+", html, flags=re.I))
    candidates.extend(unescape(item) for item in re.findall(r"upi://pay\?[^'\"<>\s]+", html, flags=re.I))

    for image_url in re.findall(r"https?://[^'\"<>\s]+", html, flags=re.I):
        decoded = unescape(unquote(image_url))
        if "upi://pay?" in decoded.lower():
            candidates.append(decoded)
        parsed_image = urlparse(decoded)
        for values in parse_qs(parsed_image.query).values():
            for item in values:
                if item.lower().startswith("upi://pay?"):
                    candidates.append(item)

    for candidate in candidates:
        match = re.search(r"upi://pay\?[^'\"<>\s]+", unescape(candidate), flags=re.I)
        if match:
            return match.group(0).replace("&amp;", "&")
    return ""


def order_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "order_id",
        "orderId",
        "merchant_order_id",
        "data.order_id",
        "data.orderId",
    )


def payout_reference(payload: dict) -> str:
    return _find_value(payload, "payout_id", "payoutId", "data.payout_id", "data.payoutId")


def transaction_utr(payload: dict) -> str:
    return _find_value(payload, "utr", "UTR", "data.utr", "data.UTR")


def transaction_status(payload: dict) -> str:
    return _find_value(
        payload,
        "payment_status",
        "paymentStatus",
        "status",
        "data.payment_status",
        "data.status",
        "message",
    ).lower()


def is_paid(payload: dict) -> bool:
    status = transaction_status(payload)
    return any(part in status for part in ("success", "paid", "captured", "completed"))


def is_failed(payload: dict) -> bool:
    status = transaction_status(payload)
    return any(part in status for part in ("failed", "fail", "cancel", "expired", "rejected"))


def payout_status(payload: dict) -> str:
    status = transaction_status(payload)
    if any(part in status for part in ("success", "paid", "completed")):
        return "paid"
    if any(part in status for part in ("failed", "fail", "rejected", "cancel")):
        return "failed"
    if "process" in status or "approved" in status:
        return "processing"
    return "pending"
