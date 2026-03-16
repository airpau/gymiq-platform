'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: '📊' },
  { name: 'Leads', href: '/leads', icon: '🎯' },
  { name: 'Conversations', href: '/conversations', icon: '💬' },
  { name: 'Cancel-Save', href: '/cancel-save', icon: '🛡️' },
  { name: 'Retention', href: '/retention', icon: '💪' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-sm border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:static lg:inset-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                  <Image src="/gymiq-icon-square.png" alt="GymIQ" width={32} height={32} />
                </div>
                <div>
                  <h1 className="text-lg lg:text-xl font-bold text-gray-900">GymIQ</h1>
                  <p className="text-xs text-gray-500">AI Gym Management</p>
                </div>
              </div>

              {/* Mobile close button */}
              <button
                className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <nav className="px-3 pb-6 flex-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)} // Close sidebar on mobile after navigation
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-50 border-t">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 lg:w-8 lg:h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-gray-600 text-xs lg:text-sm">👤</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs lg:text-sm font-medium text-gray-900 truncate">Demo User</p>
                <p className="text-xs text-gray-500">Gym Manager</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile header with hamburger */}
          <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="sr-only">Open sidebar</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-gray-900">GymIQ</h1>
              <div className="w-10" /> {/* Spacer for centering */}
            </div>
          </div>

          {/* Page content */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}