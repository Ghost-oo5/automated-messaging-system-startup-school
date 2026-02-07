import { useState, useEffect } from "react"
import "./style.css"
import type { AutomationSettings } from "~/types"
import { getAutomationSettings, saveAutomationSettings, clearAllData } from "~/utils/storage"
import { initializeOpenAI } from "~/services/openai"
import { OPENAI_MODELS } from "~/utils/constants"

function IndexOptions() {
  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [senderNameInput, setSenderNameInput] = useState("")
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    getAutomationSettings().then((s) => {
      setSettings(s)
      setApiKeyInput(s.openaiApiKey || "")
      setSenderNameInput(s.senderName || "")
    })
  }, [])

  const handleSave = async () => {
    if (!settings) return
    const updated = {
      ...settings,
      openaiApiKey: apiKeyInput.trim(),
      senderName: senderNameInput.trim()
    }
    await saveAutomationSettings(updated)
    if (updated.openaiApiKey) initializeOpenAI(updated.openaiApiKey)
    setSaveStatus("Settings saved successfully")
    setTimeout(() => setSaveStatus(null), 3000)
  }

  const handleReset = async () => {
    if (!confirm("Are you sure?")) return
    setIsResetting(true)
    await clearAllData()
    window.location.reload()
  }

  if (!settings) return null

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans text-slate-900">
      <div className="max-w-2xl w-full space-y-8">
        <header className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-800">Extension Configuration</h1>
            <p className="text-slate-500 font-medium">Manage your messaging orchestration and AI parameters</p>
          </div>
        </header>

        <main className="grid grid-cols-1 gap-6">
          <section className="card p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">OpenAI API Key</label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="input-field py-3 text-lg"
                placeholder="sk-..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Sign-off Identity</label>
              <input
                type="text"
                value={senderNameInput}
                onChange={(e) => setSenderNameInput(e.target.value)}
                className="input-field py-3 text-lg"
                placeholder="Jane Doe"
              />
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={handleSave}
                className="btn-primary px-8 py-3 text-lg shadow-indigo-200">
                Save All Settings
              </button>
              {saveStatus && <span className="text-emerald-600 font-bold animate-in fade-in">{saveStatus}</span>}
            </div>
          </section>

          <section className="card p-8 bg-rose-50/20 border-rose-100">
            <h2 className="text-sm font-black text-rose-700 uppercase tracking-tight mb-2">Danger Zone</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">Permanently clear all cached profiles, message history, and server credentials.</p>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="bg-rose-600 text-white px-6 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all active:scale-95 disabled:opacity-50">
              {isResetting ? 'Wiping...' : 'Factory Reset Extension'}
            </button>
          </section>
        </main>

        <footer className="text-center pt-12 pb-8">
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">Automated Messaging System v0.0.1</p>
        </footer>
      </div>
    </div>
  )
}

export default IndexOptions
