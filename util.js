"use strict";
// export function add(a: number, b: number): number {
//     return a + b;
// }
Object.defineProperty(exports, "__esModule", { value: true });
exports.mul = mul;
exports.add = add;
exports.sub = sub;
function add(a, b) {
    return a + b;
}
function sub(a, b) {
    return a - b;
}
function mul(a, b) {
    return a * b;
}
function test() {
    return "test";
}
exports.default = test; // only one default export per file
