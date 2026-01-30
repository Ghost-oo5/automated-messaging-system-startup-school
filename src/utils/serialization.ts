import type { CustomerProfile } from "~/types"


export function serializeProfile(profile: CustomerProfile): any {
  const safeDate = (value: any, fallbackNow = false) => {
    const d =
      value instanceof Date ? value : value ? new Date(value) : fallbackNow ? new Date() : null
    return d && !Number.isNaN(d.getTime()) ? d : fallbackNow ? new Date() : null
  }

  const collected = safeDate(profile.collectedAt, true)
  const lastSent = safeDate(profile.lastMessageSent, false)

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    country: profile.country,
    age: profile.age,
    ageGroup: profile.ageGroup,
    interests: profile.interests ? [...profile.interests] : undefined,
    bio: profile.bio,
    profileUrl: profile.profileUrl,
    collectedAt: collected ? collected.toISOString() : new Date().toISOString(),
    lastMessageSent: lastSent ? lastSent.toISOString() : undefined,
    messageCount: profile.messageCount || 0
  }
}

/**
 * Deserializes a profile from Chrome message passing
 * Converts date strings back to Date objects
 */
export function deserializeProfile(profileData: any): CustomerProfile {
  return {
    id: profileData.id,
    name: profileData.name,
    email: profileData.email,
    country: profileData.country,
    age: profileData.age,
    ageGroup: profileData.ageGroup,
    interests: profileData.interests ? [...profileData.interests] : undefined,
    bio: profileData.bio,
    profileUrl: profileData.profileUrl,
    collectedAt: profileData.collectedAt 
      ? (profileData.collectedAt instanceof Date 
        ? profileData.collectedAt 
        : new Date(profileData.collectedAt))
      : new Date(),
    lastMessageSent: profileData.lastMessageSent
      ? (profileData.lastMessageSent instanceof Date
        ? profileData.lastMessageSent
        : new Date(profileData.lastMessageSent))
      : undefined,
    messageCount: profileData.messageCount || 0
  }
}
