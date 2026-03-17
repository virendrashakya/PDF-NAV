api.controller = function ($scope, $location, $filter, $window, spUtil, $timeout) {
    /* ============================================
     * Combined Field Detail + PDF Viewer Widget
     * Single Field View
     * ============================================ */

    var c = this;

    /* ============================================
     * DATA FROM SERVER SCRIPT
     * ============================================ */


    var pdfUrl = c.data.demoPdfUrl || '';
    // URL parameters
    var submissionSysId = $location.search().submissionSysId || '809fbec0933132d8ce18b5d97bba1040';
    var reason = $location.search().reason;

    /* ============================================
     * PDF STATE
     * ============================================ */

    c.pdfDoc = null;
    c.currentPage = 1;
    c.totalPages = 0;
    c.scale = 1.0;
    c.scalePercent = 100;
    c.pageWidth = 595;
    c.pageHeight = 842;
    c.isLoading = false;
    c.pdfError = null;
    c.activeCoordinates = [];
    c.zoomMode = 'fit-width';  // 'fit-width', 'fit-page', 'actual-size'

    /* ============================================
     * INITIALIZATION
     * ============================================ */

    /*
      $timeout(function () {
        loadPdfJs().then(function () {
            // Parse coordinates from field
            if (c.field && c.field.source) {
                c.activeCoordinates = parseCoordinates(c.field.source);
            }
            // Load PDF from server data
            if (pdfUrl) {
                loadDocument(pdfUrl);
            }
        });
    }, 100);
        */

    /* ============================================
     * PDF.js LOADING
     * ============================================ */

    function loadPdfJs() {
        c.isLoading = true;
        c.loadingMessage = 'Loading PDF library...';

        if (!$window.pdfjsLib) {
            var script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
            script.onload = function () {
                $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
                initializeWidget();
            };
            script.onerror = function () {
                c.isLoading = false;
                c.showError('Failed to load PDF library');
            };
            document.head.appendChild(script);
        } else {
            initializeWidget();
        }
    }

    // Initialize widget
    function initializeWidget() {
        c.loadingMessage = 'Initializing...';

        // Setup canvases
        $timeout(function () {
            canvas = document.getElementById('pdfCanvas');
            annotationCanvas = document.getElementById('annotationCanvas');
            if (canvas && annotationCanvas) {
                ctx = canvas.getContext('2d');
                annotationCtx = annotationCanvas.getContext('2d');
            }
        }, 100);
        loadSourceMapping();
    }


    // Load source mapping
    function loadSourceMapping() {
        if (!submissionSysId) {
            c.isLoading = false;
            return;
        }

        c.loadingMessage = 'Loading field mappings...';

        c.server.get({
            action: 'fetchSourceMapping',
            submissionSysId: submissionSysId,
            //Yug
            reason: reason
        }).then(function (response) {

            console.log('response recieve from server script');
            console.log(response);
            c.field = response.data.field || null;

            if (response.data.error) {
                c.showError(response.data.error);
                c.isLoading = false;
                return;
            }


            c.selectedDocument = response.data.response;
            if (c.selectedDocument) {
                c.loadDocument();
                c.field.document_name = response.data.response.name;
            }
            if (response.data.success) {
                // processMappingData(response.data.mapping);

                // DEBUG: Analyze missing documents
                //analyzeMissingDocuments(response.data.mapping);
            }
            c.isLoading = false;
        }).catch(function (error) {
            c.isLoading = false;
            console.error('Failed to load mapping:', error);
            c.showError('Failed to load mapping');
        });
    }


    // Load Document
    c.loadDocument = function () {
        if (c.selectedDocument && c.selectedDocument.documentURL) {
            loadPdfFromUrl(c.selectedDocument.documentURL);
        }
    };

    // Load Document
    c.showError = function () {
        // 
    };
    /* ============================================
     * PDF LOADING
     * ============================================ */

    function loadPdfFromUrl(url) {
        if (!url || !window.pdfjsLib) return;

        c.isLoading = true;
        c.pdfError = null;
        $scope.$applyAsync();

        window.pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
            cMapPacked: true
        }).promise.then(function (pdf) {
            c.pdfDoc = pdf;
            c.totalPages = pdf.numPages;
            c.currentPage = 1;
            c.isLoading = false;

            // Go to field page if available
            var targetPage = 1;
            if (c.activeCoordinates.length > 0 && c.activeCoordinates[0].page) {
                targetPage = c.activeCoordinates[0].page;
            }
            goToPage(targetPage);

            $scope.$applyAsync();
        }).catch(function (error) {
            c.isLoading = false;
            c.pdfError = 'Failed to load PDF: ' + error.message;
            $scope.$applyAsync();
        });
    }

    /* ============================================
     * PAGE RENDERING
     * ============================================ */

    function renderPage(pageNum) {
        if (!c.pdfDoc) return;

        c.pdfDoc.getPage(pageNum).then(function (page) {
            var canvas = document.getElementById('pdfCanvas');
            var annotationCanvas = document.getElementById('annotationCanvas');
            if (!canvas || !annotationCanvas) return;

            var ctx = canvas.getContext('2d');
            var annotationCtx = annotationCanvas.getContext('2d');

            // Get original page size
            var baseViewport = page.getViewport({ scale: 1.0 });
            c.pageWidth = Math.round(baseViewport.width);
            c.pageHeight = Math.round(baseViewport.height);

            // Get container dimensions
            var container = document.getElementById('pdfContainer');
            var containerWidth = container ? container.clientWidth - 40 : 600;
            var containerHeight = container ? container.clientHeight - 40 : 800;

            // Calculate scale based on zoom mode
            switch (c.zoomMode) {
                case 'fit-width':
                    c.scale = containerWidth / baseViewport.width;
                    break;
                case 'fit-page':
                    var scaleX = containerWidth / baseViewport.width;
                    var scaleY = containerHeight / baseViewport.height;
                    c.scale = Math.min(scaleX, scaleY);
                    break;
                case 'actual-size':
                    c.scale = 1.0;
                    break;
                default:
                    c.scale = containerWidth / baseViewport.width;
            }
            c.scalePercent = Math.round(c.scale * 100);

            var viewport = page.getViewport({ scale: c.scale });

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            annotationCanvas.width = viewport.width;
            annotationCanvas.height = viewport.height;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

            page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise.then(function () {
                drawHighlights(annotationCtx, pageNum);
                $scope.$applyAsync();
            });
        });
    }

    function drawHighlights(ctx, pageNum) {
        var pageCoords = c.activeCoordinates.filter(function (coord) {
            return coord.page === pageNum;
        });

        pageCoords.forEach(function (coord) {
            var canvas = document.getElementById('annotationCanvas');
            var scale = c.scale;

            var x1 = coord.x1 * scale;
            var y1 = canvas.height - (coord.y1 * scale);
            var x2 = coord.x2 * scale;
            var y2 = canvas.height - (coord.y2 * scale);
            var x3 = coord.x3 * scale;
            var y3 = canvas.height - (coord.y3 * scale);
            var x4 = coord.x4 * scale;
            var y4 = canvas.height - (coord.y4 * scale);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.lineTo(x4, y4);
            ctx.closePath();

            ctx.fillStyle = 'rgba(255, 235, 59, 0.4)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 152, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    /* ============================================
     * PAGE NAVIGATION
     * ============================================ */

    function goToPage(pageNum) {
        if (!c.pdfDoc) return;
        pageNum = Math.max(1, Math.min(pageNum, c.totalPages));
        c.currentPage = pageNum;
        renderPage(pageNum);
        $scope.$applyAsync();
    }

    c.previousPage = function () {
        if (c.currentPage > 1) {
            goToPage(c.currentPage - 1);
        }
    };

    c.nextPage = function () {
        if (c.currentPage < c.totalPages) {
            goToPage(c.currentPage + 1);
        }
    };

    /* ============================================
     * ACTIONS
     * ============================================ */

    c.viewInDocument = function () {
        if (c.activeCoordinates.length > 0) {
            var targetPage = c.activeCoordinates[0].page || 1;
            goToPage(targetPage);
        }
    };

    /* ============================================
     * ZOOM CONTROLS
     * ============================================ */

    c.fitWidth = function () {
        c.zoomMode = 'fit-width';
        renderPage(c.currentPage);
    };

    c.fitPage = function () {
        c.zoomMode = 'fit-page';
        renderPage(c.currentPage);
    };

    c.actualSize = function () {
        c.zoomMode = 'actual-size';
        renderPage(c.currentPage);
    };

    /* ============================================
     * COORDINATE PARSING
     * ============================================ */

    function parseCoordinates(source) {
        if (!source || typeof source !== 'string') return [];

        var coordinates = [];
        var dStrings = source.split(';');

        dStrings.forEach(function (dString) {
            var match = dString.trim().match(
                /D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/
            );
            if (match) {
                coordinates.push({
                    page: parseInt(match[1]),
                    x1: parseFloat(match[2]),
                    y1: parseFloat(match[3]),
                    x2: parseFloat(match[4]),
                    y2: parseFloat(match[5]),
                    x3: parseFloat(match[6]),
                    y3: parseFloat(match[7]),
                    x4: parseFloat(match[8]),
                    y4: parseFloat(match[9])
                });
            }
        });

        return coordinates;
    }

    /* ============================================
     * HELPERS
     * ============================================ */

    c.getScoreClass = function () {
        if (!c.field || !c.field.score) return '';
        var score = c.field.score.toLowerCase();
        if (score === 'passed' || score === 'pass') return 'score-passed';
        if (score === 'failed' || score === 'fail') return 'score-failed';
        if (score === 'warning') return 'score-warning';
        return '';
    };

    // Initialize on load
    $timeout(function () {
        loadPdfJs();
    }, 100);

};
