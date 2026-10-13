import { describe, expect, it } from 'vitest'
import { findTimes, formatSpan, googleCalendarUrl, icsText, titleAround } from './calendar'

const spans = (t: string, bare = true) => findTimes(t, { bareRanges: bare }).map((m) => formatSpan(m.start, m.end))

describe('times in notes', () => {
  it('reads ranges and single times', () => {
    expect(spans('Math 1-3')).toEqual(['1 PM – 3 PM'])
    expect(spans('class 9:00-10:15')).toEqual(['9 AM – 10:15 AM'])
    expect(spans('lunch 11-1pm')).toEqual(['11 AM – 1 PM'])
    expect(spans('gym 6 to 8pm')).toEqual(['6 PM – 8 PM'])
    expect(spans('call at 3pm')).toEqual(['3 PM'])
    expect(spans('13:00-14:30 standup')).toEqual(['1 PM – 2:30 PM'])
  })
  it('ignores things that only look like times', () => {
    expect(spans('add 2 to 3 cups')).toEqual([])
    expect(spans('pages 10-13')).toEqual([])
    expect(spans('2026-10-13 notes')).toEqual([])
    expect(spans('3 apples')).toEqual([])
    expect(spans('Math 1-3', false)).toEqual([])
  })
  it('builds a title and calendar links', () => {
    const [m] = findTimes('- Math 1-3')
    expect(titleAround('Math 1-3', findTimes('Math 1-3')[0])).toBe('Math')
    const ev = { title: 'Math', date: new Date(2026, 9, 14), start: m.start, end: m.end }
    expect(googleCalendarUrl(ev)).toContain('dates=20261014T130000%2F20261014T150000')
    expect(icsText(ev)).toContain('DTSTART:20261014T130000')
    expect(icsText({ ...ev, start: null, end: null })).toContain('DTEND;VALUE=DATE:20261015')
  })
})
