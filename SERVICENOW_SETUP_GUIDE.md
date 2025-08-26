# ServiceNow Service Portal Setup Guide for PDF Navigator Widget

## Overview
This guide will help you deploy the PDF Navigator Widget to your ServiceNow Service Portal. The widget allows users to upload PDF files and JSON annotation data to navigate through document fields with coordinate-based highlighting.

## Prerequisites
- ServiceNow instance with Service Portal enabled
- Admin access to Service Portal
- Access to System Definition > UI Scripts
- Access to Service Portal > Widgets

## Step 1: Create UI Scripts for External Libraries

### 1.1 Create AngularJS UI Script
1. Navigate to **System Definition > UI Scripts**
2. Click **New**
3. Fill in the following details:
   - **Name**: `AngularJS 1.8.3`
   - **Type**: `Script`
   - **Script**: Copy the content from `https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.8.3/angular.min.js`
4. Click **Submit**

### 1.2 Create PDF.js UI Script
1. Navigate to **System Definition > UI Scripts**
2. Click **New**
3. Fill in the following details:
   - **Name**: `PDF.js 2.11.338`
   - **Type**: `Script`
   - **Script**: Copy the content from `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js`
4. Click **Submit**

### 1.3 Create PDF.js Worker UI Script
1. Navigate to **System Definition > UI Scripts**
2. Click **New**
3. Fill in the following details:
   - **Name**: `PDF.js Worker 2.11.338`
   - **Type**: `Script`
   - **Script**: Copy the content from `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`
4. Click **Submit**

## Step 2: Create the Widget

### 2.1 Create Widget Record
1. Navigate to **Service Portal > Widgets**
2. Click **New**
3. Fill in the following details:
   - **Name**: `PDF Navigator Widget`
   - **ID**: `pdf_navigator_widget`
   - **Description**: `A widget for navigating PDF documents with JSON annotation data`
   - **Template**: Leave empty (we'll add it in the next step)

### 2.2 Add HTML Template
1. In the widget record, click on the **HTML** tab
2. Copy and paste the content from `pdf-navigator-widget.html`
3. Click **Save**

### 2.3 Add CSS Styles
1. In the widget record, click on the **CSS** tab
2. Copy and paste the content from `pdf-navigator-widget.css`
3. Click **Save**

### 2.4 Add JavaScript Controller
1. In the widget record, click on the **Client Controller** tab
2. Copy and paste the content from `pdf-navigator-widget.js`
3. Click **Save**

### 2.5 Add Dependencies
1. In the widget record, click on the **Dependencies** tab
2. Add the following dependencies:
   - **AngularJS 1.8.3** (UI Script)
   - **PDF.js 2.11.338** (UI Script)
   - **PDF.js Worker 2.11.338** (UI Script)

## Step 3: Create Widget Options (Optional)

### 3.1 Add Widget Options
1. In the widget record, click on the **Options Schema** tab
2. Add the following JSON schema:
```json
{
  "title": {
    "type": "string",
    "default": "PDF Field Navigator",
    "description": "Widget title"
  },
  "max_file_size": {
    "type": "number",
    "default": 10,
    "description": "Maximum file size in MB"
  }
}
```

## Step 4: Deploy to Service Portal

### 4.1 Add Widget to Page
1. Navigate to **Service Portal > Pages**
2. Create a new page or edit an existing page
3. Click **Edit** to enter the page designer
4. Drag the **PDF Navigator Widget** from the widget palette to the page
5. Configure any widget options if needed
6. Click **Save**

### 4.2 Test the Widget
1. Navigate to the Service Portal page where you added the widget
2. Test the following functionality:
   - Upload a PDF file
   - Upload a JSON annotation file
   - Navigate to fields using the sidebar
   - Use zoom and page navigation controls
   - Test polygon coordinate navigation

## Step 5: Security Considerations

### 5.1 File Upload Security
The widget includes basic file validation:
- File type validation for PDF and JSON files
- File size limits (configurable, default 10MB)
- Client-side validation before upload

### 5.2 CORS Considerations
If you encounter CORS issues with external CDN resources:
1. Consider hosting the libraries locally in ServiceNow
2. Add appropriate CORS headers to your ServiceNow instance
3. Use ServiceNow's built-in CDN if available

## Step 6: Troubleshooting

### 6.1 Common Issues

**Widget not loading:**
- Check browser console for JavaScript errors
- Verify all UI Scripts are properly created and accessible
- Ensure widget dependencies are correctly configured

**PDF not rendering:**
- Check if PDF.js library is loaded correctly
- Verify PDF file is not corrupted
- Check browser console for PDF.js errors

**JSON parsing errors:**
- Verify JSON file format matches expected structure
- Check for BOM characters in JSON file
- Ensure JSON is valid syntax

**Styling issues:**
- Check if CSS is properly loaded
- Verify ServiceNow portal theme compatibility
- Check for CSS conflicts with existing styles

### 6.2 Debug Mode
To enable debug mode, add this to the widget's client controller:
```javascript
$scope.debugMode = true;
```

## Step 7: Customization

### 7.1 Modify Widget Options
You can customize the widget by modifying the options schema and updating the controller to use these options.

### 7.2 Add Additional Features
Consider adding these features:
- Save/load coordinate data to/from ServiceNow records
- Integration with ServiceNow file attachments
- Export coordinate data
- Batch processing of multiple PDFs

### 7.3 Theme Integration
The widget is designed to work with ServiceNow's default themes. For custom themes:
- Update CSS variables to match your theme
- Test with different ServiceNow themes
- Ensure proper contrast and accessibility

## Step 8: Performance Optimization

### 8.1 Large PDF Files
For better performance with large PDFs:
- Implement lazy loading for PDF pages
- Add progress indicators for file uploads
- Consider server-side PDF processing

### 8.2 Memory Management
- The widget automatically cleans up PDF resources
- Consider implementing virtual scrolling for large field lists
- Monitor memory usage in browser developer tools

## Support and Maintenance

### 8.1 Regular Updates
- Keep external libraries updated
- Monitor for security vulnerabilities
- Test with new ServiceNow releases

### 8.2 User Training
- Provide user documentation
- Create training materials
- Set up support channels

## Files Included
- `pdf-navigator-widget.html` - Widget HTML template
- `pdf-navigator-widget.css` - Widget styles
- `pdf-navigator-widget.js` - Widget controller
- `pdf-navigator-widget.json` - Widget configuration
- `new_extracted.json` - Sample JSON data for testing

## Sample JSON Structure
The widget expects JSON data in this format:
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

The `source` field contains coordinate data in the format: `D(page,x1,y1,x2,y2,x3,y3,x4,y4)`
