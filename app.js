// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

angular.module('pdfApp', [])
.controller('PdfController', ['$scope', function($scope) {
    // State variables
    $scope.pdfLoaded = false;
    $scope.isUploading = false;
    $scope.extractedFields = [];
    $scope.fieldDefinitions = [];
    $scope.scale = 1.0;
    $scope.currentPage = 1;
    $scope.totalPages = 0;
    $scope.activeField = null;
    $scope.jsonData = null;
    $scope.fieldSearch = '';
    $scope.showModal = false;
    $scope.isDraggingPdf = false;
    $scope.isDraggingJson = false;
    $scope.pdfFile = null;
    $scope.jsonFile = null;
    $scope.showAdvancedMode = false;
    $scope.manualCoordinate = '';
    $scope.manualFields = { page: 1, x1: 0, y1: 0, x2: 0, y2: 0 };
    $scope.calculatedPixels = '';
    $scope.mobileMenuOpen = false;

    // Initialize field definitions based on Image 2 format
    $scope.fieldDefinitions = [
        {
            fieldName: 'AmountDue',
            description: 'Total amount due to the vendor',
            valueType: 'Number',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'BillingAddress',
            description: 'Explicit billing address for the vendor',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'BillingAddressRecipient',
            description: 'Name associated with the billing address',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'CustomerAddress',
            description: 'Mailing address for the customer',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'CustomerAddressRecipient',
            description: 'Name associated with the customer address',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'CustomerId',
            description: 'Reference ID for the customer',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'CustomerName',
            description: 'Customer being invoiced',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'CustomerTaxId',
            description: 'The government ID number associated with the customer',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'DueDate',
            description: 'Date payment for this invoice is due',
            valueType: 'Date',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'InvoiceDate',
            description: 'Date the invoice was issued',
            valueType: 'Date',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'InvoiceId',
            description: 'ID for this specific invoice (often called Invoice Number)',
            valueType: 'String',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        },
        {
            fieldName: 'InvoiceTotal',
            description: 'Total new charges associated with this invoice',
            valueType: 'Number',
            method: 'Extract',
            value: '',
            confidence: 0,
            page: 1
        }
    ];

    let pdfDoc = null;
    let canvas = null;
    let ctx = null;

    // Utility functions
    $scope.getConfidenceClass = function(confidence) {
        if (confidence >= 0.8) return 'bg-green-100 text-green-800';
        if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    // Modal controls
    $scope.showUploadModal = function() {
        $scope.showModal = true;
    };

    $scope.closeModal = function(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        $scope.showModal = false;
    };

    // File upload handlers
    $scope.uploadPdf = function(file) {
        if (!file) return;
        
        $scope.isUploading = true;
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const typedarray = new Uint8Array(e.target.result);
            
            pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                pdfDoc = pdf;
                $scope.$apply(function() {
                    $scope.pdfLoaded = true;
                    $scope.isUploading = false;
                    $scope.totalPages = pdf.numPages;
                    $scope.currentPage = 1;
                    $scope.scale = 1.0;
                });
                renderPage($scope.currentPage);
            }).catch(function(error) {
                console.error('Error loading PDF:', error);
                $scope.$apply(() => $scope.isUploading = false);
            });
        };
        reader.readAsArrayBuffer(file);
    };

    $scope.uploadJson = function(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const jsonData = JSON.parse(e.target.result);
                $scope.$apply(function() {
                    $scope.jsonData = jsonData;
                    processJsonData(jsonData);
                });
            } catch (error) {
                console.error('Error parsing JSON:', error);
                alert('Error parsing JSON file. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };

    // Drag and drop handlers
    $scope.handleDragOver = function(event, type) {
        event.preventDefault();
        event.stopPropagation();
        $scope[type === 'pdf' ? 'isDraggingPdf' : 'isDraggingJson'] = true;
        if (!$scope.$$phase) $scope.$apply();
    };

    $scope.handleDragLeave = function(event, type) {
        event.preventDefault();
        event.stopPropagation();
        $scope[type === 'pdf' ? 'isDraggingPdf' : 'isDraggingJson'] = false;
        if (!$scope.$$phase) $scope.$apply();
    };

    $scope.handleDrop = function(event, type) {
        event.preventDefault();
        event.stopPropagation();
        
        const file = event.dataTransfer.files[0];
        if (!file) return;

        const isValidType = type === 'pdf' ? 
            (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) :
            (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'));

        if (isValidType) {
            $scope[type + 'File'] = file;
            $scope[type === 'pdf' ? 'uploadPdf' : 'uploadJson'](file);
        }

        $scope.isDraggingPdf = false;
        $scope.isDraggingJson = false;
        if (!$scope.$$phase) $scope.$apply();
    };

    $scope.handleFileSelect = function(element, type) {
        const file = element.files[0];
        if (!file) return;
        
        $scope[type + 'File'] = file;
        $scope[type === 'pdf' ? 'uploadPdf' : 'uploadJson'](file);
    };

    $scope.uploadFiles = function() {
        if ($scope.pdfFile) $scope.uploadPdf($scope.pdfFile);
        if ($scope.jsonFile) $scope.uploadJson($scope.jsonFile);
        $scope.closeModal();
    };

    // Advanced mode controls
    $scope.toggleAdvancedMode = function() {
        $scope.showAdvancedMode = !$scope.showAdvancedMode;
    };

    // Mobile menu controls
    $scope.toggleMobileMenu = function() {
        $scope.mobileMenuOpen = !$scope.mobileMenuOpen;
        const leftNav = document.querySelector('.left-nav');
        if (leftNav) {
            leftNav.classList.toggle('open');
        }
    };

    $scope.updateCalculatedPixels = function() {
        const coords = {
            x1: ($scope.manualFields.x1 || 0) * 72,
            y1: ($scope.manualFields.y1 || 0) * 72,
            x2: ($scope.manualFields.x2 || 0) * 72,
            y2: ($scope.manualFields.y2 || 0) * 72
        };
        $scope.calculatedPixels = `(${coords.x1.toFixed(0)}, ${coords.y1.toFixed(0)}) - (${coords.x2.toFixed(0)}, ${coords.y2.toFixed(0)})`;
    };

    $scope.navigateToManualCoordinates = function() {
        let coord = null;
        
        if ($scope.manualCoordinate) {
            coord = parseCoordinateString($scope.manualCoordinate);
        } else {
            coord = {
                page: parseInt($scope.manualFields.page) || 1,
                x1: parseFloat($scope.manualFields.x1) || 0,
                y1: parseFloat($scope.manualFields.y1) || 0,
                x2: parseFloat($scope.manualFields.x2) || 0,
                y2: parseFloat($scope.manualFields.y2) || 0
            };
        }
        
        if (coord) {
            navigateToCoordinate(coord);
            $scope.updateCalculatedPixels();
        }
    };

    $scope.copyCurrentCoordinates = function() {
        if (!$scope.activeField) return;
        
        const coord = $scope.activeField;
        const dString = `D(${coord.page},${coord.x1},${coord.y1},${coord.x2},${coord.y2},${coord.x3 || coord.x1},${coord.y3 || coord.y1},${coord.x4 || coord.x2},${coord.y4 || coord.y2})`;
        
        navigator.clipboard.writeText(dString).then(() => {
            showNotification('Coordinates copied!');
        });

        $scope.manualCoordinate = dString;
        $scope.manualFields = {
            page: coord.page,
            x1: coord.x1,
            y1: coord.y1,
            x2: coord.x2,
            y2: coord.y2
        };
        if (!$scope.$$phase) $scope.$apply();
    };

    // PDF rendering
    function renderPage(pageNumber) {
        if (!pdfDoc) return;
        
        pdfDoc.getPage(pageNumber).then(function(page) {
            canvas = document.getElementById('pdfCanvas');
            if (!canvas) return;
            
            ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const viewport = page.getViewport({ scale: $scope.scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            return page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;
        });
    }

    // Navigation controls
    $scope.nextPage = function() {
        if ($scope.currentPage < $scope.totalPages) {
            $scope.currentPage++;
            renderPage($scope.currentPage);
        }
    };

    $scope.previousPage = function() {
        if ($scope.currentPage > 1) {
            $scope.currentPage--;
            renderPage($scope.currentPage);
        }
    };

    // Zoom controls
    $scope.zoomIn = function() {
        $scope.scale *= 1.2;
        renderPage($scope.currentPage);
    };

    $scope.zoomOut = function() {
        $scope.scale *= 0.8;
        renderPage($scope.currentPage);
    };

    // Field navigation
    $scope.navigateToField = function(field) {
        if (!field || !canvas) return;
        
        $scope.activeField = field;
        
        if (field.page !== $scope.currentPage) {
            $scope.currentPage = field.page;
            renderPage(field.page).then(() => {
                highlightField(field);
            });
        } else {
            highlightField(field);
        }
    };

    // Data processing
    function processJsonData(jsonData) {
        $scope.extractedFields = [];
        
        const fieldsData = jsonData.extracted_data?.fields || jsonData;
        
        // Update field definitions with actual data
        $scope.fieldDefinitions.forEach(fieldDef => {
            // Try to find matching data in the JSON
            const matchingData = Object.entries(fieldsData).find(([key, value]) => {
                // Simple matching logic - you can enhance this
                return key.toLowerCase().includes(fieldDef.fieldName.toLowerCase()) ||
                       fieldDef.fieldName.toLowerCase().includes(key.toLowerCase());
            });
            
            if (matchingData) {
                const [key, value] = matchingData;
                fieldDef.value = value.value || value.text || '';
                fieldDef.confidence = value.confidence || 0;
                
                if (value.source) {
                    const coordinates = parseCoordinateString(value.source);
                    if (coordinates) {
                        fieldDef.page = coordinates.page;
                        Object.assign(fieldDef, coordinates);
                    }
                }
            }
        });
        
        // Also maintain the original extractedFields for backward compatibility
        Object.entries(fieldsData).forEach(([key, value]) => {
            if (value && value.source) {
                const coordinates = parseCoordinateString(value.source);
                if (coordinates) {
                    $scope.extractedFields.push({
                        fieldName: key,
                        value: value.value || value.text || '',
                        confidence: value.confidence || 0,
                        page: coordinates.page,
                        ...coordinates
                    });
                }
            }
        });
    }

    // Coordinate parsing
    function parseCoordinateString(source) {
        if (!source || typeof source !== 'string') return null;
        
        const match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
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

    // Navigation helper
    function navigateToCoordinate(coord) {
        if (!coord || !canvas) return;
        
        if (coord.page !== $scope.currentPage) {
            $scope.currentPage = coord.page;
            renderPage(coord.page).then(() => {
                highlightCoordinate(coord);
            });
        } else {
            highlightCoordinate(coord);
        }
    }

    // Highlighting functions
    function highlightField(field) {
        highlightCoordinate(field);
    }

    function highlightCoordinate(coord) {
        if (!canvas || !ctx) return;

        // Convert PDF points to pixels (multiply by 72)
        const toPixels = (value) => value * 72;
        const pixelCoords = {
            x1: toPixels(coord.x1),
            y1: toPixels(coord.y1),
            x2: toPixels(coord.x2),
            y2: toPixels(coord.y2),
            x3: toPixels(coord.x3 || coord.x2),
            y3: toPixels(coord.y3 || coord.y2),
            x4: toPixels(coord.x4 || coord.x1),
            y4: toPixels(coord.y4 || coord.y1)
        };

        // Calculate center point
        const centerX = (pixelCoords.x1 + pixelCoords.x2 + pixelCoords.x3 + pixelCoords.x4) / 4;
        const centerY = (pixelCoords.y1 + pixelCoords.y2 + pixelCoords.y3 + pixelCoords.y4) / 4;

        // Draw highlight overlay
        ctx.fillStyle = 'rgba(255, 162, 13, 0.3)';
        ctx.strokeStyle = 'rgba(255, 162, 13, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pixelCoords.x1, pixelCoords.y1);
        ctx.lineTo(pixelCoords.x2, pixelCoords.y2);
        ctx.lineTo(pixelCoords.x3, pixelCoords.y3);
        ctx.lineTo(pixelCoords.x4, pixelCoords.y4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Show position marker
        const marker = document.getElementById('pageMarker');
        if (marker) {
            marker.style.display = 'block';
            marker.style.left = centerX + 'px';
            marker.style.top = centerY + 'px';
        }

        // Scroll to coordinate
        const container = canvas.parentElement.parentElement;
        container.scrollTo({
            left: centerX - container.clientWidth / 2,
            top: centerY - container.clientHeight / 2,
            behavior: 'smooth'
        });
    }

    // Utility function for notifications
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = 'notification';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }
}]);
