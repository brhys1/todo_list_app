'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Calendar from 'react-calendar'
// @ts-ignore: CSS side-effect import without type declarations
import 'react-calendar/dist/Calendar.css'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface Task {
  id: string
  task_name: string
  due_date: string
  due_time: string | null
  priority: string
  category: string
  user_id: string
  completed: boolean
}

type Value = Date | null
type ViewMode = 'month' | 'week'

const PRIORITY = {
  high:    { accent: '#fb7185', badgeColor: '#fb7185', badgeBg: 'rgba(251,113,133,0.08)', badgeBorder: 'rgba(251,113,133,0.18)' },
  medium:  { accent: '#a78bfa', badgeColor: '#a78bfa', badgeBg: 'rgba(167,139,250,0.08)', badgeBorder: 'rgba(167,139,250,0.18)' },
  low:     { accent: '#38bdf8', badgeColor: '#38bdf8', badgeBg: 'rgba(56,189,248,0.08)',  badgeBorder: 'rgba(56,189,248,0.18)'  },
  default: { accent: '#3f3f46', badgeColor: '#71717a', badgeBg: 'rgba(63,63,70,0.2)',     badgeBorder: 'rgba(63,63,70,0.3)'    },
}

function getPriority(p: string) {
  return PRIORITY[p.toLowerCase() as keyof typeof PRIORITY] ?? PRIORITY.default
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function startOfWeek(d: Date): Date {
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  start.setHours(0, 0, 0, 0)
  return start
}

export default function TaskCalendar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { user, signOut } = useAuth()
  const [date, setDate] = useState<Value>(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)

  const copyPhone = () => {
    navigator.clipboard.writeText('8559403326')
    setPhoneCopied(true)
    setTimeout(() => setPhoneCopied(false), 2000)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      setGcalConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => setGcalConnected(false), 4000)
    }
  }, [])

  const connectGcal = async () => {
    if (!user) return
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
    const res = await fetch(`${backendUrl}/auth/google/calendar?user_id=${user.id}`)
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const fetchTasks = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: true })
        .order('due_time', { ascending: true, nullsFirst: false })
      if (error) { console.error('Error fetching tasks:', error); return }
      setTasks(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchTasks()
    const channel = supabase
      .channel('tasks-changes', { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT')      setTasks(prev => [...prev, payload.new as Task])
        else if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === (payload.new as Task).id ? payload.new as Task : t))
        else if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, fetchTasks])

  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const selectedDateString = useMemo(() => toLocalDateString(date ?? new Date()), [date])

  const formattedSelectedDate = useMemo(() => {
    if (!date) return 'Select a date'
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }, [date])

  const selectedDateTasks = useMemo(() => {
    return tasks
      .filter(t => t.due_date === selectedDateString)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
        if (a.due_time) return -1
        if (b.due_time) return 1
        return 0
      })
  }, [tasks, selectedDateString])

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const dc = a.due_date.localeCompare(b.due_date)
      if (dc !== 0) return dc
      if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
      if (a.due_time) return -1
      if (b.due_time) return 1
      return 0
    })
  }, [tasks])

  const getTasksForDate = (d: Date) =>
    tasks.filter(t => t.due_date === toLocalDateString(d) && !t.completed).length

  const tileContent = ({ date: d, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null
    const count = getTasksForDate(d)
    if (!count) return null
    return (
      <div className="flex justify-center gap-0.5 mt-1.5">
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <span key={i} className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }} />
        ))}
      </div>
    )
  }

  // ── Week view helpers ──────────────────────────────────────────
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    }),
    [weekStart]
  )

  const weekHeaderText = useMemo(() => {
    const s = weekDays[0]
    const e = weekDays[6]
    const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${sStr} – ${eStr}`
  }, [weekDays])

  const switchToWeek = () => {
    setWeekStart(startOfWeek(date ?? new Date()))
    setViewMode('week')
  }

  const prevWeek = () => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })
  const nextWeek = () => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })

  const goToToday = () => {
    const today = new Date()
    setWeekStart(startOfWeek(today))
    setDate(today)
  }

  const getTasksForDaySorted = (dayStr: string) =>
    tasks
      .filter(t => t.due_date === dayStr)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
        if (a.due_time) return -1
        if (b.due_time) return 1
        return 0
      })

  // ── Task actions ───────────────────────────────────────────────
  const toggleComplete = async (task: Task) => {
    const newCompleted = !task.completed
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: newCompleted } : t))
    await supabase.from('tasks').update({ completed: newCompleted }).eq('id', task.id)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setEditDate(task.due_date)
    setEditTime(task.due_time || '')
  }

  const saveEdit = async () => {
    if (!editingTask) return
    await supabase.from('tasks').update({ due_date: editDate, due_time: editTime || null }).eq('id', editingTask.id)
    setEditingTask(null)
  }

  // ── Task card (used in day panel and all-tasks list) ───────────
  const TaskCard = ({ task, showDate = false }: { task: Task; showDate?: boolean }) => {
    const p = getPriority(task.priority)
    return (
      <div
        className="rounded-r-xl transition-all group"
        style={{
          background: task.completed ? '#080808' : '#0f0f0f',
          borderTop: '1px solid #1a1a1a',
          borderRight: '1px solid #1a1a1a',
          borderBottom: '1px solid #1a1a1a',
          borderLeft: `2px solid ${task.completed ? '#2a2a2a' : p.accent}`,
          padding: '12px 14px',
          opacity: task.completed ? 0.45 : 1,
        }}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => toggleComplete(task)}
            className="mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
            style={{ background: task.completed ? '#7c3aed' : 'transparent', border: `1px solid ${task.completed ? '#7c3aed' : '#333333'}` }}
            onMouseEnter={(e) => { if (!task.completed) e.currentTarget.style.borderColor = '#7c3aed' }}
            onMouseLeave={(e) => { if (!task.completed) e.currentTarget.style.borderColor = '#333333' }}
          >
            {task.completed && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <span
            className="flex-1 text-sm font-medium leading-snug"
            style={{ color: task.completed ? '#52525b' : '#f4f4f5', textDecoration: task.completed ? 'line-through' : 'none' }}
          >
            {task.task_name}
          </span>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => openEdit(task)}
              className="transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: '#3f3f46' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#71717a' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#3f3f46' }}
              title="Edit"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded tracking-wide uppercase"
              style={{ color: p.badgeColor, background: p.badgeBg, border: `1px solid ${p.badgeBorder}` }}
            >
              {task.priority}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 ml-7 text-xs" style={{ color: '#3f3f46' }}>
          {showDate && <span>{formatShortDate(task.due_date)}</span>}
          {task.due_time && <span>{formatTime(task.due_time)}</span>}
          {task.category && <span>{task.category}</span>}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <div key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#3f3f46', animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  const openCount = tasks.filter(t => !t.completed).length
  const todayStr = toLocalDateString(new Date())

  return (
    <div className="min-h-screen bg-black">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ borderBottom: '1px solid #141414' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#7c3aed' }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-semibold text-white tracking-tight text-sm">Tasks</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#111111', color: '#52525b', border: '1px solid #1c1c1c' }}>
              {openCount} open
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={copyPhone}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#52525b' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = '#111111' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.background = 'transparent' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {phoneCopied ? 'Copied!' : '(855) 940-3326'}
            </button>

            <span className="text-xs hidden md:block" style={{ color: '#2a2a2a', margin: '0 4px' }}>|</span>
            <span className="text-xs hidden md:block truncate max-w-[180px]" style={{ color: '#3f3f46' }}>{user?.email}</span>

            {gcalConnected && (
              <span className="text-xs flex items-center gap-1 px-2" style={{ color: '#34d399' }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                GCal linked
              </span>
            )}

            <span className="hidden md:block" style={{ color: '#1c1c1c', margin: '0 2px' }}>|</span>

            <button
              onClick={connectGcal}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#52525b' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = '#111111' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.background = 'transparent' }}
            >
              Connect GCal
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#3f3f46' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#111111' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#3f3f46'; e.currentTarget.style.background = 'transparent' }}
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#3f3f46' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#111111' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#3f3f46'; e.currentTarget.style.background = 'transparent' }}
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* ── Calendar + Day panel ────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Calendar panel */}
          <div className="xl:col-span-2">
            <div className="rounded-2xl p-6" style={{ background: '#080808', border: '1px solid #141414' }}>
              {/* View toggle */}
              <div className="flex items-center justify-between mb-5">
                <div
                  className="flex rounded-lg p-0.5"
                  style={{ background: '#111111', border: '1px solid #1c1c1c' }}
                >
                  <button
                    onClick={() => setViewMode('month')}
                    className="text-xs px-3.5 py-1.5 rounded-md font-medium transition-all"
                    style={{ background: viewMode === 'month' ? '#1c1c1c' : 'transparent', color: viewMode === 'month' ? '#ffffff' : '#52525b' }}
                  >
                    Month
                  </button>
                  <button
                    onClick={switchToWeek}
                    className="text-xs px-3.5 py-1.5 rounded-md font-medium transition-all"
                    style={{ background: viewMode === 'week' ? '#1c1c1c' : 'transparent', color: viewMode === 'week' ? '#ffffff' : '#52525b' }}
                  >
                    Week
                  </button>
                </div>

                {viewMode === 'week' && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-white mr-2">{weekHeaderText}</span>
                    <button
                      onClick={goToToday}
                      className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                      style={{ color: '#71717a', border: '1px solid #222222' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = '#3f3f46' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.borderColor = '#222222' }}
                    >
                      Today
                    </button>
                    <button
                      onClick={prevWeek}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#52525b' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#111111' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={nextWeek}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#52525b' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#111111' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {viewMode === 'month' ? (
                <Calendar
                  onChange={(value) => setDate(value as Date)}
                  value={date}
                  tileContent={tileContent}
                  calendarType="gregory"
                  className="w-full"
                />
              ) : (
                /* ── Week view grid ───────────────────────────────── */
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day) => {
                    const dayStr = toLocalDateString(day)
                    const dayTasks = getTasksForDaySorted(dayStr)
                    const isToday = dayStr === todayStr
                    const isSelected = dayStr === selectedDateString
                    const visible = dayTasks.slice(0, 4)
                    const overflow = dayTasks.length - visible.length

                    return (
                      <button
                        key={dayStr}
                        onClick={() => setDate(new Date(day))}
                        className="text-left rounded-xl p-2.5 transition-all flex flex-col"
                        style={{
                          minHeight: '220px',
                          background: isSelected ? 'rgba(124,58,237,0.12)' : '#0a0a0a',
                          border: isSelected
                            ? '1px solid rgba(124,58,237,0.45)'
                            : isToday
                            ? '1px solid #2a2a2a'
                            : '1px solid #141414',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#0f0f0f'
                            e.currentTarget.style.borderColor = '#222222'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#0a0a0a'
                            e.currentTarget.style.borderColor = isToday ? '#2a2a2a' : '#141414'
                          }
                        }}
                      >
                        {/* Day header */}
                        <div
                          className="text-center pb-2 mb-2"
                          style={{ borderBottom: '1px solid #161616' }}
                        >
                          <div
                            className="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: '#3f3f46' }}
                          >
                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div
                            className="text-lg font-semibold mt-0.5 leading-none"
                            style={{ color: isToday ? '#fbbf24' : isSelected ? '#a78bfa' : '#52525b' }}
                          >
                            {day.getDate()}
                          </div>
                        </div>

                        {/* Task pills */}
                        <div className="flex-1 space-y-1 min-w-0">
                          {visible.map((task) => {
                            const p = getPriority(task.priority)
                            return (
                              <div
                                key={task.id}
                                className="text-xs rounded truncate"
                                style={{
                                  background: '#111111',
                                  borderLeft: `2px solid ${task.completed ? '#222222' : p.accent}`,
                                  color: task.completed ? '#333333' : '#71717a',
                                  textDecoration: task.completed ? 'line-through' : 'none',
                                  padding: '2px 5px 2px 5px',
                                  lineHeight: '1.5',
                                }}
                              >
                                {task.task_name}
                              </div>
                            )
                          })}
                          {overflow > 0 && (
                            <div className="text-xs pl-0.5" style={{ color: '#3f3f46' }}>
                              +{overflow} more
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Day tasks panel */}
          <div className="xl:col-span-1 flex flex-col">
            <div className="rounded-2xl p-5 flex flex-col flex-1" style={{ background: '#080808', border: '1px solid #141414' }}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white tracking-tight">{formattedSelectedDate}</h2>
                <p className="text-xs mt-0.5" style={{ color: '#3f3f46' }}>
                  {selectedDateTasks.filter(t => !t.completed).length} of {selectedDateTasks.length} remaining
                </p>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto">
                {selectedDateTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                      <svg className="w-4 h-4" style={{ color: '#2a2a2a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-xs" style={{ color: '#2a2a2a' }}>Nothing scheduled</p>
                  </div>
                ) : (
                  selectedDateTasks.map((task) => <TaskCard key={task.id} task={task} />)
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── All Tasks ───────────────────────────────────────────── */}
        <div className="rounded-2xl p-6" style={{ background: '#080808', border: '1px solid #141414' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-white tracking-tight">All Tasks</h2>
            <span className="text-xs" style={{ color: '#3f3f46' }}>{sortedTasks.filter(t => !(t.completed && t.due_date < todayStr)).length} tasks</span>
          </div>

          {(() => {
            const visible = sortedTasks.filter(t => !(t.completed && t.due_date < todayStr))
            return visible.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm" style={{ color: '#2a2a2a' }}>
                  No tasks yet — text one to (855) 940-3326 to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((task) => <TaskCard key={task.id} task={task} showDate />)}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────── */}
      {editingTask && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingTask(null) }}
        >
          <div className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" style={{ background: '#0f0f0f', border: '1px solid #2a2a2a' }}>
            <h3 className="text-sm font-semibold text-white mb-0.5">Edit Task</h3>
            <p className="text-xs mb-5 truncate" style={{ color: '#52525b' }}>{editingTask.task_name}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider font-medium mb-1.5" style={{ color: '#3f3f46' }}>Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white transition-colors"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  onFocus={(e) => { e.target.style.borderColor = '#7c3aed' }}
                  onBlur={(e) => { e.target.style.borderColor = '#2a2a2a' }}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider font-medium mb-1.5" style={{ color: '#3f3f46' }}>
                  Time <span className="normal-case font-normal" style={{ color: '#2a2a2a' }}>(optional)</span>
                </label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white transition-colors"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  onFocus={(e) => { e.target.style.borderColor = '#7c3aed' }}
                  onBlur={(e) => { e.target.style.borderColor = '#2a2a2a' }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ background: '#7c3aed' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#6d28d9' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#7c3aed' }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingTask(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: '#71717a', background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
