(function () {
  /* ============================================
   * PDF-NAV Widget Server Script
   * ============================================
   * Tables:
   * - x_gegis_uwm_dashbo_data_extraction_lineitem (editable data)
   * - x_gegis_uwm_dashbo_data_extraction_metadata (field definitions, read-only)
   * ============================================ */

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
      sectionConfidenceAvg: 'section_confidence_avg'
    },

    // Metadata table columns
    metadataColumns: {
      sectionName: 'section_name',
      modelLabel: 'model_label',
      columnLabel: 'column_label',
      order: 'order'
    },

    // Submission table columns
    submissionColumns: {
      number: 'number',
      statusChoice: 'submission_status_choice',
      dataExtract: 'data_extract'
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
  if (input && input.action) {
    try {
      switch (input.action) {
        case 'fetchMapping':
          fetchMapping();
          break;
        case 'saveMapping':
          saveMapping();
          break;
        case 'markComplete':
          markComplete();
          break
        default:
          data.error = 'Unknown action: ' + input.action;
          data.success = false;
      }
    } catch (e) {
      data.error = 'Server error: ' + e.message;
      data.success = false;
      gs.error('Widget Server Script Error: ' + e.message);
    }
  } else {
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
    data.success = false;
    var submissionNumber = input.submissionNumber;

    if (!submissionNumber) {
      data.error = 'Submission Number is not provided';
      return;
    }

    try {
      var extractUtils = new ExtractionUtils();
      var flatData = extractUtils.bulildJsonFromDataExtracLineItem(submissionNumber);
      var payloadBuilder = new SubmissionPayloadBuilder();
      var paylodModelStructure = payloadBuilder.buildSubmissionModel(flatData, submissionNumber, false);
      var updateddata = extractUtils.processSubmissionExtractionAndInsertData(paylodModelStructure, false);
      data.success = true;
    } catch (e) {
      data.error = 'Failed to update data to system';
      return;
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
        data.error = 'No data extract linked to submission';
        return;
      }

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

        // Get values from metadata table (new architecture)
        if (metadataId) {
          var metadataGr = new GlideRecord(CONFIG.tables.metadata);
          if (metadataGr.get(metadataId)) {
            sectionName = _getValue(metadataGr, CONFIG.metadataColumns.sectionName) || sectionName;
            fieldName = _getValue(metadataGr, CONFIG.metadataColumns.modelLabel) || fieldName;
            orderNumeric = _parseOrder(_getValue(metadataGr, CONFIG.metadataColumns.order));
          }
        }

        lineItems.push({
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
        });
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