# Property Locations Widget — Context & Conventions

Single source of truth for working on this widget. **Update this file whenever behavior changes.**

ServiceNow Service Portal widget for browsing property locations on an underwriting submission alongside the source PDF.

**URL parameters:**

- `?submissionSysId=<sys_id>` (preferred) or `?sys_id=<sys_id>` (ServiceNow standard) — required. Identifies the submission whose property locations to load.
- `?locationSysId=<sys_id>` — optional. When provided, the server loads ONLY that one property location (single-row summary table). When omitted, the server lists all property locations for the submission via the property_detail bridge.

Resolution order on the client: URL param → `$scope.data.<param>` (set by server from `$sp.getParameter` — covers widget-instance options on a Service Portal page).

If `submissionSysId` doesn't resolve, the client surfaces a toast: "Missing submission sys_id. Open this widget with ?submissionSysId=<sys_id> in the URL." No silent fallback to a hardcoded sys_id.

If `locationSysId` is provided but the PL doesn't belong to the submission (via the shared `property_detail` reference), the server returns an error and the client shows the empty state.

Sibling of [widget v2 - azurui/](../widget%20v2%20-%20azurui/) — visual shell + PDF.js viewer are intentionally adapted from there.

---

## Files

| File | Role |
|---|---|
| [serverscript.js](serverscript.js) | Server-side: `fetchPropertyLocations`, `saveField` (dummy) |
| [clientscript.js](clientscript.js) | AngularJS controller: PL selection, PDF.js, autosave on blur |
| [html](html) | Template: PL summary table + collapsible field sections + PDF canvas |
| [css](css) | Copied from v2 azurui + property-locations-specific additions at the bottom |

---

## Backend

### Tables (`CONFIG.tables` in serverscript.js)

| Table | Purpose |
|---|---|
| `x_gegis_uwm_dashbo_submission` | Submission header (number, line_of_business_choice, total_insured_value) |
| `x_gegis_uwm_dashbo_property_lob_detail` | **Bridge table.** Both submission and property_location have a `property_detail` reference column pointing at a row here. Used to resolve which PLs belong to a submission. |
| `x_gegis_uwm_dashbo_property_location` | Property locations. Versioned via `version` column. Has `audit_document` (attachment sys_id — note: not `property_document`) and `source_in_document` (PDF coords). Linked to a submission via `property_detail` (NOT a direct `submission` ref). |
| `x_gegis_uwm_dashbo_address` | Geocoded address joined from `property_location.address` |
| `x_gegis_uwm_dashbo_extract_top_risk` | `property_location` → many top risks. Current impl fetches the first one and exposes its `total` as Insured Value. |
| `sys_attachment` | PDF attachments (filtered by `content_type ∈ application/pdf, application/octet-stream`) |

### Data flow

```
submission.property_detail ──┐
                             ├─► x_gegis_uwm_dashbo_property_lob_detail (bridge)
property_location.property_detail ──┘
```

A submission's property locations are found by reading `submission.property_detail`, then querying `property_location` where `property_detail = <that sys_id>`. Each PL has `version` (for future versioning UI), joins to 1 Address (via `property_location.address`) + many Top Risks (first row's `total` used as "Insured Value") + 1 PDF attachment via `audit_document`.

When `?locationSysId=<sys_id>` is in the URL, the server skips the bridge query and loads exactly that one property_location by sys_id (with a guard verifying it shares the same `property_detail` as the submission). This is the canonical "single location" entry point — the top summary table renders one row.

If `submission.property_detail` is empty, the widget returns an empty PL list (and the client shows the empty state). This is by design — no bridge ⇒ no locations.

### Server actions (`switch (input.action)`)

| Action | Inputs | Behavior |
|---|---|---|
| `fetchPropertyLocations` | `submissionSysId` | Loads submission header, all property locations (ordered by version desc, then name), joined address + first top_risk per location, attachment data. Also returns `fieldSectionsByLocation` (dummy JSON, keyed by PL sys_id) and `versions` (dummy). |
| `saveField` | `update: {sys_id, data_verification, commentary}`, `propertyLocationSysId` | **Dummy** — currently just echoes success. No real persistence (the line-items table for property locations does not exist yet). |

### Why field sections are dummy

The user confirmed on 2026-05-25 that the "Location Address / Property Coverage" rows shown in the screenshot don't yet have a backing table. The server builds them in-memory in `_buildDummyFieldSections(location)` — one identical-shape object per property location, keyed by PL sys_id. Replace with a real query once the table exists.

---

## Client state model (clientscript.js controller `c`)

### Property location list / selection

- `c.propertyLocations[]` — one entry per row in the top summary table
- `c.selectedPropertyLocationSysId` — currently selected PL (defaults to first on load)
- `c.selectPropertyLocation(loc)` — sets selection, swaps in that PL's `groupedFields` from `fieldSectionsByLocation`, loads the PL's `property_document` PDF
- `c.isLocationSelected(loc)` / `c.selectedLocation()` / `c.currentDocumentLabel()` — selection helpers used by the template

### Field sections

- `c.fieldSectionsByLocation = { sys_id: { sectionName: [field, ...] } }` — full map returned by server
- `c.groupedFields` — currently visible sections (the selected location's slice)
- `c.collapsedSections = { sectionName: bool }`
- Each field: `sys_id, field_name, field_value, data_verification, commentary, logic_transparency, confidence_indicator, source, attachmentData`

### PDF state

`c.pdfLoaded, c.scale, c.currentPage, c.totalPages, c.zoomMode ('actual-size' | 'fit-width')`. PDF.js v2.11.338 loaded from cdnjs. PDF per-PL — switching `c.selectedPropertyLocationSysId` reloads the document.

### Search + filters

- `c.fieldSearch` (text), `c.searchExpanded` (UI toggle)
- `c.showOnlyExceptions` — top-right toggle in the toolbar; `c.shouldShowField(field)` returns true only for fields with `validationError` or `confidence_indicator < 0.75`
- `c.searchFilter(field)` — ng-filter callback across `field_name | field_value | data_verification | logic_transparency | commentary`

### Save tracking (dummy)

- `c.changedFields = { sys_id: true }` set by `markFieldAsChanged`
- `c.autoSaveField(field)` POSTs `saveField` on blur (currently dummy)
- `c.saveStatus ∈ '' | 'saving' | 'saved' | 'error'` with `c.saveStatusMessage` — surfaces at the bottom of the sidebar

### Toasts

`c.toasts[]` with auto-dismiss; same helpers as v2: `showSuccess / showError / showInfo / showWarning`.

---

## UX flows

### Initial load

1. `loadPdfJs()` injects PDF.js from cdnjs
2. `loadData()` calls `fetchPropertyLocations` with `submissionSysId` from URL
3. On success, `selectPropertyLocation(propertyLocations[0])` is called — populates `groupedFields`, loads PDF

### Selecting a property location

Click a row in the top summary table → `selectPropertyLocation(loc)`:
- Updates `c.selectedPropertyLocationSysId`
- Replaces `c.groupedFields` with that PL's slice from `fieldSectionsByLocation`
- Clears `activeField`
- Loads the new PDF if the PL has `attachmentData.file_url`

### Autosave (no Save button — fields autosave on blur)

1. User edits Data Verification or Commentary → `ng-change="c.markFieldAsChanged(field)"`
2. On blur → `ng-blur="c.autoSaveField(field)"` POSTs `saveField`
3. On success: clears `changedFields[sys_id]`, sets `saveStatus = 'saved'`

The QA Override → Commentary gate from widget v2 azurui is intentionally absent here because there is no QA Override column.

### Field navigation in PDF

`c.canNavigate(field)` returns true if `field.source` has coords. `c.navigateToField(field)` parses coords, jumps to the page, highlights the quads via the annotation canvas. Cross-document navigation is not needed — every field belongs to the currently selected PL's single PDF.

---

## HTML template structure ([html](html))

- Loading overlay (`ng-show="c.isLoading"`) + toast container
- Two-column main layout:
  - **Sidebar header:** collapse toggle + `Submission ID: <number>` title
  - **Fields toolbar:** "Fields" label, orange `X of Y (filename)` doc-filter pill, expandable inline search, `Show only exceptions` iOS-style toggle
  - **Property locations summary table:** 8 columns (Location Name | Address | Location Type | Geocodes | Line of Business | State | Country | Insured Value). Clicking a row selects the PL.
  - **Collapsible field sections:** 5-column `<table class="fields-table">` (Field Name | AI Value | Data Verification | Logic Transparency | Commentary) per section, with accuracy % header pill
  - **Save status bar** at sidebar bottom
- **PDF panel:** header (filename, fit-width / actual-size, prev / next page) + canvas + footer

### Intentionally omitted vs the screenshot

User asked to skip these for now: top action buttons `Refer`, `Save Changes`, `Re-Run Geocoding`, and the page-level `⋯` menu. No Complete button either (no completion workflow exists in this widget yet).

---

## Conventions

- **Always work in `widget v2 - property-locations/`** for property-location features. Do not edit `widget v2 - azurui/` to make property-location changes.
- **Field sections are dummy.** When the backing table lands, replace `_buildDummyFieldSections` in serverscript.js with a real GlideRecord query and adjust the server response shape only if the field-row schema changes (the client expects the same field-object shape the v2 widget uses).
- **`saveField` is dummy.** Until a real save target exists, treat saves as best-effort UI state; do not promise users their edits are persisted.
- **CSS is forked from v2 azurui.** Property-locations-specific styles live at the bottom of [css](css) under the "PROPERTY LOCATIONS WIDGET — additions" section. The shared base (loading, toasts, sidebar shell, fields-table, PDF panel) is kept in sync visually with v2 by deliberate inheritance — if v2 changes its base styles, copy the relevant blocks over rather than diverging silently.
- **No QA Override column.** This widget only has Data Verification + Commentary as editable fields. Don't add `qa_override_value` logic from v2 unless the data model gains the column.
