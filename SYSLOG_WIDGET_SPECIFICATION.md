# ServiceNow Syslog Viewer Widget - Development Specification

## Overview
Create a real-time syslog viewer widget for ServiceNow Service Portal that polls the `syslog` table and displays logs with a professional logger-like UI. The widget should be scoped to `x_gegis_uwm_dashbo` application only.

---

## Widget Details

| Property | Value |
|----------|-------|
| **Widget Name** | Syslog Viewer |
| **Widget ID** | `x_gegis_uwm_dashbo_syslog_viewer` |
| **Scope** | `x_gegis_uwm_dashbo` |
| **Table** | `syslog` |

---

## Table Fields to Display

| Field Name | Column Label | Type | Notes |
|------------|--------------|------|-------|
| `sys_created_on` | Created | DateTime | Primary sort field |
| `level` | Level | Integer | 0=Debug, 1=Info, 2=Warning, 3=Error |
| `message` | Message | String | Main log content |
| `source` | Source | String | Source script/function |
| `sys_class_name` | Class | String | Class name |
| `context_map` | Context Map | String | Additional context |
| `sys_created_by` | Created By | String | User who triggered the log |
| `sequence` | Sequence | Integer | Log sequence number |
| `source_application_family` | Source Application | String | Application family |
| `source_package` | Source Package | String | Package name |

---

## Core Features

### 1. Real-Time Polling (KEY FEATURE)
```javascript
// Polling Configuration
var POLL_CONFIG = {
  intervalMs: 3000,        // Poll every 3 seconds
  maxRecords: 200,         // Max records to display
  autoScroll: true,        // Auto-scroll to newest logs
  pauseOnHover: true       // Pause polling when user hovers
};
```

**Polling Requirements:**
- Poll server every 3 seconds (configurable)
- Only fetch NEW logs since last poll (use `sys_created_on > lastFetchTime`)
- Prepend new logs to existing list (newest first by default)
- Show "New logs available" indicator when paused
- Allow user to pause/resume polling
- Show last poll timestamp

### 2. Scope Filtering (MANDATORY)
```javascript
// ALWAYS filter by scope - this is a security requirement
gr.addQuery('source', 'CONTAINS', 'x_gegis_uwm_dashbo');
// OR
gr.addQuery('source_package', 'x_gegis_uwm_dashbo');
```

### 3. Log Level Filtering
Display logs with color-coded badges:

| Level | Value | Color | Badge |
|-------|-------|-------|-------|
| Debug | 0 | Gray | `#6c757d` |
| Info | 1 | Blue | `#0078d4` |
| Warning | 2 | Yellow/Amber | `#f9a825` |
| Error | 3 | Red | `#d13438` |

**Filter UI:**
- Toggle buttons for each level (allow multi-select)
- Quick presets: "All", "Warnings & Errors", "Errors Only"

### 4. Search & Filter
- **Real-time search** across message, source, created_by
- **Quick filters dropdown:**
  - By Source (script/function name)
  - By Created By (user)
  - By Level
  - By Date Range

### 5. Sorting
- **Default:** `sys_created_on DESC` (newest first)
- **Sortable columns:** Created, Level, Source, Created By
- **Click column header to toggle ASC/DESC**

---

## UI Design (Logger-style)

### Layout
```
┌────────────────────────────────────────────────────────────────────┐
│ 🔍 Syslog Viewer - x_gegis_uwm_dashbo                    [⏸ Pause] │
├────────────────────────────────────────────────────────────────────┤
│ [Search...              ] [Level ▼] [Source ▼] [Date Range]       │
│ ○ All  ● Info  ● Warning  ● Error  ○ Debug     Last: 12:45:32 PM │
├────────────────────────────────────────────────────────────────────┤
│ TIMESTAMP       │ LEVEL   │ SOURCE              │ MESSAGE          │
├────────────────────────────────────────────────────────────────────┤
│ 12:45:30.123   │ 🔴 ERR  │ PdfNavWidget        │ Failed to load... │
│ 12:45:28.456   │ 🟡 WARN │ ExtractionUtils     │ Missing field...  │
│ 12:45:25.789   │ 🔵 INFO │ SubmissionPayload   │ Processing sub... │
│ 12:45:22.012   │ ⚪ DBG  │ ServerScript        │ Query returned... │
│ ...            │         │                     │                   │
├────────────────────────────────────────────────────────────────────┤
│ Showing 45 of 200 logs │ Polling: Active │ [Clear] [Export CSV]   │
└────────────────────────────────────────────────────────────────────┘
```

### Log Row Design
- **Monospace font** for message content
- **Alternating row colors** for readability
- **Expandable rows** - click to see full details:
  - Full message (if truncated)
  - Context map
  - Source package
  - Stack trace (if available)
- **Highlight new rows** with fade-in animation

---

## Server Script Requirements

### fetchLogs Action
```javascript
function fetchLogs() {
  var logs = [];
  var lastTimestamp = input.lastTimestamp || '';
  var levelFilter = input.levelFilter || [];
  var searchTerm = input.searchTerm || '';
  var limit = input.limit || 200;

  var gr = new GlideRecord('syslog');
  
  // MANDATORY: Scope filter
  gr.addQuery('source', 'CONTAINS', 'x_gegis_uwm_dashbo');
  
  // Only new logs if timestamp provided
  if (lastTimestamp) {
    gr.addQuery('sys_created_on', '>', lastTimestamp);
  }
  
  // Level filter
  if (levelFilter.length > 0) {
    gr.addQuery('level', 'IN', levelFilter.join(','));
  }
  
  // Search filter
  if (searchTerm) {
    var qc = gr.addQuery('message', 'CONTAINS', searchTerm);
    qc.addOrCondition('source', 'CONTAINS', searchTerm);
    qc.addOrCondition('sys_created_by', 'CONTAINS', searchTerm);
  }
  
  gr.orderByDesc('sys_created_on');
  gr.setLimit(limit);
  gr.query();
  
  while (gr.next()) {
    logs.push({
      sys_id: gr.getUniqueValue(),
      created: gr.getValue('sys_created_on'),
      created_display: gr.getDisplayValue('sys_created_on'),
      level: parseInt(gr.getValue('level')),
      level_display: getLevelDisplay(gr.getValue('level')),
      message: gr.getValue('message'),
      source: gr.getValue('source'),
      created_by: gr.getValue('sys_created_by'),
      source_package: gr.getValue('source_package'),
      context_map: gr.getValue('context_map'),
      sequence: gr.getValue('sequence'),
      sys_class_name: gr.getValue('sys_class_name')
    });
  }
  
  data.logs = logs;
  data.serverTime = new GlideDateTime().getValue();
  data.success = true;
}

function getLevelDisplay(level) {
  var levels = { '0': 'DEBUG', '1': 'INFO', '2': 'WARNING', '3': 'ERROR' };
  return levels[level] || 'UNKNOWN';
}
```

---

## Client Script Requirements

### Polling Implementation
```javascript
var pollTimer = null;
var isPolling = true;
var lastTimestamp = '';

c.startPolling = function() {
  if (pollTimer) return;
  isPolling = true;
  pollTimer = $interval(function() {
    if (isPolling) {
      fetchNewLogs();
    }
  }, c.pollInterval);
};

c.stopPolling = function() {
  if (pollTimer) {
    $interval.cancel(pollTimer);
    pollTimer = null;
  }
};

c.togglePolling = function() {
  isPolling = !isPolling;
  c.pollingStatus = isPolling ? 'Active' : 'Paused';
};

function fetchNewLogs() {
  c.server.get({
    action: 'fetchLogs',
    lastTimestamp: lastTimestamp,
    levelFilter: c.selectedLevels,
    searchTerm: c.searchTerm,
    limit: 50
  }).then(function(response) {
    if (response.data.logs.length > 0) {
      // Prepend new logs
      c.logs = response.data.logs.concat(c.logs);
      // Trim to max
      if (c.logs.length > c.maxLogs) {
        c.logs = c.logs.slice(0, c.maxLogs);
      }
      lastTimestamp = response.data.serverTime;
      c.newLogCount += response.data.logs.length;
    }
    c.lastPollTime = new Date().toLocaleTimeString();
  });
}
```

---

## CSS Styling Requirements

### Colors
```css
:root {
  --log-debug: #6c757d;
  --log-info: #0078d4;
  --log-warning: #f9a825;
  --log-error: #d13438;
  --bg-dark: #1e1e1e;
  --bg-row-odd: #252526;
  --bg-row-even: #2d2d2d;
  --text-primary: #d4d4d4;
  --text-muted: #808080;
}
```

### Key Styles
- **Dark theme** (logger-like)
- **Monospace font** for log messages
- **Compact rows** (height: 28-32px)
- **Sticky header** for controls
- **Word-wrap** for long messages
- **Hover highlight** on rows
- **Smooth animations** for new log entries

---

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Toggle pause/resume polling |
| `Escape` | Clear search |
| `Ctrl+K` | Focus search |
| `1-4` | Toggle level filters (1=Debug, 2=Info, 3=Warn, 4=Error) |
| `C` | Clear all logs |

---

## Export Features
- **Copy single log** to clipboard
- **Export visible logs** as CSV
- **Export visible logs** as JSON

---

## Widget Options (Configurable)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `poll_interval` | Integer | 3000 | Polling interval in milliseconds |
| `max_logs` | Integer | 200 | Maximum logs to display |
| `auto_scroll` | Boolean | true | Auto-scroll to new logs |
| `default_levels` | String | "1,2,3" | Default level filters (comma-separated) |
| `show_debug` | Boolean | false | Show debug logs by default |

---

## Security Considerations
1. **ALWAYS filter by scope** - never show logs outside `x_gegis_uwm_dashbo`
2. **Rate limit polling** - minimum 2 seconds between polls
3. **Sanitize search input** - prevent injection
4. **Limit query results** - max 500 records per query

---

## Performance Optimization
1. **Incremental loading** - only fetch new logs, not all
2. **Virtual scrolling** - for large log lists (200+ entries)
3. **Debounced search** - 300ms delay before searching
4. **Truncate long messages** - show first 200 chars, expand on click

---

## Files to Create

```
syslog-viewer-widget/
├── clientscript.js     # Client-side logic with polling
├── serverscript.js     # Server-side GlideRecord queries
├── html                # Widget HTML template
├── css                 # Styling (dark theme, logger-style)
└── README.md           # Documentation
```

---

## Development Notes

### Testing the Widget
1. Add `gs.info('Test message from x_gegis_uwm_dashbo')` in other scripts
2. Watch the widget update in real-time
3. Test filtering by level, search, and source

### Sample Test Code
```javascript
// Add to any server script in the scope to test
gs.debug('[x_gegis_uwm_dashbo] Debug: Testing debug level');
gs.info('[x_gegis_uwm_dashbo] Info: Processing started');
gs.warn('[x_gegis_uwm_dashbo] Warning: Missing optional field');
gs.error('[x_gegis_uwm_dashbo] Error: Failed to process record');
```
