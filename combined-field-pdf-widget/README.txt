================================================================================
Combined Field Detail + PDF Viewer Widget
ServiceNow Service Portal Widget
================================================================================

OVERVIEW
--------
A single Service Portal widget that combines:
- Left panel: Field list + detailed field view
- Right panel: PDF viewer with coordinate highlighting

Uses DUMMY DATA for demonstration - works without any database connection.

================================================================================

FILES
-----
- serverscript.js  : Dummy field data (4 sample fields)
- clientscript.js  : PDF loading, field selection, highlighting
- html             : Two-panel layout template
- css              : Light theme left panel, dark theme PDF viewer

================================================================================

FEATURES
--------
- Click field to see details
- PDF loads automatically
- Coordinates highlighted on PDF (yellow boxes)
- Page navigation
- Zoom controls
- Responsive layout

================================================================================

DUMMY DATA FIELDS
-----------------
1. War and Civil War Exclusion (Failed)
2. Policy Territory (Passed)
3. Policy Period From (Passed)
4. Industry Code (Warning)

================================================================================

TO USE IN SERVICENOW
--------------------
1. Go to Service Portal > Widgets > New
2. Name: Combined Field PDF Viewer
3. ID: combined-field-pdf-widget
4. Copy file contents to each tab:
   - Server Script: serverscript.js
   - Client Script: clientscript.js
   - HTML Template: html
   - CSS: css
5. Save
6. Add widget to a page
7. Preview page - it will work immediately with demo data!

================================================================================
