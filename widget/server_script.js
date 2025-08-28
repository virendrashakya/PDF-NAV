(function() {
    /* Initialize data object */
    data.documents = [];
    data.error = '';
    
    try {
        // Initialize widget options
        data.options = {
            allowedFileTypes: gs.getProperty('x_pdf_eyeball.allowed_file_types', 'pdf'),
            maxFileSize: parseInt(gs.getProperty('x_pdf_eyeball.max_file_size', '10')) * 1024 * 1024, // Convert MB to bytes
            enableAdvancedMode: gs.getProperty('x_pdf_eyeball.enable_advanced_mode', 'true') === 'true'
        };
    
    // Add any server-side helper functions
    if (input.action === 'uploadFile') {
        data.result = handleFileUpload();
    } else if (input.action === 'getDocuments') {
        data.result = getDocuments();
    }
    
    function handleFileUpload() {
        try {
            if (!input.pdfFile || !input.jsonData) {
                throw new Error('Both PDF file and JSON data are required');
            }

            // Create GlideRecord for the PDF annotation documents table
            var gr = new GlideRecord('x_gegis_uwm_dashbo_pdf_annotation_docs');
            gr.initialize();
            
            // Set the attachment
            var sa = new GlideSysAttachment();
            var attachmentId = sa.write(gr, input.pdfFile.name, input.pdfFile.type, input.pdfFile.data);
            
            if (!attachmentId) {
                throw new Error('Failed to upload PDF file');
            }

            // Set other fields
            gr.json_data = input.jsonData;
            gr.active = true;
            
            // Insert the record
            var sysId = gr.insert();
            
            if (!sysId) {
                // If insert fails, cleanup the attachment
                sa.deleteAttachment(attachmentId);
                throw new Error('Failed to create record');
            }

            return {
                success: true,
                message: 'File uploaded successfully',
                sysId: sysId,
                attachmentId: attachmentId
            };
        } catch (e) {
            gs.error('Error in PDF Eyeball widget file upload: ' + e.message);
            return {
                success: false,
                message: 'Error uploading file: ' + e.message
            };
        }
    }

    function getDocuments() {
        try {
            var documents = [];
            var gr = new GlideRecord('x_gegis_uwm_dashbo_pdf_annotation_docs');
            gr.addActiveQuery();
            gr.query();
            
            while (gr.next()) {
                documents.push({
                    sys_id: gr.getUniqueValue(),
                    file_name: gr.file.name.toString(),
                    created: gr.sys_created_on.getDisplayValue(),
                    json_data: gr.json_data.toString()
                });
            }
            
            return {
                success: true,
                documents: documents
            };
        } catch (e) {
            gs.error('Error fetching PDF documents: ' + e.message);
            return {
                success: false,
                message: 'Error fetching documents: ' + e.message
            };
        }
    }
} catch (e) {
    data.error = 'Server script error: ' + e.message;
}
})();
