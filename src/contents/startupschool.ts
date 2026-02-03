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
async function waitForProfile(timeoutMs = 12000, intervalMs = 500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const profile = extractProfileFromPage(document)
    if (profile) return profile
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractProfile") {
    waitForProfile().then((profile) => {
      if (profile) {
        const serializedProfile = serializeProfile(profile)
        sendResponse({ profile: serializedProfile })
      } else {
        sendResponse({ profile: null })
      }
    })
    return true
  }
})

// Auto-extract profile when page loads (if on a profile/candidate page)
if (
  window.location.pathname.includes("/cofounder-matching/candidate/") ||
  window.location.pathname.includes("/users/") ||
  window.location.pathname.includes("/profile")
) {
  window.addEventListener("load", () => {
    setTimeout(async () => {
      const profile = await waitForProfile()
      if (profile) {
        const serializedProfile = serializeProfile(profile)
        chrome.runtime.sendMessage({
          action: "profileExtracted",
          profile: serializedProfile
        })
      }
    }, 2000)
  })
}
