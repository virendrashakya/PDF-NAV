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
| `x_gegis_uwm_dashbo_coverage_field_metadata` | **Master field dictionary.** Every field that can exist: `field_name`, `data_type` (`CURRENCY`/`NUMBER`/`STRING`/`BOOLEAN`), `coverage_type` (section header, display value), `parent_field_name` (self-join for nesting), `sequence` (sort). Queried in full, location-independent. |
| `x_gegis_uwm_dashbo_property_coverage` | **Per-location values.** One row = one metadata field's value for one location. `coverage_metadata_id` → metadata.sys_id, `location` → property_location.sys_id, typed value columns `field_value_currency`/`_number`/`_string`/`_boolean` + optional `field_value_formatted`. The row a value edit PATCHes. |
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
| `fetchPropertyLocations` | `submissionSysId` | Loads submission header, all property locations (ordered by version desc, then name), joined address + first top_risk per location, attachment data. Also returns `fieldSectionsByLocation` (**real**, keyed by PL sys_id — see below) and `versions` (still dummy). |
| `saveField` | `update: {sys_id, field_value, meta}`, `propertyLocationSysId` | **Real.** PATCHes one field's typed value column on its `property_coverage` row (`_persistFieldValue`). Updates existing rows only — if `meta.sysId` is null (no coverage row), it errors rather than inserting. |
| `saveFields` | `updates: [{sys_id, field_value, meta}]`, `propertyLocationSysId` | **Real, bulk.** The top "Save Changes" button. Runs `_persistFieldValue` per row; returns `updatedCount` + per-row `errors[]`. `success = true` even on partial failure (errors surfaced in `data.errors`). |

### Field sections (real — coverage metadata + values)

Built from the artifact's association model: **master → values, joined by a reference, scoped by context.**

1. `_loadFieldDictionary()` — query `coverage_field_metadata` in full, `orderBy(sequence)`. One entry per field: `field_name`, `data_type`, `coverage_type_key` (raw value → grouping key), `coverage_type_display` (display value → fallback header), `parent_field_name`, `sequence`.
2. `_buildFieldSections(dictionary, locationSysId)` — query `property_coverage` where `location = <plSysId>`, index rows by `coverage_metadata_id`. For each metadata field: look up its coverage row, pick the `field_value_*` column by `data_type` (`field_value_formatted` wins if present), group by `coverage_type_key`.
   - **Returns an ORDERED ARRAY `[{ key, label, fields: [...] }]`, NOT an object.** AngularJS `ng-repeat` over an object sorts keys, which lost section order — an array preserves it. Sections are ordered by the **lowest field `sequence`** within each. `label` = `CONFIG.sectionLabels[key]` (a JSON friendly-name map you edit) falling back to `coverage_type_display`.
3. Each field node carries `meta: { table, sysId, valueField }` — the PATCH target. `sysId` is null when no coverage row exists for that field at that location; the value cell then renders read-only and `saveField` no-ops.

**Only `field_value` is persisted.** `data_verification`, `commentary`, `logic_transparency`, `confidence_indicator`, `source` are blank — no backing columns yet. The field object keeps the v2 client shape so the template is unchanged apart from the editable AI Value cell.

`field.sys_id` is the **metadata field's** sys_id (stable field identity), NOT the coverage row's. The coverage row sys_id lives in `field.meta.sysId`.

---

## Client state model (clientscript.js controller `c`)

### Property location list / selection

- `c.propertyLocations[]` — one entry per row in the top summary table
- `c.selectedPropertyLocationSysId` — currently selected PL (defaults to first on load)
- `c.selectPropertyLocation(loc)` — sets selection, swaps in that PL's `groupedFields` from `fieldSectionsByLocation`, loads the PL's `property_document` PDF
- `c.isLocationSelected(loc)` / `c.selectedLocation()` / `c.currentDocumentLabel()` — selection helpers used by the template

### Field sections

- `c.fieldSectionsByLocation = { sys_id: [ { key, label, fields: [...] }, ... ] }` — full map returned by server; each value is an **ordered array** of sections
- `c.groupedFields` — the selected location's section array (ordered). Rendered with `ng-repeat="section in c.groupedFields track by section.key"`; header shows `section.label`.
- `c.collapsedSections = { sectionKey: bool }` — keyed by `section.key`
- `c.flatten(sections)` — flattens the section array's `fields` into one list (tolerates the legacy object shape defensively)
- Each field: `sys_id` (metadata field id), `field_name, field_value, data_type` (`CURRENCY`/`NUMBER`/`STRING`/`BOOLEAN` — drives display format + inline editor), `data_verification, commentary, logic_transparency, confidence_indicator, source, attachmentData`, plus `meta: { table, sysId, valueField }` (coverage-row PATCH target; `sysId` null ⇒ no row ⇒ value read-only)

### PDF state

`c.pdfLoaded, c.scale, c.currentPage, c.totalPages, c.zoomMode ('actual-size' | 'fit-width')`. PDF.js v2.11.338 loaded from cdnjs. PDF per-PL — switching `c.selectedPropertyLocationSysId` reloads the document.

### Search + filters

- `c.fieldSearch` (text), `c.searchExpanded` (UI toggle)
- `c.shouldShowField(field)` — always-true field-visibility hook (the "Show only exceptions" toggle was removed). Kept so the template `ng-if` stays valid and a future filter can drop in here.
- `c.searchFilter(field)` — ng-filter callback across `field_name | field_value | data_verification | logic_transparency | commentary`

### Save tracking (real)

- `c.changedFields = { sys_id: true }` set by `markFieldAsChanged`
- `c.canEditValue(field)` — true iff `field.meta.sysId` + `valueField` exist (a coverage row to PATCH). Gates the editable AI Value cell and short-circuits value saves.
- **All three editable columns (AI Value, Data Verification, Commentary) are click-to-edit** (not always-on inputs): each shows `c.displayText(field, column)` as text with a hover edit affordance (`.ai-value-display.editable` → pen icon); clicking swaps in the editor. Edit state is a single `c.editingCellKey` = `<field.sys_id>:<column>` (`column ∈ 'value' | 'verification' | 'commentary'`), so only one cell edits at a time but a field's three cells are independent.
  - Generic helpers: `c.isEditing(field, column)`, `c.startEditing(field, column, $event)`, `c.stopEditing(field, column)`, `c.canEditColumn(field, column)`, `c.columnModel(column)` (→ `field_value` / `data_verification` / `commentary`). Editor element id = `cellEditor-<sys_id>-<column>`.
  - **AI Value ('value')**: boolean → Yes/No `<select>` (`c.isBooleanField`, normalized via `c.normalizeBoolean` on open), else text input. `stopEditing` autosaves to the coverage row. Editable only when `canEditValue`.
    - **Display formatting** (via `c.displayText`, display-only — the editor binds the raw value): booleans → `Yes`/`No`; CURRENCY (`c.isCurrencyField`) → `$` + thousands-separated via `c.formatCurrency`. Editing/saving always use the raw number.
  - **Data Verification / Commentary**: text input, always UI-editable. `stopEditing` only marks the field changed (in-memory) — **no server save**, since neither has a backing column yet.
  - Back-compat shims kept for the value column: `c.isEditingValue`, `c.displayValue`, `c.startEditingValue`, `c.stopEditingValue` delegate to the generic functions with `column = 'value'`.
- `c.autoSaveField(field)` POSTs `saveField` on blur, sending `{sys_id, field_value, meta}`. Skips + clears the dirty flag when `!canEditValue`.
- `c.onSaveChanges()` (top "Save Changes" button) — bulk-flushes all dirty editable fields via `saveFields` in one round trip; toasts the saved count. No-op toast when nothing is dirty.
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
  - **Fields toolbar:** "Fields" label, orange `X of Y (filename)` doc-filter pill, expandable inline search
  - **Property locations summary table:** 8 columns (Location Name | Address | Location Type | Geocodes | Line of Business | State | Country | Insured Value). Clicking a row selects the PL.
  - **Collapsible field sections:** 5-column `<table class="fields-table">` (Field Name | AI Value | Data Verification | Logic Transparency | Commentary) per section, with accuracy % header pill. **AI Value, Data Verification, and Commentary are all click-to-edit**: formatted text + hover pen affordance (`.ai-value-display`) → click reveals the editor → blur/Enter closes. AI Value saves to the coverage row (or is a read-only span when no row exists); Data Verification & Commentary are UI-only (no backing column). Logic Transparency stays read-only.
  - **Save status bar** at sidebar bottom
- **PDF panel:** header (filename, fit-width / actual-size, prev / next page) + canvas + footer

### Top action buttons

`Refer`, `Save Changes`, `Re-Run Geocoding` live in `.header-actions` to the right of the submission title.
- **`Save Changes` (`c.onSaveChanges`) is real** — bulk-flushes all dirty editable fields via the `saveFields` server action.
- **`Refer` (`c.onRefer`) and `Re-Run Geocoding` (`c.onReRunGeocoding`) are still dummy** — each shows an info toast and carries a TODO with intended backend behavior. Wire these up when the corresponding server actions land.

The page-level `⋯` menu from the screenshot is still omitted.

---

## Conventions

- **Always work in `widget v2 - property-locations/`** for property-location features. Do not edit `widget v2 - azurui/` to make property-location changes.
- **Field sections are real** — from `coverage_field_metadata` (master) joined to `property_coverage` (per-location values), grouped by `coverage_type`. See "Field sections" under Backend. Only `field_value` is persisted; the other per-field columns are blank until backing columns exist.
- **Value saves PATCH the coverage row via `field.meta`.** `saveField` / `saveFields` update existing rows only — no insert when `meta.sysId` is null (row creation is controlled elsewhere). Never save any column other than the typed `field_value_*` unless the data model gains it.
- **CSS is forked from v2 azurui.** Property-locations-specific styles live at the bottom of [css](css) under the "PROPERTY LOCATIONS WIDGET — additions" section. The shared base (loading, toasts, sidebar shell, fields-table, PDF panel) is kept in sync visually with v2 by deliberate inheritance — if v2 changes its base styles, copy the relevant blocks over rather than diverging silently.
- **No QA Override column.** This widget only has Data Verification + Commentary as editable fields. Don't add `qa_override_value` logic from v2 unless the data model gains the column.
