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
| `x_gegis_uwm_dashbo_property_coverage` | **Per-location values (Model Data).** One row = one metadata field's value for one location. `coverage_metadata_id` → metadata.sys_id, `location` → property_location.sys_id, typed value columns `field_value_currency`/`_number`/`_string`/`_boolean` + optional `field_value_formatted`. The row a Model-Data value edit PATCHes. |
| `x_gegis_uwm_dashbo_data_extraction` | **Audit Data version.** Versioned extractions per submission (`submission`, `version`, `active`, `discarded`, `sys_created_on`). `_resolveDataExtraction` picks the most-recent `active` row (else most-recent) to scope the audit line items. |
| `x_gegis_uwm_dashbo_data_extraction_lineitem` | **Audit Data source.** Editable line items. `parent` → data_extraction.sys_id; **`model_object_sys_id` → property_location.sys_id** (the per-PL audit scope). Columns surfaced: `field_name_final`, `field_value`, `data_verification`, `commentary`, `reason` (→ logic_transparency), `confidence_indicator`, `section_name_final` (grouping), `sequence_final` (sort), `source`. |
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
| `fetchPropertyLocations` | `submissionSysId` | Loads submission header, all property locations (ordered by version desc, then name), joined address + first top_risk per location, attachment data. Also returns `fieldSectionsByLocation` (Model Data — **real**, keyed by PL sys_id), `auditSectionsByLocation` (Audit Data — **real**, keyed by PL sys_id — see below), and `versions` (still dummy). |
| `saveField` | `update: {sys_id, field_value, meta}`, `propertyLocationSysId` | **Real (Model Data).** PATCHes one field's typed value column on its `property_coverage` row (`_persistFieldValue`). Updates existing rows only — if `meta.sysId` is null (no coverage row), it errors rather than inserting. |
| `saveFields` | `updates: [{sys_id, field_value, meta}]`, `propertyLocationSysId` | **Real, bulk (Model Data).** Runs `_persistFieldValue` per row; returns `updatedCount` + per-row `errors[]`. `success = true` even on partial failure (errors surfaced in `data.errors`). |
| `saveAuditField` | `update: {sys_id, qa_override_value, data_verification, commentary, meta}`, `submissionSysId` | **Real (Audit Data).** PATCHes `qa_override_value` + `data_verification` + `commentary` on the line item row (`_persistAuditField`). **AI Value (`field_value`) is read-only — never sent/written.** **Rejected by `_isAuditEditAllowed()` when `submission_status_choice` ∉ (`dataVerificationEditStatuses` ∪ `qaOverrideEditStatuses`).** Only keys present on the update are written. `meta.table` must be the line item table. |
| `saveAuditFields` | `updates: [{…}]`, `submissionSysId` | **Real, bulk (Audit Data).** Same `_persistAuditField` per row + same `_isAuditEditAllowed()` gate; same partial-success contract as `saveFields`. |
| `syncModelToAudit` | `locationSysId` | **Model → Audit.** Calls `ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location(locationSysId, MODEL2AUDIT)`. Run once on page load before the fetch. |
| `completeAuditToModel` | `locationSysId` | **Audit → Model (Complete button).** Calls `ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location(locationSysId, AUDIT2MODEL)`. |

### Field sections (real — coverage metadata + values)

Built from the artifact's association model: **master → values, joined by a reference, scoped by context.**

1. `_loadFieldDictionary()` — query `coverage_field_metadata` in full, `orderBy(sequence)`. One entry per field: `field_name`, `data_type`, `coverage_type_key` (raw value → grouping key), `coverage_type_display` (display value → fallback header), `parent_field_name`, `sequence`.
2. `_buildFieldSections(dictionary, locationSysId)` — query `property_coverage` where `location = <plSysId>`, index rows by `coverage_metadata_id`. For each metadata field: look up its coverage row, pick the `field_value_*` column by `data_type` (`field_value_formatted` wins if present), group by `coverage_type_key`.
   - **Returns an ORDERED ARRAY `[{ key, label, fields: [...] }]`, NOT an object.** AngularJS `ng-repeat` over an object sorts keys, which lost section order — an array preserves it. Sections are ordered by the **lowest field `sequence`** within each. `label` = `CONFIG.sectionLabels[key]` (a JSON friendly-name map you edit) falling back to `coverage_type_display`.
3. Each field node carries `meta: { table, sysId, valueField }` — the PATCH target. `sysId` is null when no coverage row exists for that field at that location; the value cell then renders read-only and `saveField` no-ops.

**Only `field_value` is persisted.** `data_verification`, `commentary`, `logic_transparency`, `confidence_indicator`, `source` are blank — no backing columns yet. The field object keeps the v2 client shape so the template is unchanged apart from the editable AI Value cell.

`field.sys_id` is the **metadata field's** sys_id (stable field identity), NOT the coverage row's. The coverage row sys_id lives in `field.meta.sysId`.

### Two areas: Model Data + Audit Data

The sidebar renders **two independently-collapsible top-level areas** (`.field-area`):

1. **Model Data** — the field sections above (coverage metadata + `property_coverage`).
2. **Audit Data** — line items from `x_gegis_uwm_dashbo_data_extraction_lineitem`.

Audit build (`_buildAuditSections(dataExtractSysId, locationSysId)`):
- `_resolveDataExtraction(submissionSysId)` runs **once per fetch** (most-recent `active` extraction, else most-recent) → the `parent` scope.
- Query line items where `model_object_sys_id = <PL sys_id>`, `orderBy(sequence_final, field_name_final)`.
- **The `parent = <data_extraction>` filter is currently COMMENTED OUT** ([serverscript.js](serverscript.js), `_buildAuditSections`). With it on, the audit area came up empty (the active-extraction resolution didn't line up with the line items that carry `model_object_sys_id`). Scoping by PL alone surfaces the rows. **Re-enable it once real active-extraction data is present** — caveat: while off, line items from *all* extraction versions for the PL match (possible cross-version duplicates).
- Group by `section_name_final` into the **same ordered-array `[{key,label,fields}]` shape** as `_buildFieldSections`, so the client renders both areas with identical section/table markup.
- Each field node's `meta.table` = the line item table (`CONFIG.tables.lineItem`). This is the **save-routing key** on the client.

**Persistence asymmetry (important):**
- **Model Data**: only `field_value` persists (to `property_coverage`). `data_verification` / `commentary` are UI-only (no backing column) and always UI-editable. No QA Override column.
- **Audit Data**: **AI Value (`field_value`) is READ-ONLY** — never editable, never sent in a save payload. `qa_override_value`, `data_verification` **and** `commentary` persist (real columns on the line item), **but only when the submission status permits editing** (see gate below). Logic Transparency (`reason`) is read-only in both.

**Audit edit gate (submission-status-driven — mirrors widget v2 - azurui):**
- Server sends `data.submissionStatusChoice` + `data.config.{dataVerificationEditStatuses, qaOverrideEditStatuses}`. Client: `c.canEditDataVerification()` = status ∈ DV list; `c.canEditQaOverride()` = status ∈ QA list (`['QUALITY_ASSURANCE']`); `c.canEditCommentary()` = DV **or** QA editable.
- `c.canEditColumn(field, column)` applies this **only to Audit fields**: when the status doesn't permit, Audit QA Override / DV / Commentary render as plain read-only text (no pen, no click-to-edit). Model Data's DV/Commentary are unaffected (always UI-editable).
- **Server enforces it too** (defense-in-depth): `_isAuditEditAllowed()` reads the submission status fresh and rejects `saveAuditField`/`saveAuditFields` unless the status ∈ (DV list ∪ QA list). The client sends `submissionSysId` with every audit save so the server can resolve status. Fails safe (denies) if the submission can't be resolved.

**QA Override → Commentary rule (Audit only):** setting `qa_override_value` makes `commentary` mandatory. `autoSaveField` blocks the save (drops the change, flags `commentaryRequired`) via `validateCommentary`; `c.hasValidationErrors()` disables Complete; `markAsComplete` aborts via `findFieldsMissingCommentary()`.
  - **Required-Commentary is auto-surfaced** (cells are click-to-edit, so a flagged-but-unopened Commentary would otherwise be invisible). `c.openCellForEdit(field, column)` un-collapses the Audit area + the field's section, then opens/focuses/scrolls the cell. It fires (a) in `autoSaveField` when the gate blocks (hand-off from QA Override → Commentary on that row), and (b) in `markAsComplete` on the first offender. **`stopEditing` nulls `editingCellKey` BEFORE calling `autoSaveField`** so the hand-off's re-open isn't wiped.

**Dependency:** `model_object_sys_id` must exist and be populated on the line item table (holds the property_location sys_id). If it's absent/empty, the Audit Data area renders empty (the `.field-area--audit` block is `ng-if`'d on `c.auditGroupedFields.length`, so it hides entirely).

Audit AI Value renders as a read-only span (same as Logic Transparency) — no click-to-edit, no editor.

---

## Client state model (clientscript.js controller `c`)

### Property location list / selection

- `c.propertyLocations[]` — one entry per row in the top summary table
- `c.selectedPropertyLocationSysId` — currently selected PL (defaults to first on load)
- `c.selectPropertyLocation(loc)` — sets selection, swaps in that PL's `groupedFields` from `fieldSectionsByLocation`, loads the PL's `property_document` PDF
- `c.isLocationSelected(loc)` / `c.selectedLocation()` / `c.currentDocumentLabel()` — selection helpers used by the template

### Field sections

- `c.fieldSectionsByLocation = { sys_id: [ { key, label, fields: [...] }, ... ] }` — Model Data map returned by server; each value is an **ordered array** of sections
- `c.groupedFields` — the selected location's **Model Data** section array (ordered). Rendered with `ng-repeat="section in c.groupedFields track by section.key"`; header shows `section.label`.
- `c.collapsedSections = { sectionKey: bool }` — keyed by `section.key` (Model Data inner sections)
- `c.auditSectionsByLocation` / `c.auditGroupedFields` / `c.auditCollapsedSections` — the **Audit Data** equivalents. Separate collapse map because section keys can collide across the two areas (e.g. both may have a "PROPERTY" section) — a shared map would collapse them in lockstep.
- **Top-level area collapse:** `c.modelDataCollapsed` / `c.auditDataCollapsed` (booleans) toggled by `c.toggleModelData()` / `c.toggleAuditData()`. These hide the whole area body, independent of the inner section collapse. **Default: Model Data collapsed (`true`), Audit Data expanded (`false`).**
- `c.isAuditField(field)` — true iff `field.meta.table === 'x_gegis_uwm_dashbo_data_extraction_lineitem'`. **The save-routing key.** (`AUDIT_TABLE` const in the controller must stay in sync with `CONFIG.tables.lineItem`.)
- `c.allFields()` — flattens **both** areas' fields; used by `getVisibleFieldCount` / `getTotalCount` and the doc-filter pill.
- `c.flatten(sections)` — flattens one section array's `fields` into one list (tolerates the legacy object shape defensively)
- Each field: `sys_id` (metadata field id), `field_name, field_value, data_type` (`CURRENCY`/`NUMBER`/`STRING`/`BOOLEAN` — drives display format + inline editor), `data_verification, commentary, logic_transparency, confidence_indicator, source, attachmentData`, plus `meta: { table, sysId, valueField }` (coverage-row PATCH target; `sysId` null ⇒ no row ⇒ value read-only)

### PDF state

`c.pdfLoaded, c.scale, c.currentPage, c.totalPages, c.zoomMode ('actual-size' | 'fit-width')`. PDF.js v2.11.338 loaded from cdnjs. PDF per-PL — switching `c.selectedPropertyLocationSysId` reloads the document.

### Search + filters

- `c.fieldSearch` (text), `c.searchExpanded` (UI toggle)
- `c.shouldShowField(field)` — always-true field-visibility hook (the "Show only exceptions" toggle was removed). Kept so the template `ng-if` stays valid and a future filter can drop in here.
- `c.searchFilter(field)` — ng-filter callback across `field_name | field_value | data_verification | logic_transparency | commentary`

### Save tracking (real)

- `c.changedFields = { sys_id: true }` set by `markFieldAsChanged`
- `c.canEditValue(field)` — true iff `field.meta.sysId` + `valueField` exist (a coverage row to PATCH). Gates the editable **Model** AI Value cell and short-circuits value saves.
- **Audit edit gate:** `c.submissionStatusChoice` + `c.dataVerificationEditStatuses` + `c.qaOverrideEditStatuses` (server-supplied); `c.canEditDataVerification()` / `c.canEditQaOverride()` return status ∈ respective list; `c.canEditCommentary()` = either. `c.canEditColumn(field, column)` routes: Audit AI Value → always false (read-only); Audit QA Override/DV/Commentary → the status gate; Model DV/Commentary → always true; Model value → `canEditValue`.
- **Click-to-edit columns** (not always-on inputs): each shows `c.displayText(field, column)` as text with a hover edit affordance (`.ai-value-display.editable` → pen icon); clicking swaps in the editor. Edit state is a single `c.editingCellKey` = `<field.sys_id>:<column>` (`column ∈ 'value' | 'qaOverride' | 'verification' | 'commentary'`), so only one cell edits at a time. Model Data uses value/verification/commentary; Audit Data uses qaOverride/verification/commentary (its value is read-only).
  - Generic helpers: `c.isEditing(field, column)`, `c.startEditing(field, column, $event)`, `c.stopEditing(field, column)`, `c.canEditColumn(field, column)`, `c.columnModel(column)` (→ `field_value` / `data_verification` / `commentary`). Editor element id = `cellEditor-<sys_id>-<column>`.
  - **AI Value ('value')**: boolean → Yes/No `<select>` (`c.isBooleanField`, normalized via `c.normalizeBoolean` on open), else text input. `stopEditing` autosaves to the coverage row. Editable only when `canEditValue`.
    - **Display formatting** (via `c.displayText`, display-only — the editor binds the raw value): booleans → `Yes`/`No`; CURRENCY (`c.isCurrencyField`) → `$` + thousands-separated via `c.formatCurrency`. Editing/saving always use the raw number.
  - **Data Verification / Commentary**: text input, always UI-editable. `stopEditing` only marks the field changed (in-memory) — **no server save**, since neither has a backing column yet.
  - Back-compat shims kept for the value column: `c.isEditingValue`, `c.displayValue`, `c.startEditingValue`, `c.stopEditingValue` delegate to the generic functions with `column = 'value'`.
- `c.autoSaveField(field)` POSTs on blur, **routed by `isAuditField`**: audit → `saveAuditField` (sends `data_verification` + `commentary` only — **not** `field_value`, which is read-only); model → `saveField` (sends `field_value` only, skips + clears the dirty flag when `!canEditValue`). Audit fields always have a row, so they are always savable.
- `c.stopEditing` autosaves the `value` column for **model** fields only. For **audit** fields it autosaves `verification` + `commentary` (AI Value is read-only, never triggers a save); for **model** fields verification/commentary stay UI-only.
- **No bulk "Save Changes" button** — fields autosave on blur only. (The old Refer / Save Changes / Re-Run Geocoding buttons were removed.)
- `c.saveStatus ∈ '' | 'saving' | 'saved' | 'error'` with `c.saveStatusMessage` — surfaces at the bottom of the sidebar

### Complete button (Audit → Model)

- `c.completeBtn` (single source of truth) + `setCompleteState('idle'|'progress'|'done'|'error')` — mirrors widget v2 - azurui. The only way to mutate the button. States: idle "Complete" (paper-plane), progress "Sending Data to Model..." (bouncing dots), done "Completed" (animated check, auto-resets to idle after 2s), error "Failed — Retry" (auto-resets after 4s).
- `c.markAsComplete()` — POSTs `completeAuditToModel` with the URL's `locationSysId`. On success shows the done state + success toast; on failure shows the error state + toast. Async — the button reflects live progress.
- **Load-time Model → Audit sync:** `loadData()` first POSTs `syncModelToAudit` (with the URL's `locationSysId`), then `fetchData()`. Sync failure is non-blocking (warns "audit data may be stale") but still fetches. This is why audit line items reflect current model data on open.

### Toasts

`c.toasts[]` with auto-dismiss; same helpers as v2: `showSuccess / showError / showInfo / showWarning`.

---

## UX flows

### Initial load

1. `loadPdfJs()` injects PDF.js from cdnjs
2. `loadData()` first POSTs `syncModelToAudit` (Model → Audit for the URL's `locationSysId`), then calls `fetchData()` → `fetchPropertyLocations`. Sync failure is non-blocking (warns, still fetches).
3. On success, `selectPropertyLocation(propertyLocations[0])` is called — populates `groupedFields` + `auditGroupedFields`, loads PDF

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
  - **Two collapsible areas** (`.field-area` + `.area-header` with its own chevron): **Model Data** then **Audit Data** (`.field-area--audit`, only rendered when `c.auditGroupedFields.length`). Each area toggles via `c.toggleModelData()` / `c.toggleAuditData()`.
  - **Collapsible field sections** (inside each area). **Model Data** = 5-column `<table class="fields-table">` (Field Name | AI Value | Data Verification | Logic Transparency | Commentary). **Audit Data** = 6-column (adds **QA Override** between Data Verification and Logic Transparency). Each has an accuracy % header pill. In **Model Data**, AI Value is click-to-edit and saves to the coverage row (or read-only span when no row exists); Data Verification & Commentary are click-to-edit but UI-only. In **Audit Data**, AI Value is a **read-only span**; QA Override, Data Verification & Commentary are click-to-edit (status-gated) and persist to the line item row. Logic Transparency stays read-only in both.
  - **Save status bar** at sidebar bottom
- **PDF panel:** header (filename, fit-width / actual-size, prev / next page) + canvas + footer

### Top action button

A single **`Complete`** button lives in `.header-actions` to the right of the submission title (the old `Refer` / `Save Changes` / `Re-Run Geocoding` buttons were removed — fields autosave, so no Save button is needed). It runs Audit → Model for the URL's location via `c.markAsComplete()` → `completeAuditToModel`, with the `c.completeBtn` async state machine (see "Complete button" above). Its CSS (`.btn-complete*`, dots, circle-check, shake) is inherited from the v2 azurui fork and already present in [css](css).

The page-level `⋯` menu from the screenshot is still omitted.

### External ServiceNow dependency

`ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location(locationSysId, mode)` where `mode ∈ MODEL2AUDIT | AUDIT2MODEL`. This is the **`_Location` variant** (per-location), distinct from azurui's per-submission `dataFlowBetweenDataExtractAndModel(submissionNumber, mode)`. Called by `syncModelToAudit` (load) and `completeAuditToModel` (Complete). Source lives in the ServiceNow instance, not this repo.

---

## Conventions

- **Always work in `widget v2 - property-locations/`** for property-location features. Do not edit `widget v2 - azurui/` to make property-location changes.
- **Field sections are real** — from `coverage_field_metadata` (master) joined to `property_coverage` (per-location values), grouped by `coverage_type`. See "Field sections" under Backend. Only `field_value` is persisted; the other per-field columns are blank until backing columns exist.
- **Two areas: Model Data + Audit Data.** Model Data = `property_coverage`; Audit Data = `data_extraction_lineitem` scoped by `model_object_sys_id = PL.sys_id`. Save routing is by `field.meta.table` (`c.isAuditField`) — keep `AUDIT_TABLE` in clientscript in sync with `CONFIG.tables.lineItem`.
- **Model-Data value saves PATCH the coverage row via `field.meta`.** `saveField` / `saveFields` update existing rows only — no insert when `meta.sysId` is null. Never save any column other than the typed `field_value_*` for Model Data unless the data model gains it. **Audit-Data** saves (`saveAuditField` / `saveAuditFields`) persist `qa_override_value` + `data_verification` + `commentary` — **AI Value (`field_value`) is read-only in Audit** and is intentionally never sent. This asymmetry is deliberate.
- **CSS is forked from v2 azurui.** Property-locations-specific styles live at the bottom of [css](css) under the "PROPERTY LOCATIONS WIDGET — additions" section. The shared base (loading, toasts, sidebar shell, fields-table, PDF panel) is kept in sync visually with v2 by deliberate inheritance — if v2 changes its base styles, copy the relevant blocks over rather than diverging silently.
- **QA Override column is AUDIT-ONLY.** The Audit table has a 6th column, `qa_override_value`, editable + persisted (mirrors azurui). Model Data has NO QA Override column (only Data Verification + Commentary, both UI-only there). Don't add QA Override to Model Data.
- **Audit edit gating is submission-status-driven (Audit only).** In Audit: Data Verification editable when `submission_status_choice ∈ dataVerificationEditStatuses`; QA Override editable when `∈ qaOverrideEditStatuses` (`['QUALITY_ASSURANCE']`); Commentary editable when EITHER is. Otherwise read-only text. Enforced client-side (`canEditColumn` → `canEditDataVerification`/`canEditQaOverride`/`canEditCommentary`) AND server-side (`_isAuditEditAllowed`, which allows a save when the status permits any audit column). Keep the status lists (server `CONFIG` vs client defaults) consistent — the server lists are authoritative and shipped in `data.config`. Model Data's DV/Commentary are NOT status-gated (always UI-editable).
- **QA Override → Commentary gate (Audit only, ported from azurui).** When `qa_override_value` is set, `commentary` is mandatory. Enforced in three layers: (1) `autoSaveField` calls `validateCommentary` and blocks the save (drops the change, flags `commentaryRequired`, shows an error status) when violated; (2) `c.hasValidationErrors()` (pure getter over `auditGroupedFields`) disables the Complete button via `ng-disabled`; (3) `markAsComplete` calls `findFieldsMissingCommentary()` and aborts with a toast if any offender exists. All three scan Audit fields only.
- **Debug links.** clientscript has a `var DEBUG` flag. When `true`, `selectPropertyLocation` → `_logDebugLinks(locSysId)` console.logs a grouped block of Classic UI links (submission / data_extraction / property_location record links + a line-item list filtered by `model_object_sys_id=<PL>`). The extraction sys_id comes from `data.dataExtractSysId` (exposed by `fetchPropertyLocations`). Flip `DEBUG = false` to silence. Links are relative Classic UI paths (`<table>.do?sys_id=…` / `<table>_list.do?sysparm_query=…`).
