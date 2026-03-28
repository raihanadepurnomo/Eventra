import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, clearToken, ApiHttpError } from '@/lib/api';
import { mapUser } from '@/lib/mappers';
import type { User } from '@/types';

type AuthActionResult =
  | { status: 'authenticated'; user: User }
  | { status: 'otp_required'; email: string; otpType: 'verify_email' };

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (name: string, email: string, password: string, phone: string, role?: string) => Promise<AuthActionResult>;
  loginWithGoogle: () => void;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // On mount, check for stored token and restore session
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('eventra_token');
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
      return null;
    }

    try {
      const rawUser: any = await api.get('/auth/me');
      const user = mapUser(rawUser);
      setState({ user, isLoading: false, isAuthenticated: true });
      return user;
    } catch {
      clearToken();
      setState({ user: null, isLoading: false, isAuthenticated: false });
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    try {
      const data: any = await api.post('/auth/login', { email, password });
      setToken(data.token);
      const user = await refreshUser();
      if (!user) throw new Error('Gagal memuat profil');
      return { status: 'authenticated', user };
    } catch (error) {
      if (error instanceof ApiHttpError && error.data?.require_otp) {
        return {
          status: 'otp_required',
          email: error.data.email || email,
          otpType: 'verify_email',
        };
      }
      throw error;
    }
  };

  const register = async (name: string, email: string, password: string, phone: string, role?: string) => {
    const data: any = await api.post('/auth/register', { name, email, password, phone, role });

    if (data?.require_otp) {
      return {
        status: 'otp_required',
        email: data.email || email,
        otpType: 'verify_email',
      };
    }

    if (data?.token) {
      setToken(data.token);
      const user = await refreshUser();
      if (!user) throw new Error('Gagal memuat profil');
      return { status: 'authenticated', user };
    }

    throw new Error('Respons registrasi tidak valid');
  };

  const loginWithGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const logout = () => {
    clearToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
