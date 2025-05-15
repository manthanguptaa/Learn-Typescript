import { createOpenAI } from '@ai-sdk/openai'
import dotenv from 'dotenv'
import { Agent } from '@mastra/core/agent'

 
dotenv.config()

const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export const weatherReporterAgent = new Agent({
  name: 'weatherExplainerAgent',
  model: openai('gpt-4o'),
  instructions: `
  You are an weather explainer. 
  You have access to input that will help you get weather-specific activities for any city. 
  The tool uses agents to plan the activities, you just need to provide the city. 
  Explain the weather report like a weather reporter.
  `,
})