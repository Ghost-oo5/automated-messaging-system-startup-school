import type { CustomerProfile } from "~/types"

/**
 * Serializes a profile for Chrome message passing
 * Converts all non-serializable types (Dates, etc.) to serializable formats
 */
export function serializeProfile(profile: CustomerProfile): any {
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
    collectedAt: profile.collectedAt instanceof Date 
      ? profile.collectedAt.toISOString() 
      : (profile.collectedAt ? new Date(profile.collectedAt).toISOString() : new Date().toISOString()),
    lastMessageSent: profile.lastMessageSent instanceof Date
      ? profile.lastMessageSent.toISOString()
      : (profile.lastMessageSent ? new Date(profile.lastMessageSent).toISOString() : undefined),
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
