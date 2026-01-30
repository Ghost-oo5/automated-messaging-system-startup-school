import type { CustomerProfile, FilterSettings, AgeGroup } from "~/types"

export function categorizeAgeGroup(age: number | undefined): AgeGroup {
  if (!age) return "unknown"
  if (age >= 18 && age <= 25) return "18-25"
  if (age >= 26 && age <= 35) return "26-35"
  if (age >= 36 && age <= 45) return "36-45"
  if (age >= 46 && age <= 55) return "46-55"
  if (age >= 56) return "56+"
  return "unknown"
}

export function matchesFilters(
  profile: CustomerProfile,
  filters: FilterSettings
): boolean {
  // Country filter
  if (filters.countries && filters.countries.length > 0) {
    if (!profile.country || !filters.countries.includes(profile.country)) {
      return false
    }
  }

  // Age group filter
  if (filters.ageGroups && filters.ageGroups.length > 0) {
    const profileAgeGroup = profile.ageGroup || categorizeAgeGroup(profile.age)
    if (!filters.ageGroups.includes(profileAgeGroup)) {
      return false
    }
  }

  // Age range filter
  if (profile.age) {
    if (filters.minAge && profile.age < filters.minAge) {
      return false
    }
    if (filters.maxAge && profile.age > filters.maxAge) {
      return false
    }
  }

  // Interest filter
  if (filters.interests && filters.interests.length > 0) {
    if (!profile.interests || profile.interests.length === 0) {
      return false
    }
    const hasMatchingInterest = profile.interests.some((interest) =>
      filters.interests!.includes(interest)
    )
    if (!hasMatchingInterest) {
      return false
    }
  }

  return true
}

export function filterProfiles(
  profiles: CustomerProfile[],
  filters: FilterSettings
): CustomerProfile[] {
  return profiles.filter((profile) => matchesFilters(profile, filters))
}
