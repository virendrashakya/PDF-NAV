# PDF-NAV Widget - LOB Filtering Documentation

## Overview

The PDF-NAV widget dynamically filters which fields are shown based on the **Line of Business (LOB)** of each submission. This means different submissions show different fields depending on their LOB value.

---

## How It Works (Simple Explanation)

1. When a user opens a submission, the widget reads the `line_of_business` column from the submission record
2. Based on this value, the widget filters the fields to show only relevant ones
3. When the user clicks "Complete", the widget calls the appropriate method based on the LOB

---

## Configuration Location

All LOB settings are in **`serverscript.js`** inside the `CONFIG` object (around lines 49-55):

```javascript
lobMapping: {
  'Auto': { lobContains: '(AU)', version: '1.1-DM' },
  'Property': { lobContains: '(PR)', version: null },
  'General Liability': { lobContains: '(GL)', version: null }
}
```

---

## What Each Setting Means

### `lobMapping` Object

This is a simple lookup table. The **key** is the `line_of_business` value from the submission, and the **value** tells the widget how to filter.

| Key (line_of_business value) | lobContains | version | What it does |
|---|---|---|---|
| `'Auto'` | `'(AU)'` | `'1.1-DM'` | Shows fields where metadata `lob` contains "(AU)" AND `version` equals "1.1-DM" |
| `'Property'` | `'(PR)'` | `null` | Shows fields where metadata `lob` contains "(PR)" (any version) |
| `'General Liability'` | `'(GL)'` | `null` | Shows fields where metadata `lob` contains "(GL)" (any version) |

**If `line_of_business` is empty or not in this list** → all fields are shown (no filtering).

### How Combined LOB Codes Work

The filter uses **partial matching** (substring search), so a metadata field with combined codes like `lob = "(PR)(GL)(AU)"` will match **multiple** LOBs:

| Metadata `lob` value | Auto (AU) | Property (PR) | General Liability (GL) |
|---|---|---|---|
| `(AU)` | ✅ Shows | ❌ Hidden | ❌ Hidden |
| `(PR)` | ❌ Hidden | ✅ Shows | ❌ Hidden |
| `(GL)` | ❌ Hidden | ❌ Hidden | ✅ Shows |
| `(PR)(GL)(AU)` | ✅ Shows | ✅ Shows | ✅ Shows |

**This is intentional!** A field with `lob = "(PR)(GL)(AU)"` is relevant to all three lines of business, so it appears for Auto, Property, AND General Liability submissions.

The code uses `indexOf()` to check if the LOB code exists anywhere in the string:

```javascript
var lobMatches = dbLob && dbLob.indexOf(lobFilter.lobContains) !== -1;
```

---

## How to Add a New LOB

### Step 1: Find the LOB Mapping

Open `serverscript.js` and find the `lobMapping` section (around line 49):

```javascript
lobMapping: {
  'Auto': { lobContains: '(AU)', version: '1.1-DM' },
  'Property': { lobContains: '(PR)', version: null },
  'General Liability': { lobContains: '(GL)', version: null }
}
```

### Step 2: Add Your New LOB

Add a new line following the same pattern:

```javascript
lobMapping: {
  'Auto': { lobContains: '(AU)', version: '1.1-DM' },
  'Property': { lobContains: '(PR)', version: null },
  'General Liability': { lobContains: '(GL)', version: null },
  'Marine': { lobContains: '(MA)', version: null }  // NEW LINE
}
```

**Important:** 
- The key (`'Marine'`) must **exactly match** the value in `line_of_business` column
- `lobContains` is what the metadata `lob` field should contain (partial match)
- `version` can be `null` (any version) or a specific value like `'1.1-DM'`

---

## How to Change the Filter for an Existing LOB

Just edit the values in `lobMapping`. For example, to change Auto to only require "(AU)" without version check:

**Before:**
```javascript
'Auto': { lobContains: '(AU)', version: '1.1-DM' }
```

**After:**
```javascript
'Auto': { lobContains: '(AU)', version: null }
```

---

## How to Remove a LOB Filter

Simply delete the line from `lobMapping`. That LOB will then fall back to showing all fields.

---

## Complete Action Method Selection

When the user clicks **"Complete"**, the widget automatically selects the correct method:

| line_of_business | Method Called |
|---|---|
| `'Auto'` | `payloadBuilder.buildAutoSubmissionModel()` |
| Any other value | `payloadBuilder.buildSubmissionModel()` |

### Where This Code Lives

In `serverscript.js`, inside the `markComplete()` function (around lines 213-245):

```javascript
if (lineOfBusiness === 'Auto') {
  paylodModelStructure = payloadBuilder.buildAutoSubmissionModel(flatData, submissionNumber, false);
} else {
  paylodModelStructure = payloadBuilder.buildSubmissionModel(flatData, submissionNumber, false);
}
```

### To Add Another Special Case

If you need a different method for another LOB, modify the condition:

```javascript
if (lineOfBusiness === 'Auto') {
  paylodModelStructure = payloadBuilder.buildAutoSubmissionModel(flatData, submissionNumber, false);
} else if (lineOfBusiness === 'Marine') {
  paylodModelStructure = payloadBuilder.buildMarineSubmissionModel(flatData, submissionNumber, false);
} else {
  paylodModelStructure = payloadBuilder.buildSubmissionModel(flatData, submissionNumber, false);
}
```

---

## Database Column Reference

| Table | Column | Description |
|---|---|---|
| `x_gegis_uwm_dashbo_submission` | `line_of_business` | The LOB value (e.g., "Auto", "Property") |
| `x_gegis_uwm_dashbo_data_extraction_metadata` | `lob` | Contains LOB codes like "(AU)", "(PR)", "(GL)" |
| `x_gegis_uwm_dashbo_data_extraction_metadata` | `version` | Version string like "1.1-DM" |

---

## Troubleshooting

### Fields Not Showing?

1. Check if `line_of_business` has a value in the submission record
2. Verify the `lobMapping` key matches exactly (case-sensitive)
3. Check if metadata records have the correct `lob` values

### "No Document Returned From Submission" Error

This error appears when fields are displayed but the PDF document doesn't load. This happens when the filtered line items don't have the `documentname_attachment_sysid` column populated.

**Cause:** The line items that pass the LOB filter have empty/null `documentname_attachment_sysid` values, so no PDF attachment can be loaded.

**How to Debug (Manual Testing):**

1. **Open the Submission record** in ServiceNow
2. **Copy the `data_extract` sys_id** from the submission
3. **Open the Line Item table** (`x_gegis_uwm_dashbo_data_extraction_lineitem`)
4. **Filter by parent column** = the data_extract sys_id you copied
5. **Check the `documentname_attachment_sysid` column** - if it's empty for all filtered records, that's the issue

**Quick Fix for Testing:**

To test the widget, you can manually update the line items with an attachment sys_id:

1. Go to `sys_attachment` table
2. Find a PDF attachment from your submission
3. Copy its `sys_id`
4. On the Line Item records, update `documentname_attachment_sysid` with this sys_id

> **Note:** This is only for testing. Production data should already have this mapping populated by the extraction process.

**Debug Script:**

Run this in Background Scripts to check attachment mappings for filtered fields:

```javascript
var submissionSysId = 'YOUR_SUBMISSION_SYS_ID';

var subGr = new GlideRecord('x_gegis_uwm_dashbo_submission');
if (subGr.get(submissionSysId)) {
  var dataExtract = subGr.getValue('data_extract');
  var lob = subGr.getValue('line_of_business');
  
  gs.info('line_of_business = "' + lob + '"');
  
  var liGr = new GlideRecord('x_gegis_uwm_dashbo_data_extraction_lineitem');
  liGr.addQuery('parent', dataExtract);
  liGr.setLimit(50);
  liGr.query();
  
  var withAttachment = 0;
  var withoutAttachment = 0;
  
  while (liGr.next()) {
    var metaId = liGr.getValue('metadata_id');
    var docSysId = liGr.getValue('documentname_attachment_sysid');
    
    if (metaId) {
      var metaGr = new GlideRecord('x_gegis_uwm_dashbo_data_extraction_metadata');
      if (metaGr.get(metaId)) {
        var metaLob = metaGr.getValue('lob');
        // Log each field's attachment status
        gs.info('Field lob="' + metaLob + '", has_attachment=' + (docSysId ? 'YES' : 'NO'));
        if (docSysId) withAttachment++;
        else withoutAttachment++;
      }
    }
  }
  
  gs.info('=== SUMMARY ===');
  gs.info('Fields WITH attachment: ' + withAttachment);
  gs.info('Fields WITHOUT attachment: ' + withoutAttachment);
}
```

### Debug Script - Check LOB Values

Run this in ServiceNow Background Scripts to see what values exist:

```javascript
var submissionSysId = 'YOUR_SUBMISSION_SYS_ID';

var gr = new GlideRecord('x_gegis_uwm_dashbo_submission');
if (gr.get(submissionSysId)) {
  gs.info('line_of_business = "' + gr.getValue('line_of_business') + '"');
}
```

### Check System Logs

The widget logs the LOB filter being used. Search for `PDF-NAV:` in System Logs.

---

## Technical Deep Dive

This section explains the complete method chaining and code flow for developers who want to understand or modify the internals.

### Function Call Flow - Fetch Mapping (Loading Fields)

When a user opens a submission, the following chain executes:

```
User opens widget
       ↓
clientscript.js: c.fetchMapping()
       ↓
Server call with submissionSysId
       ↓
serverscript.js: fetchMapping()
       ↓
   ┌───────────────────────────────────────────────────────┐
   │ 1. Query submission table                             │
   │    submissionGr.get(submissionSysId)                  │
   │                                                       │
   │ 2. Get line_of_business value                         │
   │    var lineOfBusiness = _getValue(submissionGr,       │
   │        CONFIG.submissionColumns.lineOfBusiness)       │
   │                                                       │
   │ 3. Get filter from CONFIG                             │
   │    var lobFilter = CONFIG.lobMapping[lineOfBusiness]  │
   │                                                       │
   │ 4. Query line items                                   │
   │    lineItemGr.addQuery(parent, dataExtractSysId)      │
   │                                                       │
   │ 5. For each line item:                                │
   │    → Get metadata record                              │
   │    → Check if lob contains lobFilter.lobContains      │
   │    → Check version if specified                       │
   │    → If matches, add to results                       │
   └───────────────────────────────────────────────────────┘
       ↓
Returns filtered field data to client
```

### Function Call Flow - Mark Complete

When user clicks "Complete" button:

```
User clicks "Complete"
       ↓
clientscript.js: c.markAsComplete()
       ↓
clientscript.js: c.confirmComplete()  (after modal confirmation)
       ↓
Server call with submissionNumber
       ↓
serverscript.js: markComplete()
       ↓
   ┌───────────────────────────────────────────────────────┐
   │ 1. Get line_of_business                               │
   │    var lineOfBusiness = _getSubmissionLineOfBusiness( │
   │        submissionNumber)                              │
   │                                                       │
   │ 2. Build flat data                                    │
   │    var flatData = extractUtils                        │
   │        .bulildJsonFromDataExtracLineItem(             │
   │            submissionNumber)                          │
   │                                                       │
   │ 3. Choose method based on LOB                         │
   │    if (lineOfBusiness === 'Auto') {                   │
   │        → buildAutoSubmissionModel()                   │
   │    } else {                                           │
   │        → buildSubmissionModel()                       │
   │    }                                                  │
   │                                                       │
   │ 4. Process and insert data                            │
   │    extractUtils.processSubmissionExtractionAndInsert  │
   │        Data(paylodModelStructure, false)              │
   └───────────────────────────────────────────────────────┘
       ↓
Returns success/error to client
```

### Key Functions Reference

| Function | Location | Purpose |
|---|---|---|
| `fetchMapping()` | serverscript.js:300 | Main function to load filtered fields |
| `markComplete()` | serverscript.js:213 | Main function for complete action |
| `_getSubmissionLineOfBusiness()` | serverscript.js:250 | Helper to get LOB from submission number |
| `_getValue()` | serverscript.js:77 | Helper to safely get GlideRecord values |

### Key Variables in fetchMapping()

```javascript
// Line 334-336: Get LOB from submission
var lineOfBusiness = _getValue(submissionGr, CONFIG.submissionColumns.lineOfBusiness);
var lobFilter = CONFIG.lobMapping[lineOfBusiness] || null;

// Line 366: Check if metadata LOB contains the required code
var lobMatches = dbLob && dbLob.indexOf(lobFilter.lobContains) !== -1;

// Line 368: Check version (if specified in filter)
var versionMatches = !lobFilter.version || dbVersion === lobFilter.version;

// Line 370-371: Include field only if both match
if (lobMatches && versionMatches) {
  includeField = true;
}
```

### External Class Dependencies

The `markComplete()` function uses these external ServiceNow classes:

```javascript
// Extraction utilities class
var extractUtils = new ExtractionUtils();

// Payload builder class
var payloadBuilder = new SubmissionPayloadBuilder();
```

**Methods called on ExtractionUtils:**
- `bulildJsonFromDataExtracLineItem(submissionNumber)` - Builds JSON from line items
- `processSubmissionExtractionAndInsertData(payload, flag)` - Processes and saves data

**Methods called on SubmissionPayloadBuilder:**
- `buildAutoSubmissionModel(flatData, submissionNumber, flag)` - For Auto LOB
- `buildSubmissionModel(flatData, submissionNumber, flag)` - For other LOBs

### CONFIG Object Structure

```javascript
var CONFIG = {
  tables: {
    lineItem: 'x_gegis_uwm_dashbo_data_extraction_lineitem',
    metadata: 'x_gegis_uwm_dashbo_data_extraction_metadata',
    submission: 'x_gegis_uwm_dashbo_submission',
    attachment: 'sys_attachment'
  },
  
  metadataColumns: {
    sectionName: 'section_name',
    modelLabel: 'model_label',
    columnLabel: 'column_label',
    order: 'order',
    lob: 'lob',           // Used for LOB filtering
    version: 'version'     // Used for version filtering
  },
  
  lobMapping: {
    'Auto': { lobContains: '(AU)', version: '1.1-DM' },
    'Property': { lobContains: '(PR)', version: null },
    'General Liability': { lobContains: '(GL)', version: null }
  },
  
  submissionColumns: {
    number: 'number',
    statusChoice: 'submission_status_choice',
    dataExtract: 'data_extract',
    lineOfBusiness: 'line_of_business'  // Source of LOB value
  }
};
```

---

## Quick Reference Cheat Sheet

| Task | Where to Change |
|---|---|
| Add new LOB filter | `serverscript.js` → `CONFIG.lobMapping` |
| Change what fields show for LOB | Edit `lobContains` or `version` in `lobMapping` |
| Change Complete method for a LOB | `serverscript.js` → `markComplete()` function |
| Change column name for LOB | `serverscript.js` → `CONFIG.submissionColumns.lineOfBusiness` |

---

## File Locations

- **Server Script:** `widget v2 - azurui/serverscript.js`
- **Client Script:** `widget v2 - azurui/clientscript.js`  
- **HTML Template:** `widget v2 - azurui/html`
- **CSS Styles:** `widget v2 - azurui/css`

---

*Last Updated: January 25, 2026*
