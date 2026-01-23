(function () {
  /* ============================================
   * PDF-NAV Widget Server Script
   * ============================================
   * Tables:
   * - x_gegis_uwm_dashbo_data_extraction_lineitem (editable data)
   * - x_gegis_uwm_dashbo_data_extraction_metadata (field definitions, read-only)
   * 
   * Column Mappings:
   * - metadata.model_label     -> Field Name
   * - lineitem.field_value     -> AI Value
   * - lineitem.data_verification -> Data Verification (editable)
   * - lineitem.qa_override_value -> QA Override Value (editable)
   * - lineitem.commentary      -> Commentary (editable)
   * 
   * Ordering: metadata.order
   * Grouping: metadata.section_name
   * ============================================ */

  // Table names
  var lineItemTableName = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
  var metadataTableName = 'x_gegis_uwm_dashbo_data_extraction_metadata';
  var submissionTableName = 'x_gegis_uwm_dashbo_submission';
  var sysAttachmentTable = 'sys_attachment';
  var supportedContentType = 'application/pdf';

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
      var attachmentGr = new GlideRecord(sysAttachmentTable);
      attachmentGr.addQuery('sys_id', attachmentSysId);
      attachmentGr.addQuery('content_type', supportedContentType);
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
      // Normalize if value is percentage (greater than 1)
      if (confidence > 1) {
        confidence = confidence / 100;
      }
      return confidence;
    } catch (e) {
      return 0;
    }
  }

  /* ============================================
   * INITIALIZE DATA OBJECT
   * ============================================ */
  data.success = false;
  data.error = '';
  data.documents = [];
  data.files = [];
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
   * 
   * Data sources:
   * - field_name: metadata.model_label
   * - field_value (AI value): lineitem.field_value
   * - data_verification: lineitem.data_verification
   * - qa_override_value: lineitem.qa_override_value
   * - commentary: lineitem.commentary
   * 
   * Ordering: metadata.order (or internal_field_seq for legacy records)
   * Grouping: metadata.section_name (or lineitem.new_section_name for legacy)
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
      var submissionGr = new GlideRecord(submissionTableName);
      submissionGr.addQuery('sys_id', submissionSysId);
      submissionGr.setLimit(1);
      submissionGr.query();

      // Get submission_status_choice to determine editable fields
      // 'CONFIRM_DATA_REVIEW' = Data Verification editable, QA Override readonly
      // 'QUALITY_ASSURANCE' = Data Verification readonly, QA Override editable

      if (submissionGr.next()) {
        data.submissionNumber = submissionGr.getValue('number');
        data.submissionStatusChoice = submissionGr.getValue('submission_status_choice') || 'CONFIRM_DATA_REVIEW';
      } else {
        data.error = 'Submission not found';
        return;
      }

      var dataExtractSysId = submissionGr.getValue('data_extract');
      if (!dataExtractSysId) {
        data.error = 'No data extract linked to submission';
        return;
      }

      // Query line items from x_gegis_uwm_dashbo_data_extraction_lineitem
      // Supports both new architecture (with metadata_id) and legacy records
      var lineItemGr = new GlideRecord(lineItemTableName);
      lineItemGr.addQuery('parent', dataExtractSysId);
      lineItemGr.setLimit(500);
      lineItemGr.query();

      // Collect all line items with their metadata
      var lineItems = [];
      while (lineItemGr.next()) {
        var metadataId = _getValue(lineItemGr, 'metadata_id');
        var source = _getValue(lineItemGr, 'source');
        var documentSysId = _getValue(lineItemGr, 'documentname_attachment_sysid');

        // Initialize field values with defaults from lineitem (for legacy compatibility)
        var sectionName = _getValue(lineItemGr, 'new_section_name') || _getValue(lineItemGr, 'section_name') || 'Uncategorized';
        var fieldName = _getValue(lineItemGr, 'field_name');
        var columnLabel = '';
        var orderValue = '0';
        var orderNumeric = parseInt(_getValue(lineItemGr, 'internal_field_seq')) || 0;

        // If metadata_id exists, try to get values from metadata table (new architecture)
        if (metadataId) {
          var metadataGr = new GlideRecord(metadataTableName);
          if (metadataGr.get(metadataId)) {
            // Override with metadata values
            sectionName = _getValue(metadataGr, 'section_name') || sectionName;
            fieldName = _getValue(metadataGr, 'model_label') || fieldName;
            columnLabel = _getValue(metadataGr, 'column_label') || '';
            orderValue = _getValue(metadataGr, 'order') || '0';
            // Parse order value (format: "1,010,101" - remove commas for numeric comparison)
            orderNumeric = parseFloat(orderValue.replace(/,/g, '')) || orderNumeric;
          }
        }

        lineItems.push({
          // Record identifier (from lineitem - used for updates)
          sys_id: lineItemGr.getUniqueValue(),
          parent: _getValue(lineItemGr, 'parent'),
          metadata_id: metadataId,

          // Display fields (from metadata if available, otherwise from lineitem)
          section_name: sectionName,
          new_section_name: sectionName,  // Alias for client script compatibility
          field_name: fieldName,
          column_label: columnLabel,
          order: orderValue,
          order_numeric: orderNumeric,

          // Data fields from lineitem table
          field_value: _getValue(lineItemGr, 'field_value'),        // AI Value

          // Editable fields from lineitem table
          qa_override_value: _getValue(lineItemGr, 'qa_override_value'),
          data_verification: _getValue(lineItemGr, 'data_verification'),
          commentary: _getValue(lineItemGr, 'commentary'),
          logic_transparency: _getValue(lineItemGr, 'reason'),

          // Confidence data from lineitem
          confidence_indicator: _parseConfidence(_getValue(lineItemGr, 'confidence_indicator')),
          section_confidence_avg: _getValue(lineItemGr, 'section_confidence_avg'),

          // Coordinate and attachment data (may be empty)
          source: source,
          attachmentData: documentSysId ? _getAttachmentData(documentSysId) : null
        });
      }

      // Sort by order (numeric comparison)
      lineItems.sort(function (a, b) {
        return a.order_numeric - b.order_numeric;
      });

      // Add sorted items to mapping
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
   * Updates the QA Override Value for line items
   * Expects input.updates as array of {sys_id, qa_override_value}
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

      // Process each update
      for (var i = 0; i < updates.length; i++) {
        var update = updates[i];

        if (!update.sys_id) {
          errors.push('Missing sys_id for update at index ' + i);
          continue;
        }

        try {
          var lineItemGr = new GlideRecord(lineItemTableName);
          if (lineItemGr.get(update.sys_id)) {
            // Update qa_override_value if provided
            if (update.hasOwnProperty('qa_override_value')) {
              lineItemGr.setValue('qa_override_value', update.qa_override_value || '');
            }
            // Update data_verification if provided
            if (update.hasOwnProperty('data_verification')) {
              lineItemGr.setValue('data_verification', update.data_verification || '');
            }
            // Update commentary if provided
            if (update.hasOwnProperty('commentary')) {
              lineItemGr.setValue('commentary', update.commentary || '');
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

      gs.info('PDF Widget: Saved ' + updatedCount + ' updates');

    } catch (e) {
      data.error = 'Error saving mapping: ' + e.message;
      gs.error('Widget saveMapping error: ' + e.message);
    }
  }

  // Add performance metrics
  data.serverTime = new Date().getTime();

})();