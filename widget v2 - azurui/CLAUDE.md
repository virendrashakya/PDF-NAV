# PDF-NAV Widget v2 (AzureUI) — Context & Conventions

Single source of truth for working on this widget. **Update this file whenever behavior changes.**

The widget is a ServiceNow Service Portal widget for PDF annotation and data extraction in the Insurance Policy Suite. URL parameter: `?submissionSysId=<sys_id>` (required), optional `?version=<dataExtractionSysId>` to deep-link a specific data-extraction version.

---

## Files

| File | Role |
|---|---|
| [serverscript.js](serverscript.js) | Server-side: actions `fetchMapping`, `saveMapping`, `markComplete` |
| [clientscript.js](clientscript.js) | AngularJS controller: PDF.js, auto-save, field navigation, complete flow |
| [html](html) | Template: split-pane layout, fields table, PDF canvas |
| [css](css) | SCSS: Azure UI theme |
| README.txt | Original repo notes |

---

## Backend

### Tables (`CONFIG.tables` in serverscript.js)

| Table | Purpose |
|---|---|
| `x_gegis_uwm_dashbo_data_extraction_lineitem` | Editable line items; `parent` references data_extraction; includes `validation_error` column |
| `x_gegis_uwm_dashbo_data_extraction` | Versioned extractions per submission; columns: `submission`, `version`, `version_display_value`, `active`, `discarded` |
| `x_gegis_uwm_dashbo_data_extraction_metadata` | Field definitions (read-only); has `lob` and `version` columns |
| `x_gegis_uwm_dashbo_submission` | Submission; `line_of_business_choice`, `submission_status_choice`, `data_extract` (legacy pointer) |
| `sys_attachment` | PDF file attachments (filtered by `content_type ∈ application/pdf, application/octet-stream`) |

### Data model

Submission → many `data_extraction`s (each `version` + `active` flag) → many `line_item`s (`parent` → data_extraction sys_id).

### Lineitem column mappings (`CONFIG.lineItemColumns`)

| Column | Display Label | Editable when |
|---|---|---|
| `field_name_final` | Field Name | never |
| `field_value` | AI Value | never |
| `commentary` | Commentary | Data Verification OR QA Override is editable |
| `qa_override_value` | QA Override Value | `submission_status_choice` ∈ `CONFIG.qaOverrideEditStatuses` (default `['QUALITY_ASSURANCE']`) |
| `data_verification` | Data Verification | `submission_status_choice` ∈ `CONFIG.dataVerificationEditStatuses` (default includes `DATA_CAPTURE`, `INSURED_VERIFICATION`, `CHECK_FOR_DUPLICATES`, `DUPLICATE_CHECK`, `CHECK_FOR_SANCTIONS`, `CONFIRM_DATA_REVIEW`) |
| `reason` (shown as `logic_transparency`) | Logic Transparency | never |
| `confidence_indicator` | Confidence (0–1) | never |
| `section_name_final` / `sequence_final` | Section grouping / sort | never |
| `source` | PDF coords | never |
| `documentname_attachment_sysid` | PDF link | never |
| `validation_error` | Server-side validation msg | never (read-back only) |

`validation_error` is NOT loaded by `fetchMapping` — all fields start with `validationError = null` after page load. No stale errors on reload.

### PDF coordinate format

```
D(page, x1, y1, x2, y2, x3, y3, x4, y4)
```

Multiple coords on one field are separated by `;`, e.g. `D(1,100,200,…);D(2,50,100,…)`.

### Server actions (`switch (input.action)`)

| Action | Inputs | Behavior |
|---|---|---|
| `fetchMapping` | `submissionSysId`, optional `dataExtractSysId` | Resolves version via `_resolveDataExtraction`. Runs MODEL2AUDIT only when active. Queries line items by `parent = selectedDataExtractSysId` (limit `CONFIG.limits.maxLineItems = 500`). Returns `mapping`, `versions[]`, `selectedDataExtract: {sys_id, active}`, `submissionStatusChoice`, `config` (editable status arrays). |
| `saveMapping` | `updates: [{sys_id, …}]`, `submissionNumber`, `dataExtractSysId` | Rejects on non-active version (`_isDataExtractionActive`). Updates only the fields present on each update object (`qa_override_value`, `data_verification`, `commentary`). After save, runs VALIDATE and reads back `validation_error` for the saved sys_ids → returns `validationErrors: { sys_id: msg }`. |
| `markComplete` | `submissionNumber`, `dataExtractSysId` | Rejects on non-active version. Calls `ExtractionHelper.dataFlowBetweenDataExtractAndModel(submissionNumber, AUDIT2MODEL)`. |

### Version resolution priority (`_resolveDataExtraction`)

1. Explicit `dataExtractSysId` from input (verified to belong to submission, not discarded)
2. Most recent `active=true` extraction
3. TODO(remove-after-migration): legacy `submission.data_extract` pointer (treated as read-only)
4. Most recent non-discarded extraction (read-only since not active)

### Read-only mode (non-active versions)

- Server: skip MODEL2AUDIT on load; `saveMapping`/`markComplete` reject via `_isDataExtractionActive` guard
- Client: `c.isReadOnlyVersion` short-circuits all `canEdit*` gates and disables Complete

### External ServiceNow dependencies

`ExtractionHelper.dataFlowBetweenDataExtractAndModel(submissionNumber, mode)` where mode ∈ `MODEL2AUDIT | AUDIT2MODEL | VALIDATE`.

### Note on LOB

`_getSubmissionLineOfBusiness` is defined but currently UNUSED. `fetchMapping` does not filter by LOB; `markComplete` does not switch on LOB.

---

## Client state model (clientscript.js controller `c`)

### Field data

- `c.groupedFields = { sectionName: [field, …] }` — sections sorted alphabetically; fields sorted by `sequence_final` then field name (server-side)
- `c.flatten(c.groupedFields)` — flat array across sections; used by validation scans / counts
- `c.collapsedSections = { sectionName: bool }`
- Each field: `sys_id`, `field_name`, `field_value`, `qa_override_value`, `data_verification`, `commentary`, `logic_transparency`, `confidence_indicator`, `source`, `attachmentData`, `allCoordinates[]`, plus runtime flags `commentaryRequired`, `validationError`

### PDF state

`c.pdfLoaded`, `c.scale`, `c.currentPage`, `c.totalPages`, `c.zoomMode` (`'actual-size' | 'fit-width'`), `c.documents[]`, `c.selectedDocument`. PDF.js v2.11.338 loaded from cdnjs.

### Version state

`c.versions[]` (each with `label` from `buildVersionLabel` — `version_display_value` or `v<N>`, with ` (active)` suffix), `c.selectedVersionSysId`, `c.isReadOnlyVersion`. Switch via `c.onVersionChange()` (ng-change on dropdown) which calls `loadSourceMapping(selectedSysId)`.

### Status/edit gates (config-driven)

- `c.dataVerificationEditStatuses` / `c.qaOverrideEditStatuses` — populated from `response.data.config`
- `c.canEditDataVerification()`, `c.canEditQaOverride()`, `c.canEditCommentary()` — all return false when `isReadOnlyVersion`. Commentary is editable iff at least one of the other two is.
- `c.isAnyFieldEditable()` — true when at least one column renders an editable `<input>` (any `canEdit*` is true) rather than a read-only `<span>`. Used to gate validation-based disabling of Complete: validation only blocks Complete when fields are actually editable/fixable.

### Save tracking

- `c.changedFields = { sys_id: true }` set by `markFieldAsChanged` on ng-change
- `c.hasChanges` mirrors the set
- `c.saveStatus ∈ '' | 'saving' | 'saved' | 'error'` with `c.saveStatusMessage` — surfaces in the save-status bar at the bottom of the sidebar

### Complete button (single source of truth)

```js
c.completeBtn = { state, label, icon, css, disabled, showDots, showCheck }
```

Mutated only via `setCompleteState('idle' | 'progress' | 'done' | 'error')`. No race conditions, no multi-span toggling.

States:
- `idle` — "Complete", paper-plane icon
- `progress` — "Sending Data to Model...", animated dots
- `done` — "Completed", animated checkmark
- `error` — "Failed — Retry"

Template disabled rule:
```
ng-disabled="c.isLoading || c.completeBtn.disabled || c.isReadOnlyVersion || c.hasValidationErrors()"
```

### Toasts

`c.toasts[]` with auto-dismiss. Helpers: `c.showSuccess / showError / showInfo / showWarning(msg, duration)`. Replaces `spUtil` for inline notifications.

---

## Validation behavior

### `field.validationError` (server-side, post-save)

- `autoSaveField` saves one field at a time. Server runs VALIDATE and returns `validationErrors = { [sys_id]: errorMessage }` only for fields in the saved batch.
- Client calls `applyValidationErrors(response.data.validationErrors, [field.sys_id])` to update **only that field**. **NEVER loop all fields and clear errors for fields not in the map** — that was a past bug where saving field A wiped field B's error.
- `fetchMapping` does NOT load `validation_error` from the DB; all fields start `validationError = null` on reload.

### QA Override → Commentary rule (client-side)

If `qa_override_value` is non-empty, `commentary` must be non-empty.

Three layers enforce this:

1. **Per-field on blur** — `autoSaveField` checks the rule at the top, sets `field.commentaryRequired = true`, shows the save-status error, and **returns without saving**. The QA Override change is dropped.
2. **Complete button disable** — `c.hasValidationErrors()` is a pure (non-mutating, digest-cycle-safe) getter wired into `ng-disabled`. **Only blocks while fields are in editable mode** — it short-circuits to `false` when `c.isAnyFieldEditable()` is false (table is rendering read-only spans, not inputs), since a stale validation flag isn't fixable there and must not keep Complete disabled. When editable, returns true if any field has `validationError` OR any field has populated `qa_override_value` with empty `commentary`. Tooltip: "Fix validation errors before completing". The offending input(s) get a red `.validation-error` border so the disabled state is visually explained.
3. **Click-time gate in `markAsComplete`** — `c.findFieldsMissingCommentary()` scans all fields, sets `commentaryRequired = true` on offenders, aborts with a toast listing the first 3 offending field names, and `navigateToField` jumps to the first one. Defense-in-depth in case the button gets clicked anyway. **Skipped entirely when `c.isAnyFieldEditable()` is false** (inputs hidden / read-only spans) — no validation runs on Complete when the user can't edit.

Both scans cover ALL fields (not just ones touched this session), so pre-existing dirty data is surfaced.

---

## UX flows

### Auto-save (no Save button)

1. User edits Data Verification / QA Override / Commentary → `ng-change="c.markFieldAsChanged(field)"` sets `changedFields[sys_id] = true`
2. On blur → `ng-blur="c.validateCommentary(field); c.autoSaveField(field)"`
3. `autoSaveField` runs the QA Override → Commentary check; if violated, returns without saving
4. If valid and `changedFields[sys_id]` is true, POSTs `saveMapping` with only the editable subset. On success: clears `changedFields[sys_id]`, sets `saveStatus = 'saved'`, calls `applyValidationErrors(response.data.validationErrors, [field.sys_id])`

### Complete action (`c.markAsComplete`)

1. Short-circuit if state is `progress`/`done` or version is read-only
2. Call `findFieldsMissingCommentary()` — if any, mark them, show toast, navigate to first, abort
3. `setCompleteState('progress')` → POST `markComplete` → on success `setCompleteState('done')` and reset to idle after 2s; on error `setCompleteState('error')` and reset after 4s

### Field navigation (`c.navigateToField`)

- Cross-document aware: if `field.attachmentData.file_name !== c.selectedDocument.name`, switches the dropdown and `loadPdfFromUrl(targetDoc.url, onLoaded)`. The `onLoaded` callback renders the target page and highlights coordinates.
- Same-document: jumps to `firstCoord.page`, renders, highlights matching coords.

### beforeunload guard

If `c.completeBtn.state === 'progress'`, warns before reload/close — AUDIT2MODEL is in flight and reloading restarts MODEL2AUDIT.

---

## HTML template structure ([html](html))

- **Loading overlay** (`ng-show="c.isLoading"`) covers the whole widget during fetch/save
- **Toast container** top-right
- **Two-column main layout** (collapsible sidebar + PDF panel):
  - **Sidebar header:** collapse toggle, `Audit - #<submissionNumber>`, version dropdown, read-only badge, Complete button
  - **Document selector row:** document dropdown, expandable inline search, filter toggle (`filterDocumentOnly` shows only fields with current document + source coords)
  - **Fields content:** `ng-repeat` over `c.groupedFields` → collapsible section headers (with accuracy % from `calculateSectionAccuracy`) → 6-column `<table class="fields-table">`. `ng-repeat-start` / `ng-repeat-end` emits a validation-error sub-row beneath each field when `field.validationError` is truthy.
  - **Save status bar** at bottom of sidebar, driven by `c.saveStatus`
- **PDF panel:** header (filename, fit-width / actual-size, prev / next page), `#pdfContainer` with overlaid `#pdfCanvas` + `#annotationCanvas` (for highlight quads), footer with scale + active field name + coord index

Inline `<style>` block defines validation visuals:
- `.has-validation-error` — red left-border + tint on the row
- `.validation-error-row` + `.field-validation-error` — full-width red sub-row beneath the field row with icon + message
- `.validation-error` (in [css](css)) — red border + tint + shake on the editable input itself. Applied to `verification-input` / `override-input` / `commentary-input` via `ng-class` when `field.validationError` is set (and commentary also when `field.commentaryRequired`), so the Complete disabled state points at the exact input to fix.

---

## Conventions

- **Always work in `widget v2 - azurui/`** — there are other widget folders in the repo; this is the active one.
- **No Save button.** Fields autosave on blur.
- **Use `CONFIG`** for table/column names server-side — never hardcode strings.
- **Use `canEditDataVerification` / `canEditQaOverride` / `canEditCommentary`** client-side — they already account for `isReadOnlyVersion`.
- **`setCompleteState(...)`** is the only way to mutate `c.completeBtn`. Don't reach into properties directly.
- **`applyValidationErrors(map, savedSysIds)`** — always pass the array of just-saved sys_ids. Never loop all fields unconditionally.
- **New validation rules** should follow the QA Override → Commentary pattern: block the per-field save in `autoSaveField`, extend `c.hasValidationErrors()` to make Complete disable for it, and add a click-time scan that aborts `markAsComplete` with a toast + navigate to the first offender.

---

## Recent changes

- **2026-06-04** — Complete disable scoped to editable mode + per-input red border: `c.hasValidationErrors()` now short-circuits to `false` when `c.isAnyFieldEditable()` is false (read-only spans rendered), so validation only blocks Complete when fields are actually fixable. The click-time gate in `markAsComplete` (`findFieldsMissingCommentary`) is likewise skipped when no field is editable — **no validation runs on Complete when inputs are hidden**. When a line item has a `validationError` (or commentary-required), the offending editable input gets a red `.validation-error` border (generalized from commentary-only to all three inputs) to explain the disabled state.
- **2026-05-15** — QA Override → Commentary gate at Complete: added `c.findFieldsMissingCommentary()` (click-time scan, sets `commentaryRequired`) and `c.hasValidationErrors()` (pure getter for `ng-disabled`). Fixes bug where users could change QA Override without commentary, click Complete, and the AUDIT2MODEL ran successfully against stale data (QA Override never saved) while the UI reported success.
- **2026-04-30** — Validation error scope fix: `applyValidationErrors(map, savedSysIds)` only updates fields whose sys_ids are in `savedSysIds`. Previously saving field A would silently clear field B's validation error.
- **Earlier** — Versioning + read-only mode added: `_resolveDataExtraction`, `_isDataExtractionActive` guard, `c.isReadOnlyVersion` short-circuit. Version dropdown in sidebar header.
- **Earlier** — Complete button consolidated to single `c.completeBtn` object + `setCompleteState`. Removed confirmation modal.
