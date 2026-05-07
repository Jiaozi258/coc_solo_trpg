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

export default api
