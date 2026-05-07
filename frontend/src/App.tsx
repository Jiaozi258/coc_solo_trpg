import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import CharacterPage from './pages/CharacterPage'
import GamePage from './pages/GamePage'
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
        <Route path="/game/:sessionId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      </Routes>
    </Layout>
  )
}
