api.controller = function ($scope, $rootScope, $location, spUtil, $timeout) {
    /* ============================================
     * Single Field Detail Widget - Client Script
     * ============================================
     * Shows detailed view of a single field/check
     * with source evidence and PDF navigation
     * ============================================ */

    var c = this;

    /* ============================================
     * STATE VARIABLES
     * ============================================ */

    c.field = null;
    c.isLoading = false;
    c.loadingMessage = 'Loading...';
    c.errorMessage = '';

    // URL parameters
    var fieldSysId = $location.search().fieldSysId || '';

    /* ============================================
     * INITIALIZATION
     * ============================================ */

    $timeout(function () {
        if (fieldSysId) {
            loadFieldDetail();
        }
    }, 100);

    /* ============================================
     * DATA LOADING
     * ============================================ */

    function loadFieldDetail() {
        c.isLoading = true;
        c.loadingMessage = 'Loading field details...';
        c.errorMessage = '';

        c.server.get({
            action: 'fetchFieldDetail',
            fieldSysId: fieldSysId
        }).then(function (response) {
            c.isLoading = false;

            if (response.data.success && response.data.field) {
                c.field = response.data.field;

                // Parse coordinates for navigation
                if (c.field.source) {
                    c.field.coordinates = parseMultipleCoordinateStrings(c.field.source);
                }

                // Load document in PDF viewer if available
                if (c.field.attachmentData && c.field.attachmentData.file_url) {
                    $rootScope.$broadcast('pdf-viewer:loadDocument', {
                        url: c.field.attachmentData.file_url
                    });
                }
            } else {
                c.errorMessage = response.data.error || 'Failed to load field';
            }
        }).catch(function (error) {
            c.isLoading = false;
            c.errorMessage = 'Error loading field details';
            console.error('Load error:', error);
        });
    }

    /* ============================================
     * COORDINATE PARSING
     * ============================================ */

    function parseCoordinateString(source) {
        if (!source || typeof source !== 'string') return null;
        var match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
        if (match) {
            return {
                page: parseInt(match[1]),
                x1: parseFloat(match[2]),
                y1: parseFloat(match[3]),
                x2: parseFloat(match[4]),
                y2: parseFloat(match[5]),
                x3: parseFloat(match[6]),
                y3: parseFloat(match[7]),
                x4: parseFloat(match[8]),
                y4: parseFloat(match[9])
            };
        }
        return null;
    }

    function parseMultipleCoordinateStrings(source) {
        if (!source || typeof source !== 'string') return [];
        var coordinates = [];
        var dStrings = source.split(';');
        dStrings.forEach(function (dString) {
            var coord = parseCoordinateString(dString.trim());
            if (coord) {
                coordinates.push(coord);
            }
        });
        return coordinates;
    }

    /* ============================================
     * NAVIGATION
     * ============================================ */

    /**
     * Navigate to source in PDF viewer
     */
    c.viewInDocument = function () {
        if (!c.field || !c.field.coordinates || c.field.coordinates.length === 0) {
            spUtil.addInfoMessage('No source coordinates available');
            return;
        }

        var documentUrl = '';
        if (c.field.attachmentData && c.field.attachmentData.file_url) {
            documentUrl = c.field.attachmentData.file_url;
        }

        $rootScope.$broadcast('pdf-viewer:navigateToField', {
            coordinates: c.field.coordinates,
            documentUrl: documentUrl
        });
    };

    /**
     * Go back to previous page
     */
    c.goBack = function () {
        window.history.back();
    };

    /* ============================================
     * HELPERS
     * ============================================ */

    /**
     * Get score class for styling
     */
    c.getScoreClass = function () {
        if (!c.field || !c.field.score) return '';
        var score = c.field.score.toLowerCase();
        if (score === 'passed' || score === 'pass') return 'score-passed';
        if (score === 'failed' || score === 'fail') return 'score-failed';
        if (score === 'warning') return 'score-warning';
        return '';
    };

    /**
     * Check if field has source
     */
    c.hasSource = function () {
        return c.field && c.field.source && c.field.source.length > 0;
    };

    /**
     * Get status badge text
     */
    c.getStatusText = function () {
        if (!c.field) return '';
        return c.field.status || 'Manual Review';
    };

};
