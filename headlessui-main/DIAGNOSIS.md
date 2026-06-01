# Network Error Diagnosis

You're getting: **"Cannot reach ServiceNow instance"**

This means the request is failing before it even gets to CORS checking. Here's how to fix it:

---

## 🔍 Step 1: Test Your URL

Open your browser and paste this exact URL:
```
https://genpactpoc.service-now.com/
```

**What should happen:**
- ✅ ServiceNow login page loads
- ❌ Error page or blank page = problem

**If it fails:**
- Try adding `/login.do` at the end
- Try different URLs like:
  - `https://genpactpoc.service-now.com/login.do`
  - `https://genpactpoc.service-now.com/nav_to.do`

---

## 🔌 Step 2: Check If Instance is Accessible

Try these diagnostic methods:

### Method A: Use Diagnostic Tool
1. Open `diagnostic.html` in browser
2. Enter: `https://genpactpoc.service-now.com`
3. Click "Run Diagnostics"
4. Check what fails

### Method B: Test with Postman
1. Open your Postman collection
2. Edit the `baseUrl` variable to: `https://genpactpoc.service-now.com`
3. Try the **Authentication** request
4. See if it works in Postman

### Method C: Check Network in DevTools
1. Open app at `http://localhost:5173`
2. Press F12 → Network tab
3. Try to authenticate
4. Find the `oauth_token.do` request
5. Check:
   - **Status**: Should show error code
   - **Headers**: Check Request URL
   - **Response**: Any error message?

---

## ❓ Common Causes & Solutions

### 1. **Instance Name Wrong**
If your actual instance is different:

Wrong ❌
```
https://genpactpoc.service-now.com
```

Find correct name in browser address bar when you're logged into ServiceNow.

**Fix**: Use the correct instance name in the Config page

---

### 2. **Behind Corporate VPN**
If ServiceNow is internal-only:

**Problem**: Your local machine can't reach it without VPN

**Solutions:**
- ✅ Connect to VPN first
- ✅ Deploy to Netlify (if Netlify is whitelisted)
- ✅ Ask IT to allow external access
- ✅ Use a proxy service

---

### 3. **Instance is Down/Unavailable**
Check ServiceNow status:

1. Go to: `https://genpactpoc.service-now.com/status`
2. Or ask your ServiceNow admin if instance is running
3. Check if it's in maintenance mode

**Fix**: Wait for instance to come back online

---

### 4. **Firewall/Network Blocking**
Your network may block HTTPS to ServiceNow:

**Signs:**
- Works on phone hotspot but not office WiFi
- Works from home but not office
- Other cloud apps blocked too

**Fix**: Contact your IT department to whitelist:
- `genpactpoc.service-now.com`
- Port 443 (HTTPS)

---

### 5. **Browser Extensions Blocking**
Some browser extensions block requests:

**Try:**
- Open in Incognito/Private mode
- Disable ad blockers and VPN extensions
- Try different browser (Chrome, Firefox, Edge)

---

## 🧪 Test These URLs

Try opening these in your browser directly:

```
https://genpactpoc.service-now.com
https://genpactpoc.service-now.com/login.do
https://genpactpoc.service-now.com/api/now/table/sys_user?sysparm_limit=1
```

**What to look for:**
- ✅ Page loads = instance accessible
- ❌ Can't reach server / Error = instance not accessible
- ⚠️ 401/403 = accessible but authentication error (that's OK for now)

---

## 📝 Verify Your Config

In the React app Config page, make sure:

```
Base URL: https://genpactpoc.service-now.com
```

**NOT:**
- ❌ `http://` (must be https)
- ❌ `genpactpoc.service-now.com/` (no trailing slash)
- ❌ `dev-genpactpoc.service-now.com` (wrong name)
- ❌ `genpactpoc.service-now.com:8080` (no port needed)

---

## ✅ Checklist

- [ ] ServiceNow instance URL is correct
- [ ] Instance is accessible from browser
- [ ] Not blocked by VPN requirement
- [ ] Not behind corporate firewall
- [ ] Instance is running (not in maintenance)
- [ ] No browser extensions blocking
- [ ] Using HTTPS (not HTTP)
- [ ] URL has no trailing slash

---

## 🆘 Still Not Working?

Run this in browser console (F12 → Console):

```javascript
fetch('https://genpactpoc.service-now.com/').then(r => {
  console.log('✅ Instance reachable, Status:', r.status)
}).catch(e => {
  console.log('❌ Cannot reach instance:', e.message)
})
```

Share the result and I can help you further!
