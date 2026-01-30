import axios from "axios"
import type { CustomerProfile, AgeGroup, Interest } from "~/types"
import { categorizeAgeGroup } from "~/utils/filter"

/**
 * Extracts profile data from a startupschool.org profile page
 * This is called from a content script when on a profile page
 */
export function extractProfileFromPage(document: Document): CustomerProfile | null {
  try {
    // Extract name - try multiple selectors (including candidate page selectors)
    const nameSelectors = [
      "h1",
      ".profile-name",
      "[data-name]",
      ".user-name",
      ".name",
      "header h1",
      ".profile-header h1",
      ".user-profile h1",
      ".candidate-name",
      ".candidate-header h1",
      "[data-candidate-name]",
      ".cofounder-name",
      "h2.candidate-name",
      ".profile-title"
    ]
    let name = "Unknown"
    for (const selector of nameSelectors) {
      const element = document.querySelector(selector)
      if (element?.textContent?.trim()) {
        name = element.textContent.trim()
        break
      }
    }

    // Extract country/location - try multiple selectors (including candidate page selectors)
    const locationSelectors = [
      ".location",
      ".country",
      "[data-country]",
      ".profile-location",
      ".user-location",
      ".location-info",
      "[data-location]",
      ".geo-location",
      ".candidate-location",
      "[data-candidate-location]",
      ".cofounder-location",
      ".location-text"
    ]
    let country: string | undefined
    for (const selector of locationSelectors) {
      const element = document.querySelector(selector)
      if (element?.textContent?.trim()) {
        country = element.textContent.trim()
        // Try to extract just the country name if it's in a format like "City, Country"
        const parts = country.split(",")
        if (parts.length > 1) {
          country = parts[parts.length - 1].trim()
        }
        break
      }
    }

    // Extract age - try explicit age fields and title markers
    let age: number | undefined
    const ageCandidates = [
      document.querySelector(".age"),
      document.querySelector("[data-age]"),
      document.querySelector('[title=\"Age\"]')
    ]
    for (const el of ageCandidates) {
      const text = el?.textContent || ""
      const ageMatch = text.match(/\d{1,3}/)
      if (ageMatch) {
        age = parseInt(ageMatch[0])
        break
      }
    }

    // Extract bio/description - try multiple selectors (including candidate page selectors)
    const bioSelectors = [
      ".bio",
      ".description",
      "[data-bio]",
      ".profile-bio",
      ".user-bio",
      ".about",
      ".about-section",
      ".profile-about",
      ".profile-description",
      ".user-description",
      ".cofounder-card__description",
      ".profile-summary",
      ".details-section",
      "p.description",
      "section.about",
      ".bio-text",
      ".candidate-bio",
      ".candidate-description",
      "[data-candidate-bio]",
      ".cofounder-bio",
      ".about-text",
      ".summary",
      ".candidate-summary",
      "[data-testid='about']",
      "[data-testid='bio']",
      ".css-1tp1ukf", // table details blocks
      ".css-vqx3x2",  // intro paragraph
      ".css-ruq4fr",  // location/age row
      ".css-106je9h"  // extra paragraph block
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
    // Fallback to meta descriptions if no bio found
    if (!bio) {
      const metaDesc =
        document.querySelector("meta[name='description']")?.getAttribute("content") ||
        document.querySelector("meta[property='og:description']")?.getAttribute("content")
      if (metaDesc?.trim()) {
        const trimmed = metaDesc.trim()
        bio = trimmed.length > 4000 ? trimmed.substring(0, 4000) + "..." : trimmed
      }
    }
    // Fallback: pick the longest reasonable paragraph on the page
    if (!bio) {
      const paragraph = Array.from(document.querySelectorAll("p"))
        .map((el) => el.textContent?.trim() || "")
        .filter((t) => t.length >= 60 && t.length <= 5000)
        .sort((a, b) => b.length - a.length)[0]
      if (paragraph) {
        bio = paragraph.length > 4000 ? paragraph.substring(0, 4000) + "..." : paragraph
      }
    }

    // Extract interests/tags - look for common patterns (including candidate page selectors)
    const interestSelectors = [
      ".interest",
      ".tag",
      ".badge",
      "[data-interest]",
      ".skill",
      ".expertise",
      ".topic",
      ".category",
      ".interest-tag",
      ".tag-item",
      "a.tag",
      ".chip",
      ".candidate-tag",
      ".candidate-skill",
      "[data-skill]",
      ".expertise-tag",
      ".technology-tag",
      ".interest-chip",
      ".topics li",
      ".skills li",
      ".interests li",
      ".tags li",
      ".css-1iujaz8",  // shared interests tags
      ".css-17813s4"   // personal interests tags
    ]
    const interestElements: Element[] = []
    for (const selector of interestSelectors) {
      const elements = document.querySelectorAll(selector)
      if (elements.length > 0) {
        interestElements.push(...Array.from(elements))
        break // Use first selector that finds elements
      }
    }

    const interests = interestElements
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .filter((text) => text && text.length < 50) // Filter out long texts
      .slice(0, 10) // Limit to 10 interests
      .map((text) => mapToInterest(text!)) as Interest[]

    // Extract profile URL
    const profileUrl = window.location.href

    // Extract email if available
    const emailSelectors = [
      'a[href^="mailto:"]',
      ".email",
      "[data-email]",
      ".contact-email",
      ".user-email"
    ]
    let email: string | undefined
    for (const selector of emailSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        email =
          element.getAttribute("href")?.replace("mailto:", "") ||
          element.textContent?.trim()
        if (email && email.includes("@")) {
          break
        }
      }
    }

    // Extract from meta tags as fallback
    if (name === "Unknown") {
      const metaName = document.querySelector('meta[property="og:title"]')
      if (metaName) {
        name = metaName.getAttribute("content") || "Unknown"
      }
    }

    if (name === "Unknown") {
      return null
    }

    const profile: CustomerProfile = {
      id: generateProfileId(profileUrl),
      name,
      email,
      country,
      age,
      ageGroup: categorizeAgeGroup(age),
      interests,
      bio,
      profileUrl,
      collectedAt: new Date(),
      messageCount: 0
    }

    return profile
  } catch (error) {
    console.error("Error extracting profile:", error)
    return null
  }
}

/**
 * Maps text to known interest types
 */
function mapToInterest(text: string): Interest {
  const lowerText = text.toLowerCase()
  
  if (lowerText.includes("blockchain") || lowerText.includes("crypto") || lowerText.includes("web3")) {
    return "Blockchain"
  }
  if (lowerText.includes("ai") || lowerText.includes("artificial intelligence") || lowerText.includes("machine learning") || lowerText.includes("ml")) {
    return "AI"
  }
  if (lowerText.includes("full stack") || lowerText.includes("fullstack") || lowerText.includes("full-stack") || lowerText.includes("software development") || lowerText.includes("web development")) {
    return "Full-Stack Development"
  }
  if (lowerText.includes("ecommerce") || lowerText.includes("e-commerce") || lowerText.includes("ecommerce") || lowerText.includes("online store")) {
    return "E-commerce"
  }
  if (lowerText.includes("startup") || lowerText.includes("entrepreneur")) {
    return "Startups"
  }
  if (lowerText.includes("tech") || lowerText.includes("technology") || lowerText.includes("software")) {
    return "Technology"
  }
  if (lowerText.includes("business") || lowerText.includes("marketing") || lowerText.includes("sales")) {
    return "Business"
  }
  
  return "Other"
}

function generateProfileId(url: string): string {
  try {
    const urlObj = new URL(url)
    // Handle candidate URLs: /cofounder-matching/candidate/ID
    if (url.includes("/cofounder-matching/candidate/")) {
      const match = url.match(/\/candidate\/([^\/\?]+)/)
      if (match && match[1]) {
        return match[1]
      }
    }
    // Handle regular profile URLs
    const pathParts = urlObj.pathname.split("/").filter(Boolean)
    return pathParts[pathParts.length - 1] || `profile-${Date.now()}`
  } catch {
    return `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Extracts profile URLs from a directory/list page
 * This finds all links that look like profile pages
 */
export function extractProfileUrlsFromDirectory(document: Document): string[] {
  const profileUrls: string[] = []
  
  try {
    // Common patterns for profile links (including candidate links)
    const linkSelectors = [
      'a[href*="/cofounder-matching/candidate/"]',
      'a[href*="/users/"]',
      'a[href*="/profile/"]',
      'a[href*="/user/"]',
      'a[href*="/people/"]',
      'a[href*="/member/"]',
      '.profile-link',
      '.user-link',
      '.candidate-link',
      '[data-profile-url]',
      '[data-candidate-url]'
    ]

    const links = new Set<string>()
    
    for (const selector of linkSelectors) {
      const elements = document.querySelectorAll<HTMLAnchorElement>(selector)
      elements.forEach((el) => {
        const href = el.href
        if (href && (
          href.includes("/cofounder-matching/candidate/") ||
          href.includes("/users/") ||
          href.includes("/profile/") ||
          href.includes("/user/")
        )) {
          try {
            const url = new URL(href)
            links.add(url.href)
          } catch {
            // Invalid URL, skip
          }
        }
      })
    }

    profileUrls.push(...Array.from(links))
  } catch (error) {
    console.error("Error extracting profile URLs:", error)
  }

  return profileUrls
}

/**
 * Collects profile from the current active tab
 */
export async function collectProfileFromCurrentTab(): Promise<CustomerProfile | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!tab.id || !tab.url) {
      throw new Error("No active tab found")
    }

    // Check if it's a startupschool.org URL
    if (!tab.url.includes("startupschool.org")) {
      throw new Error("Not a startupschool.org page")
    }

    // Inject content script and extract profile
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProfileScript
    })

    if (results && results[0]?.result) {
      return results[0].result as CustomerProfile
    }

    return null
  } catch (error) {
    console.error("Error collecting profile from current tab:", error)
    throw error
  }
}

/**
 * Function to be injected into the page
 */
function extractProfileScript(): CustomerProfile | null {
  // This function runs in the page context
  // We'll use the same extraction logic but need to pass it differently
  // For now, return a message that the content script should handle it
  return null
}

/**
 * Collects profiles from a list of URLs
 */
export async function collectProfilesFromUrls(
  urls: string[]
): Promise<CustomerProfile[]> {
  const profiles: CustomerProfile[] = []

  for (const url of urls) {
    try {
      // Open tab, wait for load, extract, close tab
      const tab = await chrome.tabs.create({ url, active: false })
      
      // Wait for tab to load
      await new Promise((resolve) => {
        const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (tabId === tab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener)
            resolve(undefined)
          }
        }
        chrome.tabs.onUpdated.addListener(listener)
      })

      // Wait a bit for dynamic content
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Extract profile
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          // This would need to be a serializable function
          // For now, we'll use the content script approach
          return null
        }
      })

      // Close tab
      await chrome.tabs.remove(tab.id!)

      // Note: Actual extraction happens via content script
      // This is a placeholder for the structure
    } catch (error) {
      console.error(`Error collecting profile from ${url}:`, error)
    }
  }

  return profiles
}
