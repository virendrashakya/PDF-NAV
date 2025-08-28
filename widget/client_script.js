api.controller = function($scope, $window, spUtil) {
  var c = this;
  
  // Initialize variables
  c.pdfLoaded = false;
  c.extractedFields = [];
  c.scale = 1.0;
  c.currentPage = 1;
  c.totalPages = 0;
  c.activeField = null;
  c.jsonData = null;
  c.fieldSearch = '';
  c.showModal = false;
  c.showUploadModal = false;
  c.showAdvancedMode = false;
  c.manualCoordinate = '';
  c.manualFields = { page: 1, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 };
  c.calculatedPixels = '';
  c.documents = [];
  c.selectedDocument = '';
  c.pdfFile = null;
  c.jsonFile = null;
  c.canUpload = c.data.canUpload || false;
  
  var pdfDoc = null;
  var canvas = null;
  var ctx = null;
  
  // Load PDF.js library
  function loadPdfJs() {
    if (!$window.pdfjsLib) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
      script.onload = function() {
        $window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        initializeWidget();
      };
      document.head.appendChild(script);
    } else {
      initializeWidget();
    }
  }
  
  // Initialize widget
  function initializeWidget() {
    // Load documents list
    c.server.get({
      action: 'getDocuments'
    }).then(function(response) {
      c.documents = response.data.documents || [];
    });
  }
  
  // Load document
  c.loadDocument = function() {
    if (!c.selectedDocument) return;
    
    spUtil.addInfoMessage('Loading document...');
    
    c.server.get({
      action: 'loadDocument',
      documentId: c.selectedDocument
    }).then(function(response) {
      if (response.data.success) {
        // Load PDF
        if (response.data.pdfUrl) {
          loadPdfFromUrl(response.data.pdfUrl);
        }
        
        // Load JSON data
        if (response.data.jsonData) {
          c.jsonData = response.data.jsonData;
          processJsonData(response.data.jsonData);
        }
        
        spUtil.addInfoMessage('Document loaded successfully');
      } else {
        spUtil.addErrorMessage('Failed to load document');
      }
    });
  };
  
  // Load PDF from URL
  function loadPdfFromUrl(url) {
    var loadingTask = $window.pdfjsLib.getDocument(url);
    loadingTask.promise.then(function(pdf) {
      pdfDoc = pdf;
      c.pdfLoaded = true;
      c.totalPages = pdf.numPages;
      c.currentPage = 1;
      c.scale = 1.0;
      renderPage(c.currentPage);
    }).catch(function(error) {
      console.error('Error loading PDF:', error);
      spUtil.addErrorMessage('Failed to load PDF');
    });
  }
  
  // Confidence class helper
  c.getConfidenceClass = function(confidence) {
    if (confidence >= 0.8) return 'bg-green-100';
    if (confidence >= 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };
  
  // File handling
  c.handleFileSelect = function(element, type) {
    var file = element.files[0];
    if (!file) return;
    
    if (type === 'pdf') {
      c.pdfFile = file;
      uploadPdf(file);
    } else if (type === 'json') {
      c.jsonFile = file;
      uploadJson(file);
    }
    
    $scope.$apply();
  };
  
  // Upload PDF
  function uploadPdf(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var typedarray = new Uint8Array(e.target.result);
      
      $window.pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
        pdfDoc = pdf;
        c.pdfLoaded = true;
        c.totalPages = pdf.numPages;
        c.currentPage = 1;
        c.scale = 1.0;
        renderPage(c.currentPage);
        $scope.$apply();
      });
    };
    reader.readAsArrayBuffer(file);
  }
  
  // Upload JSON
  function uploadJson(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var jsonData = JSON.parse(e.target.result);
        c.jsonData = jsonData;
        processJsonData(jsonData);
        $scope.$apply();
      } catch (error) {
        spUtil.addErrorMessage('Error parsing JSON file');
      }
    };
    reader.readAsText(file);
  }
  
  // Upload files to server
  c.uploadFiles = function() {
    if (!c.pdfFile && !c.jsonFile) return;
    
    var formData = new FormData();
    if (c.pdfFile) formData.append('pdfFile', c.pdfFile);
    if (c.jsonFile) formData.append('jsonFile', c.jsonFile);
    
    // Note: In ServiceNow, you'd typically use the attachment API
    // This is a simplified version
    c.server.get({
      action: 'uploadFiles',
      pdfFileName: c.pdfFile ? c.pdfFile.name : '',
      jsonFileName: c.jsonFile ? c.jsonFile.name : ''
    }).then(function(response) {
      if (response.data.success) {
        spUtil.addInfoMessage('Files uploaded successfully');
        c.showUploadModal = false;
        initializeWidget(); // Reload documents
      } else {
        spUtil.addErrorMessage('Upload failed');
      }
    });
  };
  
  // Process JSON data
  function processJsonData(jsonData) {
    c.extractedFields = [];
    
    var fieldsData = jsonData.extracted_data?.fields || jsonData;
    
    Object.keys(fieldsData).forEach(function(key) {
			var fieldName = key.replace(/^(_\d+)+_/, '');
      var value = fieldsData[key];
      if (value && value.source) {
        var coordinates = parseCoordinateString(value.source);
        if (coordinates) {
          c.extractedFields.push(angular.extend({
            fieldName: fieldName,
            value: value.value || value.text || '',
            confidence: value.confidence || 0
          }, coordinates));
        }
      }
    });
  }
  
  // Parse coordinate string
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
  
  // Render PDF page
  function renderPage(pageNumber) {
    if (!pdfDoc) return;
    
    pdfDoc.getPage(pageNumber).then(function(page) {
      canvas = document.getElementById('pdfCanvas');
      if (!canvas) return;
      
      ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      var viewport = page.getViewport({ scale: c.scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      page.render({
        canvasContext: ctx,
        viewport: viewport
      });
    });
  }
  
  // Navigation controls
  c.nextPage = function() {
    if (c.currentPage < c.totalPages) {
      c.currentPage++;
      renderPage(c.currentPage);
    }
  };
  
  c.previousPage = function() {
    if (c.currentPage > 1) {
      c.currentPage--;
      renderPage(c.currentPage);
    }
  };
  
  // Zoom controls
  c.zoomIn = function() {
    c.scale *= 1.2;
    renderPage(c.currentPage);
  };
  
  c.zoomOut = function() {
    c.scale *= 0.8;
    renderPage(c.currentPage);
  };
  
  // Field navigation
  c.navigateToField = function(field) {
    if (!field || !canvas) return;
    
    c.activeField = field;
    
    if (field.page !== c.currentPage) {
      c.currentPage = field.page;
      renderPage(field.page);
      setTimeout(function() {
        highlightField(field);
      }, 500);
    } else {
      highlightField(field);
    }
  };
  
  // Advanced mode functions
  c.updateCalculatedPixels = function() {
    var coords = {
      x1: (c.manualFields.x1 || 0) * 72,
      y1: (c.manualFields.y1 || 0) * 72,
      x2: (c.manualFields.x2 || 0) * 72,
      y2: (c.manualFields.y2 || 0) * 72,
      x3: (c.manualFields.x3 || 0) * 72,
      y3: (c.manualFields.y3 || 0) * 72,
      x4: (c.manualFields.x4 || 0) * 72,
      y4: (c.manualFields.y4 || 0) * 72
    };
    c.calculatedPixels = '(' + coords.x1.toFixed(0) + ', ' + coords.y1.toFixed(0) + ') - (' + 
                        coords.x2.toFixed(0) + ', ' + coords.y2.toFixed(0) + ') - (' + 
                        coords.x3.toFixed(0) + ', ' + coords.y3.toFixed(0) + ') - (' + 
                        coords.x4.toFixed(0) + ', ' + coords.y4.toFixed(0) + ')';
  };
  
  c.navigateToManualCoordinates = function() {
    var coord = null;
    
    if (c.manualCoordinate) {
      coord = parseCoordinateString(c.manualCoordinate);
    } else {
      coord = {
        page: parseInt(c.manualFields.page) || 1,
        x1: parseFloat(c.manualFields.x1) || 0,
        y1: parseFloat(c.manualFields.y1) || 0,
        x2: parseFloat(c.manualFields.x2) || 0,
        y2: parseFloat(c.manualFields.y2) || 0,
        x3: parseFloat(c.manualFields.x3) || 0,
        y3: parseFloat(c.manualFields.y3) || 0,
        x4: parseFloat(c.manualFields.x4) || 0,
        y4: parseFloat(c.manualFields.y4) || 0
      };
    }
    
    if (coord) {
      navigateToCoordinate(coord);
      c.updateCalculatedPixels();
    }
  };
  
  c.copyCurrentCoordinates = function() {
    if (!c.activeField) return;
    
    var coord = c.activeField;
    var dString = 'D(' + coord.page + ',' + coord.x1 + ',' + coord.y1 + ',' + 
                  coord.x2 + ',' + coord.y2 + ',' + 
                  (coord.x3 || coord.x1) + ',' + (coord.y3 || coord.y1) + ',' + 
                  (coord.x4 || coord.x2) + ',' + (coord.y4 || coord.y2) + ')';
    
    // Copy to clipboard (may need polyfill in ServiceNow)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(dString).then(function() {
        spUtil.addInfoMessage('Coordinates copied!');
      });
    }
    
    c.manualCoordinate = dString;
    c.manualFields = {
      page: coord.page,
      x1: coord.x1,
      y1: coord.y1,
      x2: coord.x2,
      y2: coord.y2,
      x3: coord.x3,
      y3: coord.y3,
      x4: coord.x4,
      y4: coord.y4
    };
  };
  
  // Navigation helper
  function navigateToCoordinate(coord) {
    if (!coord || !canvas) return;
    
    if (coord.page !== c.currentPage) {
      c.currentPage = coord.page;
      renderPage(coord.page);
      setTimeout(function() {
        highlightCoordinate(coord);
      }, 500);
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
    
    // Re-render the page first to clear previous highlights
    renderPage(c.currentPage);
    
    setTimeout(function() {
      // Convert PDF points to pixels
      var toPixels = function(value) { return value * 72 * c.scale; };
      var pixelCoords = {
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
      var centerX = (pixelCoords.x1 + pixelCoords.x2 + pixelCoords.x3 + pixelCoords.x4) / 4;
      var centerY = (pixelCoords.y1 + pixelCoords.y2 + pixelCoords.y3 + pixelCoords.y4) / 4;
      
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
      var marker = document.getElementById('pageMarker');
      if (marker) {
        marker.style.display = 'block';
        marker.style.left = centerX + 'px';
        marker.style.top = centerY + 'px';
      }
      
      // Scroll to coordinate
      var container = canvas.parentElement.parentElement;
      container.scrollTo({
        left: centerX - container.clientWidth / 2,
        top: centerY - container.clientHeight / 2,
        behavior: 'smooth'
      });
    }, 300);
  }
  
  // Initialize on load
  loadPdfJs();
};
