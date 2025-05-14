import { Mastra } from '@mastra/core/mastra'
import { createLogger } from '@mastra/core/logger'
import { LibSQLStore } from '@mastra/libsql'
import { travelAgentWorkflow } from './workflows'
import { travelAgent, summaryTravelAgent } from './agents'
 
const mastra = new Mastra({
  vnext_workflows: {
    travelAgentWorkflow,
  },
  agents: {
    travelAgent,
    summaryTravelAgent
  },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
})
 
export { mastra }