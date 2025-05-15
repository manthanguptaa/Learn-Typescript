import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import dotenv from 'dotenv'

dotenv.config()

const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})
 
const synthesizeAgent = new Agent({
  name: 'synthesizeAgent',
  model: openai('gpt-4o'),
  instructions: `
  You are given two different blocks of text, one about indoor activities and one about outdoor activities.
  Make this into a full report about the day and the possibilities depending on whether it rains or not.
  `,
})
 
export { synthesizeAgent }