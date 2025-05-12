var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _BankAccount_balanceHash;
var BankAccount = /** @class */ (function () {
    function BankAccount() {
        this.balancePrivate = 1000;
        _BankAccount_balanceHash.set(this, 2000);
    }
    BankAccount.prototype.showBalances = function () {
        console.log("TypeScript private:", this.balancePrivate);
        console.log("JS private:", __classPrivateFieldGet(this, _BankAccount_balanceHash, "f"));
    };
    return BankAccount;
}());
_BankAccount_balanceHash = new WeakMap();
var account = new BankAccount();
// In JavaScript after compilation:
console.log(account["balancePrivate"]); // Works! Returns 1000
// console.log(account["#balanceHash"]);    // Undefined
// console.log(account.#balanceHash);       // SyntaxError
// When inspecting:
JSON.stringify(account); // {"balancePrivate":1000} - no #balanceHash
