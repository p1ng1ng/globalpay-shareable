"""
Wpay merchant API test script.

Creates a payment link (and, if an active bank-rail/MID route exists for
the merchant, auto-initiates a payment intent) for a given amount.

Usage:
    python3 create_payment.py --amount 1500
"""

import argparse
import json

import requests

# Backend base URL — points at the ngrok tunnel in front of the local
# Flask backend (see backend/README.md for local dev instructions).
BASE_URL = "https://han-paleoentomological-lois.ngrok-free.dev"

# Merchant API key (Bearer token). Found under Merchant > API Credentials
# in the dashboard, or via the Merchant.api_key column in the database.
API_KEY = "gp_live_w3x68IK8vYbAwnQV6GortE-UjU1WKnSu"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
}


def create_payment_link(amount: float, currency: str = "INR") -> dict:
    body = {
        "title": f"ORDER-{int(amount)}",
        "amount": amount,
        "currency": currency,
        "customerName": "Test Customer",
        "customerEmail": "customer@example.com",
    }
    resp = requests.post(f"{BASE_URL}/api/payment-links", headers=HEADERS, json=body)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Wpay payment link/intent")
    parser.add_argument("--amount", type=float, required=True, help="Payment amount")
    parser.add_argument("--currency", default="INR", help="Currency code (default: INR)")
    args = parser.parse_args()

    data = create_payment_link(args.amount, args.currency)
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
