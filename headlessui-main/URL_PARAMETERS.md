# URL Parameters Guide

The app now accepts **submission SysID** and **version ID** through URL parameters.

## URL Format

```
http://localhost:5173/?submissionSysId=SUBMISSION_ID&versionId=VERSION_ID
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `submissionSysId` | ✅ Yes | The sys_id of the submission to audit |
| `versionId` | ❌ Optional | The sys_id of the data extraction version |

## Examples

### Local Development

**With both parameters:**
```
http://localhost:5173/?submissionSysId=2726125693a63210ce18b5d97bba106c&versionId=a1b2c3d4e5f6071234567890abcdef12
```

**With submission only:**
```
http://localhost:5173/?submissionSysId=2726125693a63210ce18b5d97bba106c
```

### Netlify Deployment

**Example URL:**
```
https://your-app.netlify.app/?submissionSysId=2726125693a63210ce18b5d97bba106c&versionId=a1b2c3d4e5f6071234567890abcdef12
```

## How to Use

### 1. Configure First
- Visit the app without parameters
- Go through config page
- Save ServiceNow credentials or token

### 2. Access with Parameters
- Use the URL with `submissionSysId` parameter
- App automatically:
  - Skips config page if already authenticated
  - Goes directly to audit page
  - Loads the specified submission

### 3. From ServiceNow Widget

In your ServiceNow widget, create links like:

```html
<a href="http://localhost:5173/?submissionSysId={{submission_sys_id}}&versionId={{version_sys_id}}" target="_blank">
  Open Audit
</a>
```

Or with full URL for Netlify:

```html
<a href="https://your-app.netlify.app/?submissionSysId={{submission_sys_id}}&versionId={{version_sys_id}}" target="_blank">
  Open Audit
</a>
```

## Flow

1. **First Visit**: `/?submissionSysId=...`
   - User hasn't configured yet
   - App redirects to config page
   - User sets up ServiceNow credentials
   - After save, goes to audit page

2. **Subsequent Visits**: `/?submissionSysId=...`
   - User already configured
   - App recognizes auth
   - Goes directly to audit page
   - Loads submission data

3. **Without Parameter**: `/`
   - Always shows config page
   - User can save config
   - Can't proceed to audit without `submissionSysId`

## Browser Console Output

When loading, check console for:

```
✅ Audit page loaded
📋 Submission SysID: 2726125693a63210ce18b5d97bba106c
📦 Version ID: a1b2c3d4e5f6071234567890abcdef12 (if provided)
```

## Error Handling

**If `submissionSysId` is missing:**
- Shows error toast: "No submission SysID provided"
- Stays on config page
- User must provide proper URL

**If submission doesn't exist:**
- Shows error when trying to fetch mapping
- API returns 404 error
- Check SysID is correct

## ServiceNow Integration

To create links from ServiceNow widget:

```javascript
const submissionSysId = current.sys_id;  // Current record SysID
const versionId = current.data_extraction_version;  // If available

const auditUrl = `https://your-app.netlify.app/?submissionSysId=${submissionSysId}&versionId=${versionId}`;

// Open in new tab
window.open(auditUrl, '_blank');
```

## Security Notes

⚠️ **SysIDs are visible in URL**
- Anyone with the URL can access that submission
- Use ServiceNow's standard access controls
- HTTPS required for Netlify (automatic)

✅ **Token is stored locally**
- OAuth token stored in browser localStorage
- Not exposed in URL
- Cleared on logout

## Troubleshooting

**App shows config page instead of audit?**
- Check URL has `submissionSysId` parameter
- Check authentication is still valid
- Try copying URL directly in browser

**"No submission SysID provided" error?**
- Make sure URL has `?submissionSysId=...`
- Check no typos in parameter name
- URL must start with `?` for parameters

**Submission data not loading?**
- Check `submissionSysId` exists in ServiceNow
- Check ServiceNow API is accessible
- Check network tab for API errors
