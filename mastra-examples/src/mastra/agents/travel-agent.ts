import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import dotenv from 'dotenv'
 
dotenv.config()

const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})
 
export const summaryTravelAgent = new Agent({
  name: 'summaryTravelAgent',
  model: openai('gpt-4o'),
  instructions: `
  You are a travel agent who is given a user prompt about what kind of holiday they want to go on.
  You then generate 3 different options for the holiday. Return the suggestions as a JSON array {"location": "string", "description": "string"}[]. Don't format as markdown.
 
  Make the options as different as possible from each other.
  Also make the plan very short and summarized.
  `,
})
export const travelAgent = new Agent({
  name: 'travelAgent',
  model: openai('gpt-4o'),
  instructions: `
  You are a travel agent who is given a user prompt about what kind of holiday they want to go on. A summary of the plan is provided as well as the location.
  You then generate a detailed travel plan for the holiday.
  `,
})