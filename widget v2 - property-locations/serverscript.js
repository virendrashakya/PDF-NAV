(function () {
  /* ============================================
   * Property Locations Widget Server Script
   * ============================================
   * Real data:
   *   - submission, property_location, address, top_risk
   * Dummy data (until backend exists):
   *   - field sections per property location (Location Address, Property Coverage, ...)
   *   - versions
   * ============================================ */

  var CONFIG = {
    tables: {
      submission: 'x_gegis_uwm_dashbo_submission',
      propertyLocation: 'x_gegis_uwm_dashbo_property_location',
      // Bridge table: submission.property_detail ⇄ property_location.property_detail
      // both point to a row in this table. Used to resolve the PL list for a submission.
      propertyLobDetail: 'x_gegis_uwm_dashbo_property_lob_detail',
      address: 'x_gegis_uwm_dashbo_address',
      topRisk: 'x_gegis_uwm_dashbo_extract_top_risk',
      attachment: 'sys_attachment'
    },
    submissionColumns: {
      number: 'number',
      accountDetails: 'account_details',
      submissionType: 'submission_type_choice',
      lineOfBusiness: 'line_of_business_choice',
      totalInsuredValue: 'total_insured_value',
      // Reference to x_gegis_uwm_dashbo_property_lob_detail — same column name is on property_location.
      // Property locations are linked to a submission through this shared reference, not directly.
      propertyDetail: 'property_detail'
    },
    propertyLocationColumns: {
      version: 'version',
      locationName: 'location_name',
      accuracy: 'accuracy',
      required: 'required',
      locationType: 'location_type',
      address: 'address',
      propertyDocument: 'property_document',
      sourceInDocument: 'source_in_document',
      // Reference to x_gegis_uwm_dashbo_property_lob_detail — the bridge to submission.
      propertyDetail: 'property_detail'
    },
    addressColumns: {
      insuredAddress: 'insured_address',
      country: 'country',
      state: 'state',
      latitude: 'geocoded_latitude',
      longitude: 'geocoded_longitude'
    },
    topRiskColumns: {
      propertyLocation: 'property_location',
      total: 'total'
    },
    attachment: {
      supportedContentTypes: ['application/pdf', 'application/octet-stream']
    },
    limits: {
      maxPropertyLocations: 200
    }
  };

  function _getValue(gr, field) {
    try { return gr.getValue(field) || ''; } catch (e) { return ''; }
  }

  function _formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function _getAttachmentData(sysId) {
    if (!sysId) return null;
    try {
      var gr = new GlideRecord(CONFIG.tables.attachment);
      gr.addQuery('sys_id', sysId);
      gr.addQuery('content_type', 'IN', CONFIG.attachment.supportedContentTypes.join(','));
      gr.setLimit(1);
      gr.query();
      if (gr.next()) {
        var sizeBytes = parseInt(_getValue(gr, 'size_bytes'), 10) || 0;
        return {
          sys_id: gr.getUniqueValue(),
          file_name: _getValue(gr, 'file_name'),
          content_type: _getValue(gr, 'content_type'),
          size_bytes: sizeBytes,
          size_formatted: _formatFileSize(sizeBytes),
          file_url: '/sys_attachment.do?sys_id=' + sysId
        };
      }
    } catch (e) {
      gs.error('PL-NAV: attachment fetch failed: ' + e.message);
    }
    return null;
  }

  function _getAddress(addressSysId) {
    if (!addressSysId) return null;
    var gr = new GlideRecord(CONFIG.tables.address);
    if (!gr.get(addressSysId)) return null;
    return {
      sys_id: gr.getUniqueValue(),
      insured_address: _getValue(gr, CONFIG.addressColumns.insuredAddress),
      country: _getValue(gr, CONFIG.addressColumns.country),
      state: _getValue(gr, CONFIG.addressColumns.state),
      latitude: _getValue(gr, CONFIG.addressColumns.latitude),
      longitude: _getValue(gr, CONFIG.addressColumns.longitude)
    };
  }

  function _getFirstTopRiskTotal(propertyLocationSysId) {
    if (!propertyLocationSysId) return '';
    var gr = new GlideRecord(CONFIG.tables.topRisk);
    gr.addQuery(CONFIG.topRiskColumns.propertyLocation, propertyLocationSysId);
    gr.setLimit(1);
    gr.query();
    if (gr.next()) {
      return _getValue(gr, CONFIG.topRiskColumns.total);
    }
    return '';
  }

  data.success = false;
  data.error = '';

  // Resolve submission sys_id from the URL on every load so the client controller
  // can pick it up via $scope.data.submissionSysId without a round trip.
  // Accepts ?submissionSysId=<sys_id> (preferred) or ?sys_id=<sys_id> (ServiceNow standard).
  data.submissionSysId =
    (input && input.submissionSysId) ||
    $sp.getParameter('submissionSysId') ||
    $sp.getParameter('sys_id') ||
    '';

  if (input && input.action) {
    try {
      switch (input.action) {
        case 'fetchPropertyLocations':
          fetchPropertyLocations();
          break;
        case 'saveField':
          saveField();
          break;
        default:
          data.error = 'Unknown action: ' + input.action;
      }
    } catch (e) {
      gs.error('PL-NAV ERROR: ' + e.message);
      data.error = 'Server error: ' + e.message;
    }
  } else {
    data.message = 'Property Locations Widget loaded';
    data.success = true;
  }

  function fetchPropertyLocations() {
    var submissionSysId = input.submissionSysId;
    if (!submissionSysId) {
      data.error = 'Submission ID is required';
      return;
    }

    var submissionGr = new GlideRecord(CONFIG.tables.submission);
    if (!submissionGr.get(submissionSysId)) {
      data.error = 'Submission not found';
      return;
    }

    var lineOfBusiness = _getValue(submissionGr, CONFIG.submissionColumns.lineOfBusiness);
    var propertyDetailSysId = _getValue(submissionGr, CONFIG.submissionColumns.propertyDetail);
    data.submission = {
      sys_id: submissionSysId,
      number: _getValue(submissionGr, CONFIG.submissionColumns.number),
      account_details: _getValue(submissionGr, CONFIG.submissionColumns.accountDetails),
      submission_type: _getValue(submissionGr, CONFIG.submissionColumns.submissionType),
      line_of_business: lineOfBusiness,
      total_insured_value: _getValue(submissionGr, CONFIG.submissionColumns.totalInsuredValue),
      property_detail: propertyDetailSysId
    };

    // Submission and property_location are linked via a shared property_detail reference
    // (x_gegis_uwm_dashbo_property_lob_detail). No property_detail on submission ⇒ no locations.
    if (!propertyDetailSysId) {
      data.propertyLocations = [];
      data.fieldSectionsByLocation = {};
      data.versions = [];
      data.success = true;
      return;
    }

    var plGr = new GlideRecord(CONFIG.tables.propertyLocation);
    plGr.addQuery(CONFIG.propertyLocationColumns.propertyDetail, propertyDetailSysId);
    plGr.orderByDesc(CONFIG.propertyLocationColumns.version);
    plGr.orderBy(CONFIG.propertyLocationColumns.locationName);
    plGr.setLimit(CONFIG.limits.maxPropertyLocations);
    plGr.query();

    var locations = [];
    while (plGr.next()) {
      var plSysId = plGr.getUniqueValue();
      var addressSysId = _getValue(plGr, CONFIG.propertyLocationColumns.address);
      var address = _getAddress(addressSysId);
      var docSysId = _getValue(plGr, CONFIG.propertyLocationColumns.propertyDocument);
      var insuredValue = _getFirstTopRiskTotal(plSysId);

      var geocodes = '';
      if (address && address.latitude && address.longitude) {
        geocodes = address.latitude + ', ' + address.longitude;
      }

      locations.push({
        sys_id: plSysId,
        version: _getValue(plGr, CONFIG.propertyLocationColumns.version),
        location_name: _getValue(plGr, CONFIG.propertyLocationColumns.locationName),
        location_type: _getValue(plGr, CONFIG.propertyLocationColumns.locationType),
        accuracy: _getValue(plGr, CONFIG.propertyLocationColumns.accuracy),
        required: _getValue(plGr, CONFIG.propertyLocationColumns.required),
        source_in_document: _getValue(plGr, CONFIG.propertyLocationColumns.sourceInDocument),
        address_text: address ? address.insured_address : '',
        state: address ? address.state : '',
        country: address ? address.country : '',
        geocodes: geocodes,
        line_of_business: lineOfBusiness,
        insured_value: insuredValue,
        property_document_sys_id: docSysId,
        attachmentData: docSysId ? _getAttachmentData(docSysId) : null
      });
    }

    data.propertyLocations = locations;

    // Dummy field sections — same shape for every property location for now.
    // Replace with a real backend call once the line-items table exists.
    data.fieldSectionsByLocation = {};
    locations.forEach(function (loc) {
      data.fieldSectionsByLocation[loc.sys_id] = _buildDummyFieldSections(loc);
    });

    // Dummy versions for the dropdown if/when it is wired in.
    data.versions = [
      { sys_id: 'dummy-v1', label: 'v1 (active)', active: true },
      { sys_id: 'dummy-v2', label: 'v2', active: false }
    ];

    data.success = true;
  }

  function saveField() {
    // Dummy save — echoes back success. Wire to a real table once it exists.
    data.success = true;
    data.message = 'Saved (dummy)';
    data.updatedSysId = input.update && input.update.sys_id ? input.update.sys_id : null;
  }

  function _buildDummyFieldSections(location) {
    var name = location.location_name || 'Unnamed Location';
    var address = location.address_text || '';
    var state = location.state || '';
    var country = location.country || '';

    return {
      'Location Address': [
        _f('la-' + location.sys_id + '-name', 'Name', name, 'Extracted from policy document', 0.955),
        _f('la-' + location.sys_id + '-addr', 'Address', address, 'Identifies from policy schedule', 0.955),
        _f('la-' + location.sys_id + '-state', 'State', state || 'New York', 'Identifies from address line', 0.955),
        _f('la-' + location.sys_id + '-country', 'Country', country || 'USA', 'Identifies from address line', 0.955),
        _f('la-' + location.sys_id + '-pin', 'Pin code', '512334', 'Identifies from postal code', 0.955),
        _f('la-' + location.sys_id + '-class', 'Class Code', '8810', 'Identifies Code from occupancy', 0.955),
        _f('la-' + location.sys_id + '-sqft', 'Sq Footage', '25,000', 'Identifies from declarations', 0.955),
        _f('la-' + location.sys_id + '-occ', 'Occupancy Type', 'Office Building', 'Identifies from occupancy section', 0.955)
      ],
      'Property Coverage': [
        _f('pc-' + location.sys_id + '-bldg', 'Building', '$2,500,000', 'Extracted from coverage schedule', 0.35),
        _f('pc-' + location.sys_id + '-mach', 'Machinery / Equipment', '$1,200,000', 'Identifies from coverage table', 0.955),
        _f('pc-' + location.sys_id + '-haz', 'Hazardous Substance Limit', '$1,200,000', 'Identifies from coverage table', 0.955)
      ]
    };
  }

  function _f(sysId, fieldName, aiValue, logicTransparency, confidence) {
    return {
      sys_id: sysId,
      field_name: fieldName,
      field_value: aiValue,
      data_verification: '',
      commentary: '',
      logic_transparency: logicTransparency,
      confidence_indicator: confidence,
      source: '',
      attachmentData: null
    };
  }

  data.serverTime = new Date().getTime();
})();
