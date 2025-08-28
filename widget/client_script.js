api.controller = function($scope, $window, $rootScope, spUtil, spModal) {
    var c = this;
    
    // Load PDF.js dependencies
    function loadPdfJs() {
        return new Promise(function(resolve, reject) {
            try {
                // Get instance URL for loading scripts
                var instanceURL = $window.location.origin;
                
                // Create script URLs using instance URL
                var pdfJsPath = instanceURL + '/scripts/lib/pdf.min.js';
                var pdfWorkerPath = instanceURL + '/scripts/lib/pdf.worker.min.js';
                
                // Load main PDF.js library
                var script1 = document.createElement('script');
                script1.type = 'text/javascript';
                script1.src = pdfJsPath;
                
                script1.onload = function() {
                    // After main library loads, load the worker
                    var script2 = document.createElement('script');
                    script2.type = 'text/javascript';
                    script2.src = pdfWorkerPath;
                    
                    script2.onload = function() {
                        try {
                            // Initialize PDF.js with the worker
                            if (typeof $window.pdfjsLib !== 'undefined') {
                                $window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerPath;
                                resolve();
                            } else {
                                reject(new Error('PDF.js library not found in window object'));
                            }
                        } catch (err) {
                            reject(new Error('Error initializing PDF.js: ' + err.message));
                        }
                    };
                    
                    script2.onerror = function(error) {
                        reject(new Error('Failed to load PDF.js worker: ' + error.message));
                    };
                    
                    document.head.appendChild(script2);
                };
                
                script1.onerror = function(error) {
                    reject(new Error('Failed to load PDF.js main library: ' + error.message));
                };
                
                document.head.appendChild(script1);
            } catch (err) {
                reject(new Error('Error setting up PDF.js: ' + err.message));
            }
        });
    }

    // Initialize data object
    c.data = {
        pdfLoaded: false,
        isUploading: false,
        extractedFields: [],
        scale: 1.0,
        currentPage: 1,
        totalPages: 0,
        activeField: null,
        jsonData: null,
        fieldSearch: '',
        showModal: false,
        isDraggingPdf: false,
        isDraggingJson: false,
        pdfFile: null,
        jsonFile: null,
        showAdvancedMode: false,
        manualCoordinate: '',
        manualFields: { page: 1, x1: 0, y1: 0, x2: 0, y2: 0 },
        calculatedPixels: '',
        documents: [],
        uploadProgress: 0
    };

    var pdfDoc = null;
    var canvas = null;
    var ctx = null;

    // Initialize the widget
    c.initialize = function() {
        // Show loading state
        c.data.isLoading = true;
        c.data.error = '';
        
        // Wait for DOM to be ready
        setTimeout(function() {
            // Load PDF.js and initialize
            loadPdfJs()
                .then(function() {
                    // Find canvas in the widget's scope
                    var widgetElement = document.querySelector('[ng-controller="' + c.widget.controller + '"]');
                    if (widgetElement) {
                        canvas = widgetElement.querySelector('#pdf-canvas');
                        if (canvas) {
                            ctx = canvas.getContext('2d');
                            setupEventListeners();
                            c.loadDocuments();
                        } else {
                            throw new Error('PDF canvas element not found in widget');
                        }
                    } else {
                        throw new Error('Widget element not found');
                    }
                })
                .catch(function(error) {
                    console.error('PDF.js initialization failed:', error);
                    c.data.error = 'Failed to initialize PDF viewer: ' + error.message;
                    spUtil.addErrorMessage(c.data.error);
                })
                .finally(function() {
                    c.data.isLoading = false;
                    // Ensure Angular updates the view
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                });
    };

    // Load existing documents
    c.loadDocuments = function() {
        c.data.isLoading = true;
        c.server.get({
            action: 'getDocuments'
        }).then(function(response) {
            if (response && response.data && response.data.success) {
                c.data.documents = response.data.documents || [];
            } else {
                var errorMsg = (response && response.data && response.data.message) || 'Failed to load documents';
                console.error('Error loading documents:', errorMsg);
                spUtil.addErrorMessage(errorMsg);
            }
        }).catch(function(error) {
            console.error('Error in loadDocuments:', error);
            spUtil.addErrorMessage('Failed to load documents: ' + (error.message || 'Unknown error'));
        }).finally(function() {
            c.data.isLoading = false;
            if (!$scope.$$phase) {
                $scope.$apply();
            }
        });
    };

    // Handle file upload
    c.uploadFiles = function() {
        if (!c.data.pdfFile || !c.data.jsonData) {
            alert('Please select both PDF file and JSON data');
            return;
        }

        c.data.isUploading = true;
        c.data.uploadProgress = 0;

        // Create FormData
        var fd = new FormData();
        fd.append('pdfFile', c.data.pdfFile);
        fd.append('jsonData', JSON.stringify(c.data.jsonData));

        // Upload to ServiceNow
        c.server.upload({
            action: 'uploadFile',
            pdfFile: c.data.pdfFile,
            jsonData: JSON.stringify(c.data.jsonData)
        }).then(function(response) {
            c.data.isUploading = false;
            
            if (response.data.success) {
                c.data.uploadProgress = 100;
                spUtil.addInfoMessage('File uploaded successfully');
                c.loadDocuments(); // Refresh the documents list
                c.closeModal();
            } else {
                spUtil.addErrorMessage(response.data.message || 'Upload failed');
            }
        }).catch(function(error) {
            c.data.isUploading = false;
            spUtil.addErrorMessage('Upload failed: ' + error.message);
        });
    };

    // Utility functions
    c.getConfidenceClass = function(confidence) {
        if (confidence >= 0.8) return 'bg-green-100 text-green-800';
        if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    // Modal controls
    c.showUploadModal = function() {
        c.data.showModal = true;
    };

    c.closeModal = function() {
        c.data.showModal = false;
    };

    c.toggleAdvancedMode = function() {
        c.data.showAdvancedMode = !c.data.showAdvancedMode;
    };

    c.updateCalculatedPixels = function() {
        // Implement the calculation logic here
    };

    // PDF handling functions
    c.loadPDF = function(file) {
        if (typeof pdfjsLib === 'undefined') {
            spUtil.addErrorMessage('PDF.js not initialized. Please refresh the page.');
            return;
        }

        var fileReader = new FileReader();
        fileReader.onload = function(e) {
            var typedarray = new Uint8Array(e.target.result);
            pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                pdfDoc = pdf;
                c.data.totalPages = pdf.numPages;
                c.data.currentPage = 1;
                c.data.pdfLoaded = true;
                renderPage(c.data.currentPage);
                
                if (!$scope.$$phase) {
                    $scope.$apply();
                }
            }).catch(function(error) {
                console.error('Error loading PDF:', error);
                spUtil.addErrorMessage('Error loading PDF: ' + error.message);
            });
        };
        fileReader.readAsArrayBuffer(file);
    };

    // Helper function to render PDF pages
    function renderPage(pageNum) {
        pdfDoc.getPage(pageNum).then(function(page) {
            var viewport = page.getViewport({ scale: c.data.scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            var renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            page.render(renderContext).promise.then(function() {
                if (!$scope.$$phase) {
                    $scope.$apply();
                }
            }).catch(function(error) {
                console.error('Error rendering page:', error);
                spUtil.addErrorMessage('Error rendering page: ' + error.message);
            });
        });
    };

    // Event listeners setup
    function setupEventListeners() {
        // Implement event listeners setup
    }

    // Initialize the widget when it loads
    c.initialize();
};
