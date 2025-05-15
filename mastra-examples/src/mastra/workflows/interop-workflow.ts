import { createWorkflow, createStep } from '@mastra/core/workflows/vNext'
import { weatherTool } from '../tools/weather-tool'
import { weatherReporterAgent } from '../agents/weather-reporter-agent'
import { z } from 'zod'

const fetchWeather = createStep(weatherTool)
const reportWeather = createStep(weatherReporterAgent)

const weatherWorkflow = createWorkflow({
  steps: [fetchWeather, reportWeather],
  id: 'weather-workflow-step1-single-day',
  inputSchema: z.object({
    location: z.string().describe('The city to get the weather for'),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
})
  .then(fetchWeather)
  .then(
    createStep({
      id: 'report-weather',
      inputSchema: fetchWeather.outputSchema,
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: async ({ inputData, mastra }) => {
        const prompt = 'Forecast data: ' + JSON.stringify(inputData)
        const agent = mastra.getAgent('weatherReporterAgent')
        const result = await agent.generate([
          {
            role: 'user',
            content: prompt,
          },
        ])
        return { text: result.text }
      },
    })
  )

weatherWorkflow.commit()

export { weatherWorkflow }