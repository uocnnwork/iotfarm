import React, { createContext, useState, useContext, useEffect } from 'react';
import { appClient } from '@/api/appClient';

const AuthContext = createContext();
const AUTH_REQUIRED_ERROR = {
  type: 'auth_required',
  message: 'Authentication required',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const isAuthenticated = Boolean(user);

  async function checkUserAuth() {
    setIsLoadingAuth(true);
    try {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
      setAuthError(null);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);

      if (error.status === 401 || error.status === 403) {
        setAuthError(AUTH_REQUIRED_ERROR);
      } else {
        setAuthError({
          type: 'unknown',
          message: error?.message || 'Auth init failed',
        });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }

  useEffect(() => {
    checkUserAuth();
  }, []);

  const login = async (credentials) => {
    const currentUser = await appClient.auth.login(credentials);
    setUser(currentUser);
    setAuthError(null);
    return currentUser;
  };

  const register = async (data) => appClient.auth.register(data);

  const logout = async () => {
    setUser(null);
    setAuthError(AUTH_REQUIRED_ERROR);
    try {
      await appClient.auth.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      login,
      register,
      logout,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
