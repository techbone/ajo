/**
 * Response parsing that survives a server error.
 *
 * A route that throws returns an HTML error page, not JSON, and calling
 * res.json() on it fails with "Unexpected end of JSON input" — which hides the
 * real failure behind a parse error. Always read the body as text first, then
 * try to interpret it.
 */
export async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/** A message worth showing a person, whatever the server actually returned. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await readJson<{ error?: string }>(res)
  if (body?.error) return body.error

  if (res.status === 401) return 'Sign in first.'
  if (res.status === 404) return 'Not found.'
  if (res.status >= 500) {
    return `The server hit an error (${res.status}). This usually means a missing environment variable on the deployment.`
  }
  return `${fallback} (${res.status})`
}

export async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await errorMessage(res, fallback))

  const body = await readJson<T>(res)
  if (body === null) {
    throw new Error(`The server returned an empty response (${res.status}).`)
  }
  return body
}
