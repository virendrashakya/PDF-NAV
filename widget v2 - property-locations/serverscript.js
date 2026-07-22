(function () {
  /* ============================================
   * Property Locations Widget Server Script
   * ============================================
   * Real data:
   *   - submission, property_location, address, top_risk
   * Dummy data (until backend exists):
   *   - field sections per property location (Location Address, Property Coverage, ...)
   *   - versions
   * ============================================ */

  var CONFIG = {
    tables: {
      submission: 'x_gegis_uwm_dashbo_submission',
      propertyLocation: 'x_gegis_uwm_dashbo_property_location',
      // Bridge table: submission.property_detail ⇄ property_location.property_detail
      // both point to a row in this table. Used to resolve the PL list for a submission.
      propertyLobDetail: 'x_gegis_uwm_dashbo_property_lob_detail',
      address: 'x_gegis_uwm_dashbo_address',
      topRisk: 'x_gegis_uwm_dashbo_extract_top_risk',
      attachment: 'sys_attachment',
      // Master dictionary: every field that can exist (label, type, section, order, nesting).
      // Queried in full, independent of any location.
      coverageFieldMetadata: 'x_gegis_uwm_dashbo_coverage_field_metadata',
      // Values: one row = the value of one metadata field for one property location.
      // Joined to metadata by coverage_metadata_id, scoped by location.
      propertyCoverage: 'x_gegis_uwm_dashbo_property_coverage',
      // Audit Data source: versioned extractions per submission + their editable line items.
      // Line items are scoped by parent (= data_extraction sys_id) AND model_object_sys_id (= PL sys_id).
      dataExtraction: 'x_gegis_uwm_dashbo_data_extraction',
      lineItem: 'x_gegis_uwm_dashbo_data_extraction_lineitem'
    },
    // Data extraction columns — used to resolve which version's line items to load.
    dataExtractionColumns: {
      submission: 'submission',
      version: 'version',
      active: 'active',
      discarded: 'discarded',
      sysCreatedOn: 'sys_created_on'
    },
    // Line item columns (Audit Data). Mirrors widget v2 - azurui lineItemColumns.
    // `modelObject` is the join back to a property_location (model_object_sys_id).
    lineItemColumns: {
      parent: 'parent',                   // reference → data_extraction.sys_id
      modelObject: 'model_object_sys_id', // reference → property_location.sys_id (audit scope)
      source: 'source',
      fieldValue: 'field_value',
      qaOverrideValue: 'qa_override_value',
      dataVerification: 'data_verification',
      commentary: 'commentary',
      reason: 'reason',                   // surfaced to client as logic_transparency
      confidenceIndicator: 'confidence_indicator',
      sectionNameFinal: 'section_name_final', // grouping key
      sequenceFinal: 'sequence_final',        // sort
      fieldNameFinal: 'field_name_final',
      documentAttachment: 'documentname_attachment_sysid' // per-line-item source doc (e.g. Excel) attachment sys_id
    },
    // Master dictionary columns (x_gegis_uwm_dashbo_coverage_field_metadata).
    coverageMetadataColumns: {
      fieldName: 'field_name',
      dataType: 'data_type',              // CURRENCY | STRING | BOOLEAN | NUMBER → picks value column
      coverageType: 'coverage_type',      // section grouping; display value is the header
      parentFieldName: 'parent_field_name',
      sequence: 'sequence'
    },
    // Friendly section display names, keyed by the raw coverage_type value.
    // If a coverage_type isn't listed here, the section falls back to its raw
    // coverage_type display value. Edit this JSON to rename sections in the UI.
    sectionLabels: {
      		'PROPERTY': 'Property Coverage',
		      'Property': 'Property Coverage',
		      'BUSINESS_INTERRUPTION': 'Business Interruption Coverage',
		      'Business Interruption': 'Business Interruption Coverage',
      // 'FLOOD': 'Flood Coverage',
      // 'PP': 'Property & Personal',
      // 'CRIME': 'Crime Coverage'
    },
    // Per-location value columns (x_gegis_uwm_dashbo_property_coverage).
    propertyCoverageColumns: {
      metadataId: 'coverage_metadata_id', // reference → coverage_field_metadata.sys_id
      location: 'location',               // reference → property_location.sys_id
      valueCurrency: 'field_value_currency',
      valueNumber: 'field_value_number',
      valueString: 'field_value_string',
      valueBoolean: 'field_value_boolean',
      valueFormatted: 'field_value_formatted' // optional pre-formatted display string
    },
    submissionColumns: {
      number: 'number',
      accountDetails: 'account_details',
      submissionType: 'submission_type_choice',
      lineOfBusiness: 'line_of_business_choice',
      totalInsuredValue: 'total_insured_value',
      statusChoice: 'submission_status_choice',
      // Reference to x_gegis_uwm_dashbo_property_lob_detail — same column name is on property_location.
      // Property locations are linked to a submission through this shared reference, not directly.
      propertyDetail: 'property_detail'
    },
    // ============================================
    // AUDIT EDITABLE STATUS CONFIGURATION (mirrors widget v2 - azurui)
    // Audit Data columns become editable ONLY when submission_status_choice is in the relevant
    // list; otherwise they render as read-only text.
    //  - Data Verification: dataVerificationEditStatuses
    //  - QA Override Value: qaOverrideEditStatuses
    //  - Commentary: editable when EITHER Data Verification OR QA Override is editable
    // ============================================
    dataVerificationEditStatuses: ['CHECK_FOR_DUPLICATES', 'CONFIRM_DATA_REVIEW', 'INSURED_VERIFICATION', 'DUPLICATE_CHECK', 'SANCTIONS_CHECK', 'DATA_EXTRACT_REVIEW'],
    qaOverrideEditStatuses: ["QUOTE_AND_BIND", "PRE_PROCESSING_VALIDATION", "RATING_INITIAL_PROCESSING", "NO_REFERRAL_PATH", "QUOTE_INPROGRESS", "RENEWAL_READINESS_CHECKS", "RENEWAL_RE_QUOTES", "INTAKE_TASK_INITIALIZATION","QUALITY_ASSURANCE", "REFERRAL_UNDERWRITER_PATH", "RECEIVED", "PENDING_CLEARANCE", "DUPLICATE", "RISK_ASSESSMENT", "EXTERNAL_RISK_REVIEW", "INTERNAL_RISK_REVIEW", "UW-PAUSED", "UW_APPROVED", "QUOTED", "BOUND", "DECLINE", "CUSTOMER_ACCEPTED", "CUSTOMER_REJECTED", "POLICY_ACTIVE", "UNDERWRITING_GUIDELINES", "LETTER_OF_AUTHORITY", "UNDERWRITING_NARRATIVE", "RISK_SUMMARY", "PROPERTY_EXPOSURE"],
    propertyLocationColumns: {
      version: 'version',
      locationName: 'location_name',
      accuracy: 'accuracy',
      required: 'required',
      locationType: 'location_type',
      address: 'address',
      auditDocument: 'audit_document',
      sourceInDocument: 'source_in_document',
      // Reference to x_gegis_uwm_dashbo_property_lob_detail — the bridge to submission.
      propertyDetail: 'property_detail'
    },
    addressColumns: {
      insuredAddress: 'insured_address',
      country: 'country',
      state: 'state',
      latitude: 'geocoded_latitude',
      longitude: 'geocoded_longitude'
    },
    topRiskColumns: {
      propertyLocation: 'property_location',
      total: 'total'
    },
    attachment: {
      supportedContentTypes: [
        'application/pdf',
        'application/octet-stream',
        // Excel — per-line-item source documents rendered via SheetJS on the client.
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel'                                           // .xls (legacy)
      ]
    },
    limits: {
      maxPropertyLocations: 200
    }
  };

  function _getValue(gr, field) {
    try { return gr.getValue(field) || ''; } catch (e) { return ''; }
  }

  function _formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function _getAttachmentData(sysId) {
    gs.info('PL-NAV: _getAttachmentData called with sysId="' + sysId + '"');
    if (!sysId) {
      gs.info('PL-NAV: _getAttachmentData early-return — sysId is empty');
      return null;
    }
    try {
      // Strict query: sys_id + content_type filter (v2 pattern).
      var gr = new GlideRecord(CONFIG.tables.attachment);
      gr.addQuery('sys_id', sysId);
      gr.addQuery('content_type', 'IN', CONFIG.attachment.supportedContentTypes.join(','));
      gr.setLimit(1);
      gr.query();
      if (gr.next()) {
        gs.info('PL-NAV: strict query matched. content_type="' + _getValue(gr, 'content_type') + '"');
        return _buildAttachmentResult(gr, sysId);
      }
      gs.info('PL-NAV: strict query found NO row for sys_id=' + sysId + '. Trying sys_id-only fallback.');

      // Fallback: maybe the content_type filter dropped a valid row.
      var grAny = new GlideRecord(CONFIG.tables.attachment);
      if (grAny.get(sysId)) {
        gs.info('PL-NAV: sys_attachment ' + sysId + ' exists, but content_type "' +
          _getValue(grAny, 'content_type') + '" was filtered out. Returning anyway.');
        return _buildAttachmentResult(grAny, sysId);
      }
      gs.info('PL-NAV: sys_attachment row not found at all for sys_id=' + sysId);
    } catch (e) {
      gs.error('PL-NAV: attachment fetch failed: ' + e.message);
    }
    return null;
  }

  function _buildAttachmentResult(gr, sysId) {
    var sizeBytes = parseInt(_getValue(gr, 'size_bytes'), 10) || 0;
    return {
      sys_id: gr.getUniqueValue(),
      file_name: _getValue(gr, 'file_name'),
      content_type: _getValue(gr, 'content_type'),
      size_bytes: sizeBytes,
      size_formatted: _formatFileSize(sizeBytes),
      file_url: '/sys_attachment.do?sys_id=' + sysId
    };
  }

  function _getAddress(addressSysId) {
    if (!addressSysId) return null;
    var gr = new GlideRecord(CONFIG.tables.address);
    if (!gr.get(addressSysId)) return null;
    return {
      sys_id: gr.getUniqueValue(),
      insured_address: _getValue(gr, CONFIG.addressColumns.insuredAddress),
      country: _getValue(gr, CONFIG.addressColumns.country),
      state: _getValue(gr, CONFIG.addressColumns.state),
      latitude: _getValue(gr, CONFIG.addressColumns.latitude),
      longitude: _getValue(gr, CONFIG.addressColumns.longitude)
    };
  }

  function _getFirstTopRiskTotal(propertyLocationSysId) {
    if (!propertyLocationSysId) return '';
    var gr = new GlideRecord(CONFIG.tables.topRisk);
    gr.addQuery(CONFIG.topRiskColumns.propertyLocation, propertyLocationSysId);
    gr.setLimit(1);
    gr.query();
    if (gr.next()) {
      return _getValue(gr, CONFIG.topRiskColumns.total);
    }
    return '';
  }

  data.success = false;
  data.error = '';

  // Resolve sys_ids from the URL on every load so the client controller picks them up via
  // $scope.data without a round trip.
  // submissionSysId — ?submissionSysId=<sys_id> (preferred) or ?sys_id=<sys_id>
  // locationSysId   — ?locationSysId=<sys_id>  (when set, only that one property_location loads)
  data.submissionSysId =
    (input && input.submissionSysId) ||
    $sp.getParameter('submissionSysId') ||
    $sp.getParameter('sys_id') ||
    '';
  data.locationSysId =
    (input && input.locationSysId) ||
    $sp.getParameter('locationSysId') ||
    '';

  if (input && input.action) {
    try {
      switch (input.action) {
        case 'fetchPropertyLocations':
          fetchPropertyLocations();
          break;
        case 'saveField':
          saveField();
          break;
        case 'saveFields':
          saveFields();
          break;
        case 'saveAuditField':
          saveAuditField();
          break;
        case 'saveAuditFields':
          saveAuditFields();
          break;
        case 'syncModelToAudit':
          syncModelToAudit();
          break;
        case 'completeAuditToModel':
          completeAuditToModel();
          break;
        default:
          data.error = 'Unknown action: ' + input.action;
      }
    } catch (e) {
      gs.error('PL-NAV ERROR: ' + e.message);
      data.error = 'Server error: ' + e.message;
    }
  } else {
    data.message = 'Property Locations Widget loaded';
    data.success = true;
  }

  function fetchPropertyLocations() {
    var submissionSysId = input.submissionSysId;
    var locationSysId = input.locationSysId || '';
    if (!submissionSysId) {
      data.error = 'Submission ID is required';
      return;
    }

    var submissionGr = new GlideRecord(CONFIG.tables.submission);
    if (!submissionGr.get(submissionSysId)) {
      data.error = 'Submission not found';
      return;
    }

    var lineOfBusiness = _getValue(submissionGr, CONFIG.submissionColumns.lineOfBusiness);
    var propertyDetailSysId = _getValue(submissionGr, CONFIG.submissionColumns.propertyDetail);

    // Resolve the data_extraction version once for the whole submission (Audit Data source).
    // Line items are then scoped per-PL by model_object_sys_id inside _buildAuditSections.
    var dataExtractSysId = _resolveDataExtraction(submissionSysId);
    data.submission = {
      sys_id: submissionSysId,
      number: _getValue(submissionGr, CONFIG.submissionColumns.number),
      account_details: _getValue(submissionGr, CONFIG.submissionColumns.accountDetails),
      submission_type: _getValue(submissionGr, CONFIG.submissionColumns.submissionType),
      line_of_business: lineOfBusiness,
      total_insured_value: _getValue(submissionGr, CONFIG.submissionColumns.totalInsuredValue),
      property_detail: propertyDetailSysId
    };

    // Audit edit gate: current submission status + the statuses in which Audit DV/Commentary edit.
    data.submissionStatusChoice = _getValue(submissionGr, CONFIG.submissionColumns.statusChoice);
    data.config = {
      dataVerificationEditStatuses: CONFIG.dataVerificationEditStatuses,
      qaOverrideEditStatuses: CONFIG.qaOverrideEditStatuses
    };
    // Resolved data_extraction sys_id — exposed for the client debug links (Classic UI + lineitem filter).
    data.dataExtractSysId = dataExtractSysId;

    var plGr = new GlideRecord(CONFIG.tables.propertyLocation);

    if (locationSysId) {
      // Single-location mode: client passed ?locationSysId=<sys_id>, load just that PL.
      // Pre-flight: verify the record exists and belongs to this submission via the shared
      // property_detail bridge. We use a separate GlideRecord for the check because the main
      // plGr is iterated by the while loop below — calling .get() on it would position the
      // cursor at the record, but .next() afterwards would skip past it and the loop wouldn't
      // execute. addQuery + query keeps the cursor behavior consistent.
      var checkGr = new GlideRecord(CONFIG.tables.propertyLocation);
      if (!checkGr.get(locationSysId)) {
        data.error = 'Property location not found for the provided locationSysId';
        data.propertyLocations = [];
        data.fieldSectionsByLocation = {};
        return;
      }
      var plPropertyDetail = _getValue(checkGr, CONFIG.propertyLocationColumns.propertyDetail);
      if (propertyDetailSysId && plPropertyDetail && plPropertyDetail !== propertyDetailSysId) {
        data.error = 'Property location does not belong to the provided submission';
        data.propertyLocations = [];
        data.fieldSectionsByLocation = {};
        return;
      }
      plGr.addQuery('sys_id', locationSysId);
      plGr.query();
    } else {
      // List mode: derive from the submission ⇄ property_lob_detail bridge.
      if (!propertyDetailSysId) {
        data.propertyLocations = [];
        data.fieldSectionsByLocation = {};
        data.versions = [];
        data.success = true;
        return;
      }
      plGr.addQuery(CONFIG.propertyLocationColumns.propertyDetail, propertyDetailSysId);
      plGr.orderByDesc(CONFIG.propertyLocationColumns.version);
      plGr.orderBy(CONFIG.propertyLocationColumns.locationName);
      plGr.setLimit(CONFIG.limits.maxPropertyLocations);
      plGr.query();
    }

    var locations = [];
    while (plGr.next()) {
      var plSysId = plGr.getUniqueValue();
      var addressSysId = _getValue(plGr, CONFIG.propertyLocationColumns.address);
      var address = _getAddress(addressSysId);
      var docSysId = _getValue(plGr, CONFIG.propertyLocationColumns.auditDocument);
      // Diagnostic: getValue may return a truncated/derived value depending on column type.
      // Compare against getDisplayValue and the underlying element to figure out what's stored.
      var docDisplay = '';
      var docElementType = '';
      try {
        docDisplay = plGr.getDisplayValue(CONFIG.propertyLocationColumns.auditDocument) || '';
        var el = plGr.getElement(CONFIG.propertyLocationColumns.auditDocument);
        docElementType = el ? el.getED().getInternalType() : 'no-element';
      } catch (e) {
        docElementType = 'error:' + e.message;
      }
      gs.info('PL-NAV: property_location ' + plSysId +
        ' audit_document.getValue="' + docSysId + '" (len=' + docSysId.length + ')' +
        ' .getDisplayValue="' + docDisplay + '"' +
        ' columnType=' + docElementType);
      var insuredValue = _getFirstTopRiskTotal(plSysId);

      var geocodes = '';
      if (address && address.latitude && address.longitude) {
        geocodes = address.latitude + ', ' + address.longitude;
      }

      locations.push({
        sys_id: plSysId,
        version: _getValue(plGr, CONFIG.propertyLocationColumns.version),
        location_name: _getValue(plGr, CONFIG.propertyLocationColumns.locationName),
        location_type: _getValue(plGr, CONFIG.propertyLocationColumns.locationType),
        accuracy: _getValue(plGr, CONFIG.propertyLocationColumns.accuracy),
        required: _getValue(plGr, CONFIG.propertyLocationColumns.required),
        source_in_document: _getValue(plGr, CONFIG.propertyLocationColumns.sourceInDocument),
        address_text: address ? address.insured_address : '',
        state: address ? address.state : '',
        country: address ? address.country : '',
        geocodes: geocodes,
        line_of_business: lineOfBusiness,
        insured_value: insuredValue,
        audit_document_sys_id: docSysId,
        attachmentData: docSysId ? _getAttachmentData(docSysId) : null
      });
    }

    data.propertyLocations = locations;

    // Field sections from the coverage_field_metadata master (queried once), joined per location
    // to its property_coverage value rows. Sections + fields come from metadata; values come from
    // the coverage row. See CLAUDE.md "Field sections".
    var fieldDictionary = _loadFieldDictionary();
    data.fieldSectionsByLocation = {};
    data.auditSectionsByLocation = {};
    locations.forEach(function (loc) {
      data.fieldSectionsByLocation[loc.sys_id] = _buildFieldSections(fieldDictionary, loc.sys_id);
      // Audit Data: line items from data_extraction_lineitem where model_object_sys_id = this PL.
      data.auditSectionsByLocation[loc.sys_id] = _buildAuditSections(dataExtractSysId, loc.sys_id);
    });

    // Dummy versions for the dropdown if/when it is wired in.
    data.versions = [
      { sys_id: 'dummy-v1', label: 'v1 (active)', active: true },
      { sys_id: 'dummy-v2', label: 'v2', active: false }
    ];

    data.success = true;
  }

  function saveField() {
    // Real save: PATCH the typed value column on the field's coverage row.
    // The client sends the row target back verbatim in update.meta, stamped onto the field
    // by _buildFieldSections. Only field_value is persisted (per the values model); other
    // per-field columns (data_verification, commentary) have no backing column yet.
    data.success = false;
    var result = _persistFieldValue(input.update || {});
    if (result.ok) {
      data.success = true;
      data.message = 'Saved';
      data.updatedSysId = result.sysId;
    } else {
      data.error = result.error;
      data.message = result.error;
    }
  }

  function saveFields() {
    // Bulk version of saveField — the top "Save Changes" button sends every dirty field.
    data.success = false;
    data.updatedCount = 0;
    data.errors = [];

    var updates = input.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      data.error = 'No updates provided';
      return;
    }

    var updatedCount = 0;
    var errors = [];
    for (var i = 0; i < updates.length; i++) {
      var result = _persistFieldValue(updates[i] || {});
      if (result.ok) {
        updatedCount++;
      } else {
        errors.push((updates[i] && updates[i].sys_id ? updates[i].sys_id + ': ' : '') + result.error);
      }
    }

    data.updatedCount = updatedCount;
    data.errors = errors;
    data.success = true; // partial success is still success; per-row errors surfaced in data.errors
    data.message = 'Saved ' + updatedCount + ' record(s)' + (errors.length ? ' with ' + errors.length + ' error(s)' : '');
  }

  function saveAuditField() {
    // Real save for Audit Data: PATCH the line item's editable columns.
    // Routed here (rather than saveField) because meta.table = the lineitem table.
    data.success = false;
    if (!_isAuditEditAllowed()) {
      data.error = 'Editing is not permitted for the current submission status.';
      data.message = data.error;
      return;
    }
    var result = _persistAuditField(input.update || {});
    if (result.ok) {
      data.success = true;
      data.message = 'Saved';
      data.updatedSysId = result.sysId;
    } else {
      data.error = result.error;
      data.message = result.error;
    }
  }

  function saveAuditFields() {
    // Bulk version of saveAuditField — the top "Save Changes" button sends every dirty audit field.
    data.success = false;
    data.updatedCount = 0;
    data.errors = [];

    if (!_isAuditEditAllowed()) {
      data.error = 'Editing is not permitted for the current submission status.';
      data.message = data.error;
      return;
    }

    var updates = input.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      data.error = 'No updates provided';
      return;
    }

    var updatedCount = 0;
    var errors = [];
    for (var i = 0; i < updates.length; i++) {
      var result = _persistAuditField(updates[i] || {});
      if (result.ok) {
        updatedCount++;
      } else {
        errors.push((updates[i] && updates[i].sys_id ? updates[i].sys_id + ': ' : '') + result.error);
      }
    }

    data.updatedCount = updatedCount;
    data.errors = errors;
    data.success = true; // partial success is still success; per-row errors surfaced in data.errors
    data.message = 'Saved ' + updatedCount + ' record(s)' + (errors.length ? ' with ' + errors.length + ' error(s)' : '');
  }

  /**
   * Model → Audit sync for one location. Called on page load so the Audit Data line items
   * reflect the current model data. Scoped by the location sys_id from the URL.
   * External dependency: ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location.
   */
  function syncModelToAudit() {
    data.success = false;
    var locationSysId = input.locationSysId || data.locationSysId || '';
    if (!locationSysId) {
      data.error = 'Location sys_id is required for Model→Audit sync';
      return;
    }
    try {
      gs.info('PL-NAV: MODEL2AUDIT for location=' + locationSysId);
      ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location(locationSysId, ExtractionHelper.MODEL2AUDIT);
      gs.info('PL-NAV: MODEL2AUDIT completed for location=' + locationSysId);
      data.success = true;
      data.message = 'Model to Audit sync completed';
    } catch (e) {
      gs.error('PL-NAV: MODEL2AUDIT failed for ' + locationSysId + ': ' + e.message);
      data.error = 'Model to Audit sync failed: ' + e.message;
    }
  }

  /**
   * Audit → Model sync for one location. Called by the Complete button. Scoped by the
   * location sys_id from the URL.
   * External dependency: ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location.
   */
  function completeAuditToModel() {
    data.success = false;
    var locationSysId = input.locationSysId || data.locationSysId || '';
    if (!locationSysId) {
      data.error = 'Location sys_id is required to complete';
      return;
    }
    try {
      gs.info('PL-NAV: AUDIT2MODEL for location=' + locationSysId);
      ExtractionHelper.dataFlowBetweenDataExtractAndModel_Location(locationSysId, ExtractionHelper.AUDIT2MODEL);
      gs.info('PL-NAV: AUDIT2MODEL completed for location=' + locationSysId);
      data.success = true;
      data.message = 'Audit to Model completed successfully';
    } catch (e) {
      gs.error('PL-NAV: AUDIT2MODEL failed for ' + locationSysId + ': ' + e.message);
      data.error = 'Failed to complete: ' + e.message;
    }
  }

  /**
   * Persist one audit line item's editable columns. Shared by saveAuditField / saveAuditFields.
   * Unlike _persistFieldValue (property_coverage), data_verification and commentary DO have
   * backing columns on the line item table, so all three are written when present on the update.
   * Updates existing rows only.
   * @returns {{ ok: boolean, sysId: string, error: string }}
   */
  function _persistAuditField(update) {
    var meta = update.meta || {};

    if (!meta.sysId) {
      return { ok: false, sysId: '', error: 'No line item exists for this field; cannot save.' };
    }
    if (meta.table !== CONFIG.tables.lineItem) {
      return { ok: false, sysId: '', error: 'Refusing to save: unexpected target table "' + meta.table + '".' };
    }

    try {
      var cols = CONFIG.lineItemColumns;
      var gr = new GlideRecord(CONFIG.tables.lineItem);
      if (!gr.get(meta.sysId)) {
        return { ok: false, sysId: meta.sysId, error: 'Line item record not found: ' + meta.sysId };
      }
      // Only write the columns present on the update object.
      if (update.hasOwnProperty('field_value')) {
        gr.setValue(cols.fieldValue, _coerceValue(update.field_value));
      }
      if (update.hasOwnProperty('qa_override_value')) {
        gr.setValue(cols.qaOverrideValue, _coerceValue(update.qa_override_value));
      }
      if (update.hasOwnProperty('data_verification')) {
        gr.setValue(cols.dataVerification, _coerceValue(update.data_verification));
      }
      if (update.hasOwnProperty('commentary')) {
        gr.setValue(cols.commentary, _coerceValue(update.commentary));
      }
      gr.update();
      return { ok: true, sysId: meta.sysId, error: '' };
    } catch (e) {
      gs.error('PL-NAV: _persistAuditField failed for ' + meta.sysId + ': ' + e.message);
      return { ok: false, sysId: meta.sysId, error: 'Error saving audit field: ' + e.message };
    }
  }

  function _coerceValue(v) {
    return (v === null || v === undefined) ? '' : v;
  }

  /**
   * Server-side enforcement of the Audit edit gate (defense-in-depth; the client also hides the
   * editors). Reads the submission status fresh and allows the save when the status permits
   * editing ANY audit column — i.e. status ∈ dataVerificationEditStatuses OR ∈ qaOverrideEditStatuses
   * (Commentary is editable whenever either of those is). The per-column write in _persistAuditField
   * still only touches the columns present on the update.
   * Resolves the submission from input.submissionSysId (sent by the client with every audit save).
   * Fails safe: if the submission can't be resolved, editing is DENIED.
   */
  function _isAuditEditAllowed() {
    var submissionSysId = input.submissionSysId || '';
    if (!submissionSysId) return false;
    var gr = new GlideRecord(CONFIG.tables.submission);
    if (!gr.get(submissionSysId)) return false;
    var status = _getValue(gr, CONFIG.submissionColumns.statusChoice);
    return CONFIG.dataVerificationEditStatuses.indexOf(status) !== -1 ||
      CONFIG.qaOverrideEditStatuses.indexOf(status) !== -1;
  }

  /**
   * Persist one field's value onto its coverage row. Shared by saveField / saveFields.
   * Only updates existing rows — if there is no coverage row (meta.sysId null), it errors
   * rather than inserting (row creation is controlled elsewhere).
   * @returns {{ ok: boolean, sysId: string, error: string }}
   */
  function _persistFieldValue(update) {
    var meta = update.meta || {};

    if (!meta.sysId || !meta.valueField) {
      return { ok: false, sysId: '', error: 'No value record exists for this field at this location; cannot save.' };
    }
    if (meta.table !== CONFIG.tables.propertyCoverage) {
      return { ok: false, sysId: '', error: 'Refusing to save: unexpected target table "' + meta.table + '".' };
    }

    try {
      var gr = new GlideRecord(CONFIG.tables.propertyCoverage);
      if (!gr.get(meta.sysId)) {
        return { ok: false, sysId: meta.sysId, error: 'Coverage value record not found: ' + meta.sysId };
      }
      if (update.hasOwnProperty('field_value')) {
        var v = (update.field_value === null || update.field_value === undefined) ? '' : update.field_value;
        gr.setValue(meta.valueField, v);
      }
      gr.update();
      return { ok: true, sysId: meta.sysId, error: '' };
    } catch (e) {
      gs.error('PL-NAV: _persistFieldValue failed for ' + meta.sysId + ': ' + e.message);
      return { ok: false, sysId: meta.sysId, error: 'Error saving field: ' + e.message };
    }
  }

  /**
   * Load the master field dictionary once (all rows, no location filter), ordered by sequence.
   * Returns an ordered array of field definitions used to build every location's sections.
   */
  function _loadFieldDictionary() {
    var cols = CONFIG.coverageMetadataColumns;
    var fields = [];
    var gr = new GlideRecord(CONFIG.tables.coverageFieldMetadata);
    gr.orderBy(cols.sequence);
    gr.query();
    while (gr.next()) {
      // Raw coverage_type value = stable grouping key; display value = human header.
      var rawType = _getValue(gr, cols.coverageType);
      var displayType = gr.getDisplayValue(cols.coverageType) || rawType || 'Uncategorized';
      fields.push({
        sys_id: gr.getUniqueValue(),
        field_name: _getValue(gr, cols.fieldName),
        data_type: (_getValue(gr, cols.dataType) || '').toUpperCase(),
        coverage_type_key: rawType || displayType,   // group by this (stable)
        coverage_type_display: displayType,           // fallback header if no label mapping
        parent_field_name: _getValue(gr, cols.parentFieldName),
        sequence: parseInt(_getValue(gr, cols.sequence), 10) || 0
      });
    }
    return fields;
  }

  /**
   * Map data_type → the property_coverage column that stores that type's value.
   */
  function _valueFieldForType(dataType) {
    var c = CONFIG.propertyCoverageColumns;
    switch ((dataType || '').toUpperCase()) {
      case 'CURRENCY': return c.valueCurrency;
      case 'NUMBER': return c.valueNumber;
      case 'BOOLEAN': return c.valueBoolean;
      case 'STRING':
      default: return c.valueString;
    }
  }

  /**
   * Resolve which data_extraction version's line items to load for a submission.
   * Minimal port of widget v2 - azurui _resolveDataExtraction: prefer the most recent
   * active extraction, else the most recent non-discarded one. Returns the sys_id, or ''
   * if none found (⇒ Audit Data renders empty).
   */
  function _resolveDataExtraction(submissionSysId) {
    if (!submissionSysId) return '';
    var deCols = CONFIG.dataExtractionColumns;
    var gr = new GlideRecord(CONFIG.tables.dataExtraction);
    gr.addQuery(deCols.submission, submissionSysId);
    gr.orderByDesc(deCols.version);
    gr.orderByDesc(deCols.sysCreatedOn);
    gr.query();

    var activeSysId = '';
    var firstSysId = '';
    while (gr.next()) {
      var sysId = gr.getUniqueValue();
      if (!firstSysId) firstSysId = sysId;
      var activeRaw = gr.getValue(deCols.active);
      if (!activeSysId && (activeRaw === 'true' || activeRaw === '1')) {
        activeSysId = sysId;
      }
    }
    return activeSysId || firstSysId || '';
  }

  /**
   * Normalize a raw confidence value to a 0–1 float (divides by 100 if > 1), or '' if blank/NaN.
   * Ported from widget v2 - azurui.
   */
  function _parseConfidence(confidenceValue) {
    try {
      if (confidenceValue === null || confidenceValue === undefined || confidenceValue === '') {
        return '';
      }
      var confidence = parseFloat(confidenceValue);
      if (isNaN(confidence)) return '';
      if (confidence > 1) confidence = confidence / 100;
      return confidence;
    } catch (e) {
      return '';
    }
  }

  /** Parse a possibly comma-formatted sequence value to a number (0 default). */
  function _parseOrder(orderStr) {
    if (!orderStr) return 0;
    return parseFloat(('' + orderStr).replace(/,/g, '')) || 0;
  }

  /**
   * Build Audit Data sections for one property location.
   * Queries data_extraction_lineitem where parent = <resolved data_extraction> AND
   * model_object_sys_id = <this PL>. Groups by section_name_final into the SAME ordered-array
   * section shape as _buildFieldSections so the client template renders both areas identically.
   *
   * Field nodes carry meta.table = the lineitem table so client save routing targets
   * saveAuditField/saveAuditFields (not the property_coverage saveField path).
   */
  function _buildAuditSections(dataExtractSysId, locationSysId) {
    if (!locationSysId) return [];
    var cols = CONFIG.lineItemColumns;

    var gr = new GlideRecord(CONFIG.tables.lineItem);
    // TODO: re-enable the data_extraction scope once the active extraction reliably resolves
    // and its line items carry model_object_sys_id. Until then, scope by PL alone (see CLAUDE.md).
    // Caveat: without this, line items from ALL extraction versions for the PL match.
    // gr.addQuery(cols.parent, dataExtractSysId);
    gr.addQuery(cols.modelObject, locationSysId);
    gr.orderBy(cols.sequenceFinal);
    gr.orderBy(cols.fieldNameFinal);
    gr.query();

    var byKey = {};   // section key → section object
    var order = [];   // section keys in first-seen order (sequence order)
    while (gr.next()) {
      var sectionKey = _getValue(gr, cols.sectionNameFinal) || 'Uncategorized';
      var seq = _parseOrder(_getValue(gr, cols.sequenceFinal));

      if (!byKey[sectionKey]) {
        byKey[sectionKey] = {
          key: sectionKey,
          label: CONFIG.sectionLabels[sectionKey] || sectionKey,
          _minSeq: seq,
          fields: []
        };
        order.push(sectionKey);
      }
      if (seq < byKey[sectionKey]._minSeq) byKey[sectionKey]._minSeq = seq;

      var lineSysId = gr.getUniqueValue();

      // Per-line-item source document (e.g. an Excel workbook). When present, the client renders
      // this attachment in the right panel instead of the PL's PDF, and treats `source` as an
      // A1 cell reference. Resolved to attachmentData here so the client gets content_type + URL.
      var lineDocSysId = _getValue(gr, cols.documentAttachment);
      var lineAttachmentData = lineDocSysId ? _getAttachmentData(lineDocSysId) : null;
      byKey[sectionKey].fields.push({
        sys_id: lineSysId,           // line item identity (also the save target)
        field_name: _getValue(gr, cols.fieldNameFinal) || 'Unknown',
        field_value: _getValue(gr, cols.fieldValue),
        data_type: 'STRING',         // line items have no typed value column — plain text editor
        qa_override_value: _getValue(gr, cols.qaOverrideValue),
        data_verification: _getValue(gr, cols.dataVerification),
        commentary: _getValue(gr, cols.commentary),
        logic_transparency: _getValue(gr, cols.reason),
        confidence_indicator: _parseConfidence(_getValue(gr, cols.confidenceIndicator)),
        source: _getValue(gr, cols.source),
        attachmentData: lineAttachmentData, // per-line-item source doc (Excel/PDF) or null
        // Save target: the line item row + which columns saveAuditField writes.
        meta: {
          table: CONFIG.tables.lineItem,
          sysId: lineSysId,
          valueField: cols.fieldValue
        }
      });
    }

    // Order sections by their minimum field sequence, then drop the internal _minSeq.
    var sections = order.map(function (k) { return byKey[k]; });
    sections.sort(function (a, b) { return a._minSeq - b._minSeq; });
    sections.forEach(function (s) { delete s._minSeq; });
    return sections;
  }

  /**
   * For one location: query its coverage value rows (indexed by coverage_metadata_id), then
   * join each metadata field to its value and group into sections.
   *
   * Returns an ORDERED ARRAY of sections — [{ key, label, fields: [...] }] — NOT a plain object.
   * AngularJS ng-repeat over an object sorts keys, so section order would be lost; an array
   * preserves it. Sections are ordered by the lowest field `sequence` within each (so the
   * section whose first metadata field comes earliest appears first). `label` is the friendly
   * name from CONFIG.sectionLabels (falling back to the raw coverage_type display value).
   */
  function _buildFieldSections(fieldDictionary, locationSysId) {
    var cols = CONFIG.propertyCoverageColumns;

    // Values: coverage rows for this location, indexed by the metadata field they belong to.
    var rowsByMetaId = {};
    var cvGr = new GlideRecord(CONFIG.tables.propertyCoverage);
    cvGr.addQuery(cols.location, locationSysId);
    cvGr.query();
    while (cvGr.next()) {
      var metaId = _getValue(cvGr, cols.metadataId);
      if (!metaId) continue;
      rowsByMetaId[metaId] = {
        sys_id: cvGr.getUniqueValue(),
        currency: _getValue(cvGr, cols.valueCurrency),
        number: _getValue(cvGr, cols.valueNumber),
        string: _getValue(cvGr, cols.valueString),
        boolean: _getValue(cvGr, cols.valueBoolean),
        formatted: _getValue(cvGr, cols.valueFormatted)
      };
    }

    // Join: one node per metadata field, grouped by coverage_type_key. Dictionary is already
    // sequence-ordered, so pushing in order preserves within-section field ordering. Track each
    // section's minimum sequence to order the sections themselves.
    var byKey = {};      // key → section object
    var order = [];      // section keys in first-seen order (which is sequence order)
    fieldDictionary.forEach(function (def) {
      var row = rowsByMetaId[def.sys_id];
      var valueField = _valueFieldForType(def.data_type);

      var fieldValue = '';
      if (row) {
        // Pre-formatted display string wins if present; otherwise the typed column.
        fieldValue = row.formatted || row[_valueKeyForType(def.data_type)] || '';
      }

      var key = def.coverage_type_key || 'Uncategorized';
      if (!byKey[key]) {
        byKey[key] = {
          key: key,
          label: CONFIG.sectionLabels[key] || def.coverage_type_display || key,
          _minSeq: def.sequence,
          fields: []
        };
        order.push(key);
      }
      if (def.sequence < byKey[key]._minSeq) byKey[key]._minSeq = def.sequence;

      byKey[key].fields.push({
        sys_id: def.sys_id,           // metadata field identity (stable per field)
        field_name: def.field_name,
        field_value: fieldValue,
        data_type: def.data_type,     // CURRENCY | NUMBER | STRING | BOOLEAN — client picks the inline editor + display format
        data_verification: '',        // no backing column yet — blank
        commentary: '',               // no backing column yet — blank
        logic_transparency: '',
        confidence_indicator: '',
        source: '',
        attachmentData: null,
        // Save target: which coverage row + typed column a value edit PATCHes.
        // Null sysId ⇒ no value row for this field at this location ⇒ saveField no-ops.
        meta: {
          table: CONFIG.tables.propertyCoverage,
          sysId: row ? row.sys_id : null,
          valueField: valueField
        }
      });
    });

    // Order sections by their minimum field sequence, then drop the internal _minSeq.
    var sections = order.map(function (k) { return byKey[k]; });
    sections.sort(function (a, b) { return a._minSeq - b._minSeq; });
    sections.forEach(function (s) { delete s._minSeq; });
    return sections;
  }

  /**
   * data_type → the key on the indexed coverage row object built in _buildFieldSections.
   */
  function _valueKeyForType(dataType) {
    switch ((dataType || '').toUpperCase()) {
      case 'CURRENCY': return 'currency';
      case 'NUMBER': return 'number';
      case 'BOOLEAN': return 'boolean';
      case 'STRING':
      default: return 'string';
    }
  }

  data.serverTime = new Date().getTime();
})();
