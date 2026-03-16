'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lastVisit: string | null;
  riskScore: number;
  membershipTier: string | null;
  lifetimeValue: number;
  status: string;
  joinDate: string | null;
}

interface MemberFullProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  membershipTier: string | null;
  joinDate: string | null;
  lastVisit: string | null;
  riskScore: number;
  riskBand: string;
  riskFactors: any[];
  daysSinceLastVisit: number | null;
  interventionCategory: string;
  visitHistorySummary: {
    totalVisits: number;
    last30Days: number;
    last60Days: number;
    last90Days: number;
    trend: string;
  };
  lifetimeValue: number;
  paymentStatus: string;
  overdueAmount: number;
  communicationHistory: Array<{
    date: string;
    type: string;
    channel: string;
    direction: string;
    content: string;
    status: string;
  }>;
  retentionActions: Array<{
    date: string;
    action: string;
    outcome: string;
    notes: string | null;
  }>;
  staffTasks: StaffTask[];
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
  resolution: string | null;
  resolutionNotes: string | null;
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

const INTERVENTION_CATEGORIES = {
  light: { label: 'Light Sleepers', color: 'blue', badge: null, days: '14-21 days' },
  deep: { label: 'Deep Sleepers', color: 'amber', badge: 'PRIORITY', days: '21-45 days' },
  critical: { label: 'Critical', color: 'red', badge: 'MANUAL ONLY', days: '45-60 days' },
  doNotContact: { label: 'Do Not Contact', color: 'gray', badge: 'NO ACTION', days: '60+ days' },
};

const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

const PRIORITY_ICONS = {
  urgent: '🔴',
  high: '🟡',
  medium: '🔵',
  low: '⚪',
};

export default function RetentionPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [tasksData, setTasksData] = useState<TasksData | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberFullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('riskScore');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showCompleteTaskDialog, setShowCompleteTaskDialog] = useState<string | null>(null);
  const [taskResolution, setTaskResolution] = useState('');
  const [taskNotes, setTaskNotes] = useState('');

  // In a real app, this would come from context/auth
  const gymId = '6169f878-8493-4cd9-974f-a554863a6f7f';

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersResponse, tasksResponse] = await Promise.all([
        fetch(`http://localhost:3001/members?gymId=${gymId}&status=active&riskMin=30&perPage=100`),
        fetch(`http://localhost:3001/tasks/today?gymId=${gymId}`)
      ]);

      if (!membersResponse.ok) throw new Error('Failed to fetch members');
      if (!tasksResponse.ok) throw new Error('Failed to fetch tasks');

      const membersData = await membersResponse.json();
      const tasksData = await tasksResponse.json();

      setMembers(membersData.data || []);
      setTasksData(tasksData.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberProfile = async (memberId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/members/${memberId}/full-profile`);
      if (!response.ok) throw new Error('Failed to fetch member profile');
      const data = await response.json();
      setSelectedMember(data.data);
    } catch (err) {
      console.error('Error fetching member profile:', err);
    }
  };

  const completeTask = async (taskId: string) => {
    if (!taskResolution.trim()) return;

    try {
      const response = await fetch(`http://localhost:3001/tasks/${taskId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: taskResolution,
          resolutionNotes: taskNotes || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to complete task');

      // Refresh tasks
      fetchData();
      setShowCompleteTaskDialog(null);
      setTaskResolution('');
      setTaskNotes('');
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const dismissTask = async (taskId: string, reason: string) => {
    try {
      const response = await fetch(`http://localhost:3001/tasks/${taskId}/dismiss`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) throw new Error('Failed to dismiss task');

      // Refresh tasks
      fetchData();
    } catch (err) {
      console.error('Error dismissing task:', err);
    }
  };

  const createTask = async (memberId: string, title: string, category: string, priority: string) => {
    try {
      const response = await fetch(`http://localhost:3001/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymId,
          title,
          category,
          priority,
          memberId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      // Refresh tasks
      fetchData();
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const formatLastVisit = (lastVisit: string | null) => {
    if (!lastVisit) return 'Never';
    const date = new Date(lastVisit);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  const getRiskColor = (riskScore: number) => {
    if (riskScore < 30) return 'text-green-600 bg-green-50';
    if (riskScore < 60) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getInterventionCategory = (lastVisit: string | null) => {
    if (!lastVisit) return 'critical';
    const daysSince = Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 60) return 'doNotContact';
    if (daysSince >= 45) return 'critical';
    if (daysSince >= 21) return 'deep';
    if (daysSince >= 14) return 'light';
    return 'active';
  };

  const getCategorizedMembers = () => {
    const categorized = {
      light: [] as Member[],
      deep: [] as Member[],
      critical: [] as Member[],
      doNotContact: [] as Member[],
    };

    members.forEach(member => {
      const category = getInterventionCategory(member.lastVisit);
      if (category in categorized) {
        categorized[category as keyof typeof categorized].push(member);
      }
    });

    return categorized;
  };

  const getSortedAndFilteredMembers = () => {
    let filtered = members;

    if (filterCategory !== 'all') {
      filtered = members.filter(member => getInterventionCategory(member.lastVisit) === filterCategory);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'riskScore':
          return b.riskScore - a.riskScore;
        case 'daysSinceVisit':
          const daysA = a.lastVisit ? Math.floor((Date.now() - new Date(a.lastVisit).getTime()) / (1000 * 60 * 60 * 24)) : 9999;
          const daysB = b.lastVisit ? Math.floor((Date.now() - new Date(b.lastVisit).getTime()) / (1000 * 60 * 60 * 24)) : 9999;
          return daysB - daysA;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading retention data...</p>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
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

  const categorizedMembers = getCategorizedMembers();
  const sortedMembers = getSortedAndFilteredMembers();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Retention Dashboard</h1>
          <p className="text-gray-600 mt-2">Monitor at-risk members and manage interventions</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="xl:col-span-2 space-y-6">
            {/* A. Intervention Windows Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(categorizedMembers).map(([category, membersList]) => {
                const config = INTERVENTION_CATEGORIES[category as keyof typeof INTERVENTION_CATEGORIES];
                return (
                  <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        config.color === 'blue' ? 'bg-blue-100' :
                        config.color === 'amber' ? 'bg-amber-100' :
                        config.color === 'red' ? 'bg-red-100' : 'bg-gray-100'
                      }`}>
                        <span className="text-sm font-semibold">
                          {config.color === 'blue' ? '💤' :
                           config.color === 'amber' ? '😴' :
                           config.color === 'red' ? '🚨' : '🚫'}
                        </span>
                      </div>
                      {config.badge && (
                        <span className={`px-2 py-1 text-xs font-bold rounded ${
                          config.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                          config.color === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {config.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">{config.label}</h3>
                    <p className="text-xs text-gray-500 mb-2">{config.days}</p>
                    <p className="text-2xl font-bold text-gray-900">{membersList.length}</p>
                  </div>
                );
              })}
            </div>

            {/* B. Member List (DEFAULT VISIBLE) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-gray-900">At-Risk Members</h2>
                  <div className="flex items-center space-x-4">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">All Categories</option>
                      <option value="light">Light Sleepers</option>
                      <option value="deep">Deep Sleepers</option>
                      <option value="critical">Critical</option>
                      <option value="doNotContact">Do Not Contact</option>
                    </select>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="riskScore">Risk Score</option>
                      <option value="daysSinceVisit">Days Since Visit</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {sortedMembers.map((member) => {
                  const category = getInterventionCategory(member.lastVisit);
                  const categoryConfig = INTERVENTION_CATEGORIES[category as keyof typeof INTERVENTION_CATEGORIES];
                  const daysSince = member.lastVisit ?
                    Math.floor((Date.now() - new Date(member.lastVisit).getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <div
                      key={member.id}
                      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => fetchMemberProfile(member.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{member.name}</h3>
                              <div className="flex items-center space-x-4 mt-1">
                                {member.phone && (
                                  <a
                                    href={`tel:${member.phone}`}
                                    className="text-sm text-blue-600 hover:text-blue-800"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {member.phone}
                                  </a>
                                )}
                                {member.email && (
                                  <a
                                    href={`mailto:${member.email}`}
                                    className="text-sm text-blue-600 hover:text-blue-800"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {member.email}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-6">
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Last Visit</div>
                            <div className="font-medium">{formatLastVisit(member.lastVisit)}</div>
                            {daysSince && (
                              <div className="text-xs text-gray-400">{daysSince} days</div>
                            )}
                          </div>

                          <div className="text-center">
                            <div className="text-sm text-gray-500">Risk</div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getRiskColor(member.riskScore)}`}>
                              {member.riskScore}
                            </span>
                          </div>

                          <div className="text-center">
                            <div className="text-sm text-gray-500">Tier</div>
                            <div className="font-medium">{member.membershipTier || 'Standard'}</div>
                          </div>

                          <div className="text-center">
                            <div className="text-sm text-gray-500">Category</div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              categoryConfig?.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                              categoryConfig?.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                              categoryConfig?.color === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {categoryConfig?.label || 'Active'}
                            </span>
                          </div>

                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                createTask(member.id, `Follow up with ${member.name}`, 'retention', 'medium');
                              }}
                              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Send Check-in
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                createTask(member.id, `Call ${member.name} - retention risk`, 'manual_call', 'high');
                              }}
                              className="px-3 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                            >
                              Create Task
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* D. Staff Action Queue Section */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 sticky top-6">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Staff Action Queue</h2>
                <p className="text-sm text-gray-600 mt-1">Today's Tasks</p>
                {tasksData && (
                  <div className="flex items-center space-x-4 mt-3">
                    <span className="text-sm text-gray-500">Total: {tasksData.counts.total}</span>
                    {tasksData.counts.overdue > 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                        {tasksData.counts.overdue} overdue
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {tasksData ? (
                  <div className="p-4 space-y-4">
                    {/* Overdue tasks first */}
                    {tasksData.tasks.overdue.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-red-600 mb-2">🔴 OVERDUE</h3>
                        {tasksData.tasks.overdue.map(task => (
                          <TaskCard key={task.id} task={task} onComplete={completeTask} onDismiss={dismissTask} />
                        ))}
                      </div>
                    )}

                    {/* Priority groups */}
                    {(['urgent', 'high', 'medium', 'low'] as const).map(priority => {
                      const tasks = tasksData.tasks[priority];
                      if (tasks.length === 0) return null;

                      return (
                        <div key={priority}>
                          <h3 className={`text-sm font-medium mb-2 ${
                            priority === 'urgent' ? 'text-red-600' :
                            priority === 'high' ? 'text-amber-600' :
                            priority === 'medium' ? 'text-blue-600' : 'text-gray-600'
                          }`}>
                            {PRIORITY_ICONS[priority]} {priority.toUpperCase()}
                          </h3>
                          {tasks.map(task => (
                            <TaskCard key={task.id} task={task} onComplete={completeTask} onDismiss={dismissTask} />
                          ))}
                        </div>
                      );
                    })}

                    {tasksData.counts.total === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <div className="text-2xl mb-2">✅</div>
                        <div className="text-sm">No pending tasks</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="animate-pulse space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-gray-100 rounded h-16"></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* C. Member Profile Slide-out Panel */}
        {selectedMember && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setSelectedMember(null)}></div>
            <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-gray-900">{selectedMember.name}</h2>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Profile Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Contact</h3>
                      <div className="mt-1 space-y-1">
                        {selectedMember.email && (
                          <a href={`mailto:${selectedMember.email}`} className="block text-sm text-blue-600 hover:text-blue-800">
                            {selectedMember.email}
                          </a>
                        )}
                        {selectedMember.phone && (
                          <a href={`tel:${selectedMember.phone}`} className="block text-sm text-blue-600 hover:text-blue-800">
                            {selectedMember.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Membership</h3>
                      <div className="mt-1 space-y-1">
                        <div className="text-sm">{selectedMember.membershipTier || 'Standard'}</div>
                        <div className="text-sm text-gray-600">
                          Joined: {selectedMember.joinDate ? new Date(selectedMember.joinDate).toLocaleDateString() : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk Assessment */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Risk Assessment</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className={`text-2xl font-bold ${getRiskColor(selectedMember.riskScore).split(' ')[0]}`}>
                        {selectedMember.riskScore}
                      </div>
                      <div className="text-sm text-gray-500">Risk Score</div>
                    </div>
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {selectedMember.daysSinceLastVisit || 0}
                      </div>
                      <div className="text-sm text-gray-500">Days Since Visit</div>
                    </div>
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedMember.visitHistorySummary.last30Days}
                      </div>
                      <div className="text-sm text-gray-500">Visits (30d)</div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => createTask(selectedMember.id, `Send WhatsApp check-in to ${selectedMember.name}`, 'retention', 'medium')}
                      className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      Send WhatsApp
                    </button>
                    <button
                      onClick={() => createTask(selectedMember.id, `Send email to ${selectedMember.name}`, 'retention', 'medium')}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      Send Email
                    </button>
                    <button
                      onClick={() => createTask(selectedMember.id, `Call ${selectedMember.name} - manual intervention`, 'manual_call', 'high')}
                      className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
                    >
                      Create Staff Task
                    </button>
                    <button
                      onClick={() => createTask(selectedMember.id, `Log phone call with ${selectedMember.name}`, 'general', 'low')}
                      className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
                    >
                      Log Phone Call
                    </button>
                  </div>
                </div>

                {/* Communication History */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Communication History</h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {selectedMember.communicationHistory.slice(0, 10).map((comm, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium capitalize">{comm.type} ({comm.channel})</span>
                          <span className="text-xs text-gray-500">
                            {new Date(comm.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">{comm.content}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-xs px-2 py-1 rounded ${
                            comm.direction === 'inbound' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {comm.direction}
                          </span>
                          <span className="text-xs text-gray-500">{comm.status}</span>
                        </div>
                      </div>
                    ))}
                    {selectedMember.communicationHistory.length === 0 && (
                      <div className="text-center py-4 text-gray-500">No communication history</div>
                    )}
                  </div>
                </div>

                {/* Staff Tasks */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Related Staff Tasks</h3>
                  <div className="space-y-3">
                    {selectedMember.staffTasks.slice(0, 5).map((task) => (
                      <div key={task.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{task.title}</span>
                          <span className={`text-xs px-2 py-1 rounded ${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}`}>
                            {task.priority}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">{task.description}</div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs px-2 py-1 rounded ${
                            task.status === 'completed' ? 'bg-green-100 text-green-700' :
                            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {task.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(task.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {task.resolution && (
                          <div className="mt-2 text-sm text-gray-600 bg-white rounded p-2">
                            Resolution: {task.resolution}
                          </div>
                        )}
                      </div>
                    ))}
                    {selectedMember.staffTasks.length === 0 && (
                      <div className="text-center py-4 text-gray-500">No staff tasks</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Complete Task Dialog */}
        {showCompleteTaskDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Complete Task</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">What action was taken?</label>
                  <input
                    type="text"
                    value={taskResolution}
                    onChange={(e) => setTaskResolution(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Called member, sent email, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes (optional)</label>
                  <textarea
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Any additional details..."
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => completeTask(showCompleteTaskDialog)}
                    disabled={!taskResolution.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Complete Task
                  </button>
                  <button
                    onClick={() => {
                      setShowCompleteTaskDialog(null);
                      setTaskResolution('');
                      setTaskNotes('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Task Card Component
function TaskCard({
  task,
  onComplete,
  onDismiss
}: {
  task: StaffTask;
  onComplete: (taskId: string) => void;
  onDismiss: (taskId: string, reason: string) => void;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 mb-2">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
          {task.description && (
            <p className="text-sm text-gray-600 mt-1">{task.description}</p>
          )}
          {task.member && (
            <p className="text-xs text-gray-500 mt-1">Member: {task.member.name}</p>
          )}
          {task.lead && (
            <p className="text-xs text-gray-500 mt-1">Lead: {task.lead.name}</p>
          )}
        </div>
        <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]
        }`}>
          {task.category}
        </span>
      </div>

      <div className="flex space-x-2">
        <button
          onClick={() => onComplete(task.id)}
          className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
        >
          Complete
        </button>
        <button
          onClick={() => onDismiss(task.id, 'Task dismissed by staff')}
          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          Dismiss
        </button>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>{new Date(task.createdAt).toLocaleString()}</span>
        {task.dueDate && (
          <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}