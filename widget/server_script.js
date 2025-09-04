(function() {
  // Get widget options
  data.canUpload = gs.hasRole('admin') || gs.hasRole('pdf_uploader');
  
  var attachmentTableName = 'x_gegis_uwm_dashbo_attachments';
  var DEFAULT_TABLE_SYS_ID = 'da8db510fbbfa290b70efc647befdccd';
  var DEFAULT_PARENT_SYS_ID = '0043f20593672250ce18b5d97bba10cc';
  
  // Helper function to format file size
  function _formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Helper function to safely get value
  function _getValue(gr, field) {
    try {
      return gr.getValue(field) || '';
    } catch (e) {
      return '';
    }
  }
  
  // Initialize data object
  data.success = false;
  data.error = '';
  data.documents = [];
  data.files = [];
  data.mapping = [];
  
  // Handle different actions
  if (input && input.action) {
    try {
      switch (input.action) {
        case 'getDocuments':
          getDocuments();
          break;
        case 'loadDocument':
          loadDocument();
          break;
        case 'fetchMapping':
          fetchMapping();
          break;
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
    // Default action - return initial data
    data.message = 'PDF Annotation Widget loaded successfully';
    data.success = true;
  }
  
  // Get list of documents
  function getDocuments() {
    data.documents = [];
    data.success = false;
    
    try {
      // Use provided IDs or defaults
      var tableSysId = DEFAULT_TABLE_SYS_ID || input.docSysID;
      
      var attachmentGr = new GlideRecord('sys_attachment');
      attachmentGr.addQuery('table_sys_id', tableSysId);
      attachmentGr.addQuery('content_type', 'application/pdf');
      attachmentGr.orderByDesc('sys_created_on');
      attachmentGr.setLimit(100); // Limit for performance
      attachmentGr.query();
      
      var count = 0;
      while (attachmentGr.next()) {
        var sizeBytes = parseInt(_getValue(attachmentGr, 'size_bytes')) || 0;
        
        var docData = {
          sys_id: attachmentGr.getUniqueValue(),
          file_name: _getValue(attachmentGr, 'file_name'),
          content_type: _getValue(attachmentGr, 'content_type'),
          size_bytes: sizeBytes,
          size_formatted: _formatFileSize(sizeBytes),
          created_by: _getValue(attachmentGr, 'sys_created_by'),
          created_on: _getValue(attachmentGr, 'sys_created_on')
        };
        
        data.documents.push(docData);
        count++;
      }
      
      data.success = true;
      data.totalDocuments = count;
      
      // Log for debugging
      gs.info('PDF Widget: Found ' + count + ' documents for table_sys_id: ' + tableSysId);
      
    } catch (e) {
      data.error = 'Error retrieving documents: ' + e.message;
      gs.error('Widget getDocuments error: ' + e.message);
    }
  }
  
  // Load specific document
  function loadDocument() {
    data.success = false;
    data.pdfUrl = '';
    
    if (!input.documentId) {
      data.error = 'No document ID provided';
      return;
    }
    
    try {
      var documentGr = new GlideRecord('sys_attachment');
      if (documentGr.get(input.documentId)) {
        // Generate secure download URL
        var attachmentSysId = documentGr.getUniqueValue();
        
        // Use GlideSysAttachment for secure URL generation
        var sa = new GlideSysAttachment();
        
        // Build the download URL
        data.pdfUrl = '/sys_attachment.do?sys_id=' + attachmentSysId;
        
        // Add additional metadata
        data.documentInfo = {
          sys_id: attachmentSysId,
          file_name: _getValue(documentGr, 'file_name'),
          size_bytes: parseInt(_getValue(documentGr, 'size_bytes')) || 0,
          content_type: _getValue(documentGr, 'content_type')
        };
        
        data.success = true;
        
        gs.info('PDF Widget: Loading document - ' + data.documentInfo.file_name);
      } else {
        data.error = 'Document not found';
      }
    } catch (e) {
      data.error = 'Error loading document: ' + e.message;
      gs.error('Widget loadDocument error: ' + e.message);
    }
  }
  
  // Fetch field mapping data
  function fetchMapping() {
    data.success = false;
    data.mapping = [];
    
    try {
      // Use provided extraction ID or default
      var extractionSysId = input.extractionSysId;
      var parentSysId = extractionSysId || DEFAULT_PARENT_SYS_ID;
      
      // Query mapping records
      var mappingGr = new GlideRecord('x_gegis_uwm_dashbo_data_extraction_lineitem');
      mappingGr.addQuery('parent', parentSysId);
      mappingGr.addNotNullQuery('source');
      mappingGr.addQuery('source', '!=', '');
      mappingGr.orderBy('field_name');
      mappingGr.setLimit(500); // Limit for performance
      mappingGr.query();
      
      var count = 0;
      while (mappingGr.next()) {
        var source = _getValue(mappingGr, 'source');
        
        // Only include valid coordinate strings
        if (source && source.indexOf('D(') === 0) {
          var confidenceValue = _getValue(mappingGr, 'confidence_indicator');
          var confidence = 0;
          
          // Parse confidence value
          try {
            confidence = parseFloat(confidenceValue) || 0;
            // Ensure confidence is between 0 and 1
            if (confidence > 1) {
              confidence = confidence / 100;
            }
          } catch (e) {
            confidence = 0;
          }
          
          var mapping = {
            sys_id: mappingGr.getUniqueValue(),
            field_name: _getValue(mappingGr, 'field_name'),
            field_value: _getValue(mappingGr, 'field_value'),
            source: source,
            confidence_indicator: confidence,
            parent: _getValue(mappingGr, 'parent')
          };
          
          data.mapping.push(mapping);
          count++;
        }
      }
      
      data.success = true;
      data.totalMappings = count;
      
      gs.info('PDF Widget: Found ' + count + ' field mappings for parent: ' + parentSysId);
      
    } catch (e) {
      data.error = 'Error loading mapping: ' + e.message;
      gs.error('Widget fetchMapping error: ' + e.message);
    }
  }
  
  // Add performance metrics
  data.serverTime = new Date().getTime();
  
})();
