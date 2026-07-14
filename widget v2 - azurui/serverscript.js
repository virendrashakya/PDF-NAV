(function () {
  /* ============================================
   * PDF-NAV Widget Server Script
   * ============================================
   * Tables:
   * - x_gegis_uwm_dashbo_data_extraction_lineitem (editable data)
   * - x_gegis_uwm_dashbo_data_extraction_metadata (field definitions, read-only)
   * ============================================ */

  /* ============================================
   * DEBUG CONFIGURATION
   * Set includeDebugData to false to remove _debug from responses
   * ============================================ */
  var DEBUG = {
    includeDebugData: true  // Include _debug object in field data for client-side debugging
  };

  /* ============================================
   * CONFIGURATION - Table and Column Names
   * ============================================
   * Modify these variables to adapt to schema changes
   */
  var CONFIG = {
    // Table names
    tables: {
      lineItem: 'x_gegis_uwm_dashbo_data_extraction_lineitem',
      submission: 'x_gegis_uwm_dashbo_submission',
      dataExtraction: 'x_gegis_uwm_dashbo_data_extraction',
      attachment: 'sys_attachment'
    },

    // Lineitem table columns
    lineItemColumns: {
      parent: 'parent',
      source: 'source',
      attachmentRef: 'documentname_attachment_sysid',
      fieldValue: 'field_value',
      qaOverrideValue: 'qa_override_value',
      dataVerification: 'data_verification',
      commentary: 'commentary',
      reason: 'reason',
      confidenceIndicator: 'confidence_indicator',
      sectionNameFinal: 'section_name_final',
      sequenceFinal: 'sequence_final',
      fieldNameFinal: 'field_name_final',
      validationError: 'validation_error'
    },

    // Submission table columns
    submissionColumns: {
      number: 'number',
      statusChoice: 'submission_status_choice',
      dataExtract: 'data_extract',
      lineOfBusiness: 'line_of_business_choice'
    },

    // Data extraction table columns
    dataExtractionColumns: {
      submission: 'submission',
      version: 'version',
      versionDisplayValue: 'version_display_value',
      active: 'active',
      discarded: 'discarded',
      sysCreatedOn: 'sys_created_on'
    },

    // Attachment settings
    attachment: {
      supportedContentTypes: ['application/pdf', 'application/octet-stream']
    },

    // Query limits
    // maxLineItems removed: line items are no longer capped (see fetchMapping line-item query).
    // An unordered setLimit truncated results before sorting and dropped fields; extractions
    // can exceed 500 (observed 874). Re-add a limit here only alongside the orderBy on that query.
    limits: {},

    // ============================================
    // EDITABLE STATUS CONFIGURATION
    // ============================================
    // Statuses in which Data Verification column becomes an input field (editable).
    // If submissionStatusChoice is NOT in this list, Data Verification shows as read-only text.
		dataVerificationEditStatuses: ['CHECK_FOR_DUPLICATES', 'CONFIRM_DATA_REVIEW', 'INSURED_VERIFICATION', 'DUPLICATE_CHECK', 'SANCTIONS_CHECK', 'DATA_EXTRACT_REVIEW'],
		

    // Statuses in which QA Override Value column becomes an input field (editable).
    // If submissionStatusChoice is NOT in this list, QA Override shows as read-only text.
    qaOverrideEditStatuses: ['QUALITY_ASSURANCE']
  };

  /* ============================================
   * HELPER FUNCTIONS
   * ============================================ */

  /**
   * Format file size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  function _formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Safely get value from GlideRecord
   * @param {GlideRecord} gr - GlideRecord object
   * @param {string} field - Field name
   * @returns {string} Field value or empty string
   */
  function _getValue(gr, field) {
    try {
      return gr.getValue(field) || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Get attachment data from sys_attachment table
   * @param {string} attachmentSysId - Attachment sys_id
   * @returns {object|null} Attachment data object or null
   */
  function _getAttachmentData(attachmentSysId) {
    if (!attachmentSysId) return null;

    var attachmentData = null;
    try {
      var attachmentGr = new GlideRecord(CONFIG.tables.attachment);
      attachmentGr.addQuery('sys_id', attachmentSysId);
      // Use IN operator for multiple content types
      attachmentGr.addQuery('content_type', 'IN', CONFIG.attachment.supportedContentTypes.join(','));
      attachmentGr.orderByDesc('sys_created_on');
      attachmentGr.setLimit(1);
      attachmentGr.query();

      if (attachmentGr.next()) {
        var sizeBytes = parseInt(_getValue(attachmentGr, 'size_bytes')) || 0;
        attachmentData = {
          sys_id: attachmentGr.getUniqueValue(),
          file_name: _getValue(attachmentGr, 'file_name'),
          content_type: _getValue(attachmentGr, 'content_type'),
          size_bytes: sizeBytes,
          size_formatted: _formatFileSize(sizeBytes),
          file_url: "/sys_attachment.do?sys_id=" + attachmentSysId
        };
      }
      return attachmentData;
    } catch (e) {
      gs.error('Error getting attachment data: ' + e.message);
      return null;
    }
  }

  /**
   * Parse confidence value to ensure it's between 0 and 1
   * @param {string} confidenceValue - Raw confidence value
   * @returns {number} Normalized confidence value
   */
  function _parseConfidence(confidenceValue) {
    try {
      // If no value from source, return empty string (leave blank in UI)
      if (confidenceValue === null || confidenceValue === undefined || confidenceValue === '') {
        return '';
      }
      var confidence = parseFloat(confidenceValue);
      if (isNaN(confidence)) {
        return '';
      }
      if (confidence > 1) {
        confidence = confidence / 100;
      }
      return confidence;
    } catch (e) {
      return '';
    }
  }

  /**
   * Parse order value (handles comma-formatted numbers like "1,010,101")
   * @param {string} orderStr - Order string value
   * @returns {number} Numeric order value
   */
  function _parseOrder(orderStr) {
    if (!orderStr) return 0;
    return parseFloat(orderStr.replace(/,/g, '')) || 0;
  }



  /* ============================================
   * INITIALIZE DATA OBJECT
   * ============================================ */
  data.success = false;
  data.error = '';
  data.mapping = [];

  // Pass editable status config to client
  data.config = {
    dataVerificationEditStatuses: CONFIG.dataVerificationEditStatuses,
    qaOverrideEditStatuses: CONFIG.qaOverrideEditStatuses
  };

  /* ============================================
   * ACTION HANDLER
   * ============================================ */
  gs.info('PDF-NAV DEBUG: === SERVER SCRIPT START ===');
  gs.info('PDF-NAV DEBUG: input=' + JSON.stringify(input));

  if (input && input.action) {
    gs.info('PDF-NAV DEBUG: Action received: "' + input.action + '"');
    try {
      switch (input.action) {
        case 'fetchMapping':
          gs.info('PDF-NAV DEBUG: Calling fetchMapping()');
          fetchMapping();
          break;
        case 'saveMapping':
          gs.info('PDF-NAV DEBUG: Calling saveMapping()');
          saveMapping();
          break;
        case 'markComplete':
          gs.info('PDF-NAV DEBUG: Calling markComplete()');
          markComplete();
          break
        default:
          gs.info('PDF-NAV DEBUG: Unknown action: ' + input.action);
          data.error = 'Unknown action: ' + input.action;
          data.success = false;
      }
    } catch (e) {
      gs.error('PDF-NAV ERROR: Server error: ' + e.message);
      data.error = 'Server error: ' + e.message;
      data.success = false;
      gs.error('Widget Server Script Error: ' + e.message);
    }
  } else {
    gs.info('PDF-NAV DEBUG: No action - widget load');
    // Default - widget load
    data.message = 'PDF Annotation Widget loaded successfully';
    data.success = true;
  }


  /* ============================================
   * UPDATE DATA TO SYSTEM FROM LINEITEM
   * ============================================
   * Retrieves all line items for the given submission
   * including all editable and display fields
   */
  function markComplete() {
    gs.info('PDF-NAV DEBUG: *** markComplete() ENTERED ***');
    data.success = false;
    var submissionNumber = input.submissionNumber;
    var dataExtractSysId = input.dataExtractSysId;
    gs.info('PDF-NAV DEBUG: submissionNumber=' + submissionNumber + ', dataExtractSysId=' + dataExtractSysId);

    if (!submissionNumber) {
      gs.info('PDF-NAV DEBUG: No submissionNumber provided, returning error');
      data.error = 'Submission Number is not provided';
      return;
    }

    // Reject completion when viewing a non-active data extraction version
    if (dataExtractSysId && !_isDataExtractionActive(dataExtractSysId)) {
      data.error = 'Cannot complete: this data extraction version is read-only. Switch to the active version to mark complete.';
      return;
    }

    try {
      gs.info('PDF-NAV DEBUG: Running AUDIT2MODEL for submission=' + submissionNumber);
      ExtractionHelper.dataFlowBetweenDataExtractAndModel(submissionNumber, ExtractionHelper.AUDIT2MODEL);
      gs.info('PDF-NAV DEBUG: AUDIT2MODEL completed successfully');

      data.success = true;
      data.message = 'Audit to Model completed successfully';
      gs.info('PDF-NAV DEBUG: *** markComplete() SUCCESS ***');
    } catch (e) {
      gs.error('PDF-NAV ERROR: markComplete (AUDIT2MODEL) failed: ' + e.message);
      data.error = 'Failed to complete: ' + e.message;
      return;
    }
  }

  /**
   * Get line_of_business value from submission by submission number
   * @param {string} submissionNumber - Submission number
   * @returns {string} line_of_business value or empty string
   */
  function _getSubmissionLineOfBusiness(submissionNumber) {
    try {
      gs.info('PDF-NAV DEBUG: Getting LOB for submissionNumber="' + submissionNumber + '"');
      gs.info('PDF-NAV DEBUG: Looking for column: "' + CONFIG.submissionColumns.lineOfBusiness + '"');

      var submissionGr = new GlideRecord(CONFIG.tables.submission);
      submissionGr.addQuery(CONFIG.submissionColumns.number, submissionNumber);
      submissionGr.setLimit(1);
      submissionGr.query();

      if (submissionGr.next()) {
        gs.info('PDF-NAV DEBUG: Found submission sys_id=' + submissionGr.getUniqueValue());

        // Try multiple ways to get the value
        var rawValue = submissionGr[CONFIG.submissionColumns.lineOfBusiness];
        var getValue = submissionGr.getValue(CONFIG.submissionColumns.lineOfBusiness);
        var displayValue = submissionGr.getDisplayValue(CONFIG.submissionColumns.lineOfBusiness);

        gs.info('PDF-NAV DEBUG: rawValue=' + rawValue);
        gs.info('PDF-NAV DEBUG: getValue=' + getValue);
        gs.info('PDF-NAV DEBUG: displayValue=' + displayValue);

        // Check if column exists
        var element = submissionGr.getElement(CONFIG.submissionColumns.lineOfBusiness);
        gs.info('PDF-NAV DEBUG: column exists=' + (element ? 'YES' : 'NO'));

        var lob = getValue || '';
        gs.info('PDF-NAV DEBUG: Returning line_of_business="' + lob + '"');
        return lob;
      }

      gs.info('PDF-NAV DEBUG: Submission NOT FOUND for number="' + submissionNumber + '"');
      return '';
    } catch (e) {
      gs.error('PDF-NAV ERROR: _getSubmissionLineOfBusiness failed: ' + e.message);
      return '';
    }
  }

  /**
   * Resolve which data_extraction record to load for a submission.
   * Returns versions list (newest first), the selected sys_id, and whether it is active.
   *
   * Selection priority:
   *   1. Explicit requestedSysId from input (verified to belong to the submission, not discarded)
   *   2. Most recent active=true extraction for the submission
   *   3. TODO(remove-after-migration): submission.data_extract pointer
   *   4. Most recent non-discarded extraction (will be loaded read-only since not active)
   *
   * @param {string} submissionSysId
   * @param {GlideRecord} submissionGr - already-positioned submission record
   * @param {string} requestedSysId - optional client-requested data_extraction sys_id
   * @returns {{ selectedSysId: string, isActive: boolean, versions: Array, error: string }}
   */
  function _resolveDataExtraction(submissionSysId, submissionGr, requestedSysId) {
    var result = { selectedSysId: '', isActive: false, versions: [], error: '' };

    var deTable = CONFIG.tables.dataExtraction;
    var deCols = CONFIG.dataExtractionColumns;

    // Build versions list (newest version first), excluding discarded
    var deGr = new GlideRecord(deTable);
    deGr.addQuery(deCols.submission, submissionSysId);
    //deGr.addQuery(deCols.discarded, '!=', true);
    deGr.orderByDesc(deCols.version);
    deGr.orderByDesc(deCols.sysCreatedOn);
    deGr.query();

    var activeSysId = '';
    while (deGr.next()) {
      var sysId = deGr.getUniqueValue();
      var isActive = deGr.getValue(deCols.active) === 'true' || deGr.getValue(deCols.active) === '1';
      var versionRaw = _getValue(deGr, deCols.version);
      var versionDisplay = _getValue(deGr, deCols.versionDisplayValue);
      result.versions.push({
        sys_id: sysId,
        version: parseInt(versionRaw, 10) || 0,
        version_display_value: versionDisplay,
        active: isActive,
        sys_created_on: _getValue(deGr, deCols.sysCreatedOn)
      });
      if (isActive && !activeSysId) activeSysId = sysId;
    }

    // 1. Explicit request — verify it belongs to this submission and is in versions list
    if (requestedSysId) {
      for (var i = 0; i < result.versions.length; i++) {
        if (result.versions[i].sys_id === requestedSysId) {
          result.selectedSysId = requestedSysId;
          result.isActive = result.versions[i].active;
          return result;
        }
      }
      result.error = 'Requested data extraction does not belong to this submission or has been discarded.';
      return result;
    }

    // 2. Active extraction
    if (activeSysId) {
      result.selectedSysId = activeSysId;
      result.isActive = true;
      return result;
    }

    // 3. TODO(remove-after-migration): fallback to legacy submission.data_extract pointer
    var legacyPtr = _getValue(submissionGr, CONFIG.submissionColumns.dataExtract);
    if (legacyPtr) {
      // Surface it in versions list if not already there (legacy record may pre-date version model)
      var inList = false;
      for (var j = 0; j < result.versions.length; j++) {
        if (result.versions[j].sys_id === legacyPtr) { inList = true; break; }
      }
      if (!inList) {
        result.versions.unshift({
          sys_id: legacyPtr,
          version: 0,
          version_display_value: '',
          active: false,
          sys_created_on: ''
        });
      }
      result.selectedSysId = legacyPtr;
      result.isActive = false; // Treat legacy fallback as read-only — no active flag set
      return result;
    }

    // 4. Most recent non-discarded — read-only since none are active
    if (result.versions.length > 0) {
      result.selectedSysId = result.versions[0].sys_id;
      result.isActive = false;
      return result;
    }

    result.error = 'No data extraction records found for this submission.';
    return result;
  }

  /**
   * Verify that a given data_extraction sys_id is currently active.
   * Used as a defense-in-depth guard for save/complete actions.
   * @param {string} dataExtractSysId
   * @returns {boolean}
   */
  function _isDataExtractionActive(dataExtractSysId) {
    if (!dataExtractSysId) return false;
    var deGr = new GlideRecord(CONFIG.tables.dataExtraction);
    if (!deGr.get(dataExtractSysId)) return false;
    if (deGr.getValue(CONFIG.dataExtractionColumns.discarded) === 'true') return false;
    var activeRaw = deGr.getValue(CONFIG.dataExtractionColumns.active);
    return activeRaw === 'true' || activeRaw === '1';
  }

  /* ============================================
   * FETCH MAPPING DATA
   * ============================================
   * Retrieves all line items for the given submission
   * joined with metadata table for field definitions.
   */
  function fetchMapping() {
    data.success = false;
    data.mapping = [];

    try {
      var submissionSysId = input.submissionSysId;
      if (!submissionSysId) {
        data.error = 'Submission ID is required';
        return;
      }

      // Get data_extract sys_id from submission
      var submissionGr = new GlideRecord(CONFIG.tables.submission);
      submissionGr.addQuery('sys_id', submissionSysId);
      submissionGr.setLimit(1);
      submissionGr.query();

      if (submissionGr.next()) {
        data.submissionNumber = _getValue(submissionGr, CONFIG.submissionColumns.number);
        data.submissionStatusChoice = _getValue(submissionGr, CONFIG.submissionColumns.statusChoice) || 'CONFIRM_DATA_REVIEW';
      } else {
        data.error = 'Submission not found';
        return;
      }

      // Resolve which data_extraction version to load
      var resolution = _resolveDataExtraction(submissionSysId, submissionGr, input.dataExtractSysId);
      if (resolution.error) {
        data.error = resolution.error;
        return;
      }

      var dataExtractSysId = resolution.selectedSysId;
      data.versions = resolution.versions;
      data.selectedDataExtract = {
        sys_id: dataExtractSysId,
        active: resolution.isActive
      };

      // Only sync model → audit when loading the active version. Historical versions are read-only.
      if (resolution.isActive) {
        try {
          gs.info('PDF-NAV DEBUG: Running MODEL2AUDIT for submission=' + data.submissionNumber);
          ExtractionHelper.dataFlowBetweenDataExtractAndModel(data.submissionNumber, ExtractionHelper.MODEL2AUDIT);
          gs.info('PDF-NAV DEBUG: MODEL2AUDIT completed successfully');
          data.model2auditCompleted = true;
        } catch (m2aError) {
          gs.error('PDF-NAV ERROR: MODEL2AUDIT failed: ' + m2aError.message);
          data.model2auditCompleted = false;
          // Non-blocking - continue loading data even if sync fails
        }
      } else {
        gs.info('PDF-NAV DEBUG: Skipping MODEL2AUDIT — selected version is not active (read-only view)');
        data.model2auditCompleted = false;
      }

      // Query line items
      // No setLimit: an extraction can legitimately have >500 line items (observed 874).
      // A capped, unordered query silently truncated the DB result BEFORE the JS sort below,
      // dropping an unpredictable subset of fields scattered across sections.
      // orderBy here makes the DB return rows in the intended order (deterministic even if a
      // cap is ever reintroduced) and matches the post-fetch sort at lineItems.sort().
      var lineItemGr = new GlideRecord(CONFIG.tables.lineItem);
      lineItemGr.addQuery(CONFIG.lineItemColumns.parent, dataExtractSysId);
      lineItemGr.orderBy(CONFIG.lineItemColumns.sequenceFinal);
      lineItemGr.orderBy(CONFIG.lineItemColumns.fieldNameFinal);
      lineItemGr.query();

      // Collect all line items
      var lineItems = [];

      while (lineItemGr.next()) {
        var source = _getValue(lineItemGr, CONFIG.lineItemColumns.source);
        var documentSysId = _getValue(lineItemGr, CONFIG.lineItemColumns.attachmentRef);
        var lineItemSysId = lineItemGr.getUniqueValue();

        // DEFAULT VALUES
        var sectionName = _getValue(lineItemGr, CONFIG.lineItemColumns.sectionNameFinal) || 'Uncategorized';

        // Exclude Location line items: skip any whose section_name_final STARTS WITH 'Locations'.
        // Strict prefix (case-sensitive) — done in JS because ServiceNow's NOT LIKE is a
        // "does not contain" match, which would over-exclude sections containing 'Locations'
        // mid-string. indexOf(...) === 0 is exact starts-with.
        if (sectionName.indexOf('Locations') === 0) {
          continue;
        }

        var fieldName = _getValue(lineItemGr, CONFIG.lineItemColumns.fieldNameFinal) || 'Unknown';
        var orderNumeric = _parseOrder(_getValue(lineItemGr, CONFIG.lineItemColumns.sequenceFinal));

        // BUILD LINE ITEM OBJECT
        var lineItem = {
          // Record identifier (from lineitem - used for updates)
          sys_id: lineItemSysId,
          _order: orderNumeric, // Internal use only for sorting

          // Display fields
          section_name: sectionName,
          field_name: fieldName,
          field_value: _getValue(lineItemGr, CONFIG.lineItemColumns.fieldValue),

          // Editable fields
          qa_override_value: _getValue(lineItemGr, CONFIG.lineItemColumns.qaOverrideValue),
          data_verification: _getValue(lineItemGr, CONFIG.lineItemColumns.dataVerification),
          commentary: _getValue(lineItemGr, CONFIG.lineItemColumns.commentary),
          logic_transparency: _getValue(lineItemGr, CONFIG.lineItemColumns.reason),

          // Confidence data
          confidence_indicator: _parseConfidence(_getValue(lineItemGr, CONFIG.lineItemColumns.confidenceIndicator)),

          // Coordinate and attachment data
          source: source,
          document_sys_id: documentSysId || null, // Always include for client-side diagnosis
          attachmentData: documentSysId ? _getAttachmentData(documentSysId) : null
        };

        // Attach debug info if enabled
        if (DEBUG.includeDebugData) {
          lineItem._debug = {
            lineItemSysId: lineItemSysId,
            sectionNameFinal: sectionName,
            fieldNameFinal: fieldName,
            sequenceFinal: _getValue(lineItemGr, CONFIG.lineItemColumns.sequenceFinal)
          };
        }

        lineItems.push(lineItem);
      }

      // Sort by order, then by alphabetical order
      lineItems.sort(function (a, b) {
        if (a._order !== b._order) {
          return a._order - b._order;
        }
        var nameA = (a.field_name || '').toLowerCase();
        var nameB = (b.field_name || '').toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      // Remove internal _order field before returning
      lineItems.forEach(function (item) {
        delete item._order;
      });

      data.mapping = lineItems;

      if (DEBUG.includeDebugData) {
        data.skippedFields = []; // Empty array since no filtering applied anymore
      }

      data.success = true;
      data.totalMappings = lineItems.length;

    } catch (e) {
      data.error = 'Error loading mapping: ' + e.message;
      gs.error('Widget fetchMapping error: ' + e.message);
    }
  }

  /* ============================================
   * SAVE MAPPING DATA
   * ============================================
   * Updates editable fields in lineitem table
   */
  function saveMapping() {
    data.success = false;
    data.updatedCount = 0;
    data.errors = [];

    try {
      var updates = input.updates;
      var submissionNumber = input.submissionNumber;
      var dataExtractSysId = input.dataExtractSysId;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        data.error = 'No updates provided';
        return;
      }

      // Reject saves against a non-active data extraction version (defense in depth — UI should already block this)
      if (dataExtractSysId && !_isDataExtractionActive(dataExtractSysId)) {
        data.error = 'Cannot save: this data extraction version is read-only.';
        return;
      }

      var updatedCount = 0;
      var errors = [];

      for (var i = 0; i < updates.length; i++) {
        var update = updates[i];

        if (!update.sys_id) {
          errors.push('Missing sys_id for update at index ' + i);
          continue;
        }

        try {
          var lineItemGr = new GlideRecord(CONFIG.tables.lineItem);
          if (lineItemGr.get(update.sys_id)) {
            if (update.hasOwnProperty('qa_override_value')) {
              lineItemGr.setValue(CONFIG.lineItemColumns.qaOverrideValue, update.qa_override_value || '');
            }
            if (update.hasOwnProperty('data_verification')) {
              lineItemGr.setValue(CONFIG.lineItemColumns.dataVerification, update.data_verification || '');
            }
            if (update.hasOwnProperty('commentary')) {
              lineItemGr.setValue(CONFIG.lineItemColumns.commentary, update.commentary || '');
            }
            lineItemGr.update();
            updatedCount++;
          } else {
            errors.push('Record not found: ' + update.sys_id);
          }
        } catch (updateError) {
          errors.push('Error updating ' + update.sys_id + ': ' + updateError.message);
        }
      }

      data.success = true;
      data.updatedCount = updatedCount;
      data.errors = errors;
      data.message = 'Successfully updated ' + updatedCount + ' record(s)';

      if (errors.length > 0) {
        data.message += ' with ' + errors.length + ' error(s)';
      }

      // Run field data-type validation after each save
      if (submissionNumber) {
        try {
          gs.info('PDF-NAV DEBUG: Running validation for submission=' + submissionNumber);
          ExtractionHelper.dataFlowBetweenDataExtractAndModel(submissionNumber, ExtractionHelper.VALIDATE);
          gs.info('PDF-NAV DEBUG: Validation completed successfully');

          // Read back validation_error for the saved records
          var validationErrors = {};
          for (var j = 0; j < updates.length; j++) {
            if (!updates[j].sys_id) continue;
            var vrGr = new GlideRecord(CONFIG.tables.lineItem);
            if (vrGr.get(updates[j].sys_id)) {
              var errVal = _getValue(vrGr, CONFIG.lineItemColumns.validationError);
              if (errVal) {
                validationErrors[updates[j].sys_id] = errVal;
              }
            }
          }
          data.validationErrors = validationErrors;
          gs.info('PDF-NAV DEBUG: Returned ' + Object.keys(validationErrors).length + ' validation error(s)');
        } catch (validateError) {
          gs.error('PDF-NAV ERROR: Validation failed after save: ' + validateError.message);
          // Validation failure is non-blocking - save already succeeded
          data.validationError = 'Validation step failed: ' + validateError.message;
        }
      } else {
        gs.warn('PDF-NAV WARN: submissionNumber not provided - skipping post-save validation');
      }

    } catch (e) {
      data.error = 'Error saving mapping: ' + e.message;
      gs.error('Widget saveMapping error: ' + e.message);
    }
  }

  // Add performance metrics
  data.serverTime = new Date().getTime();

})();