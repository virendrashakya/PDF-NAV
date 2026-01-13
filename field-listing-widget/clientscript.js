api.controller = function ($scope, $rootScope, $location, $filter, $window, spUtil, $timeout) {
    /* ============================================
     * Field Listing Widget - Client Script
     * ============================================
     * Handles: Data display, field grouping, editing,
     * saving, and communication with PDF Viewer widget
     * ============================================ */

    var c = this;

    /* ============================================
     * STATE VARIABLES
     * ============================================ */

    // Field data
    c.extractedFields = [];
    c.groupedFields = {};
    c.collapsedSections = {};
    c.fieldSearch = '';

    // Active field
    c.activeField = null;

    // Document selection
    c.documents = [];
    c.selectedDocument = '';

    // Filter toggle
    c.filterDocumentOnly = false;

    // Loading states
    c.isLoading = false;
    c.isSaving = false;
    c.loadingMessage = 'Loading...';
    c.isCompleting = false;

    // Change tracking
    c.hasChanges = false;
    c.changedFields = {};

    // Auto-save status
    c.saveStatus = '';
    c.saveStatusMessage = '';
    c.lastSavedTime = null;

    // Submission status
    c.dataReview = 'CONFIRM_DATA_REVIEW';
    c.qaKey = 'QUALITY_ASSURANCE';
    c.submissionNumber = '';
    c.submissionStatusChoice = '';

    // URL parameters
    var submissionSysId = $location.search().submissionSysId || '';

    /* ============================================
     * INITIALIZATION
     * ============================================ */

    // Initialize on load
    $timeout(function () {
        loadSourceMapping();
    }, 100);

    /* ============================================
     * HELPER FUNCTIONS
     * ============================================ */

    c.trimInitialNumberAdvanced = function (text) {
        return text.replace(/^(Group:\s*\d+\s*|\d+(?:\.\d+)*[\.\)\-\s]*)/, '').trim();
    };

    c.flatten = function (obj) {
        var result = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && Array.isArray(obj[key])) {
                result = result.concat(obj[key]);
            }
        }
        return result;
    };

    c.getFilteredCount = function () {
        return c.getFilteredByBoth().length;
    };

    c.getTotalCount = function () {
        return c.flatten(c.groupedFields).length;
    };

    c.getDocumentFieldCount = function () {
        if (!c.selectedDocument || !c.selectedDocument.name) {
            return c.getTotalCount();
        }
        return c.getFilteredByFileName(c.selectedDocument.name).length;
    };

    c.isFieldActive = function (field) {
        if (!c.selectedDocument || !field || !field.attachmentData) return false;
        return field.attachmentData.file_name === c.selectedDocument.name;
    };

    c.canNavigate = function (field) {
        return field && field.source && field.source.length > 0;
    };

    c.getFilteredByBoth = function () {
        return c.flatten(c.groupedFields);
    };

    c.toggleDocumentFilter = function () {
        c.filterDocumentOnly = !c.filterDocumentOnly;
    };

    c.shouldShowField = function (field) {
        if (!c.filterDocumentOnly) {
            return true;
        }
        var hasMatchingDocument = field.attachmentData &&
            c.selectedDocument &&
            field.attachmentData.file_name === c.selectedDocument.name;
        var hasSource = field.source && field.source.length > 0;
        return hasMatchingDocument && hasSource;
    };

    c.getVisibleFieldCount = function () {
        if (!c.filterDocumentOnly) {
            return c.getTotalCount();
        }
        var allFields = c.flatten(c.groupedFields);
        return allFields.filter(function (field) {
            return c.shouldShowField(field);
        }).length;
    };

    c.getFilteredByFileName = function (fileName) {
        var allFields = c.flatten(c.groupedFields);
        return allFields.filter(function (field) {
            return field.attachmentData && field.attachmentData.file_name === fileName;
        });
    };

    c.getObjectKeys = function (obj) {
        return obj ? Object.keys(obj) : [];
    };

    c.truncateText = function (text, maxLength) {
        if (!text) return '';
        maxLength = maxLength || 30;
        if (text.length > maxLength) {
            return text.substring(0, maxLength) + '...';
        }
        return text;
    };

    /* ============================================
     * SECTION TOGGLE
     * ============================================ */

    c.toggleSection = function (sectionName) {
        c.collapsedSections[sectionName] = !c.collapsedSections[sectionName];
    };

    c.isSectionCollapsed = function (sectionName) {
        return c.collapsedSections[sectionName] === true;
    };

    /* ============================================
     * DOCUMENT SELECTION
     * ============================================ */

    c.onDocumentChange = function () {
        if (c.selectedDocument && c.selectedDocument.url) {
            // Broadcast to PDF viewer to load document
            $rootScope.$broadcast('pdf-viewer:loadDocument', {
                url: c.selectedDocument.url
            });
        }
    };

    /* ============================================
     * FIELD NAVIGATION
     * ============================================ */

    c.navigateToField = function (field) {
        if (!field) return;

        c.activeField = field;

        // Parse coordinates if needed
        var coordinates = [];
        if (field.source && typeof field.source === 'string') {
            coordinates = parseMultipleCoordinateStrings(field.source);
        } else if (field.allCoordinates) {
            coordinates = field.allCoordinates;
        }

        if (coordinates.length === 0) {
            // No coordinates, just mark as active
            return;
        }

        // Determine document URL
        var documentUrl = '';
        if (field.attachmentData && field.attachmentData.file_url) {
            documentUrl = field.attachmentData.file_url;
        }

        // Broadcast to PDF viewer
        $rootScope.$broadcast('pdf-viewer:navigateToField', {
            coordinates: coordinates,
            documentUrl: documentUrl
        });
    };

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

    // Parse multiple coordinate strings
    function parseMultipleCoordinateStrings(source) {
        if (!source || typeof source !== 'string') return [];
        var coordinates = [];
        var dStrings = source.split(';');
        dStrings.forEach(function (dString) {
            var coord = parseCoordinateString(dString.trim());
            if (coord) {
                coordinates.push(coord);
            }
        });
        return coordinates;
    }

    /* ============================================
     * CHANGE TRACKING & SAVE
     * ============================================ */

    c.markFieldAsChanged = function (field) {
        if (field && field.sys_id) {
            c.changedFields[field.sys_id] = true;
            c.hasChanges = true;
        }
    };

    c.autoSaveField = function (field) {
        if (!field || !field.sys_id || !c.changedFields[field.sys_id]) {
            return;
        }

        var update = { sys_id: field.sys_id };

        if (c.submissionStatusChoice === c.dataReview) {
            update.data_verification = field.data_verification || '';
        } else if (c.submissionStatusChoice === c.qaKey) {
            update.qa_override_value = field.qa_override_value || '';
        } else {
            update.qa_override_value = field.qa_override_value || '';
            update.data_verification = field.data_verification || '';
        }
        update.commentary = field.commentary || '';

        c.saveStatus = 'saving';
        c.saveStatusMessage = 'Saving...';

        c.server.get({
            action: 'saveMapping',
            updates: [update]
        }).then(function (response) {
            if (response.data.success) {
                delete c.changedFields[field.sys_id];
                c.hasChanges = Object.keys(c.changedFields).length > 0;
                c.saveStatus = 'saved';
                c.lastSavedTime = new Date();
                c.saveStatusMessage = 'Saved at ' + c.formatTime(c.lastSavedTime);
                $timeout(function () {
                    if (c.saveStatus === 'saved') {
                        c.saveStatus = '';
                    }
                }, 3000);
            } else {
                c.saveStatus = 'error';
                c.saveStatusMessage = 'Save failed: ' + (response.data.error || 'Unknown error');
            }
        }).catch(function (error) {
            console.error('Auto-save error:', error);
            c.saveStatus = 'error';
            c.saveStatusMessage = 'Save failed';
        });
    };

    c.formatTime = function (date) {
        if (!date) return '';
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        seconds = seconds < 10 ? '0' + seconds : seconds;
        return hours + ':' + minutes + ':' + seconds + ' ' + ampm;
    };

    c.saveAllChanges = function () {
        if (!c.hasChanges || c.isSaving) return;

        var updates = [];
        var allFields = c.flatten(c.groupedFields);

        allFields.forEach(function (field) {
            if (c.changedFields[field.sys_id]) {
                var update = { sys_id: field.sys_id };
                if (c.submissionStatusChoice === c.dataReview) {
                    update.data_verification = field.data_verification || '';
                } else if (c.submissionStatusChoice === c.qaKey) {
                    update.qa_override_value = field.qa_override_value || '';
                } else {
                    update.qa_override_value = field.qa_override_value || '';
                    update.data_verification = field.data_verification || '';
                }
                updates.push(update);
            }
        });

        if (updates.length === 0) {
            spUtil.addInfoMessage('No changes to save');
            return;
        }

        c.isSaving = true;
        c.loadingMessage = 'Saving ' + updates.length + ' change(s)...';

        c.server.get({
            action: 'saveMapping',
            updates: updates
        }).then(function (response) {
            c.isSaving = false;
            if (response.data.success) {
                c.changedFields = {};
                c.hasChanges = false;
                spUtil.addInfoMessage(response.data.message || 'Changes saved successfully');
            } else {
                spUtil.addErrorMessage('Failed to save: ' + (response.data.error || 'Unknown error'));
            }
        }).catch(function (error) {
            c.isSaving = false;
            console.error('Save error:', error);
            spUtil.addErrorMessage('Failed to save changes');
        });
    };

    c.markAsComplete = function () {
        c.isCompleting = true;
        c.loadingMessage = 'Completing...';

        c.server.get({
            action: 'markComplete',
            submissionNumber: c.submissionNumber
        }).then(function (response) {
            c.isCompleting = false;
            if (response.data.success) {
                spUtil.addInfoMessage(response.data.message || 'Mark Complete successfully');
            } else {
                spUtil.addErrorMessage('Failed to complete: ' + (response.data.error || 'Unknown error'));
            }
        }).catch(function (error) {
            c.isCompleting = false;
            console.error('Mark Complete error:', error);
            spUtil.addErrorMessage('Failed to mark complete');
        });
    };

    /* ============================================
     * DATA LOADING
     * ============================================ */

    function loadSourceMapping() {
        if (!submissionSysId) {
            c.isLoading = false;
            return;
        }

        c.isLoading = true;
        c.loadingMessage = 'Loading field mappings...';

        c.server.get({
            action: 'fetchMapping',
            submissionSysId: submissionSysId
        }).then(function (response) {
            c.submissionNumber = response.data.submissionNumber;
            c.submissionStatusChoice = response.data.submissionStatusChoice || '';

            var documentList = extractAttachmentOptions(response.data.mapping);
            c.documents = documentList;
            c.selectedDocument = documentList[0];

            if (c.selectedDocument) {
                // Tell PDF viewer to load the first document
                $rootScope.$broadcast('pdf-viewer:loadDocument', {
                    url: c.selectedDocument.url
                });
            }

            if (response.data.success) {
                processMappingData(response.data.mapping);
            }
            c.isLoading = false;
        }).catch(function (error) {
            c.isLoading = false;
            console.error('Failed to load mapping:', error);
        });
    }

    function extractAttachmentOptions(jsonResponse) {
        var options = [];
        jsonResponse.forEach(function (record) {
            if (record.attachmentData && record.attachmentData.file_name && record.attachmentData.file_url) {
                options.push({
                    name: record.attachmentData.file_name,
                    url: record.attachmentData.file_url
                });
            }
        });

        var unique = [];
        var seen = {};
        options.forEach(function (opt) {
            if (!seen[opt.name]) {
                seen[opt.name] = true;
                unique.push(opt);
            }
        });
        return unique;
    }

    function processMappingData(mappingData) {
        if (!mappingData || !Array.isArray(mappingData)) {
            c.extractedFields = [];
            return;
        }

        var processedMappingData = mappingData.map(function (mapping) {
            var allCoordinates = parseMultipleCoordinateStrings(mapping.source);
            mapping.coordinates = allCoordinates.length > 0 ? allCoordinates[0] : null;
            mapping.allCoordinates = allCoordinates;
            return mapping;
        });

        c.groupedFields = groupFieldsBySection(processedMappingData);
    }

    function groupFieldsBySection(processedMappingData) {
        var grouped = {};
        var collapsed = {};

        if (!processedMappingData || processedMappingData.length === 0) {
            return grouped;
        }

        processedMappingData.forEach(function (field) {
            var sectionName = field.new_section_name || 'Uncategorized';

            if (!field.allCoordinates) {
                field.allCoordinates = field.coordinates ? [field.coordinates] : [];
            }

            if (!grouped[sectionName]) {
                grouped[sectionName] = [];
                collapsed[sectionName] = false;
            }

            grouped[sectionName].push(field);
        });

        c.collapsedSections = collapsed;

        // Sort sections alphabetically
        var sortedSections = {};
        Object.keys(grouped).sort().forEach(function (key) {
            sortedSections[key] = grouped[key];
        });

        return sortedSections;
    }

};
