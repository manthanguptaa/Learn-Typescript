import { Mastra } from '@mastra/core/mastra'
import { serve as inngestServe } from '@mastra/inngest'
import { createLogger } from '@mastra/core/logger'
import { Inngest } from 'inngest'
import { activityPlanningWorkflow } from './workflows'
import { planningAgent } from './agents'
import { realtimeMiddleware } from '@inngest/realtime'
import { VercelDeployer } from "@mastra/deployer-vercel";
import { serve } from '@hono/node-server'
import { createHonoServer } from '@mastra/deployer/server'

const inngest = new Inngest({
  id: 'mastra',
  baseUrl: `http://localhost:8288`,
  isDev: true,
  middleware: [realtimeMiddleware()],
})

export const mastra = new Mastra({
  vnext_workflows: {
    activityPlanningWorkflow,
  },
  agents: {
    planningAgent,
  },
  server: {
    host: '0.0.0.0',
    apiRoutes: [
      {
        path: '/inngest/api',
        method: 'ALL',
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },
    ],
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  deployer: new VercelDeployer({
    teamSlug: "manthanguptaas-projects",
    projectName: "your-project-name",
    token: "gtBT8E7RxQ8ZMNHSjKZ1etLK",
  }),
})

async function main() {
    const app = await createHonoServer(mastra)

    const srv = serve({
        fetch: app.fetch,
        port: 3000,
    })

    // Example 2
    const workflow = mastra.vnext_getWorkflow('activityPlanningWorkflow')
    const run = workflow.createRun({})
    const result = await run.start({ inputData: { city: 'New York' } })
    console.dir(result, { depth: null })


    srv.close()
}

main()