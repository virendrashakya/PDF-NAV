================================================================================
PDF-NAV Widget v2 - Azure UI
ServiceNow Widget Documentation
================================================================================

OVERVIEW
--------
This widget provides a PDF viewing and field navigation interface for the 
Insurance Policy Suite. It allows users to view PDF documents, navigate to 
specific fields extracted from the documents, and edit/verify the extracted 
data.

================================================================================

TABLE / DATA SOURCE
-------------------
Primary Table: x_gegis_uwm_dashbo_data_extraction_lineitem

Column Mappings:
- field_name           -> Field Name (display)
- field_value          -> AI Value (display)
- commentary           -> Commentary (editable)
- qa_override_value    -> QA Override Value (editable based on status)
- data_verification    -> Data Verification (editable based on status)
- logic_transparency   -> Logic Transparency / Reason (display)
- confidence_indicator -> Confidence score (0-1 or percentage)
- section_name         -> Section grouping
- new_section_name     -> New section name for grouping (used for display)
- internal_field_seq   -> Sequence number for ordering fields within sections
- source               -> PDF coordinate data for navigation
- documentname_attachment_sysid -> Link to PDF attachment

Related Tables:
- x_gegis_uwm_dashbo_submission -> Submission records
- sys_attachment -> PDF file attachments

================================================================================

FEATURES
--------
1. PDF Viewer
   - Loads PDF documents from sys_attachment
   - Supports zoom (fit-width, actual-size)
   - Page navigation (next/previous, jump to page)
   - Field highlighting with annotations

2. Field Navigation
   - Click on a field to navigate to its location in the PDF
   - Multiple coordinate support (single field across multiple pages)
   - Next/Previous navigation for fields with multiple coordinates
   - Active field highlighting

3. Field Grouping
   - Fields are grouped by section (new_section_name)
   - Sections are sorted alphabetically
   - Fields within sections are ordered by internal_field_seq (numeric)
   - Collapsible sections with expand/collapse toggle

4. Data Editing
   - Auto-save on field blur
   - Manual save all changes button
   - Change tracking with visual indicators
   - Editable fields based on submission status:
     * CONFIRM_DATA_REVIEW: Data Verification editable
     * QUALITY_ASSURANCE: QA Override Value editable

5. Document Filter Toggle
   - Toggle to show only fields with current document and source
   - Shows field counts (filtered/total)

6. Mark Complete
   - Triggers data processing to update system records

================================================================================

FILES
-----
1. serverscript.js
   - Server-side logic
   - Actions: fetchMapping, saveMapping, markComplete
   - Queries x_gegis_uwm_dashbo_data_extraction_lineitem table
   - Returns field data with attachments and coordinates

2. clientscript.js
   - Client-side logic and controller
   - PDF.js integration for PDF viewing
   - Field navigation and highlighting
   - Change tracking and auto-save
   - UI state management

3. html
   - Widget HTML template
   - PDF viewer container
   - Field list panel with sections
   - Header with document selector and actions

4. css
   - Widget styling
   - Azure UI theme
   - Responsive layout (split-pane view)
   - Confidence indicators and status badges

================================================================================

URL PARAMETERS
--------------
- submissionSysId: Required parameter to load submission data
  Example: ?submissionSysId=4047569b9375f290ce18b5d97bba1044

================================================================================

COORDINATE FORMAT
-----------------
Source field contains PDF coordinates in format:
D(page, x1, y1, x2, y2, x3, y3, x4, y4)

Multiple coordinates are separated by semicolon (;)
Example: D(1,100,200,300,250,100,250,300,200);D(2,50,100,200,150,50,150,200,100)

================================================================================

SUBMISSION STATUS CHOICES
-------------------------
- CONFIRM_DATA_REVIEW: For data verification workflow
  * Data Verification field is editable
  * QA Override Value is readonly

- QUALITY_ASSURANCE: For QA override workflow
  * QA Override Value is editable
  * Data Verification is readonly

================================================================================

DEPENDENCIES
------------
- PDF.js library (v2.11.338) - Loaded from CDN
- AngularJS (provided by ServiceNow Service Portal)
- ServiceNow spUtil service

================================================================================

RECENT CHANGES (2026-01-09)
---------------------------
- Added internal_field_seq field for ordering fields within sections
- Changed server-side ordering from alphabetical (field_name) to 
  sequential (internal_field_seq) within each section group
- internal_field_seq is now included in mapping response data

================================================================================

TROUBLESHOOTING
---------------
1. PDF not loading
   - Check if attachment exists in sys_attachment
   - Verify content_type is 'application/pdf'
   - Check browser console for errors

2. Fields not showing
   - Verify data_extract reference exists on submission
   - Check if line items exist with non-null section_name
   - Review server script query conditions

3. Navigation not working
   - Ensure source field has valid coordinate data
   - Verify coordinate format matches D(page, x1, y1, ...) pattern

================================================================================
