(function() {
  'use strict';
  
  // ==========================================
  // CONSTANTS & CONFIGURATION
  // ==========================================
  var CONSTANTS = {
    // Table Names
    TABLES: {
      ATTACHMENT: 'x_gegis_uwm_dashbo_attachments',
      SUBMISSION: 'x_gegis_uwm_dashbo_submission',
      SYS_ATTACHMENT: 'sys_attachment',
      DATA_EXTRACTION: 'x_gegis_uwm_dashbo_data_extraction_lineitem'
    },
    
    // Query Limits
    LIMITS: {
      MAX_QUERY_RESULTS: 500,
      MAX_FILE_SIZE_MB: 50,
      SINGLE_RESULT: 1
    },
    
    // Content Types
    CONTENT_TYPES: {
      PDF: 'application/pdf'
    },
    
    // Regular Expressions
    REGEX: {
      ATTACHMENT_SYS_ID: /sys_id=([a-f0-9]{32})/,
      D_STRING_FORMAT: /^D\(/
    },
    
    // File Size Units
    FILE_SIZE_UNITS: ['Bytes', 'KB', 'MB', 'GB'],
    FILE_SIZE_MULTIPLIER: 1024
  };
  
  // ==========================================
  // SECURITY & PERMISSIONS
  // ==========================================
  data.canUpload = gs.hasRole('admin') || gs.hasRole('pdf_uploader');
  
  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================
  
  /**
   * Format file size in bytes to human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size (e.g., "1.5 MB")
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) {
      return '0 Bytes';
    }
    
    var k = CONSTANTS.FILE_SIZE_MULTIPLIER;
    var sizes = CONSTANTS.FILE_SIZE_UNITS;
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Safely get value from GlideRecord
   * @param {GlideRecord} gr - GlideRecord instance
   * @param {string} field - Field name to retrieve
   * @returns {string} Field value or empty string
   */
  function getValue(gr, field) {
    try {
      return gr.getValue(field) || '';
    } catch (e) {
      gs.error('Error getting field "' + field + '": ' + e.message);
      return '';
    }
  }
  
  /**
   * Get attachment data by sys_id
   * @param {string} attachmentSysId - Attachment sys_id
   * @returns {Object|null} Attachment data object or null
   */
  function getAttachmentData(attachmentSysId) {
    if (!attachmentSysId) {
      return null;
    }
    
    var attachmentData = null;
    
    try {
      var attachmentGr = new GlideRecord(CONSTANTS.TABLES.SYS_ATTACHMENT);
      attachmentGr.addQuery('sys_id', attachmentSysId);
      attachmentGr.addQuery('content_type', CONSTANTS.CONTENT_TYPES.PDF);
      attachmentGr.orderByDesc('sys_created_on');
      attachmentGr.setLimit(CONSTANTS.LIMITS.SINGLE_RESULT);
      attachmentGr.query();
      
      if (attachmentGr.next()) {
        var sizeBytes = parseInt(getValue(attachmentGr, 'size_bytes')) || 0;
        
        attachmentData = {
          sys_id: attachmentGr.getUniqueValue(),
          file_name: getValue(attachmentGr, 'file_name'),
          content_type: getValue(attachmentGr, 'content_type'),
          size_bytes: sizeBytes,
          size_formatted: formatFileSize(sizeBytes),
          file_url: '/sys_attachment.do?sys_id=' + attachmentSysId
        };
      }
    } catch (e) {
      gs.error('Error fetching attachment data: ' + e.message);
    }
    
    return attachmentData;
  }
  
  /**
   * Parse and validate confidence indicator value
   * @param {string|number} confidenceValue - Confidence value (0-1 or 0-100)
   * @returns {number} Normalized confidence (0-1)
   */
  function parseConfidence(confidenceValue) {
    var confidence = 0;
    
    try {
      confidence = parseFloat(confidenceValue) || 0;
      
      // Normalize if value is percentage (>1)
      if (confidence > 1) {
        confidence = confidence / 100;
      }
      
      // Clamp between 0 and 1
      confidence = Math.max(0, Math.min(1, confidence));
    } catch (e) {
      gs.warn('Error parsing confidence value "' + confidenceValue + '": ' + e.message);
      confidence = 0;
    }
    
    return confidence;
  }
  
  /**
   * Validate D-string format
   * @param {string} source - Source coordinate string
   * @returns {boolean} True if valid D-string format
   */
  function isValidDString(source) {
		// returning all source if it is blank
		if ((source == '') || (source == undefined)) {
			return source
		}
    return source && CONSTANTS.REGEX.D_STRING_FORMAT.test(source);
  }
  
  /**
   * Handle and log errors consistently
   * @param {string} action - Action being performed
   * @param {Error} error - Error object
   * @param {string} [additionalContext] - Additional context for debugging
   */
  function handleError(action, error, additionalContext) {
    var errorMsg = 'PDF Widget - ' + action + ' error: ' + error.message;
    
    if (additionalContext) {
      errorMsg += ' | Context: ' + additionalContext;
    }
    
    data.error = 'Error in ' + action + ': ' + error.message;
    data.success = false;
    
    gs.error(errorMsg);
  }
  
  // ==========================================
  // INITIALIZATION
  // ==========================================
  data.success = false;
  data.error = '';
  data.documents = [];
  data.files = [];
  data.mapping = [];
  
  // ==========================================
  // ACTION HANDLERS
  // ==========================================
  
  /**
   * Fetch field mapping data for a submission
   */
  function fetchMapping() {
    data.success = false;
    data.mapping = [];
    
    try {
      var submissionSysId = input.submissionSysId;
      
      if (!submissionSysId) {
        data.error = 'Missing submissionSysId parameter';
        return;
      }
      
      // Query submission record to get data extract reference
      var submissionGr = new GlideRecord(CONSTANTS.TABLES.SUBMISSION);
      submissionGr.addQuery('sys_id', submissionSysId);
      submissionGr.setLimit(CONSTANTS.LIMITS.SINGLE_RESULT);
      submissionGr.query();
      
      if (!submissionGr.next()) {
        data.error = 'Submission not found: ' + submissionSysId;
        return;
      }
      
      var dataExtractSysId = submissionGr.getValue('data_extract');
      
      if (!dataExtractSysId) {
        data.error = 'No data extract linked to submission';
        return;
      }
      
      // Query mapping records
      var mappingGr = new GlideRecord(CONSTANTS.TABLES.DATA_EXTRACTION);
      mappingGr.addQuery('parent', dataExtractSysId);
      // mappingGr.addNotNullQuery('source');
      mappingGr.addNotNullQuery('documentname_attachment_sysid');
      mappingGr.addQuery('documentname_attachment_sysid', '!=', '');
      // mappingGr.addQuery('source', '!=', '');
      mappingGr.orderBy('field_name');
      mappingGr.setLimit(CONSTANTS.LIMITS.MAX_QUERY_RESULTS);
      mappingGr.query();
      
      var count = 0;
      
      while (mappingGr.next()) {
        var source = getValue(mappingGr, 'source');
        var documentSysId = getValue(mappingGr, 'documentname_attachment_sysid');
        
        // Only include valid D-string coordinates
        if (isValidDString(source)) {
          var confidenceValue = getValue(mappingGr, 'confidence_indicator');
          var confidence = parseConfidence(confidenceValue);
          
          var mapping = {
            sys_id: mappingGr.getUniqueValue(),
            section_name: getValue(mappingGr, 'section_name'),
            field_name: getValue(mappingGr, 'field_name'),
            field_value: getValue(mappingGr, 'field_value'),
            source: source,
            attachmentData: getAttachmentData(documentSysId),
            confidence_indicator: confidence,
            section_confidence_avg: getValue(mappingGr, 'section_confidence_avg'),
            parent: getValue(mappingGr, 'parent')
          };
          
          // Only add if we successfully retrieved attachment data
          if (mapping.attachmentData) {
            data.mapping.push(mapping);
            count++;
          }
        }
      }
      
      data.success = true;
      data.totalMappings = count;
      
      gs.info('PDF Widget: Fetched ' + count + ' field mappings for submission ' + submissionSysId);
      
    } catch (e) {
      handleError('fetchMapping', e, 'submissionSysId: ' + input.submissionSysId);
    }
  }
  
  /**
   * Save or update a field
   */
  function saveField() {
    data.success = false;
    data.sys_id = '';
    
    try {
      if (!input.field) {
        data.error = 'No field data provided';
        return;
      }
      
      var field = input.field;
      var gr;
      var isUpdate = field.sys_id && field.sys_id.indexOf('temp_') !== 0;
      
      if (isUpdate) {
        // Update existing field
        gr = new GlideRecord(CONSTANTS.TABLES.DATA_EXTRACTION);
        
        if (gr.get(field.sys_id)) {
          gr.setValue('field_name', field.field_name);
          gr.setValue('field_value', field.field_value);
          gr.setValue('source', field.source);
          gr.setValue('section_name', field.section_name);
          gr.setValue('confidence_indicator', field.confidence);
          
          gr.update();
          
          data.sys_id = gr.getUniqueValue();
          data.success = true;
          
          gs.info('PDF Widget: Updated field ' + field.field_name + ' (sys_id: ' + data.sys_id + ')');
        } else {
          data.error = 'Field not found: ' + field.sys_id;
        }
      } else {
        // Create new field
        gr = new GlideRecord(CONSTANTS.TABLES.DATA_EXTRACTION);
        gr.initialize();
        
        // Set parent reference from submission
        if (field.submission_sys_id) {
          var submissionGr = new GlideRecord(CONSTANTS.TABLES.SUBMISSION);
          
          if (submissionGr.get(field.submission_sys_id)) {
            gr.setValue('parent', submissionGr.getValue('data_extract'));
          }
        }
        
        // Set field values
        gr.setValue('field_name', field.field_name);
        gr.setValue('field_value', field.field_value);
        gr.setValue('source', field.source);
        gr.setValue('section_name', field.section_name);
        gr.setValue('confidence_indicator', field.confidence);
        
        // Handle attachment reference from document URL
        if (field.document_url) {
          var match = field.document_url.match(CONSTANTS.REGEX.ATTACHMENT_SYS_ID);
          
          if (match && match[1]) {
            gr.setValue('documentname_attachment_sysid', match[1]);
          }
        }
        
        var newSysId = gr.insert();
        
        if (newSysId) {
          data.sys_id = newSysId;
          data.success = true;
          
          gs.info('PDF Widget: Created field ' + field.field_name + ' (sys_id: ' + newSysId + ')');
        } else {
          data.error = 'Failed to create field';
        }
      }
    } catch (e) {
      handleError('saveField', e, 'field_name: ' + (input.field ? input.field.field_name : 'unknown'));
    }
  }
  
  /**
   * Delete a field by sys_id
   */
  function deleteField() {
    data.success = false;
    
    try {
      if (!input.fieldId) {
        data.error = 'No field ID provided';
        return;
      }
      
      var gr = new GlideRecord(CONSTANTS.TABLES.DATA_EXTRACTION);
      
      if (gr.get(input.fieldId)) {
        var fieldName = gr.getValue('field_name');
        
        if (gr.deleteRecord()) {
          data.success = true;
          gs.info('PDF Widget: Deleted field ' + fieldName + ' (sys_id: ' + input.fieldId + ')');
        } else {
          data.error = 'Failed to delete field';
        }
      } else {
        data.error = 'Field not found: ' + input.fieldId;
      }
    } catch (e) {
      handleError('deleteField', e, 'fieldId: ' + input.fieldId);
    }
  }
  
  // ==========================================
  // MAIN EXECUTION
  // ==========================================
  if (input && input.action) {
    try {
      switch (input.action) {
        case 'fetchMapping':
          fetchMapping();
          break;
        case 'saveField':
          saveField();
          break;
        case 'deleteField':
          deleteField();
          break;
        default:
          data.error = 'Unknown action: ' + input.action;
          data.success = false;
          gs.warn('PDF Widget: Unknown action requested: ' + input.action);
      }
    } catch (e) {
      handleError('main execution', e, 'action: ' + input.action);
    }
  } else {
    // Default action - return initial data
    data.message = 'PDF Annotation Widget loaded successfully';
    data.success = true;
  }
  
  // Add performance metrics
  data.serverTime = new Date().getTime();
  
})();

