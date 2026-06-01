import React, { useMemo, useState } from 'react'
import { Field } from '../services/apiService'
import '../styles/fieldsPanel.css'

interface FieldsPanelProps {
  fields: Field[]
  collapsed: boolean
  submissionNumber?: string
  submissionStatus?: string
  dataVerificationEditStatuses?: string[]
  qaOverrideEditStatuses?: string[]
  versions?: Array<{
    sys_id: string
    version_display_value?: string
    label?: string
    active?: boolean
  }>
  selectedVersionSysId?: string
  isReadOnlyVersion?: boolean
  isComplete?: boolean
  onVersionChange?: (versionId: string) => void
  onToggleSidebar: () => void
  onFieldChange: (fieldId: string, updates: Partial<Field>) => void
  onNavigateToField?: (field: Field) => void
  selectedDocument: string
  onSelectDocument: (doc: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  filterDocumentOnly: boolean
  onToggleFilter: () => void
  isSaving: boolean
  isCompleting: boolean
  onComplete: () => void
}

const truncateText = (value?: string, max = 15): string => {
  if (!value) return '-'
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

const getConfidenceClass = (value?: string): 'high' | 'medium' | 'low' | '' => {
  const score = Number.parseFloat(value || '')
  if (Number.isNaN(score)) return ''
  if (score >= 0.75) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

const getSectionAccuracy = (groupFields: Field[]): number | null => {
  const scores = groupFields
    .map((field) => Number.parseFloat(field.confidence_indicator || ''))
    .filter((score) => !Number.isNaN(score))

  if (!scores.length) return null
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return Math.round(average * 100)
}

const getSectionAccuracyClass = (accuracy: number): string => {
  if (accuracy >= 75) return 'high'
  if (accuracy >= 50) return 'medium'
  return 'low'
}

export const FieldsPanel: React.FC<FieldsPanelProps> = ({
  fields,
  collapsed,
  submissionNumber,
  submissionStatus,
  dataVerificationEditStatuses = [],
  qaOverrideEditStatuses = [],
  versions = [],
  selectedVersionSysId,
  isReadOnlyVersion = false,
  isComplete = false,
  onVersionChange,
  onToggleSidebar,
  onFieldChange,
  onNavigateToField,
  selectedDocument,
  onSelectDocument,
  searchQuery,
  onSearchChange,
  filterDocumentOnly,
  onToggleFilter,
  isSaving,
  isCompleting,
  onComplete
}) => {
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const documents = useMemo(() => {
    return Array.from(
      new Set(fields.map((field) => field.attachmentData?.file_name).filter(Boolean))
    ) as string[]
  }, [fields])

  const filteredFields = useMemo(() => {
    let result = fields

    if (filterDocumentOnly && selectedDocument) {
      result = result.filter((field) => field.attachmentData?.file_name === selectedDocument)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((field) =>
        [
          field.field_name,
          field.field_value,
          field.data_verification,
          field.qa_override_value,
          field.logic_transparency,
          field.commentary
        ].some((value) => value?.toLowerCase().includes(query))
      )
    }

    return result
  }, [fields, filterDocumentOnly, searchQuery, selectedDocument])

  const groupedFields = useMemo(() => {
    const groups: Record<string, Field[]> = {}

    filteredFields.forEach((field) => {
      const key = (field.section_name || 'Ungrouped').trim() || 'Ungrouped'
      if (!groups[key]) groups[key] = []
      groups[key].push(field)
    })

    return groups
  }, [filteredFields])

  const canEditDataVerification = !isReadOnlyVersion && dataVerificationEditStatuses.includes(submissionStatus || '')
  const canEditQaOverride = !isReadOnlyVersion && qaOverrideEditStatuses.includes(submissionStatus || '')
  const canEditCommentary = canEditDataVerification || canEditQaOverride
  const canNavigate = (field: Field): boolean =>
    Boolean(field.attachmentData?.sys_id && field.source && field.source.trim().length > 0)

  const completeButtonClass = isComplete
    ? 'btn-complete btn-complete-done'
    : isCompleting
      ? 'btn-complete btn-complete-progress'
      : 'btn-complete btn-complete-idle'

  return (
    <div className={`left-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="fields-header">
        <div className="header-row">
          <div className="header-title-group">
            <button
              className="btn-collapse-toggle"
              onClick={onToggleSidebar}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <i className={`fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} />
            </button>

            {!collapsed && (
              <>
                <h2 className="fields-title">
                  {submissionNumber ? `Audit - #${submissionNumber}` : 'Audit'}
                </h2>
                {!!versions.length && (
                  <select
                    className="version-dropdown"
                    value={selectedVersionSysId || ''}
                    onChange={(event) => onVersionChange?.(event.target.value)}
                  >
                    {versions.map((version) => (
                      <option key={version.sys_id} value={version.sys_id}>
                        {version.label || version.version_display_value || version.sys_id}
                      </option>
                    ))}
                  </select>
                )}
                {isReadOnlyVersion && (
                  <span className="version-readonly-badge">
                    <i className="fas fa-lock" /> Read-only
                  </span>
                )}
              </>
            )}
          </div>

          {!collapsed && (
            <div className="header-actions">
              <button
                className={completeButtonClass}
                onClick={onComplete}
                disabled={isCompleting || isComplete}
                title="Complete"
              >
                <span className="btn-complete-content">
                  {isCompleting ? (
                    <span className="btn-progress-dots">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </span>
                  ) : isComplete ? (
                    <svg className="circle-check" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
                      <circle className="circle-check-ring" cx="13" cy="13" r="11" fill="none" stroke="#fff" strokeWidth="2" />
                      <path className="circle-check-tick" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7.5 13.5 11 17 18.5 9.5" />
                    </svg>
                  ) : (
                    <i className="fas fa-paper-plane" />
                  )}
                  {isCompleting ? 'Sending Data to Model...' : isComplete ? 'Completed' : 'Complete'}
                </span>
              </button>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="document-selector-row">
            <select
              className="document-dropdown"
              value={selectedDocument}
              onChange={(event) => onSelectDocument(event.target.value)}
            >
              {documents.map((doc) => (
                <option key={doc} value={doc}>
                  {doc}
                </option>
              ))}
            </select>

            {searchExpanded ? (
              <div className="search-inline">
                <i className="fas fa-search search-icon" />
                <input
                  id="fieldSearchInput"
                  className="search-input"
                  type="text"
                  placeholder="Search fields..."
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                />
                <button
                  className="btn-search-clear"
                  onClick={() => {
                    onSearchChange('')
                    setSearchExpanded(false)
                  }}
                  title="Close search"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            ) : (
              <button className="btn-search-toggle" onClick={() => setSearchExpanded(true)} title="Search fields">
                <i className="fas fa-search" />
              </button>
            )}

            <button
              className={`btn-filter-toggle ${filterDocumentOnly ? 'active' : ''}`}
              onClick={onToggleFilter}
              title="Filter by current document"
            >
              <i className="fas fa-filter" />
              {filterDocumentOnly && <span className="filter-count">{filteredFields.length}</span>}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="fields-content">
          {Object.entries(groupedFields).map(([sectionName, sectionFields]) => {
            const accuracy = getSectionAccuracy(sectionFields)

            return (
              <div key={sectionName} className="field-section">
                <div
                  className="section-header"
                  onClick={() =>
                    setCollapsedSections((prev) => ({
                      ...prev,
                      [sectionName]: !prev[sectionName]
                    }))
                  }
                >
                  <div className="section-title-wrapper">
                    <i className={`fas ${collapsedSections[sectionName] ? 'fa-chevron-right' : 'fa-chevron-down'}`} />
                    <span className="section-title">{sectionName} ({sectionFields.length})</span>
                  </div>
                  {accuracy !== null && (
                    <div className={`section-accuracy ${getSectionAccuracyClass(accuracy)}`}>
                      {accuracy}%
                    </div>
                  )}
                </div>

                {!collapsedSections[sectionName] && (
                  <div className="section-table-wrapper">
                    <table className="fields-table">
                      <thead>
                        <tr>
                          <th className="col-field-name">Field Name</th>
                          <th className="col-ai-value">AI Value</th>
                          <th className="col-data-verification">Data Verification</th>
                          <th className="col-qa-override">QA Override Value</th>
                          <th className="col-logic">Logic Transparency</th>
                          <th className="col-commentary">Commentary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionFields.map((field) => {
                          const confidenceClass = getConfidenceClass(field.confidence_indicator)
                          return (
                            <tr key={field.sys_id} className={!canNavigate(field) ? 'no-navigate' : ''}>
                              <td className="col-field-name">
                                <div className="field-name-cell">
                                  {!!field.source && (
                                    <i className="fas fa-crosshairs source-indicator" title="Has source coordinates" />
                                  )}
                                  <span
                                    className="field-name"
                                    title={field.field_name}
                                    onClick={() => canNavigate(field) && onNavigateToField?.(field)}
                                    style={{ cursor: canNavigate(field) ? 'pointer' : 'default' }}
                                  >
                                    {field.field_name || '-'}
                                  </span>
                                  {confidenceClass && field.confidence_indicator && (
                                    <span className={`confidence-pill ${confidenceClass}`}>
                                      {(Number.parseFloat(field.confidence_indicator) * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="col-ai-value">
                                <span className={`cell-text ${field.field_value ? 'has-value' : ''}`} title={field.field_value}>
                                  {truncateText(field.field_value, 18)}
                                </span>
                              </td>
                              <td className="col-data-verification">
                                {canEditDataVerification ? (
                                  <input
                                    type="text"
                                    className="verification-input"
                                    value={field.data_verification || ''}
                                    onChange={(event) => onFieldChange(field.sys_id, { data_verification: event.target.value })}
                                    disabled={isCompleting || isSaving}
                                    placeholder="Enter..."
                                  />
                                ) : (
                                  <span className="cell-text" title={field.data_verification}>
                                    {truncateText(field.data_verification, 12)}
                                  </span>
                                )}
                              </td>
                              <td className="col-qa-override">
                                {canEditQaOverride ? (
                                  <input
                                    type="text"
                                    className="override-input"
                                    value={field.qa_override_value || ''}
                                    onChange={(event) => onFieldChange(field.sys_id, { qa_override_value: event.target.value })}
                                    disabled={isCompleting || isSaving}
                                    placeholder="Enter..."
                                  />
                                ) : (
                                  <span className="cell-text" title={field.qa_override_value}>
                                    {truncateText(field.qa_override_value, 12)}
                                  </span>
                                )}
                              </td>
                              <td className="col-logic">
                                <span className={`cell-text ${field.logic_transparency ? 'has-value' : ''}`} title={field.logic_transparency}>
                                  {truncateText(field.logic_transparency, 18)}
                                </span>
                              </td>
                              <td className="col-commentary">
                                {canEditCommentary ? (
                                  <input
                                    type="text"
                                    className="commentary-input"
                                    value={field.commentary || ''}
                                    onChange={(event) => onFieldChange(field.sys_id, { commentary: event.target.value })}
                                    disabled={isCompleting || isSaving}
                                    placeholder="Enter..."
                                  />
                                ) : (
                                  <span className="cell-text" title={field.commentary}>
                                    {truncateText(field.commentary, 12)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {!Object.keys(groupedFields).length && (
            <div className="empty-state">
              <i className="fas fa-exclamation-circle empty-icon" />
              <p className="empty-title">No Fields Available</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
