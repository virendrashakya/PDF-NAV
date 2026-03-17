(function () {
    /* ============================================
    * Combined Field Detail + PDF Viewer Widget
    * Server Script
    * ============================================
    * Returns single field demo data
    * ============================================ */

    /* ============================================
    * ACTION HANDLER
    * ============================================ */
    gs.info('PDF-NAV DEBUG: === SERVER SCRIPT START ===');
    gs.info('PDF-NAV DEBUG: input=' + JSON.stringify(input));
    //variable declare
    var criteria;
    var reasonInput;
    var source;
    var reason;
    if (input && input.action) {
        gs.info('PDF-NAV DEBUG: Action received: "' + input.action + '"');
        try {
            switch (input.action) {
                case 'fetchSourceMapping':
                    gs.info('PDF-NAV DEBUG: Calling fetchMapping()');
                    fetchSourceMapping();
                    break;
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

    function fetchSourceMapping() {
        gs.info('Single PDF-NAV DEBUG: *** fwetch mappung ENTERED ***');
        data.success = false;
        var submissionSysId = input.submissionSysId;
        var reasonInput = input.reason;
        gs.info('PDF-NAV DEBUG: submissionSysId=' + submissionSysId);
        gs.info('PDF-NAV DEBUG: reasonInput=' + reasonInput);

        if (!reasonInput) {
            gs.info('PDF-NAV DEBUG: No reasonInput provided, returning error');
            data.error = 'reasonInput is not provided';
            return;
        }

        if (!submissionSysId) {
            gs.info('PDF-NAV DEBUG: No submissionSysId provided, returning error');
            data.error = 'Submission sys ID is not provided';
            return;
        }

        data.response = {};
        //actual logic to fetch data

        var guidelineSysId;
        var score;
        var submissionGr = new GlideRecord('x_gegis_uwm_dashbo_submission');
        submissionGr.addQuery('sys_id', submissionSysId);
        submissionGr.setLimit(1);
        submissionGr.query();
        if (submissionGr.next()) {
            guidelineSysId = submissionGr.getValue('underwriting_guideline');

            gs.info(guidelineSysId);
        }
        var gr = new GlideRecord('x_gegis_uwm_dashbo_underwriting_guideline_rule');
        gr.addQuery('underwriting_guideline', guidelineSysId);
        gr.addQuery('reason', reasonInput);
        gr.setLimit(1);
        gr.query();

        while (gr.next()) {
            documentSysId = gr.getValue('documentname_attachment_sysid');
            criteria = gr.getValue('criteria');
            source = gr.getValue('source');
            reason = gr.getValue('reason');
            var documentURL = "/sys_attachment.do?sys_id=" + documentSysId
            data.response = {
                sys_id: gr.getUniqueValue('underwriting_guideline'),
                name: gr.getValue('document_name'),
                documentURL: documentURL,
                source: gr.getValue('source'),
            }


        }

    }

    // Single field data matching screenshot
    data.field = {
        field_name: criteria,
        field_value: 'This insurance excludes loss damage liability or expense arising from war, invasion, act of foreign enemy, hostilities...',
        section_name: 'Section 5.1 - Exclusions',
        score: 'Failed',
        status: 'Manual Review',
        reason: reason,
        confidence_indicator: 0.85,
        page_number: 2,
        source: source,
    };

    // PDF URL from ServiceNow attachment table
    data.demoPdfUrl = '/sys_attachment.do?sys_id=882e3693fb92f650b70efc647befdc63&view=true';

    data.success = true;

})();