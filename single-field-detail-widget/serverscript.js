(function () {
    /* ============================================
     * Single Field Detail Widget - Server Script
     * ============================================
     * Shows detailed view of a single field/check
     * with source evidence and PDF navigation
     * ============================================ */

    // Table names
    var lineItemTableName = 'x_gegis_uwm_dashbo_data_extraction_lineitem';
    var submissionTableName = 'x_gegis_uwm_dashbo_submission';
    var sysAttachmentTable = 'sys_attachment';
    var supportedContentType = 'application/pdf';

    /* ============================================
     * HELPER FUNCTIONS
     * ============================================ */

    function _getValue(gr, field) {
        try {
            return gr.getValue(field) || '';
        } catch (e) {
            return '';
        }
    }

    function _getAttachmentData(attachmentSysId) {
        if (!attachmentSysId) return null;

        try {
            var attachmentGr = new GlideRecord(sysAttachmentTable);
            attachmentGr.addQuery('sys_id', attachmentSysId);
            attachmentGr.addQuery('content_type', supportedContentType);
            attachmentGr.setLimit(1);
            attachmentGr.query();

            if (attachmentGr.next()) {
                return {
                    sys_id: attachmentGr.getUniqueValue(),
                    file_name: _getValue(attachmentGr, 'file_name'),
                    file_url: "/sys_attachment.do?sys_id=" + attachmentSysId
                };
            }
            return null;
        } catch (e) {
            return null;
        }
    }

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

    /* ============================================
     * INITIALIZE DATA
     * ============================================ */
    data.success = false;
    data.error = '';
    data.field = null;

    /* ============================================
     * ACTION HANDLER
     * ============================================ */
    if (input && input.action) {
        try {
            switch (input.action) {
                case 'fetchFieldDetail':
                    fetchFieldDetail();
                    break;
                default:
                    data.error = 'Unknown action: ' + input.action;
            }
        } catch (e) {
            data.error = 'Server error: ' + e.message;
        }
    } else {
        data.message = 'Single Field Detail Widget loaded';
        data.success = true;
    }

    /* ============================================
     * FETCH SINGLE FIELD DETAIL
     * ============================================ */
    function fetchFieldDetail() {
        data.success = false;

        try {
            var fieldSysId = input.fieldSysId;
            if (!fieldSysId) {
                data.error = 'Field ID is required';
                return;
            }

            var lineItemGr = new GlideRecord(lineItemTableName);
            if (!lineItemGr.get(fieldSysId)) {
                data.error = 'Field not found';
                return;
            }

            var documentSysId = _getValue(lineItemGr, 'documentname_attachment_sysid');
            var source = _getValue(lineItemGr, 'source');

            // Parse page and section from source
            var pageNumber = 1;
            var sectionInfo = '';
            if (source) {
                var pageMatch = source.match(/D\((\d+),/);
                if (pageMatch) {
                    pageNumber = parseInt(pageMatch[1]);
                }
            }

            data.field = {
                sys_id: lineItemGr.getUniqueValue(),

                // Display fields
                field_name: _getValue(lineItemGr, 'field_name'),
                field_value: _getValue(lineItemGr, 'field_value'),
                section_name: _getValue(lineItemGr, 'section_name'),
                new_section_name: _getValue(lineItemGr, 'new_section_name'),

                // Status/Score
                score: _getValue(lineItemGr, 'score') || 'Passed',
                status: _getValue(lineItemGr, 'status') || '',

                // Reasoning/Explanation
                reason: _getValue(lineItemGr, 'reason') || '',
                logic_transparency: _getValue(lineItemGr, 'reason'),
                commentary: _getValue(lineItemGr, 'commentary'),

                // Confidence
                confidence_indicator: _parseConfidence(_getValue(lineItemGr, 'confidence_indicator')),

                // Source Evidence
                source: source,
                page_number: pageNumber,
                extracted_text: _getValue(lineItemGr, 'field_value'),

                // Attachment
                attachmentData: documentSysId ? _getAttachmentData(documentSysId) : null
            };

            data.success = true;

        } catch (e) {
            data.error = 'Error loading field detail: ' + e.message;
        }
    }

})();
