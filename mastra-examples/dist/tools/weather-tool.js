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
exports.weatherTool = void 0;
const tools_1 = require("@mastra/core/tools");
const zod_1 = require("zod");
exports.weatherTool = (0, tools_1.createTool)({
    id: 'get-weather',
    description: 'Get current weather for a location',
    inputSchema: zod_1.z.object({
        location: zod_1.z.string().describe('City name'),
    }),
    outputSchema: zod_1.z.object({
        temperature: zod_1.z.number(),
        feelsLike: zod_1.z.number(),
        humidity: zod_1.z.number(),
        windSpeed: zod_1.z.number(),
        windGust: zod_1.z.number(),
        conditions: zod_1.z.string(),
        location: zod_1.z.string(),
    }),
    execute: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context }) {
        return yield getWeather(context.location);
    }),
});
const getWeather = (location) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geocodingResponse = yield fetch(geocodingUrl);
    const geocodingData = (yield geocodingResponse.json());
    if (!((_a = geocodingData.results) === null || _a === void 0 ? void 0 : _a[0])) {
        throw new Error(`Location '${location}' not found`);
    }
    const { latitude, longitude, name } = geocodingData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;
    const response = yield fetch(weatherUrl);
    const data = (yield response.json());
    return {
        temperature: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        windGust: data.current.wind_gusts_10m,
        conditions: getWeatherCondition(data.current.weather_code),
        location: name,
    };
});
function getWeatherCondition(code) {
    const conditions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
    };
    return conditions[code] || 'Unknown';
}
