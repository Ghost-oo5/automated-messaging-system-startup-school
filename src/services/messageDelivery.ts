import type { CustomerProfile, AutomationSettings, MessageTemplate, MessageHistory } from "~/types"
import { generatePersonalizedMessage, isOpenAIConfigured } from "./openai"
import { RateLimiter } from "./rateLimiter"

export class MessageDeliveryService {
  private rateLimiter: RateLimiter
  private settings: AutomationSettings

  public ready: Promise<void>

  constructor(settings: AutomationSettings) {
    this.settings = settings
    this.rateLimiter = new RateLimiter(settings)
    this.ready = this.rateLimiter.ready
  }

  async generateDraft(profile: CustomerProfile): Promise<string> {
    if (!isOpenAIConfigured()) {
      throw new Error("OpenAI API key not configured")
    }

    let message = await generatePersonalizedMessage(
      profile,
      this.settings.openaiModel
    )

    return this.applyNameTemplate(message, profile)
  }

  async sendMessage(
    profile: CustomerProfile,
    customMessage?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    // Check rate limits
    const canSend = await this.rateLimiter.canSendMessage()
    if (!canSend.allowed) {
      return {
        success: false,
        error: canSend.reason || "Rate limit exceeded"
      }
    }

    // Generate or use custom message
    let message: string
    try {
      if (customMessage) {
        message = customMessage
      } else {
        if (!isOpenAIConfigured()) {
          return {
            success: false,
            error: "OpenAI API key not configured"
          }
        }
        message = await generatePersonalizedMessage(
          profile,
          this.settings.openaiModel
        )
        // Only apply template to AI generated messages
        message = this.applyNameTemplate(message, profile)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      await this.rateLimiter.recordMessageFailed()
      // Save failed attempt to history
      await this.saveMessageHistory(profile, "", false, `Failed to generate: ${errorMsg}`)
      return {
        success: false,
        error: `Failed to generate message: ${errorMsg}`
      }
    }

    // Add delay to avoid spam detection
    if (this.settings.rateLimit.delayBetweenMessages > 0) {
      await this.delay(this.settings.rateLimit.delayBetweenMessages)
    }

    // Send message (implementation depends on how messages are sent)
    try {
      const success = await this.actuallySendMessage(profile, message)

      if (success) {
        await this.rateLimiter.recordMessageSent()
        await this.saveMessageTemplate(profile, message, true)
        await this.saveMessageHistory(profile, message, true)
        await this.updateProfileMessageCount(profile)
        return { success: true, message }
      } else {
        await this.rateLimiter.recordMessageFailed()
        await this.saveMessageTemplate(profile, message, false, "Failed to send message")
        await this.saveMessageHistory(profile, message, false, "Failed to send message")
        return { success: false, error: "Failed to send message" }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      await this.rateLimiter.recordMessageFailed()
      // Save failed attempt to history
      if (message) {
        await this.saveMessageHistory(profile, message, false, errorMsg)
      }
      return {
        success: false,
        error: `Error sending message: ${errorMsg}`
      }
    }
  }

  private async actuallySendMessage(
    profile: CustomerProfile,
    message: string
  ): Promise<boolean> {
    // This is a placeholder implementation
    // In a real scenario, you would:
    // 1. Navigate to the messaging interface
    // 2. Fill in the message
    // 3. Submit the form
    // 4. Verify success

    // For now, we'll simulate the process
    console.log(`Sending message to ${profile.name}:`, message)

    // Simulate API call or form submission
    // You might use content scripts to interact with the page
    try {
      // Placeholder: In reality, you'd interact with the startupschool.org messaging system
      // This could involve:
      // - Using content scripts to fill forms
      // - Making API calls if available
      // - Using browser automation

      return true // Simulated success
    } catch (error) {
      console.error("Error in message delivery:", error)
      return false
    }
  }

  private async saveMessageTemplate(
    profile: CustomerProfile,
    message: string,
    success: boolean = true,
    error?: string
  ): Promise<void> {
    const template: MessageTemplate = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: message,
      generatedAt: new Date(),
      profileId: profile.id,
      profileName: profile.name,
      openaiModel: this.settings.openaiModel,
      success,
      error
    }

    try {
      const stored = await chrome.storage.local.get("messageTemplates")
      const templates: MessageTemplate[] = stored.messageTemplates || []
      templates.push(template)

      // Keep only last 1000 templates
      if (templates.length > 1000) {
        templates.shift()
      }

      await chrome.storage.local.set({ messageTemplates: templates })
    } catch (error) {
      console.error("Error saving message template:", error)
    }
  }

  private async saveMessageHistory(
    profile: CustomerProfile,
    message: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const history: MessageHistory = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      profileId: profile.id,
      profileName: profile.name,
      message,
      sentAt: new Date(),
      success,
      error,
      openaiModel: this.settings.openaiModel
    }

    try {
      const stored = await chrome.storage.local.get("messageHistory")
      const historyList: MessageHistory[] = stored.messageHistory || []
      historyList.push(history)

      // Keep only last 500 messages
      if (historyList.length > 500) {
        historyList.shift()
      }

      await chrome.storage.local.set({ messageHistory: historyList })
    } catch (error) {
      console.error("Error saving message history:", error)
    }
  }

  private async updateProfileMessageCount(profile: CustomerProfile): Promise<void> {
    profile.messageCount++
    profile.lastMessageSent = new Date()

    try {
      const stored = await chrome.storage.local.get("profiles")
      const profiles: CustomerProfile[] = stored.profiles || []
      const index = profiles.findIndex((p) => p.id === profile.id)

      if (index >= 0) {
        profiles[index] = profile
      } else {
        profiles.push(profile)
      }

      await chrome.storage.local.set({ profiles })
    } catch (error) {
      console.error("Error updating profile:", error)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async getStats() {
    return this.rateLimiter.getStats()
  }

  updateSettings(newSettings: AutomationSettings): void {
    this.settings = newSettings
    this.rateLimiter = new RateLimiter(newSettings)
  }

  private applyNameTemplate(message: string, profile: CustomerProfile): string {
    const sender = (this.settings.senderName || "").trim() || "Your Name"
    const receiver = (profile.name || "").trim() || "there"

    // Replace placeholder tokens first
    let body = message
      .replace(/\[Your Name\]/gi, sender)
      .replace(/\{Your Name\}/gi, sender)
      .replace(/<Your Name>/gi, sender)
      .replace(/\[Recipient\]/gi, receiver)
      .replace(/\{Recipient\}/gi, receiver)
      .replace(/<Recipient>/gi, receiver)
      .trim()

    // Avoid duplicating greeting if model already started with "Hi/Hello"
    const greetingRegex = /^(hi|hello|hey)[^a-z]/i
    const hasGreeting = greetingRegex.test(body)
    const salutation = hasGreeting ? "" : `Hi ${receiver},\n\n`

    const closing = `\n\nBest,\n${sender}`

    return `${salutation}${body}${closing}`
  }
}
