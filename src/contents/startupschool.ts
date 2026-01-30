import type { PlasmoCSConfig } from "plasmo"
import { extractProfileFromPage } from "~/services/profileCollector"
import { serializeProfile } from "~/utils/serialization"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.startupschool.org/*",
    "https://startupschool.org/*",
    "https://www.startupschool.org/cofounder-matching/candidate/*",
    "https://startupschool.org/cofounder-matching/candidate/*"
  ]
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractProfile") {
    const profile = extractProfileFromPage(document)
    if (profile) {
      // Serialize profile for message passing
      const serializedProfile = serializeProfile(profile)
      sendResponse({ profile: serializedProfile })
    } else {
      sendResponse({ profile: null })
    }
    return true // Keep channel open for async response
  }
})

// Auto-extract profile when page loads (if on a profile/candidate page)
if (
  window.location.pathname.includes("/cofounder-matching/candidate/") ||
  window.location.pathname.includes("/users/") ||
  window.location.pathname.includes("/profile")
) {
  window.addEventListener("load", () => {
    setTimeout(() => {
      const profile = extractProfileFromPage(document)
      if (profile) {
        // Serialize profile for message passing
        const serializedProfile = serializeProfile(profile)
        // Send profile to background script
        chrome.runtime.sendMessage({
          action: "profileExtracted",
          profile: serializedProfile
        })
      }
    }, 2000) // Wait for page to fully load
  })
}
