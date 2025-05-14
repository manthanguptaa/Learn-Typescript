import { Mastra } from '@mastra/core/mastra'
import { createLogger } from '@mastra/core/logger'
import { travelAgentWorkflow } from './workflows/human-in-the-loop-workflow'
import { summaryTravelAgent, travelAgent } from './agents/travel-agent'
 
const mastra = new Mastra({
  vnext_workflows: {
    travelAgentWorkflow,
  },
  agents: {
    travelAgent,
	  summaryTravelAgent
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
})
 
export { mastra }