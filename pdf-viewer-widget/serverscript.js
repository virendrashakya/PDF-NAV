(function () {
    /* ============================================
     * PDF Viewer Widget - Server Script
     * ============================================
     * Minimal server script - PDF viewer receives
     * document URL from client-side events
     * ============================================ */

    // Initialize data object
    data.success = true;
    data.message = 'PDF Viewer Widget loaded';

    // Widget options (can be set in widget instance)
    data.options = {
        documentUrl: options.documentUrl || '',
        initialPage: parseInt(options.initialPage) || 1,
        initialScale: parseFloat(options.initialScale) || 1.0,
        showControls: options.showControls !== 'false'
    };

})();
