import type { AutomationSettings, MessageStats } from "~/types"

export class RateLimiter {
  private settings: AutomationSettings
  private stats: MessageStats

  constructor(settings: AutomationSettings) {
    this.settings = settings
    this.stats = {
      totalSent: 0,
      totalFailed: 0,
      messagesToday: 0,
      messagesThisHour: 0
    }
    this.loadStats()
  }

  private async loadStats(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get("messageStats")
      if (stored.messageStats) {
        this.stats = { ...this.stats, ...stored.messageStats }
        this.updateTimeBasedCounts()
      }
    } catch (error) {
      console.error("Error loading stats:", error)
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await chrome.storage.local.set({ messageStats: this.stats })
    } catch (error) {
      console.error("Error saving stats:", error)
    }
  }

  private updateTimeBasedCounts(): void {
    const now = new Date()
    const lastSent = this.stats.lastSentAt ? new Date(this.stats.lastSentAt) : null

    // Reset daily count if last message was yesterday
    if (!lastSent || this.isDifferentDay(now, lastSent)) {
      this.stats.messagesToday = 0
    }

    // Reset hourly count if last message was over an hour ago
    if (!lastSent || this.isDifferentHour(now, lastSent)) {
      this.stats.messagesThisHour = 0
    }
  }

  private isDifferentDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() !== date2.getFullYear() ||
      date1.getMonth() !== date2.getMonth() ||
      date1.getDate() !== date2.getDate()
    )
  }

  private isDifferentHour(date1: Date, date2: Date): boolean {
    const hourDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60)
    return hourDiff >= 1
  }

  async canSendMessage(): Promise<{ allowed: boolean; reason?: string; waitTime?: number }> {
    this.updateTimeBasedCounts()

    // Check daily limit
    if (this.stats.messagesToday >= this.settings.rateLimit.messagesPerDay) {
      return {
        allowed: false,
        reason: "Daily message limit reached",
        waitTime: this.getTimeUntilNextDay()
      }
    }

    // Check hourly limit
    if (this.stats.messagesThisHour >= this.settings.rateLimit.messagesPerHour) {
      return {
        allowed: false,
        reason: "Hourly message limit reached",
        waitTime: this.getTimeUntilNextHour()
      }
    }

    return { allowed: true }
  }

  private getTimeUntilNextDay(): number {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime() - now.getTime()
  }

  private getTimeUntilNextHour(): number {
    const now = new Date()
    const nextHour = new Date(now)
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
    return nextHour.getTime() - now.getTime()
  }

  async recordMessageSent(): Promise<void> {
    this.stats.totalSent++
    this.stats.messagesToday++
    this.stats.messagesThisHour++
    this.stats.lastSentAt = new Date()
    await this.saveStats()
  }

  async recordMessageFailed(): Promise<void> {
    this.stats.totalFailed++
    await this.saveStats()
  }

  getStats(): MessageStats {
    this.updateTimeBasedCounts()
    return { ...this.stats }
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalSent: 0,
      totalFailed: 0,
      messagesToday: 0,
      messagesThisHour: 0
    }
    await this.saveStats()
  }
}
