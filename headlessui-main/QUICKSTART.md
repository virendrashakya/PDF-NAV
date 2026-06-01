# Quick Start Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

## 3. Configure ServiceNow Connection

When the app loads, you'll see the Configuration page:

1. **Enter your ServiceNow Base URL**
   - Example: `https://dev12345.service-now.com`

2. **Enter OAuth Client ID**
   - Get this from ServiceNow > System OAuth > Application Registry

3. **Enter OAuth Client Secret**
   - Same place as Client ID

4. **Click "Test Connection"**
   - Verifies your credentials work

5. **Click "Save Configuration"**
   - Stores credentials securely in browser
   - Proceeds to Audit page

## 4. Use the Audit Page

**Left Side (Fields Panel)**
- View field data organized by section
- Edit fields (data verification, QA override, commentary)
- Search for specific fields
- Filter by document

**Right Side (PDF Viewer)**
- Select documents from dropdown
- Zoom in/out
- View document references

**Buttons**
- **Save Changes**: Saves your edits when you make changes
- **Complete**: Submits the entire audit

## 5. Build for Production

```bash
npm run build
```

Creates optimized build in `dist/` folder

## 6. Deploy to Netlify

### Option A: Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### Option B: Git Integration
1. Push code to GitHub
2. Connect repo to Netlify
3. Netlify auto-builds and deploys

## Key Features

✅ **OAuth Authentication** - Automatic token refresh
✅ **Field Management** - Edit and verify data
✅ **Search & Filter** - Find fields quickly
✅ **Professional UI** - Azure/Fluent Design
✅ **Toast Notifications** - Real-time feedback
✅ **Responsive Design** - Works on all devices
✅ **Netlify Ready** - Deploy in minutes

## Troubleshooting

**Blank Config Page?**
- Check browser console for errors
- Verify network connectivity

**Authentication Failed?**
- Double-check ServiceNow URL
- Verify Client ID and Secret
- Ensure OAuth app exists in ServiceNow

**Fields Not Loading?**
- Check network tab in DevTools
- Verify ServiceNow API endpoints
- Look for CORS errors

## More Info

See [README.md](./README.md) for comprehensive documentation.
