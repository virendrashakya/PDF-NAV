api.controller = function ($scope, $rootScope, $window, $timeout) {
    /* ============================================
     * PDF Viewer Widget - Client Script
     * ============================================
     * Standalone PDF viewer that accepts:
     * - Document URL
     * - Coordinates for highlighting
     * - Page number for navigation
     * 
     * Listens for events from other widgets to
     * load documents and navigate to fields.
     * ============================================ */

    var c = this;

    /* ============================================
     * STATE VARIABLES
     * ============================================ */

    // PDF state
    c.pdfLoaded = false;
    c.scale = 1.0;
    c.currentPage = 1;
    c.totalPages = 0;
    c.zoomMode = 'actual-size'; // 'fit-width' or 'actual-size'
    c.containerWidth = 0;

    // Loading states
    c.isPdfLoading = false;
    c.loadingMessage = 'Loading...';
    c.errorMessage = '';

    // Current document URL
    c.currentDocumentUrl = '';

    // Active field for highlighting
    c.activeCoordinates = [];
    c.activeCoordIndex = 0;

    // PDF.js variables (private)
    var pdfDoc = null;
    var canvas = null;
    var ctx = null;
    var annotationCanvas = null;
    var annotationCtx = null;
    var pageRendering = false;
    var pageNumPending = null;
    var renderTask = null;
    var currentPageInstance = null;

    /* ============================================
     * INITIALIZATION
     * ============================================ */

    // Initialize on load
    $timeout(function () {
        initializeCanvases();
        loadPdfJs();
    }, 100);

    // Initialize canvas elements
    function initializeCanvases() {
        canvas = document.getElementById('pdfViewerCanvas');
        annotationCanvas = document.getElementById('pdfAnnotationCanvas');
        if (canvas && annotationCanvas) {
            ctx = canvas.getContext('2d');
            annotationCtx = annotationCanvas.getContext('2d');
        }
    }

    // Load PDF.js library
    function loadPdfJs() {
        if (!$window.pdfjsLib) {
            var script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
            script.onload = function () {
                $window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
                onPdfJsReady();
            };
            script.onerror = function () {
                c.errorMessage = 'Failed to load PDF library';
                $scope.$apply();
            };
            document.head.appendChild(script);
        } else {
            onPdfJsReady();
        }
    }

    // Called when PDF.js is ready
    function onPdfJsReady() {
        // Load initial document if provided via widget options
        if (c.data.options && c.data.options.documentUrl) {
            c.loadDocument(c.data.options.documentUrl);
        }
        $scope.$apply();
    }

    /* ============================================
     * PUBLIC METHODS (Called by events or directly)
     * ============================================ */

    /**
     * Load a PDF document from URL
     * @param {string} url - URL of the PDF document
     */
    c.loadDocument = function (url) {
        if (!url) {
            c.errorMessage = 'No document URL provided';
            return;
        }

        // Don't reload same document
        if (url === c.currentDocumentUrl && c.pdfLoaded) {
            return;
        }

        c.currentDocumentUrl = url;
        c.isPdfLoading = true;
        c.errorMessage = '';
        c.loadingMessage = 'Loading PDF document...';

        // Cancel any existing render task
        if (renderTask) {
            renderTask.cancel();
            renderTask = null;
        }

        var loadingTask = $window.pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/cmaps/',
            cMapPacked: true
        });

        loadingTask.promise.then(function (pdf) {
            pdfDoc = pdf;
            c.pdfLoaded = true;
            c.totalPages = pdf.numPages;
            c.currentPage = c.data.options.initialPage || 1;
            c.scale = c.data.options.initialScale || 1.0;

            $scope.$apply(function () {
                c.isPdfLoading = false;
            });

            // Render first page
            $timeout(function () {
                renderPage(c.currentPage);
            }, 100);

            // Broadcast document loaded event
            $rootScope.$broadcast('pdf-viewer:documentLoaded', {
                success: true,
                pages: pdf.numPages,
                url: url
            });

        }).catch(function (error) {
            console.error('Error loading PDF:', error);
            c.isPdfLoading = false;
            c.errorMessage = 'Failed to load PDF: ' + error.message;
            $scope.$apply();

            $rootScope.$broadcast('pdf-viewer:documentLoaded', {
                success: false,
                error: error.message
            });
        });
    };

    /**
     * Navigate to specific coordinates and highlight
     * @param {array} coordinates - Array of coordinate objects
     * @param {number} coordIndex - Index of coordinate to focus on (default 0)
     */
    c.navigateToCoordinates = function (coordinates, coordIndex) {
        if (!coordinates || coordinates.length === 0) return;

        c.activeCoordinates = coordinates;
        c.activeCoordIndex = coordIndex || 0;

        var targetCoord = coordinates[c.activeCoordIndex];
        if (!targetCoord) return;

        var targetPage = targetCoord.page;

        if (targetPage !== c.currentPage) {
            // Navigate to the page first
            c.goToPage(targetPage);
            // Highlight after page renders
            $timeout(function () {
                highlightCoordinates(coordinates.filter(function (coord) {
                    return coord.page === targetPage;
                }));
            }, 300);
        } else {
            // Same page, just highlight
            highlightCoordinates(coordinates.filter(function (coord) {
                return coord.page === targetPage;
            }));
        }
    };

    /**
     * Navigate to next coordinate in active set
     */
    c.nextCoordinate = function () {
        if (!c.activeCoordinates || c.activeCoordinates.length <= 1) return;
        c.activeCoordIndex = (c.activeCoordIndex + 1) % c.activeCoordinates.length;
        c.navigateToCoordinates(c.activeCoordinates, c.activeCoordIndex);
    };

    /**
     * Navigate to previous coordinate in active set
     */
    c.previousCoordinate = function () {
        if (!c.activeCoordinates || c.activeCoordinates.length <= 1) return;
        c.activeCoordIndex = (c.activeCoordIndex - 1 + c.activeCoordinates.length) % c.activeCoordinates.length;
        c.navigateToCoordinates(c.activeCoordinates, c.activeCoordIndex);
    };

    /**
     * Go to specific page
     * @param {number} pageNumber - Page number (1-indexed)
     */
    c.goToPage = function (pageNumber) {
        if (!pdfDoc) return;

        pageNumber = parseInt(pageNumber);
        if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > c.totalPages) return;

        c.currentPage = pageNumber;
        renderPage(pageNumber);
    };

    /**
     * Go to previous page
     */
    c.previousPage = function () {
        if (c.currentPage > 1) {
            c.goToPage(c.currentPage - 1);
        }
    };

    /**
     * Go to next page
     */
    c.nextPage = function () {
        if (c.currentPage < c.totalPages) {
            c.goToPage(c.currentPage + 1);
        }
    };

    /**
     * Set zoom level
     * @param {string} mode - 'fit-width', 'actual-size', or numeric scale
     */
    c.setZoom = function (mode) {
        if (mode === 'fit-width') {
            c.zoomMode = 'fit-width';
        } else if (mode === 'actual-size') {
            c.zoomMode = 'actual-size';
            c.scale = 1.0;
        } else {
            var scale = parseFloat(mode);
            if (!isNaN(scale) && scale > 0) {
                c.zoomMode = 'custom';
                c.scale = scale;
            }
        }
        renderPage(c.currentPage);
    };

    /**
     * Zoom in
     */
    c.zoomIn = function () {
        c.scale = Math.min(c.scale * 1.25, 4.0);
        c.zoomMode = 'custom';
        renderPage(c.currentPage);
    };

    /**
     * Zoom out
     */
    c.zoomOut = function () {
        c.scale = Math.max(c.scale / 1.25, 0.25);
        c.zoomMode = 'custom';
        renderPage(c.currentPage);
    };

    /* ============================================
     * EVENT LISTENERS
     * ============================================ */

    // Listen for load document event
    var unsubLoadDoc = $rootScope.$on('pdf-viewer:loadDocument', function (event, data) {
        if (data && data.url) {
            c.loadDocument(data.url);
        }
    });

    // Listen for navigate to field event
    var unsubNavigate = $rootScope.$on('pdf-viewer:navigateToField', function (event, data) {
        if (data) {
            // Load document if different
            if (data.documentUrl && data.documentUrl !== c.currentDocumentUrl) {
                c.loadDocument(data.documentUrl);
                // Wait for document to load, then navigate
                var unsubLoaded = $rootScope.$on('pdf-viewer:documentLoaded', function (e, result) {
                    if (result.success && data.coordinates) {
                        $timeout(function () {
                            c.navigateToCoordinates(data.coordinates, 0);
                        }, 200);
                    }
                    unsubLoaded();
                });
            } else if (data.coordinates) {
                c.navigateToCoordinates(data.coordinates, 0);
            }
        }
    });

    // Listen for go to page event
    var unsubGoToPage = $rootScope.$on('pdf-viewer:goToPage', function (event, data) {
        if (data && data.page) {
            c.goToPage(data.page);
        }
    });

    // Listen for set zoom event
    var unsubSetZoom = $rootScope.$on('pdf-viewer:setZoom', function (event, data) {
        if (data && data.mode) {
            c.setZoom(data.mode);
        }
    });

    // Cleanup on destroy
    $scope.$on('$destroy', function () {
        unsubLoadDoc();
        unsubNavigate();
        unsubGoToPage();
        unsubSetZoom();
        if (renderTask) {
            renderTask.cancel();
        }
    });

    /* ============================================
     * PRIVATE RENDERING FUNCTIONS
     * ============================================ */

    // Render a page
    function renderPage(pageNumber) {
        if (!pdfDoc || !canvas || !ctx) return;

        if (pageRendering) {
            pageNumPending = pageNumber;
            return;
        }

        pageRendering = true;
        c.loadingMessage = 'Rendering page ' + pageNumber + '...';

        // Cancel previous render task
        if (renderTask) {
            renderTask.cancel();
        }

        pdfDoc.getPage(pageNumber).then(function (page) {
            currentPageInstance = page;

            // Auto-adjust scale if in fit-width mode
            if (c.zoomMode === 'fit-width') {
                var container = document.getElementById('pdfViewerContainer');
                if (container) {
                    c.containerWidth = container.clientWidth - 40;
                    var baseViewport = page.getViewport({ scale: 1.0 });
                    c.scale = c.containerWidth / baseViewport.width;
                }
            }

            var viewport = page.getViewport({ scale: c.scale });

            // Set canvas dimensions
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            annotationCanvas.height = viewport.height;
            annotationCanvas.width = viewport.width;

            // Clear canvases
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            clearAnnotations();

            // Render PDF page
            renderTask = page.render({
                canvasContext: ctx,
                viewport: viewport
            });

            renderTask.promise.then(function () {
                pageRendering = false;
                renderTask = null;

                // Render pending page
                if (pageNumPending !== null) {
                    var pending = pageNumPending;
                    pageNumPending = null;
                    renderPage(pending);
                }

                // Re-highlight active coordinates if on current page
                if (c.activeCoordinates && c.activeCoordinates.length > 0) {
                    var coordsOnPage = c.activeCoordinates.filter(function (coord) {
                        return coord.page === pageNumber;
                    });
                    if (coordsOnPage.length > 0) {
                        $timeout(function () {
                            highlightCoordinates(coordsOnPage);
                        }, 100);
                    }
                }
            }).catch(function (error) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error('Error rendering page:', error);
                    pageRendering = false;
                }
            });
        }).catch(function (error) {
            console.error('Error getting page:', error);
            pageRendering = false;
            c.errorMessage = 'Failed to render page';
        });
    }

    // Clear annotation canvas
    function clearAnnotations() {
        if (annotationCtx && annotationCanvas) {
            annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        }
        var marker = document.getElementById('pdfPageMarker');
        if (marker) {
            marker.style.display = 'none';
        }
    }

    // Highlight coordinates on the canvas
    function highlightCoordinates(coordinates) {
        if (!coordinates || coordinates.length === 0) return;
        if (!annotationCtx || !currentPageInstance) return;

        clearAnnotations();

        var viewport = currentPageInstance.getViewport({ scale: c.scale });

        coordinates.forEach(function (coord, index) {
            // Apply viewport transform to coordinates
            var x1 = coord.x1 * c.scale;
            var y1 = viewport.height - (coord.y1 * c.scale);
            var x2 = coord.x2 * c.scale;
            var y2 = viewport.height - (coord.y2 * c.scale);
            var x3 = coord.x3 * c.scale;
            var y3 = viewport.height - (coord.y3 * c.scale);
            var x4 = coord.x4 * c.scale;
            var y4 = viewport.height - (coord.y4 * c.scale);

            // Draw highlight polygon
            annotationCtx.beginPath();
            annotationCtx.moveTo(x1, y1);
            annotationCtx.lineTo(x2, y2);
            annotationCtx.lineTo(x3, y3);
            annotationCtx.lineTo(x4, y4);
            annotationCtx.closePath();

            // Primary highlight (first) is more prominent
            if (index === 0) {
                annotationCtx.fillStyle = 'rgba(255, 235, 59, 0.4)';
                annotationCtx.strokeStyle = 'rgba(255, 152, 0, 0.8)';
                annotationCtx.lineWidth = 2;
            } else {
                annotationCtx.fillStyle = 'rgba(33, 150, 243, 0.3)';
                annotationCtx.strokeStyle = 'rgba(33, 150, 243, 0.6)';
                annotationCtx.lineWidth = 1;
            }

            annotationCtx.fill();
            annotationCtx.stroke();
        });

        // Scroll to first highlight
        if (coordinates.length > 0) {
            var firstCoord = coordinates[0];
            var scrollY = (viewport.height - (firstCoord.y1 * c.scale)) - 100;
            var container = document.getElementById('pdfViewerContainer');
            if (container) {
                container.scrollTop = Math.max(0, scrollY);
            }
        }
    }

};
