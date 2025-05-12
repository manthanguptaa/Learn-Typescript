class BankAccount {
    private balancePrivate = 1000;
    #balanceHash = 2000;

    showBalances(){
        console.log("TypeScript private:", this.balancePrivate);
        console.log("JS private:", this.#balanceHash);
    }
}

const account = new BankAccount();

// In JavaScript after compilation:
console.log(account["balancePrivate"]);  // Works! Returns 1000
// console.log(account["#balanceHash"]);    // Undefined
// console.log(account.#balanceHash);       // SyntaxError

// When inspecting:
JSON.stringify(account);  // {"balancePrivate":1000} - no #balanceHash