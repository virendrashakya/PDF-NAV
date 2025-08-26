// PDF Navigator Widget Controller for ServiceNow Service Portal
// This controller handles PDF navigation and JSON data processing

(function() {
  'use strict';

  // Configure PDF.js worker for ServiceNow
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
  }

  angular.module('pdfNavigatorApp', [])
  .controller('PdfNavigatorController', ['$scope', '$timeout', '$window', function($scope, $timeout, $window) {
    
    // Initialize scope variables
    $scope.pdfLoaded = false;
    $scope.isUploading = false;
    $scope.coordinates = [];
    $scope.newCoordinate = {};
    $scope.scale = 1.0;
    $scope.currentPage = 1;
    $scope.totalPages = 0;
    $scope.activeMarker = null;
    $scope.jsonData = null;
    $scope.activeField = null;
    $scope.fieldSearch = '';
    $scope.Math = Math;

    $scope.newPolygon = {
      page: 1,
      x1: null, y1: null,
      x2: null, y2: null,
      x3: null, y3: null,
      x4: null, y4: null
    };

    $scope.polygons = [];
    $scope.coordinateString = '';

    // PDF.js variables
    let pdfDoc = null;
    let canvas = null;
    let ctx = null;

    // Initialize the widget
    $scope.$on('$viewContentLoaded', function() {
      console.log('PDF Navigator Widget initialized');
      // Check if PDF.js is available
      if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js library not loaded. Please ensure it is included in the page.');
        $scope.showError('PDF.js library not loaded. Please contact your administrator.');
      }
    });

    // Error handling function
    $scope.showError = function(message) {
      // Use ServiceNow's notification system if available
      if (typeof g_form !== 'undefined' && g_form.addInfoMessage) {
        g_form.addInfoMessage(message, 'error');
      } else {
        alert('Error: ' + message);
      }
    };

    // Success notification function
    $scope.showSuccess = function(message) {
      if (typeof g_form !== 'undefined' && g_form.addInfoMessage) {
        g_form.addInfoMessage(message, 'info');
      } else {
        alert('Success: ' + message);
      }
    };

    // PDF Upload Function
    $scope.uploadPdf = function(file) {
      if (!file) return;
      
      // Validate file type
      if (file.type !== 'application/pdf') {
        $scope.showError('Please select a valid PDF file.');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        $scope.showError('File size must be less than 10MB.');
        return;
      }
      
      $scope.isUploading = true;
      $scope.$apply();

      const fileReader = new FileReader();
      fileReader.onload = function(e) {
        const typedarray = new Uint8Array(e.target.result);
        
        if (typeof pdfjsLib === 'undefined') {
          $scope.showError('PDF.js library not available. Please refresh the page.');
          $scope.isUploading = false;
          $scope.$apply();
          return;
        }

        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
          pdfDoc = pdf;
          $scope.totalPages = pdf.numPages;
          $scope.currentPage = 1;
          $scope.pdfLoaded = true;
          $scope.isUploading = false;
          
          $timeout(function() {
            canvas = document.getElementById('pdfCanvas');
            if (canvas) {
              ctx = canvas.getContext('2d');
              $scope.renderPage(1);
            } else {
              console.error('Canvas element not found');
              $scope.showError('Canvas element not found. Please refresh the page.');
            }
          }, 100);

          $scope.$apply();
          $scope.showSuccess('PDF loaded successfully!');
        }).catch(function(error) {
          console.error('Error loading PDF:', error);
          $scope.isUploading = false;
          $scope.$apply();
          $scope.showError('Error loading PDF file. Please try again.');
        });
      };

      fileReader.onerror = function() {
        $scope.isUploading = false;
        $scope.$apply();
        $scope.showError('Error reading file. Please try again.');
      };

      fileReader.readAsArrayBuffer(file);
    };

    // JSON Upload Function
    $scope.uploadJson = function(file) {
      if (!file) return;

      // Validate file type
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        $scope.showError('Please select a valid JSON file.');
        return;
      }

      const fileReader = new FileReader();
      fileReader.onload = function(e) {
        try {
          // Clean the JSON text to handle potential formatting issues
          let jsonText = e.target.result;
          
          // Remove any BOM (Byte Order Mark) if present
          if (jsonText.charCodeAt(0) === 0xFEFF) {
            jsonText = jsonText.slice(1);
          }
          
          // Try to parse the JSON
          $scope.jsonData = JSON.parse(jsonText);
          
          // Validate the structure
          if (!$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) {
            throw new Error('Invalid JSON structure: missing extracted_data.fields');
          }
          
          $scope.$apply();
          console.log('JSON data loaded successfully');
          console.log('Total fields:', Object.keys($scope.jsonData.extracted_data.fields).length);
          
          $scope.showSuccess('JSON data loaded successfully! Found ' + Object.keys($scope.jsonData.extracted_data.fields).length + ' fields.');
          
        } catch (error) {
          console.error('JSON parsing error:', error);
          console.error('File content preview:', e.target.result.substring(0, 500));
          
          let errorMessage = 'Error parsing JSON file:\n';
          if (error.message.includes('Unexpected token')) {
            errorMessage += '- File may contain invalid JSON syntax\n';
            errorMessage += '- Check for missing commas, brackets, or quotes\n';
          } else if (error.message.includes('Invalid JSON structure')) {
            errorMessage += '- File structure doesn\'t match expected format\n';
            errorMessage += '- Expected: {extracted_data: {fields: {...}}}\n';
          } else {
            errorMessage += '- ' + error.message + '\n';
          }
          
          $scope.showError(errorMessage);
        }
      };

      fileReader.onerror = function() {
        $scope.showError('Error reading JSON file. Please try again.');
      };

      fileReader.readAsText(file, 'UTF-8');
    };

    // Statistics Functions
    $scope.getTotalFields = function() {
      if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) return 0;
      return Object.keys($scope.jsonData.extracted_data.fields).length;
    };

    $scope.getFieldsWithCoordinates = function() {
      if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) return 0;
      let count = 0;
      Object.values($scope.jsonData.extracted_data.fields).forEach(field => {
        if (field.spans && field.spans.length > 0) count++;
      });
      return count;
    };

    $scope.getAverageConfidence = function() {
      if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) return 0;
      let total = 0;
      let count = 0;
      Object.values($scope.jsonData.extracted_data.fields).forEach(field => {
        if (field.confidence) {
          total += field.confidence;
          count++;
        }
      });
      return count > 0 ? Math.round((total / count) * 100) : 0;
    };

    // Field Filtering and Display
    $scope.getFilteredFields = function() {
      if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) {
        return {};
      }
      
      const fields = $scope.jsonData.extracted_data.fields;
      if (!$scope.fieldSearch || $scope.fieldSearch.trim() === '') {
        return fields;
      }
      
      const filtered = {};
      const searchTerm = $scope.fieldSearch.toLowerCase();
      
      Object.keys(fields).forEach(fieldName => {
        const fieldData = fields[fieldName];
        const formattedName = $scope.formatFieldName(fieldName).toLowerCase();
        const fieldValue = (fieldData.value || '').toString().toLowerCase();
        
        if (formattedName.includes(searchTerm) || 
            fieldName.toLowerCase().includes(searchTerm) || 
            fieldValue.includes(searchTerm)) {
          filtered[fieldName] = fieldData;
        }
      });
      
      return filtered;
    };

    $scope.formatFieldName = function(fieldName) {
      return fieldName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
    };

    // Coordinate Parsing
    $scope.parseSourceCoordinate = function(source) {
      if (!source || typeof source !== 'string') return null;
      
      // Parse source format: D(page,x1,y1,x2,y2,x3,y3,x4,y4)
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
    };

    // Field Navigation
    $scope.navigateToField = function(fieldName, fieldData) {
      $scope.activeField = fieldName;
      
      if (!fieldData.source || !canvas) {
        console.log('No source coordinate data available for field:', fieldName);
        return;
      }

      const coord = $scope.parseSourceCoordinate(fieldData.source);
      if (coord) {
        // Switch to the correct page if needed
        if (coord.page !== $scope.currentPage) {
          $scope.currentPage = coord.page;
          $scope.renderPage(coord.page).then(() => {
            $scope.navigateToCoordinateOnPage(coord);
          });
        } else {
          $scope.navigateToCoordinateOnPage(coord);
        }
      } else {
        console.log('Could not parse coordinate from source:', fieldData.source);
      }
    };

    $scope.navigateToCoordinateOnPage = function(coord) {
      if (!canvas) return;

      // Convert normalized coordinates to canvas coordinates
      const rect = canvas.getBoundingClientRect();
      const centerX = ((coord.x1 + coord.x3) / 2) * (rect.width / canvas.width) * rect.width / canvas.offsetWidth;
      const centerY = ((coord.y1 + coord.y3) / 2) * (rect.height / canvas.height) * rect.height / canvas.offsetHeight;

      $scope.showMarker(centerX, centerY);

      // Scroll to the coordinate
      const container = canvas.parentElement;
      container.scrollTo({
        left: centerX - container.clientWidth / 2,
        top: centerY - container.clientHeight / 2,
        behavior: 'smooth'
      });
    };

    // PDF Rendering
    $scope.renderPage = function(pageNumber) {
      if (!pdfDoc) return Promise.reject('No PDF document');

      return pdfDoc.getPage(pageNumber).then(function(page) {
        const viewport = page.getViewport({ scale: $scope.scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        return page.render(renderContext).promise.then(function() {
          $scope.$apply();
        });
      });
    };

    // Coordinate Capture
    $scope.captureCoordinate = function(event) {
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.round((event.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.round((event.clientY - rect.top) * (canvas.height / rect.height));

      // Show marker at clicked position
      $scope.showMarker(event.clientX - rect.left, event.clientY - rect.top);

      // Auto-fill coordinate inputs
      $scope.newCoordinate.x = x;
      $scope.newCoordinate.y = y;
      $scope.$apply();
    };

    // Marker Display
    $scope.showMarker = function(x, y) {
      $scope.activeMarker = {
        left: x + 'px',
        top: y + 'px'
      };

      // Hide marker after 4 seconds
      $timeout(function() {
        $scope.activeMarker = null;
      }, 4000);
    };

    // Zoom Controls
    $scope.zoomIn = function() {
      $scope.scale += 0.2;
      $scope.renderPage($scope.currentPage);
    };

    $scope.zoomOut = function() {
      if ($scope.scale > 0.4) {
        $scope.scale -= 0.2;
        $scope.renderPage($scope.currentPage);
      }
    };

    $scope.resetZoom = function() {
      $scope.scale = 1.0;
      $scope.renderPage($scope.currentPage);
    };

    // Page Navigation
    $scope.nextPage = function() {
      if ($scope.currentPage < $scope.totalPages) {
        $scope.currentPage++;
        $scope.renderPage($scope.currentPage);
      }
    };

    $scope.previousPage = function() {
      if ($scope.currentPage > 1) {
        $scope.currentPage--;
        $scope.renderPage($scope.currentPage);
      }
    };

    // Polygon Functions
    $scope.isValidPolygon = function() {
      return $scope.newPolygon.page && 
             $scope.newPolygon.x1 !== null && $scope.newPolygon.y1 !== null &&
             $scope.newPolygon.x2 !== null && $scope.newPolygon.y2 !== null &&
             $scope.newPolygon.x3 !== null && $scope.newPolygon.y3 !== null &&
             $scope.newPolygon.x4 !== null && $scope.newPolygon.y4 !== null;
    };

    $scope.addPolygonCoordinate = function() {
      if ($scope.isValidPolygon()) {
        $scope.polygons.push({...$scope.newPolygon});
        // Reset form
        $scope.newPolygon = {page: $scope.currentPage};
        $scope.showSuccess('Polygon added successfully!');
      }
    };

    $scope.parseCoordinateString = function() {
      const str = $scope.coordinateString;
      const regex = /D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/;
      const match = str.match(regex);
      
      if (match) {
        $scope.newPolygon = {
          page: parseInt(match[1]),
          x1: parseFloat(match[2]), y1: parseFloat(match[3]),
          x2: parseFloat(match[4]), y2: parseFloat(match[5]),
          x3: parseFloat(match[6]), y3: parseFloat(match[7]),
          x4: parseFloat(match[8]), y4: parseFloat(match[9])
        };
        $scope.showSuccess('Coordinate string parsed successfully!');
      } else {
        $scope.showError('Invalid coordinate string format');
      }
    };

    $scope.removePolygon = function(index) {
      $scope.polygons.splice(index, 1);
      $scope.showSuccess('Polygon removed!');
    };

    $scope.navigateToPolygon = function(poly) {
      if (poly.page !== $scope.currentPage) {
        $scope.currentPage = poly.page;
        $scope.renderPage(poly.page).then(() => {
          $scope.highlightPolygon(poly);
        });
      } else {
        $scope.highlightPolygon(poly);
      }
    };

    $scope.highlightPolygon = function(poly) {
      if (!canvas || !ctx) return;
      
      const rect = canvas.getBoundingClientRect();
      // Calculate center point of polygon
      const centerX = (poly.x1 + poly.x2 + poly.x3 + poly.x4) / 4;
      const centerY = (poly.y1 + poly.y2 + poly.y3 + poly.y4) / 4;
      
      // Convert to canvas coordinates
      const canvasX = centerX * (rect.width / canvas.width);
      const canvasY = centerY * (rect.height / canvas.height);
      
      $scope.showMarker(canvasX, canvasY);
      
      // Draw polygon outline
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(poly.x1, poly.y1);
      ctx.lineTo(poly.x2, poly.y2);
      ctx.lineTo(poly.x3, poly.y3);
      ctx.lineTo(poly.x4, poly.y4);
      ctx.closePath();
      ctx.stroke();
      
      // Scroll to center of polygon
      const container = canvas.parentElement;
      container.scrollTo({
        left: canvasX - container.clientWidth / 2,
        top: canvasY - container.clientHeight / 2,
        behavior: 'smooth'
      });
    };

    // Cleanup on scope destroy
    $scope.$on('$destroy', function() {
      // Clean up any resources
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    });

  }]);

})();
