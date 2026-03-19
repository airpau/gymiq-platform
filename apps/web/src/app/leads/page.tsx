'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth, withAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  currentStage: string;
  score: number;
  source: string;
  sourceDetail: string | null;
  lastContactAt: string | null;
  lastContactChannel: string | null;
  contactAttempts: number;
  createdAt: string;
  assignedTo: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  metadata: any;
}

interface JourneyStep {
  id: string;
  stage: string;
  fromStage: string | null;
  channel: string | null;
  action: string;
  message: string | null;
  createdAt: string;
}

interface Booking {
  id: string;
  date: string;
  timeSlot: string;
  type: string;
  status: string;
  confirmedAt: string | null;
  attendedAt: string | null;
  notes: string | null;
}

interface LeadDetails {
  lead: Lead;
  journeySteps: JourneyStep[];
  bookings: Booking[];
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
}

interface PipelineStats {
  [key: string]: number;
}

const STAGE_ORDER = [
  'new', 'contacted', 'engaged', 'booked', 'visited', 'converting', 'converted', 'lost', 'nurturing'
];

const STAGE_COLORS: { [key: string]: string } = {
  new: 'bg-blue-100 border-blue-300 text-blue-800',
  contacted: 'bg-purple-100 border-purple-300 text-purple-800',
  engaged: 'bg-amber-100 border-amber-300 text-amber-800',
  booked: 'bg-green-100 border-green-300 text-green-800',
  visited: 'bg-cyan-100 border-cyan-300 text-cyan-800',
  converting: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  converted: 'bg-emerald-100 border-emerald-300 text-emerald-800',
  lost: 'bg-red-100 border-red-300 text-red-800',
  nurturing: 'bg-gray-100 border-gray-300 text-gray-800',
};

const SOURCE_ICONS: { [key: string]: string } = {
  web_form: '🌐',
  abandoned_cart: '🛒',
  referral: '👥',
  walk_in: '🚶',
  call: '📞',
  social_media: '📱',
  email: '📧',
  other: '❓',
};

function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<PipelineStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadDetails | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  const { gym } = useAuth();
  const gymId = gym?.id;

  useEffect(() => {
    if (!gymId) return; // Wait for auth to load
    fetchPipelineData();
  }, [sourceFilter, dateRange, gymId]);

  const fetchPipelineData = async () => {
    if (!gymId) return; // Guard against missing gymId

    try {
      setLoading(true);
      // Fetch from real API endpoint
      const response = await fetch(`${API_URL}/leads?gymId=${gymId}&source=${sourceFilter}&dateRange=${dateRange}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLeads(data.data.leads || []);
          setStats(data.data.stats || {});
        } else {
          // Fallback to mock data if API fails
          await fetchMockData();
        }
      } else {
        // Fallback to mock data if API fails
        await fetchMockData();
      }

      setError(null);
    } catch (err) {
      console.warn('API unavailable, using mock data:', err);
      await fetchMockData();
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMockData = async () => {
    // Enhanced mock data with more realistic lead journey
    const mockLeads: Lead[] = [
      {
        id: '1',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        phone: '+44 7700 900123',
        currentStage: 'new',
        score: 85,
        source: 'web_form',
        sourceDetail: 'Website contact form',
        lastContactAt: null,
        lastContactChannel: null,
        contactAttempts: 0,
        createdAt: new Date().toISOString(),
        assignedTo: 'John Smith',
        convertedAt: null,
        lostReason: null,
        metadata: { interests: ['cardio', 'weights'], timePreference: 'morning' }
      },
      {
        id: '2',
        name: 'Mike Chen',
        email: 'mike.chen@email.com',
        phone: '+44 7700 900124',
        currentStage: 'contacted',
        score: 72,
        source: 'abandoned_cart',
        sourceDetail: 'Abandoned membership signup',
        lastContactAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        lastContactChannel: 'whatsapp',
        contactAttempts: 1,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'Emma Davis',
        convertedAt: null,
        lostReason: null,
        metadata: { interests: ['recovery'], budget: '£40/month' }
      },
      {
        id: '3',
        name: 'Lisa Park',
        email: 'lisa.park@email.com',
        phone: '+44 7700 900125',
        currentStage: 'engaged',
        score: 90,
        source: 'referral',
        sourceDetail: 'Referred by John Doe',
        lastContactAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        lastContactChannel: 'whatsapp',
        contactAttempts: 2,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'John Smith',
        convertedAt: null,
        lostReason: null,
        metadata: { interests: ['classes', 'personal-training'], schedule: 'evenings' }
      },
      {
        id: '4',
        name: 'James Wilson',
        email: 'james.w@email.com',
        phone: '+44 7700 900126',
        currentStage: 'booked',
        score: 88,
        source: 'walk_in',
        sourceDetail: 'Walk-in enquiry',
        lastContactAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        lastContactChannel: 'call',
        contactAttempts: 1,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'Emma Davis',
        convertedAt: null,
        lostReason: null,
        metadata: { interests: ['recovery-zone'], visitDate: '2026-03-15' }
      },
    ];

    const mockStats: PipelineStats = {
      new: 8,
      contacted: 12,
      engaged: 15,
      booked: 6,
      visited: 4,
      converting: 3,
      converted: 28,
      lost: 7,
      nurturing: 5,
    };

    setLeads(mockLeads);
    setStats(mockStats);
  };

  const fetchLeadDetails = async (leadId: string) => {
    try {
      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      // Mock detailed data for now - in real app would fetch from API
      const mockDetails: LeadDetails = {
        lead,
        journeySteps: [
          {
            id: '1',
            stage: 'new',
            fromStage: null,
            channel: null,
            action: 'lead_created',
            message: 'Lead created from web form',
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: '2',
            stage: 'contacted',
            fromStage: 'new',
            channel: 'whatsapp',
            action: 'outreach',
            message: 'Hi! Thanks for your interest in Energie Fitness. I\'d love to show you our Recovery Zone!',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: '3',
            stage: 'engaged',
            fromStage: 'contacted',
            channel: 'whatsapp',
            action: 'response',
            message: 'That sounds great! When can I come for a tour?',
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        bookings: leadId === '4' ? [
          {
            id: '1',
            date: '2026-03-15',
            timeSlot: '10:00-11:00',
            type: 'tour',
            status: 'scheduled',
            confirmedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            attendedAt: null,
            notes: 'Interested in Recovery Zone and classes',
          }
        ] : [],
        staffTasks: [
          {
            id: '1',
            title: `Follow up with ${lead.name}`,
            description: 'Send booking reminder',
            category: 'lead_followup',
            priority: 'medium',
            status: 'pending',
            assignedTo: lead.assignedTo,
            createdBy: 'system',
            createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            resolution: null,
            resolutionNotes: null,
          }
        ]
      };

      setSelectedLead(mockDetails);
    } catch (err) {
      console.error('Error fetching lead details:', err);
    }
  };

  const handleLeadClick = async (leadId: string) => {
    await fetchLeadDetails(leadId);
  };

  const createTask = async (leadId: string, title: string, category: string, priority: string) => {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymId,
          title,
          category,
          priority,
          leadId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      // Refresh lead details if panel is open
      if (selectedLead) {
        await fetchLeadDetails(selectedLead.lead.id);
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const formatLastContact = (lastContactAt: string | null, channel: string | null) => {
    if (!lastContactAt) return 'Never';

    const date = new Date(lastContactAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let timeStr;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLeadsByStage = (stage: string) => {
    return leads.filter(lead => lead.currentStage === stage);
  };

  const getTotalLeads = () => {
    return Object.values(stats).reduce((sum, count) => sum + count, 0);
  };

  const getConversionRate = () => {
    const total = getTotalLeads();
    const converted = stats.converted || 0;
    return total > 0 ? Math.round((converted / total) * 100) : 0;
  };

  const getUniqueLeadSources = () => {
    const sources = new Set(leads.map(lead => lead.source));
    return Array.from(sources);
  };

  const getAvgDaysToConvert = () => {
    // Mock calculation - in real app would be from API
    return 14;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading pipeline...</p>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Pipeline Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchPipelineData}
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
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Lead Pipeline</h1>
              <p className="text-gray-600 mt-2">Manage and track leads through the conversion funnel</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span>➕</span>
              <span>Add Lead</span>
            </button>
          </div>
        </div>

        {/* Enhanced Stats Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{getTotalLeads()}</div>
              <div className="text-sm text-gray-600">Total Leads</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.converted || 0}</div>
              <div className="text-sm text-gray-600">Converted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{getConversionRate()}%</div>
              <div className="text-sm text-gray-600">Conversion Rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{getAvgDaysToConvert()}</div>
              <div className="text-sm text-gray-600">Avg Days to Convert</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-8">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Source:</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Sources</option>
                {getUniqueLeadSources().map(source => (
                  <option key={source} value={source}>
                    {source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Date Range:</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
              </select>
            </div>

            <button
              onClick={fetchPipelineData}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Enhanced Kanban Board */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900">Pipeline Stages</h2>
              <div className="text-sm text-gray-500">
                {leads.length} leads • Click cards to expand details
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex space-x-6 overflow-x-auto pb-4" style={{ minWidth: 'max-content' }}>
              {STAGE_ORDER.map((stage) => {
                const stageLeads = getLeadsByStage(stage);
                const stageCount = stats[stage] || 0;

                return (
                  <div key={stage} className="flex-shrink-0 w-80">
                    <div className="bg-gray-50 rounded-lg border border-gray-200">
                      {/* Enhanced Stage Header */}
                      <div className="p-4 border-b border-gray-200 bg-white rounded-t-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-900 capitalize">
                            {stage.replace('_', ' ')}
                          </h3>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STAGE_COLORS[stage]}`}>
                            {stageCount}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {stage === 'new' && 'Fresh leads awaiting contact'}
                          {stage === 'contacted' && 'Initial outreach sent'}
                          {stage === 'engaged' && 'Active conversations'}
                          {stage === 'booked' && 'Tours scheduled'}
                          {stage === 'visited' && 'Completed visits'}
                          {stage === 'converting' && 'Ready to join'}
                          {stage === 'converted' && 'New members!'}
                          {stage === 'lost' && 'Not interested'}
                          {stage === 'nurturing' && 'Long-term follow-up'}
                        </p>
                      </div>

                      {/* Lead Cards */}
                      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                        {stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            onClick={() => handleLeadClick(lead.id)}
                            className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h4 className="text-sm font-semibold text-gray-900 truncate">
                                    {lead.name || 'Unnamed Lead'}
                                  </h4>
                                  <span className="text-lg">
                                    {SOURCE_ICONS[lead.source] || SOURCE_ICONS.other}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate mb-1">
                                  {lead.email || lead.phone || 'No contact info'}
                                </p>
                                {lead.assignedTo && (
                                  <p className="text-xs text-gray-400">
                                    👤 {lead.assignedTo}
                                  </p>
                                )}
                              </div>
                              <div className="text-right ml-3">
                                <div className="text-sm font-bold text-gray-900">
                                  {lead.score}
                                </div>
                                <div className="text-xs text-gray-500">
                                  score
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <div>
                                Last: {formatLastContact(lead.lastContactAt, lead.lastContactChannel)}
                              </div>
                              <div>
                                {lead.contactAttempts} attempts
                              </div>
                            </div>
                          </div>
                        ))}

                        {stageCount === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <div className="text-3xl mb-2">📭</div>
                            <div className="text-sm">No leads in this stage</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Lead Profile Slide-out Panel */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setSelectedLead(null)}></div>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    {selectedLead.lead.name || 'Unnamed Lead'}
                  </h2>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${STAGE_COLORS[selectedLead.lead.currentStage]}`}>
                      {selectedLead.lead.currentStage.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-500">
                      Score: {selectedLead.lead.score}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
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
              {/* Lead Overview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Contact</h3>
                    <div className="mt-1 space-y-1">
                      {selectedLead.lead.email && (
                        <a href={`mailto:${selectedLead.lead.email}`} className="block text-sm text-blue-600 hover:text-blue-800">
                          {selectedLead.lead.email}
                        </a>
                      )}
                      {selectedLead.lead.phone && (
                        <a href={`tel:${selectedLead.lead.phone}`} className="block text-sm text-blue-600 hover:text-blue-800">
                          {selectedLead.lead.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Lead Info</h3>
                    <div className="mt-1 space-y-1">
                      <div className="text-sm">
                        Source: {selectedLead.lead.source.replace('_', ' ')}
                        <span className="ml-1">{SOURCE_ICONS[selectedLead.lead.source]}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Created: {new Date(selectedLead.lead.createdAt).toLocaleDateString()}
                      </div>
                      {selectedLead.lead.assignedTo && (
                        <div className="text-sm text-gray-600">
                          Assigned: {selectedLead.lead.assignedTo}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => createTask(selectedLead.lead.id, `Send WhatsApp message to ${selectedLead.lead.name}`, 'lead_followup', 'medium')}
                    className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                  >
                    Send Message
                  </button>
                  <button
                    onClick={() => createTask(selectedLead.lead.id, `Create follow-up task for ${selectedLead.lead.name}`, 'lead_followup', 'medium')}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Create Task
                  </button>
                  <button
                    onClick={() => createTask(selectedLead.lead.id, `Advance ${selectedLead.lead.name} to next stage`, 'lead_followup', 'high')}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                  >
                    Advance Stage
                  </button>
                  <button
                    onClick={() => createTask(selectedLead.lead.id, `Book gym visit for ${selectedLead.lead.name}`, 'lead_followup', 'high')}
                    className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
                  >
                    Book Visit
                  </button>
                </div>
              </div>

              {/* Journey Timeline */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Journey Timeline</h3>
                <div className="space-y-4">
                  {selectedLead.journeySteps.map((step, index) => (
                    <div key={step.id} className="flex items-start space-x-3">
                      <div className={`flex-shrink-0 w-3 h-3 rounded-full mt-2 ${
                        index === 0 ? 'bg-green-500' : 'bg-blue-500'
                      }`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-white border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-900">
                              {step.action.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </h4>
                            <span className="text-xs text-gray-500">
                              {formatDate(step.createdAt)}
                            </span>
                          </div>
                          {step.message && (
                            <p className="text-sm text-gray-600 mb-2">"{step.message}"</p>
                          )}
                          <div className="flex items-center space-x-3 text-xs text-gray-500">
                            {step.channel && (
                              <span className="px-2 py-1 bg-gray-100 rounded">
                                {step.channel}
                              </span>
                            )}
                            <span>→ {step.stage.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bookings */}
              {selectedLead.bookings.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Bookings</h3>
                  <div className="space-y-3">
                    {selectedLead.bookings.map((booking) => (
                      <div key={booking.id} className="bg-white border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {booking.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            booking.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                            booking.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            booking.status === 'attended' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {booking.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          📅 {new Date(booking.date).toLocaleDateString()} at {booking.timeSlot}
                        </div>
                        {booking.notes && (
                          <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                            Note: {booking.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff Tasks */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Related Staff Tasks</h3>
                <div className="space-y-3">
                  {selectedLead.staffTasks.map((task) => (
                    <div key={task.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{task.title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          task.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                          task.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.description && (
                        <div className="text-sm text-gray-600 mb-2">{task.description}</div>
                      )}
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
                  {selectedLead.staffTasks.length === 0 && (
                    <div className="text-center py-4 text-gray-500">No staff tasks for this lead</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal (placeholder) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add New Lead</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🚧</div>
              <p>Add lead form coming soon...</p>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Export with auth protection
export default withAuth(LeadsPage);