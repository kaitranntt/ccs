import type { EngineInterface, Register } from 'claude-code'

// CCS (the `ccs` launcher) exports this when it starts Claude Code, pointing at
// a JSON file it appends quota alerts to: { version: 1, notices: Notice[] }.
const POLL_MS = 15_000
const TOAST_MS = 10_000

type Notice = {
  id: string
  level: 'warning' | 'error'
  title: string
  details: string[]
  createdAt: number
}

export function parseNotices(text: string): Notice[] {
  try {
    const parsed = JSON.parse(text) as { version?: unknown; notices?: unknown }
    if (parsed.version !== 1 || !Array.isArray(parsed.notices)) return []
    return parsed.notices.filter(
      (n): n is Notice =>
        typeof n === 'object' &&
        n !== null &&
        typeof (n as Notice).id === 'string' &&
        typeof (n as Notice).title === 'string' &&
        Array.isArray((n as Notice).details),
    )
  } catch {
    return []
  }
}

export function formatNotice(notice: Notice): string {
  const prefix = notice.level === 'error' ? '[X]' : '[!]'
  return [`${prefix} ${notice.title}`, ...notice.details].join(' - ')
}

// Notice ids already toasted; starts over when the module reloads.
const seen = new Set<string>()

async function poll($: EngineInterface, file: string): Promise<void> {
  let text: string
  try {
    text = await $.fs.read(file)
  } catch {
    return // not written yet, or the session's ccs already removed it
  }
  const notices = parseNotices(text)
  for (const notice of notices) {
    if (seen.has(notice.id)) continue
    seen.add(notice.id)
    $.ui.toast(formatNotice(notice), { timeoutMs: TOAST_MS })
  }
  const latest = notices[notices.length - 1]
  $.ui.status(latest ? formatNotice(latest) : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const file = await $.env.get('CCS_SESSION_NOTICES_FILE')
    if (file) {
      void poll($, file)
      $.clock.every(POLL_MS, () => void poll($, file))
    }
    return next(e)
  })
}
