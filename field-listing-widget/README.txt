================================================================================
Field Listing Widget
ServiceNow Service Portal Widget
================================================================================

OVERVIEW
--------
Displays grouped field listings from data extraction line items. Allows editing
and saving of field values. Communicates with PDF Viewer widget via events
for field navigation.

================================================================================

EVENTS BROADCAST (to PDF Viewer)
---------------------------------
1. pdf-viewer:loadDocument
   Payload: { url: string }
   When: Document selection changes

2. pdf-viewer:navigateToField
   Payload: { coordinates: array, documentUrl: string }
   When: User clicks on a field with source coordinates

================================================================================

WIDGET OPTIONS
--------------
None required. Uses URL parameter: ?submissionSysId=<sys_id>

================================================================================

FEATURES
--------
- Grouped field display by section
- Collapsible sections
- Field editing with auto-save
- Change tracking
- Confidence indicators
- Document filtering toggle
- Mark complete functionality

================================================================================

FILES
-----
- serverscript.js  : Data fetching, saving, mark complete
- clientscript.js  : UI logic, event broadcasting
- html             : Template with sections and edit forms
- css              : Dark theme styling

================================================================================

USAGE
-----
1. Create both widgets in ServiceNow (this + pdf-viewer-widget)
2. Place both on a page side by side
3. Load page with ?submissionSysId=<sys_id> parameter
4. Field listing loads data and tells PDF viewer to load first document
5. Clicking fields navigates PDF viewer to highlights

================================================================================
