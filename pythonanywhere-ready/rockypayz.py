from __future__ import annotations

import json
from decimal import Decimal
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request

from gateway_http import open_gateway_url


DEFAULT_BASE_URL = "https://api.rockypayz.shop"


class RockyPayzError(RuntimeError):
    pass


class _RockyPayzPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image_sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "img":
            return
        attributes = dict(attrs)
        source = str(attributes.get("src") or "").strip()
        if source:
            self.image_sources.append(source)


def _value(credentials: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = str(credentials.get(key) or "").strip()
        if value:
            return value
    return default


def _required(credentials: dict, *keys: str) -> str:
    value = _value(credentials, *keys)
    if not value:
        raise RockyPayzError(f"Missing gateway credential: {keys[0]}")
    return value


def _post_json(url: str, body: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Wpay-RockyPayz/1.0",
        },
        method="POST",
    )

    try:
        with open_gateway_url(request, timeout=20) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RockyPayzError(
            f"RockyPayz returned HTTP {error.code}: {raw[:500]}"
        ) from error
    except URLError as error:
        raise RockyPayzError(f"Unable to reach RockyPayz: {error.reason}") from error

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RockyPayzError("RockyPayz returned an invalid JSON response") from error

    if not isinstance(parsed, dict):
        raise RockyPayzError("RockyPayz returned an unexpected response")
    return parsed


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


def payment_target(payload: dict) -> str:
    return _find_value(
        payload,
        "upiLink",
        "upi_link",
        "upiIntent",
        "upi_intent",
        "intent",
        "data.upiLink",
        "data.upi_link",
        "data.upiIntent",
        "data.intent",
        "payment_url",
        "paymentUrl",
        "data.payment_url",
        "data.paymentUrl",
        "url",
        "data.url",
    )


def extract_upi_intent(hosted_payment_url: str) -> str:
    parsed_url = urlparse(hosted_payment_url)
    if (
        parsed_url.scheme != "https"
        or parsed_url.hostname not in {"api.rockypayz.shop", "pay.rockypayz.shop"}
    ):
        return ""

    request = Request(
        hosted_payment_url,
        headers={
            "Accept": "text/html",
            "User-Agent": "Wpay-RockyPayz/1.0",
        },
    )
    try:
        with open_gateway_url(request, timeout=15) as response:
            html = response.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError):
        return ""

    parser = _RockyPayzPageParser()
    parser.feed(html)

    for source in parser.image_sources:
        source_url = urlparse(source)
        if source_url.hostname != "api.qrserver.com":
            continue
        candidate = str(parse_qs(source_url.query).get("data", [""])[0]).strip()
        if candidate.lower().startswith("upi://pay?"):
            return candidate
    return ""


def create_order(
    *,
    client_txn_id: str,
    amount: Decimal | float,
    customer_mobile: str,
    credentials: dict,
) -> dict:
    base_url = _value(credentials, "baseUrl", default=DEFAULT_BASE_URL).rstrip("/")
    url = _value(
        credentials, "createOrderUrl", default=f"{base_url}/api/v1/create_order"
    )
    route = int(_value(credentials, "payinRoute", "route", default="2"))
    body = {
        "mid": _required(credentials, "mid"),
        "apikey": _required(credentials, "apiKey", "apikey"),
        "route": route,
        "client_txn_id": client_txn_id,
        "amount": f"{Decimal(str(amount)):.2f}",
        "customer_mobile": customer_mobile,
    }
    response = _post_json(url, body)
    target = payment_target(response)
    if not target:
        message = _find_value(response, "msg", "message") or "payment URL missing"
        raise RockyPayzError(f"RockyPayz could not create the order: {message}")
    return response


def check_order_status(client_txn_id: str, *, credentials: dict) -> dict:
    base_url = _value(credentials, "baseUrl", default=DEFAULT_BASE_URL).rstrip("/")
    url = _value(
        credentials, "statusUrl", default=f"{base_url}/api/v1/check_order_status"
    )
    route = int(
        _value(credentials, "statusRoute", "payinRoute", "route", default="2")
    )
    body = {
        "mid": _required(credentials, "mid"),
        "apikey": _required(credentials, "apiKey", "apikey"),
        "route": route,
        "client_txn_id": client_txn_id,
    }
    return _post_json(url, body)


def submit_payout(
    *,
    payout_id: str,
    amount: Decimal | float,
    beneficiary_name: str,
    account_number: str,
    ifsc: str,
    customer_mobile: str,
    credentials: dict,
    remarks: str = "Wpay payout",
) -> dict:
    base_url = _value(credentials, "baseUrl", default=DEFAULT_BASE_URL).rstrip("/")
    url = _value(
        credentials,
        "payoutUrl",
        default=f"{base_url}/api/v-secure-core/transfer",
    )
    route = int(_value(credentials, "payoutRoute", default="1"))
    body = {
        "mid": _required(credentials, "mid"),
        "apikey": _required(credentials, "apiKey", "apikey"),
        "route": route,
        "ref_no": payout_id,
        "amount": f"{Decimal(str(amount)):.2f}",
        "customer_name": beneficiary_name,
        "account_number": account_number,
        "ifsc": ifsc,
        "customer_mobile": customer_mobile,
        "remarks": remarks or "Wpay payout",
    }
    return _post_json(url, body)


def check_payout_status(client_txn_id: str, *, credentials: dict) -> dict:
    base_url = _value(credentials, "baseUrl", default=DEFAULT_BASE_URL).rstrip("/")
    url = _value(
        credentials,
        "payoutStatusUrl",
        "statusUrl",
        default=f"{base_url}/api/v1/check_order_status",
    )
    route = int(_value(credentials, "payoutStatusRoute", default="0"))
    body = {
        "mid": _required(credentials, "mid"),
        "apikey": _required(credentials, "apiKey", "apikey"),
        "route": route,
        "client_txn_id": client_txn_id,
    }
    return _post_json(url, body)


def transaction_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "Txn_ID",
        "TXN_ID",
        "txnid",
        "txn_id",
        "client_txn_id",
        "clientTxnId",
        "transactionId",
        "data.Txn_ID",
        "data.TXN_ID",
        "data.txnid",
        "data.txn_id",
        "data.client_txn_id",
        "data.transactionId",
    )


def payout_reference(payload: dict) -> str:
    return _find_value(
        payload,
        "Txn_ID",
        "TXN_ID",
        "txn_id",
        "client_txn_id",
        "clientTxnId",
        "ref_no",
        "payoutId",
        "payout_id",
        "data.Txn_ID",
        "data.TXN_ID",
        "data.txn_id",
        "data.client_txn_id",
        "data.ref_no",
        "data.payoutId",
    )


def transaction_utr(payload: dict) -> str:
    return _find_value(
        payload,
        "UTR",
        "utr",
        "rrn",
        "bank_ref_no",
        "data.UTR",
        "data.utr",
        "data.rrn",
    )


def transaction_status(payload: dict) -> str:
    return _find_value(
        payload,
        "TXN_Status",
        "Txn_Status",
        "txn_status",
        "paymentStatus",
        "data.TXN_Status",
        "data.status",
        "status",
    ).lower()


def is_paid(payload: dict) -> bool:
    return transaction_status(payload) in {
        "success",
        "successful",
        "paid",
        "captured",
        "approved",
        "completed",
    }


def is_failed(payload: dict) -> bool:
    return transaction_status(payload) in {
        "failed",
        "failure",
        "declined",
        "cancelled",
        "canceled",
        "expired",
    }
