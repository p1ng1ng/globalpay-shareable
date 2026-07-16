from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class MerchantWebhookError(RuntimeError):
    pass


def callback_signature(secret: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def _validate_callback_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise MerchantWebhookError("Merchant callback URL must use HTTP or HTTPS")

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443)
        }
    except socket.gaierror as error:
        raise MerchantWebhookError("Merchant callback hostname could not be resolved") from error

    for address in addresses:
        ip = ipaddress.ip_address(address)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            raise MerchantWebhookError("Merchant callback URL cannot target a private network")


def deliver_callback(url: str, secret: str, payload: dict) -> dict:
    _validate_callback_url(url)
    raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    request = Request(
        url,
        data=raw_body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Wpay-Merchant-Webhook/1.0",
            "X-Wpay-Signature": callback_signature(secret, raw_body),
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            return {
                "delivered": 200 <= response.status < 300,
                "httpStatus": response.status,
                "response": response_body[:2000],
            }
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        return {
            "delivered": False,
            "httpStatus": error.code,
            "response": response_body[:2000],
        }
    except URLError as error:
        raise MerchantWebhookError(f"Merchant callback failed: {error.reason}") from error
