# Troubleshooting: Network Error / CORS Issues

## The Problem

When you see "Network Error" during authentication, it's almost always a **CORS (Cross-Origin Resource Sharing)** issue.

**Why it happens:**
- React app runs on `localhost:5173`
- ServiceNow instance is at `https://your-instance.service-now.com`
- Browsers block cross-origin requests for security
- ServiceNow needs to allow requests from your app's domain

## Solution 1: Enable CORS in ServiceNow (Recommended)

### Step 1: Enable CORS in ServiceNow

1. Log in to your ServiceNow instance
2. Go to **System Web Services** → **CORS Rules**
3. Click **New**
4. Fill in:
   - **Allowed origins**: 
     - For local dev: `http://localhost:5173`
     - For Netlify: `https://your-app-name.netlify.app`
   - **Allowed methods**: `GET, POST, PUT, DELETE, OPTIONS`
   - **Allowed headers**: `Content-Type, Authorization, X-Requested-With`
   - **Allow credentials**: ✓ (checked)
   - **Max age**: `3600`
5. Click **Insert and Stay** → **Save**

### Step 2: Test Connection

Go back to the app and test the connection again.

---

## Solution 2: Use a CORS Proxy (Quick Workaround)

If you can't modify ServiceNow, use a CORS proxy:

Edit `src/services/authService.ts` and add this line near the top:

```typescript
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/'
```

Then modify the authenticate method:

```typescript
async authenticate(): Promise<TokenData> {
  const config = this.getConfig()
  if (!config) {
    throw new Error('Authentication config not set')
  }

  try {
    const url = config.baseUrl.endsWith('/') 
      ? `${config.baseUrl}oauth_token.do`
      : `${config.baseUrl}/oauth_token.do`

    const response = await axios.post(
      `${CORS_PROXY}${url}`,  // Add proxy here
      `grant_type=client_credentials&client_id=${config.clientId}&client_secret=${config.clientSecret}`,
      // ... rest of the code
    )
```

**Note:** This is only for testing. For production, enable CORS in ServiceNow instead.

---

## Solution 3: Backend Proxy (Best for Production)

Create a backend endpoint that handles authentication:

### Using Node.js/Express

Create a simple proxy server:

```javascript
// proxy-server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/api/auth', async (req, res) => {
  try {
    const { baseUrl, clientId, clientSecret } = req.body;
    
    const response = await axios.post(
      `${baseUrl}/oauth_token.do`,
      `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => console.log('Proxy running on 3001'));
```

Then update `authService.ts`:

```typescript
const response = await axios.post('/api/auth', {
  baseUrl: config.baseUrl,
  clientId: config.clientId,
  clientSecret: config.clientSecret
})
```

---

## Debugging Steps

### 1. Check Browser Console
1. Open DevTools (F12)
2. Go to **Console** tab
3. Try to authenticate
4. Look for detailed error message

### 2. Check Network Tab
1. Open DevTools (F12)
2. Go to **Network** tab
3. Try to authenticate
4. Find the failed request to `oauth_token.do`
5. Click it and check:
   - **Status**: Should be 200, not blocked
   - **Response**: Check for error details
   - **Headers**: Look for CORS headers

### 3. Verify ServiceNow URL
Make sure your URL:
- ✅ Includes `https://` (not `http://`)
- ✅ Includes instance name: `https://dev12345.service-now.com`
- ✅ Does NOT include trailing slash: ❌ `...com/`
- ✅ Is accessible in browser

### 4. Test with cURL or Postman

In Postman (from your Postman collection):
1. Add your base URL to environment
2. Try the "Authentication" request
3. If it works in Postman but not in app → CORS issue
4. If it fails in Postman too → credentials/URL issue

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Network Error` | CORS blocked | Enable CORS in ServiceNow |
| `401 Unauthorized` | Wrong credentials | Check Client ID/Secret |
| `404 Not Found` | Wrong URL or endpoint | Verify base URL format |
| `Cannot reach server` | URL unreachable | Check network connection |
| `ERR_INVALID_URL` | Malformed URL | Remove trailing slashes |

---

## ServiceNow OAuth Setup Checklist

- [ ] OAuth application created in ServiceNow
- [ ] Client ID copied correctly
- [ ] Client Secret copied correctly (keep it safe!)
- [ ] CORS rule created with correct origin
- [ ] CORS rule includes `Content-Type` and `Authorization` headers
- [ ] CORS rule has `Allow credentials` enabled
- [ ] Base URL is correct: `https://instance-name.service-now.com`

---

## Still Not Working?

Try this diagnostic:

1. **In ServiceNow**, go to **Logs** → **System Log**
2. Filter for recent errors
3. Look for authentication/CORS related messages
4. Check if the OAuth app is "Active"
5. Verify OAuth scope permissions

---

## Production Deployment (Netlify)

Once working locally, when deploying to Netlify:

1. Update CORS rule origin to: `https://your-app.netlify.app`
2. Rebuild and redeploy
3. Test authentication on Netlify

---

## Need Help?

**Check these:**
- Browser console for exact error
- Network tab for request/response details
- ServiceNow logs for backend errors
- CORS rule is set to "Active"
