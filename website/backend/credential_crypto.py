from __future__ import annotations

import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app


class CredentialEncryptionError(RuntimeError):
    pass


def _fernet() -> Fernet:
    material = str(
        current_app.config.get("GATEWAY_CREDENTIAL_ENCRYPTION_KEY")
        or current_app.config.get("JWT_SECRET")
        or current_app.config.get("SECRET_KEY")
        or ""
    ).strip()
    if not material:
        raise CredentialEncryptionError(
            "Gateway credential encryption key is not configured"
        )
    key = base64.urlsafe_b64encode(hashlib.sha256(material.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_credentials(values: dict[str, str]) -> str:
    payload = json.dumps(values, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    return _fernet().encrypt(payload).decode("ascii")


def decrypt_credentials(token: str) -> dict[str, str]:
    if not token:
        return {}
    try:
        raw = _fernet().decrypt(token.encode("ascii"))
        parsed = json.loads(raw.decode("utf-8"))
    except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CredentialEncryptionError(
            "Stored gateway credentials could not be decrypted"
        ) from error
    if not isinstance(parsed, dict):
        raise CredentialEncryptionError("Stored gateway credentials are invalid")
    return {
        str(key): str(value)
        for key, value in parsed.items()
        if str(key).strip() and value is not None
    }
