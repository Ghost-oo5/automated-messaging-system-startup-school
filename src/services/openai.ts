import OpenAI from "openai"
import type { CustomerProfile } from "~/types"

let openaiClient: OpenAI | null = null

export function initializeOpenAI(apiKey: string): void {
  openaiClient = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Required for browser extensions
  })
}

export function isOpenAIConfigured(): boolean {
  return openaiClient !== null
}

export async function generatePersonalizedMessage(
  profile: CustomerProfile,
  model: string = "gpt-4o-mini"
): Promise<string> {
  if (!openaiClient) {
    throw new Error("OpenAI client not initialized. Please set API key.")
  }

  const prompt = createPrompt(profile)

  try {
    const response = await openaiClient.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that writes personalized, professional messages for networking on YCStartupSchool. 
          Your messages should be:
          - Genuine and authentic (not spammy)
          - Personalized based on the profile information
          - Professional but friendly
          - Concise (2-3 sentences)
          - Focused on building genuine connections
          - Never use generic templates or spam-like language
          - Vary your tone and approach naturally`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8, // Higher temperature for more variation
      max_tokens: 150
    })

    const message = response.choices[0]?.message?.content?.trim()
    if (!message) {
      throw new Error("No message generated from OpenAI")
    }

    return message
  } catch (error) {
    console.error("OpenAI API error:", error)
    throw error
  }
}

function createPrompt(profile: CustomerProfile): string {
  let prompt = `Generate a personalized message for this YCStartupSchool member:\n\n`
  prompt += `Name: ${profile.name}\n`

  if (profile.country) {
    prompt += `Location: ${profile.country}\n`
  }

  if (profile.ageGroup && profile.ageGroup !== "unknown") {
    prompt += `Age Group: ${profile.ageGroup}\n`
  }

  if (profile.interests && profile.interests.length > 0) {
    prompt += `Interests: ${profile.interests.join(", ")}\n`
  }

  if (profile.bio) {
    prompt += `Bio: ${profile.bio}\n`
  }

  prompt += `\nWrite a brief, personalized message that feels natural and genuine. Make it specific to their profile.`

  return prompt
}

export async function analyzeProfile(profile: CustomerProfile): Promise<{
  suggestedInterests: string[]
  tone: string
  keyPoints: string[]
}> {
  if (!openaiClient) {
    throw new Error("OpenAI client not initialized")
  }

  const prompt = `Analyze this YCStartupSchool profile and provide:
1. Suggested interests (from: Blockchain, AI, Full-Stack Development, E-commerce, Startups, Technology, Business)
2. Appropriate tone for messaging (professional, casual, technical, etc.)
3. Key points to mention in a message

Profile:
Name: ${profile.name}
Country: ${profile.country || "Unknown"}
Bio: ${profile.bio || "No bio available"}
Interests: ${profile.interests?.join(", ") || "None specified"}`

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a profile analysis assistant. Return JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    })

    const analysis = JSON.parse(response.choices[0]?.message?.content || "{}")
    return {
      suggestedInterests: analysis.suggestedInterests || [],
      tone: analysis.tone || "professional",
      keyPoints: analysis.keyPoints || []
    }
  } catch (error) {
    console.error("Profile analysis error:", error)
    return {
      suggestedInterests: [],
      tone: "professional",
      keyPoints: []
    }
  }
}
