'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { API_URL } from '../../lib/api';
import { useAuth, withAuth } from '../../contexts/AuthContext';

interface GymConfig {
  id: string;
  name: string;
  slug: string;
  settings: {
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    openingHours?: {
      monday?: string;
      tuesday?: string;
      wednesday?: string;
      thursday?: string;
      friday?: string;
      saturday?: string;
      sunday?: string;
    };
    aiSettings?: {
      enabled: boolean;
      quietHours?: {
        start: string;
        end: string;
      };
      maxContactAttempts: number;
      escalationEnabled: boolean;
    };
    bookingSettings?: {
      enabled: boolean;
      defaultDuration: number;
      advanceBookingDays: number;
      reminderHours: number;
      allowedTypes: string[];
    };
    messagingSettings?: {
      channels?: {
        whatsapp?: { enabled: boolean; priority: number };
        email?: { enabled: boolean; priority: number };
        sms?: { enabled: boolean; priority: number };
      };
      rateLimits?: {
        messagesPerHour: number;
        messagesPerDay: number;
      };
    };
    timezone?: string;
    currency?: string;
    language?: string;
  };
  knowledgeBase: {
    gymName?: string;
    address?: string;
    phone?: string;
    facilities?: string[];
    pricing?: Record<string, string>;
    classes?: string[];
    faqs?: Array<{ q: string; a: string }>;
    policies?: Record<string, string>;
    tone?: string;
    usp?: string;
  };
  integration: {
    whatsappNumber?: string;
    twilioSid?: string;
    crmType?: string;
    crmTier?: string;
    connectorType?: string;
    lastSyncAt?: string;
    lastSyncStatus?: string;
  };
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const BOOKING_TYPES = [
  { value: 'tour', label: 'Gym Tour' },
  { value: 'trial_class', label: 'Trial Class' },
  { value: 'consultation', label: 'Consultation' },
];

function SettingsPage() {
  const [config, setConfig] = useState<GymConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  const { gym } = useAuth();
  const gymId = gym?.id;

  useEffect(() => {
    if (!gymId) return; // Wait for auth to load
    fetchConfig();
  }, [gymId]);

  const fetchConfig = async () => {
    if (!gymId) return; // Guard against missing gymId

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/gyms/${gymId}/config`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.success) {
        setConfig(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch config');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch configuration');
      console.error('Error fetching config:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config || !gymId) return;

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/gyms/${gymId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        setSuccessMessage('Configuration saved successfully!');
        setError(null);
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        throw new Error(result.error || 'Failed to save config');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (section: keyof GymConfig, updates: any) => {
    if (!config) return;

    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...(prev![section] as Record<string, any>),
        ...updates,
      },
    }));
  };

  const updateNestedConfig = (section: keyof GymConfig, subsection: string, updates: any) => {
    if (!config) return;

    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...(prev![section] as Record<string, unknown>),
        [subsection]: {
          ...((prev![section] as any)?.[subsection] ?? {}),
          ...updates,
        },
      },
    }) as GymConfig);
  };

  const addFAQ = () => {
    if (!config) return;

    const newFaqs = [...(config.knowledgeBase.faqs || []), { q: '', a: '' }];
    updateConfig('knowledgeBase', { faqs: newFaqs });
  };

  const updateFAQ = (index: number, field: 'q' | 'a', value: string) => {
    if (!config) return;

    const updatedFaqs = [...(config.knowledgeBase.faqs || [])];
    updatedFaqs[index] = { ...updatedFaqs[index], [field]: value };
    updateConfig('knowledgeBase', { faqs: updatedFaqs });
  };

  const removeFAQ = (index: number) => {
    if (!config) return;

    const updatedFaqs = config.knowledgeBase.faqs?.filter((_, i) => i !== index) || [];
    updateConfig('knowledgeBase', { faqs: updatedFaqs });
  };

  const tabs = [
    { id: 'general', label: 'General', icon: '🏢' },
    { id: 'hours', label: 'Opening Hours', icon: '🕐' },
    { id: 'knowledge', label: 'Knowledge Base', icon: '📚' },
    { id: 'ai', label: 'AI Settings', icon: '🤖' },
    { id: 'booking', label: 'Booking', icon: '📅' },
    { id: 'messaging', label: 'Messaging', icon: '💬' },
    { id: 'integration', label: 'Integration', icon: '🔗' },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading configuration...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !config) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Configuration Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchConfig}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!config) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-gray-400 text-4xl mb-4">⚙️</div>
            <p className="text-gray-600">No configuration data available</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-600 mt-2">Configure your gym settings and knowledge base</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={fetchConfig}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">{successMessage}</p>
            </div>
          )}
        </div>

        {/* Tabs Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">General Information</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Gym Name
                    </label>
                    <input
                      type="text"
                      value={config.name || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev!, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Slug (URL identifier)
                    </label>
                    <input
                      type="text"
                      value={config.slug || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev!, slug: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address
                    </label>
                    <input
                      type="text"
                      value={config.settings.address || ''}
                      onChange={(e) => updateConfig('settings', { address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={config.settings.phone || ''}
                      onChange={(e) => updateConfig('settings', { phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={config.settings.email || ''}
                      onChange={(e) => updateConfig('settings', { email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={config.settings.website || ''}
                      onChange={(e) => updateConfig('settings', { website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Opening Hours Tab */}
          {activeTab === 'hours' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Opening Hours</h3>

                <div className="space-y-4">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.key} className="flex items-center space-x-4">
                      <div className="w-24">
                        <span className="text-sm font-medium text-gray-700">{day.label}</span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="e.g., 06:00-22:00 or Closed"
                          value={config.settings.openingHours?.[day.key as keyof typeof config.settings.openingHours] || ''}
                          onChange={(e) => updateNestedConfig('settings', 'openingHours', { [day.key]: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Format examples:</strong> "06:00-22:00", "24/7", "Closed", "06:00-12:00,14:00-22:00"
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Base Tab */}
          {activeTab === 'knowledge' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Knowledge Base</h3>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Facilities
                    </label>
                    <textarea
                      rows={3}
                      value={config.knowledgeBase.facilities?.join(', ') || ''}
                      onChange={(e) => updateConfig('knowledgeBase', { facilities: e.target.value.split(', ').filter(Boolean) })}
                      placeholder="Gym Floor, Free Weights Area, Cardio Zone, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Classes
                    </label>
                    <textarea
                      rows={3}
                      value={config.knowledgeBase.classes?.join(', ') || ''}
                      onChange={(e) => updateConfig('knowledgeBase', { classes: e.target.value.split(', ').filter(Boolean) })}
                      placeholder="Yoga, Spin, HIIT, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pricing (JSON format: {`{"Classic": "£31.99/month", "WOW": "£36.99/month"}`})
                    </label>
                    <textarea
                      rows={3}
                      value={JSON.stringify(config.knowledgeBase.pricing || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          updateConfig('knowledgeBase', { pricing: parsed });
                        } catch {
                          // Invalid JSON, don't update
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Unique Selling Proposition (USP)
                    </label>
                    <textarea
                      rows={2}
                      value={config.knowledgeBase.usp || ''}
                      onChange={(e) => updateConfig('knowledgeBase', { usp: e.target.value })}
                      placeholder="What makes your gym special?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI Communication Tone
                    </label>
                    <input
                      type="text"
                      value={config.knowledgeBase.tone || ''}
                      onChange={(e) => updateConfig('knowledgeBase', { tone: e.target.value })}
                      placeholder="e.g., friendly, welcoming, professional, not pushy"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* FAQs Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-sm font-medium text-gray-700">
                        Frequently Asked Questions
                      </label>
                      <button
                        onClick={addFAQ}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Add FAQ
                      </button>
                    </div>

                    <div className="space-y-4">
                      {config.knowledgeBase.faqs?.map((faq, index) => (
                        <div key={index} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">FAQ #{index + 1}</span>
                            <button
                              onClick={() => removeFAQ(index)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="space-y-3">
                            <input
                              type="text"
                              placeholder="Question"
                              value={faq.q}
                              onChange={(e) => updateFAQ(index, 'q', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                            <textarea
                              rows={2}
                              placeholder="Answer"
                              value={faq.a}
                              onChange={(e) => updateFAQ(index, 'a', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>
                      )) || []}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Settings Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Assistant Settings</h3>

                <div className="space-y-6">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="ai-enabled"
                      checked={config.settings.aiSettings?.enabled ?? true}
                      onChange={(e) => updateNestedConfig('settings', 'aiSettings', { enabled: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="ai-enabled" className="ml-2 text-sm font-medium text-gray-700">
                      Enable AI Assistant
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quiet Hours Start
                      </label>
                      <input
                        type="time"
                        value={config.settings.aiSettings?.quietHours?.start || '21:00'}
                        onChange={(e) => updateNestedConfig('settings', 'aiSettings', {
                          quietHours: {
                            ...config.settings.aiSettings?.quietHours,
                            start: e.target.value
                          }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quiet Hours End
                      </label>
                      <input
                        type="time"
                        value={config.settings.aiSettings?.quietHours?.end || '09:00'}
                        onChange={(e) => updateNestedConfig('settings', 'aiSettings', {
                          quietHours: {
                            ...config.settings.aiSettings?.quietHours,
                            end: e.target.value
                          }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Contact Attempts
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={config.settings.aiSettings?.maxContactAttempts || 3}
                        onChange={(e) => updateNestedConfig('settings', 'aiSettings', { maxContactAttempts: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="escalation-enabled"
                      checked={config.settings.aiSettings?.escalationEnabled ?? true}
                      onChange={(e) => updateNestedConfig('settings', 'aiSettings', { escalationEnabled: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="escalation-enabled" className="ml-2 text-sm font-medium text-gray-700">
                      Enable escalation to human staff when AI can't help
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Other tabs would be implemented similarly... */}
          {activeTab !== 'general' && activeTab !== 'hours' && activeTab !== 'knowledge' && activeTab !== 'ai' && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-4xl mb-4">🚧</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{tabs.find(t => t.id === activeTab)?.label} Settings</h3>
              <p className="text-gray-600">This section is coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default withAuth(SettingsPage);