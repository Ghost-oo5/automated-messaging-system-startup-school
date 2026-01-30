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
  getMessagesForProfile,
  clearAllData
} from "~/utils/storage"
import { initializeOpenAI } from "~/services/openai"
import { MessageDeliveryService } from "~/services/messageDelivery"
import { filterProfiles } from "~/utils/filter"
import { COUNTRIES, AGE_GROUPS, INTERESTS, OPENAI_MODELS } from "~/utils/constants"
import { serializeProfile } from "~/utils/serialization"
import { createPortal } from "react-dom"

type Tab = "dashboard" | "filters" | "settings" | "profiles" | "messages"

function formatDateTime(value: Date | string | number | null | undefined) {
  const d = value instanceof Date ? value : value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return "Not recorded"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
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
  const [collectionStatus, setCollectionStatus] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<string | null>(null)
  const [messageHistory, setMessageHistory] = useState<MessageHistory[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [modalProfile, setModalProfile] = useState<CustomerProfile | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === "messages") {
      // Refresh history when entering Messages to avoid stale or missing data
      getMessageHistory().then(setMessageHistory)
    }
  }, [activeTab])

  useEffect(() => {
    if (automationSettings && filterSettings) {
      const service = new MessageDeliveryService(automationSettings)
      setMessageDelivery(service)
      if (service) {
        setStats(service.getStats())
      }
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
    const [settings, filters, profileList, history] = await Promise.all([
      getAutomationSettings(),
      getFilterSettings(),
      getProfiles(),
      getMessageHistory()
    ])
    setAutomationSettings(settings)
    setFilterSettings(filters)
    setProfiles(profileList)
    setMessageHistory(history)
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
    
    if (trimmedKey) {
      initializeOpenAI(trimmedKey)
      setSaveStatus("API key saved")
    } else {
      setSaveStatus("API key cleared")
    }
    if (trimmedName) {
      setSaveStatus((prev) => (prev ? `${prev} · Sender saved` : "Sender saved"))
    }
    setTimeout(() => setSaveStatus(null), 4000)
  }

  async function handleUpdateRateLimit(field: string, value: number) {
    if (!automationSettings) return
    
    const updated = {
      ...automationSettings,
      rateLimit: {
        ...automationSettings.rateLimit,
        [field]: value
      }
    }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (messageDelivery) {
      messageDelivery.updateSettings(updated)
    }
  }

  async function handleModelChange(model: string) {
    if (!automationSettings) return
    
    const updated = { ...automationSettings, openaiModel: model }
    setAutomationSettings(updated)
    await saveAutomationSettings(updated)
    if (messageDelivery) {
      messageDelivery.updateSettings(updated)
    }
  }

  async function handleResetExtension() {
    setIsResetting(true)
    setResetStatus("Resetting data...")
    try {
      await clearAllData()
      await loadData()
      setResetStatus("[OK] Extension data reset")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      setResetStatus(`[WARN] Reset failed: ${msg}`)
    } finally {
      setTimeout(() => setResetStatus(null), 5000)
      setIsResetting(false)
    }
  }

  async function handleCollectCurrentProfile() {
    setIsCollecting(true)
    setCollectionStatus("Collecting profile from current tab...")
    console.log("[Popup] Starting profile collection...")
    
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout after 10 seconds")), 10000)
      )
      
      const responsePromise = chrome.runtime.sendMessage({ action: "extractCurrentProfile" })
      
      const response = await Promise.race([responsePromise, timeoutPromise]) as any
      
      console.log("[Popup] Received response:", response)
      
      if (response && response.success && response.profile) {
        setCollectionStatus(`[OK] Profile collected: ${response.profile.name}`)
        await loadData() // Reload profiles
        setTimeout(() => setCollectionStatus(null), 3000)
      } else {
        const errorMsg = response?.error || "Failed to collect profile"
        console.error("[Popup] Collection failed:", errorMsg)
        setCollectionStatus(`[ERR] ${errorMsg}`)
        setTimeout(() => setCollectionStatus(null), 5000)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[Popup] Collection error:", error)
      setCollectionStatus(`[ERR] Error: ${errorMsg}`)
      setTimeout(() => setCollectionStatus(null), 5000)
    } finally {
      setIsCollecting(false)
      console.log("[Popup] Collection process finished")
    }
  }

  async function handleExtractProfileUrls() {
    setIsCollecting(true)
    setCollectionStatus("Extracting profile URLs from current page...")
    
    try {
      const response = await chrome.runtime.sendMessage({ action: "extractProfileUrls" })
      
      if (response.success && response.urls) {
        const count = response.urls.length
        setCollectionStatus(`[OK] Found ${count} profile URL${count !== 1 ? "s" : ""}`)
        // TODO: Optionally collect all these profiles
        setTimeout(() => setCollectionStatus(null), 3000)
      } else {
        setCollectionStatus(`[ERR] ${response.error || "No profile URLs found"}`)
        setTimeout(() => setCollectionStatus(null), 5000)
      }
    } catch (error) {
      setCollectionStatus(`[ERR] Error: ${error instanceof Error ? error.message : "Unknown error"}`)
      setTimeout(() => setCollectionStatus(null), 5000)
    } finally {
      setIsCollecting(false)
    }
  }

  async function handleSendTestMessage(profile?: CustomerProfile) {
    if (!automationSettings || !messageDelivery) {
      setSendStatus("[ERR] Automation settings not loaded")
      setTimeout(() => setSendStatus(null), 3000)
      return
    }

    if (!automationSettings.openaiApiKey) {
      setSendStatus("[ERR] Please set OpenAI API key in Settings tab")
      setTimeout(() => setSendStatus(null), 5000)
      return
    }

    setIsSending(true)
    setSendStatus("Generating message...")

    try {
      // Use provided profile or get first filtered profile
      const targetProfile = profile || filteredProfiles[0]
      
      if (!targetProfile) {
        setSendStatus("[ERR] No profiles available to message")
        setTimeout(() => setSendStatus(null), 3000)
        return
      }

      // Serialize profile for message passing
      const serializedProfile = serializeProfile(targetProfile)

      const response = await chrome.runtime.sendMessage({
        action: "sendTestMessage",
        profile: serializedProfile
      })

      if (response.success) {
        setSendStatus(`[OK] Message sent to ${targetProfile.name}`)
        // Reload data to update stats, profiles, and history
        await loadData()
        // Refresh stats
        if (messageDelivery) {
          setStats(messageDelivery.getStats())
        }
        // Show the sent message
        if (response.message) {
          setSendStatus(`[OK] Message sent to ${targetProfile.name}: "${response.message.substring(0, 50)}..."`)
        }
        setTimeout(() => setSendStatus(null), 8000)
      } else {
        setSendStatus(`[ERR] ${response.error || "Failed to send message"}`)
        setTimeout(() => setSendStatus(null), 5000)
      }
    } catch (error) {
      setSendStatus(`[ERR] Error: ${error instanceof Error ? error.message : "Unknown error"}`)
      setTimeout(() => setSendStatus(null), 5000)
    } finally {
      setIsSending(false)
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
      <div className="w-[600px] h-[700px] flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-[600px] bg-gradient-to-br from-slate-50 to-slate-100 h-[700px] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">YCStartupSchool Messenger</h1>
          <button
            onClick={handleToggleAutomation}
            className={`w-12 h-6 rounded-full transition-all duration-300 ${
              automationSettings.enabled ? "bg-green-400" : "bg-gray-300"
            }`}>
            <span
              className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
                automationSettings.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="text-blue-100 text-xs">
          {automationSettings.enabled ? "System Active" : "System Inactive"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto scrollbar-hide">
        {(["dashboard", "filters", "settings", "profiles", "messages"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "dashboard" && (
          <DashboardTab
            stats={stats}
            automationSettings={automationSettings}
            filteredProfiles={filteredProfiles}
            totalProfiles={profiles.length}
            isCollecting={isCollecting}
            collectionStatus={collectionStatus}
            isSending={isSending}
            sendStatus={sendStatus}
            onCollectCurrentProfile={handleCollectCurrentProfile}
            onExtractProfileUrls={handleExtractProfileUrls}
            onSendTestMessage={handleSendTestMessage}
          />
        )}

        {activeTab === "filters" && (
          <FiltersTab
            filterSettings={filterSettings}
            onFilterChange={handleFilterChange}
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
            sendStatus={sendStatus}
            onSendMessage={handleSendTestMessage}
            onSelectProfile={(profile) => {
              setModalProfile(profile)
              setIsModalOpen(true)
            }}
            onViewMessages={(profileId) => {
              setSelectedProfileId(profileId)
              setActiveTab("messages")
            }}
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
      {isModalOpen && modalProfile &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setIsModalOpen(false)} />
            <div className="relative z-10 w-[90%] max-w-2xl max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-xl p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{modalProfile.name}</h3>
                  <p className="text-sm text-gray-600">
                    {modalProfile.country || "Location not set"} • {modalProfile.ageGroup || "Age not set"}
                  </p>
                  {modalProfile.profileUrl && (
                    <a
                      href={modalProfile.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 text-sm underline">
                      View profile
                    </a>
                  )}
                </div>
                <button
                  className="text-gray-500 hover:text-gray-800 text-xl leading-none"
                  onClick={() => setIsModalOpen(false)}>
                  ×
                </button>
              </div>

              <div className="text-sm text-gray-700 space-y-2">
                <p><span className="font-semibold">Last Messaged:</span> {modalProfile.lastMessageSent ? formatDateTime(modalProfile.lastMessageSent) : "Never"}</p>
                <p><span className="font-semibold">Message Count:</span> {modalProfile.messageCount ?? 0}</p>
                {modalProfile.age && (
                  <p><span className="font-semibold">Age:</span> {modalProfile.age}</p>
                )}
              </div>

              {modalProfile.interests && modalProfile.interests.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold text-sm text-gray-800">Interests</p>
                  <div className="flex flex-wrap gap-1">
                    {modalProfile.interests.map((interest, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {modalProfile.bio && (
                <div className="space-y-1">
                  <p className="font-semibold text-sm text-gray-800">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {modalProfile.bio}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    handleSendTestMessage(modalProfile)
                    setIsModalOpen(false)
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium">
                  Send Message
                </button>
                <button
                  onClick={() => {
                    setSelectedProfileId(modalProfile.id)
                    setActiveTab("messages")
                    setIsModalOpen(false)
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">
                  View History
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
  collectionStatus: string | null
  isSending: boolean
  sendStatus: string | null
  onCollectCurrentProfile: () => void
  onExtractProfileUrls: () => void
  onSendTestMessage: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Total Sent</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats?.totalSent || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Today</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats?.messagesToday || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">This Hour</p>
          <p className="text-2xl font-bold text-gray-800">
            {stats?.messagesThisHour || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Failed</p>
          <p className="text-2xl font-bold text-red-600">
            {stats?.totalFailed || 0}
          </p>
        </div>
      </div>

      {/* Rate Limits */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Rate Limits</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Per Hour:</span>
            <span className="font-medium">
              {automationSettings.rateLimit.messagesPerHour}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Per Day:</span>
            <span className="font-medium">
              {automationSettings.rateLimit.messagesPerDay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Delay:</span>
            <span className="font-medium">
              {automationSettings.rateLimit.delayBetweenMessages / 1000}s
            </span>
          </div>
        </div>
      </div>

      {/* Profile Stats */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Profiles</h3>
        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Collected:</span>
            <span className="font-medium">{totalProfiles}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">After Filters:</span>
            <span className="font-medium">{filteredProfiles.length}</span>
          </div>
        </div>

        {/* Collection Status */}
        {collectionStatus && (
          <div className={`mb-3 p-2 rounded text-xs ${
            collectionStatus.startsWith("[OK]") 
              ? "bg-green-50 text-green-700 border border-green-200" 
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {collectionStatus}
          </div>
        )}

        {/* Collection Buttons */}
        <div className="space-y-2">
          <button
            onClick={onCollectCurrentProfile}
            disabled={isCollecting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {isCollecting ? "Collecting..." : "Collect Profile from Current Tab"}
          </button>
          <button
            onClick={onExtractProfileUrls}
            disabled={isCollecting}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {isCollecting ? "Extracting..." : "Extract Profile URLs from Page"}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Make sure you're on a startupschool.org page
          </p>
        </div>
      </div>

      {/* Send Test Message Section */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Test Message</h3>
        
        {sendStatus && (
          <div className={`mb-3 p-2 rounded text-xs ${
            sendStatus.startsWith("[OK]") 
              ? "bg-green-50 text-green-700 border border-green-200" 
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {sendStatus}
          </div>
        )}

        <button
          onClick={onSendTestMessage}
          disabled={isSending || filteredProfiles.length === 0 || !automationSettings.openaiApiKey}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          {isSending ? "Sending..." : filteredProfiles.length === 0 
            ? "No Profiles Available" 
            : !automationSettings.openaiApiKey
            ? "Set API Key First"
            : "Send Test Message to First Profile"}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Sends a test message to the first filtered profile. Make sure OpenAI API key is set.
        </p>
      </div>
    </div>
  )
}

function FiltersTab({
  filterSettings,
  onFilterChange
}: {
  filterSettings: FilterSettings
  onFilterChange: (field: keyof FilterSettings, value: any) => void
}) {
  return (
    <div className="space-y-4">
      {/* Country Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Countries</h3>
        <div className="max-h-40 overflow-y-auto space-y-2">
          {COUNTRIES.map((country) => (
            <label key={country} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSettings.countries?.includes(country) || false}
                onChange={(e) => {
                  const current = filterSettings.countries || []
                  const updated = e.target.checked
                    ? [...current, country]
                    : current.filter((c) => c !== country)
                  onFilterChange("countries", updated)
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{country}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Age Group Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Age Groups</h3>
        <div className="space-y-2">
          {AGE_GROUPS.map((ageGroup) => (
            <label key={ageGroup} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSettings.ageGroups?.includes(ageGroup) || false}
                onChange={(e) => {
                  const current = filterSettings.ageGroups || []
                  const updated = e.target.checked
                    ? [...current, ageGroup]
                    : current.filter((a) => a !== ageGroup)
                  onFilterChange("ageGroups", updated)
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{ageGroup}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Interests Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Interests</h3>
        <div className="space-y-2">
          {INTERESTS.map((interest) => (
            <label key={interest} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSettings.interests?.includes(interest) || false}
                onChange={(e) => {
                  const current = filterSettings.interests || []
                  const updated = e.target.checked
                    ? [...current, interest]
                    : current.filter((i) => i !== interest)
                  onFilterChange("interests", updated)
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{interest}</span>
            </label>
          ))}
        </div>
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
    <div className="space-y-4">
      {/* OpenAI API Key */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">OpenAI API Key</h3>
        <div className="space-y-2">
          <div className="flex space-x-2">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => onShowApiKeyChange(!showApiKey)}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">
              {showApiKey ? "Hide" : "Show"}
            </button>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Sender Name</label>
            <input
              type="text"
              value={senderNameInput}
              onChange={(e) => onSenderNameChange(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={onSaveApiKey}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
            Save Settings
          </button>
          {saveStatus && (
            <p
              className={`text-xs ${
                saveStatus.toLowerCase().includes("saved") ? "text-green-600" : "text-amber-600"
              }`}>
              {saveStatus}
            </p>
          )}
          <p className="text-xs text-gray-500">
            Your API key is stored locally and never shared
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-red-200">
        <h3 className="font-semibold text-red-700 mb-2">Reset Extension</h3>
        <p className="text-xs text-red-600 mb-3">
          Clears all saved profiles, history, templates, settings, and API key from local storage.
        </p>
        <button
          onClick={onResetExtension}
          disabled={isResetting}
          className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isResetting
              ? "bg-red-300 text-white cursor-not-allowed"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}>
          {isResetting ? "Resetting..." : "Reset Extension Data"}
        </button>
        {resetStatus && (
          <p
            className={`text-xs mt-2 ${
              resetStatus.startsWith("[OK]")
                ? "text-green-600"
                : "text-red-600"
            }`}>
            {resetStatus}
          </p>
        )}
      </div>

      {/* Rate Limits */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Rate Limits</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Messages Per Hour
            </label>
            <input
              type="number"
              value={automationSettings.rateLimit.messagesPerHour}
              onChange={(e) =>
                onRateLimitChange("messagesPerHour", parseInt(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Messages Per Day
            </label>
            <input
              type="number"
              value={automationSettings.rateLimit.messagesPerDay}
              onChange={(e) =>
                onRateLimitChange("messagesPerDay", parseInt(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Delay Between Messages (seconds)
            </label>
            <input
              type="number"
              value={automationSettings.rateLimit.delayBetweenMessages / 1000}
              onChange={(e) =>
                onRateLimitChange(
                  "delayBetweenMessages",
                  (parseInt(e.target.value) || 0) * 1000
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">AI Model</h3>
        <select
          value={automationSettings.openaiModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {OPENAI_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ProfilesTab({ 
  profiles,
  isSending,
  sendStatus,
  onSendMessage,
  onSelectProfile,
  onViewMessages
}: { 
  profiles: CustomerProfile[]
  isSending: boolean
  sendStatus: string | null
  onSendMessage: (profile: CustomerProfile) => void
  onSelectProfile: (profile: CustomerProfile) => void
  onViewMessages: (profileId: string) => void
}) {
  return (
      <div className="space-y-2">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">
            Profiles ({profiles.length})
          </h3>
        </div>

        {sendStatus && (
          <div className={`mb-3 p-2 rounded text-xs ${
            sendStatus.startsWith("[OK]") 
              ? "bg-green-50 text-green-700 border border-green-200" 
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {sendStatus}
          </div>
        )}

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {profiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No profiles collected yet. Profiles will appear here once collected.
            </div>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-center justify-between">
                <button
                  onClick={() => onSelectProfile(profile)}
                  className="text-left flex-1 pr-3">
                  <p className="font-medium text-gray-800">{profile.name}</p>
                  <p className="text-xs text-gray-500">
                    {profile.country || "Unknown location"} •{" "}
                    {profile.interests?.slice(0, 2).join(", ") || "No interests"}
                  </p>
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => onViewMessages(profile.id)}
                    className="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700">
                    History
                  </button>
                  <button
                    onClick={() => onSendMessage(profile)}
                    disabled={isSending}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSending ? "Sending..." : "Send"}
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
    <div className="space-y-4">
      {/* Filter by Profile */}
      <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-lg text-gray-800 mb-4">Filter by Profile</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onProfileSelect(null)}
            className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
              selectedProfileId === null
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}>
            All Messages
          </button>
          {profiles.slice(0, 10).map((profile) => (
            <button
              key={profile.id}
              onClick={() => onProfileSelect(profile.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                selectedProfileId === profile.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}>
              {profile.name}
            </button>
          ))}
        </div>
      </div>

      {/* Message History */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg text-gray-800">
            Message History ({filteredHistory.length})
          </h3>
        </div>
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-base">
              No messages sent yet. Messages will appear here once you start sending.
            </div>
          ) : (
            filteredHistory.map((msg) => (
              <div
                key={msg.id}
                className={`bg-white rounded-lg p-5 shadow-sm border-2 ${
                  msg.success
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-base text-gray-800">{msg.profileName}</span>
                      <span
                        className={`text-sm px-3 py-1 rounded ${
                          msg.success
                            ? "bg-green-200 text-green-700"
                            : "bg-red-200 text-red-700"
                        }`}>
                        {msg.success ? "[OK] Sent" : "[ERR] Failed"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      {formatDateTime(msg.sentAt)}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border-2 border-gray-300 mb-3 min-h-[80px]">
                  <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {msg.message || "(No message content)"}
                  </p>
                </div>
                {msg.error && (
                  <p className="text-sm text-red-600 mt-2 font-medium">Error: {msg.error}</p>
                )}
                {msg.openaiModel && (
                  <p className="text-sm text-gray-500 mt-2">Model: {msg.openaiModel}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default IndexPopup


