import { useState, useEffect } from "react"
import "./style.css"
import type {
  AutomationSettings,
  FilterSettings,
  CustomerProfile,
  MessageStats,
  MessageHistory
} from "~/types"
import {
  getAutomationSettings,
  saveAutomationSettings,
  getFilterSettings,
  saveFilterSettings,
  getProfiles,
  getMessageHistory,
  getMessageStats,
  clearAllData
} from "~/utils/storage"
import { initializeOpenAI } from "~/services/openai"
import { MessageDeliveryService } from "~/services/messageDelivery"
import { filterProfiles } from "~/utils/filter"
import { COUNTRIES, AGE_GROUPS, INTERESTS, OPENAI_MODELS } from "~/utils/constants"
import { serializeProfile } from "~/utils/serialization"
import { createPortal } from "react-dom"

type Tab = "dashboard" | "profiles" | "messages" | "settings"

function formatDateTime(value: Date | string | number | null | undefined) {
  const d = value instanceof Date ? value : value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return "Never"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d)
}

function IndexPopup() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard")
  const [automationSettings, setAutomationSettings] = useState<AutomationSettings | null>(null)
  const [filterSettings, setFilterSettings] = useState<FilterSettings | null>(null)
  const [profiles, setProfiles] = useState<CustomerProfile[]>([])
  const [filteredProfiles, setFilteredProfiles] = useState<CustomerProfile[]>([])
  const [stats, setStats] = useState<MessageStats | null>(null)
  const [messageDelivery, setMessageDelivery] = useState<MessageDeliveryService | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [senderNameInput, setSenderNameInput] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [resetStatus, setResetStatus] = useState<string | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [collectionStatus, setCollectionStatus] = useState<{ type: 'ok' | 'err' | 'info', msg: string } | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<{ type: 'ok' | 'err' | 'info', msg: string } | null>(null)
  const [messageHistory, setMessageHistory] = useState<MessageHistory[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [modalProfile, setModalProfile] = useState<CustomerProfile | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    loadData()

    // Watch for storage changes to keep stats synced
    const listener = (changes: any, area: string) => {
      if (area === "local" && changes.messageStats) {
        setStats(changes.messageStats.newValue)
      }
      if (area === "local" && changes.messageHistory) {
        setMessageHistory(changes.messageHistory.newValue)
      }
      if (area === "local" && changes.profiles) {
        setProfiles(changes.profiles.newValue)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  useEffect(() => {
    if (activeTab === "messages") {
      getMessageHistory().then(setMessageHistory)
    }
  }, [activeTab])

  useEffect(() => {
    if (automationSettings && filterSettings) {
      const service = new MessageDeliveryService(automationSettings)
      setMessageDelivery(service)
    }
  }, [automationSettings])

  useEffect(() => {
    if (profiles.length > 0 && filterSettings) {
      const filtered = filterProfiles(profiles, filterSettings)
      setFilteredProfiles(filtered)
    } else {
      setFilteredProfiles(profiles)
    }
  }, [profiles, filterSettings])

  async function loadData() {
    const [settings, filters, profileList, history, currentStats] = await Promise.all([
      getAutomationSettings(),
      getFilterSettings(),
      getProfiles(),
      getMessageHistory(),
      getMessageStats()
    ])
    setAutomationSettings(settings)
    setFilterSettings(filters)
    setProfiles(profileList)
    setMessageHistory(history)
    setStats(currentStats)
    setApiKeyInput(settings.openaiApiKey || "")
    setSenderNameInput(settings.senderName || "")
  }

  async function handleToggleAutomation() {
    if (!automationSettings) return
    const updated = { ...automationSettings, enabled: !automationSettings.enabled }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (updated.enabled && updated.openaiApiKey) {
      initializeOpenAI(updated.openaiApiKey)
    }
  }

  async function handleSaveApiKey() {
    if (!automationSettings) return
    const trimmedKey = apiKeyInput.trim()
    const trimmedName = senderNameInput.trim()
    const updated = { ...automationSettings, openaiApiKey: trimmedKey, senderName: trimmedName }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (trimmedKey) initializeOpenAI(trimmedKey)
    setSaveStatus("Settings updated successfully")
    setTimeout(() => setSaveStatus(null), 3000)
  }

  async function handleUpdateRateLimit(field: string, value: number) {
    if (!automationSettings) return
    const updated = {
      ...automationSettings,
      rateLimit: { ...automationSettings.rateLimit, [field]: value }
    }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (messageDelivery) messageDelivery.updateSettings(updated)
  }

  async function handleModelChange(model: string) {
    if (!automationSettings) return
    const updated = { ...automationSettings, openaiModel: model }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (messageDelivery) messageDelivery.updateSettings(updated)
  }

  async function handleResetExtension() {
    if (!confirm("Are you sure you want to reset all data? This cannot be undone.")) return
    setIsResetting(true)
    try {
      await clearAllData()
      await loadData()
      setResetStatus("Extension data reset complete")
    } catch (error) {
      setResetStatus("Error resetting data")
    } finally {
      setTimeout(() => setResetStatus(null), 3000)
      setIsResetting(false)
    }
  }

  async function handleCollectCurrentProfile() {
    setIsCollecting(true)
    setCollectionStatus({ type: 'info', msg: "Extracting profile..." })
    try {
      const response = await chrome.runtime.sendMessage({ action: "extractCurrentProfile" })
      if (response && response.success && response.profile) {
        setCollectionStatus({ type: 'ok', msg: `Collected: ${response.profile.name}` })
        await loadData()
      } else {
        setCollectionStatus({ type: 'err', msg: response?.error || "Failed to collect profile" })
      }
    } catch (error) {
      setCollectionStatus({ type: 'err', msg: "Connection error" })
    } finally {
      setIsCollecting(false)
      setTimeout(() => setCollectionStatus(null), 4000)
    }
  }

  async function handleExtractProfileUrls() {
    setIsCollecting(true)
    setCollectionStatus({ type: 'info', msg: "Searching for profiles..." })
    try {
      const response = await chrome.runtime.sendMessage({ action: "extractProfileUrls" })
      if (response.success && response.urls) {
        setCollectionStatus({ type: 'ok', msg: `Found ${response.urls.length} profile links` })
      } else {
        setCollectionStatus({ type: 'err', msg: "No profiles found" })
      }
    } catch (error) {
      setCollectionStatus({ type: 'err', msg: "Error searching" })
    } finally {
      setIsCollecting(false)
      setTimeout(() => setCollectionStatus(null), 4000)
    }
  }

  async function handleGenerateDraft(profile: CustomerProfile) {
    if (!automationSettings?.openaiApiKey) {
      setSendStatus({ type: 'err', msg: "Set OpenAI API key first" })
      return
    }
    setModalProfile(profile)
    setIsModalOpen(true)
    setIsGenerating(true)
    setDraftMessage(null)
    setSendStatus({ type: 'info', msg: "Generating draft..." })

    try {
      const response = await chrome.runtime.sendMessage({
        action: "generateDraft",
        profile: serializeProfile(profile)
      })
      if (response.success) {
        setDraftMessage(response.message)
        setSendStatus(null)
      } else {
        setSendStatus({ type: 'err', msg: response.error || "Failed to generate draft" })
      }
    } catch (error) {
      setSendStatus({ type: 'err', msg: "Connection error" })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSendTestMessage(profile?: CustomerProfile, overrideMessage?: string) {
    if (!automationSettings?.openaiApiKey) {
      setSendStatus({ type: 'err', msg: "Set OpenAI API key first" })
      return
    }
    const targetProfile = profile || filteredProfiles[0]
    if (!targetProfile) {
      setSendStatus({ type: 'err', msg: "No profile selected" })
      return
    }
    setIsSending(true)
    setSendStatus({ type: 'info', msg: overrideMessage ? "Sending..." : "Generating & Sending..." })
    try {
      const response = await chrome.runtime.sendMessage({
        action: "sendTestMessage",
        profile: serializeProfile(targetProfile),
        message: overrideMessage
      })
      if (response.success) {
        setSendStatus({ type: 'ok', msg: `Sent to ${targetProfile.name}` })
        await loadData()
        if (isModalOpen) {
          setTimeout(() => setIsModalOpen(false), 1500)
        }
      } else {
        setSendStatus({ type: 'err', msg: response.error || "Failed to send" })
      }
    } catch (error) {
      setSendStatus({ type: 'err', msg: "Network error" })
    } finally {
      setIsSending(false)
      if (!isModalOpen) {
        setTimeout(() => setSendStatus(null), 5000)
      }
    }
  }

  async function handleFilterChange(field: keyof FilterSettings, value: any) {
    if (!filterSettings) return
    const updated = { ...filterSettings, [field]: value }
    setFilterSettings(updated)
    await saveFilterSettings(updated)
  }

  if (!automationSettings || !filterSettings) {
    return (
      <div className="w-[600px] h-[700px] flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Initializing...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[600px] h-[700px] flex flex-col bg-slate-50 text-slate-900 shadow-2xl overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">Messenger</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none">Automation Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className={`text-[10px] uppercase font-black ${automationSettings.enabled ? 'text-emerald-500' : 'text-slate-300'}`}>
              {automationSettings.enabled ? 'System Live' : 'Paused'}
            </span>
          </div>
          <button
            onClick={handleToggleAutomation}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-2 focus:ring-2 focus:ring-indigo-500 ${automationSettings.enabled ? "bg-indigo-600" : "bg-slate-300"
              }`}>
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${automationSettings.enabled ? "translate-x-6" : "translate-x-1"
                }`}
            />
          </button>
        </div>
      </header>

      {/* Tabs / Navigation */}
      <nav className="bg-white px-6 py-2 border-b border-slate-200 overflow-x-auto scrollbar-hide flex gap-1 z-10">
        {(["dashboard", "profiles", "messages", "settings"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all capitalize ${activeTab === tab
              ? "bg-slate-100 text-indigo-600 shadow-inner"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}>
            {tab}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === "dashboard" && (
            <DashboardTab
              stats={stats}
              automationSettings={automationSettings}
              filteredProfiles={filteredProfiles}
              totalProfiles={profiles.length}
              isCollecting={isCollecting}
              collectionStatus={collectionStatus}
              isSending={isSending}
              isGenerating={isGenerating}
              sendStatus={sendStatus}
              onCollectCurrentProfile={handleCollectCurrentProfile}
              onExtractProfileUrls={handleExtractProfileUrls}
              onSendTestMessage={() => {
                if (filteredProfiles[0]) {
                  handleGenerateDraft(filteredProfiles[0])
                } else {
                  setSendStatus({ type: 'err', msg: "No profiles available" })
                }
              }}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              automationSettings={automationSettings}
              apiKeyInput={apiKeyInput}
              senderNameInput={senderNameInput}
              showApiKey={showApiKey}
              saveStatus={saveStatus}
              resetStatus={resetStatus}
              onApiKeyChange={setApiKeyInput}
              onSenderNameChange={setSenderNameInput}
              onShowApiKeyChange={setShowApiKey}
              onSaveApiKey={handleSaveApiKey}
              onResetExtension={handleResetExtension}
              isResetting={isResetting}
              onRateLimitChange={handleUpdateRateLimit}
              onModelChange={handleModelChange}
            />
          )}

          {activeTab === "profiles" && (
            <ProfilesTab
              profiles={filteredProfiles}
              isSending={isSending}
              isGenerating={isGenerating}
              sendStatus={sendStatus}
              onSendMessage={handleGenerateDraft}
              onSelectProfile={(profile) => {
                setModalProfile(profile)
                setIsModalOpen(true)
                setDraftMessage(null)
              }}
              onViewMessages={(profileId) => {
                setSelectedProfileId(profileId)
                setActiveTab("messages")
              }}
              filterSettings={filterSettings}
              onFilterChange={handleFilterChange}
            />
          )}

          {activeTab === "messages" && (
            <MessagesTab
              messageHistory={messageHistory}
              selectedProfileId={selectedProfileId}
              onProfileSelect={setSelectedProfileId}
              profiles={profiles}
            />
          )}
        </div>
      </main>

      {/* Modal / Portal */}
      {isModalOpen && modalProfile &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/20 max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{modalProfile.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {modalProfile.country || "Unknown Location"} {modalProfile.age ? `• ${modalProfile.age} yrs` : ''}
                  </p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {modalProfile.profileUrl && (
                  <a href={modalProfile.profileUrl} target="_blank" className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-bold hover:underline">
                    View Startup School Profile
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Last Messaged</p>
                    <p className="text-sm font-semibold text-slate-700">{formatDateTime(modalProfile.lastMessageSent)}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] uppercase font-black text-slate-400 mb-1">Total Messages</p>
                    <p className="text-sm font-semibold text-slate-700">{modalProfile.messageCount ?? 0}</p>
                  </div>
                </div>

                {modalProfile.interests && modalProfile.interests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-black text-slate-400">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {modalProfile.interests.map((interest, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded-full border border-indigo-100">
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {modalProfile.bio && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-black text-slate-400">Bio / About</p>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600 leading-relaxed max-h-48 overflow-y-auto italic">
                      {modalProfile.bio}
                    </div>
                  </div>
                )}

                {/* Draft Message Editor */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] uppercase font-black text-slate-400">Personalized Message</p>
                    {isGenerating && (
                      <span className="flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold animate-pulse">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        AI is writing...
                      </span>
                    )}
                  </div>

                  {draftMessage !== null ? (
                    <textarea
                      value={draftMessage}
                      onChange={(e) => setDraftMessage(e.target.value)}
                      className="w-full h-40 p-4 bg-white border-2 border-indigo-100 rounded-xl text-sm text-slate-700 leading-relaxed focus:border-indigo-500 focus:ring-0 transition-all scrollbar-hide resize-none shadow-inner"
                      placeholder="Write your message here..."
                    />
                  ) : !isGenerating && (
                    <div className="h-40 flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                      <p className="text-xs text-slate-400 font-medium mb-3">No draft generated yet.</p>
                      <button
                        onClick={() => handleGenerateDraft(modalProfile)}
                        className="text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-all">
                        Generate with AI
                      </button>
                    </div>
                  )}

                  {isGenerating && (
                    <div className="h-40 flex items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                {draftMessage ? (
                  <button
                    onClick={() => handleSendTestMessage(modalProfile, draftMessage)}
                    disabled={isSending}
                    className="flex-1 btn-primary py-3 flex items-center justify-center gap-2">
                    {isSending && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Confirm & Send
                  </button>
                ) : (
                  <button
                    onClick={() => handleGenerateDraft(modalProfile)}
                    disabled={isGenerating}
                    className="flex-1 btn-primary py-3">
                    Generate Draft
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedProfileId(modalProfile.id)
                    setActiveTab("messages")
                    setIsModalOpen(false)
                  }}
                  className="px-6 btn-secondary py-3">
                  History
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function DashboardTab({
  stats,
  automationSettings,
  filteredProfiles,
  totalProfiles,
  isCollecting,
  collectionStatus,
  isSending,
  isGenerating,
  sendStatus,
  onCollectCurrentProfile,
  onExtractProfileUrls,
  onSendTestMessage
}: {
  stats: MessageStats | null
  automationSettings: AutomationSettings
  filteredProfiles: CustomerProfile[]
  totalProfiles: number
  isCollecting: boolean
  collectionStatus: any
  isSending: boolean
  isGenerating: boolean
  sendStatus: any
  onCollectCurrentProfile: () => void
  onExtractProfileUrls: () => void
  onSendTestMessage: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Total Messages', value: stats?.totalSent || 0, color: 'indigo', icon: <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /> },
          { label: 'Sent Today', value: stats?.messagesToday || 0, color: 'emerald', icon: <path d="M13 10V3L4 14h7v7l9-11h-7z" /> },
          { label: 'Sent This Hour', value: stats?.messagesThisHour || 0, color: 'blue', icon: <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          { label: 'Failures', value: stats?.totalFailed || 0, color: 'rose', icon: <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> },
        ].map((item) => (
          <div key={item.label} className="card p-4 flex flex-col justify-between h-28 relative group hover:border-indigo-200 transition-colors">
            <div className={`p-1.5 rounded-lg w-fit mb-2 ${item.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
              item.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                item.color === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
              }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{item.label}</p>
              <p className="text-2xl font-black text-slate-800">{item.value}</p>
            </div>
            <div className={`absolute top-0 right-0 w-1 h-full bg-${item.color}-500/10`} />
          </div>
        ))}
      </div>

      {/* Collection Actions */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
          Extraction Tools
        </h3>

        {collectionStatus && (
          <div className={`p-3 rounded-xl text-xs font-bold animate-in zoom-in-95 ${collectionStatus.type === 'ok' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
            collectionStatus.type === 'err' ? "bg-rose-50 text-rose-700 border border-rose-100" :
              "bg-blue-50 text-blue-700 border border-blue-100"
            }`}>
            {collectionStatus.msg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={onCollectCurrentProfile}
            disabled={isCollecting}
            className="btn-primary py-3 flex items-center justify-center gap-2">
            {isCollecting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Extract Profile from Active Tab
          </button>
          <button
            onClick={onExtractProfileUrls}
            disabled={isCollecting}
            className="btn-secondary py-3 flex items-center justify-center gap-2">
            Scan Page for Profile Links
          </button>
        </div>
        <p className="text-[10px] text-slate-400 font-medium text-center">
          Optimal for YC Startup School matching pages and directory views.
        </p>
      </div>

      {/* Automation Quick Controls */}
      <div className="card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Messaging Test</h3>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-black px-2 py-0.5 rounded-full uppercase">
            {filteredProfiles.length} Available
          </span>
        </div>

        {sendStatus && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-bold animate-in slide-in-from-top-1 ${sendStatus.type === 'ok' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
            }`}>
            {sendStatus.msg}
          </div>
        )}

        <button
          onClick={onSendTestMessage}
          disabled={isSending || isGenerating || filteredProfiles.length === 0 || !automationSettings.openaiApiKey}
          className="w-full btn-primary bg-slate-800 hover:bg-slate-900 border-none py-3 shadow-lg shadow-slate-200">
          {isSending || isGenerating ? "Processing..." : "Trigger Selective Automation"}
        </button>
      </div>
    </div>
  )
}

function ProfilesTab({
  profiles,
  isSending,
  isGenerating,
  sendStatus,
  onSendMessage,
  onSelectProfile,
  onViewMessages,
  filterSettings,
  onFilterChange
}: {
  profiles: CustomerProfile[]
  isSending: boolean
  isGenerating: boolean
  sendStatus: any
  onSendMessage: (profile: CustomerProfile) => void
  onSelectProfile: (profile: CustomerProfile) => void
  onViewMessages: (profileId: string) => void
  filterSettings: FilterSettings
  onFilterChange: (field: keyof FilterSettings, value: any) => void
}) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div className="flex flex-col h-full gap-4 relative">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
          Target Profiles <span className="text-slate-400 font-medium lowercase ml-1">({profiles.length})</span>
        </h3>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 ${showFilters ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          {showFilters ? 'Applying Filters' : 'Filter List'}
        </button>
      </div>

      {/* Filters Overlay Sidebar */}
      {showFilters && (
        <div className="w-64 bg-white border-r border-slate-200 shadow-2xl h-full absolute z-40 -left-6 -top-2 p-6 animate-in slide-in-from-left duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Global Filters</h3>
            <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="space-y-6">
            {[
              { title: 'Geography', key: 'countries', options: COUNTRIES },
              { title: 'Experience Level', key: 'ageGroups', options: AGE_GROUPS },
              { title: 'Domains', key: 'interests', options: INTERESTS }
            ].map((section) => (
              <div key={section.key}>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{section.title}</h4>
                <div className="space-y-2 max-h-32 overflow-y-auto pr-2 scrollbar-hide">
                  {section.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={(filterSettings as any)[section.key]?.includes(opt) || false}
                        onChange={(e) => {
                          const current = (filterSettings as any)[section.key] || []
                          const updated = e.target.checked ? [...current, opt] : current.filter((c: any) => c !== opt)
                          onFilterChange(section.key as any, updated)
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                      />
                      <span className="text-xs text-slate-600 group-hover:text-slate-900 font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <button
              onClick={() => setShowFilters(false)}
              className="w-full btn-primary py-2.5 shadow-indigo-100">
              Update Results
            </button>
          </div>
        </div>
      )}

      {sendStatus && (
        <div className={`p-3 rounded-xl text-xs font-bold ${sendStatus.type === 'ok' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
          }`}>
          {sendStatus.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 p-6 text-center">
            <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">No profiles matched</h4>
            <p className="text-xs text-slate-500 font-medium">Try loosening your filters or trigger a fresh extraction.</p>
          </div>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-center justify-between hover:border-indigo-300 transition-all group">
              <button
                onClick={() => onSelectProfile(profile)}
                className="text-left flex-1 min-w-0 pr-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{profile.name}</h4>
                  {profile.messageCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase rounded border border-indigo-100">
                      {profile.messageCount} msg
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                  {profile.country || "Remote"} • {profile.interests?.slice(0, 1).join("") || "Generalist"}
                </p>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => onViewMessages(profile.id)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                  title="History">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
                <button
                  onClick={() => onSendMessage(profile)}
                  disabled={isSending || isGenerating}
                  className="btn-primary py-2 px-4 shadow-indigo-100 flex items-center gap-2">
                  {isGenerating ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Draft'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function MessagesTab({
  messageHistory,
  selectedProfileId,
  onProfileSelect,
  profiles
}: {
  messageHistory: MessageHistory[]
  selectedProfileId: string | null
  onProfileSelect: (profileId: string | null) => void
  profiles: CustomerProfile[]
}) {
  const filteredHistory = selectedProfileId
    ? messageHistory.filter((h) => h.profileId === selectedProfileId)
    : messageHistory

  return (
    <div className="space-y-6">
      {/* Profile Selector */}
      <div className="space-y-3">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Activity Log</h3>
        <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => onProfileSelect(null)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border whitespace-nowrap ${selectedProfileId === null ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}>
            All Global Events
          </button>
          {profiles.filter(p => p.messageCount > 0).slice(0, 8).map((profile) => (
            <button
              key={profile.id}
              onClick={() => onProfileSelect(profile.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border whitespace-nowrap ${selectedProfileId === profile.id ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}>
              {profile.name}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
            <p className="text-sm font-bold text-slate-800">No sent history</p>
            <p className="text-[11px] text-slate-400 font-medium">Trigger an automation to populate this list.</p>
          </div>
        ) : (
          filteredHistory.map((msg) => (
            <div key={msg.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-indigo-200 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${msg.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {msg.profileName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight">{msg.profileName}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{formatDateTime(msg.sentAt)}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${msg.success ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                  {msg.success ? 'Success' : 'Failed'}
                </span>
              </div>

              <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                <p className="text-xs text-slate-600 italic leading-relaxed whitespace-pre-wrap">
                  {msg.message || "(Empty response payload)"}
                </p>
              </div>

              {(msg.error || msg.openaiModel) && (
                <div className="mt-4 flex justify-between items-center text-[9px] font-black uppercase tracking-widest px-1">
                  {msg.error && <span className="text-rose-500">Error: {msg.error}</span>}
                  {msg.openaiModel && <span className="text-slate-300 ml-auto">{msg.openaiModel}</span>}
                </div>
              )}
            </div>
          )).reverse()
        )}
      </div>
    </div>
  )
}

function SettingsTab({
  automationSettings,
  apiKeyInput,
  senderNameInput,
  showApiKey,
  saveStatus,
  resetStatus,
  isResetting,
  onApiKeyChange,
  onSenderNameChange,
  onShowApiKeyChange,
  onSaveApiKey,
  onResetExtension,
  onRateLimitChange,
  onModelChange
}: {
  automationSettings: AutomationSettings
  apiKeyInput: string
  senderNameInput: string
  showApiKey: boolean
  saveStatus: string | null
  resetStatus: string | null
  isResetting: boolean
  onApiKeyChange: (value: string) => void
  onSenderNameChange: (value: string) => void
  onShowApiKeyChange: (value: boolean) => void
  onSaveApiKey: () => void
  onResetExtension: () => void
  onRateLimitChange: (field: string, value: number) => void
  onModelChange: (model: string) => void
}) {
  return (
    <div className="space-y-6 pb-12">
      {/* OpenAI API Key */}
      <section className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          API Credentials
        </h3>
        <div className="card p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">OpenAI Secret Key</label>
            <div className="relative group">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-..."
                className="input-field py-3 pr-16"
              />
              <button
                onClick={() => onShowApiKeyChange(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 tracking-tighter bg-indigo-50 px-2 py-1 rounded">
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium pl-1 italic">Saved locally. We never transmit your key elsewhere.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">Sender Profile Identity</label>
            <input
              type="text"
              value={senderNameInput}
              onChange={(e) => onSenderNameChange(e.target.value)}
              placeholder="Full name for signatures..."
              className="input-field py-3"
            />
          </div>

          <div className="space-y-4 pt-2">
            <button onClick={onSaveApiKey} className="w-full btn-primary py-3.5 shadow-indigo-200">
              Synchronize Configuration
            </button>
            {saveStatus && <p className="text-center text-emerald-600 text-xs font-bold animate-in fade-in">{saveStatus}</p>}
          </div>
        </div>
      </section>

      {/* Constraints & Limits */}
      <section className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Throttle Control
        </h3>
        <div className="card p-6 grid grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">Hourly Cap</label>
            <input
              type="number"
              value={automationSettings.rateLimit.messagesPerHour}
              onChange={(e) => onRateLimitChange("messagesPerHour", parseInt(e.target.value) || 0)}
              className="input-field"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">Daily Cap</label>
            <input
              type="number"
              value={automationSettings.rateLimit.messagesPerDay}
              onChange={(e) => onRateLimitChange("messagesPerDay", parseInt(e.target.value) || 0)}
              className="input-field"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">Cooldown Interval (Sec)</label>
            <input
              type="number"
              value={automationSettings.rateLimit.delayBetweenMessages / 1000}
              onChange={(e) => onRateLimitChange("delayBetweenMessages", (parseInt(e.target.value) || 0) * 1000)}
              className="input-field"
            />
          </div>
        </div>
      </section>

      {/* Intelligence Module */}
      <section className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          Cognitive Core
        </h3>
        <div className="card p-6">
          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1 mb-2 block">Processing Model</label>
          <select
            value={automationSettings.openaiModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="input-field appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M7%207L10%2010L13%207%22%20stroke%3D%22%2364748B%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[position:right_0.5rem_center] bg-no-repeat pr-10">
            {OPENAI_MODELS.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h3 className="text-sm font-black text-rose-700 uppercase tracking-tight flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Cleanup Factory
        </h3>
        <div className="card p-6 border-rose-100 bg-rose-50/30">
          <p className="text-[11px] font-bold text-rose-600 mb-4 line-height-relaxed pl-1 uppercase tracking-tighter">Warning: This action nukes all collected data and local keys permanently.</p>
          <button
            onClick={onResetExtension}
            disabled={isResetting}
            className={`w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isResetting ? "bg-rose-200 text-white cursor-not-allowed" : "bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200"
              }`}>
            {isResetting ? "Wiping Database..." : "Factory Reset Extension"}
          </button>
          {resetStatus && <p className="text-center text-rose-600 text-xs font-bold mt-3 animate-in fade-in">{resetStatus}</p>}
        </div>
      </section>
    </div>
  )
}

export default IndexPopup
