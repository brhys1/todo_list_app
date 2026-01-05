'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Calendar from 'react-calendar'
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
}


type Value = Date | null

export default function TaskCalendar() {
  const { user, signOut } = useAuth()
  const [date, setDate] = useState<Value>(new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch tasks from the Supabase database for the current user
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
    // Set up connection to the Supabase to listen for task changes
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
          console.log('Task change detected:', payload.eventType, payload)
          fetchTasks()
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

  // Get selected date in YYYY-MM-DD format
  const selectedDateString = useMemo(() => {
    if (!date) return new Date().toISOString().split('T')[0]
    return date.toISOString().split('T')[0]
  }, [date])

  // Format selected date for display in the UI
  const formattedSelectedDate = useMemo(() => {
    if (!date) return 'Select a date'
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }, [date])

  // Filter and sort selected date's tasks by time
  const selectedDateTasks = useMemo(() => {
    const dateTasks = tasks.filter(task => task.due_date === selectedDateString)
    return dateTasks.sort((a, b) => {
      // Sort by time if both have times
      if (a.due_time && b.due_time) {
        return a.due_time.localeCompare(b.due_time)
      }
      // Tasks with times come first
      if (a.due_time) return -1
      if (b.due_time) return 1
      return 0
    })
  }, [tasks, selectedDateString])

  // Sort all tasks by date and time
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const dateCompare = a.due_date.localeCompare(b.due_date)
      if (dateCompare !== 0) return dateCompare
      
      // If dates are the same, sort by time
      if (a.due_time && b.due_time) {
        return a.due_time.localeCompare(b.due_time)
      }
      if (a.due_time) return -1
      if (b.due_time) return 1
      return 0
    })
  }, [tasks])

  const getTasksForDate = (date: Date) => {
    const formattedDate = date.toISOString().split('T')[0]
    return tasks.filter(task => task.due_date === formattedDate).length
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
      case 'high':
        return 'bg-red-900/40 border-red-500 text-red-200'
      case 'medium':
        return 'bg-yellow-900/40 border-yellow-500 text-yellow-200'
      case 'low':
        return 'bg-green-900/40 border-green-500 text-green-200'
      default:
        return 'bg-gray-800 border-gray-500 text-gray-200'
    }
  }

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
          <span className="text-gray-400 text-sm">Text tasks to: (484) 939-6264</span>
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button
            onClick={signOut}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Calendar Section - Now takes up 2 columns on large screens */}
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

        {/* Tasks List - Takes up 1 column */}
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
                  <div
                    key={task.id}
                    className={`border-l-4 p-4 rounded-r-lg bg-gray-800/50 hover:bg-gray-800 transition-colors ${getPriorityColor(task.priority)}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-lg text-white">{task.task_name}</div>
                      <span className="text-xs uppercase tracking-wider font-bold opacity-70 border border-current px-1.5 rounded">
                        {task.priority}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-gray-400">
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
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* All Tasks Section */}
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
                <div
                  key={task.id}
                  className={`border-l-4 p-4 rounded-r-lg bg-gray-800/50 hover:bg-gray-800 transition-colors ${getPriorityColor(task.priority)}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-lg text-white">{task.task_name}</div>
                    <span className="text-xs uppercase tracking-wider font-bold opacity-70 border border-current px-1.5 rounded">
                      {task.priority}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-gray-400">
                    <div className="flex items-center">
                      <span className="mr-2">📅</span> 
                      {task.due_date}
                    </div>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

