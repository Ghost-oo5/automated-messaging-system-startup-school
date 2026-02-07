import type {
  CustomerProfile,
  AutomationSettings,
  FilterSettings,
  MessageTemplate,
  MessageHistory,
  MessageStats
} from "~/types"

const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false,
  rateLimit: {
    messagesPerHour: 5,
    messagesPerDay: 50,
    delayBetweenMessages: 60000 // 1 minute
  },
  openaiModel: "gpt-4o-mini",
  messageVariation: true,
  retryAttempts: 3,
  senderName: ""
}

const DEFAULT_FILTERS: FilterSettings = {
  countries: [],
  ageGroups: [],
  interests: []
}

export async function getProfiles(): Promise<CustomerProfile[]> {
  try {
    const result = await chrome.storage.local.get("profiles")
    return (result.profiles || []).map((p: any) => ({
      ...p,
      collectedAt: new Date(p.collectedAt),
      lastMessageSent: p.lastMessageSent ? new Date(p.lastMessageSent) : undefined
    }))
  } catch (error) {
    console.error("Error getting profiles:", error)
    return []
  }
}

export async function saveProfile(profile: CustomerProfile): Promise<void> {
  try {
    const profiles = await getProfiles()
    const index = profiles.findIndex((p) => p.id === profile.id)

    if (index >= 0) {
      profiles[index] = profile
    } else {
      profiles.push(profile)
    }

    await chrome.storage.local.set({ profiles })
  } catch (error) {
    console.error("Error saving profile:", error)
  }
}

export async function saveProfiles(profiles: CustomerProfile[]): Promise<void> {
  try {
    await chrome.storage.local.set({ profiles })
  } catch (error) {
    console.error("Error saving profiles:", error)
  }
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  try {
    const result = await chrome.storage.local.get("automationSettings")
    return { ...DEFAULT_SETTINGS, ...result.automationSettings }
  } catch (error) {
    console.error("Error getting settings:", error)
    return DEFAULT_SETTINGS
  }
}

export async function saveAutomationSettings(
  settings: AutomationSettings
): Promise<void> {
  try {
    await chrome.storage.local.set({ automationSettings: settings })
  } catch (error) {
    console.error("Error saving settings:", error)
  }
}

export async function getFilterSettings(): Promise<FilterSettings> {
  try {
    const result = await chrome.storage.local.get("filterSettings")
    return { ...DEFAULT_FILTERS, ...result.filterSettings }
  } catch (error) {
    console.error("Error getting filters:", error)
    return DEFAULT_FILTERS
  }
}

export async function saveFilterSettings(
  filters: FilterSettings
): Promise<void> {
  try {
    await chrome.storage.local.set({ filterSettings: filters })
  } catch (error) {
    console.error("Error saving filters:", error)
  }
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  try {
    const result = await chrome.storage.local.get("messageTemplates")
    return (result.messageTemplates || []).map((t: any) => ({
      ...t,
      generatedAt: new Date(t.generatedAt)
    }))
  } catch (error) {
    console.error("Error getting templates:", error)
    return []
  }
}

export async function getMessageHistory(): Promise<MessageHistory[]> {
  try {
    const result = await chrome.storage.local.get("messageHistory")
    return (result.messageHistory || []).map((h: any) => ({
      ...h,
      sentAt: new Date(h.sentAt)
    })).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()) // Most recent first
  } catch (error) {
    console.error("Error getting message history:", error)
    return []
  }
}

export async function getMessagesForProfile(profileId: string): Promise<MessageHistory[]> {
  try {
    const history = await getMessageHistory()
    return history.filter((h) => h.profileId === profileId)
  } catch (error) {
    console.error("Error getting messages for profile:", error)
    return []
  }
}

export async function getMessageStats(): Promise<MessageStats> {
  try {
    const result = await chrome.storage.local.get("messageStats")
    return result.messageStats || {
      totalSent: 0,
      totalFailed: 0,
      messagesToday: 0,
      messagesThisHour: 0
    }
  } catch (error) {
    console.error("Error getting message stats:", error)
    return {
      totalSent: 0,
      totalFailed: 0,
      messagesToday: 0,
      messagesThisHour: 0
    }
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await chrome.storage.local.clear()
  } catch (error) {
    console.error("Error clearing data:", error)
  }
}
