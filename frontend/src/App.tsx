import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import CharacterPage from './pages/CharacterPage'
import SettingsPage from './pages/SettingsPage'
import GamePage from './pages/GamePage'
import CardManagePage from './pages/CardManagePage'
import ChatPage from './pages/ChatPage'
import LorebookPage from './pages/LorebookPage'
import LorebookEditPage from './pages/LorebookEditPage'
import ToastContainer from './components/Toast'
import { useAuthStore } from './store/authStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/characters" element={<ProtectedRoute><CharacterPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/game/:sessionId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
        <Route path="/cards" element={<ProtectedRoute><CardManagePage /></ProtectedRoute>} />
        <Route path="/chat/:cardId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/lorebooks" element={<ProtectedRoute><LorebookPage /></ProtectedRoute>} />
        <Route path="/lorebooks/:lorebookId" element={<ProtectedRoute><LorebookEditPage /></ProtectedRoute>} />
      </Routes>
      <ToastContainer />
    </Layout>
  )
}
