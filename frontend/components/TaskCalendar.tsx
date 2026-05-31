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

export default function TaskCalendar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { user, signOut } = useAuth()
  const [date, setDate] = useState<Value>(new Date())
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

      if (error) {
        console.error('Error fetching tasks:', error)
        return
      }

      setTasks(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    fetchTasks()
    const channel = supabase
      .channel('tasks-changes', {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [...prev, payload.new as Task])
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev => prev.map(t => t.id === (payload.new as Task).id ? payload.new as Task : t))
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id))
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to task changes')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchTasks])

  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const selectedDateString = useMemo(() => {
    return toLocalDateString(date ?? new Date())
  }, [date])

  const formattedSelectedDate = useMemo(() => {
    if (!date) return 'Select a date'
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }, [date])

  const selectedDateTasks = useMemo(() => {
    const dateTasks = tasks.filter(task => task.due_date === selectedDateString)
    return dateTasks.sort((a, b) => {
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
      const dateCompare = a.due_date.localeCompare(b.due_date)
      if (dateCompare !== 0) return dateCompare
      if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
      if (a.due_time) return -1
      if (b.due_time) return 1
      return 0
    })
  }, [tasks])

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => task.due_date === toLocalDateString(date) && !task.completed).length
  }

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const taskCount = getTasksForDate(date)
      if (taskCount > 0) {
        return (
          <div className="flex justify-center mt-2">
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 font-semibold">
              {taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}
            </span>
          </div>
        )
      }
    }
    return null
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':   return 'bg-red-900/40 border-red-500 text-red-200'
      case 'medium': return 'bg-yellow-900/40 border-yellow-500 text-yellow-200'
      case 'low':    return 'bg-green-900/40 border-green-500 text-green-200'
      default:       return 'bg-gray-800 border-gray-500 text-gray-200'
    }
  }

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
    await supabase.from('tasks').update({
      due_date: editDate,
      due_time: editTime || null,
    }).eq('id', editingTask.id)
    setEditingTask(null)
  }

  const TaskCard = ({ task, showDate = false }: { task: Task; showDate?: boolean }) => (
    <div className={`border-l-4 p-4 rounded-r-lg transition-colors ${getPriorityColor(task.priority)} ${task.completed ? 'opacity-50' : 'bg-gray-800/50 hover:bg-gray-800'}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => toggleComplete(task)}
          className={`mt-1 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${task.completed ? 'bg-green-600 border-green-600 text-white' : 'border-gray-500 hover:border-green-500'}`}
        >
          {task.completed && <span className="text-xs leading-none">✓</span>}
        </button>
        <div className={`font-bold text-lg text-white flex-1 ${task.completed ? 'line-through' : ''}`}>
          {task.task_name}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => openEdit(task)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Edit task"
          >
            ✏️
          </button>
          <span className="text-xs uppercase tracking-wider font-bold opacity-70 border border-current px-1.5 rounded">
            {task.priority}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-gray-400 pl-7">
        {showDate && (
          <div className="flex items-center">
            <span className="mr-2">📅</span>
            {task.due_date}
          </div>
        )}
        {task.due_time && (
          <div className="flex items-center">
            <span className="mr-2">🕐</span>
            {task.due_time}
          </div>
        )}
        <div className="col-span-2 flex items-center mt-1">
          <span className="mr-2">🏷️</span>
          {task.category}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-black">
        <p className="text-gray-400">Loading tasks...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-6 min-h-screen bg-black">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <h1 className="text-4xl font-bold text-white">Task Calendar</h1>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <button
            onClick={copyPhone}
            className="flex items-center gap-1.5 text-gray-400 text-sm hover:text-white transition-colors"
            title="Copy phone number"
          >
            Text tasks to: (855) 940-3326
            <span className="text-xs">{phoneCopied ? '✓ Copied' : '⎘'}</span>
          </button>
          <span className="text-gray-400 text-sm">{user?.email}</span>
          {gcalConnected && (
            <span className="text-green-400 text-sm font-medium">✓ Google Calendar connected</span>
          )}
          <button
            onClick={connectGcal}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Connect GCal
          </button>
          <button
            onClick={onOpenSettings}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Settings
          </button>
          <button
            onClick={signOut}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <div className="bg-gray-900 rounded-xl shadow-2xl p-6 border border-gray-800">
            <Calendar
              onChange={(value) => setDate(value as Date)}
              value={date}
              tileContent={tileContent}
              className="w-full"
            />
          </div>
        </div>

        <div className="xl:col-span-1">
          <div className="bg-gray-900 rounded-xl shadow-2xl p-6 h-full border border-gray-800 flex flex-col">
            <h2 className="text-2xl font-bold mb-2 text-white border-b border-gray-800 pb-4">
              {formattedSelectedDate}
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              {selectedDateTasks.length} {selectedDateTasks.length === 1 ? 'Task' : 'Tasks'}
            </p>

            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              {selectedDateTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-10">No tasks for this date</p>
              ) : (
                selectedDateTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <div className="bg-gray-900 rounded-xl shadow-2xl p-6 border border-gray-800">
          <h2 className="text-3xl font-bold mb-6 text-white border-b border-gray-800 pb-4">
            All Tasks ({tasks.length})
          </h2>

          {sortedTasks.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No tasks found</p>
          ) : (
            <div className="space-y-6">
              {sortedTasks.map((task) => (
                <TaskCard key={task.id} task={task} showDate />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 w-full max-w-sm mx-4">
            <h3 className="text-white font-bold text-lg mb-1">Edit Task</h3>
            <p className="text-gray-400 text-sm mb-5">{editingTask.task_name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Time (optional)</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors font-semibold"
              >
                Save
              </button>
              <button
                onClick={() => setEditingTask(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
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
