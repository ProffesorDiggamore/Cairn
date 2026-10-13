import { CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  clockSvg,
  downloadIcs,
  findTimes,
  formatSpan,
  isoDay,
  openInGoogleCalendar,
  titleAround,
  type CalendarEvent,
  type ClockTime,
} from '../lib/calendar'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { openNote } from '../lib/router'
import { setSettings, useSettings } from '../lib/settings'
import { dailyNotePath, openDailyNote, useVault } from '../lib/vault'
import { Modal } from './ui'
import { useUI, type CalendarPrefill } from './uiState'

// The Calendar button: a month of daily notes, the times written in them, and
// a quick way to put any of it on Google Calendar (or Apple Calendar via .ics).

const toInput = (t: ClockTime | null | undefined) => (t ? `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` : '')
const fromInput = (v: string): ClockTime | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(v)
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null
}
const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

interface DayItem {
  title: string
  start: ClockTime
  end: ClockTime | null
}

function itemsIn(content: string): DayItem[] {
  const out: DayItem[] = []
  for (const raw of splitFrontmatter(content).body.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)/, '')
    for (const m of findTimes(line, { bareRanges: useSettings.getState().bareTimeRanges })) {
      out.push({ title: titleAround(line, m) || 'Event', start: m.start, end: m.end })
    }
  }
  return out.sort((a, b) => a.start.h * 60 + a.start.m - (b.start.h * 60 + b.start.m))
}

function EventForm({ prefill, day }: { prefill: CalendarPrefill; day: Date }) {
  const app = useSettings((s) => s.calendarApp)
  const [title, setTitle] = useState(prefill.title ?? '')
  const [date, setDate] = useState(prefill.date ?? isoDay(day))
  const [allDay, setAllDay] = useState(!prefill.start && !!prefill.date)
  const [start, setStart] = useState(toInput(prefill.start) || '09:00')
  const [end, setEnd] = useState(toInput(prefill.end) || '')
  const [details, setDetails] = useState(prefill.details ?? '')

  useEffect(() => {
    if (!prefill.date) setDate(isoDay(day))
  }, [day, prefill.date])

  const event = (): CalendarEvent => ({
    title: title.trim() || 'Event',
    date: parseIso(date),
    start: allDay ? null : fromInput(start),
    end: allDay ? null : fromInput(end),
    details: details.trim() || undefined,
  })

  const google = (
    <button type="button" className={'btn btn-sm' + (app === 'google' ? ' btn-primary' : '')} onClick={() => openInGoogleCalendar(event())}>
      <CalendarPlus size={15} /> Add to Google Calendar
    </button>
  )
  const ics = (
    <button type="button" className={'btn btn-sm' + (app === 'ics' ? ' btn-primary' : '')} onClick={() => downloadIcs(event())}>
      <Download size={15} /> Apple Calendar (.ics)
    </button>
  )

  return (
    <form className="cal-form" onSubmit={(e) => (e.preventDefault(), app === 'google' ? openInGoogleCalendar(event()) : downloadIcs(event()))}>
      <div className="cal-form-title">New event</div>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s happening?" autoFocus={!prefill.title} />
      <div className="cal-form-row">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="cal-allday">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
      </div>
      {!allDay && (
        <div className="cal-form-row">
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Starts" />
          <span className="muted">to</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Ends" />
        </div>
      )}
      <textarea className="input cal-details" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Notes (optional)" />
      <div className="row-gap">
        {app === 'google' ? (
          <>
            {google}
            {ics}
          </>
        ) : (
          <>
            {ics}
            {google}
          </>
        )}
      </div>
    </form>
  )
}

export function CalendarPanel() {
  const prefill = useUI((s) => s.calendar)
  if (!prefill) return null
  return <CalendarBody prefill={prefill} />
}

function CalendarBody({ prefill }: { prefill: CalendarPrefill }) {
  const files = useVault((s) => s.files)
  const dailyFolder = useSettings((s) => s.dailyFolder)
  const monday = useSettings((s) => s.weekStartsMonday)
  const h24 = useSettings((s) => s.clock24)
  const calendarApp = useSettings((s) => s.calendarApp)
  const today = new Date()
  const [day, setDay] = useState(() => (prefill.date ? parseIso(prefill.date) : today))
  const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1))
  const close = () => useUI.setState({ calendar: null })

  // Which days of this month have a daily note (and whether it lists times).
  const marks = useMemo(() => {
    const out = new Map<string, 'note' | 'times'>()
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    for (let d = 1; d <= last; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d)
      const f = files[dailyNotePath(date)]
      if (!f || f.deleted) continue
      out.set(isoDay(date), /\d/.test(f.content) && itemsIn(f.content).length ? 'times' : 'note')
    }
    return out
    // dailyFolder changes where daily notes live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, month, dailyFolder])

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() - (monday ? 1 : 0) + 7) % 7
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month, monday])

  const weekdays = monday ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const dayPath = dailyNotePath(day)
  const dayNote = files[dayPath]
  const items = dayNote && !dayNote.deleted ? itemsIn(dayNote.content) : []

  const go = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
  const pick = (d: Date) => {
    setDay(d)
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  return (
    <Modal title="Calendar" onClose={close} wide className="calendar-modal">
      <div className="cal-body">
        <div className="cal-left">
          <div className="cal-head">
            <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <div className="cal-month">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => pick(today)}>
              Today
            </button>
          </div>
          <div className="cal-grid">
            {weekdays.map((w, i) => (
              <div key={i} className="cal-wd">
                {w}
              </div>
            ))}
            {cells.map((d) => {
              const key = isoDay(d)
              const mark = marks.get(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={
                    'cal-day' +
                    (d.getMonth() !== month.getMonth() ? ' is-out' : '') +
                    (sameDay(d, today) ? ' is-today' : '') +
                    (sameDay(d, day) ? ' is-selected' : '')
                  }
                  onClick={() => pick(d)}
                  onDoubleClick={() => {
                    openNote(openDailyNote(d))
                    close()
                  }}
                >
                  {d.getDate()}
                  {mark && <span className={'cal-dot' + (mark === 'times' ? ' has-times' : '')} />}
                </button>
              )
            })}
          </div>
          <div className="cal-day-panel">
            <div className="cal-day-title">{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                openNote(openDailyNote(day))
                close()
              }}
            >
              <FileText size={15} /> {dayNote && !dayNote.deleted ? 'Open daily note' : 'Start a daily note'}
            </button>
            {items.length > 0 && (
              <ul className="cal-items">
                {items.map((it, i) => (
                  <li key={i}>
                    <span className="cal-clock" dangerouslySetInnerHTML={{ __html: clockSvg(it.start, it.end, 16) }} />
                    <span className="cal-time">{formatSpan(it.start, it.end, h24)}</span>
                    <span className="cal-what">{it.title}</span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      title="Add to calendar"
                      onClick={() => {
                        const ev = { title: it.title, date: day, start: it.start, end: it.end }
                        if (calendarApp === 'ics') downloadIcs(ev)
                        else openInGoogleCalendar(ev)
                      }}
                    >
                      <CalendarPlus size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="cal-right">
          <EventForm prefill={prefill} day={day} />
          <div className="cal-foot">
            <a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer" className="link-btn">
              Open Google Calendar <ExternalLink size={12} />
            </a>
            <label className="cal-pref">
              Default
              <select value={calendarApp} onChange={(e) => setSettings({ calendarApp: e.target.value as 'google' | 'ics' })}>
                <option value="google">Google Calendar</option>
                <option value="ics">Apple Calendar (.ics)</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}
