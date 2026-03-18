'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { API_URL } from '../../lib/api';

interface CancelSaveAttempt {
  id: string;
  member: {
    id: string;
    name: string;
    email: string;
    phone: string;
    membershipTier?: string;
    lifetimeValue: number;
  };
  reason?: string;
  reasonCategory?: string;
  offerMade?: string;
  offerType?: string;
  outcome: 'in_progress' | 'saved' | 'lost' | 'escalated';
  conversationLength: number;
  createdAt: string;
  savedAt?: string;
  lostAt?: string;
  conversationLog?: Array<{
    timestamp: string;
    sender: 'ai' | 'member';
    message: string;
  }>;
  staffTasks?: StaffTask[];
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
}

interface CancelSaveStats {
  totalAttempts: number;
  saveRate: number;
  outcomes: {
    saved: number;
    lost: number;
    inProgress: number;
    escalated: number;
  };
  reasonBreakdown: Record<string, number>;
  offerEffectiveness: Record<string, number>;
  avgConversationLength: number;
}

export default function CancelSavePage() {
  const [activeAttempts, setActiveAttempts] = useState<CancelSaveAttempt[]>([]);
  const [stats, setStats] = useState<CancelSaveStats | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<CancelSaveAttempt | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');

  // In a real app, this would come from context/auth
  const gymId = '6169f878-8493-4cd9-974f-a554863a6f7f'; // Energie Fitness Hoddesdon

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try fetching from real API first
      try {
        const response = await fetch(`${API_URL}/cancel-save?gymId=${gymId}&timeRange=${timeRange}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setActiveAttempts(result.data.attempts || []);
            setStats(result.data.stats || null);
            return;
          }
        }
      } catch (apiError) {
        console.warn('API unavailable, using mock data:', apiError);
      }

      // Fallback to enhanced mock data
      const mockActiveAttempts: CancelSaveAttempt[] = [
        {
          id: '1',
          member: {
            id: 'm1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: '+44 7700 900130',
            membershipTier: 'WOW',
            lifetimeValue: 1248.50
          },
          reason: 'Too expensive for me right now',
          reasonCategory: 'too_expensive',
          offerMade: 'Downgrade to Classic membership at £31.99/month',
          offerType: 'downgrade',
          outcome: 'in_progress',
          conversationLength: 4,
          createdAt: '2026-03-14T10:30:00Z',
          conversationLog: [
            { timestamp: '2026-03-14T10:30:00Z', sender: 'member', message: 'I want to cancel my membership' },
            { timestamp: '2026-03-14T10:31:00Z', sender: 'ai', message: 'I\'m sorry to hear you\'re thinking of leaving! Can I ask what\'s prompting this decision?' },
            { timestamp: '2026-03-14T10:35:00Z', sender: 'member', message: 'Too expensive for me right now' },
            { timestamp: '2026-03-14T10:36:00Z', sender: 'ai', message: 'I completely understand. What if I could offer you our Classic membership at £31.99/month instead? You\'d still have access to all gym equipment and classes.' }
          ],
          staffTasks: [
            {
              id: 'st1',
              title: 'Follow up with John Smith - price sensitive',
              description: 'Member considering cancellation due to cost',
              category: 'cancellation',
              priority: 'high',
              status: 'pending',
              assignedTo: 'Sarah',
              createdBy: 'ai',
              createdAt: '2026-03-14T10:00:00Z',
              dueDate: '2026-03-14T18:00:00Z',
              resolution: null,
              resolutionNotes: null,
            }
          ]
        },
        {
          id: '2',
          member: {
            id: 'm2',
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            phone: '+44 7700 900131',
            membershipTier: 'WOW',
            lifetimeValue: 892.00
          },
          reason: "Haven't been using the Recovery Zone much",
          reasonCategory: 'not_using',
          offerMade: 'Free Recovery Zone session to experience full benefits',
          offerType: 'free_session',
          outcome: 'in_progress',
          conversationLength: 6,
          createdAt: '2026-03-14T09:15:00Z',
          conversationLog: [
            { timestamp: '2026-03-14T09:15:00Z', sender: 'member', message: 'I\'d like to cancel my membership please' },
            { timestamp: '2026-03-14T09:16:00Z', sender: 'ai', message: 'Hi Sarah! I\'m sorry to see you want to leave. What\'s been your experience with the gym?' },
            { timestamp: '2026-03-14T09:20:00Z', sender: 'member', message: "Haven't been using the Recovery Zone much" },
            { timestamp: '2026-03-14T09:21:00Z', sender: 'ai', message: 'The Recovery Zone is amazing once you get into it! How about I book you a free guided session with one of our recovery specialists?' },
            { timestamp: '2026-03-14T09:25:00Z', sender: 'member', message: 'That might be interesting...' },
            { timestamp: '2026-03-14T09:26:00Z', sender: 'ai', message: 'Great! I can schedule it for this week. This way you can experience the full benefits before making your final decision.' }
          ],
          staffTasks: []
        },
        {
          id: '3',
          member: {
            id: 'm3',
            name: 'Mike Wilson',
            email: 'mike@example.com',
            phone: '+44 7700 900132',
            membershipTier: 'Classic',
            lifetimeValue: 456.75
          },
          reason: 'Moving to another city',
          reasonCategory: 'moving',
          outcome: 'in_progress',
          conversationLength: 2,
          createdAt: '2026-03-14T08:45:00Z',
          conversationLog: [
            { timestamp: '2026-03-14T08:45:00Z', sender: 'member', message: 'I need to cancel my membership' },
            { timestamp: '2026-03-14T08:46:00Z', sender: 'ai', message: 'I understand! Can you tell me what\'s prompting this decision?' },
            { timestamp: '2026-03-14T08:50:00Z', sender: 'member', message: 'Moving to another city' }
          ],
          staffTasks: [
            {
              id: 'st2',
              title: 'URGENT: Manual intervention needed for Mike Wilson',
              description: 'Member moving cities - AI unable to provide suitable retention offer',
              category: 'cancellation',
              priority: 'urgent',
              status: 'pending',
              assignedTo: null,
              createdBy: 'ai',
              createdAt: '2026-03-14T08:55:00Z',
              dueDate: '2026-03-14T12:00:00Z',
              resolution: null,
              resolutionNotes: null,
            }
          ]
        }
      ];

      const mockStats: CancelSaveStats = {
        totalAttempts: 47,
        saveRate: 68,
        outcomes: {
          saved: 32,
          lost: 12,
          inProgress: 3,
          escalated: 0
        },
        reasonBreakdown: {
          too_expensive: 18,
          not_using: 15,
          moving: 8,
          injury: 4,
          unhappy: 2
        },
        offerEffectiveness: {
          downgrade: 15,
          freeze: 8,
          discount: 6,
          free_session: 3
        },
        avgConversationLength: 5.2
      };

      setActiveAttempts(mockActiveAttempts);
      setStats(mockStats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch cancel-save data';
      setError(errorMessage);
      console.error('Error fetching cancel-save data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async (attemptId: string) => {
    try {
      // In real app: await fetch(`/api/cancel-save/${attemptId}/escalate`, { method: 'PATCH' });
      console.log('Escalating attempt:', attemptId);

      // Update local state
      setActiveAttempts(prev =>
        prev.map(attempt =>
          attempt.id === attemptId
            ? { ...attempt, outcome: 'escalated' as const }
            : attempt
        )
      );
    } catch (error) {
      console.error('Failed to escalate attempt:', error);
    }
  };

  const createUrgentTask = async (attempt: CancelSaveAttempt) => {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymId,
          title: `URGENT: AI failed to save ${attempt.member.name} - Manual intervention required`,
          description: `Cancel-save conversation has stalled. Reason: ${attempt.reason}. Offer made: ${attempt.offerMade || 'None'}`,
          category: 'cancellation',
          priority: 'urgent',
          memberId: attempt.member.id,
          cancelSaveId: attempt.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      // Refresh data to show the new task
      fetchData();
    } catch (err) {
      console.error('Error creating urgent task:', err);
    }
  };

  const handleTakeOver = async (attemptId: string) => {
    try {
      const attempt = activeAttempts.find(a => a.id === attemptId);
      if (!attempt) return;

      // Create urgent task for staff intervention
      await createUrgentTask(attempt);

      // Mark as escalated
      setActiveAttempts(prev =>
        prev.map(a =>
          a.id === attemptId
            ? { ...a, outcome: 'escalated' as const }
            : a
        )
      );
    } catch (error) {
      console.error('Failed to take over attempt:', error);
    }
  };

  const getOutcomeColor = (outcome: string) => {
    const colors = {
      saved: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
      in_progress: 'bg-blue-100 text-blue-800',
      escalated: 'bg-yellow-100 text-yellow-800'
    };
    return colors[outcome as keyof typeof colors] || colors.in_progress;
  };

  const getOfferTypeColor = (offerType?: string) => {
    const colors = {
      downgrade: 'bg-purple-100 text-purple-800',
      freeze: 'bg-cyan-100 text-cyan-800',
      discount: 'bg-orange-100 text-orange-800',
      free_session: 'bg-pink-100 text-pink-800',
      pt_session: 'bg-indigo-100 text-indigo-800'
    };
    return colors[offerType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading cancel-save data...</p>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cancel-Save Error</h2>
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

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cancel-Save Dashboard</h1>
              <p className="text-gray-600 mt-1">AI-powered member retention conversations</p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span className="text-sm">Refresh</span>
              </button>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800 text-xs ml-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Save Rate</p>
                  <p className="text-3xl font-bold text-green-600">{stats.saveRate}%</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🛡️</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {stats.outcomes.saved} of {stats.totalAttempts} members saved
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Attempts</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.outcomes.inProgress}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Currently in progress
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Conversation</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.avgConversationLength}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Messages per attempt
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Attempts</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalAttempts}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎯</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Last {timeRange} days
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Attempts */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Active Save Attempts</h2>
              <p className="text-sm text-gray-600 mt-1">Members currently in cancel-save conversations</p>
            </div>

            <div className="divide-y divide-gray-200">
              {activeAttempts.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <div className="text-4xl mb-2">🛡️</div>
                  <p>No active cancel-save attempts</p>
                </div>
              ) : (
                activeAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className={`p-6 cursor-pointer hover:bg-gray-50 ${
                      selectedAttempt?.id === attempt.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => setSelectedAttempt(attempt)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">{attempt.member.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(attempt.outcome)}`}>
                            {attempt.outcome.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-sm text-gray-500 mt-1">
                          {attempt.member.membershipTier} • £{attempt.member.lifetimeValue.toFixed(2)} LTV
                        </p>

                        {attempt.reason && (
                          <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-2 rounded">
                            "{attempt.reason}"
                          </p>
                        )}

                        {attempt.offerMade && (
                          <div className="mt-3 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOfferTypeColor(attempt.offerType)}`}>
                              {attempt.offerType?.replace('_', ' ')}
                            </span>
                            <p className="text-sm text-gray-600">{attempt.offerMade}</p>
                          </div>
                        )}

                        {/* Staff Tasks */}
                        {attempt.staffTasks && attempt.staffTasks.length > 0 && (
                          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                            <div className="text-xs font-medium text-blue-800 mb-1">Active Staff Tasks</div>
                            {attempt.staffTasks.map(task => (
                              <div key={task.id} className="text-xs text-blue-700 flex items-center justify-between">
                                <span>{task.title}</span>
                                <span className={`px-1 rounded text-xs ${
                                  task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                  task.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {task.priority}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-gray-500">
                            {attempt.conversationLength} messages • {new Date(attempt.createdAt).toLocaleDateString()}
                          </span>

                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAttempt(attempt);
                                setShowConversation(true);
                              }}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                            >
                              View Conversation
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTakeOver(attempt.id);
                              }}
                              className="px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 transition-colors"
                            >
                              Take Over
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEscalate(attempt.id);
                              }}
                              className="px-3 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 transition-colors"
                            >
                              Escalate
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-6">
            {/* Top Cancellation Reasons */}
            {stats && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">Top Cancellation Reasons</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {Object.entries(stats.reasonBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([reason, count]) => (
                        <div key={reason} className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 capitalize">
                            {reason.replace('_', ' ')}
                          </span>
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${(count / stats.totalAttempts) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-6 text-right">
                              {count}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Offer Effectiveness */}
            {stats && Object.keys(stats.offerEffectiveness).length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">Most Effective Offers</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {Object.entries(stats.offerEffectiveness)
                      .sort(([, a], [, b]) => b - a)
                      .map(([offer, count]) => (
                        <div key={offer} className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 capitalize">
                            {offer.replace('_', ' ')}
                          </span>
                          <span className="text-sm font-medium text-green-600">
                            {count} saves
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Outcomes Breakdown */}
            {stats && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">Outcomes</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-green-600">✅ Saved</span>
                      <span className="text-sm font-medium">{stats.outcomes.saved}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-red-600">❌ Lost</span>
                      <span className="text-sm font-medium">{stats.outcomes.lost}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-600">🔄 In Progress</span>
                      <span className="text-sm font-medium">{stats.outcomes.inProgress}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-yellow-600">👤 Escalated</span>
                      <span className="text-sm font-medium">{stats.outcomes.escalated}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Attempt Details */}
        {selectedAttempt && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Cancel-Save Details: {selectedAttempt.member.name}
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Member Information</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="text-gray-500">Email:</span> {selectedAttempt.member.email}</p>
                    <p><span className="text-gray-500">Phone:</span> {selectedAttempt.member.phone}</p>
                    <p><span className="text-gray-500">Membership:</span> {selectedAttempt.member.membershipTier}</p>
                    <p><span className="text-gray-500">LTV:</span> £{selectedAttempt.member.lifetimeValue.toFixed(2)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Cancellation Details</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="text-gray-500">Reason:</span> {selectedAttempt.reasonCategory?.replace('_', ' ')}</p>
                    <p><span className="text-gray-500">Started:</span> {new Date(selectedAttempt.createdAt).toLocaleString()}</p>
                    <p><span className="text-gray-500">Messages:</span> {selectedAttempt.conversationLength}</p>
                    <p><span className="text-gray-500">Status:</span>
                      <span className={`ml-1 px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(selectedAttempt.outcome)}`}>
                        {selectedAttempt.outcome.replace('_', ' ')}
                      </span>
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">AI Offer</h4>
                  <div className="text-sm space-y-1">
                    {selectedAttempt.offerType ? (
                      <>
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getOfferTypeColor(selectedAttempt.offerType)} mb-2`}>
                          {selectedAttempt.offerType.replace('_', ' ')}
                        </span>
                        <p className="text-gray-700">{selectedAttempt.offerMade}</p>
                      </>
                    ) : (
                      <p className="text-gray-500 italic">No offer made yet</p>
                    )}
                  </div>
                </div>
              </div>

              {selectedAttempt.reason && (
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-2">Member's Reason</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    "{selectedAttempt.reason}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conversation History Modal */}
        {showConversation && selectedAttempt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Conversation History: {selectedAttempt.member.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Started: {new Date(selectedAttempt.createdAt).toLocaleString()} • {selectedAttempt.conversationLength} messages
                    </p>
                  </div>
                  <button
                    onClick={() => setShowConversation(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {selectedAttempt.conversationLog?.map((message, index) => (
                    <div key={index} className={`flex ${message.sender === 'ai' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                        message.sender === 'ai'
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-blue-600 text-white'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">
                            {message.sender === 'ai' ? '🤖 GymIQ AI' : '👤 ' + selectedAttempt.member.name}
                          </span>
                          <span className={`text-xs ${
                            message.sender === 'ai' ? 'text-gray-500' : 'text-blue-200'
                          }`}>
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{message.message}</p>
                      </div>
                    </div>
                  ))}

                  {!selectedAttempt.conversationLog || selectedAttempt.conversationLog.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-2">💬</div>
                      <p>No conversation history available</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Current Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(selectedAttempt.outcome)}`}>
                      {selectedAttempt.outcome.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleTakeOver(selectedAttempt.id)}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
                    >
                      Take Over Conversation
                    </button>
                    <button
                      onClick={() => setShowConversation(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}