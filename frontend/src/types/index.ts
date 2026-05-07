export interface Attributes {
  STR: number; CON: number; SIZ: number; DEX: number
  INT: number; APP: number; POW: number; EDU: number
  LUCK: number
}

export interface DerivedStats {
  HP_current: number; HP_max: number
  SAN_current: number; SAN_max: number
  MP_current: number; MP_max: number
  MOV: number; BUILD: number; DODGE: number
  [key: string]: number
}

export interface CharacterBackground {
  residence: string
  history: string
  beliefs: string
  important_persons: string
  appearance: string
  [key: string]: string
}

export interface Character {
  id: string
  user_id: string
  name: string
  occupation: string
  attributes: Attributes
  skills: Record<string, number>
  derived_stats: DerivedStats
  background: CharacterBackground
  status: 'alive' | 'insane' | 'dead'
  created_at?: string
}

export interface Module {
  id: string
  title: string
  filename: string
  chunks_count: number
  created_at?: string
}

export interface GameSession {
  id: string
  user_id: string
  module_id: string
  character_id: string
  companion_ids: string[]
  status: 'active' | 'paused' | 'completed'
  created_at?: string
}

export interface DiceRequest {
  type: 'skill_check' | 'damage'
  skill?: string
  value?: number
  difficulty?: 'regular' | 'hard' | 'extreme'
  expression?: string
  weapon?: string
  explanation: string
}

export interface DiceResult {
  expression: string
  individual: number[]
  total: number
}

export interface StatusUpdate {
  HP_change?: number
  SAN_change?: number
  MP_change?: number
  effects?: string[]
}

export interface SessionSnapshot {
  id: string
  turn_number: number
  narrative_chunk: string
  player_action: string
  created_at?: string
}

export type COCOccupation = {
  name: string
  skills: string[]
  credit_rating: [number, number]
}

export const COC_OCCUPATIONS: COCOccupation[] = [
  { name: '古董商', skills: ['估价', '历史', '图书馆使用', '一项社交技能'], credit_rating: [30, 70] },
  { name: '医生', skills: ['急救', '医学', '心理学', '科学'], credit_rating: [40, 80] },
  { name: '记者', skills: ['侦查', '聆听', '心理学', '图书馆使用'], credit_rating: [20, 60] },
  { name: '私家侦探', skills: ['侦查', '跟踪', '法律', '心理学'], credit_rating: [20, 60] },
  { name: '教授', skills: ['图书馆使用', '历史', '神秘学', '说服'], credit_rating: [30, 70] },
  { name: '考古学家', skills: ['考古学', '历史', '图书馆使用', '侦查'], credit_rating: [20, 60] },
  { name: '作家', skills: ['母语', '心理学', '图书馆使用', '神秘学'], credit_rating: [10, 50] },
  { name: '图书馆管理员', skills: ['图书馆使用', '母语', '历史', '会计'], credit_rating: [10, 40] },
  { name: '警官', skills: ['格斗', '射击', '侦查', '法律'], credit_rating: [30, 70] },
  { name: '神职人员', skills: ['说服', '心理学', '母语', '神秘学'], credit_rating: [10, 50] },
  { name: '罪犯', skills: ['潜行', '巧手', '格斗', '侦查'], credit_rating: [10, 50] },
  { name: '艺术家', skills: ['艺术', '侦查', '心理学', '母语'], credit_rating: [10, 50] },
]

export interface LocationNode {
  id: string
  name: string
  description: string
  icon_type: string
  has_quest: boolean
  sort_order: number
  children: LocationNode[]
}

export interface LocationTreeResponse {
  module_id: string
  locations: LocationNode[]
}

export const COC_SKILL_LIST = [
  '会计', '人类学', '估价', '考古学', '艺术', '魅惑', '攀爬', '计算机使用',
  '信用评级', '克苏鲁神话', '乔装', '闪避', '汽车驾驶', '电气维修', '电子学',
  '快速交谈', '格斗', '枪械', '急救', '历史', '恐吓', '跳跃', '母语',
  '法律', '图书馆使用', '聆听', '锁匠', '机械维修', '医学', '自然世界',
  '导航', '神秘学', '重型机械', '说服', '驾驶', '精神分析', '心理学',
  '骑术', '科学', '巧手', '侦查', '潜行', '生存', '游泳', '投掷', '追踪',
]
