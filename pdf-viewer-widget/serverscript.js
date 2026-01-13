(function () {
    /* ============================================
     * PDF Viewer Widget - Server Script
     * ============================================
     * Updated to match combined widget design
     * ============================================ */

    // Initialize data object
    data.success = true;
    data.message = 'PDF Viewer Widget loaded';

    // Widget options (can be set in widget instance)
    data.options = {
        documentUrl: options.documentUrl || '/sys_attachment.do?sys_id=882e3693fb92f650b70efc647befdc63&view=true',
        initialPage: parseInt(options.initialPage) || 1,
        initialScale: parseFloat(options.initialScale) || 1.0,
        showControls: options.showControls !== 'false'
    };

    // Demo document name
    data.documentName = 'Final_Slip_PT_Kolon.pdf';

})();
