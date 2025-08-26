# PDF Navigator Application

A comprehensive AngularJS application for navigating PDF documents with JSON annotation data. This application allows users to upload PDF files and JSON data containing field coordinates, then navigate to specific fields by clicking on them in the sidebar.

## 🚀 Features

- **PDF Upload & Rendering** - Upload and display PDF files using PDF.js
- **JSON Annotation Processing** - Load and parse JSON data with field coordinates
- **Field Navigation** - Click on fields to navigate to their locations in the PDF
- **Search Functionality** - Real-time search through document fields
- **Zoom & Page Controls** - Full PDF navigation with zoom and page controls
- **Manual Coordinate Input** - Add custom polygon coordinates for navigation
- **Statistics Display** - Show field counts and confidence scores
- **Responsive Design** - Works on different screen sizes

## 📁 File Structure

```
├── index-v2.html          # Main application file (HTML + CSS + JavaScript)
├── new_extracted.json     # Sample JSON data with field annotations
├── pdf-navigator-widget.html  # ServiceNow widget HTML template
├── pdf-navigator-widget.css   # ServiceNow widget styles
├── pdf-navigator-widget.js    # ServiceNow widget controller
└── pdf-navigator-widget.json  # ServiceNow widget configuration
```

## 🛠️ Technologies Used

- **AngularJS 1.8.3** - Frontend framework for data binding and UI management
- **PDF.js 2.11.338** - Mozilla's PDF rendering library
- **HTML5 Canvas** - For PDF rendering and coordinate mapping
- **CSS Grid & Flexbox** - Modern layout system

## 📊 JSON Data Structure

The application expects JSON data in this format:

```json
{
  "extracted_data": {
    "fields": {
      "field_name": {
        "value": "field value",
        "confidence": 0.95,
        "source": "D(1,2.9758,3.0617,4.0402,3.0584,4.0398,3.2208,2.9755,3.2203)",
        "spans": [
          {
            "offset": 324,
            "length": 14
          }
        ]
      }
    }
  }
}
```

### Coordinate System

The application uses a **polygon coordinate system** with this format:
```
D(page,x1,y1,x2,y2,x3,y3,x4,y4)
```

**Example:** `D(1,2.9758,3.0617,4.0402,3.0584,4.0398,3.2208,2.9755,3.2203)`
- `1` = Page number
- `2.9758,3.0617` = Point 1 (x1,y1)
- `4.0402,3.0584` = Point 2 (x2,y2)
- `4.0398,3.2208` = Point 3 (x3,y3)
- `2.9755,3.2203` = Point 4 (x4,y4)

## 🏗️ Complete JavaScript Controller Explanation

### Module & Controller Setup

```javascript
angular.module('pdfNavigatorApp', [])
.controller('PdfNavigatorController', ['$scope', '$timeout', function($scope, $timeout) {
    // Controller code here
}]);
```

**Dependencies:**
- `$scope` - AngularJS scope for data binding
- `$timeout` - AngularJS service for delayed execution

### PDF.js Configuration

```javascript
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
```

**Purpose:** Configures PDF.js to use the correct worker script for PDF processing.

### Scope Variables (Data Model)

```javascript
// PDF State
$scope.pdfLoaded = false;        // Whether PDF is loaded
$scope.isUploading = false;      // Upload progress indicator
$scope.scale = 1.0;             // Zoom level (1.0 = 100%)
$scope.currentPage = 1;         // Current page number
$scope.totalPages = 0;          // Total pages in PDF

// UI State
$scope.activeMarker = null;     // Current marker position
$scope.activeField = null;      // Currently selected field
$scope.fieldSearch = '';        // Search term for filtering

// Data
$scope.jsonData = null;         // Parsed JSON annotation data
$scope.coordinates = [];        // Array of captured coordinates
$scope.newCoordinate = {};      // New coordinate being added

// Polygon Management
$scope.newPolygon = {           // New polygon being created
    page: 1,
    x1: null, y1: null,
    x2: null, y2: null,
    x3: null, y3: null,
    x4: null, y4: null
};
$scope.polygons = [];           // Array of saved polygons
$scope.coordinateString = '';   // Raw coordinate string input

// Utility
$scope.Math = Math;             // Make Math available in templates
```

### Private Variables

```javascript
let pdfDoc = null;    // PDF.js document object
let canvas = null;    // HTML5 canvas element
let ctx = null;       // Canvas 2D context
```

### PDF Upload Function

```javascript
$scope.uploadPdf = function(file) {
    if (!file) return;
    
    $scope.isUploading = true;
    $scope.$apply();

    const fileReader = new FileReader();
    fileReader.onload = function(e) {
        const typedarray = new Uint8Array(e.target.result);
        
        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
            pdfDoc = pdf;
            $scope.totalPages = pdf.numPages;
            $scope.currentPage = 1;
            $scope.pdfLoaded = true;
            $scope.isUploading = false;
            
            $timeout(function() {
                canvas = document.getElementById('pdfCanvas');
                ctx = canvas.getContext('2d');
                $scope.renderPage(1);
            }, 100);

            $scope.$apply();
        }).catch(function(error) {
            console.error('Error loading PDF:', error);
            $scope.isUploading = false;
            $scope.$apply();
            alert('Error loading PDF file. Please try again.');
        });
    };
    fileReader.readAsArrayBuffer(file);
};
```

**Process:**
1. **File Validation** - Check if file exists
2. **Set Loading State** - Show upload progress
3. **Read File** - Use FileReader to read as ArrayBuffer
4. **Parse PDF** - Use PDF.js to parse the file
5. **Initialize Canvas** - Get canvas element and context
6. **Render First Page** - Display the first page
7. **Error Handling** - Catch and display any errors

### JSON Upload Function

```javascript
$scope.uploadJson = function(file) {
    if (!file) return;

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
            
            alert('JSON data loaded successfully! Found ' + Object.keys($scope.jsonData.extracted_data.fields).length + ' fields.');
            
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
            errorMessage += '\nPlease check the console for more details.';
            
            alert(errorMessage);
        }
    };
    fileReader.readAsText(file, 'UTF-8');
};
```

**Process:**
1. **File Validation** - Check if file exists
2. **Read as Text** - Use FileReader to read as UTF-8 text
3. **Remove BOM** - Handle Byte Order Mark if present
4. **Parse JSON** - Use JSON.parse() to parse the data
5. **Validate Structure** - Check for required fields
6. **Error Handling** - Provide detailed error messages

### Statistics Functions

#### Total Fields Count
```javascript
$scope.getTotalFields = function() {
    if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) return 0;
    return Object.keys($scope.jsonData.extracted_data.fields).length;
};
```

#### Fields with Coordinates
```javascript
$scope.getFieldsWithCoordinates = function() {
    if (!$scope.jsonData || !$scope.jsonData.extracted_data || !$scope.jsonData.extracted_data.fields) return 0;
    let count = 0;
    Object.values($scope.jsonData.extracted_data.fields).forEach(field => {
        if (field.spans && field.spans.length > 0) count++;
    });
    return count;
};
```

#### Average Confidence Score
```javascript
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
```

### Field Filtering & Display

#### Filter Fields by Search Term
```javascript
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
```

**Search Logic:**
- Searches in field name (original)
- Searches in formatted field name
- Searches in field value
- Case-insensitive search

#### Format Field Names
```javascript
$scope.formatFieldName = function(fieldName) {
    return fieldName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
};
```

**Example:** `"_1_1_Overall_PolicyNumber"` → `"1 1 Overall Policy Number"`

### Coordinate Parsing

#### Parse Source Coordinate String
```javascript
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
```

**Regex Pattern:** `/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/`

**Matches:** `D(1,2.9758,3.0617,4.0402,3.0584,4.0398,3.2208,2.9755,3.2203)`

### Field Navigation

#### Navigate to Field
```javascript
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
```

**Process:**
1. Set active field
2. Parse coordinate string
3. Switch page if needed
4. Navigate to coordinate location

#### Navigate to Coordinate on Page
```javascript
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
```

**Coordinate Conversion:**
- Calculate center point of polygon: `(x1+x3)/2, (y1+y3)/2`
- Convert normalized coordinates to canvas coordinates
- Show marker at location
- Smooth scroll to position

### PDF Rendering

#### Render PDF Page
```javascript
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
```

**Process:**
1. Get PDF page by number
2. Create viewport with current scale
3. Set canvas dimensions
4. Render page to canvas
5. Update AngularJS scope

### Coordinate Capture

#### Capture Click Coordinates
```javascript
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
```

**Process:**
1. Get canvas bounding rectangle
2. Convert click coordinates to canvas coordinates
3. Show marker at clicked position
4. Auto-fill coordinate inputs

### Marker Display

#### Show/Hide Marker
```javascript
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
```

**Features:**
- Shows red pulsing marker at coordinates
- Auto-hides after 4 seconds
- Uses CSS animation for pulsing effect

### Zoom Controls

#### Zoom In
```javascript
$scope.zoomIn = function() {
    $scope.scale += 0.2;
    $scope.renderPage($scope.currentPage);
};
```

#### Zoom Out
```javascript
$scope.zoomOut = function() {
    if ($scope.scale > 0.4) {
        $scope.scale -= 0.2;
        $scope.renderPage($scope.currentPage);
    }
};
```

#### Reset Zoom
```javascript
$scope.resetZoom = function() {
    $scope.scale = 1.0;
    $scope.renderPage($scope.currentPage);
};
```

**Zoom Range:** 0.4x to unlimited (increments of 0.2)

### Page Navigation

#### Next Page
```javascript
$scope.nextPage = function() {
    if ($scope.currentPage < $scope.totalPages) {
        $scope.currentPage++;
        $scope.renderPage($scope.currentPage);
    }
};
```

#### Previous Page
```javascript
$scope.previousPage = function() {
    if ($scope.currentPage > 1) {
        $scope.currentPage--;
        $scope.renderPage($scope.currentPage);
    }
};
```

### Polygon Management

#### Validate Polygon
```javascript
$scope.isValidPolygon = function() {
    return $scope.newPolygon.page && 
           $scope.newPolygon.x1 !== null && $scope.newPolygon.y1 !== null &&
           $scope.newPolygon.x2 !== null && $scope.newPolygon.y2 !== null &&
           $scope.newPolygon.x3 !== null && $scope.newPolygon.y3 !== null &&
           $scope.newPolygon.x4 !== null && $scope.newPolygon.y4 !== null;
};
```

#### Add Polygon
```javascript
$scope.addPolygonCoordinate = function() {
    if ($scope.isValidPolygon()) {
        $scope.polygons.push({...$scope.newPolygon});
        // Reset form
        $scope.newPolygon = {page: $scope.currentPage};
    }
};
```

#### Parse Coordinate String
```javascript
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
    } else {
        alert('Invalid coordinate string format');
    }
};
```

#### Remove Polygon
```javascript
$scope.removePolygon = function(index) {
    $scope.polygons.splice(index, 1);
};
```

#### Navigate to Polygon
```javascript
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
```

#### Highlight Polygon
```javascript
$scope.highlightPolygon = function(poly) {
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
```

**Process:**
1. Calculate center point of polygon
2. Convert to canvas coordinates
3. Show marker at center
4. Draw red polygon outline on canvas
5. Smooth scroll to center

## 🔄 Key Data Flow

```
1. User uploads PDF → FileReader → PDF.js → Canvas rendering
2. User uploads JSON → FileReader → JSON.parse → Field data storage
3. User clicks field → Parse coordinates → Navigate to location
4. User searches → Filter fields → Update sidebar display
5. User adds polygon → Validate → Store in array → Enable navigation
```

## 🎯 Error Handling

- **PDF Loading Errors** - Catch and display user-friendly messages
- **JSON Parsing Errors** - Detailed error messages with suggestions
- **Coordinate Parsing Errors** - Validation and fallback handling
- **Canvas Errors** - Check for element existence before operations

## ⚡ Performance Optimizations

- **Lazy Loading** - Only render current page
- **Debounced Search** - Efficient field filtering
- **Memory Management** - Clean up PDF resources
- **Canvas Optimization** - Efficient coordinate calculations

## 🚀 Getting Started

1. **Clone or download** the application files
2. **Open `index-v2.html`** in a modern web browser
3. **Upload a PDF file** using the upload section
4. **Upload JSON annotation data** using the JSON upload section
5. **Click on fields** in the sidebar to navigate to their locations
6. **Use search** to filter fields
7. **Use zoom and page controls** for navigation

## 🔧 ServiceNow Integration

The application has been adapted for ServiceNow Service Portal. See the separate ServiceNow setup files:
- `pdf-navigator-widget.html` - Widget HTML template
- `pdf-navigator-widget.css` - Widget styles
- `pdf-navigator-widget.js` - Widget controller
- `pdf-navigator-widget.json` - Widget configuration

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

This JavaScript controller provides a complete PDF navigation system with robust error handling, efficient data processing, and smooth user interactions.