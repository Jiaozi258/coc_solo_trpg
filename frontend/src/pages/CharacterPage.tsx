import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCharacter, listCharacters, deleteCharacter, updateCharacter } from '../api/client'
import { COC_OCCUPATIONS, COC_SKILL_LIST, COC_SKILL_BASE, COC_SKILL_ATTR_BASE, SOCIAL_SKILLS } from '../types'
import type { Character, Attributes } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'

const ATTR_NAMES = ['STR', 'CON', 'SIZ', 'DEX', 'INT', 'APP', 'POW', 'EDU'] as const
type AttrName = typeof ATTR_NAMES[number]

const DEFAULT_ATTRS: Record<AttrName, number> = {
  STR: 50, CON: 50, SIZ: 50, DEX: 50, INT: 50, APP: 50, POW: 50, EDU: 50,
}

export default function CharacterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'list' | 'attributes' | 'skills' | 'background'>('list')
  const [characters, setCharacters] = useState<Character[]>([])
  const [name, setName] = useState('')
  const [attrs, setAttrs] = useState<Record<AttrName, number>>({ ...DEFAULT_ATTRS })
  const [luck, setLuck] = useState(50)
  const [totalCap, setTotalCap] = useState(720)
  const [occupation, setOccupation] = useState('')
  const [skills, setSkills] = useState<Record<string, number>>({})
  const [interestSkills, setInterestSkills] = useState<string[]>(['', '', ''])
  const [bg, setBg] = useState({
    residence: '', history: '', beliefs: '', important_persons: '', appearance: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [jobSkillPoints, setJobSkillPoints] = useState(0)
  const [interestSkillPoints, setInterestSkillPoints] = useState(0)
  const [confirmState, setConfirmState] = useState<{ open: boolean; charId: string; charName: string }>({ open: false, charId: '', charName: '' })
  const [errorMsg, setErrorMsg] = useState('')

  const loadCharacters = async () => {
    try {
      const r = await listCharacters()
      setCharacters(r.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => { loadCharacters() }, [])

  const attrTotal = Object.values(attrs).reduce((s, v) => s + v, 0)
  const attrValid = attrTotal >= 120 && attrTotal <= totalCap

  const randomizeAttrs = () => {
    const next: Record<string, number> = {}
    let remaining = totalCap
    const shuffled = [...ATTR_NAMES].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      const name = shuffled[i]
      const isLast = i === shuffled.length - 1
      const maxForThis = Math.min(99, remaining - (shuffled.length - 1 - i) * 20)
      const minForThis = Math.max(20, remaining - (shuffled.length - 1 - i) * 99)
      const val = isLast
        ? Math.min(99, maxForThis)
        : Math.floor(Math.random() * (maxForThis - minForThis + 1)) + minForThis
      next[name] = Math.max(0, val)
      remaining -= next[name]
    }
    setAttrs(next as Record<AttrName, number>)
  }

  const setAttr = (name: AttrName, value: number) => {
    setAttrs({ ...attrs, [name]: Math.max(0, Math.min(99, value)) })
  }

  const [socialSkillChoice, setSocialSkillChoice] = useState('')
  const [interestSkillsAlloc, setInterestSkillsAlloc] = useState<Record<string, number>>({})

  // Compute base value for a skill given current attributes
  const getSkillBase = (skillName: string): number => {
    if (COC_SKILL_ATTR_BASE[skillName]) {
      const attrName = COC_SKILL_ATTR_BASE[skillName][0] as AttrName
      return attrs[attrName] ?? COC_SKILL_BASE[skillName] ?? 0
    }
    return COC_SKILL_BASE[skillName] ?? 0
  }

  const handleOccupationSelect = (occName: string) => {
    setOccupation(occName)
    setSocialSkillChoice('')
    const occ = COC_OCCUPATIONS.find(o => o.name === occName)
    if (occ) {
      const baseSkills: Record<string, number> = {}
      occ.skills.forEach(s => {
        if (s === '一项社交技能') {
          // Will be resolved when user picks the social skill
          baseSkills['__social_skill_placeholder__'] = 0
        } else {
          baseSkills[s] = getSkillBase(s)
        }
      })
      setSkills(baseSkills)
    }
    const edu = attrs.EDU
    setJobSkillPoints(edu * 4)
    const intPoints = attrs.INT * 2
    setInterestSkillPoints(intPoints)
    setInterestSkillsAlloc({})
  }

  // Compute total allocated to job skills (value - base)
  const jobPointsSpent = Object.entries(skills).reduce((sum, [k, v]) => {
    if (k === '__social_skill_placeholder__') return sum
    return sum + Math.max(0, v - getSkillBase(k))
  }, 0)
  const jobPointsRemaining = jobSkillPoints - jobPointsSpent

  const setJobSkill = (skillName: string, value: number) => {
    const clamped = Math.max(0, Math.min(99, value))
    const base = getSkillBase(skillName)
    const extra = Math.max(0, clamped - base)
    const oldExtra = Math.max(0, (skills[skillName] || 0) - base)
    const delta = extra - oldExtra

    if (delta > 0 && delta > jobPointsRemaining) return // not enough points

    const newSkills = { ...skills, [skillName]: clamped }
    setSkills(newSkills)
  }

  const resolveSkills = (): Record<string, number> => {
    const resolved: Record<string, number> = {}
    for (const [k, v] of Object.entries(skills)) {
      if (k === '__social_skill_placeholder__') {
        if (socialSkillChoice) {
          resolved[socialSkillChoice] = getSkillBase(socialSkillChoice) + v
        }
      } else {
        resolved[k] = v
      }
    }
    // Merge interest skills with allocations
    for (const [k, v] of Object.entries(interestSkillsAlloc)) {
      resolved[k] = getSkillBase(k) + v
    }
    return resolved
  }

  // Interest skill allocation
  const interestPointsSpent = Object.values(interestSkillsAlloc).reduce((s, v) => s + v, 0)
  const interestPointsRemaining = interestSkillPoints - interestPointsSpent

  const addInterestSkill = (skillName: string) => {
    if (!skillName || skillName in interestSkillsAlloc) return
    setInterestSkillsAlloc({ ...interestSkillsAlloc, [skillName]: 0 })
  }

  const setInterestSkillPoints2 = (skillName: string, points: number) => {
    const clamped = Math.max(0, Math.min(99 - getSkillBase(skillName), points))
    const old = interestSkillsAlloc[skillName] || 0
    const delta = clamped - old
    if (delta > 0 && delta > interestPointsRemaining) return
    setInterestSkillsAlloc({ ...interestSkillsAlloc, [skillName]: clamped })
  }

  const removeInterestSkill = (skillName: string) => {
    const next = { ...interestSkillsAlloc }
    delete next[skillName]
    setInterestSkillsAlloc(next)
  }

  const handleSave = async () => {
    const allSkills = resolveSkills()

    const data = {
      name,
      occupation,
      attributes: { ...attrs, LUCK: luck },
      skills: allSkills,
      background: bg,
      total_cap: totalCap,
    }
    try {
      if (editingId) {
        await updateCharacter(editingId, data)
      } else {
        await createCharacter(data)
      }
      setStep('list')
      setEditingId(null)
      loadCharacters()
    } catch (err: any) {
      setErrorMsg('保存失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCharacter(id)
      loadCharacters()
    } catch (err: any) { setErrorMsg('删除失败: ' + err.message) }
  }

  const startEdit = (char: Character) => {
    setEditingId(char.id)
    setName(char.name)
    setOccupation(char.occupation)
    const a = char.attributes
    setAttrs({ STR: a.STR, CON: a.CON, SIZ: a.SIZ, DEX: a.DEX, INT: a.INT, APP: a.APP, POW: a.POW, EDU: a.EDU })
    setLuck(a.LUCK)
    setSkills(char.skills || {})
    setBg(char.background || { residence: '', history: '', beliefs: '', important_persons: '', appearance: '' })
    // Recalculate skill point budgets from saved attributes
    setJobSkillPoints((a.EDU || 0) * 4)
    setInterestSkillPoints((a.INT || 0) * 2)
    // Restore interest skills from saved data (any skill with points above base that isn't an occupation skill)
    const occ = COC_OCCUPATIONS.find(o => o.name === char.occupation)
    const occSkills = occ ? occ.skills.filter(s => s !== '一项社交技能') : []
    const interestAlloc: Record<string, number> = {}
    if (char.skills) {
      for (const [k, v] of Object.entries(char.skills)) {
        if (!occSkills.includes(k)) {
          const base = COC_SKILL_BASE[k] ?? 0
          if (v > base) interestAlloc[k] = v - base
        }
      }
    }
    setInterestSkillsAlloc(interestAlloc)
    setSocialSkillChoice('')
    setStep('attributes')
  }

  // --- Character List View ---
  if (step === 'list') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-display text-cthulhu-gold horror-text">📋 调查员档案库</h2>
          <button onClick={() => {
            setEditingId(null)
            setName('')
            setAttrs({ ...DEFAULT_ATTRS })
            setLuck(50)
            setTotalCap(720)
            setOccupation('')
            setSkills({})
            setInterestSkills(['', '', ''])
            setBg({ residence: '', history: '', beliefs: '', important_persons: '', appearance: '' })
            setStep('attributes')
          }} className="parchment-btn">
            + 创建新调查员
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="parchment-card text-center py-12 text-parchment-500">
            暂无调查员。点击上方按钮创建你的第一位调查员。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {characters.map(c => (
              <div key={c.id} className="parchment-card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-lg text-cthulhu-gold">{c.name}</h3>
                    <p className="text-sm text-parchment-400">{c.occupation || '无职业'}</p>
                    <div className="mt-2 grid grid-cols-4 gap-1 text-xs text-parchment-500">
                      {ATTR_NAMES.map(a => (
                        <span key={a}>{a}: {c.attributes[a]}</span>
                      ))}
                      <span>LUCK: {c.attributes.LUCK}</span>
                    </div>
                    <div className="mt-1 text-xs">
                      <span className="text-cthulhu-blood">HP {c.derived_stats?.HP_current}/{c.derived_stats?.HP_max}</span>
                      {' '}
                      <span className="text-blue-400">SAN {c.derived_stats?.SAN_current}/{c.derived_stats?.SAN_max}</span>
                      {' '}
                      <span className="text-purple-400">MP {c.derived_stats?.MP_current}/{c.derived_stats?.MP_max}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(c)} className="parchment-btn text-xs">编辑</button>
                    <button onClick={() => setConfirmState({ open: true, charId: c.id, charName: c.name })} className="parchment-btn text-xs text-cthulhu-blood">删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <ConfirmDialog
          open={confirmState.open}
          title="删除调查员"
          message={`确定要删除「${confirmState.charName}」吗？此操作不可撤销。`}
          confirmLabel="删除"
          danger
          onConfirm={() => {
            handleDelete(confirmState.charId)
            setConfirmState({ open: false, charId: '', charName: '' })
          }}
          onCancel={() => setConfirmState({ open: false, charId: '', charName: '' })}
        />
        {errorMsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-xs mx-4 p-5 rounded space-y-4" style={{ background: 'var(--color-ash-black)', border: '1px solid rgba(154,42,42,0.4)' }}>
              <p className="text-sm text-ash-red font-mono text-center">{errorMsg}</p>
              <button onClick={() => setErrorMsg('')} className="ash-btn text-xs w-full">关闭</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- Step 1: Attributes ---
  if (step === 'attributes') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-display text-cthulhu-gold horror-text mb-6">
          {editingId ? '编辑调查员' : '步骤 1/3: 属性分配'}
        </h2>

        <div className="parchment-card mb-4 flex items-center gap-4 flex-wrap">
          <label className="text-sm text-parchment-400">总点数上限:</label>
          <input type="number" value={totalCap} onChange={e => setTotalCap(Number(e.target.value))}
                 className="parchment-input w-24" min={120} max={720} />
          <button onClick={randomizeAttrs} className="parchment-btn text-xs">🎲 随机分配</button>
          <span className={`text-sm ml-auto ${attrValid ? 'text-green-400' : 'text-cthulhu-blood'}`}>
            已用: {attrTotal} / {totalCap} {attrTotal < 120 ? '(最少 120)' : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {ATTR_NAMES.map(name => (
            <div key={name} className="parchment-card">
              <div className="flex justify-between items-center mb-1">
                <span className="font-display text-cthulhu-gold">{name}</span>
                <span className="text-xs text-parchment-500">
                  {attrs[name] < 20 ? '严重缺陷 (-20)' : attrs[name] < 45 ? '异于常人 (-10)' : ''}
                </span>
              </div>
              <input type="range" min={0} max={99} value={attrs[name]}
                     onChange={e => setAttr(name, Number(e.target.value))}
                     className="w-full accent-cthulhu-gold" />
              <div className="flex justify-center mt-1">
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={attrs[name]}
                       onChange={e => {
                         const raw = e.target.value.replace(/\D/g, '')
                         setAttr(name, raw === '' ? 0 : Number(raw))
                       }}
                       className="parchment-input w-20 text-center" />
              </div>
            </div>
          ))}
        </div>

        <div className="parchment-card mt-4">
          <div className="flex items-center gap-4">
            <span className="font-display text-cthulhu-gold">LUCK</span>
            <input type="range" min={0} max={99} value={luck}
                   onChange={e => setLuck(Number(e.target.value))}
                   className="flex-1 accent-cthulhu-gold" />
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={luck}
                   onChange={e => {
                     const raw = e.target.value.replace(/\D/g, '')
                     setLuck(raw === '' ? 0 : Number(raw))
                   }}
                   className="parchment-input w-20 text-center" />
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep('list')} className="parchment-btn">返回</button>
          <button onClick={() => setStep('skills')} disabled={!attrValid} className="parchment-btn">
            下一步: 职业与技能
          </button>
        </div>
      </div>
    )
  }

  // --- Step 2: Skills ---
  if (step === 'skills') {
    const occ = COC_OCCUPATIONS.find(o => o.name === occupation)
    const hasSocialPlaceholder = '__social_skill_placeholder__' in skills

    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-display text-cthulhu-gold horror-text mb-6">步骤 2/3: 职业与技能</h2>

        <div className="parchment-card mb-4">
          <label className="text-sm text-parchment-400">姓名</label>
          <input value={name} onChange={e => setName(e.target.value)} className="parchment-input mt-1" placeholder="调查员姓名" />
        </div>

        <div className="parchment-card mb-4">
          <label className="text-sm text-parchment-400">职业</label>
          <select value={occupation} onChange={e => handleOccupationSelect(e.target.value)} className="parchment-input mt-1">
            <option value="">选择职业...</option>
            {COC_OCCUPATIONS.map(o => (
              <option key={o.name} value={o.name}>{o.name} (信用评级 {o.credit_rating[0]}-{o.credit_rating[1]})</option>
            ))}
          </select>
          {occ && (
            <div className="mt-2 text-xs text-parchment-400">
              职业技能: {occ.skills.map(s => s === '一项社交技能' ? (socialSkillChoice || '未选择社交技能') : s).join('、')}
            </div>
          )}
        </div>

        {occupation && (
          <>
            {/* Skill points summary */}
            <div className="parchment-card mb-4">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-parchment-400">职业技能点:</span>{' '}
                  <span className="text-cthulhu-gold font-bold">{jobPointsRemaining}</span>
                  <span className="text-parchment-500"> / {jobSkillPoints} (EDU×4)</span>
                  {jobPointsRemaining < 0 && <span className="text-red-400 ml-1">超额!</span>}
                </div>
                <div>
                  <span className="text-parchment-400">兴趣技能点:</span>{' '}
                  <span className="text-cthulhu-gold font-bold">{interestPointsRemaining}</span>
                  <span className="text-parchment-500"> / {interestSkillPoints} (INT×2)</span>
                </div>
              </div>
            </div>

            {/* Social skill selector */}
            {hasSocialPlaceholder && (
              <div className="parchment-card mb-4">
                <label className="text-sm text-parchment-400 mb-1 block">一项社交技能 — 请选择</label>
                <select
                  value={socialSkillChoice}
                  onChange={e => setSocialSkillChoice(e.target.value)}
                  className="parchment-input w-full"
                >
                  <option value="">选择一项社交技能...</option>
                  {SOCIAL_SKILLS.map(s => (
                    <option key={s} value={s}>
                      {s} (基础值: {getSkillBase(s)}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Job skills */}
            <div className="parchment-card mb-4">
              <h3 className="font-display text-cthulhu-gold mb-2">职业技能</h3>
              <p className="text-xs text-parchment-500 mb-3">
                每个技能显示为 基础值 + 分配点数。职业技能点只能加到职业技能上。
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(skills).map(([skillName, value]) => {
                  if (skillName === '__social_skill_placeholder__') return null
                  const base = getSkillBase(skillName)
                  const extra = Math.max(0, value - base)
                  return (
                    <div key={skillName} className="flex items-center gap-3">
                      <span className="text-sm text-parchment-300 w-28 truncate" title={skillName}>
                        {skillName}
                      </span>
                      <span className="text-[0.6rem] text-parchment-500 w-8 text-right">{base}%</span>
                      <span className="text-[0.6rem] text-cthulhu-gold">+{extra}</span>
                      <input type="range" min={base} max={99} value={value}
                             onChange={e => setJobSkill(skillName, Number(e.target.value))}
                             className="flex-1 accent-cthulhu-gold" />
                      <input type="number" value={value}
                             onChange={e => setJobSkill(skillName, Number(e.target.value))}
                             className="parchment-input w-16 text-center text-xs" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Interest skills */}
            <div className="parchment-card mb-4">
              <h3 className="font-display text-cthulhu-gold mb-2">
                兴趣技能
                <span className="text-xs text-parchment-400 ml-2">
                  (剩余点数: {interestPointsRemaining})
                </span>
              </h3>
              <p className="text-xs text-parchment-500 mb-3">
                选择技能后分配点数，每个技能获得 基础值 + 分配点数。
              </p>

              {/* Add interest skill */}
              <div className="mb-3">
                <select
                  value=""
                  onChange={e => addInterestSkill(e.target.value)}
                  className="parchment-input w-full"
                >
                  <option value="">+ 添加兴趣技能...</option>
                  {COC_SKILL_LIST.filter(s => !(s in skills) && !(s in interestSkillsAlloc)).map(s => (
                    <option key={s} value={s}>
                      {s} (基础: {getSkillBase(s)}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* Interest skill allocators */}
              {Object.keys(interestSkillsAlloc).length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(interestSkillsAlloc).map(([skillName, points]) => {
                    const base = getSkillBase(skillName)
                    return (
                      <div key={skillName} className="flex items-center gap-3">
                        <button
                          onClick={() => removeInterestSkill(skillName)}
                          className="text-xs text-ash-red hover:text-ash-red-bright w-5"
                          title="移除"
                        >
                          ×
                        </button>
                        <span className="text-sm text-parchment-300 w-24 truncate" title={skillName}>
                          {skillName}
                        </span>
                        <span className="text-[0.6rem] text-parchment-500 w-8 text-right">{base}%</span>
                        <span className="text-[0.6rem] text-blue-400">+{points}</span>
                        <input type="range" min={0} max={Math.min(99 - base, points + interestPointsRemaining)} value={points}
                               onChange={e => setInterestSkillPoints2(skillName, Number(e.target.value))}
                               className="flex-1 accent-blue-400" />
                        <input type="number" value={points}
                               onChange={e => setInterestSkillPoints2(skillName, Number(e.target.value))}
                               className="parchment-input w-16 text-center text-xs" />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep('attributes')} className="parchment-btn">上一步</button>
          <button onClick={() => setStep('background')} disabled={!name || !occupation} className="parchment-btn">
            下一步: 背景故事
          </button>
        </div>
      </div>
    )
  }

  // --- Step 3: Background ---
  if (step === 'background') {
    const fields = [
      { key: 'residence', label: '居住地' },
      { key: 'history', label: '背景/经历' },
      { key: 'beliefs', label: '信念/理念' },
      { key: 'important_persons', label: '重要之人/地点/物品' },
      { key: 'appearance', label: '外貌特征/性格' },
    ]
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-display text-cthulhu-gold horror-text mb-6">步骤 3/3: 背景故事</h2>

        <div className="space-y-4">
          {fields.map(({ key, label }) => (
            <div key={key} className="parchment-card">
              <label className="text-sm text-parchment-400 mb-1 block">{label}</label>
              <textarea
                value={bg[key as keyof typeof bg]}
                onChange={e => setBg({ ...bg, [key]: e.target.value })}
                className="parchment-input h-24 resize-none"
                placeholder={`输入${label}...`}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep('skills')} className="parchment-btn">上一步</button>
          <button onClick={handleSave} disabled={!name} className="parchment-btn bg-cthulhu-gold/20">
            {editingId ? '保存修改' : '完成车卡'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
