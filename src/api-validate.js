const BASE_URL = 'https://api.wassenger.com/v1'
const TIMEOUT_MS = 10_000

export async function validateApiKey (apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key is empty.')
  }
  if (apiKey.length < 30 || apiKey.length > 200) {
    throw new Error(`API key length ${apiKey.length} is out of range (expected 30-200).`)
  }

  const devices = await call('/devices', apiKey)
  const me = await call('/me', apiKey).catch(() => null)

  return {
    email: me?.email ?? 'unknown',
    name: me?.name ?? '',
    devices: Array.isArray(devices) ? devices.length : 0,
    devicesReady: Array.isArray(devices) ? devices.filter(d => d.status === 'ready').length : 0,
    raw: { devices, me }
  }
}

async function call (resource, apiKey) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE_URL}${resource}`, {
      headers: { Token: apiKey, Accept: 'application/json' },
      signal: controller.signal
    })

    if (res.status === 401) {
      throw new Error('API key rejected (401). Verify at https://app.wassenger.com/developers/apikeys?ref=skills&utm_source=cli')
    }
    if (res.status === 403) {
      throw new Error('API key forbidden (403). The key may not have the required scopes.')
    }
    if (res.status === 429) {
      throw new Error('Rate-limited (429). Wait a minute and retry.')
    }
    if (!res.ok) {
      throw new Error(`Wassenger API ${res.status} on ${resource}`)
    }

    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Wassenger API did not respond within ${TIMEOUT_MS}ms (${resource}).`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
