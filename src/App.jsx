import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import RealtimeBridge from '@/lib/RealtimeBridge';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Controls from '@/pages/Controls';
import Automation from '@/pages/Automation';
import Alerts from '@/pages/Alerts';
import History from '@/pages/History';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'auth_required') {
      return <Login />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Không thể kết nối hệ thống</h1>
          <p className="mt-2 text-sm text-muted-foreground">{authError.message}</p>
        </div>
      </div>
    );
  }

  // Render the main app
  return (
    <>
      <RealtimeBridge />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/controls" element={<Controls />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
