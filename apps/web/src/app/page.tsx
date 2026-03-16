'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import Link from 'next/link';

interface OverviewStats {
  totalMembers: number;
  activeMembers: number;
  frozenMembers: number;
  totalLeads: number;
  atRiskMembers: number;
  monthlyConversionRate: number;
  revenueAtRisk: number;
  saveRate: number;
  quickStats: {
    newLeadsToday: number;
    messagesSentToday: number;
    savesThisWeek: number;
  };
  memberBreakdown: Record<string, number>;
  leadsByStage: Record<string, number>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    metadata: any;
  }>;
  lastUpdated: string;
}

interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  dueDate: string | null;
  member?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  lead?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

interface TasksData {
  tasks: {
    urgent: StaffTask[];
    high: StaffTask[];
    medium: StaffTask[];
    low: StaffTask[];
    overdue: StaffTask[];
  };
  counts: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
    overdue: number;
    total: number;
  };
}

export default function Home() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [tasksData, setTasksData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // In a real app, this would come from context/auth
  const gymId = '6169f878-8493-4cd9-974f-a554863a6f7f'; // Energie Fitness Hoddesdon

  useEffect(() => {
    fetchData();
    // Refresh stats every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsResponse, tasksResponse] = await Promise.all([
        fetch(`http://localhost:3001/stats/overview?gymId=${gymId}`),
        fetch(`http://localhost:3001/tasks/today?gymId=${gymId}`)
      ]);

      if (!statsResponse.ok) {
        throw new Error(`HTTP ${statsResponse.status}: ${statsResponse.statusText}`);
      }

      const statsData = await statsResponse.json();
      setStats(statsData);

      // Tasks API might not exist yet, so handle gracefully
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        setTasksData(tasksData.data);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (taskId: string, resolution: string) => {
    try {
      const response = await fetch(`http://localhost:3001/tasks/${taskId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });

      if (response.ok) {
        // Refresh tasks
        fetchData();
      }
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getTrendIcon = (value: number, isGood: boolean = true) => {
    if (value === 0) return '➖';
    const trending = value > 0;
    if (isGood) {
      return trending ? '📈' : '📉';
    } else {
      return trending ? '📉' : '📈';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-gray-400 text-4xl mb-4">📊</div>
            <p className="text-gray-600">No data available</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">GymIQ Dashboard</h1>
              <p className="text-sm lg:text-base text-gray-600 mt-1 lg:mt-2">
                AI-powered gym management for Energie Fitness Hoddesdon
              </p>
              <p className="text-xs lg:text-sm text-gray-500 mt-1">
                Last updated: {new Date(stats.lastUpdated).toLocaleString()}
              </p>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full lg:w-auto"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
          {/* Total Members */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Members</p>
                <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1 lg:mt-2">{stats.totalMembers}</p>
              </div>
              <div className="h-10 w-10 lg:h-12 lg:w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-xl lg:text-2xl">👥</span>
              </div>
            </div>
            <div className="mt-3 lg:mt-4 flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
              <span className="text-xs lg:text-sm text-gray-500">Active: {stats.activeMembers}</span>
              <span className="hidden sm:inline text-gray-300">•</span>
              <span className="text-xs lg:text-sm text-gray-500">Frozen: {stats.frozenMembers}</span>
            </div>
          </div>

          {/* Active Leads */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Leads</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalLeads}</p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🎯</span>
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-2">
              <span className="text-lg">{getTrendIcon(stats.quickStats.newLeadsToday)}</span>
              <span className="text-sm text-gray-500">{stats.quickStats.newLeadsToday} new today</span>
            </div>
          </div>

          {/* At-Risk Members */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">At-Risk Members</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{stats.atRiskMembers}</p>
              </div>
              <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-sm text-gray-500">
                Revenue at risk: {formatCurrency(stats.revenueAtRisk)}
              </span>
            </div>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{stats.monthlyConversionRate}%</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📈</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-sm text-gray-500">Save Rate: {stats.saveRate}%</span>
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.quickStats.newLeadsToday}</div>
              <div className="text-sm text-gray-600">New Leads Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.quickStats.messagesSentToday}</div>
              <div className="text-sm text-gray-600">Messages Sent Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.quickStats.savesThisWeek}</div>
              <div className="text-sm text-gray-600">Saves This Week</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Staff Action Queue Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Tasks Today</h2>
              <Link
                href="/retention"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                View All Tasks →
              </Link>
            </div>

            <div className="space-y-3">
              {tasksData ? (
                <>
                  {/* Show overdue tasks first */}
                  {tasksData.tasks.overdue.slice(0, 2).map((task) => (
                    <TaskQuickCard key={task.id} task={task} onComplete={completeTask} priority="overdue" />
                  ))}

                  {/* Show urgent tasks */}
                  {tasksData.tasks.urgent.slice(0, 3).map((task) => (
                    <TaskQuickCard key={task.id} task={task} onComplete={completeTask} priority="urgent" />
                  ))}

                  {/* Show high priority tasks if we have space */}
                  {(tasksData.tasks.overdue.length + tasksData.tasks.urgent.length < 5) &&
                    tasksData.tasks.high.slice(0, 5 - tasksData.tasks.overdue.length - tasksData.tasks.urgent.length).map((task) => (
                      <TaskQuickCard key={task.id} task={task} onComplete={completeTask} priority="high" />
                    ))}

                  {tasksData.counts.total === 0 && (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-3xl mb-2">✅</div>
                      <p className="text-gray-500">No pending tasks</p>
                    </div>
                  )}

                  {tasksData.counts.total > 5 && (
                    <div className="text-center py-3 border-t border-gray-100 mt-4">
                      <Link
                        href="/retention"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        +{tasksData.counts.total - 5} more tasks
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-16"></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
              <span className="text-sm text-gray-500">Last 10 events</span>
            </div>

            <div className="space-y-4">
              {stats.recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-3xl mb-2">📭</div>
                  <p className="text-gray-500">No recent activity</p>
                </div>
              ) : (
                stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-sm">
                          {activity.type === 'lead_activity' ? '🎯' : '🛡️'}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                      <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-6">
            {/* Navigation Cards */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Quick Access</h2>

              <div className="grid grid-cols-1 gap-4">
                <Link
                  href="/leads"
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🎯</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Lead Pipeline</div>
                      <div className="text-sm text-gray-500">{stats.totalLeads} active leads</div>
                    </div>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600">
                    <span className="text-lg">→</span>
                  </div>
                </Link>

                <Link
                  href="/retention"
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">💪</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Retention Dashboard</div>
                      <div className="text-sm text-gray-500">{stats.atRiskMembers} at-risk members</div>
                    </div>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600">
                    <span className="text-lg">→</span>
                  </div>
                </Link>

                <Link
                  href="/conversations"
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">💬</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Conversations</div>
                      <div className="text-sm text-gray-500">{stats.quickStats.messagesSentToday} messages today</div>
                    </div>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600">
                    <span className="text-lg">→</span>
                  </div>
                </Link>

                <Link
                  href="/cancel-save"
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🛡️</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Cancel-Save Engine</div>
                      <div className="text-sm text-gray-500">{stats.saveRate}% save rate</div>
                    </div>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600">
                    <span className="text-lg">→</span>
                  </div>
                </Link>

                <Link
                  href="/settings"
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">⚙️</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Settings</div>
                      <div className="text-sm text-gray-500">Configure gym settings</div>
                    </div>
                  </div>
                  <div className="text-gray-400 group-hover:text-gray-600">
                    <span className="text-lg">→</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Task Quick Card Component for Dashboard Widget
function TaskQuickCard({
  task,
  onComplete,
  priority,
}: {
  task: StaffTask;
  onComplete: (taskId: string, resolution: string) => void;
  priority: string;
}) {
  const priorityColors = {
    overdue: 'border-l-red-500 bg-red-50',
    urgent: 'border-l-red-400 bg-red-50',
    high: 'border-l-amber-400 bg-amber-50',
    medium: 'border-l-blue-400 bg-blue-50',
    low: 'border-l-gray-400 bg-gray-50',
  };

  const priorityIcons = {
    overdue: '🚨',
    urgent: '🔴',
    high: '🟡',
    medium: '🔵',
    low: '⚪',
  };

  return (
    <div className={`border-l-4 rounded-lg p-3 ${priorityColors[priority as keyof typeof priorityColors]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-sm">{priorityIcons[priority as keyof typeof priorityIcons]}</span>
            <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
          </div>
          {task.member && (
            <p className="text-xs text-gray-600">Member: {task.member.name}</p>
          )}
          {task.lead && (
            <p className="text-xs text-gray-600">Lead: {task.lead.name}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs px-2 py-1 rounded ${
              task.category === 'cancellation' ? 'bg-red-100 text-red-700' :
              task.category === 'retention' ? 'bg-amber-100 text-amber-700' :
              task.category === 'lead_followup' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {task.category.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(task.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex space-x-2 mt-3">
        <button
          onClick={() => onComplete(task.id, 'Completed from dashboard')}
          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
        >
          Complete
        </button>
        <Link
          href="/retention"
          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}
