const DEV_API_BASE_URL = 'http://localhost:5006'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const apiBaseUrl = (configuredBaseUrl || (import.meta.env.DEV ? DEV_API_BASE_URL : '')).replace(/\/$/, '')

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}
