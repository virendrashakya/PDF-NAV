# Field Creation Feature - ServiceNow PDF Widget

## Overview
The PDF viewer widget has been enhanced with interactive field creation and management capabilities. Users can now create, edit, and delete fields directly from the PDF viewer interface.

## Key Features

### 1. Create New Fields
- Click the **"Create Field"** button in the PDF viewer header
- **Click and drag** on the PDF to select a field area (single selection only)
- Text is automatically extracted from the selected area
- Enter field name and section in the dialog (value is pre-filled)
- Field is marked as "Unsaved" and added to pending queue
- Click **"Save"** button to persist all changes to ServiceNow

### 2. Edit Fields
- Click the **Edit** button (pencil icon) next to any field
- Click and drag to replace the existing selection
- Field value is updated with newly extracted text
- Field is marked as "Unsaved" until you click Save

### 3. Delete Fields
- Click the **Delete** button (trash icon) next to any field
- Confirmation required before deletion
- Field is immediately removed from the database

### 4. Batch Save
- All new and edited fields are queued as "pending"
- Unsaved fields show a green "UNSAVED" badge
- Click the **"Save (X)"** button in the header to save all pending fields
- All changes are persisted to ServiceNow in a single batch operation

## Visual Indicators

### Creation Mode
- PDF container shows animated dashed border
- Cursor changes to crosshair
- Drag selection shows blue dashed rectangle
- Resize handles appear at corners during selection
- Existing coordinates highlighted in different colors

### Color Coding
- **Blue**: Active drag selection and handles
- **Orange**: Active field highlights
- **Green**: Pending/unsaved fields and save button
- **Red**: Deletion confirmations

## Technical Implementation

### Client-Side (clientscript.js)
- **Field Creation Variables** (lines 34-51): State management including drag state
- **Creation Functions** (lines 85-148): Start, add, edit modes with drag support
- **Delete Functions** (lines 151-193): Coordinate and field deletion
- **Save Functions** (lines 207-276): Field persistence
- **Drag Handlers** (lines 289-405): Mouse events for drag selection
- **Text Extraction** (lines 503-574): Extract text from selected PDF area
- **Drawing Functions** (lines 407-479): Visual feedback for drag selection

### Server-Side (serverscript.js)
- **saveField** (lines 178-249): Creates or updates field records
- **deleteField** (lines 251-277): Removes field records
- Uses table: `x_gegis_uwm_dashbo_data_extraction_lineitem`

### UI Components (html)
- **Field Creation Dialog** (lines 15-51): Modal for new field details
- **PDF Header Controls** (lines 318-332): Create Field button in header
- **Creation Indicator** (lines 316-324): Shows current creation mode status
- **Action Menus** (lines 256-284): Edit/delete dropdowns

### Styling (css)
- **Modal Styles** (lines 62-158): Dialog appearance
- **Creation Mode** (lines 349-378): Visual indicators
- **Action Buttons** (lines 189-296): Interactive elements

## Usage Workflow

### Creating New Fields
1. **Load a PDF document** from the dropdown
2. **Click "Create Field"** button in the PDF header
3. **Click and drag** on the PDF to select the field area
4. **Text is automatically extracted** from the selection
5. **Enter field name** in the dialog (value is pre-filled with extracted text)
6. Field is added to the table with "UNSAVED" badge
7. **Click "Save (X)"** button in header to persist all pending fields

### Editing Existing Fields
1. **Click Edit button** (pencil icon) next to a field
2. **Click and drag** to select new area on PDF
3. Field value updates with newly extracted text
4. Field shows "UNSAVED" badge
5. **Click "Save (X)"** to persist changes

### Deleting Fields
1. **Click Delete button** (trash icon) next to a field
2. **Confirm deletion** in dialog
3. Field is immediately removed from database

## Data Format
Fields are stored with D-string format coordinates:
```
D(pageNo, x1, y1, x2, y2, x3, y3, x4, y4)
```
Multiple coordinate sets are separated by semicolons.

## Permissions
- Field creation/editing requires appropriate ServiceNow permissions
- Admin role or specific ACLs may be needed for database operations

## Browser Compatibility
- Modern browsers with Canvas API support
- PDF.js library for rendering
- ES5 JavaScript for ServiceNow compatibility
