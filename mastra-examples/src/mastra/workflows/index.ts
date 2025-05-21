import { init } from '@mastra/inngest'
import { inngest } from '../inngest'

// Initialize Inngest with Mastra, pointing to your local Inngest server
const { createWorkflow, createStep } = init(inngest)

import { z } from 'zod'

// Step 1: Increment the counter value
const incrementStep = createStep({
  id: 'increment',
  inputSchema: z.object({
    value: z.number(),
  }),
  outputSchema: z.object({
    value: z.number(),
  }),
  execute: async ({ inputData }) => {
    return { value: inputData.value + 1 }
  },
})

// Step 2: Log the current value (side effect)
const sideEffectStep = createStep({
  id: 'side-effect',
  inputSchema: z.object({
    value: z.number(),
  }),
  outputSchema: z.object({
    value: z.number(),
  }),
  execute: async ({ inputData }) => {
    console.log('Current value:', inputData.value)
    return { value: inputData.value }
  },
})

// Step 3: Final step after loop completion
const finalStep = createStep({
  id: 'final',
  inputSchema: z.object({
    value: z.number(),
  }),
  outputSchema: z.object({
    value: z.number(),
  }),
  execute: async ({ inputData }) => {
    return { value: inputData.value }
  },
})

// Create the main workflow that uses a do-until loop
const workflow = createWorkflow({
  id: 'increment-workflow',
  inputSchema: z.object({
    value: z.number(),
  }),
  outputSchema: z.object({
    value: z.number(),
  }),
})
  // Loop until the condition is met (value reaches 10)
  .dountil(
    createWorkflow({
      id: 'increment-subworkflow',
      inputSchema: z.object({
        value: z.number(),
      }),
      outputSchema: z.object({
        value: z.number(),
      }),
      steps: [incrementStep, sideEffectStep],
    })
      .then(incrementStep)
      .then(sideEffectStep)
      .commit(),
    async ({ inputData }) => inputData.value >= 10
  )
  .then(finalStep)

workflow.commit()

export { workflow as incrementWorkflow }