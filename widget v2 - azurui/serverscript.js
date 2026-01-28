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
      metadata: 'x_gegis_uwm_dashbo_data_extraction_metadata',
      submission: 'x_gegis_uwm_dashbo_submission',
      attachment: 'sys_attachment'
    },

    // Lineitem table columns
    lineItemColumns: {
      parent: 'parent',
      metadataRef: 'metadata_id',
      source: 'source',
      attachmentRef: 'documentname_attachment_sysid',
      fieldValue: 'field_value',
      qaOverrideValue: 'qa_override_value',
      dataVerification: 'data_verification',
      commentary: 'commentary',
      reason: 'reason',
      confidenceIndicator: 'confidence_indicator',
      sectionConfidenceAvg: 'section_confidence_avg',
      tableField: 'table_field',
      key: 'key'
    },

    // Metadata table columns
    metadataColumns: {
      sectionName: 'section_name',
      modelLabel: 'model_label',
      columnLabel: 'column_label',
      order: 'order',
      lob: 'lob',
      version: 'version'
    },

    // Line of Business to Metadata LOB mapping
    // Maps submission.line_of_business_choice value to metadata lob filter and version
    // Values are UPPERCASE as stored in the database
    lobMapping: {
      'AUTO': { lobContains: '(AU)', version: null },
      'PROPERTY': { lobContains: '(PR)', version: null },
      'GENERAL_LIABILITY': { lobContains: '(GL)', version: null }
    },

    // Submission table columns
    submissionColumns: {
      number: 'number',
      statusChoice: 'submission_status_choice',
      dataExtract: 'data_extract',
      lineOfBusiness: 'line_of_business_choice'
    },

    // Attachment settings
    attachment: {
      supportedContentType: 'application/pdf'
    },

    // Query limits
    limits: {
      maxLineItems: 500
    }
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
      attachmentGr.addQuery('content_type', CONFIG.attachment.supportedContentType);
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
      var confidence = parseFloat(confidenceValue) || 0;
      if (confidence > 1) {
        confidence = confidence / 100;
      }
      return confidence;
    } catch (e) {
      return 0;
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
    gs.info('PDF-NAV DEBUG: submissionNumber=' + submissionNumber);

    if (!submissionNumber) {
      gs.info('PDF-NAV DEBUG: No submissionNumber provided, returning error');
      data.error = 'Submission Number is not provided';
      return;
    }

    try {
      gs.info('PDF-NAV DEBUG: Getting line_of_business...');
      // Get line_of_business from submission to determine which method to use
      var lineOfBusiness = _getSubmissionLineOfBusiness(submissionNumber);
      gs.info('PDF-NAV DEBUG: lineOfBusiness="' + lineOfBusiness + '"');

      gs.info('PDF-NAV DEBUG: Creating ExtractionUtils...');
      var extractUtils = new ExtractionUtils();

      gs.info('PDF-NAV DEBUG: Building JSON from line items...');
      var flatData = extractUtils.bulildJsonFromDataExtracLineItem(submissionNumber);
      gs.info('PDF-NAV DEBUG: flatData built successfully');

      gs.info('PDF-NAV DEBUG: Creating SubmissionPayloadBuilder...');
      var payloadBuilder = new SubmissionPayloadBuilder();

      // Use different method based on line_of_business
      var paylodModelStructure;
      if (lineOfBusiness === 'AUTO') {
        gs.info('PDF-NAV DEBUG: LOB is Auto - calling buildAutoSubmissionModel()');
        // Use Auto submission model for Auto line of business
        paylodModelStructure = payloadBuilder.buildAutoSubmissionModel(flatData, submissionNumber, false);
      } else {
        gs.info('PDF-NAV DEBUG: LOB is NOT Auto ("' + lineOfBusiness + '") - calling buildSubmissionModel()');
        // Use standard submission model for Property, General Liability, or other
        paylodModelStructure = payloadBuilder.buildSubmissionModel(flatData, submissionNumber, false);
      }
      gs.info('PDF-NAV DEBUG: Payload model built successfully');

      gs.info('PDF-NAV DEBUG: Processing submission extraction...');
      var updateddata = extractUtils.processSubmissionExtractionAndInsertData(paylodModelStructure, false);
      gs.info('PDF-NAV DEBUG: processSubmissionExtractionAndInsertData completed');

      data.success = true;
      gs.info('PDF-NAV DEBUG: *** markComplete() SUCCESS ***');
    } catch (e) {
      gs.error('PDF-NAV ERROR: markComplete failed: ' + e.message);
      data.error = 'Failed to update data to system';
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

      var dataExtractSysId = _getValue(submissionGr, CONFIG.submissionColumns.dataExtract);
      if (!dataExtractSysId) {
        data.error = 'This submission (#' + data.submissionNumber + ') does not have a Data Extract reference. Please ensure the submission record has a valid Data Extract linked before proceeding.';
        return;
      }

      // Get line_of_business from submission to determine filter
      var lineOfBusiness = _getValue(submissionGr, CONFIG.submissionColumns.lineOfBusiness);
      var lobFilter = CONFIG.lobMapping[lineOfBusiness] || null;

      // DEBUG: Log LOB filter being used
      gs.info('PDF-NAV: line_of_business="' + lineOfBusiness + '", filter=' + JSON.stringify(lobFilter));

      // Query line items
      var lineItemGr = new GlideRecord(CONFIG.tables.lineItem);
      lineItemGr.addQuery(CONFIG.lineItemColumns.parent, dataExtractSysId);
      lineItemGr.setLimit(CONFIG.limits.maxLineItems);
      lineItemGr.query();

      // Collect all line items with their metadata
      var lineItems = [];
      while (lineItemGr.next()) {
        var metadataId = _getValue(lineItemGr, CONFIG.lineItemColumns.metadataRef);
        var source = _getValue(lineItemGr, CONFIG.lineItemColumns.source);
        var documentSysId = _getValue(lineItemGr, CONFIG.lineItemColumns.attachmentRef);

        // Initialize with defaults
        var sectionName = 'Uncategorized';
        var fieldName = '';
        var orderNumeric = 0;

        // Get values from metadata table and apply LOB-based filter
        var includeField = false;
        if (metadataId) {
          var metadataGr = new GlideRecord(CONFIG.tables.metadata);
          if (metadataGr.get(metadataId)) {
            // Get lob and version values for filtering
            var dbLob = _getValue(metadataGr, CONFIG.metadataColumns.lob);
            var dbVersion = _getValue(metadataGr, CONFIG.metadataColumns.version);

            // Apply filter based on line_of_business
            if (lobFilter) {
              // Check if metadata lob contains the required LOB code
              var lobMatches = dbLob && dbLob.indexOf(lobFilter.lobContains) !== -1;
              // Check version if specified in filter
              var versionMatches = !lobFilter.version || dbVersion === lobFilter.version;

              if (lobMatches && versionMatches) {
                includeField = true;
              }
            } else {
              // No line_of_business or unknown value - include all fields with metadata
              includeField = true;
            }

            if (includeField) {
              sectionName = _getValue(metadataGr, CONFIG.metadataColumns.sectionName) || sectionName;

              // Get raw values for debugging
              var tableFieldRaw = _getValue(lineItemGr, CONFIG.lineItemColumns.tableField);
              var lineItemKey = _getValue(lineItemGr, CONFIG.lineItemColumns.key);
              var modelLabel = _getValue(metadataGr, CONFIG.metadataColumns.modelLabel);

              // Check if table_field is true - if so, use lineitem.key; otherwise use metadata.model_label
              var isTableField = tableFieldRaw === 'true' || tableFieldRaw === '1';

              if (isTableField && lineItemKey) {
                // Use key from lineitem for table fields (only if key has a value)
                fieldName = lineItemKey;
              } else {
                // Use model_label from metadata (default/fallback)
                fieldName = modelLabel || fieldName;
              }

              orderNumeric = _parseOrder(_getValue(metadataGr, CONFIG.metadataColumns.order));
            }
          }
        }

        // Skip this line item if it doesn't match the filter criteria
        if (!includeField) {
          continue;
        }

        var lineItem = {
          // Record identifier (from lineitem - used for updates)
          sys_id: lineItemGr.getUniqueValue(),
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
          attachmentData: documentSysId ? _getAttachmentData(documentSysId) : null
        };

        // Conditionally add debug info (controlled by DEBUG.includeDebugData)
        if (DEBUG.includeDebugData) {
          lineItem._debug = {
            tableFieldRaw: tableFieldRaw,
            isTableField: isTableField,
            lineItemKey: lineItemKey,
            modelLabel: modelLabel
          };
        }

        lineItems.push(lineItem);
      }

      // Sort by order
      lineItems.sort(function (a, b) {
        return a._order - b._order;
      });

      // Remove internal _order field before returning
      lineItems.forEach(function (item) {
        delete item._order;
      });

      data.mapping = lineItems;
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

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        data.error = 'No updates provided';
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

    } catch (e) {
      data.error = 'Error saving mapping: ' + e.message;
      gs.error('Widget saveMapping error: ' + e.message);
    }
  }

  // Add performance metrics
  data.serverTime = new Date().getTime();

})();