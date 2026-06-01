# Debug Blank Page

## Step 1: Check Console Errors
Press **F12** → **Console** tab and paste:

```javascript
console.log('Fields:', window.location.search)
console.log('Token:', localStorage.getItem('snow_auth_token') ? 'EXISTS' : 'MISSING')
console.log('Config:', localStorage.getItem('snow_auth_config') ? 'EXISTS' : 'MISSING')
```

## Step 2: Check if Fields Loaded
Paste in console:
```javascript
// Check if data exists
const token = JSON.parse(localStorage.getItem('snow_auth_token') || '{}')
const config = JSON.parse(localStorage.getItem('snow_auth_config') || '{}')
console.log('Token:', token.access_token ? 'YES' : 'NO')
console.log('BaseURL:', config.baseUrl)
```

## Step 3: Look for Errors
Check console for red error messages about:
- API failures
- CORS errors
- Missing tokens
- PDF loading errors

## Step 4: Check Network
- Go to **Network** tab
- Look for failed requests (red X)
- Check `fetchMapping` response
- Is data coming back?

## Step 5: Common Issues

**Issue 1: No fields showing**
- Data didn't load from API
- Check Network tab for `fetchMapping` error
- Check if submissionSysId is in URL

**Issue 2: PDF not loading**
- No attachment ID found
- Field doesn't have `attachmentData`
- Token might be expired

**Issue 3: Blank but no errors**
- Data loaded but not rendering
- Component rendering issue

---

## Tell me:
1. Do you see any **red errors** in console?
2. What does the `fetchMapping` **Response** show? (Network tab)
3. Do you see **"Fields"** text in left sidebar?
4. What **status code** on API calls? (200, 401, 403?)
