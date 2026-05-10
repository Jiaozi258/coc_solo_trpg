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

export interface DiceCheckResult {
  success: boolean
  level: 'critical' | 'extreme' | 'hard' | 'regular' | 'failure' | 'fumble'
  label: string
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
  { name: '律师', skills: ['法律', '图书馆使用', '快速交谈', '心理学'], credit_rating: [30, 70] },
  { name: '工程师', skills: ['电气维修', '机械维修', '科学', '图书馆使用'], credit_rating: [30, 70] },
  { name: '护士', skills: ['急救', '医学', '心理学', '聆听'], credit_rating: [20, 60] },
  { name: '士兵', skills: ['格斗', '枪械', '生存', '闪避'], credit_rating: [10, 50] },
  { name: '飞行员', skills: ['导航', '驾驶', '机械维修', '科学'], credit_rating: [30, 70] },
  { name: '科学家', skills: ['科学', '图书馆使用', '计算机使用', '自然世界'], credit_rating: [30, 70] },
  { name: '出租车司机', skills: ['汽车驾驶', '导航', '侦查', '机械维修'], credit_rating: [10, 40] },
  { name: '农民', skills: ['自然世界', '生存', '机械维修', '重型机械'], credit_rating: [10, 30] },
  { name: '猎人', skills: ['枪械', '追踪', '生存', '潜行'], credit_rating: [10, 30] },
  { name: '水手', skills: ['导航', '游泳', '攀爬', '自然世界'], credit_rating: [10, 40] },
  { name: '音乐家', skills: ['艺术', '聆听', '心理学', '一项社交技能'], credit_rating: [10, 50] },
  { name: '摄影师', skills: ['艺术', '侦查', '图书馆使用', '聆听'], credit_rating: [10, 50] },
  { name: '翻译', skills: ['母语', '心理学', '图书馆使用', '历史'], credit_rating: [20, 60] },
  { name: '保镖', skills: ['格斗', '侦查', '聆听', '闪避'], credit_rating: [20, 60] },
  { name: '服务员', skills: ['闪避', '聆听', '侦查', '一项社交技能'], credit_rating: [10, 30] },
  { name: '伐木工', skills: ['格斗', '攀爬', '自然世界', '跳跃'], credit_rating: [10, 30] },
  { name: '矿工', skills: ['攀爬', '重型机械', '生存', '跳跃'], credit_rating: [10, 30] },
  { name: '赛车手', skills: ['汽车驾驶', '机械维修', '闪避', '快速交谈'], credit_rating: [20, 60] },
  { name: '化学家', skills: ['科学', '医学', '图书馆使用', '一项社交技能'], credit_rating: [30, 70] },
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

export interface CharacterCard {
  id: string
  name: string
  personality: string
  background: string
  relationships: string
  dialogue_examples: string
  first_message: string
  portrait_path: string
  source: 'manual' | 'png_import'
  created_at?: string
}

export const COC_SKILL_LIST = [
  '会计', '人类学', '估价', '考古学', '艺术', '魅惑', '攀爬', '计算机使用',
  '信用评级', '克苏鲁神话', '乔装', '闪避', '汽车驾驶', '电气维修', '电子学',
  '快速交谈', '格斗', '枪械', '急救', '历史', '恐吓', '跳跃', '母语',
  '法律', '图书馆使用', '聆听', '锁匠', '机械维修', '医学', '自然世界',
  '导航', '神秘学', '重型机械', '说服', '驾驶', '精神分析', '心理学',
  '骑术', '科学', '巧手', '侦查', '潜行', '生存', '游泳', '投掷', '追踪',
]

// COC 7e skill base values (from rulebook, before attribute-dependent skills)
export const COC_SKILL_BASE: Record<string, number> = {
  '会计': 5, '人类学': 1, '估价': 5, '考古学': 1, '艺术': 5,
  '魅惑': 15, '攀爬': 20, '计算机使用': 5, '信用评级': 0,
  '克苏鲁神话': 0, '乔装': 5, '汽车驾驶': 20, '电气维修': 10,
  '电子学': 1, '快速交谈': 5, '格斗': 25, '枪械': 20,
  '急救': 30, '历史': 5, '恐吓': 15, '跳跃': 20,
  '法律': 5, '图书馆使用': 20, '聆听': 20, '锁匠': 1,
  '机械维修': 10, '医学': 1, '自然世界': 10, '导航': 10,
  '神秘学': 5, '重型机械': 1, '说服': 10, '精神分析': 1,
  '心理学': 10, '骑术': 5, '科学': 1, '巧手': 10,
  '侦查': 25, '潜行': 20, '生存': 10, '游泳': 20,
  '投掷': 20, '追踪': 10,
}

// Skills whose base value depends on attributes (computed at character creation)
export const COC_SKILL_ATTR_BASE: Record<string, string[]> = {
  '闪避': ['DEX'],
  '母语': ['EDU'],
  '驾驶': ['DEX'],
}

// Social skills for "一项社交技能" selection
export const SOCIAL_SKILLS = ['魅惑', '快速交谈', '恐吓', '说服', '心理学']

// Lorebook
export interface LorebookEntry {
  id: string
  lorebook_id: string
  keywords: string[]
  content: string
  trigger_mode: 'keyword' | 'always' | 'manual'
  search_range: 'all' | 'last_n' | 'user_input'
  search_n: number
  priority: number
  insert_position: 'before_char' | 'after_char' | 'before_chat'
  enabled: number
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface Lorebook {
  id: string
  name: string
  description: string
  created_at?: string
  updated_at?: string
  entries?: LorebookEntry[]
  entries_count?: number
}

export interface UserPersona {
  id: string
  name: string
  appearance: string
  background: string
  created_at?: string
  updated_at?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface DiceLogEntry {
  skill?: string
  roll: number
  target: number
  success: boolean
  level: string
  timestamp: number
}
