'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  intent?: string;
  intentConfidence?: number;
  createdAt: string;
}

interface Conversation {
  id: string;
  phone: string;
  channel: string;
  status: 'active' | 'closed' | 'waiting_human';
  member?: {
    id: string;
    name: string;
    status: string;
  };
  lead?: {
    id: string;
    name: string;
    currentStage: string;
  };
  messages: Message[];
  lastMessageAt: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'waiting_human' | 'ai_handled'>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');

  // In a real app, this would come from context/auth
  const gymId = '6169f878-8493-4cd9-974f-a554863a6f7f'; // Energie Fitness Hoddesdon

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try fetching from real API first
      try {
        const response = await fetch(`http://localhost:3001/conversations?gymId=${gymId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setConversations(result.data || []);
            return;
          }
        }
      } catch (apiError) {
        console.warn('API unavailable, using mock data:', apiError);
      }

      // Fallback to mock data
      const mockConversations: Conversation[] = [
        {
          id: '1',
          phone: '+44 7700 900127',
          channel: 'whatsapp',
          status: 'waiting_human',
          member: {
            id: 'm1',
            name: 'John Smith',
            status: 'active'
          },
          messages: [{
            id: 'msg1',
            direction: 'inbound',
            content: 'I want to cancel my membership',
            intent: 'cancellation_intent',
            intentConfidence: 0.95,
            createdAt: '2026-03-14T10:30:00Z'
          }],
          lastMessageAt: '2026-03-14T10:30:00Z'
        },
        {
          id: '2',
          phone: '+44 7700 900128',
          channel: 'whatsapp',
          status: 'active',
          lead: {
            id: 'l1',
            name: 'Sarah Jones',
            currentStage: 'engaged'
          },
          messages: [{
            id: 'msg2',
            direction: 'inbound',
            content: 'What are your membership prices?',
            intent: 'pricing_question',
            intentConfidence: 0.92,
            createdAt: '2026-03-14T09:15:00Z'
          }],
          lastMessageAt: '2026-03-14T09:15:00Z'
        },
        {
          id: '3',
          phone: '+44 7700 900129',
          channel: 'whatsapp',
          status: 'active',
          lead: {
            id: 'l2',
            name: 'Mike Wilson',
            currentStage: 'contacted'
          },
          messages: [{
            id: 'msg3',
            direction: 'inbound',
            content: 'Can I book a gym tour?',
            intent: 'booking_request',
            intentConfidence: 0.88,
            createdAt: '2026-03-14T08:45:00Z'
          }],
          lastMessageAt: '2026-03-14T08:45:00Z'
        }
      ];

      setConversations(mockConversations);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch conversations';
      setError(errorMessage);
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeOver = async (conversationId: string) => {
    try {
      // In real app: await fetch(`http://localhost:3001/conversations/${conversationId}/takeover`, { method: 'POST' });
      console.log('Taking over conversation:', conversationId);

      // Update local state optimistically
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, status: 'waiting_human' as const }
            : conv
        )
      );

      // Show success feedback
      // Could use toast notifications here

    } catch (error) {
      console.error('Failed to take over conversation:', error);
      setError('Failed to take over conversation. Please try again.');

      // Revert optimistic update on error
      fetchConversations();
    }
  };

  const handleResolve = async (conversationId: string) => {
    try {
      // In real app: await fetch(`http://localhost:3001/conversations/${conversationId}/resolve`, { method: 'POST' });
      console.log('Resolving conversation:', conversationId);

      // Update local state optimistically
      setConversations(prev =>
        prev.filter(conv => conv.id !== conversationId)
      );

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
      }

      // Show success feedback
      // Could use toast notifications here

    } catch (error) {
      console.error('Failed to resolve conversation:', error);
      setError('Failed to resolve conversation. Please try again.');

      // Revert optimistic update on error
      fetchConversations();
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (filter === 'all') return true;
    if (filter === 'active') return conv.status === 'active';
    if (filter === 'waiting_human') return conv.status === 'waiting_human';
    if (filter === 'ai_handled') return conv.status === 'active';
    return true;
  }).filter(conv => {
    if (intentFilter === 'all') return true;
    return conv.messages.some(msg => msg.intent === intentFilter);
  });

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      waiting_human: 'bg-yellow-100 text-yellow-800',
      closed: 'bg-gray-100 text-gray-800'
    };
    return colors[status as keyof typeof colors] || colors.active;
  };

  const getIntentBadge = (intent?: string, confidence?: number) => {
    if (!intent) return null;

    const colors = {
      cancellation_intent: 'bg-red-100 text-red-800',
      booking_request: 'bg-blue-100 text-blue-800',
      pricing_question: 'bg-purple-100 text-purple-800',
      complaint: 'bg-orange-100 text-orange-800',
      human_escalation: 'bg-yellow-100 text-yellow-800'
    };

    const color = colors[intent as keyof typeof colors] || 'bg-gray-100 text-gray-800';

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        {intent.replace('_', ' ')}
        {confidence && (
          <span className="ml-1 text-xs opacity-75">
            ({Math.round(confidence * 100)}%)
          </span>
        )}
      </span>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading conversations...</p>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Conversations Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchConversations}
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
      <div className="flex h-full">
        {/* Conversations List */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
              <button
                onClick={fetchConversations}
                disabled={loading}
                className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span className="text-sm">Refresh</span>
              </button>
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

            {/* Filters */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Conversations</option>
                  <option value="active">AI Handling</option>
                  <option value="waiting_human">Needs Human</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intent</label>
                <select
                  value={intentFilter}
                  onChange={(e) => setIntentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Intents</option>
                  <option value="cancellation_intent">Cancellation</option>
                  <option value="booking_request">Booking</option>
                  <option value="pricing_question">Pricing</option>
                  <option value="complaint">Complaint</option>
                  <option value="human_escalation">Human Request</option>
                </select>
              </div>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <div className="text-4xl mb-2">💬</div>
                <p>No conversations found</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    selectedConversation?.id === conv.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">
                        {conv.member?.name || conv.lead?.name || 'Unknown'}
                      </h3>
                      <p className="text-sm text-gray-500">{conv.phone}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(conv.status)}`}>
                      {conv.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mb-2">
                    {conv.messages[0] && (
                      <p className="text-sm text-gray-600 truncate">
                        {conv.messages[0].content}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex flex-wrap gap-1">
                      {conv.messages[0]?.intent && getIntentBadge(
                        conv.messages[0].intent,
                        conv.messages[0].intentConfidence
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(conv.lastMessageAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversation Details */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="p-6 bg-white border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedConversation.member?.name || selectedConversation.lead?.name}
                    </h2>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className="text-sm text-gray-500">
                        {selectedConversation.phone} • {selectedConversation.channel}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedConversation.status)}`}>
                        {selectedConversation.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleTakeOver(selectedConversation.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Take Over
                    </button>
                    <button
                      onClick={() => handleResolve(selectedConversation.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <div className="max-w-4xl mx-auto space-y-4">
                  {selectedConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.direction === 'outbound'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-900 border border-gray-200'
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <div className="mt-2 flex justify-between items-center">
                          {message.intent && (
                            <div className="mr-2">
                              {getIntentBadge(message.intent, message.intentConfidence)}
                            </div>
                          )}
                          <span className={`text-xs ${
                            message.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'
                          }`}>
                            {new Date(message.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Input */}
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a conversation</h3>
                <p className="text-gray-500">Choose a conversation from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}