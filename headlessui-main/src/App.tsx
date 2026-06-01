import { useState, useEffect } from 'react'
import authService from './services/authService'
import { ConfigPage } from './pages/ConfigPage'
import { AuditPage } from './pages/AuditPage'
import { AuditPageV2 } from './pages/AuditPageV2'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/Toast'

type AppPage = 'config' | 'audit' | 'audit-v2'

function parseAuditLocation() {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  const v2Match = pathname.match(/^\/audit\/v2\/([^/]+)\/?$/)
  const pathMatch = v2Match ? null : pathname.match(/^\/audit\/([^/]+)\/?$/)

  const submissionSysId = v2Match?.[1] || pathMatch?.[1] || params.get('submissionSysId') || ''
  const versionId = params.get('version') || params.get('versionId') || ''

  return {
    submissionSysId,
    versionId,
    page: v2Match ? 'audit-v2' as const : 'audit' as const,
    isLegacyQueryFormat: !pathMatch && !!params.get('submissionSysId')
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('config')
  const [isInitialized, setIsInitialized] = useState(false)
  const [submissionSysId, setSubmissionSysId] = useState<string>('')
  const [versionId, setVersionId] = useState<string>('')
  const [targetAuditPage, setTargetAuditPage] = useState<Extract<AppPage, 'audit' | 'audit-v2'>>('audit')

  useEffect(() => {
    const initialize = async () => {
      const {
        submissionSysId: submissionId,
        versionId: versionIdParam,
        page,
        isLegacyQueryFormat
      } = parseAuditLocation()

      setSubmissionSysId(submissionId)
      setVersionId(versionIdParam)
      setTargetAuditPage(page)

      if (submissionId && isLegacyQueryFormat) {
        const nextUrl = versionIdParam
          ? `/audit/${submissionId}?version=${encodeURIComponent(versionIdParam)}`
          : `/audit/${submissionId}`
        window.history.replaceState({}, '', nextUrl)
      }

      await authService.loadManagedConfig()
      const config = authService.getConfig()
      authService.initializeApiClient()

      if (config && submissionId) {
        setCurrentPage(page)
      } else {
        setCurrentPage('config')
      }

      setIsInitialized(true)
    }

    initialize()
  }, [])

  const handleConfigSaved = () => {
    setCurrentPage(targetAuditPage)
  }

  const handleLogout = () => {
    authService.logout()
    setCurrentPage('config')
  }

  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }} />
          <p>Initializing application...</p>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="app-container">
        {currentPage === 'config' ? (
          <ConfigPage onConfigSaved={handleConfigSaved} />
        ) : currentPage === 'audit-v2' ? (
          <AuditPageV2
            onLogout={handleLogout}
            submissionSysId={submissionSysId}
            versionId={versionId}
          />
        ) : (
          <AuditPage
            onLogout={handleLogout}
            submissionSysId={submissionSysId}
            versionId={versionId}
          />
        )}
      </div>
      <ToastContainer />
    </ToastProvider>
  )
}

export default App
