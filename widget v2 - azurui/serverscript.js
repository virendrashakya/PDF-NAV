(function () {
  /* ============================================
   * PDF-NAV Widget Server Script
   * ============================================
   * Table: x_gegis_uwm_dashbo_data_extraction_lineitem
   * 
   * Column Mappings:
   * - field_name         -> Field Name
   * - field_value        -> AI Value
   * - commentary         -> Commentary
   * - qa_override_value     -> QA Override Value (editable)
   * - data_verification  -> Data Verification
   * - logic_transparency -> Logic Transparency
   * ============================================ */

  // Table names
  var lineItemTableName = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
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
   * including all editable and display fields
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
        //data.submissionNumber = _getValue(submissionGr, 'number');
        //data.submissionStatusChoice = _getValue(submissionGr, 'submission_status_choice') || 'CONFIRM_DATA_REVIEW';	
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
      // Include all records regardless of source or attachment data
      var lineItemGr = new GlideRecord(lineItemTableName);

      //lineItemGr.addNotNullQuery('source');
      //lineItemGr.addNotNullQuery('documentname_attachment_sysid');
      //lineItemGr.addQuery('documentname_attachment_sysid', '!=', '');
      //lineItemGr.addQuery('source', '!=', '');

      lineItemGr.addNotNullQuery('section_name');

      lineItemGr.addQuery('parent', dataExtractSysId);
      lineItemGr.orderBy('new_section_name');
      lineItemGr.orderBy('field_name');
      lineItemGr.setLimit(500);
      lineItemGr.query();

      var count = 0;
      while (lineItemGr.next()) {
        var source = _getValue(lineItemGr, 'source');
        var documentSysId = _getValue(lineItemGr, 'documentname_attachment_sysid');

        // Include all records, even those without coordinates or attachments
        var mapping = {
          // Record identifier
          sys_id: lineItemGr.getUniqueValue(),
          parent: _getValue(lineItemGr, 'parent'),

          // Display fields
          section_name: _getValue(lineItemGr, 'section_name'),
          new_section_name: _getValue(lineItemGr, 'new_section_name'),
          field_name: _getValue(lineItemGr, 'field_name'),           // Field Name
          field_value: _getValue(lineItemGr, 'field_value'),         // AI Value

          // Editable fields
          qa_override_value: _getValue(lineItemGr, 'qa_override_value'),   // QA Override Value
          data_verification: _getValue(lineItemGr, 'data_verification'), // Data Verification
          commentary: _getValue(lineItemGr, 'commentary'),           // Commentary
          logic_transparency: _getValue(lineItemGr, 'reason'), // Logic Transparency

          // Confidence data
          confidence_indicator: _parseConfidence(_getValue(lineItemGr, 'confidence_indicator')),
          section_confidence_avg: _getValue(lineItemGr, 'section_confidence_avg'),

          // Coordinate and attachment data (may be empty)
          source: source,
          attachmentData: documentSysId ? _getAttachmentData(documentSysId) : null
        };

        data.mapping.push(mapping);
        count++;
      }

      data.success = true;
      data.totalMappings = count;
      gs.info('PDF Widget: Loaded ' + count + ' field mappings');

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