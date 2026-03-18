const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://gymiq-api-production.up.railway.app'

export function apiUrl(path: string): string {
  return `${API_URL}${path}`
}

export { API_URL }
