// export function add(a: number, b: number): number {
//     return a + b;
// }

function add(a: number, b: number): number {
    return a + b;
}

function sub(a: number, b: number): number {
    return a - b;
}

export function mul(a: number, b: number): number {
    return a * b;
}

function test() {
    return "test";
}

export { add, sub};
export default test; // only one default export per file