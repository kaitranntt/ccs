import { expect, mock, test } from 'claude-code/testing'

const FILE = '/tmp/ccs-notices-test.json'

function noticesFile(notices: Array<{ id: string; level: 'warning' | 'error'; title: string; details: string[] }>) {
  return JSON.stringify({ version: 1, notices: notices.map(n => ({ ...n, createdAt: 0 })) })
}

test('toasts each new notice once and keeps the latest title on the status line', async ($, on) => {
  mock.env(on, { CCS_SESSION_NOTICES_FILE: FILE })
  const clock = mock.clock(on)
  let file: string | null = noticesFile([])
  const toasts: string[] = []
  const statuses: Array<string | undefined> = []

  on('fs.read', (_$, e) => {
    if (e.path !== FILE || file === null) return { deny: 'ENOENT' }
    return { value: file }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  expect(toasts).toEqual([])

  file = noticesFile([
    {
      id: 'a',
      level: 'warning',
      title: 'Quota low (9% left): ken***@example.com',
      details: ['Next session will use a different account if available'],
    },
  ])
  await clock.advance(15_000)
  expect(toasts).toEqual([
    '[!] Quota low (9% left): ken***@example.com - Next session will use a different account if available',
  ])
  // One row, cut at the terminal's width: the title alone, key fact first.
  expect(statuses[statuses.length - 1]).toBe('[!] Quota low (9% left): ken***@example.com')

  // Same file on the next poll: no second toast.
  await clock.advance(15_000)
  expect(toasts).toHaveLength(1)

  file = noticesFile([
    { id: 'a', level: 'warning', title: 'Quota low (9% left): ken***@example.com', details: [] },
    { id: 'b', level: 'error', title: 'Quota exhausted: ken***@example.com', details: ['Cooldown: 5 minutes'] },
  ])
  await clock.advance(15_000)
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toBe('[X] Quota exhausted: ken***@example.com - Cooldown: 5 minutes')
  expect(statuses[statuses.length - 1]).toBe('[X] Quota exhausted: ken***@example.com')
})

test('does nothing outside a CCS session', async ($, on) => {
  mock.env(on, {})
  const clock = mock.clock(on)
  let reads = 0
  on('fs.read', () => {
    reads += 1
    return { value: '' }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(reads).toBe(0)
})

test('toasts only when the status line option is off', { options: { status_line: false } }, async ($, on) => {
  mock.env(on, { CCS_SESSION_NOTICES_FILE: FILE })
  const clock = mock.clock(on)
  const file = noticesFile([
    { id: 'a', level: 'warning', title: 'Quota low (9% left): ken***@example.com', details: [] },
  ])
  const toasts: string[] = []
  const statuses: Array<string | undefined> = []
  on('fs.read', (_$, e) => (e.path === FILE ? { value: file } : { deny: 'ENOENT' }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(15_000)
  expect(toasts).toEqual(['[!] Quota low (9% left): ken***@example.com'])
  // Only the clear at session start: no alert is ever pinned.
  expect(statuses).toEqual([undefined])
})
