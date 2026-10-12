import type { SyncConfig } from '../types'

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
}

export type NewTreeEntry =
  | { path: string; mode: '100644'; type: 'blob'; content: string }
  | { path: string; mode: '100644'; type: 'blob'; sha: null }

export function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/i.exec(s)
  return m ? { owner: m[1], repo: m[2] } : null
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export class GitHubApi {
  constructor(
    private cfg: SyncConfig,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private get branchPath() {
    return this.cfg.branch.split('/').map(encodeURIComponent).join('/')
  }

  private get base() {
    return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}`
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(this.base + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.cfg.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new GitHubError(0, 'Offline — will sync when you reconnect.')
    }
    if (!res.ok) {
      let msg = ''
      try {
        msg = ((await res.json()) as { message?: string }).message ?? ''
      } catch {
        /* not json */
      }
      throw new GitHubError(res.status, friendly(res.status, msg))
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  getRepo() {
    return this.req<{ full_name: string; private: boolean; default_branch: string; permissions?: { push?: boolean } }>('GET', '')
  }

  // null when the branch doesn't exist yet or the repo is empty.
  async getHead(): Promise<string | null> {
    try {
      const r = await this.req<{ object: { sha: string } }>('GET', `/git/ref/heads/${this.branchPath}`)
      return r.object.sha
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return null
      throw e
    }
  }

  async getCommitTree(sha: string): Promise<string> {
    const c = await this.req<{ tree: { sha: string } }>('GET', `/git/commits/${sha}`)
    return c.tree.sha
  }

  // Lists every blob under the tree; falls back to walking when GitHub truncates.
  async listBlobs(treeSha: string, keepDir: (dir: string) => boolean = () => true): Promise<TreeEntry[]> {
    const r = await this.req<{ tree: TreeEntry[]; truncated: boolean }>('GET', `/git/trees/${treeSha}?recursive=1`)
    if (!r.truncated) return r.tree.filter((e) => e.type === 'blob')
    const out: TreeEntry[] = []
    const walk = async (sha: string, prefix: string) => {
      const t = await this.req<{ tree: TreeEntry[] }>('GET', `/git/trees/${sha}`)
      for (const e of t.tree) {
        const path = prefix + e.path
        if (e.type === 'blob') out.push({ ...e, path })
        else if (e.type === 'tree' && keepDir(path)) await walk(e.sha, path + '/')
      }
    }
    await walk(treeSha, '')
    return out
  }

  async getBlobText(sha: string): Promise<string> {
    const b = await this.req<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`)
    return b.encoding === 'base64' ? decodeBase64Utf8(b.content) : b.content
  }

  async createTree(baseTree: string | null, tree: NewTreeEntry[]): Promise<string> {
    const r = await this.req<{ sha: string }>('POST', '/git/trees', baseTree ? { base_tree: baseTree, tree } : { tree })
    return r.sha
  }

  async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
    const r = await this.req<{ sha: string }>('POST', '/git/commits', { message, tree, parents })
    return r.sha
  }

  // false when someone else pushed first (not a fast-forward).
  async updateHead(sha: string): Promise<boolean> {
    try {
      await this.req('PATCH', `/git/refs/heads/${this.branchPath}`, { sha, force: false })
      return true
    } catch (e) {
      if (e instanceof GitHubError && e.status === 422) return false
      throw e
    }
  }

  async createBranch(sha: string): Promise<boolean> {
    try {
      await this.req('POST', '/git/refs', { ref: `refs/heads/${this.cfg.branch}`, sha })
      return true
    } catch (e) {
      if (e instanceof GitHubError && e.status === 422) return false
      throw e
    }
  }

  // The Git Data API refuses to work on a repo with no commits, so the very
  // first file goes through the Contents API.
  async initEmptyRepo(path: string, content: string, message: string): Promise<void> {
    const p = path.split('/').map(encodeURIComponent).join('/')
    // No branch: an empty repo's first commit always lands on its default branch.
    await this.req('PUT', `/contents/${p}`, { message, content: encodeBase64Utf8(content) })
  }
}

function friendly(status: number, msg: string): string {
  if (status === 401) return 'GitHub rejected the token. Paste a new one in Settings.'
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub rate limit hit — sync will retry shortly.'
  if (status === 403) return "The token can't write to this repo. Give it Contents: Read and write access."
  if (status === 404) return 'Repo not found. Check the name, and that the token has access to it.'
  return msg ? `GitHub error: ${msg}` : `GitHub error ${status}`
}
