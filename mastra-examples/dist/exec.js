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
const _1 = require("./");
const node_server_1 = require("@hono/node-server");
const server_1 = require("@mastra/deployer/server");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const app = yield (0, server_1.createHonoServer)(_1.mastra);
        const srv = (0, node_server_1.serve)({
            fetch: app.fetch,
            port: 3000,
        });
        // Example 2
        const workflow = _1.mastra.vnext_getWorkflow('activityPlanningWorkflow');
        const run = workflow.createRun({});
        const result = yield run.start({ inputData: { city: 'New York' } });
        console.dir(result, { depth: null });
        srv.close();
    });
}
main();
