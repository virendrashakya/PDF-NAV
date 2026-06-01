import axios, { AxiosInstance } from 'axios'

export interface AuthConfig {
  baseUrl: string
  clientId: string
  clientSecret: string
}

export interface TokenData {
  access_token: string
  token_type: string
  expires_in: number
  timestamp: number
}

const STORAGE_KEYS = {
  CONFIG: 'snow_auth_config',
  TOKEN: 'snow_auth_token'
}

class AuthService {
  private apiClient: AxiosInstance | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private refreshPromise: Promise<TokenData> | null = null
  private runtimeConfig: AuthConfig | null = null
  private authClient = axios.create({
    timeout: 30000
  })

  private normalizeBaseUrl(baseUrl: string): string {
    let normalized = baseUrl.trim()
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`
    }
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  }

  getConfig(): AuthConfig | null {
    if (this.runtimeConfig) {
      return {
        ...this.runtimeConfig,
        baseUrl: this.normalizeBaseUrl(this.runtimeConfig.baseUrl)
      }
    }

    const config = localStorage.getItem(STORAGE_KEYS.CONFIG)
    if (!config) return null

    const parsed = JSON.parse(config) as AuthConfig
    return {
      ...parsed,
      baseUrl: this.normalizeBaseUrl(parsed.baseUrl)
    }
  }

  setConfig(config: AuthConfig, options?: { persist?: boolean }): void {
    const normalizedConfig: AuthConfig = {
      ...config,
      baseUrl: this.normalizeBaseUrl(config.baseUrl)
    }

    this.runtimeConfig = normalizedConfig
    if (options?.persist !== false) {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(normalizedConfig))
    }
    this.initializeApiClient()
  }

  async loadManagedConfig(): Promise<boolean> {
    try {
      const response = await this.authClient.get('/api/app/config')
      const data = response.data as { managedAuthEnabled?: boolean; baseUrl?: string }

      if (!data?.managedAuthEnabled || !data.baseUrl) {
        return false
      }

      this.setConfig(
        {
          baseUrl: data.baseUrl,
          clientId: '',
          clientSecret: ''
        },
        { persist: false }
      )

      return true
    } catch {
      return false
    }
  }

  getToken(): TokenData | null {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
    return token ? JSON.parse(token) : null
  }

  private setToken(token: TokenData): void {
    localStorage.setItem(STORAGE_KEYS.TOKEN, JSON.stringify(token))
    this.scheduleTokenRefresh(token)
  }

  isAuthenticated(): boolean {
    const token = this.getToken()
    if (!token) return false
    const expiryTime = token.timestamp + token.expires_in * 1000
    return Date.now() < expiryTime
  }

  initializeApiClient(): void {
    const config = this.getConfig()
    if (!config) {
      this.apiClient = null
      return
    }

    this.apiClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000
    })

    this.apiClient.interceptors.request.use(
      (config) => {
        const token = this.getToken()
        if (token && this.isTokenValid(token)) {
          config.headers.Authorization = `Bearer ${token.access_token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    const existingToken = this.getToken()
    if (existingToken && this.isAuthenticated()) {
      this.scheduleTokenRefresh(existingToken)
    }
  }

  private isTokenValid(token: TokenData): boolean {
    const expiryTime = token.timestamp + token.expires_in * 1000
    const bufferTime = 60 * 1000 // 1 minute before expiry
    return Date.now() < expiryTime - bufferTime
  }

  async authenticate(): Promise<TokenData> {
    const config = this.getConfig()
    if (!config) {
      throw new Error('Authentication config not set')
    }

    if (this.refreshPromise) {
      return this.refreshPromise
    }

    const authRequest = async () => {
      try {
        const baseUrl = this.normalizeBaseUrl(config.baseUrl)

        console.log('Authenticating to:', `${baseUrl}/oauth_token.do`)

        const response = await this.authClient.post('/api/auth/token', {
          baseUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret
        })

        const tokenData: TokenData = {
          access_token: response.data.access_token,
          token_type: response.data.token_type,
          expires_in: response.data.expires_in,
          timestamp: Date.now()
        }

        this.setToken(tokenData)
        console.log('âœ… Authentication successful')
        return tokenData
      } catch (error) {
        localStorage.removeItem(STORAGE_KEYS.TOKEN)
        if (this.tokenRefreshTimer) {
          clearTimeout(this.tokenRefreshTimer)
          this.tokenRefreshTimer = null
        }

        let errorMessage = 'Unknown error'

        if (axios.isAxiosError(error)) {
          if (error.code === 'ERR_NETWORK') {
            errorMessage = 'Network error - Cannot reach ServiceNow instance. Check: 1) URL is correct 2) Instance is accessible 3) CORS is enabled in ServiceNow'
          } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Request timeout - ServiceNow instance is not responding'
          } else if (error.response?.status === 401) {
            errorMessage = 'Invalid credentials - Check Client ID and Secret'
          } else if (error.response?.status === 403) {
            errorMessage = 'Access forbidden - CORS may be blocked. Enable CORS in ServiceNow'
          } else if (error.response?.status === 404) {
            errorMessage = 'Endpoint not found - Invalid ServiceNow URL'
          } else if (error.response?.data) {
            errorMessage = `ServiceNow error: ${JSON.stringify(error.response.data)}`
          } else {
            errorMessage = error.message || 'Network Error'
          }
        } else if (error instanceof Error) {
          errorMessage = error.message
        } else {
          errorMessage = 'Unknown error'
        }

        console.error('âŒ Authentication failed:', errorMessage)
        throw new Error(`Authentication failed: ${errorMessage}`)
      } finally {
        this.refreshPromise = null
      }
    }

    this.refreshPromise = authRequest()
    return this.refreshPromise
  }

  private scheduleTokenRefresh(token: TokenData): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
    }

    // Refresh token 5 minutes before expiry
    const refreshTime = (token.expires_in * 1000) - (5 * 60 * 1000)
    this.tokenRefreshTimer = setTimeout(() => {
      this.authenticate().catch((error) => {
        console.error('Token refresh failed:', error)
      })
    }, Math.max(refreshTime, 1000))
  }

  async getApiClient(): Promise<AxiosInstance> {
    if (!this.apiClient) {
      this.initializeApiClient()
    }

    if (!this.isAuthenticated()) {
      await this.authenticate()
    }

    if (!this.apiClient) {
      throw new Error('API client not initialized')
    }

    return this.apiClient
  }

  clearAuth(): void {
    localStorage.removeItem(STORAGE_KEYS.TOKEN)
    localStorage.removeItem(STORAGE_KEYS.CONFIG)
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
    }
    this.tokenRefreshTimer = null
    this.refreshPromise = null
    this.apiClient = null
    this.runtimeConfig = null
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.TOKEN)
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
    }
    this.tokenRefreshTimer = null
    this.refreshPromise = null
  }
}

export default new AuthService()
