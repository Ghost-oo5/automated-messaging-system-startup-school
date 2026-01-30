export interface CustomerProfile {
  id: string
  name: string
  email?: string
  country?: string
  age?: number
  ageGroup?: AgeGroup
  interests?: Interest[]
  bio?: string
  profileUrl: string
  collectedAt: Date
  lastMessageSent?: Date
  messageCount: number
}

export type AgeGroup = "18-25" | "26-35" | "36-45" | "46-55" | "56+" | "unknown"

export type Interest =
  | "Blockchain"
  | "AI"
  | "Full-Stack Development"
  | "E-commerce"
  | "Startups"
  | "Technology"
  | "Business"
  | "Other"

export interface FilterSettings {
  countries?: string[]
  ageGroups?: AgeGroup[]
  interests?: Interest[]
  minAge?: number
  maxAge?: number
}

export interface MessageTemplate {
  id: string
  content: string
  generatedAt: Date
  profileId: string
  profileName?: string
  openaiModel?: string
  success: boolean
  error?: string
}

export interface MessageHistory {
  id: string
  profileId: string
  profileName: string
  message: string
  sentAt: Date
  success: boolean
  error?: string
  openaiModel?: string
}

export interface AutomationSettings {
  enabled: boolean
  rateLimit: {
    messagesPerHour: number
    messagesPerDay: number
    delayBetweenMessages: number // in milliseconds
  }
  openaiApiKey?: string
  openaiModel: string
  messageVariation: boolean
  retryAttempts: number
  senderName?: string
}

export interface MessageStats {
  totalSent: number
  totalFailed: number
  lastSentAt?: Date
  messagesToday: number
  messagesThisHour: number
}
