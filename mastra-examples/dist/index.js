"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mastra = void 0;
const mastra_1 = require("@mastra/core/mastra");
const inngest_1 = require("@mastra/inngest");
const logger_1 = require("@mastra/core/logger");
const inngest_2 = require("inngest");
const inngest_workflow_2_1 = require("./workflows/inngest-workflow-2");
const planning_agent_1 = require("./agents/planning-agent");
const realtime_1 = require("@inngest/realtime");
const inngest = new inngest_2.Inngest({
    id: 'mastra',
    baseUrl: `http://localhost:8288`,
    isDev: true,
    middleware: [(0, realtime_1.realtimeMiddleware)()],
});
exports.mastra = new mastra_1.Mastra({
    vnext_workflows: {
        activityPlanningWorkflow: inngest_workflow_2_1.activityPlanningWorkflow,
    },
    agents: {
        planningAgent: planning_agent_1.planningAgent,
    },
    server: {
        host: '0.0.0.0',
        apiRoutes: [
            {
                path: '/inngest/api',
                method: 'ALL',
                createHandler: (_a) => __awaiter(void 0, [_a], void 0, function* ({ mastra }) { return (0, inngest_1.serve)({ mastra, inngest }); }),
            },
        ],
    },
    logger: (0, logger_1.createLogger)({
        name: 'Mastra',
        level: 'info',
    }),
});
