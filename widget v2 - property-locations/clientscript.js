api.controller = function ($scope, $location, $filter, $window, spUtil, $timeout, $q) {
  /* ============================================
   * Property Locations Widget Client Script
   * ============================================
   * Sections:
   *  - Property locations summary table (top, real data, one row per PL)
   *  - Collapsible field sections (dummy data for the selected PL)
   *  - PDF viewer (right panel) for the selected PL's property_document
   * ============================================ */

  var c = this;

  /* ============================================
   * STATE
   * ============================================ */

  // Loading
  c.isLoading = false;
  c.isPdfLoading = false;
  c.loadingMessage = 'Loading...';

  // Sidebar
  c.sidebarCollapsed = false;
  c.toggleSidebar = function () { c.sidebarCollapsed = !c.sidebarCollapsed; };

  // Submission
  c.submission = null;

  // Property locations
  c.propertyLocations = [];
  c.selectedPropertyLocationSysId = null;

  // Field sections — keyed by property_location.sys_id. Each value is an ordered ARRAY of
  // sections [{ key, label, fields: [...] }] (order preserved; ng-repeat over an object would sort).
  c.fieldSectionsByLocation = {};
  c.groupedFields = [];
  c.collapsedSections = {};

  // Audit Data sections — same shape as fieldSectionsByLocation, but sourced from
  // data_extraction_lineitem (scoped per PL by model_object_sys_id). Rendered as a second,
  // independently-collapsible top-level area below Model Data.
  c.auditSectionsByLocation = {};
  c.auditGroupedFields = [];
  c.auditCollapsedSections = {};

  // Top-level area collapse state (independent of the inner section collapse).
  // Model Data starts collapsed by default; Audit Data starts expanded.
  c.modelDataCollapsed = true;
  c.auditDataCollapsed = false;
  c.toggleModelData = function () { c.modelDataCollapsed = !c.modelDataCollapsed; };
  c.toggleAuditData = function () { c.auditDataCollapsed = !c.auditDataCollapsed; };

  // Audit fields carry meta.table = the line item table. Save routing keys off this:
  // audit → saveAuditField(s) (persists field_value + data_verification + commentary),
  // model → saveField(s) (persists field_value only). Keep in sync with serverscript CONFIG.tables.lineItem.
  var AUDIT_TABLE = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
  c.isAuditField = function (field) {
    return !!(field && field.meta && field.meta.table === AUDIT_TABLE);
  };

  /* ============================================
   * Classic UI links (flip DEBUG to enable/disable)
   * ============================================
   * When DEBUG is true, selecting a property location logs a grouped block of Classic UI
   * links (submission, data_extraction, property_location) plus a filtered line-item list
   * link (model_object_sys_id = the selected PL). Set DEBUG = false to silence.
   */
  var DEBUG = true;
  c.dataExtractSysId = ''; // resolved server-side, populated from the fetch payload

  function _classicRecordLink(table, sysId) {
    return sysId ? (table + '.do?sys_id=' + sysId) : '(none)';
  }
  function _classicListLink(table, query) {
    return table + '_list.do?sysparm_query=' + query;
  }
  function _logDebugLinks(locationSysId) {
    if (!DEBUG || !console || !console.log) return;
    var grp = (console.group ? console.group : console.log).bind(console);
    var grpEnd = (console.groupEnd || function () {}).bind(console);
    grp('Classic UI links');
    console.log('Submission       :', _classicRecordLink('x_gegis_uwm_dashbo_submission', c.submissionSysId));
    console.log('Data Extraction  :', _classicRecordLink('x_gegis_uwm_dashbo_data_extraction', c.dataExtractSysId));
    console.log('Property Location:', _classicRecordLink('x_gegis_uwm_dashbo_property_location', locationSysId));
    console.log('Line Items (PL)  :', _classicListLink('x_gegis_uwm_dashbo_data_extraction_lineitem', 'model_object_sys_id=' + locationSysId));
    grpEnd();
  }

  // Search
  c.fieldSearch = '';
  c.searchExpanded = false;

  // PDF
  c.pdfLoaded = false;
  c.scale = 1.0;
  c.currentPage = 1;
  c.totalPages = 0;
  c.zoomMode = 'actual-size';
  c.containerWidth = 0;
  c.activeField = null;
  c.activeFieldCoordIndex = 0;

  // Save tracking
  c.changedFields = {};
  c.hasChanges = false;
  c.saveStatus = '';
  c.saveStatusMessage = '';
  c.lastSavedTime = null;

  // Complete button — single source of truth (mirrors widget v2 - azurui).
  // Mutate ONLY via setCompleteState('idle'|'progress'|'done'|'error').
  c.completeBtn = {
    state: 'idle',
    label: 'Complete',
    icon: 'fa-paper-plane',
    css: 'btn-complete-idle',
    disabled: false,
    showDots: false,
    showCheck: false
  };
  function setCompleteState(state) {
    switch (state) {
      case 'progress':
        c.completeBtn = { state: 'progress', label: 'Sending Data to Model...', icon: '',
          css: 'btn-complete-progress', disabled: true, showDots: true, showCheck: false };
        break;
      case 'done':
        c.completeBtn = { state: 'done', label: 'Completed', icon: '',
          css: 'btn-complete-done', disabled: true, showDots: false, showCheck: true };
        break;
      case 'error':
        c.completeBtn = { state: 'error', label: 'Failed — Retry', icon: 'fa-exclamation-triangle',
          css: 'btn-complete-error', disabled: false, showDots: false, showCheck: false };
        break;
      default: // idle
        c.completeBtn = { state: 'idle', label: 'Complete', icon: 'fa-paper-plane',
          css: 'btn-complete-idle', disabled: false, showDots: false, showCheck: false };
        break;
    }
  }

  // Toasts
  c.toasts = [];
  var toastIdCounter = 0;

  /* ============================================
   * TOASTS
   * ============================================ */

  c.showToast = function (message, type, duration) {
    var id = ++toastIdCounter;
    c.toasts.push({ id: id, message: message, type: type || 'info' });
    var t = duration !== undefined ? duration : 5000;
    if (t > 0) {
      $timeout(function () { c.dismissToast(id); }, t);
    }
    return id;
  };
  c.dismissToast = function (id) {
    var i = c.toasts.findIndex(function (t) { return t.id === id; });
    if (i !== -1) c.toasts.splice(i, 1);
  };
  c.showSuccess = function (m, d) { return c.showToast(m, 'success', d); };
  c.showError = function (m, d) { return c.showToast(m, 'error', d || 8000); };
  c.showInfo = function (m, d) { return c.showToast(m, 'info', d); };
  c.showWarning = function (m, d) { return c.showToast(m, 'warning', d || 6000); };

  /* ============================================
   * UTILITIES
   * ============================================ */

  c.getObjectKeys = function (obj) { return obj ? Object.keys(obj) : []; };

  c.truncateText = function (text, maxLength) {
    if (!text) return '';
    maxLength = maxLength || 30;
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  c.formatTime = function (date) {
    if (!date) return '';
    var h = date.getHours();
    var m = date.getMinutes();
    var s = date.getSeconds();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    m = m < 10 ? '0' + m : m;
    s = s < 10 ? '0' + s : s;
    return h + ':' + m + ':' + s + ' ' + ampm;
  };

  // Flatten all fields across sections into one array.
  // c.groupedFields is now an ORDERED ARRAY of sections [{ key, label, fields: [...] }]
  // (was a { sectionName: [...] } object). Also tolerates the old object shape defensively.
  c.flatten = function (sections) {
    var out = [];
    if (Array.isArray(sections)) {
      sections.forEach(function (s) {
        if (s && Array.isArray(s.fields)) out = out.concat(s.fields);
      });
    } else if (sections && typeof sections === 'object') {
      for (var k in sections) {
        if (sections.hasOwnProperty(k) && Array.isArray(sections[k])) out = out.concat(sections[k]);
      }
    }
    return out;
  };

  c.hasConfidenceValue = function (v) { return v !== '' && v !== null && v !== undefined; };

  c.getConfidencePillClass = function (v) {
    if (!c.hasConfidenceValue(v)) return 'none';
    var n = parseFloat(v) || 0;
    if (n >= 0.75) return 'high';
    if (n >= 0.5) return 'medium';
    return 'low';
  };

  c.calculateSectionAccuracy = function (fields) {
    if (!fields || !fields.length) return 0;
    var total = 0, count = 0;
    fields.forEach(function (f) {
      if (c.hasConfidenceValue(f.confidence_indicator)) {
        total += parseFloat(f.confidence_indicator) || 0;
        count++;
      }
    });
    return count ? (total / count) * 100 : 0;
  };

  c.sectionHasConfidence = function (fields) {
    if (!fields || !fields.length) return false;
    return fields.some(function (f) { return c.hasConfidenceValue(f.confidence_indicator); });
  };

  c.getSectionAccuracyClass = function (fields) {
    var a = c.calculateSectionAccuracy(fields);
    if (a >= 75) return 'high';
    if (a >= 50) return 'medium';
    return 'low';
  };

  /* ============================================
   * SEARCH / FILTERS
   * ============================================ */

  c.expandSearch = function () {
    c.searchExpanded = true;
    $timeout(function () {
      var el = document.getElementById('fieldSearchInput');
      if (el) el.focus();
    }, 0);
  };
  c.collapseSearch = function () {
    c.fieldSearch = '';
    c.searchExpanded = false;
  };

  c.searchFilter = function (field) {
    if (!c.fieldSearch) return true;
    var s = c.fieldSearch.toLowerCase();
    return (
      (field.field_name && field.field_name.toLowerCase().indexOf(s) > -1) ||
      (field.field_value && field.field_value.toLowerCase().indexOf(s) > -1) ||
      (field.data_verification && field.data_verification.toLowerCase().indexOf(s) > -1) ||
      (field.logic_transparency && field.logic_transparency.toLowerCase().indexOf(s) > -1) ||
      (field.commentary && field.commentary.toLowerCase().indexOf(s) > -1)
    );
  };

  // No field-level visibility filter (the "Show only exceptions" toggle was removed).
  // Kept as an always-true hook so the template ng-if binding stays valid and a future
  // filter can be reintroduced here without touching the template.
  c.shouldShowField = function (field) { return true; };

  // Counts span both areas (Model Data + Audit Data).
  c.allFields = function () {
    return c.flatten(c.groupedFields).concat(c.flatten(c.auditGroupedFields));
  };
  c.getVisibleFieldCount = function () {
    return c.allFields().filter(function (f) { return c.shouldShowField(f) && c.searchFilter(f); }).length;
  };
  c.getTotalCount = function () { return c.allFields().length; };

  /* ============================================
   * SAVE (autosave on blur — dummy backend for now)
   * ============================================ */

  // Submission-status edit gate (Audit Data only — mirrors widget v2 - azurui).
  // Server sends the current status + the editable-status lists. DV editable when status ∈ DV list;
  // QA Override editable when status ∈ QA list; Commentary editable when EITHER is. Model Data
  // is unaffected (its DV/Commentary are always UI-editable; it has no QA Override column).
  c.submissionStatusChoice = '';
  c.dataVerificationEditStatuses = ['CONFIRM_DATA_REVIEW']; // default, overridden by server config
  c.qaOverrideEditStatuses = ['QUALITY_ASSURANCE'];          // default, overridden by server config
  c.canEditDataVerification = function () {
    return c.dataVerificationEditStatuses.indexOf(c.submissionStatusChoice) !== -1;
  };
  c.canEditQaOverride = function () {
    return c.qaOverrideEditStatuses.indexOf(c.submissionStatusChoice) !== -1;
  };
  c.canEditCommentary = function () { return c.canEditDataVerification() || c.canEditQaOverride(); };

  // The AI Value cell is editable only when a coverage value row exists for this field at
  // this location (field.meta.sysId). Without a row there is nothing to PATCH — the server
  // saveField no-ops — so we render a read-only span instead. Mirrors serverscript saveField.
  c.canEditValue = function (field) {
    return !!(field && field.meta && field.meta.sysId && field.meta.valueField);
  };

  /* ---- Inline click-to-edit (all editable columns) ----
   * Each editable cell (AI Value, Data Verification, Commentary) shows text by default with a
   * hover edit affordance. Clicking swaps the display for an editor (input, or Yes/No <select>
   * for a boolean value). Blur/Enter closes the editor. Only one cell edits at a time, keyed by
   * `<field.sys_id>:<column>` so the same field's three cells are independent.
   *
   * Save behavior differs by column:
   *   - 'value'        → autosaves to the coverage row (field_value has a backing column)
   *   - 'verification' → UI-only; no backing column yet, so blur just closes + marks changed
   *   - 'commentary'   → UI-only; same as verification */

  c.editingCellKey = null;

  function cellKey(field, column) {
    return field ? field.sys_id + ':' + column : null;
  }

  c.isEditing = function (field, column) {
    return !!field && c.editingCellKey === cellKey(field, column);
  };

  c.isBooleanField = function (field) {
    return field && (field.data_type || '').toUpperCase() === 'BOOLEAN';
  };

  // Normalize a stored boolean value to the canonical 'true'/'false' the <select> binds to.
  c.normalizeBoolean = function (v) {
    var s = ('' + (v == null ? '' : v)).toLowerCase().trim();
    if (s === 'true' || s === '1' || s === 'yes') return 'true';
    if (s === 'false' || s === '0' || s === 'no') return 'false';
    return ''; // unset / unknown
  };

  c.isCurrencyField = function (field) {
    return field && (field.data_type || '').toUpperCase() === 'CURRENCY';
  };

  // Format a currency value for DISPLAY only: prepend '$' and add thousands separators.
  // The editor still binds the raw number, so this never touches what's stored/saved.
  c.formatCurrency = function (v) {
    var raw = ('' + v).replace(/[$,\s]/g, '');
    if (raw === '' || isNaN(raw)) return '' + v; // not numeric — show as-is
    var n = parseFloat(raw);
    var parts = n.toFixed(n % 1 === 0 ? 0 : 2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + parts.join('.');
  };

  // Text shown when a cell is NOT being edited.
  // The AI Value column ('value') formats booleans as Yes/No and currency with a $ sign;
  // other columns show raw text.
  c.displayText = function (field, column) {
    if (!field) return '';
    var v = field[c.columnModel(column)];
    if (v === '' || v === null || v === undefined) return '';
    if (column === 'value') {
      if (c.isBooleanField(field)) {
        var b = c.normalizeBoolean(v);
        return b === 'true' ? 'Yes' : (b === 'false' ? 'No' : '');
      }
      if (c.isCurrencyField(field)) return c.formatCurrency(v);
    }
    return '' + v;
  };

  // The field-object property backing each column.
  c.columnModel = function (column) {
    if (column === 'value') return 'field_value';
    if (column === 'qaOverride') return 'qa_override_value';
    if (column === 'verification') return 'data_verification';
    if (column === 'commentary') return 'commentary';
    return column;
  };

  // Whether a given column is editable for this field.
  //  - 'value': Model Data needs a coverage row; Audit Data AI Value is READ-ONLY (never editable).
  //  - 'qaOverride' / 'verification' / 'commentary': Audit Data is gated by submission status
  //    (canEdit*); Model Data keeps verification/commentary always-UI-editable (Model has no
  //    QA Override column, so 'qaOverride' only ever applies to Audit fields).
  c.canEditColumn = function (field, column) {
    if (!field) return false;
    if (column === 'value') {
      return c.isAuditField(field) ? false : c.canEditValue(field);
    }
    if (c.isAuditField(field)) {
      if (column === 'qaOverride') return c.canEditQaOverride();
      if (column === 'commentary') return c.canEditCommentary();
      return c.canEditDataVerification(); // 'verification'
    }
    return true; // Model Data — verification/commentary UI-only, always editable
  };

  c.startEditing = function (field, column, $event) {
    if ($event) $event.stopPropagation();
    if (!c.canEditColumn(field, column)) return;
    // Normalize boolean value into the select's bound form on open.
    if (column === 'value' && c.isBooleanField(field)) {
      field.field_value = c.normalizeBoolean(field.field_value);
    }
    c.editingCellKey = cellKey(field, column);
    $timeout(function () {
      var el = document.getElementById('cellEditor-' + field.sys_id + '-' + column);
      if (el) { el.focus(); if (el.select) el.select(); }
    }, 0);
  };

  // Programmatically open a cell for editing and bring it fully into view. Unlike startEditing
  // (a click handler), this first un-collapses the Audit area + the field's section so the cell
  // isn't hidden, then opens/focuses/scrolls it. Used to surface a required Commentary cell that
  // the user hasn't clicked into (QA Override → Commentary gate). Audit fields only.
  c.openCellForEdit = function (field, column) {
    if (!field || !c.canEditColumn(field, column)) return;
    // Reveal: expand the Audit area and the section containing this field.
    c.auditDataCollapsed = false;
    for (var i = 0; i < c.auditGroupedFields.length; i++) {
      var section = c.auditGroupedFields[i];
      if (section && section.fields && section.fields.indexOf(field) !== -1) {
        c.auditCollapsedSections[section.key] = false;
        break;
      }
    }
    c.editingCellKey = cellKey(field, column);
    $timeout(function () {
      var el = document.getElementById('cellEditor-' + field.sys_id + '-' + column);
      if (el) {
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
        if (el.select) el.select();
      }
    }, 0);
  };

  // Blur/Enter closes the editor.
  // Model Data: only 'value' autosaves (coverage row); verification/commentary are UI-only.
  // Audit Data: AI Value is READ-ONLY (never edited); QA Override + Data Verification + Commentary autosave.
  c.stopEditing = function (field, column) {
    // Close the current editor FIRST, then autosave. autoSaveField may re-open a different cell
    // (the QA Override → Commentary hand-off via openCellForEdit); nulling after that would wipe it.
    c.editingCellKey = null;
    if (field) {
      c.markFieldAsChanged(field);
      if (c.isAuditField(field)) {
        if (column === 'qaOverride' || column === 'verification' || column === 'commentary') {
          c.autoSaveField(field);
        }
      } else if (column === 'value') {
        c.autoSaveField(field);
      }
    }
  };

  /* Back-compat shims for the AI Value column (kept so existing template bindings work). */
  c.isEditingValue = function (field) { return c.isEditing(field, 'value'); };
  c.displayValue = function (field) { return c.displayText(field, 'value'); };
  c.startEditingValue = function (field, $event) { return c.startEditing(field, 'value', $event); };
  c.stopEditingValue = function (field) { return c.stopEditing(field, 'value'); };

  c.markFieldAsChanged = function (field) {
    if (!field || !field.sys_id) return;
    c.changedFields[field.sys_id] = true;
    c.hasChanges = true;
  };

  // Build the save payload for one field. `meta` carries the PATCH target the server needs.
  // Model Data: only field_value is persisted (values model).
  // Audit Data: AI Value is read-only — persist qa_override_value + data_verification + commentary
  //             (field_value is intentionally omitted so the server never touches it).
  function buildFieldUpdate(field) {
    if (c.isAuditField(field)) {
      return {
        sys_id: field.sys_id,
        qa_override_value: field.qa_override_value || '',
        data_verification: field.data_verification || '',
        commentary: field.commentary || '',
        meta: field.meta || null
      };
    }
    return {
      sys_id: field.sys_id,
      field_value: field.field_value || '',
      meta: field.meta || null
    };
  }

  /**
   * QA Override → Commentary rule (Audit only, mirrors widget v2 - azurui):
   * if qa_override_value is set, commentary is mandatory. Sets field.commentaryRequired for the
   * red highlight and returns false when the rule is violated.
   */
  c.validateCommentary = function (field) {
    if (!field) return true;
    var hasQa = field.qa_override_value && ('' + field.qa_override_value).trim() !== '';
    var hasComment = field.commentary && ('' + field.commentary).trim() !== '';
    if (hasQa && !hasComment) {
      field.commentaryRequired = true;
      return false;
    }
    field.commentaryRequired = false;
    return true;
  };

  c.autoSaveField = function (field) {
    if (!field || !field.sys_id) return;
    if (!c.changedFields[field.sys_id]) return;

    var isAudit = c.isAuditField(field);

    // Audit QA Override → Commentary gate: block the save (and drop the change) when QA Override
    // has a value but Commentary is empty. Mirrors widget v2 - azurui. Surface the required
    // Commentary cell (open + focus it) so the user isn't left staring at a red click-to-edit cell.
    if (isAudit && !c.validateCommentary(field)) {
      c.saveStatus = 'error';
      c.saveStatusMessage = 'Commentary is required when filling QA Override Value';
      $timeout(function () { if (c.saveStatus === 'error') c.saveStatus = ''; }, 4000);
      c.openCellForEdit(field, 'commentary');
      return;
    }

    // Model Data only: no coverage row ⇒ nothing to save. Clear the dirty flag so it doesn't linger.
    // Audit fields always have a line item row (meta.sysId), so they are always savable.
    if (!isAudit && !c.canEditValue(field)) {
      delete c.changedFields[field.sys_id];
      c.hasChanges = Object.keys(c.changedFields).length > 0;
      return;
    }

    c.saveStatus = 'saving';
    c.saveStatusMessage = 'Saving...';

    c.server.get({
      action: isAudit ? 'saveAuditField' : 'saveField',
      update: buildFieldUpdate(field),
      propertyLocationSysId: c.selectedPropertyLocationSysId,
      submissionSysId: submissionSysId // server-side audit edit gate keys off submission status
    }).then(function (response) {
      if (response.data.success) {
        delete c.changedFields[field.sys_id];
        c.hasChanges = Object.keys(c.changedFields).length > 0;
        c.saveStatus = 'saved';
        c.lastSavedTime = new Date();
        c.saveStatusMessage = 'Saved at ' + c.formatTime(c.lastSavedTime);
        $timeout(function () { if (c.saveStatus === 'saved') c.saveStatus = ''; }, 3000);
      } else {
        c.saveStatus = 'error';
        c.saveStatusMessage = 'Save failed: ' + (response.data.error || 'Unknown error');
      }
    }).catch(function () {
      c.saveStatus = 'error';
      c.saveStatusMessage = 'Save failed';
    });
  };

  /* ============================================
   * COMPLETE — Audit → Model sync for the URL's location
   * ============================================
   * Fields autosave on blur (no Save button). Complete runs AUDIT2MODEL for the
   * locationSysId from the URL and surfaces async progress via c.completeBtn.
   * ============================================ */

  // Pure getter (no mutation — safe for ng-disabled) — true when any Audit field has QA Override
  // populated with empty Commentary. Wired into the Complete button so it can't finalize invalid data.
  c.hasValidationErrors = function () {
    var audit = c.flatten(c.auditGroupedFields);
    for (var i = 0; i < audit.length; i++) {
      var f = audit[i];
      var hasQa = f.qa_override_value && ('' + f.qa_override_value).trim() !== '';
      var hasComment = f.commentary && ('' + f.commentary).trim() !== '';
      if (hasQa && !hasComment) return true;
    }
    return false;
  };

  // Click-time scan: flags Audit fields with QA Override but no Commentary (sets commentaryRequired
  // for the red highlight). Returns the offenders so markAsComplete can abort + point the user at them.
  c.findFieldsMissingCommentary = function () {
    var invalid = [];
    c.flatten(c.auditGroupedFields).forEach(function (field) {
      var hasQa = field.qa_override_value && ('' + field.qa_override_value).trim() !== '';
      var hasComment = field.commentary && ('' + field.commentary).trim() !== '';
      if (hasQa && !hasComment) {
        field.commentaryRequired = true;
        invalid.push(field);
      }
    });
    return invalid;
  };

  c.markAsComplete = function () {
    if (c.completeBtn.state === 'progress' || c.completeBtn.state === 'done') return;
    if (!locationSysId) {
      c.showError('No location sys_id in the URL — cannot complete.');
      return;
    }

    // QA Override → Commentary gate (defense-in-depth alongside ng-disabled): abort if any
    // Audit field has QA Override without Commentary, and point the user at the first offender.
    var missing = c.findFieldsMissingCommentary();
    if (missing.length > 0) {
      var preview = missing.slice(0, 3).map(function (f) { return f.field_name || '(unnamed)'; }).join(', ');
      var more = missing.length > 3 ? ', +' + (missing.length - 3) + ' more' : '';
      c.showError('Commentary is required when filling QA Override Value. Missing on: ' + preview + more);
      // Open + focus + scroll the first offender's Commentary cell so the user can fix it directly.
      c.openCellForEdit(missing[0], 'commentary');
      return;
    }

    setCompleteState('progress');

    c.server.get({
      action: 'completeAuditToModel',
      locationSysId: locationSysId
    }).then(function (response) {
      var d = response.data || {};
      if (d.success) {
        setCompleteState('done');
        c.showSuccess(d.message || 'Audit to Model completed successfully');
        $timeout(function () {
          if (c.completeBtn.state === 'done') setCompleteState('idle');
        }, 2000);
      } else {
        setCompleteState('error');
        c.showError('Failed to complete: ' + (d.error || 'Unknown error'));
        $timeout(function () {
          if (c.completeBtn.state === 'error') setCompleteState('idle');
        }, 4000);
      }
    }).catch(function () {
      setCompleteState('error');
      c.showError('Failed to complete');
      $timeout(function () {
        if (c.completeBtn.state === 'error') setCompleteState('idle');
      }, 4000);
    });
  };

  /* ============================================
   * PROPERTY LOCATION SELECTION
   * ============================================ */

  c.isLocationSelected = function (loc) {
    return loc && loc.sys_id === c.selectedPropertyLocationSysId;
  };

  c.selectPropertyLocation = function (loc) {
    if (!loc || !loc.sys_id) return;
    c.selectedPropertyLocationSysId = loc.sys_id;
    c.activeField = null;
    c.activeFieldCoordIndex = 0;

    // Model Data sections for this location — an ordered array [{ key, label, fields }].
    var sections = c.fieldSectionsByLocation[loc.sys_id] || [];
    c.groupedFields = sections;
    c.collapsedSections = {};
    sections.forEach(function (s) { c.collapsedSections[s.key] = false; });

    // Audit Data sections — separate collapse map (section keys can collide with Model Data's,
    // e.g. both may have a "PROPERTY" section; a shared map would collapse them in lockstep).
    var auditSections = c.auditSectionsByLocation[loc.sys_id] || [];
    c.auditGroupedFields = auditSections;
    c.auditCollapsedSections = {};
    auditSections.forEach(function (s) { c.auditCollapsedSections[s.key] = false; });

    // Log Classic UI links for this PL's records (no-op when DEBUG is false).
    _logDebugLinks(loc.sys_id);

    // Load the PDF for this location, if any
    if (loc.attachmentData && loc.attachmentData.file_url) {
      loadPdfFromUrl(loc.attachmentData.file_url);
    } else {
      c.pdfLoaded = false;
      clearAnnotations();
    }
  };

  c.selectedLocation = function () {
    if (!c.selectedPropertyLocationSysId) return null;
    for (var i = 0; i < c.propertyLocations.length; i++) {
      if (c.propertyLocations[i].sys_id === c.selectedPropertyLocationSysId) {
        return c.propertyLocations[i];
      }
    }
    return null;
  };

  c.currentDocumentLabel = function () {
    var loc = c.selectedLocation();
    if (loc && loc.attachmentData && loc.attachmentData.file_name) return loc.attachmentData.file_name;
    return '';
  };

  /* ============================================
   * PDF.js — adapted from widget v2 - azurui
   * ============================================ */

  $('head title').text("Genpact Insurance Policy Suite");

  var pdfDoc = null;
  var canvas = null;
  var ctx = null;
  var annotationCanvas = null;
  var annotationCtx = null;
  var pageRendering = false;
  var pageNumPending = null;
  var renderTask = null;
  var currentPageInstance = null;

  // Resolve URL identifiers, in priority order:
  //   submissionSysId — ?submissionSysId=<sys_id>, then ?sys_id=<sys_id>, then $scope.data
  //   locationSysId   — ?locationSysId=<sys_id>, then $scope.data
  // When locationSysId is provided, the server loads exactly that one property_location
  // (single-row summary table). Otherwise it lists all PLs for the submission.
  var search = $location.search();
  var submissionSysId =
    search.submissionSysId ||
    search.sys_id ||
    ($scope.data && $scope.data.submissionSysId) ||
    '';
  var locationSysId =
    search.locationSysId ||
    ($scope.data && $scope.data.locationSysId) ||
    '';
  c.submissionSysId = submissionSysId;
  c.locationSysId = locationSysId;

  function debounce(func, wait) {
    var t;
    return function () {
      var ctxThis = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { func.apply(ctxThis, args); }, wait);
    };
  }

  function loadPdfJs() {
    c.isLoading = true;
    c.loadingMessage = 'Loading PDF library...';
    if (!$window.pdfjsLib) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
      script.onload = function () {
        $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        initializeWidget();
      };
      script.onerror = function () {
        c.isLoading = false;
        c.showError('Failed to load PDF library');
      };
      document.head.appendChild(script);
    } else {
      initializeWidget();
    }
  }

  function initializeWidget() {
    c.loadingMessage = 'Initializing...';
    $timeout(function () {
      canvas = document.getElementById('pdfCanvas');
      annotationCanvas = document.getElementById('annotationCanvas');
      if (canvas && annotationCanvas) {
        ctx = canvas.getContext('2d');
        annotationCtx = annotationCanvas.getContext('2d');
      }
    }, 100);
    loadData();
  }

  function loadData() {
    if (!submissionSysId) {
      c.isLoading = false;
      c.showError('Missing submission sys_id. Open this widget with ?submissionSysId=<sys_id> in the URL.');
      return;
    }
    c.isLoading = true;

    // On load, sync Model → Audit for the URL's location first (so the audit line items we then
    // fetch reflect current model data), then fetch. Sync failure is non-blocking — we still load,
    // but warn that audit data may be stale.
    if (locationSysId) {
      c.loadingMessage = 'Syncing audit data...';
      c.server.get({
        action: 'syncModelToAudit',
        locationSysId: locationSysId
      }).then(function (response) {
        var d = response.data || {};
        if (!d.success) c.showWarning('Audit sync incomplete: ' + (d.error || 'unknown') + '. Audit data may be stale.');
        fetchData();
      }).catch(function () {
        c.showWarning('Audit sync failed. Audit data may be stale.');
        fetchData();
      });
    } else {
      fetchData();
    }
  }

  function fetchData() {
    c.isLoading = true;
    c.loadingMessage = 'Loading property locations...';

    c.server.get({
      action: 'fetchPropertyLocations',
      submissionSysId: submissionSysId,
      locationSysId: locationSysId
    }).then(function (response) {
      var d = response.data || {};
      if (d.error) {
        c.showError(d.error);
        c.isLoading = false;
        return;
      }
      c.submission = d.submission || null;
      c.propertyLocations = d.propertyLocations || [];
      c.fieldSectionsByLocation = d.fieldSectionsByLocation || {};
      c.auditSectionsByLocation = d.auditSectionsByLocation || {};

      // Audit edit gate (status-driven, mirrors azurui). Server sends the current status + list.
      c.submissionStatusChoice = d.submissionStatusChoice || '';
      if (d.config && d.config.dataVerificationEditStatuses) {
        c.dataVerificationEditStatuses = d.config.dataVerificationEditStatuses;
      }
      if (d.config && d.config.qaOverrideEditStatuses) {
        c.qaOverrideEditStatuses = d.config.qaOverrideEditStatuses;
      }
      c.dataExtractSysId = d.dataExtractSysId || ''; // for the Classic UI links log

      if (c.propertyLocations.length > 0) {
        c.selectPropertyLocation(c.propertyLocations[0]);
      } else {
        c.showWarning('No property locations found for this submission.');
      }

      c.isLoading = false;
    }).catch(function (e) {
      console.error('Failed to load property locations:', e);
      c.isLoading = false;
      c.showError('Failed to load property locations');
    });
  }

  function loadPdfFromUrl(url, onLoaded) {
    c.isPdfLoading = true;
    c.loadingMessage = 'Loading PDF document...';

    if (renderTask) { renderTask.cancel(); renderTask = null; }

    var loadingTask = $window.pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
      cMapPacked: true
    });

    loadingTask.promise.then(function (pdf) {
      pdfDoc = pdf;
      c.pdfLoaded = true;
      c.totalPages = pdf.numPages;
      c.currentPage = 1;
      c.zoomMode = 'actual-size';

      $scope.$apply(function () {
        c.isLoading = false;
        c.isPdfLoading = false;
      });

      $timeout(function () {
        if (typeof onLoaded === 'function') onLoaded();
        else renderPage(c.currentPage);
      }, 100);
    }).catch(function (error) {
      console.error('Error loading PDF:', error);
      c.isLoading = false;
      c.isPdfLoading = false;
      c.showError('Failed to load PDF: ' + error.message);
    });
  }

  function parseCoordinateString(source) {
    if (!source || typeof source !== 'string') return null;
    var m = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
    if (!m) return null;
    return {
      page: parseInt(m[1], 10),
      x1: parseFloat(m[2]), y1: parseFloat(m[3]),
      x2: parseFloat(m[4]), y2: parseFloat(m[5]),
      x3: parseFloat(m[6]), y3: parseFloat(m[7]),
      x4: parseFloat(m[8]), y4: parseFloat(m[9])
    };
  }

  function parseMultipleCoordinateStrings(source) {
    if (!source || typeof source !== 'string') return [];
    return source.split(';').map(function (s) { return parseCoordinateString(s.trim()); }).filter(Boolean);
  }

  c.canNavigate = function (field) {
    return field && field.source && field.source.length > 0;
  };

  c.navigateToField = function (field) {
    if (!field) return;
    field.allCoordinates = parseMultipleCoordinateStrings(field.source);
    if (!field.allCoordinates.length) return;
    var first = field.allCoordinates[0];
    c.activeField = field;
    c.activeFieldCoordIndex = 0;
    if (first.page !== c.currentPage) {
      c.currentPage = first.page;
      renderPage(c.currentPage);
      $timeout(function () {
        var on = field.allCoordinates.filter(function (co) { return co.page === c.currentPage; });
        highlightMultipleFields(on, true);
      }, 500);
    } else {
      var on2 = field.allCoordinates.filter(function (co) { return co.page === c.currentPage; });
      highlightMultipleFields(on2, true);
    }
  };

  function renderPage(pageNumber) {
    if (!pdfDoc || !canvas || !ctx) return;
    if (pageRendering) { pageNumPending = pageNumber; return; }
    pageRendering = true;
    c.loadingMessage = 'Rendering page ' + pageNumber + '...';
    if (renderTask) renderTask.cancel();

    pdfDoc.getPage(pageNumber).then(function (page) {
      currentPageInstance = page;
      if (c.zoomMode === 'fit-width') {
        var container = document.getElementById('pdfContainer');
        if (container) {
          c.containerWidth = container.clientWidth - 40;
          var baseViewport = page.getViewport({ scale: 1.0 });
          c.scale = c.containerWidth / baseViewport.width;
        }
      }
      var viewport = page.getViewport({ scale: c.scale });
      canvas.height = viewport.height; canvas.width = viewport.width;
      annotationCanvas.height = viewport.height; annotationCanvas.width = viewport.width;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      clearAnnotations();

      renderTask = page.render({ canvasContext: ctx, viewport: viewport });
      renderTask.promise.then(function () {
        pageRendering = false; renderTask = null;
        if (pageNumPending !== null) {
          var p = pageNumPending; pageNumPending = null; renderPage(p);
        }
        if (c.activeField && c.activeField.allCoordinates) {
          var on = c.activeField.allCoordinates.filter(function (co) { return co.page === pageNumber; });
          if (on.length) $timeout(function () { highlightMultipleFields(on, false); }, 100);
        }
      }).catch(function (error) {
        if (error.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', error);
          pageRendering = false;
        }
      });
    }).catch(function (error) {
      console.error('Error getting page:', error);
      pageRendering = false;
      c.showError('Failed to render page');
    });
  }

  function clearAnnotations() {
    if (annotationCtx && annotationCanvas) {
      annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    }
  }

  var toPixels = function (v) { return v * 72 * c.scale; };

  function highlightMultipleFields(coords, scrollToView) {
    if (!coords || !coords.length || !annotationCtx) return;
    clearAnnotations();
    var centerX = 0, centerY = 0;
    coords.forEach(function (coord, i) {
      var x1 = toPixels(coord.x1), y1 = toPixels(coord.y1);
      var x2 = toPixels(coord.x2), y2 = toPixels(coord.y2);
      var x3 = toPixels(coord.x3) || toPixels(coord.x2);
      var y3 = toPixels(coord.y3) || toPixels(coord.y2);
      var x4 = toPixels(coord.x4) || toPixels(coord.x1);
      var y4 = toPixels(coord.y4) || toPixels(coord.y1);
      if (i === 0) { centerX = (x1 + x2 + x3 + x4) / 4; centerY = (y1 + y2 + y3 + y4) / 4; }
      var opacity = coords.length > 1 ? 0.2 : 0.3;
      var strokeOpacity = coords.length > 1 ? 0.6 : 0.8;
      annotationCtx.fillStyle = 'rgba(249, 115, 22, ' + opacity + ')';
      annotationCtx.strokeStyle = 'rgba(249, 115, 22, ' + strokeOpacity + ')';
      annotationCtx.lineWidth = 2;
      annotationCtx.beginPath();
      annotationCtx.moveTo(x1, y1); annotationCtx.lineTo(x2, y2);
      annotationCtx.lineTo(x3, y3); annotationCtx.lineTo(x4, y4);
      annotationCtx.closePath();
      annotationCtx.stroke();
    });
    if (scrollToView) smoothScrollToCoordinate(centerX, centerY);
  }

  function smoothScrollToCoordinate(x, y) {
    var container = document.getElementById('pdfContainer');
    if (!container) return;
    var tx = x - container.clientWidth / 2;
    var ty = y - container.clientHeight / 2;
    tx = Math.max(0, Math.min(tx, container.scrollWidth - container.clientWidth));
    ty = Math.max(0, Math.min(ty, container.scrollHeight - container.clientHeight));
    container.scrollTo({ left: tx, top: ty, behavior: 'smooth' });
  }

  c.nextPage = function () {
    if (c.currentPage < c.totalPages && !pageRendering) {
      c.currentPage++;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };
  c.previousPage = function () {
    if (c.currentPage > 1 && !pageRendering) {
      c.currentPage--;
      c.activeField = null;
      c.activeFieldCoordIndex = 0;
      renderPage(c.currentPage);
    }
  };
  c.fitWidth = function () {
    if (!pdfDoc || !currentPageInstance) return;
    c.zoomMode = 'fit-width';
    var container = document.getElementById('pdfContainer');
    if (container) {
      c.containerWidth = container.clientWidth - 40;
      var viewport = currentPageInstance.getViewport({ scale: 1.0 });
      c.scale = c.containerWidth / viewport.width;
      renderPage(c.currentPage);
    }
  };
  c.actual100Percent = function () {
    if (!pdfDoc) return;
    c.zoomMode = 'actual-size';
    c.scale = 1.0;
    renderPage(c.currentPage);
  };

  $scope.$on('$destroy', function () {
    if (renderTask) renderTask.cancel();
    if (pdfDoc) pdfDoc.destroy();
    $window.removeEventListener('resize', resizeHandler);
  });

  var resizeHandler = debounce(function () {
    if (c.zoomMode === 'fit-width' && pdfDoc && currentPageInstance) c.fitWidth();
  }, 300);
  $window.addEventListener('resize', resizeHandler);

  $timeout(function () { loadPdfJs(); }, 100);
};
