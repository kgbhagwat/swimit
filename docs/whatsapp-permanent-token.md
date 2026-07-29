# WhatsApp permanent access token — detailed steps

SwimIT uses `WHATSAPP_TOKEN` from the server `.env` for **staging** and **production**.

## Why messages fail with code 190

If you used **Copy temporary token** / **Generate access token** on the WhatsApp **API Setup** page in Meta Developers, that token is **temporary**. It often expires in about a day (sometimes sooner). After that you see:

```text
Authentication Error (OAuthException) code 190
```

**Fix:** create a **System User** token and set expiry to **Never** (permanent). Do this once; reuse the same token on staging and production if both use the same Meta app and WhatsApp Business Account.

---

## Part A — Create the permanent token in Meta

### A1. Open Business settings

1. Go to: https://business.facebook.com/latest/settings  
   (or https://business.facebook.com → click the **gear / Settings** for your business).
2. Make sure you are in the correct **Business portfolio** (top-left / business switcher) — the one that owns the **SwimIT** app and WhatsApp account.
3. You must be a **Business Admin** (or have permission to manage system users).

### A2. Create a System User (if you do not have one yet)

1. In the left sidebar: **Users** → **System users**.
2. Click **Add** (or **Add assets** / **Add** in the upper right).
3. Fill in:
   - **System user name:** e.g. `swimit-whatsapp-api`
   - **System user role:** choose **Admin**
4. Click **Create system user**.

Notes:

- If Meta says you must add an app to the business first, open [developers.facebook.com](https://developers.facebook.com/) → your **SwimIT** app → ensure it is linked to this Business.
- If Meta says an admin must be at least 7 days old before creating another Admin system user, wait or create an **Employee** system user and still assign Full control on assets (Admin is preferred).

### A3. Assign assets to the System User (required before the token works)

1. Select the system user `swimit-whatsapp-api` in the list.
2. Click **Assign assets** (or **Add assets**).
3. **Apps**
   - Left: asset type **Apps**
   - Middle: tick your **SwimIT** app
   - Right: enable **Full control** / **Manage app**
4. **WhatsApp accounts**
   - Left: asset type **WhatsApp accounts** (may appear as WhatsApp Business Account)
   - Middle: tick your WABA (e.g. the account with Phone number ID you already use)
   - Right: enable **Full control** / **Manage WhatsApp Business accounts**
5. Click **Assign assets** / **Save**.

Without these assets, the token may generate but API calls still fail.

### A4. Generate the permanent token

1. Still on that system user, click **Generate token** (or **Generate new token**).
2. **Select app:** choose **SwimIT**.
3. **Token expiration:** choose **Never** (permanent).  
   - If you only see 60 days, pick the longest option and plan to rotate before it expires — prefer **Never** when available.
4. **Permissions** — enable at least:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - (optional but useful) `business_management`
5. Click **Generate token**.
6. **Copy the token immediately** into a password manager / secure note.  
   Meta will **not** show the full token again.
7. Close the dialog only after you have saved it.

You now have a permanent `WHATSAPP_TOKEN`.

### A5. Confirm Phone number ID (keep existing value)

1. Open [developers.facebook.com](https://developers.facebook.com/) → **SwimIT** app.
2. Left menu: **WhatsApp** → **API Setup** (or **Getting started**).
3. Copy **Phone number ID** (digits only) — this is `WHATSAPP_PHONE_NUMBER_ID`.  
   Usually you already have this in staging `.env`; do **not** change it unless you switched numbers.
4. Do **not** use “Copy temporary token” from this page anymore.

---

## Part B — Put the token on staging

SSH into the Lightsail server (browser SSH or your `.pem` key).

### B1. Edit `.env`

```bash
cd /opt/swimit
nano .env
```

Set or update these lines (keep other values as they are):

```env
WHATSAPP_ENABLED=true
WHATSAPP_TOKEN=PASTE_THE_PERMANENT_SYSTEM_USER_TOKEN_HERE
WHATSAPP_PHONE_NUMBER_ID=YOUR_EXISTING_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN=swimit-whatsapp-verify
WHATSAPP_API_VERSION=v21.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91
PUBLIC_APP_URL=https://staging.swimit.co.in
```

Save and exit (`Ctrl+O`, Enter, `Ctrl+X` in nano).

### B2. Recreate the app container (required)

Changing `.env` alone does **not** update a running container. Recreate:

```bash
cd /opt/swimit
docker compose -f docker-compose.lightsail.yml up -d --force-recreate app
docker compose -f docker-compose.lightsail.yml ps
docker compose -f docker-compose.lightsail.yml logs --tail=40 app
```

App should be **Up**, not Restarting.

### B3. Verify token is accepted by Meta

```bash
curl -s https://staging.swimit.co.in/api/whatsapp/status
```

You want something like:

```json
{
  "enabled": true,
  "tokenValid": true,
  "displayPhoneNumber": "+1 ..."
}
```

If `tokenValid` is `false`, the token or asset assignment is wrong — recheck Part A3–A4.

### B4. Test in the app

1. Open https://staging.swimit.co.in → login to a pool account.
2. Go to **Operations → WhatsApp**.
3. Status should say **Connected** (not “Token invalid / expired”).
4. Prefer **Send as → Meta hello_world template**, enter a number on Meta’s allow list, **Send test message**.
5. Then try **Send QR** on Registration / Staff form.

---

## Part C — Production

1. Use the **same** permanent token (same Meta app / WABA), or generate a second System User token if you prefer separation.
2. On the production server, set the same `WHATSAPP_*` keys in production `.env`.
3. Recreate / redeploy the production app container the same way.
4. Confirm with production `/api/whatsapp/status` and a test send.

---

## Do / Don’t

| Do | Don’t |
|----|--------|
| System User token with expiry **Never** | Temporary token from API Setup |
| Assign **App** + **WhatsApp account** Full control to the system user | Generate token without assigning assets |
| `--force-recreate app` after editing `.env` | Expect a simple restart to load a new token every time |
| Store the token securely | Paste the token into chat / screenshots |
| Keep using the same permanent token | Click “Generate temporary token” again on API Setup |

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|----------------|------------|
| OAuthException code 190 | Temporary / revoked / wrong token in container | Paste permanent token, recreate `app` |
| Status “Connected” but sends fail (old UI) | Env set but token dead | Use `/api/whatsapp/status` → `tokenValid` |
| Token valid but number never gets message | Number not on Meta allow list (unpublished app) | Meta → WhatsApp → API Setup → add Recipient |
| Custom text silent | Meta test number needs open session | Send **hello_world** template first, or reply in the +1 555 chat |
| Generate token greyed out | Assets not assigned / insufficient role | Complete A3; use Admin system user |

---

## Rotate later (optional)

1. System user → **Generate token** again (Never + same permissions).
2. Update staging `.env` → recreate app → test.
3. Update production → recreate app → test.
4. Optionally revoke the old token on the system user in Meta.
