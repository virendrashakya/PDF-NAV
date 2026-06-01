# ServiceNow Audit Dashboard - Headless

A production-grade React + TypeScript application for ServiceNow audit data management. Features OAuth authentication, field data verification, and PDF document viewing.

## Features

✨ **Authentication**
- OAuth 2.0 Client Credentials flow
- Automatic token refresh
- Secure localStorage-based session management
- Configuration page for setup

📊 **Field Management**
- Expandable sections for organized field display
- Data verification and QA override columns
- Commentary tracking
- Confidence indicators
- Search and filtering

📄 **Document Handling**
- Document selector dropdown
- PDF viewer with zoom controls
- Document filtering

🎨 **UI/UX**
- Azure/Fluent Design System
- Responsive layout with collapsible sidebar
- Toast notifications
- Loading states and error handling
- Professional, clean aesthetics

## Tech Stack

- **React** 18.2
- **TypeScript** 5.3
- **Vite** 5.0 (build tool)
- **Axios** (HTTP client)
- **CSS3** (styling with CSS variables)

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- ServiceNow instance with OAuth configured

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The application will open at `http://localhost:5173`

## Configuration

### First Time Setup

1. **Start the Application**
   - The app opens with the Configuration page

2. **Enter ServiceNow Details**
   - **Base URL**: Your ServiceNow instance URL (e.g., `https://dev12345.service-now.com`)
   - **Client ID**: OAuth application client ID
   - **Client Secret**: OAuth application client secret

3. **Test Connection**
   - Click "Test Connection" to verify credentials

4. **Save Configuration**
   - Click "Save Configuration" to proceed to the audit page
   - Configuration is stored securely in localStorage

### OAuth Setup in ServiceNow

1. Log in to your ServiceNow instance
2. Navigate to **System OAuth** > **Application Registry**
3. Create a new OAuth application with:
   - **Name**: ServiceNow Audit Dashboard
   - **OAuth Scope**: Your required scopes
   - **Grant Types**: Client Credentials
   - **Redirect URL**: Not needed for client credentials
4. Copy the **Client ID** and **Client Secret**

## Application Structure

```
src/
├── components/
│   ├── FieldsPanel.tsx       # Left sidebar with fields table
│   ├── PDFViewer.tsx         # Right side PDF viewer
│   └── Toast.tsx             # Toast notifications
├── context/
│   └── ToastContext.tsx      # Toast notification context
├── pages/
│   ├── ConfigPage.tsx        # Configuration/login page
│   └── AuditPage.tsx         # Main audit page
├── services/
│   ├── authService.ts        # OAuth authentication & token management
│   └── apiService.ts         # ServiceNow API calls
├── styles/
│   ├── config.css            # Config page styles
│   ├── audit.css             # Audit page styles
│   ├── fieldsPanel.css       # Fields panel styles
│   ├── pdfViewer.css         # PDF viewer styles
│   └── toast.css             # Toast notification styles
├── App.tsx                   # Main application component
├── index.css                 # Global styles
└── main.tsx                  # Entry point
```

## API Integration

The application uses the following ServiceNow endpoints from your Postman collection:

- **Authentication**: `POST /oauth_token.do`
- **Get Config**: `GET /api/x_gegis_uwm_dashbo/v1/auditpageapi/config`
- **Fetch Mapping**: `GET /api/x_gegis_uwm_dashbo/v1/auditpageapi/fetchMapping/{id}`
- **Line of Business**: `GET /api/x_gegis_uwm_dashbo/v1/auditpageapi/lineOfBusiness/{id}`
- **Save Mapping**: `POST /api/x_gegis_uwm_dashbo/v1/auditpageapi/saveMapping`
- **Mark Complete**: `POST /api/x_gegis_uwm_dashbo/v1/auditpageapi/markComplete`
- **Attachments**: `GET /api/x_gegis_uwm_dashbo/v1/auditpageapi/attachment/{id}`

## Token Management

The application automatically:

- Stores tokens securely in localStorage
- Refreshes tokens 5 minutes before expiration
- Handles token refresh transparently
- Clears storage on logout

## Deployment

### Netlify Deployment

1. **Build Locally**
   ```bash
   npm run build
   ```

2. **Deploy via Netlify CLI**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=dist
   ```

3. **Deploy via Git**
   - Push code to GitHub
   - Connect repository to Netlify
   - Netlify automatically builds and deploys

4. **Environment Variables** (optional)
   - Configure in Netlify dashboard if needed
   - Application primarily uses browser localStorage

### Netlify Managed Authentication (Recommended)

To avoid entering Base URL / Client ID / Client Secret in every browser:

1. In Netlify, open your site:
   - **Site configuration** -> **Environment variables**
2. Add these variables:
   - `SNOW_BASE_URL` = `https://your-instance.service-now.com`
   - `SNOW_CLIENT_ID` = `your-client-id`
   - `SNOW_CLIENT_SECRET` = `your-client-secret`
3. Trigger a redeploy.
4. Open the app again. It will auto-load auth config from Netlify and authenticate without browser-by-browser setup.

Notes:
- If these vars are not set, the app falls back to manual configuration page entry.
- Credentials stay server-side in Netlify Functions and are not exposed in the UI.

### Environment Variables

Optional environment variables in Netlify:

```
VITE_SNOW_BASE_URL=https://your-instance.service-now.com
```

Note: Client credentials should be configured via the UI, not environment variables, for better security.

## Features in Detail

### Configuration Page

- Clean, professional form for ServiceNow setup
- Test connection before saving
- Visual feedback with toast notifications
- Password field with show/hide toggle
- Help text with OAuth setup instructions

### Audit Page

**Left Sidebar**
- Field sections grouped by field name
- Collapsible sections with expand/collapse
- Search across field names, values, and commentary
- Filter to show only current document fields
- Field count indicators
- Data verification, QA override, and commentary columns
- Confidence indicators (color-coded)

**Right Sidebar**
- PDF document viewer
- Document selector dropdown
- Zoom controls (in/out, reset, fit to width)
- Page navigation
- Download button

**Action Buttons**
- Save Changes (appears when data is modified)
- Complete/Submit (marks submission as complete)
- Status indicators for pending actions

### Toast Notifications

- Success messages (green)
- Error messages (red) with 8-second duration
- Info messages (blue)
- Warning messages (orange)
- Auto-dismiss or manual close
- Positioned top-right

## Styling & Design System

All colors use CSS variables for consistency:

```css
--color-primary: #0078d4         /* Azure Blue */
--color-success: #107c10         /* Green */
--color-error: #d13438           /* Red */
--color-warning: #f9a825         /* Orange */
--color-text-primary: #323130    /* Dark Gray */
--color-border: #e1dfdd          /* Light Border */
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Modern browsers with ES2020 support

## Performance

- Vite fast refresh during development
- Tree-shakeable dependencies
- Code splitting for optimal bundle size
- CSS-only animations for smooth performance
- Debounced resize handlers

## Security Considerations

- Client credentials stored in browser localStorage
- HTTPS recommended for production (enforced by Netlify)
- CORS handled by ServiceNow backend
- No sensitive data in environment variables
- Token expiration and refresh mechanism
- Logout clears all stored credentials

## Troubleshooting

### Authentication Failures

- Verify ServiceNow instance URL format
- Check OAuth Client ID and Secret
- Ensure OAuth application exists in ServiceNow
- Check for CORS issues in browser console
- Verify network connectivity

### Data Not Loading

- Check Service Now instance is accessible
- Verify submission SysID is correct
- Check network tab in browser DevTools
- Look for API error responses in console

### Token Refresh Issues

- Check browser localStorage isn't disabled
- Verify token expiration time is reasonable
- Check Application tab in DevTools for stored token

## Future Enhancements

- PDF.js integration for actual PDF rendering
- Advanced search and filtering
- Batch operations on fields
- Export functionality (CSV, PDF)
- Dark mode support
- Multi-language support
- Accessibility improvements (WCAG 2.1)

## License

Proprietary - ServiceNow Audit Dashboard

## Support

For issues or questions, contact your ServiceNow administrator.
