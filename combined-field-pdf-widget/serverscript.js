(function () {
    /* ============================================
     * Combined Field Detail + PDF Viewer Widget
     * Server Script
     * ============================================
     * Returns single field demo data
     * ============================================ */

    // Single field data matching screenshot
    data.field = {
        sys_id: 'field_001',
        field_name: 'War and Civil War Exclusion',
        field_value: 'This insurance excludes loss damage liability or expense arising from war, invasion, act of foreign enemy, hostilities...',
        section_name: 'Section 5.1 - Exclusions',
        score: 'Failed',
        status: 'Manual Review',
        reason: 'The policy includes a basic war exclusion but is missing the required Institute War and Civil War Exclusion Clause (CL380). This specific clause is mandatory for marine hull policies to ensure proper coverage limitations.',
        confidence_indicator: 0.85,
        page_number: 2,
        source: 'D(2,72,680,280,680,72,700,280,700)',
        document_name: 'Final_Slip_PT_Kolon.pdf',
        document_url: '/sys_attachment.do?sys_id=882e3693fb92f650b70efc647befdc63'
    };

    // PDF URL from ServiceNow attachment table
    data.demoPdfUrl = '/sys_attachment.do?sys_id=882e3693fb92f650b70efc647befdc63&view=true';

    data.success = true;

})();
