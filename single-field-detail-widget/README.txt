================================================================================
Single Field Detail Widget
ServiceNow Service Portal Widget
================================================================================

OVERVIEW
--------
Displays detailed information for a single field/check, showing score, 
reasoning, source evidence with extracted text, and a "View in Document" 
button that navigates to the location in the PDF viewer.

================================================================================

URL PARAMETERS
--------------
?fieldSysId=<sys_id>   - Sys ID of the line item to display

================================================================================

FEATURES
--------
- Back navigation button
- Field name and status badge
- Score indicator (Passed/Failed/Warning)
- "Why this failed" reasoning section
- Source Evidence card:
  - Document name and page number
  - Extracted text preview
  - "View in Document" button
- Commentary display

================================================================================

EVENTS BROADCAST
----------------
1. pdf-viewer:loadDocument
   When: Widget loads with valid attachment
   Payload: { url: string }

2. pdf-viewer:navigateToField
   When: User clicks "View in Document"
   Payload: { coordinates, documentUrl }

================================================================================

PAGE LAYOUT
-----------
Use with PDF Viewer widget in two-column layout:

Left (col-md-4): single-field-detail-widget
Right (col-md-8): pdf-viewer-widget

Access: /sp?id=field-detail&fieldSysId=<sys_id>

================================================================================
