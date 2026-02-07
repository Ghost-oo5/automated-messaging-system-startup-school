import type { CustomerProfile, AutomationSettings, FilterSettings } from "~/types"
import { saveProfile, getAutomationSettings, getProfiles, getFilterSettings } from "~/utils/storage"
import { initializeOpenAI } from "~/services/openai"
import { MessageDeliveryService } from "~/services/messageDelivery"
import { filterProfiles } from "~/utils/filter"
import { extractProfileFromPage, extractProfileUrlsFromDirectory } from "~/services/profileCollector"
import { serializeProfile, deserializeProfile } from "~/utils/serialization"

let messageDeliveryService: MessageDeliveryService | null = null
let automationInterval: NodeJS.Timeout | null = null

// Initialize on startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Automated Messaging System installed")
  await initializeServices()
})

chrome.runtime.onStartup.addListener(async () => {
  await initializeServices()
})

async function initializeServices() {
  const settings = await getAutomationSettings()

  // Initialize message delivery service
  if (settings.openaiApiKey) {
    initializeOpenAI(settings.openaiApiKey)
    messageDeliveryService = new MessageDeliveryService(settings)
  }

  if (settings.enabled) {
    startAutomation(settings)
  }
}

async function sendTestMessage(profileData: any, customMessage?: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const settings = await getAutomationSettings()

    if (!settings.openaiApiKey) {
      return { success: false, error: "OpenAI API key not configured. Please set it in Settings tab." }
    }

    // Deserialize profile
    const profile = deserializeProfile(profileData)

    // Initialize OpenAI if not already done
    if (!messageDeliveryService) {
      initializeOpenAI(settings.openaiApiKey)
      messageDeliveryService = new MessageDeliveryService(settings)
    } else {
      // Update settings in case they changed
      messageDeliveryService.updateSettings(settings)
    }

    // Send the message
    const result = await messageDeliveryService.sendMessage(profile, customMessage)

    return result
  } catch (error) {
    console.error("Error sending test message:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

async function generateDraft(profileData: any): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const settings = await getAutomationSettings()

    if (!settings.openaiApiKey) {
      return { success: false, error: "OpenAI API key not configured." }
    }

    const profile = deserializeProfile(profileData)

    if (!messageDeliveryService) {
      initializeOpenAI(settings.openaiApiKey)
      messageDeliveryService = new MessageDeliveryService(settings)
    } else {
      messageDeliveryService.updateSettings(settings)
    }

    const message = await messageDeliveryService.generateDraft(profile)

    return { success: true, message }
  } catch (error) {
    console.error("Error generating draft:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

// Listen for profile extraction from content script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "profileExtracted") {
    handleProfileExtracted(request.profile)
    sendResponse({ success: true })
  }

  if (request.action === "extractCurrentProfile") {
    console.log("[Background] Received extractCurrentProfile request")
    extractCurrentProfile()
      .then((profile) => {
        console.log("[Background] Extraction successful, profile:", profile?.name || "null")
        // Serialize profile for message passing
        const serializedProfile = profile ? serializeProfile(profile) : null
        sendResponse({ success: true, profile: serializedProfile })
      })
      .catch((error) => {
        console.error("[Background] Extraction failed:", error)
        sendResponse({
          success: false,
          error: error?.message || error?.toString() || "Unknown error occurred"
        })
      })
    return true // Keep channel open for async
  }

  if (request.action === "extractProfileUrls") {
    extractProfileUrls().then((urls) => {
      sendResponse({ success: true, urls })
    }).catch((error) => {
      sendResponse({ success: false, error: error.message })
    })
    return true
  }

  if (request.action === "startAutomation") {
    startAutomation(request.settings)
    sendResponse({ success: true })
  }

  if (request.action === "stopAutomation") {
    stopAutomation()
    sendResponse({ success: true })
  }

  if (request.action === "sendTestMessage") {
    sendTestMessage(request.profile, request.message).then((result) => {
      sendResponse(result)
    }).catch((error) => {
      sendResponse({ success: false, error: error.message })
    })
    return true // Keep channel open for async
  }

  if (request.action === "generateDraft") {
    generateDraft(request.profile).then((result) => {
      sendResponse(result)
    }).catch((error) => {
      sendResponse({ success: false, error: error.message })
    })
    return true
  }

  if (request.action === "updateApiKey") {
    if (request.apiKey) {
      initializeOpenAI(request.apiKey)
      const settings = await getAutomationSettings()
      messageDeliveryService = new MessageDeliveryService(settings)
      sendResponse({ success: true })
    } else {
      sendResponse({ success: false, error: "No API key provided" })
    }
    return true
  }

  return true
})

async function handleProfileExtracted(profileData: any) {
  try {
    // Deserialize profile
    const profile = deserializeProfile(profileData)
    await saveProfile(profile)
    console.log("Profile saved:", profile.name)
  } catch (error) {
    console.error("Error saving profile:", error)
  }
}

async function extractCurrentProfile(): Promise<CustomerProfile | null> {
  console.log("[Profile Extraction] ===== STARTING EXTRACTION =====")
  try {
    console.log("[Profile Extraction] Step 1: Querying active tab...")
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    console.log("[Profile Extraction] Tab found:", tab?.id, tab?.url)

    if (!tab.id || !tab.url) {
      console.error("[Profile Extraction] ERROR: No active tab found")
      throw new Error("No active tab found")
    }

    if (!tab.url.includes("startupschool.org")) {
      console.error("[Profile Extraction] ERROR: Not a startupschool.org page")
      throw new Error("Not a startupschool.org page. Please navigate to a startupschool.org profile/candidate page.")
    }

    // Check if it's a candidate/profile page
    const isCandidatePage = tab.url.includes("/cofounder-matching/candidate/")
    const isProfilePage = tab.url.includes("/users/") || tab.url.includes("/profile")
    console.log("[Profile Extraction] Is candidate page:", isCandidatePage, "Is profile page:", isProfilePage)

    if (!isCandidatePage && !isProfilePage) {
      console.error("[Profile Extraction] ERROR: Not a profile/candidate page")
      throw new Error("Not a profile/candidate page. Please navigate to a candidate profile page (e.g., /cofounder-matching/candidate/...)")
    }

    // Try to send message to content script first (if it's loaded)
    console.log("[Profile Extraction] Step 2: Attempting to contact content script...")
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: "extractProfile" }),
        new Promise((_, reject) =>
          setTimeout(() => {
            console.warn("[Profile Extraction] Content script timeout after 8 seconds")
            reject(new Error("Content script timeout"))
          }, 8000)
        )
      ]) as any

      console.log("[Profile Extraction] Content script responded:", response)

      if (response?.profile) {
        console.log("[Profile Extraction] Profile extracted via content script")
        const profile = deserializeProfile(response.profile)
        await saveProfile(profile)
        console.log("[Profile Extraction] Profile saved:", profile.name)
        return profile
      } else {
        console.warn("[Profile Extraction] Content script responded but no profile data")
      }
    } catch (contentScriptError) {
      console.warn("[Profile Extraction] Content script not available, using direct extraction:", contentScriptError)
    }

    // Fallback: Extract directly using injected script
    console.log("[Profile Extraction] Step 3: Using direct script injection...")
    let results
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          console.log("[Profile Extraction] Injected script running...")
          // Direct extraction logic (simplified version)
          try {
            const waitFor = (fn: () => boolean, timeout = 12000, interval = 400) =>
              new Promise<boolean>((resolve) => {
                const start = Date.now()
                const tick = () => {
                  if (fn()) return resolve(true)
                  if (Date.now() - start > timeout) return resolve(false)
                  setTimeout(tick, interval)
                }
                tick()
              })

            await waitFor(() => Boolean(document.querySelector("h1") || document.querySelector(".css-y9z691")))

            const nameSelectors = ["h1", ".profile-name", "[data-name]", ".user-name", ".name"]
            let name = "Unknown"
            for (const selector of nameSelectors) {
              const element = document.querySelector(selector)
              if (element?.textContent?.trim()) {
                name = element.textContent.trim()
                break
              }
            }

            if (name === "Unknown") {
              return null
            }

            const locationSelectors = [
              ".location",
              ".country",
              "[data-country]",
              ".profile-location",
              "[title='Location']",
              ".css-1jvurm9"
            ]
            let country: string | undefined
            for (const selector of locationSelectors) {
              const element = document.querySelector(selector)
              if (element?.textContent?.trim()) {
                country = element.textContent.trim()
                const parts = country.split(",")
                if (parts.length > 1) {
                  country = parts[parts.length - 1].trim()
                }
                break
              }
            }

            let age: number | undefined
            const ageEl = document.querySelector('[title="Age"]')
            if (ageEl?.textContent) {
              const match = ageEl.textContent.match(/(\d{1,3})/)
              if (match) age = parseInt(match[1], 10)
            }

            const bioSelectors = [
              ".bio",
              ".description",
              "[data-bio]",
              ".profile-bio",
              ".about",
              ".about-section",
              ".profile-about",
              ".cofounder-card__description",
              ".profile-description",
              ".user-description",
              ".summary",
              "[data-testid='about']",
              "[data-testid='bio']",
              ".css-1tp1ukf",
              ".css-vqx3x2",
              ".css-ruq4fr",
              ".css-106je9h"
            ]
            let bio: string | undefined
            const bioChunks = bioSelectors
              .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
              .map((el) => el.textContent?.trim() || "")
              .filter((text) => text.length > 0)
            if (bioChunks.length > 0) {
              const combined = Array.from(new Set(bioChunks)).join("\n\n")
              bio = combined.length > 6000 ? combined.substring(0, 6000) + "..." : combined
            }
            if (!bio) {
              const metaDesc =
                document.querySelector("meta[name='description']")?.getAttribute("content") ||
                document.querySelector("meta[property='og:description']")?.getAttribute("content")
              if (metaDesc?.trim()) {
                const trimmed = metaDesc.trim()
                bio = trimmed.length > 4000 ? trimmed.substring(0, 4000) + "..." : trimmed
              }
            }
            if (!bio) {
              const paragraph = Array.from(document.querySelectorAll("p"))
                .map((el) => el.textContent?.trim() || "")
                .filter((t) => t.length >= 60 && t.length <= 5000)
                .sort((a, b) => b.length - a.length)[0]
              if (paragraph) {
                bio = paragraph.length > 4000 ? paragraph.substring(0, 4000) + "..." : paragraph
              }
            }

            const interestSelectors = [
              ".interest",
              ".tag",
              ".badge",
              ".skill",
              ".topics li",
              ".skills li",
              ".interests li",
              ".tags li",
              ".css-1iujaz8",
              ".css-17813s4"
            ]
            const interests: string[] = []
            for (const selector of interestSelectors) {
              const elements = document.querySelectorAll(selector)
              if (elements.length > 0) {
                Array.from(elements).slice(0, 10).forEach((el) => {
                  const text = el.textContent?.trim()
                  if (text && text.length < 50) {
                    interests.push(text)
                  }
                })
                break
              }
            }

            const profileUrl = window.location.href
            // Extract ID from URL - handle both /candidate/ID and /users/ID formats
            let profileId = profileUrl.split("/").filter(Boolean).pop() || `profile-${Date.now()}`
            // If it's a candidate URL, get the candidate ID
            if (profileUrl.includes("/cofounder-matching/candidate/")) {
              const match = profileUrl.match(/\/candidate\/([^\/\?]+)/)
              if (match && match[1]) {
                profileId = match[1]
              }
            }

            return {
              id: profileId,
              name,
              country,
              age,
              bio,
              interests: interests.slice(0, 10),
              profileUrl,
              collectedAt: new Date().toISOString(),
              messageCount: 0
            }
          } catch (error) {
            console.error("[Profile Extraction] Error in injected script:", error)
            return null
          }
        }
      })
      console.log("[Profile Extraction] Script injection completed")
    } catch (injectionError) {
      console.error("[Profile Extraction] ERROR: Script injection failed:", injectionError)
      throw new Error(`Failed to inject script: ${injectionError instanceof Error ? injectionError.message : "Unknown error"}`)
    }

    console.log("[Profile Extraction] Script execution results:", results)

    if (results && results[0]?.result) {
      const profileData = results[0].result
      console.log("[Profile Extraction] Extracted profile data:", profileData)
      if (profileData) {
        const profile = deserializeProfile(profileData)
        await saveProfile(profile)
        console.log("[Profile Extraction] Profile saved via direct extraction:", profile.name)
        return profile
      }
    }

    console.error("[Profile Extraction] No profile data extracted")
    throw new Error("Could not extract profile data from the page. Make sure you're on a profile page.")
  } catch (error) {
    console.error("[Profile Extraction] Fatal error:", error)
    throw error
  }
}

async function extractProfileUrls(): Promise<string[]> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.id || !tab.url) {
      throw new Error("No active tab found")
    }

    if (!tab.url.includes("startupschool.org")) {
      throw new Error("Not a startupschool.org page")
    }

    // Inject script to extract profile URLs
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const profileUrls: string[] = []
        const linkSelectors = [
          'a[href*="/users/"]',
          'a[href*="/profile/"]',
          'a[href*="/user/"]',
          'a[href*="/people/"]',
          'a[href*="/member/"]'
        ]

        const links = new Set<string>()

        for (const selector of linkSelectors) {
          const elements = document.querySelectorAll<HTMLAnchorElement>(selector)
          elements.forEach((el) => {
            const href = el.href
            if (href && (href.includes("/users/") || href.includes("/profile/") || href.includes("/user/"))) {
              try {
                const url = new URL(href)
                links.add(url.href)
              } catch {
                // Invalid URL, skip
              }
            }
          })
        }

        return Array.from(links)
      }
    })

    if (results && results[0]?.result) {
      return results[0].result as string[]
    }

    return []
  } catch (error) {
    console.error("Error extracting profile URLs:", error)
    return []
  }
}

async function startAutomation(settings: AutomationSettings) {
  stopAutomation() // Stop any existing automation

  if (!settings.enabled) {
    return
  }

  messageDeliveryService = new MessageDeliveryService(settings)

  // Run automation loop
  automationInterval = setInterval(async () => {
    await runAutomationCycle(settings)
  }, settings.rateLimit.delayBetweenMessages || 60000)

  // Run immediately
  await runAutomationCycle(settings)
}

function stopAutomation() {
  if (automationInterval) {
    clearInterval(automationInterval)
    automationInterval = null
  }
}

async function runAutomationCycle(settings: AutomationSettings) {
  try {
    const profiles = await getProfiles()
    const filtered = filterProfiles(profiles, await getFilterSettings())

    // Find profiles that haven't been messaged or haven't been messaged recently
    const eligibleProfiles = filtered.filter((profile) => {
      if (profile.messageCount === 0) return true
      if (!profile.lastMessageSent) return true

      // Don't message same person more than once per week
      const daysSinceLastMessage =
        (Date.now() - new Date(profile.lastMessageSent).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceLastMessage >= 7
    })

    if (eligibleProfiles.length === 0) {
      console.log("No eligible profiles found")
      return
    }

    // Pick a random profile
    const profile = eligibleProfiles[Math.floor(Math.random() * eligibleProfiles.length)]

    if (messageDeliveryService) {
      const result = await messageDeliveryService.sendMessage(profile)
      if (result.success) {
        console.log(`Message sent to ${profile.name}`)
      } else {
        console.error(`Failed to send message: ${result.error}`)
      }
    }
  } catch (error) {
    console.error("Error in automation cycle:", error)
  }
}


// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.automationSettings) {
    const newSettings = changes.automationSettings.newValue as AutomationSettings
    if (newSettings.enabled) {
      startAutomation(newSettings)
    } else {
      stopAutomation()
    }
  }
})

