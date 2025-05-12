"use strict";
var _a, _b, _c;
const x = 2;
console.log(x);
function test(x) {
    return x + 1;
}
console.log(test(x));
function print(x) {
    console.log(x);
}
let direction;
let responseCode;
var Size;
(function (Size) {
    Size[Size["Small"] = 1] = "Small";
    Size[Size["Medium"] = 2] = "Medium";
    Size[Size["Large"] = 3] = "Large";
})(Size || (Size = {}));
let size = Size.Small;
var Direction;
(function (Direction) {
    Direction["Up"] = "UP";
    Direction["Down"] = "DOWN";
    Direction["Left"] = "LEFT";
    Direction["Right"] = "RIGHT";
})(Direction || (Direction = {}));
let dir = Direction.Up;
let y = 1; // ignores type checking
console.log(y.length); // doesn't throw an error
let z = 1;
// console.log(z.length); // throws an error because z isn't checked to be a string
if (typeof z === "number") {
    const result = z * 2;
    console.log(result);
}
else {
    // const result = z.toString(); // throws an error because z isn't checked to be a string
}
let a = 1;
const result = a * 2; // type casting
function processFeedback(input) {
    console.log(`Processing: ${input}`);
}
processFeedback("Hello"); // no error
processFeedback(123); // no error
processFeedback(new Blob()); // no error
function processFeedback2(input) {
    if (typeof input === "string") {
        console.log(`Processing string: ${input}`);
    }
    else if (typeof input === "number") {
        console.log(`Processing number: ${input}`);
    }
    else if (input instanceof Blob) {
        console.log(`Processing Blob: ${input}`);
    }
    else {
        console.log("Unknown input type");
    }
}
processFeedback2("Hello");
processFeedback2(123);
processFeedback2(new Blob());
const arr = [{ name: "John" }, { name: "Jane" }, { name: "Jim" }];
const el = (_a = arr.pop()) === null || _a === void 0 ? void 0 : _a.name;
// Optional chaining operator (?) - safely accesses properties that might be undefined
// If arr.pop() returns undefined, the entire expression returns undefined instead of throwing error
const arr2 = [[{ name: "Tim" }]];
const el2 = (_c = (_b = arr2.pop()) === null || _b === void 0 ? void 0 : _b.pop()) === null || _c === void 0 ? void 0 : _c.name;
// Multiple ? operators chain together
// Checks each step for undefined before continuing
const arr3 = [[{ name: "Tim" }]];
const el3 = arr3.pop().pop().name;
// Non-null assertion operator (!) - tells TypeScript that a value cannot be null/undefined
// Use with caution - will throw runtime error if assertion is wrong
// Functions
function add(a, b) {
    return a + b;
}
const num_result = add(1, 2);
// optional parameters
function makeName(firstName, lastName, middleName) {
    if (middleName)
        return firstName + " " + middleName + " " + lastName;
    return firstName + " " + lastName;
}
const name1 = makeName("John", "Doe");
// default parameters
function makeName2(firstName, lastName, middleName = "Michael") {
    return firstName + " " + middleName + " " + lastName;
}
const name3 = makeName2("John", "Doe");
function callFunc(func, param1, param2) {
    return func(param1, param2);
}
const res = callFunc(makeName, "John", "Doe");
function mul(a, b) {
    return a * b;
}
function div(a, b) {
    return a / b;
}
function applyFunc(funcs, values) {
    const results = [];
    for (let i = 0; i < funcs.length; i++) {
        const args = values[i];
        const result = funcs[i](args[0], args[1]);
        results.push(result);
    }
    return results;
}
const results = applyFunc([mul, div], [[1, 2], [4, 5]]);
function sum(...numbers) {
    let total = 0;
    for (const num of numbers) {
        total += num;
    }
    return total;
}
const sumResult = sum(1, 2, 3, 4);
function getItemLength(nameOrNames) {
    if (typeof nameOrNames === "string") {
        return nameOrNames.length;
    }
    else if (Array.isArray(nameOrNames)) {
        return nameOrNames.length;
    }
    return 0;
}
const length1 = getItemLength("John");
const length2 = getItemLength(["John", "Jane", "Jim"]);
const person = {
    name: "Manthan Gupta",
    age: 20,
    hello: function () {
        console.log(this.name + " says hello");
    }
};
person.hello();
const worker = {
    name: "John Doe",
    age: 30,
    height: 180,
    employeeId: 123,
    hello: function () {
        console.log(this.name + " says hello");
    }
};
function getPerson(p) {
    return {
        name: p.name,
        age: p.age,
        hello: p.hello
    };
}
const person2 = getPerson(person);
class PersonEntity {
    constructor(name, age, height) {
        this.name = name;
        this.age = age;
        this.height = height;
        this.greet();
    }
    greet() {
        console.log(`Hello, my name is ${this.name}`);
    }
    getHeight() {
        return this.height;
    }
    setHeight(height) {
        this.height = height;
    }
}
class EmployeeEntity extends PersonEntity {
    callMe() {
        console.log(this.age); // can access protected property
    }
}
const p1 = new PersonEntity("Manthan", 20, 180);
// p1.greet(); // can't access private method
p1.getHeight();
// Abstract classes
class Animal {
    move(duration) {
        console.log("Moving...");
        this.makeSound(duration);
    }
}
// const animal = new Animal(); // can't create an instance of an abstract class
class Dog extends Animal {
    makeSound(duration) {
        console.log("Woof!");
    }
}
const dog = new Dog();
dog.move(10);
class Cat extends Animal {
    makeSound(duration) {
        console.log("Meow!");
    }
}
class Dog1 {
    constructor(name, color) {
        this.name = name;
        this.color = color;
    }
    speak() {
        console.log("Woof!");
    }
    test() {
        return 1;
    }
}
const dog1 = new Dog1("Buddy", "Brown");
dog1.speak();
class Cat1 {
    speak() {
        console.log("Meow!");
    }
}
const cat1 = new Cat1();
const animals = [dog1, cat1];
function makeSound(animal) {
    animal.speak();
}
makeSound(dog1);
makeSound(cat1);
// difference between abstract class and interface
// Abstract class can have concrete methods and properties
// Interface can only have method signatures
// Abstract class can have private and protected members
// Interface can only have public members
class Dog2 {
    constructor(name) {
        this.name = name;
        Dog2.instanceCount++;
    }
    static decreaseCount() {
        this.instanceCount--;
    }
}
Dog2.instanceCount = 0; // static property is shared by all instances of Dog2
const dog3 = new Dog2("Buddy");
const dog4 = new Dog2("Buddy");
console.log(Dog2.instanceCount); // instanceCount is shared by all instances of Dog2 so value is 2
Dog2.decreaseCount();
console.log(Dog2.instanceCount); // instanceCount is shared by all instances of Dog2 so value is 1
class DataStore {
    constructor() {
        this.items = [];
    }
    addItem(item) {
        this.items.push(item);
    }
    getItems(index) {
        return this.items[index];
    }
    removeItem(index) {
        this.items.splice(index, 1);
    }
    getAllItems() {
        return this.items;
    }
}
const dataStore = new DataStore();
dataStore.addItem(1);
// class DataStoreString {
//     private items: string[] = [];
//     addItem(item: string) {
//         this.items.push(item);
//     }
//     getItems(index: number) {
//         return this.items[index];
//     }
//     removeItem(index: number) {
//         this.items.splice(index, 1);
//     }
//     getAllItems() {
//         return this.items;
//     }
// }
// This isn't ideal to create another class just to change the type of the items
// this is where generics come in
class DataStoreGeneric {
    constructor() {
        this.items = [];
    }
    addItem(item) {
        this.items.push(item);
    }
    getItems(index) {
        return this.items[index];
    }
    removeItem(index) {
        this.items.splice(index, 1);
    }
    getAllItems() {
        return this.items;
    }
}
const dataStoreGeneric = new DataStoreGeneric();
dataStoreGeneric.addItem(1);
const userDataStore = new DataStoreGeneric();
userDataStore.addItem({ name: "John", id: "123" });
function getValue(key, value1, value2) {
    if (key) {
        return value1;
    }
    return value2;
}
getValue("hello", 1, 2);
getValue("hello", 1, 2);
function compareCoords(p1, p2) {
    return [p1[0], p2[1]];
}
const coords = [];
function acceptVal(val) { }
const contact = {
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "1234567890"
};
function addContact(contact) {
    if ("birthday" in contact) {
        console.log(contact.name, contact.birthday);
    }
    else {
        console.log(contact.companyName, contact.workPhone);
    }
}
function add1(value) {
    if (typeof value === "string") {
        return value + "1";
    }
    else {
        return value + 1;
    }
}
class Dog3 {
    constructor(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
    }
}
class Cat3 {
    constructor(firstName) {
        this.firstName = firstName;
    }
}
function getName(animal) {
    if (animal instanceof Dog3) {
        return animal.firstName + " " + animal.lastName;
    }
    else if (animal instanceof Cat3) {
        return animal.firstName;
    }
}
function getName1(animal) {
    if ("lastName" in animal) {
        return animal.firstName + " " + animal.lastName;
    }
    else {
        return animal.firstName;
    }
}
// pet is Dog3 is the type guard -> It tells that this function is returning a boolean and checking if the pet is a Dog3
function isDog(pet) {
    return pet.firstName !== undefined;
}
let log;
function handleMsg(log) {
    switch (log.type) {
        case "warning":
            console.log(log.msg);
            break;
        case "info":
            console.log(log.text);
            break;
        case "success":
            console.log(log.message);
            break;
    }
}
