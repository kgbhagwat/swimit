#!/usr/bin/env python3
"""Create SwimIT WhatsApp Cloud API templates on the connected WABA.
Reads WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID from the environment.
Does not print the token.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

def load_dotenv(path: str) -> None:
    """Load KEY=VALUE lines into os.environ without printing values."""
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            os.environ.setdefault(key, value)


for arg in sys.argv[1:]:
    if os.path.isfile(arg):
        load_dotenv(arg)

API = os.environ.get("WHATSAPP_API_VERSION", "v21.0").strip() or "v21.0"
TOKEN = os.environ.get("WHATSAPP_TOKEN", "").strip()
PHONE_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
WABA = os.environ.get("WHATSAPP_WABA_ID", "").strip() or "1031245536486079"


def graph(path: str, method: str = "GET", payload: dict | None = None) -> dict:
    url = f"https://graph.facebook.com/{API}/{path}"
    data = None
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"error": {"message": body, "code": err.code}}


def utility(name: str, body: str, example_row: list[str], language: str = "en") -> dict:
    return {
        "name": name,
        "language": language,
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": body,
                "example": {"body_text": [example_row]},
            }
        ],
    }


def marketing(name: str, body: str, example_row: list[str], language: str = "en") -> dict:
    spec = utility(name, body, example_row, language)
    spec["category"] = "MARKETING"
    return spec


TEMPLATES = [
    marketing(
        "swimit_login_ready",
        "Your SwimIT account {{1}} is ready.\nCode: {{2}}\nSign-in link: {{3}}\nUser: {{4}}\nPassword: {{5}}\nThis sign-in information sent on email as well.\nPlease update it after first sign-in",
        ["SMPool", "smpool", "https://staging.swimit.co.in/smpool", "admin", "Ab12cd34"],
    ),
    marketing(
        "swimit_login_info",
        "Your SwimIT account {{1}} is ready.\nCode: {{2}}\nSign-in link: {{3}}\nUser: {{4}}\nPassword: {{5}}\nThis sign-in information sent on email as well.\nPlease update it after first sign-in",
        ["SMPool", "smpool", "https://staging.swimit.co.in/smpool", "admin", "Ab12cd34"],
    ),
    utility(
        "swimit_login_creds",
        "Your SwimIT account {{1}} is ready.\nCode: {{2}}\nSign-in link: {{3}}\nUser: {{4}}\nPassword: {{5}}\nThis sign-in information sent on email as well.\nPlease update it after first sign-in",
        ["SMPool", "smpool", "https://staging.swimit.co.in/smpool", "admin", "Ab12cd34"],
    ),
    utility(
        "swimit_welcome",
        "Hello, your SwimIT account {{1}} is now active. Account code {{2}}. Check your email for sign-in instructions.",
        ["SMPool", "smpool"],
    ),
    utility(
        "swimit_registration_ok",
        "Hello {{1}}, your registration at {{2}} has been submitted. After online payment, please send the payment screenshot on this chat.",
        ["Anita", "SMPool"],
    ),
    utility(
        "swimit_reg_say_hi",
        "Hello {{1}}, your registration at SwimIT has been submitted. Please respond Hi To this message",
        ["Kishor"],
    ),
    utility(
        "swimit_pass_ready",
        "Hello {{1}}, your {{2}} pass is ready. Valid until {{3}}. Show your QR at the gate for attendance.",
        ["Anita", "Monthly", "30 Sep 2026"],
    ),
    utility(
        "swimit_pass_expiring",
        "Hello {{1}}, your SwimIT pass expires soon. Pass: {{2}}. Valid until {{3}}. Please renew at the pool desk.",
        ["Anita", "Monthly", "30 Sep 2026"],
    ),
    utility(
        "swimit_sub_expiring",
        "Hello {{1}}, your SwimIT subscription for {{2}} expires on {{3}}. Renew here: {{4}}. After paying, send the screenshot on this chat.",
        ["Bipin", "SMPool", "16 Sep 2026", "https://staging.swimit.co.in/smpool/renew-payment"],
    ),
    utility(
        "swimit_open_form_desk",
        "{{1}} registration form for {{2}} is ready. Open: {{3}}",
        ["Swimmer", "SMPool", "https://staging.swimit.co.in/smpool/open/register"],
    ),
    utility(
        "swimit_open_form",
        "SwimIT {{1}} registration for {{2}} is ready. Open: {{3}}\nScan the QR or open the link to fill the form.",
        ["Swimmer", "SMPool", "https://staging.swimit.co.in/smpool/open/register"],
    ),
    utility(
        "swimit_renew_pay",
        "SwimIT renewal for {{1}}. Package: {{2}}. Duration: {{3}}. Amount: {{4}}. Pay: {{5}}. After paying, send the screenshot on this chat.",
        ["SMPool", "Trial", "1 month", "Rs 0", "UPI"],
    ),
    utility(
        "swimit_pass_pay",
        "Hello {{1}}, please pay {{2}} for your {{3}} pass (valid until {{4}}). Pay: {{5}}. After paying, send the screenshot on this chat.",
        ["Anita", "Rs 1500", "Monthly", "30 Sep 2026", "UPI"],
    ),
    utility(
        "swimit_batch_limit",
        "Hello {{1}}, batch capacity warning for {{2}}. Swimmer {{3}} is over the coach limit in batch {{4}} ({{5}}). Please review allocation.",
        ["Admin", "SMPool", "Anita", "Morning", "21 of 20"],
    ),
    utility(
        "swimit_remote_login",
        "Hello {{1}}, a remote login request was received for {{2}}.\nUser: {{3}}\nDetails: {{4}}\nApprove link: {{5}}\nTap the link to allow or deny this request.",
        ["Admin", "SMPool", "coach1", "12 km away", "https://staging.swimit.co.in/approve"],
    ),
    utility(
        "swimit_capacity",
        "Hello {{1}}, active swimmer capacity for {{2}} has reached {{3}}. Package {{4}}. Renew: {{5}}. After paying, send the screenshot on this chat.",
        ["Admin", "SMPool", "80%", "Trial", "https://staging.swimit.co.in/smpool/renew-payment"],
    ),
    marketing(
        "swimit_broadcast",
        "Message from SwimIT:\n{{1}}\nReply to this chat if you have questions.",
        ["Pool closed tomorrow for maintenance."],
    ),
]


def resolve_waba() -> str:
    if WABA:
        return WABA
    info = graph(f"{PHONE_ID}?fields=whatsapp_business_account")
    acct = info.get("whatsapp_business_account") or {}
    waba_id = str(acct.get("id") or "").strip()
    if not waba_id:
        raise SystemExit(f"Could not resolve WABA id: {info}")
    return waba_id


def main() -> int:
    if not TOKEN or not PHONE_ID:
        print("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required")
        return 1
    waba = resolve_waba()
    print(f"WABA {waba}  phone {PHONE_ID}")

    existing: dict[str, str] = {}
    listed = graph(f"{waba}/message_templates?limit=100&fields=name,status,language,category")
    if listed.get("error"):
        print(f"Could not list templates: {str((listed.get('error') or {}).get('message') or listed)[:200]}")
    for row in listed.get("data") or []:
        name = str(row.get("name") or "")
        if name:
            existing[name] = f"{row.get('status')} {row.get('language')} {row.get('category')}"
    if existing:
        print(f"Existing templates: {len(existing)}")
        for name, info in sorted(existing.items()):
            print(f"  {name}: {info}")

    failed = 0
    for spec in TEMPLATES:
        name = spec["name"]
        info = existing.get(name, "")
        status = info.split(" ", 1)[0] if info else ""
        if status in ("APPROVED", "PENDING", "PAUSED", "IN_APPEAL"):
            print(f"SKIP    {name}: already {info}")
            continue
        if status:
            deleted = graph(f"{waba}/message_templates?name={name}", method="DELETE")
            if deleted.get("error"):
                print(f"FAIL    {name}: could not replace ({str((deleted.get('error') or {}).get('message') or deleted)[:160]})")
                failed += 1
                continue
            print(f"REPL    {name}: removed previous {info}")
        result = graph(f"{waba}/message_templates", method="POST", payload=spec)
        err = result.get("error") or {}
        if err:
            msg = str(err.get("message") or err)
            extra = err.get("error_user_msg") or err.get("error_user_title") or ""
            print(f"FAIL    {name}: {msg[:180]} {extra}".strip()[:240])
            failed += 1
        else:
            status = result.get("status") or result.get("id") or "created"
            print(f"OK      {name}: {status}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
