import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCharacter, listCharacters, deleteCharacter, updateCharacter } from '../api/client'
import { COC_OCCUPATIONS, COC_SKILL_LIST } from '../types'
import type { Character, Attributes } from '../types'

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

  const handleOccupationSelect = (occName: string) => {
    setOccupation(occName)
    const occ = COC_OCCUPATIONS.find(o => o.name === occName)
    if (occ) {
      const baseSkills: Record<string, number> = {}
      occ.skills.forEach(s => { baseSkills[s] = 0 })
      setSkills(baseSkills)
    }
    const edu = attrs.EDU
    const basePoints = edu * 4
    setJobSkillPoints(basePoints)
    const intPoints = attrs.INT * 2
    setInterestSkillPoints(intPoints)
  }

  const setJobSkill = (skillName: string, value: number) => {
    const newSkills = { ...skills, [skillName]: Math.max(0, Math.min(99, value)) }
    const totalSpent = Object.entries(newSkills).reduce((sum, [k, v]) => {
      return sum + v
    }, 0)
    if (totalSpent <= jobSkillPoints) {
      setSkills(newSkills)
    }
  }

  const handleSave = async () => {
    // Merge interest skills into the skills dict (default 20 each)
    const allSkills = { ...skills }
    interestSkills.filter(s => s).forEach(s => {
      if (!(s in allSkills)) allSkills[s] = 20
    })

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
      alert('保存失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个调查员吗？')) return
    try {
      await deleteCharacter(id)
      loadCharacters()
    } catch (err: any) { alert('删除失败: ' + err.message) }
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
                    <button onClick={() => handleDelete(c.id)} className="parchment-btn text-xs text-cthulhu-blood">删除</button>
                  </div>
                </div>
              </div>
            ))}
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
                <input type="number" value={attrs[name]}
                       onChange={e => setAttr(name, Number(e.target.value))}
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
            <input type="number" value={luck}
                   onChange={e => setLuck(Number(e.target.value))}
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
              职业技能: {occ.skills.join('、')} | 技能点: {jobSkillPoints} (EDU×4) | 兴趣技能点: {interestSkillPoints} (INT×2)
            </div>
          )}
        </div>

        {occupation && (
          <>
            <div className="parchment-card mb-4">
              <h3 className="font-display text-cthulhu-gold mb-2">职业技能</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(skills).map(([skillName, value]) => (
                  <div key={skillName} className="flex items-center gap-3">
                    <span className="text-sm text-parchment-300 w-28">{skillName}</span>
                    <input type="range" min={0} max={99} value={value}
                           onChange={e => setJobSkill(skillName, Number(e.target.value))}
                           className="flex-1 accent-cthulhu-gold" />
                    <input type="number" value={value}
                           onChange={e => setJobSkill(skillName, Number(e.target.value))}
                           className="parchment-input w-16 text-center text-xs" />
                  </div>
                ))}
              </div>
            </div>

            <div className="parchment-card mb-4">
              <h3 className="font-display text-cthulhu-gold mb-2">兴趣技能 (选择 3 个)</h3>
              <div className="space-y-2">
                {interestSkills.map((sk, idx) => (
                  <select key={idx} value={sk} onChange={e => {
                    const next = [...interestSkills]
                    next[idx] = e.target.value
                    setInterestSkills(next)
                  }} className="parchment-input">
                    <option value="">选择兴趣技能 {idx + 1}...</option>
                    {COC_SKILL_LIST.filter(s => !(s in skills) || s === sk).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ))}
              </div>
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
