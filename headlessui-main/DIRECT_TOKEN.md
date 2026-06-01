# Using Direct Token Method

The config page now has **two authentication methods**:

## Method 1: OAuth Credentials (Default)
- Uses Client ID + Client Secret
- App automatically gets token
- Requires CORS setup for auth endpoint
- ⚠️ May fail due to CORS on `/oauth_token.do`

## Method 2: Direct Token ⭐ (NEW)
- Paste a token directly
- Bypasses OAuth CORS issues
- ✅ **Recommended if OAuth CORS is failing**
- Simpler and faster

---

## How to Get a Token

### Option A: From Postman
1. Open your **Postman collection**
2. Set base URL to your ServiceNow instance
3. Run the **"Authentication"** request
4. In the response, copy the `access_token` value
5. Paste into the config page

### Option B: From ServiceNow
1. Open browser DevTools (F12)
2. Go to Console tab
3. Paste this:
```javascript
const clientId = 'YOUR_CLIENT_ID';
const clientSecret = 'YOUR_CLIENT_SECRET';
const baseUrl = 'https://genpactpoc.service-now.com';

fetch(`${baseUrl}/oauth_token.do`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
})
.then(r => r.json())
.then(d => {
  console.log('✅ Token:', d.access_token);
  console.log('Copy the token above and paste in config page');
})
.catch(e => console.log('❌ Error:', e.message));
```
4. Copy the token from console
5. Paste into config page

---

## Using Direct Token

1. **Refresh the app** (http://localhost:5173)
2. **Click "Direct Token"** tab
3. **Paste your token** in the field
4. **Click "Test Connection"** to verify
5. **Click "Save Configuration"** to proceed

---

## ✅ Why This Works

- ✅ No CORS needed on auth endpoint
- ✅ Token is already valid
- ✅ Works from localhost and Netlify
- ✅ Same permissions as OAuth
- ⚠️ Token expires (usually 1-2 hours)

---

## Token Expiration

- Direct tokens expire after a set time (typically 3600 seconds = 1 hour)
- When expired, you'll need to:
  1. Get a new token (from Postman or console)
  2. Update it in the config page
  3. Or switch back to OAuth credentials once CORS is fixed

---

## Recommended Flow

1. **Immediate**: Use Direct Token to test the app
2. **Production**: Fix CORS, then use OAuth Credentials for auto-refresh

---

## Config Page Now Shows

- **OAuth Credentials tab** (original method)
- **Direct Token tab** (new, CORS-free method)

Toggle between them anytime!
