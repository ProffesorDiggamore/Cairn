// Git blob id: sha1("blob <byte length>\0" + bytes)
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const buf = new Uint8Array(header.length + body.length)
  buf.set(header)
  buf.set(body, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
