import React, { useState, useEffect } from 'react'
import authService, { AuthConfig, TokenData } from '../services/authService'
import { useToast } from '../context/ToastContext'
import '../styles/config.css'

interface ConfigPageProps {
  onConfigSaved: () => void
}

export const ConfigPage: React.FC<ConfigPageProps> = ({ onConfigSaved }) => {
  const [baseUrl, setBaseUrl] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [token, setToken] = useState('')
  const [useDirectToken, setUseDirectToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const config = authService.getConfig()
    const existingToken = authService.getToken()

    if (config) {
      setBaseUrl(config.baseUrl)
      setClientId(config.clientId)
      setClientSecret(config.clientSecret)
    }

    if (existingToken) {
      setToken(existingToken.access_token)
      setUseDirectToken(true)
    }
  }, [])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!baseUrl.trim()) {
      showToast('Please enter ServiceNow Base URL', 'error')
      return
    }

    if (useDirectToken) {
      if (!token.trim()) {
        showToast('Please enter a valid token', 'error')
        return
      }

      setLoading(true)
      try {
        const config: AuthConfig = {
          baseUrl: baseUrl.trim(),
          clientId: '',
          clientSecret: ''
        }

        const tokenData: TokenData = {
          access_token: token.trim(),
          token_type: 'Bearer',
          expires_in: 3600,
          timestamp: Date.now()
        }

        authService.setConfig(config)
        localStorage.setItem('snow_auth_token', JSON.stringify(tokenData))
        authService.initializeApiClient()

        showToast('Token saved and configuration ready', 'success')
        setTimeout(onConfigSaved, 1000)
      } catch (error) {
        showToast(
          `Configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          8000
        )
      } finally {
        setLoading(false)
      }
    } else {
      if (!clientId.trim() || !clientSecret.trim()) {
        showToast('Please fill in all OAuth fields', 'error')
        return
      }

      setLoading(true)
      try {
        const config: AuthConfig = {
          baseUrl: baseUrl.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim()
        }

        authService.setConfig(config)
        await authService.authenticate()

        showToast('Configuration saved and authenticated successfully', 'success')
        setTimeout(onConfigSaved, 1000)
      } catch (error) {
        showToast(
          `Configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          8000
        )
      } finally {
        setLoading(false)
      }
    }
  }

  const handleTestConnection = async () => {
    if (!baseUrl.trim()) {
      showToast('Please enter ServiceNow Base URL', 'warning')
      return
    }

    if (useDirectToken) {
      if (!token.trim()) {
        showToast('Please enter a valid token', 'warning')
        return
      }
      showToast('Token is valid and ready to use', 'success')
      return
    }

    if (!clientId.trim() || !clientSecret.trim()) {
      showToast('Please fill in all OAuth fields', 'warning')
      return
    }

    setTestingConnection(true)
    try {
      const config: AuthConfig = {
        baseUrl: baseUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
      }

      authService.setConfig(config)
      await authService.authenticate()
      showToast('Connection successful!', 'success')
    } catch (error) {
      showToast(
        `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        8000
      )
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <div className="config-page">
      <div className="config-container">
        <div className="config-header">
          <h1 className="config-title">
            <i className="fas fa-cogs config-icon" />
            Configuration
          </h1>
          <p className="config-subtitle">
            Set up your ServiceNow connection with OAuth credentials
          </p>
        </div>

        <form onSubmit={handleSaveConfig} className="config-form">
          <div className="form-group">
            <label htmlFor="baseUrl" className="form-label">
              ServiceNow Base URL
              <span className="required">*</span>
            </label>
            <input
              id="baseUrl"
              type="url"
              placeholder="https://dev12345.service-now.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="form-input"
              disabled={loading || testingConnection}
            />
            <p className="form-hint">Your ServiceNow instance URL</p>
          </div>

          {/* Tab Toggle */}
          <div className="auth-method-toggle">
            <button
              type="button"
              className={`toggle-btn ${!useDirectToken ? 'active' : ''}`}
              onClick={() => setUseDirectToken(false)}
              disabled={loading || testingConnection}
            >
              <i className="fas fa-key" /> OAuth Credentials
            </button>
            <button
              type="button"
              className={`toggle-btn ${useDirectToken ? 'active' : ''}`}
              onClick={() => setUseDirectToken(true)}
              disabled={loading || testingConnection}
            >
              <i className="fas fa-lock" /> Direct Token
            </button>
          </div>

          {/* OAuth Method */}
          {!useDirectToken && (
            <>
              <div className="form-group">
                <label htmlFor="clientId" className="form-label">
                  Client ID
                  <span className="required">*</span>
                </label>
                <input
                  id="clientId"
                  type="text"
                  placeholder="Your OAuth client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="form-input"
                  disabled={loading || testingConnection}
                />
                <p className="form-hint">OAuth application client ID</p>
              </div>

              <div className="form-group">
                <label htmlFor="clientSecret" className="form-label">
                  Client Secret
                  <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="clientSecret"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your OAuth client secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="form-input"
                    disabled={loading || testingConnection}
                  />
                  <button
                    type="button"
                    className="btn-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading || testingConnection}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas fa-eye${showPassword ? '-slash' : ''}`} />
                  </button>
                </div>
                <p className="form-hint">OAuth application client secret</p>
              </div>
            </>
          )}

          {/* Direct Token Method */}
          {useDirectToken && (
            <div className="form-group">
              <label htmlFor="token" className="form-label">
                Access Token
                <span className="required">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="token"
                  type={showToken ? 'text' : 'password'}
                  placeholder="Paste your OAuth access token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="form-input"
                  disabled={loading || testingConnection}
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowToken(!showToken)}
                  disabled={loading || testingConnection}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  <i className={`fas fa-eye${showToken ? '-slash' : ''}`} />
                </button>
              </div>
              <p className="form-hint">Get token from Postman or ServiceNow API call</p>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={loading || testingConnection}
              className="btn btn-secondary"
            >
              {testingConnection ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <i className="fas fa-plug" />
                  Test Connection
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={loading || testingConnection}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="fas fa-save" />
                  Save Configuration
                </>
              )}
            </button>
          </div>

          <div className="info-box">
            <i className="fas fa-info-circle" />
            <div>
              <strong>How to get OAuth credentials:</strong>
              <ol>
                <li>Log in to your ServiceNow instance</li>
                <li>Go to System OAuth &gt; Application Registry</li>
                <li>Create a new OAuth application (Client Credentials flow)</li>
                <li>Copy the Client ID and Client Secret</li>
              </ol>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
