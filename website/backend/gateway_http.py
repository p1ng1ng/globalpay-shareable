from __future__ import annotations

import os
from base64 import b64encode
from urllib.parse import unquote, urlsplit, urlunsplit
from urllib.request import ProxyHandler, Request, build_opener, urlopen


def open_gateway_url(request: Request, *, timeout: int):
    proxy_url = str(os.getenv("GATEWAY_OUTBOUND_PROXY_URL") or "").strip()
    if not proxy_url:
        return urlopen(request, timeout=timeout)

    parsed = urlsplit(proxy_url)
    proxy_host = parsed.hostname or ""
    if parsed.port:
        proxy_host = f"{proxy_host}:{parsed.port}"
    sanitized_proxy_url = urlunsplit(
        (
            parsed.scheme or "http",
            proxy_host,
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )
    if parsed.username is not None:
        credentials = f"{unquote(parsed.username)}:{unquote(parsed.password or '')}"
        encoded_credentials = b64encode(credentials.encode("utf-8")).decode("ascii")
        request.add_header(
            "Proxy-Authorization",
            f"Basic {encoded_credentials}",
        )

    opener = build_opener(
        ProxyHandler(
            {
                "http": sanitized_proxy_url,
                "https": sanitized_proxy_url,
            }
        )
    )
    return opener.open(request, timeout=timeout)
