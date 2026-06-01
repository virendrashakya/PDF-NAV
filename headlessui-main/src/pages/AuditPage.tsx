import React, { useState, useEffect } from 'react'
import apiService, { Field, Config } from '../services/apiService'
import authService from '../services/authService'
import { useToast } from '../context/ToastContext'
import { FieldsPanel } from '../components/FieldsPanel'
import { PDFViewer } from '../components/PDFViewer'
import '../styles/audit.css'

interface AuditPageProps {
  onLogout: () => void
  submissionSysId: string
  versionId?: string
}

export const AuditPage: React.FC<AuditPageProps> = ({
  onLogout,
  submissionSysId,
  versionId
}) => {
  void onLogout
  const [fields, setFields] = useState<Field[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [submissionNumber, setSubmissionNumber] = useState<string>('')
  const [submissionStatus, setSubmissionStatus] = useState<string>('')
  const [versions, setVersions] = useState<any[]>([])
  const [selectedVersionSysId, setSelectedVersionSysId] = useState<string>('')
  const [isReadOnlyVersion, setIsReadOnlyVersion] = useState(false)
  const [loading, setLoading] = useState(true)
  const saving = false
  const [completing, setIsCompleting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<string>('')
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDocumentOnly, setFilterDocumentOnly] = useState(false)
  const [navigateSource, setNavigateSource] = useState<string>('')
  const [navigateSeq, setNavigateSeq] = useState(0)
  const { showToast } = useToast()

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        if (!submissionSysId) {
          showToast('No submission SysID provided. Please access via proper URL with submissionSysId parameter.', 'error', 8000)
          return
        }

        const [configData, mappingResponse] = await Promise.all([
          apiService.getConfig(),
          apiService.fetchMapping(submissionSysId)
        ])

        setConfig(configData)
        setFields(mappingResponse.fields || [])

        // Extract submission info from response if available
        const apiResponse = (mappingResponse as any).result
        if (apiResponse) {
          if (apiResponse.submissionNumber) {
            setSubmissionNumber(apiResponse.submissionNumber)
          }
          if (apiResponse.submissionStatusChoice) {
            setSubmissionStatus(apiResponse.submissionStatusChoice)
          }
          // Set versions list if available
          if (apiResponse.versions && Array.isArray(apiResponse.versions)) {
            console.log('📦 Versions found:', apiResponse.versions.length)
            setVersions(apiResponse.versions)
            // Set selected version (prefer URL versionId if valid)
            const fromUrl = versionId
              ? apiResponse.versions.find((v: any) => v.sys_id === versionId)
              : null
            const selectedVersion = fromUrl || apiResponse.versions.find((v: any) => v.active) || apiResponse.versions[0]
            if (selectedVersion) {
              setSelectedVersionSysId(selectedVersion.sys_id)
              setIsReadOnlyVersion(!selectedVersion.active)
            }
          } else {
            console.log('⚠️ No versions in API response. Full response:', apiResponse)
          }
        }

        // Set first document as selected
        const uniqueDocs = Array.from(
          new Set((mappingResponse.fields || []).map((f: Field) => f.attachmentData?.file_name).filter(Boolean))
        )
        if (uniqueDocs.length > 0) {
          const firstDoc = uniqueDocs[0] as string
          setSelectedDocument(firstDoc)

          // Also set attachment ID
          const field = (mappingResponse.fields || []).find((f: Field) => f.attachmentData?.file_name === firstDoc)
          if (field?.attachmentData?.sys_id) {
            setSelectedAttachmentId(field.attachmentData.sys_id)
          }
        }

        console.log('✅ Audit page loaded')
        console.log('📋 Submission:', submissionNumber || submissionSysId)
        console.log('📊 Total Mappings:', mappingResponse.fields?.length || 0)
        if (versionId) console.log('📦 Version ID:', versionId)

        showToast(`Loaded ${mappingResponse.fields?.length || 0} fields`, 'success', 3000)
      } catch (error) {
        showToast(
          `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          8000
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [submissionSysId, versionId, showToast])

  const handleFieldChange = (fieldId: string, updates: Partial<Field>) => {
    setFields((prev) =>
      prev.map((field) =>
        field.sys_id === fieldId ? { ...field, ...updates } : field
      )
    )
    setHasChanges(true)
  }

  const handleSelectDocument = (docName: string) => {
    setSelectedDocument(docName)

    // Find attachment ID for this document
    const field = fields.find((f: Field) => f.attachmentData?.file_name === docName)
    if (field?.attachmentData?.sys_id) {
      setSelectedAttachmentId(field.attachmentData.sys_id)
    }
  }

  const handleVersionChange = (newVersionSysId: string) => {
    setSelectedVersionSysId(newVersionSysId)

    // Check if selected version is active
    const selectedVer = versions.find((v) => v.sys_id === newVersionSysId)
    setIsReadOnlyVersion(selectedVer ? !selectedVer.active : false)

    // Note: In a real scenario, you'd reload data for the new version
    // For now, just update the UI state
    showToast(`Switched to version: ${selectedVer?.version_display_value || 'Unknown'}`, 'info', 3000)
  }

  const handleNavigateToField = (field: Field) => {
    if (!field.source || !field.attachmentData?.sys_id) {
      return
    }

    if (field.attachmentData.file_name && field.attachmentData.file_name !== selectedDocument) {
      setSelectedDocument(field.attachmentData.file_name)
    }

    if (field.attachmentData.sys_id !== selectedAttachmentId) {
      setSelectedAttachmentId(field.attachmentData.sys_id)
    }

    setNavigateSource(field.source)
    setNavigateSeq((prev) => prev + 1)
  }

  const handleComplete = async () => {
    try {
      setIsCompleting(true)

      if (!submissionNumber) {
        showToast('Submission number not available', 'error', 5000)
        return
      }

      // Save any pending changes first
      if (hasChanges) {
        const updates = fields.map((f) => ({
          sys_id: f.sys_id,
          qa_override_value: f.qa_override_value,
          data_verification: f.data_verification,
          commentary: f.commentary
        }))

        await apiService.saveMapping({
          submissionNumber,
          dataExtractSysId: submissionSysId,
          updates
        })
      }

      // Mark complete
      await apiService.markComplete(submissionNumber, submissionSysId)
      showToast('Submission completed successfully!', 'success', 5000)
      setHasChanges(false)
      setIsComplete(true)
    } catch (error) {
      showToast(
        `Completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        8000
      )
    } finally {
      setIsCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="audit-page">
        <div className="loading-overlay">
          <div className="loader-container">
            <div className="spinner" />
            <p className="loading-text">Loading audit data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="audit-page">
      <div className="main-layout">
        <FieldsPanel
          fields={fields}
          collapsed={sidebarCollapsed}
          submissionNumber={submissionNumber}
          submissionStatus={submissionStatus}
          dataVerificationEditStatuses={config?.dataVerificationEditStatuses || []}
          qaOverrideEditStatuses={config?.qaOverrideEditStatuses || []}
          versions={versions}
          selectedVersionSysId={selectedVersionSysId}
          isReadOnlyVersion={isReadOnlyVersion}
          isComplete={isComplete}
          onVersionChange={handleVersionChange}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onFieldChange={handleFieldChange}
          onNavigateToField={handleNavigateToField}
          selectedDocument={selectedDocument}
          onSelectDocument={handleSelectDocument}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterDocumentOnly={filterDocumentOnly}
          onToggleFilter={() => setFilterDocumentOnly(!filterDocumentOnly)}
          isSaving={saving}
          isCompleting={completing}
          onComplete={handleComplete}
        />

        <PDFViewer
          attachmentId={selectedAttachmentId}
          documentName={selectedDocument || 'No document selected'}
          baseUrl={authService.getConfig()?.baseUrl}
          token={authService.getToken()?.access_token}
          navigateSource={navigateSource}
          navigateKey={navigateSeq}
        />
      </div>
    </div>
  )
}
