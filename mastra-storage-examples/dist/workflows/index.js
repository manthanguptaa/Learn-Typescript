var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { z } from 'zod';
import { createWorkflow, createStep } from "@mastra/core/workflows/vNext";
// Helper function to convert weather codes to human-readable conditions
function getWeatherCondition(code) {
    const conditions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Slight snow fall",
        73: "Moderate snow fall",
        75: "Heavy snow fall",
        95: "Thunderstorm",
    };
    return conditions[code] || "Unknown";
}
const forecastSchema = z.object({
    date: z.string(),
    maxTemp: z.number(),
    minTemp: z.number(),
    precipitationChance: z.number(),
    condition: z.string(),
    location: z.string(),
});
// Step to fetch weather data for a given city
// Makes API calls to get current weather conditions and forecast
const fetchWeather = createStep({
    id: "fetch-weather",
    description: "Fetches weather forecast for a given city",
    inputSchema: z.object({
        city: z.string(),
    }),
    outputSchema: forecastSchema,
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
        var _b;
        if (!inputData) {
            throw new Error("Trigger data not found");
        }
        const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
        const geocodingResponse = yield fetch(geocodingUrl);
        const geocodingData = (yield geocodingResponse.json());
        if (!((_b = geocodingData.results) === null || _b === void 0 ? void 0 : _b[0])) {
            throw new Error(`Location '${inputData.city}' not found`);
        }
        const { latitude, longitude, name } = geocodingData.results[0];
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
        const response = yield fetch(weatherUrl);
        const data = (yield response.json());
        const forecast = {
            date: new Date().toISOString(),
            maxTemp: Math.max(...data.hourly.temperature_2m),
            minTemp: Math.min(...data.hourly.temperature_2m),
            condition: getWeatherCondition(data.current.weathercode),
            location: name,
            precipitationChance: data.hourly.precipitation_probability.reduce((acc, curr) => Math.max(acc, curr), 0),
        };
        return forecast;
    }),
});
// Step to plan activities based on weather conditions
// Uses the planning agent to generate activity recommendations
const planActivities = createStep({
    id: "plan-activities",
    description: "Suggests activities based on weather conditions",
    inputSchema: forecastSchema,
    outputSchema: z.object({
        activities: z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra }) {
        var _b, e_1, _c, _d;
        const forecast = inputData;
        if (!forecast) {
            throw new Error("Forecast data not found");
        }
        const prompt = `Based on the following weather forecast for ${forecast.location}, suggest appropriate activities:
      ${JSON.stringify(forecast, null, 2)}
      `;
        const agent = mastra === null || mastra === void 0 ? void 0 : mastra.getAgent("planningAgent");
        if (!agent) {
            throw new Error("Planning agent not found");
        }
        const response = yield agent.stream([
            {
                role: "user",
                content: prompt,
            },
        ]);
        let activitiesText = "";
        try {
            for (var _e = true, _f = __asyncValues(response.textStream), _g; _g = yield _f.next(), _b = _g.done, !_b; _e = true) {
                _d = _g.value;
                _e = false;
                const chunk = _d;
                process.stdout.write(chunk);
                activitiesText += chunk;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_e && !_b && (_c = _f.return)) yield _c.call(_f);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return {
            activities: activitiesText,
        };
    }),
});
// Step to plan indoor activities only
// Used when precipitation chance is high
const planIndoorActivities = createStep({
    id: "plan-indoor-activities",
    description: "Suggests indoor activities based on weather conditions",
    inputSchema: forecastSchema,
    outputSchema: z.object({
        activities: z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData, mastra }) {
        var _b, e_2, _c, _d;
        const forecast = inputData;
        if (!forecast) {
            throw new Error("Forecast data not found");
        }
        const prompt = `In case it rains, plan indoor activities for ${forecast.location} on ${forecast.date}`;
        const agent = mastra === null || mastra === void 0 ? void 0 : mastra.getAgent("planningAgent");
        if (!agent) {
            throw new Error("Planning agent not found");
        }
        const response = yield agent.stream([
            {
                role: "user",
                content: prompt,
            },
        ]);
        let activitiesText = "";
        try {
            for (var _e = true, _f = __asyncValues(response.textStream), _g; _g = yield _f.next(), _b = _g.done, !_b; _e = true) {
                _d = _g.value;
                _e = false;
                const chunk = _d;
                process.stdout.write(chunk);
                activitiesText += chunk;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_e && !_b && (_c = _f.return)) yield _c.call(_f);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return {
            activities: activitiesText,
        };
    }),
});
// Main workflow that:
// 1. Fetches weather data
// 2. Branches based on precipitation chance:
//    - If >50%: Plans indoor activities
//    - If <=50%: Plans outdoor activities
const activityPlanningWorkflow = createWorkflow({
    id: 'activity-planning-workflow-step2-if-else',
    inputSchema: z.object({
        city: z.string().describe("The city to get the weather for"),
    }),
    outputSchema: z.object({
        activities: z.string(),
    }),
})
    .then(fetchWeather)
    .branch([
    // Branch for high precipitation (indoor activities)
    [
        (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
            return (inputData === null || inputData === void 0 ? void 0 : inputData.precipitationChance) > 50;
        }),
        planIndoorActivities,
    ],
    // Branch for low precipitation (outdoor activities)
    [
        (_a) => __awaiter(void 0, [_a], void 0, function* ({ inputData }) {
            return (inputData === null || inputData === void 0 ? void 0 : inputData.precipitationChance) <= 50;
        }),
        planActivities,
    ],
]);
activityPlanningWorkflow.commit();
export { activityPlanningWorkflow };
