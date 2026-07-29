# WhatsApp permanent access token (staging + production)

SwimIT reads `WHATSAPP_TOKEN` from the server `.env`.  
**Do not use** the temporary token from Meta → WhatsApp → API Setup → “Copy temporary token”. Those expire (often within hours/days) and cause:

`Authentication Error (OAuthException) code 190`

Use a **permanent System User token** once for staging and once for production (or one token for both if they share the same Meta app / WABA).

## Create a permanent token

1. Open [Meta Business Suite](https://business.facebook.com/) → **Business settings** (gear).
2. **Users** → **System users** → **Add** (or open an existing system user).
   - Role: **Admin** (or at least enough access for WhatsApp).
3. Select the system user → **Generate token**.
4. Choose your **SwimIT** app.
5. Assign permissions (tick all that apply):
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Generate and **copy the token once** (store it in a password manager). Meta will not show it again.
7. Under the system user, **Add assets** → **WhatsApp accounts** → assign your WhatsApp Business Account with **Full control** (or Manage).

## Put it on the server

### Staging (`staging.swimit.co.in`)

```bash
cd /opt/swimit
nano .env
# set:
# WHATSAPP_ENABLED=true
# WHATSAPP_TOKEN=<permanent system user token>
# WHATSAPP_PHONE_NUMBER_ID=<same phone number id as before>

docker compose -f docker-compose.lightsail.yml up -d --force-recreate app
```

Confirm:

```bash
curl -s https://staging.swimit.co.in/api/whatsapp/status
```

`tokenValid` should be `true`. On the WhatsApp page, Status should say **Connected**, not “Token invalid / expired”.

### Production

Same variables on the production host `.env`, then recreate the app container / redeploy.

## Rules to avoid expiry again

| Do | Don’t |
|----|--------|
| Use System User permanent token | Paste “temporary access token” from API Setup |
| Recreate the app container after changing `.env` | Edit `.env` and expect the running container to pick it up alone |
| Keep one stable token until you rotate it on purpose | Click “Generate temporary token” again (that can invalidate the previous temp token) |

## Rotate later (optional)

1. Generate a new System User token.
2. Update `WHATSAPP_TOKEN` on staging, test Send QR / Send test.
3. Update production.
4. Revoke the old token in Meta if needed.
