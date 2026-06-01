import authService from './authService'
import { AxiosInstance } from 'axios'

export interface Field {
  sys_id: string
  field_name: string
  field_value: string
  data_verification: string
  qa_override_value: string
  commentary: string
  confidence_indicator?: string
  logic_transparency?: string
  section_name?: string
  source?: string
  attachmentData?: {
    sys_id?: string
    file_name: string
  }
}

export interface Config {
  dataVerificationEditStatuses: string[]
  qaOverrideEditStatuses: string[]
  [key: string]: unknown
}

export interface MappingData {
  fields: Field[]
  result?: {
    submissionNumber?: string
    submissionStatusChoice?: string
    totalMappings?: number
    versions?: Array<{
      sys_id: string
      version_display_value: string
      active: boolean
    }>
    config?: {
      dataVerificationEditStatuses?: string[]
      qaOverrideEditStatuses?: string[]
    }
    selectedDataExtract?: {
      sys_id: string
      active: boolean
    }
    [key: string]: unknown
  }
  groupedFields?: { [key: string]: Field[] }
}

export interface SaveMappingPayload {
  submissionNumber: string
  dataExtractSysId: string
  updates: Array<{
    sys_id: string
    qa_override_value: string
    data_verification: string
    commentary: string
  }>
}

class ApiService {
  private client: AxiosInstance | null = null

  private async ensureClient(): Promise<AxiosInstance> {
    this.client = await authService.getApiClient()
    return this.client
  }

  async getConfig(): Promise<Config> {
    try {
      const client = await this.ensureClient()
      const response = await client.get(
        '/api/x_gegis_uwm_dashbo/v1/auditpageapi/config'
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to fetch config', error)
    }
  }

  async fetchMapping(submissionSysId: string): Promise<MappingData> {
    try {
      const client = await this.ensureClient()
      const response = await client.get(
        `/api/x_gegis_uwm_dashbo/v1/auditpageapi/fetchMapping/${submissionSysId}`
      )

      // Handle response structure
      const data = response.data
      let fields: Field[] = []

      // Check if response has result.mapping (new structure)
      if (data.result && Array.isArray(data.result.mapping)) {
        fields = data.result.mapping
      }
      // Check if response has result.fields
      else if (data.result && Array.isArray(data.result.fields)) {
        fields = data.result.fields
      }
      // Check if response has fields directly
      else if (Array.isArray(data.fields)) {
        fields = data.fields
      }
      // Check if response has mapping directly
      else if (Array.isArray(data.mapping)) {
        fields = data.mapping
      }

      return {
        fields,
        result: data.result || data
      }
    } catch (error) {
      throw this.handleError('Failed to fetch mapping', error)
    }
  }

  async getLineOfBusiness(submissionSysId: string): Promise<unknown> {
    try {
      const client = await this.ensureClient()
      const response = await client.get(
        `/api/x_gegis_uwm_dashbo/v1/auditpageapi/lineOfBusiness/${submissionSysId}`
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to fetch line of business', error)
    }
  }

  async saveMapping(payload: SaveMappingPayload): Promise<unknown> {
    try {
      const client = await this.ensureClient()
      const response = await client.post(
        '/api/x_gegis_uwm_dashbo/v1/auditpageapi/saveMapping',
        payload
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to save mapping', error)
    }
  }

  async markComplete(submissionNumber: string, dataExtractSysId: string): Promise<unknown> {
    try {
      const client = await this.ensureClient()
      const response = await client.post(
        '/api/x_gegis_uwm_dashbo/v1/auditpageapi/markComplete',
        {
          submissionNumber,
          dataExtractSysId
        }
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to mark complete', error)
    }
  }

  async getAttachment(
    attachmentSysId: string,
    format: 'binary' | 'base64' = 'base64'
  ): Promise<unknown> {
    try {
      const client = await this.ensureClient()
      const response = await client.get(
        `/api/x_gegis_uwm_dashbo/v1/auditpageapi/attachment/${attachmentSysId}`,
        {
          params: format === 'binary' ? { format: 'binary' } : {}
        }
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to fetch attachment', error)
    }
  }

  async getAttachmentMetadata(attachmentSysId: string): Promise<unknown> {
    try {
      const client = await this.ensureClient()
      const response = await client.get(
        `/api/x_gegis_uwm_dashbo/v1/auditpageapi/attachment/${attachmentSysId}/metadata`
      )
      return response.data
    } catch (error) {
      throw this.handleError('Failed to fetch attachment metadata', error)
    }
  }

  private handleError(message: string, error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`${message}: ${error.message}`)
    }
    return new Error(message)
  }
}

export default new ApiService()
