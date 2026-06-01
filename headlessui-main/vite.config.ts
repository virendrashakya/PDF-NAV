import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function authProxyPlugin() {
  return {
    name: 'auth-proxy-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/auth/token', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await new Promise<string>((resolve, reject) => {
            let data = ''
            req.on('data', (chunk: Buffer) => {
              data += chunk.toString()
            })
            req.on('end', () => resolve(data))
            req.on('error', reject)
          })

          const parsed = JSON.parse(body || '{}') as {
            baseUrl?: string
            clientId?: string
            clientSecret?: string
          }

          if (!parsed.baseUrl || !parsed.clientId || !parsed.clientSecret) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing required fields' }))
            return
          }

          const formBody = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: parsed.clientId,
            client_secret: parsed.clientSecret
          })

          const response = await fetch(`${parsed.baseUrl}/oauth_token.do`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody.toString()
          })

          const text = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Proxy request failed'
          }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), authProxyPlugin()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
