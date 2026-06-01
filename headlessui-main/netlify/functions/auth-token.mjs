export async function handler(request) {
  if (request.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const payload = JSON.parse(request.body || '{}')
    const {
      baseUrl: inputBaseUrl,
      clientId: inputClientId,
      clientSecret: inputClientSecret
    } = payload

    const baseUrl = (
      inputBaseUrl ||
      process.env.SNOW_BASE_URL ||
      process.env.VITE_SNOW_BASE_URL ||
      process.env.SERVICENOW_BASE_URL ||
      ''
    ).trim()
    const clientId = (
      inputClientId ||
      process.env.SNOW_CLIENT_ID ||
      process.env.VITE_SNOW_CLIENT_ID ||
      process.env.SERVICENOW_CLIENT_ID ||
      ''
    ).trim()
    const clientSecret = (
      inputClientSecret ||
      process.env.SNOW_CLIENT_SECRET ||
      process.env.VITE_SNOW_CLIENT_SECRET ||
      process.env.SERVICENOW_CLIENT_SECRET ||
      ''
    ).trim()

    if (!baseUrl || !clientId || !clientSecret) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Netlify auth configuration is incomplete. Set SNOW_CLIENT_ID/SNOW_CLIENT_SECRET/SNOW_BASE_URL (or VITE_/SERVICENOW_ variants).'
        })
      }
    }

    const formBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })

    const response = await fetch(`${baseUrl}/oauth_token.do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody.toString()
    })

    const text = await response.text()

    // Avoid browser-native auth popups from upstream 401 challenges.
    // We intentionally map upstream 401 to 400 and return JSON.
    let statusCode = response.status
    if (statusCode === 401) {
      statusCode = 400
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: text
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Token proxy failed'
      })
    }
  }
}
