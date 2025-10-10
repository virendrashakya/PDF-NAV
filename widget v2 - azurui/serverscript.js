(function() {
  // Get widget options
  data.canUpload = gs.hasRole('admin') || gs.hasRole('pdf_uploader');
  
  var attachmentTableName = 'x_gegis_uwm_dashbo_attachments';
	var submissionTableName = 'x_gegis_uwm_dashbo_submission';
	var sysAttachmentTable = 'sys_attachment';
	var supportedContentType = 'application/pdf';
  
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
	
	//Helper function to get URL
	function _getAttachmentData(attachmentSysId) {
		var attachmentData = null;
		try {
			var attachmentGr = new GlideRecord(sysAttachmentTable);
			attachmentGr.addQuery('sys_id', attachmentSysId);
			attachmentGr.addQuery('content_type', supportedContentType);
			attachmentGr.orderByDesc('sys_created_on');
			attachmentGr.setLimit(1); // Limit for performance
			attachmentGr.query();

			while (attachmentGr.next()) {
				var sizeBytes = parseInt(_getValue(attachmentGr, 'size_bytes')) || 0;

				attachmentData = {
					sys_id: attachmentGr.getUniqueValue(),
					file_name: _getValue(attachmentGr, 'file_name'),
					content_type: _getValue(attachmentGr, 'content_type'),
					size_bytes: sizeBytes,
					size_formatted: _formatFileSize(sizeBytes),
					file_url: "/sys_attachment.do?sys_id="+attachmentSysId,
				};
			}
			return attachmentData;
		} catch (e) {
			return attachmentData;
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
  
  // Fetch field mapping data
  function fetchMapping() {
    data.success = false;
    data.mapping = [];
    
    try {
      // Use provided extraction ID or default
      var submissionSysId = input.submissionSysId;
      submissionSysId = submissionSysId;
			
			//Query submission record
			var submissionGr = new GlideRecord(submissionTableName)

			submissionGr.addQuery('sys_id', submissionSysId);
			submissionGr.setLimit(1);
			submissionGr.query();

			submissionData = [];

			while(submissionGr.next()) {
				submissionData.push({
					data_extract_sys_id: submissionGr.getValue('data_extract')
				});
			}
      
      // Query mapping records
      var mappingGr = new GlideRecord('x_gegis_uwm_dashbo_data_extraction_lineitem');
      mappingGr.addQuery('parent', submissionData[0].data_extract_sys_id);
      mappingGr.addNotNullQuery('source');
			mappingGr.addNotNullQuery('documentname_attachment_sysid');
      mappingGr.addQuery('documentname_attachment_sysid', '!=', '');
			mappingGr.addQuery('source', '!=', '');
      mappingGr.orderBy('field_name');
      mappingGr.setLimit(500); // Limit for performance
      mappingGr.query();
      
      var count = 0;
      while (mappingGr.next()) {
        var source = _getValue(mappingGr, 'source');
				var documentSysId = _getValue(mappingGr, 'documentname_attachment_sysid');
				
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
						section_name: _getValue(mappingGr, 'section_name'),
            field_name: _getValue(mappingGr, 'field_name'),
            field_value: _getValue(mappingGr, 'field_value'),
						
            source: source,
						attachmentData: _getAttachmentData(documentSysId),
            confidence_indicator: confidence,
						section_confidence_avg: _getValue(mappingGr, 'section_confidence_avg'),
            parent: _getValue(mappingGr, 'parent')
          };
          
          data.mapping.push(mapping);
          count++;
        }
      }
      
      data.success = true;
      data.totalMappings = count;
      
      //gs.info('PDF Widget: Found ' + count + ' field mappings for parent: ');
      
    } catch (e) {
      data.error = 'Error loading mapping: ' + e.message;
      gs.error('Widget fetchMapping error: ' + e.message);
    }
  }
  
  // Add performance metrics
  data.serverTime = new Date().getTime();
  
})();