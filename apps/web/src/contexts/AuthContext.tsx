'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import {
  UserProfile,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  User,
  Gym
} from '@gymiq/shared';

// Types
interface AuthState {
  user: User | null;
  gym: Gym | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: User; gym: Gym } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOGOUT' }
  | { type: 'INIT_SUCCESS'; payload: { user: User; gym: Gym } }
  | { type: 'INIT_FAILURE' };

interface AuthContextType {
  // State
  user: User | null;
  gym: Gym | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshAuth: () => Promise<void>;
}

// Initial state
const initialState: AuthState = {
  user: null,
  gym: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload.user,
        gym: action.payload.gym,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false,
      };
    case 'INIT_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        gym: action.payload.gym,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'INIT_FAILURE':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
      };
    default:
      return state;
  }
}

// Context
const AuthContext = createContext<AuthContextType | null>(null);

// API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to make authenticated API calls
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      success: false,
      error: 'An unexpected error occurred'
    }));
    throw new Error(error.error || 'Network error');
  }

  return response.json();
}

// AuthProvider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const response = await apiCall('/auth/me');

        if (response.success && response.data) {
          dispatch({
            type: 'INIT_SUCCESS',
            payload: {
              user: response.data.user,
              gym: response.data.gym,
            },
          });
        } else {
          dispatch({ type: 'INIT_FAILURE' });
        }
      } catch (error) {
        // Not authenticated - this is expected for new users
        dispatch({ type: 'INIT_FAILURE' });
      }
    };

    initializeAuth();
  }, []);

  // Actions
  const login = async (credentials: LoginRequest) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      if (response.success && response.data) {
        dispatch({
          type: 'SET_USER',
          payload: {
            user: response.data.user,
            gym: response.data.gym,
          },
        });
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Login failed',
      });
    }
  };

  const register = async (data: RegisterRequest) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (response.success && response.data) {
        dispatch({
          type: 'SET_USER',
          payload: {
            user: response.data.user,
            gym: response.data.gym,
          },
        });
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Registration failed',
      });
    }
  };

  const logout = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await apiCall('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      // Logout API call failed, but still clear local state
      console.warn('Logout API call failed:', error);
    }

    dispatch({ type: 'LOGOUT' });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const refreshAuth = async () => {
    try {
      const response = await apiCall('/auth/me');

      if (response.success && response.data) {
        dispatch({
          type: 'SET_USER',
          payload: {
            user: response.data.user,
            gym: response.data.gym,
          },
        });
      } else {
        dispatch({ type: 'LOGOUT' });
      }
    } catch (error) {
      dispatch({ type: 'LOGOUT' });
    }
  };

  const value: AuthContextType = {
    // State
    user: state.user,
    gym: state.gym,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    error: state.error,

    // Actions
    login,
    register,
    logout,
    clearError,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protecting routes
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      // Redirect to login - in a real app you'd use Next.js router
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return null;
    }

    return <Component {...props} />;
  };
}