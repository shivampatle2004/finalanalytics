import { useState, useEffect, useContext } from 'react'
import { ThemeContext } from '../../shared/context/ThemeContext'
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import './App.css'
import './styles/theme.css'
import Header from './components/Header'
import LandingPage from './pages/LandingPage'
import SignIn from './pages/SignIn'
import CreateAccount from './pages/CreateAccount'
import Dashboard from './pages/Dashboard'
import ETLDashboard from './pages/ETLDashboard'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import PaginatedReportBuilder from './pages/PaginatedReportBuilder'
import ErrorBoundary from './components/ErrorBoundary'
import { FilterProvider } from './context/FilterContext'

/**
 * ConditionalHeader Component
 * Hides the header on specific routes (e.g., analytics)
 */
const ConditionalHeader = ({ isAuthenticated, userName, onLogout, isDarkMode, toggleTheme }) => {
  const location = useLocation();
  // Hide header on analytics pages to give more space to the BI workspace
  if (location.pathname === '/' || location.pathname.startsWith('/workspace/')) return null;

  return (
    <Header
      isAuthenticated={isAuthenticated}
      userName={userName}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      toggleTheme={toggleTheme}
    />
  );
};

/**
 * Remembers and restores the last visited in-app page.
 * On hard refresh, users return to the same page instead of landing.
 */
const RoutePersistence = ({ isAuthenticated, userId }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const canRestoreRoute =
    isAuthenticated ||
    !!userId ||
    localStorage.getItem('isAuthenticated') === 'true' ||
    !!localStorage.getItem('userId');

  useEffect(() => {
    const current = `${location.pathname}${location.search || ''}`;
    const nonPersistRoutes = ['/sign-in', '/create-account', '/auth'];
    const isBareRoot = location.pathname === '/' && !location.search;

    console.log(`📍 [RoutePersistence] Location: ${location.pathname}, Auth: ${canRestoreRoute}`);

    // If user lands on root without a file query, restore previous route first.
    // Important: do not overwrite saved route with bare "/" on refresh.
    if (
      canRestoreRoute &&
      isBareRoot
    ) {
      const saved = localStorage.getItem('osa_last_route');
      console.log(`📍 [RoutePersistence] Saved route found: ${saved}`);
      if (saved && saved !== '/' && saved !== current) {
        console.log(`📍 [RoutePersistence] Restoring route: ${saved}`);
        navigate(saved, { replace: true });
        return;
      }
    }

    // Persist all navigable routes except auth pages and bare root.
    if (!nonPersistRoutes.includes(location.pathname) && !isBareRoot) {
      console.log(`📍 [RoutePersistence] Saving route: ${current}`);
      localStorage.setItem('osa_last_route', current);
    }
  }, [location.pathname, location.search, canRestoreRoute, navigate]);

  return null;
};

/**
 * Main App Component
 * Handles routing for OneStopAnalytics application
 * Routes: Landing, SignIn, CreateAccount, Dashboard with protected navigation
 */
function App() {
  const defaultUserId = localStorage.getItem('userId') || '1';
  const defaultUserName = localStorage.getItem('userName') || 'Demo User';

  // Always use demo auth by default.
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [userName, setUserName] = useState(defaultUserName);
  const [userId, setUserId] = useState(defaultUserId);

  useEffect(() => {
    if (localStorage.getItem('userId') !== '1') {
      localStorage.setItem('userId', '1');
    }
    if (localStorage.getItem('userName') !== 'Demo User') {
      localStorage.setItem('userName', 'Demo User');
    }
    if (localStorage.getItem('isAuthenticated') !== 'true') {
      localStorage.setItem('isAuthenticated', 'true');
    }
  }, []);

  /**
   * Handle user login
   * Stores authentication state in localStorage
   * @param {string} name - User's display name
   */
  const handleLogin = (name, id) => {
    setIsAuthenticated(true)
    setUserName(name)
    setUserId(id)
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('userName', name)
    localStorage.setItem('userId', id)
  }

  /**
   * Handle user logout
   * Clears authentication state and route history
   */
  const handleLogout = () => {
    console.log('🚪 [Logout] Clearing authentication state');
    setIsAuthenticated(false)
    setUserName('')
    setUserId(null)
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userName')
    localStorage.removeItem('userId')
    // CRITICAL: Clear saved route so user doesn't get redirected to workspace after logout
    localStorage.removeItem('osa_last_route')
    console.log('✅ [Logout] Auth and route cleared, user will see login page');
  }

  const themeContext = useContext(ThemeContext)
  const [isLocalDarkMode, setLocalDarkMode] = useState(
    localStorage.getItem('theme') === 'dark' || false
  )
  const isDarkMode = themeContext ? themeContext.isDark : isLocalDarkMode
  const effectiveIsAuthenticated = isAuthenticated || !!userId

  // Keep legacy sessions usable: if userId exists, ensure auth flag is also persisted.
  useEffect(() => {
    if (!isAuthenticated && userId) {
      setIsAuthenticated(true);
      localStorage.setItem('isAuthenticated', 'true');
    }
  }, [isAuthenticated, userId]);

  /**
   * Toggle between light and dark theme
   */
  const toggleTheme = () => {
    if (themeContext) {
      themeContext.toggleTheme()
    } else {
      const newTheme = !isLocalDarkMode
      setLocalDarkMode(newTheme)
      localStorage.setItem('theme', newTheme ? 'dark' : 'white')
    }
  }

  return (
    <FilterProvider>
      <div className={`app-container ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
        <ErrorBoundary>
          <Router basename="/analytics">
            <RoutePersistence isAuthenticated={effectiveIsAuthenticated} userId={userId} />
            <ConditionalHeader
              isAuthenticated={effectiveIsAuthenticated}
              userName={userName}
              onLogout={handleLogout}
              isDarkMode={isDarkMode}
              toggleTheme={toggleTheme}
            />
            <Routes>
              {/* Auth Routes - Always accessible if not already authenticated */}
              <Route path="/sign-in" element={<SignIn isAuthenticated={effectiveIsAuthenticated} onLogin={handleLogin} />} />
              <Route path="/create-account" element={<CreateAccount isAuthenticated={effectiveIsAuthenticated} onLogin={handleLogin} />} />
              
              {/* Protected Routes - Always accessible for demo auth */}
              {effectiveIsAuthenticated ? (
                <>
                  <Route path="/" element={<AnalyticsDashboard onLogout={handleLogout} />} />
                  <Route
                    path="/dashboard"
                    element={<Dashboard userName={userName} userId={userId} />}
                  />
                  <Route
                    path="/etl"
                    element={<ETLDashboard />}
                  />
                  <Route
                    path="/workspace/:fileId"
                    element={<AnalyticsDashboard onLogout={handleLogout} />}
                  />
                  <Route
                    path="/reports/builder"
                    element={<PaginatedReportBuilder userId={userId} />}
                  />
                  <Route
                    path="/reports/builder/:reportId"
                    element={<PaginatedReportBuilder userId={userId} />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                  />
                </>
              ) : (
                <>
                  {/* If not authenticated, show login page for all routes */}
                  <Route path="/" element={<SignIn onLogin={handleLogin} />} />
                  <Route path="*" element={<Navigate to="/sign-in" replace />} />
                </>
              )}
            </Routes>
          </Router>
        </ErrorBoundary>
      </div>
    </FilterProvider>
  )
}

export default App;
