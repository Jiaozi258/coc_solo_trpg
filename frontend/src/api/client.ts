import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const register = (username: string, password: string) =>
  api.post('/auth/register', { username, password })

export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password })

export const guestLogin = () =>
  api.post('/auth/guest')

export const createCharacter = (data: any) =>
  api.post('/characters/', data)

export const listCharacters = () =>
  api.get('/characters/')

export const getCharacter = (id: string) =>
  api.get(`/characters/${id}`)

export const updateCharacter = (id: string, data: any) =>
  api.put(`/characters/${id}`, data)

export const deleteCharacter = (id: string) =>
  api.delete(`/characters/${id}`)

export const uploadModule = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/modules/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const listModules = () =>
  api.get('/modules/')

export const deleteModule = (id: string) =>
  api.delete(`/modules/${id}`)

export const generateModule = (data: {
  name: string
  background: string
  location: string
  player_count: number
  npc_count: string
  enemy_count: string
  tone: string
  difficulty: string
}) =>
  api.post('/modules/generate', data)

export const createSession = (module_id: string, character_id: string, companion_count: number) =>
  api.post('/sessions/', { module_id, character_id, companion_count })

export const getSession = (id: string) =>
  api.get(`/sessions/${id}`)

export const listSessions = () =>
  api.get('/sessions/')

export const getSnapshots = (session_id: string) =>
  api.get(`/sessions/${session_id}/snapshots`)

export const rollbackSession = (session_id: string, snapshot_id: string) =>
  api.post(`/sessions/${session_id}/rollback/${snapshot_id}`)

export const getLocations = (moduleId: string) =>
  api.get(`/modules/${moduleId}/locations`)

// Settings
export const getSettings = () =>
  api.get('/settings')

export const saveSettings = (data: any) =>
  api.post('/settings', data)

export const uploadBgImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/settings/background-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const uploadBgMusic = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/settings/background-music', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const deleteBgImage = () =>
  api.delete('/settings/background-image')

export const deleteBgMusic = () =>
  api.delete('/settings/background-music')

// Character Cards
export const createCard = (form: FormData) =>
  api.post('/cards', form, { headers: { 'Content-Type': 'multipart/form-data' } })

export const listCards = () =>
  api.get('/cards')

export const getCard = (id: string) =>
  api.get(`/cards/${id}`)

export const deleteCard = (id: string) =>
  api.delete(`/cards/${id}`)

export const importCardPng = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/cards/import-png', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Game / Chat Saves
export const createSave = (type: 'chat' | 'game', name: string, data: any) =>
  api.post('/saves', { type, name, data })

export const listSaves = (type?: 'chat' | 'game') =>
  api.get('/saves', { params: type ? { type } : {} })

export const getSave = (id: string) =>
  api.get(`/saves/${id}`)

export const deleteSave = (id: string) =>
  api.delete(`/saves/${id}`)

// Lorebooks
export const createLorebook = (name: string, description: string) =>
  api.post('/lorebooks', { name, description })

export const listLorebooks = () =>
  api.get('/lorebooks')

export const getLorebook = (id: string) =>
  api.get(`/lorebooks/${id}`)

export const updateLorebook = (id: string, data: { name?: string; description?: string }) =>
  api.put(`/lorebooks/${id}`, data)

export const deleteLorebook = (id: string) =>
  api.delete(`/lorebooks/${id}`)

export const createLorebookEntry = (lorebookId: string, data: any) =>
  api.post(`/lorebooks/${lorebookId}/entries`, data)

export const listLorebookEntries = (lorebookId: string) =>
  api.get(`/lorebooks/${lorebookId}/entries`)

export const updateLorebookEntry = (lorebookId: string, entryId: string, data: any) =>
  api.put(`/lorebooks/${lorebookId}/entries/${entryId}`, data)

export const deleteLorebookEntry = (lorebookId: string, entryId: string) =>
  api.delete(`/lorebooks/${lorebookId}/entries/${entryId}`)

export const importLorebook = (file: File, name?: string) => {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  return api.post('/lorebooks/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const exportLorebook = (id: string) =>
  api.get(`/lorebooks/${id}/export`)

// User Personas
export const createPersona = (data: { name: string; appearance: string; background: string }) =>
  api.post('/personas', data)

export const listPersonas = () =>
  api.get('/personas')

export const updatePersona = (id: string, data: { name?: string; appearance?: string; background?: string }) =>
  api.put(`/personas/${id}`, data)

export const deletePersona = (id: string) =>
  api.delete(`/personas/${id}`)

// LLM test
export const testLLMConnection = () =>
  api.post('/settings/test-llm')

export const testImageGen = () =>
  api.post('/settings/test-image-gen')

export const generateImage = (prompt: string, size?: string) =>
  api.post('/settings/generate-image', { prompt, size: size || '1024x1024' })

export default api
