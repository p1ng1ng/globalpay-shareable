from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable
import ipaddress

import jwt
from flask import current_app, g, jsonify, request
from werkzeug.security import check_password_hash

from models import Merchant, User


COOKIE_NAMES = ("Wpay_token", "token")


def create_token(user: User) -> str:
    payload = {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "merchantEmail": user.merchant_email or user.email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def token_from_request() -> str:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()

    for name in ("X-API-Key", "X-Merchant-Key", "X-Wpay-API-Key"):
        value = request.headers.get(name, "").strip()
        if value:
            return value

    for name in COOKIE_NAMES:
        value = request.cookies.get(name)
        if value:
            return value
    return ""


def client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    real_ip = request.headers.get("X-Real-IP", "")
    cf_ip = request.headers.get("CF-Connecting-IP", "")
    value = (forwarded_for.split(",", 1)[0].strip() or real_ip.strip() or cf_ip.strip() or request.remote_addr or "")
    return value.replace("::ffff:", "").strip()


def ip_whitelist_allows(raw_whitelist: str, address: str) -> bool:
    entries = [item.strip() for item in (raw_whitelist or "").split(",") if item.strip()]
    if not entries:
        return True
    try:
        client_address = ipaddress.ip_address(address)
    except ValueError:
        return False
    for entry in entries[:5]:
        try:
            if "/" in entry:
                if client_address in ipaddress.ip_network(entry, strict=False):
                    return True
            elif client_address == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def current_user() -> dict | None:
    if getattr(g, "current_user", None) is not None:
        return g.current_user

    token = token_from_request()
    if not token:
        g.current_user = None
        return None

    payload = decode_token(token)
    if not payload:
        merchant = Merchant.query.filter(
            (Merchant.api_key == token) | (Merchant.merchant_key == token)
        ).first()
        if not merchant or merchant.status != "active":
            g.current_user = None
            return None
        request_ip = client_ip()
        if not ip_whitelist_allows(merchant.api_ip_whitelist, request_ip):
            g.auth_error = {
                "status": 403,
                "message": f"IP not whitelisted for this merchant API key: {request_ip or 'unknown'}",
                "clientIp": request_ip,
            }
            g.current_user = None
            return None
        payload = {
            "id": str(merchant.user_id or merchant.id),
            "name": merchant.business_name,
            "email": merchant.email,
            "role": "merchant",
            "merchantEmail": merchant.email,
            "authType": "apiKey",
        }

    if payload.get("role") == "merchant":
        merchant = Merchant.query.filter_by(
            email=str(payload.get("merchantEmail") or payload.get("email") or "").lower()
        ).first()
        if not merchant or merchant.status != "active":
            g.auth_error = {
                "status": 403,
                "message": "Merchant account is pending admin approval",
                "clientIp": client_ip(),
            }
            g.current_user = None
            return None

    g.current_user = payload
    return payload


def require_roles(*roles: str):
    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                auth_error = getattr(g, "auth_error", None)
                if auth_error:
                    return jsonify(
                        {
                            "success": False,
                            "message": auth_error.get("message") or "Access denied",
                            "clientIp": auth_error.get("clientIp", ""),
                        }
                    ), int(auth_error.get("status") or 403)
                return jsonify({"success": False, "message": "Unauthorized"}), 401
            if roles and user.get("role") not in roles:
                return jsonify({"success": False, "message": "Access denied"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def verify_password(user: User, password: str) -> bool:
    try:
        return check_password_hash(user.password_hash, password)
    except ValueError:
        return False


def set_auth_cookies(response, token: str):
    cookie_kwargs = {
        "httponly": True,
        "secure": bool(current_app.config["COOKIE_SECURE"]),
        "samesite": "Lax",
        "path": "/",
        "max_age": 60 * 60 * 24 * 7,
    }
    for name in COOKIE_NAMES:
        response.set_cookie(name, token, **cookie_kwargs)
    return response


def clear_auth_cookies(response):
    for name in COOKIE_NAMES:
        response.delete_cookie(name, path="/")
    return response
