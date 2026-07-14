api.controller = function ($scope, $location, $filter, $window, spUtil, $timeout) {
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

  c.getVisibleFieldCount = function () {
    var all = c.flatten(c.groupedFields);
    return all.filter(function (f) { return c.shouldShowField(f) && c.searchFilter(f); }).length;
  };
  c.getTotalCount = function () { return c.flatten(c.groupedFields).length; };

  /* ============================================
   * SAVE (autosave on blur — dummy backend for now)
   * ============================================ */

  c.canEditDataVerification = function () { return true; };
  c.canEditCommentary = function () { return true; };

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
    if (column === 'verification') return 'data_verification';
    if (column === 'commentary') return 'commentary';
    return column;
  };

  // Whether a given column is editable for this field.
  // 'value' needs a coverage row; verification/commentary are always UI-editable.
  c.canEditColumn = function (field, column) {
    if (column === 'value') return c.canEditValue(field);
    return !!field; // verification / commentary — UI only, no persistence gate
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

  // Blur/Enter closes the editor. 'value' autosaves to the coverage row; the other two are
  // UI-only (no backing column) so we just mark changed and close.
  c.stopEditing = function (field, column) {
    if (field) {
      c.markFieldAsChanged(field);
      if (column === 'value') c.autoSaveField(field);
    }
    c.editingCellKey = null;
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

  // Build the save payload for one field. Only field_value is persisted (values model);
  // meta carries the coverage-row PATCH target the server needs.
  function buildFieldUpdate(field) {
    return {
      sys_id: field.sys_id,
      field_value: field.field_value || '',
      meta: field.meta || null
    };
  }

  c.autoSaveField = function (field) {
    if (!field || !field.sys_id) return;
    if (!c.changedFields[field.sys_id]) return;
    // No coverage row ⇒ nothing to save. Clear the dirty flag so it doesn't linger.
    if (!c.canEditValue(field)) {
      delete c.changedFields[field.sys_id];
      c.hasChanges = Object.keys(c.changedFields).length > 0;
      return;
    }

    c.saveStatus = 'saving';
    c.saveStatusMessage = 'Saving...';

    c.server.get({
      action: 'saveField',
      update: buildFieldUpdate(field),
      propertyLocationSysId: c.selectedPropertyLocationSysId
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
   * TOP-RIGHT ACTION BUTTONS — Refer / Save Changes / Re-Run Geocoding
   * ============================================
   * All three are currently dummy. Each method shows an info toast so the
   * click is observable, but does nothing real.
   * TODO: wire each to its real backend action (a server action / data
   * resource / scripted REST endpoint) once the requirements are confirmed.
   * ============================================ */

  c.onRefer = function () {
    // TODO: implement Refer action — should refer the submission to the next workflow stage.
    //       Likely server action 'referSubmission' that updates submission.submission_status_choice
    //       and triggers any downstream notifications. Confirm target status + audit requirements.
    c.showInfo('Refer — not yet implemented');
  };

  c.onSaveChanges = function () {
    // Bulk-save every currently dirty field in one round trip. Fields also autosave on blur;
    // this flushes anything still marked changed (e.g. edited but not blurred). Only fields
    // with a coverage value row are persistable — others are dropped (nothing to PATCH).
    var dirtySysIds = Object.keys(c.changedFields);
    if (!dirtySysIds.length) {
      c.showInfo('No changes to save');
      return;
    }

    var allFields = c.flatten(c.groupedFields);
    var updates = [];
    allFields.forEach(function (field) {
      if (c.changedFields[field.sys_id] && c.canEditValue(field)) {
        updates.push(buildFieldUpdate(field));
      }
    });

    if (!updates.length) {
      // Everything dirty was unsavable (no coverage row). Clear flags and inform.
      c.changedFields = {};
      c.hasChanges = false;
      c.showWarning('No editable values to save for the changed fields');
      return;
    }

    c.saveStatus = 'saving';
    c.saveStatusMessage = 'Saving ' + updates.length + ' change(s)...';

    c.server.get({
      action: 'saveFields',
      updates: updates,
      propertyLocationSysId: c.selectedPropertyLocationSysId
    }).then(function (response) {
      var d = response.data || {};
      if (d.success) {
        // Clear the dirty flags for the fields that were sent.
        updates.forEach(function (u) { delete c.changedFields[u.sys_id]; });
        c.hasChanges = Object.keys(c.changedFields).length > 0;
        c.saveStatus = 'saved';
        c.lastSavedTime = new Date();
        c.saveStatusMessage = 'Saved at ' + c.formatTime(c.lastSavedTime);
        c.showSuccess('Saved ' + (d.updatedCount != null ? d.updatedCount : updates.length) + ' change(s)');
        $timeout(function () { if (c.saveStatus === 'saved') c.saveStatus = ''; }, 3000);
      } else {
        c.saveStatus = 'error';
        c.saveStatusMessage = 'Save failed: ' + (d.error || 'Unknown error');
        c.showError('Save failed: ' + (d.error || 'Unknown error'));
      }
    }).catch(function () {
      c.saveStatus = 'error';
      c.saveStatusMessage = 'Save failed';
      c.showError('Save failed');
    });
  };

  c.onReRunGeocoding = function () {
    // TODO: implement Re-Run Geocoding action — re-runs geocoding for the selected /
    //       all property locations on the submission. Likely calls a server-side
    //       GeocodingHelper script include that updates x_gegis_uwm_dashbo_address rows.
    //       Confirm scope (this PL only vs all PLs on the submission) and whether a
    //       confirm dialog is required before the call.
    c.showInfo('Re-Run Geocoding — not yet implemented');
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

    // Sections for this location — an ordered array [{ key, label, fields }].
    var sections = c.fieldSectionsByLocation[loc.sys_id] || [];
    c.groupedFields = sections;
    c.collapsedSections = {};
    sections.forEach(function (s) { c.collapsedSections[s.key] = false; });

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
