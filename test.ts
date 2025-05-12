const x: number = 2;
console.log(x);

function test(x: number): number {
    return x + 1;
}

console.log(test(x));

function print(x: number): void {
    console.log(x);
}

let direction: "north" | "south" | "east" | "west";
let responseCode: 200 | 400 | 500;

enum Size {
    Small = 1,
    Medium,
    Large,
}

let size: Size = Size.Small;

enum Direction {
    Up = "UP",
    Down = "DOWN",
    Left = "LEFT",
    Right = "RIGHT",
}

let dir: Direction = Direction.Up;

let y: any = 1 // ignores type checking

console.log(y.length); // doesn't throw an error

let z: unknown = 1;

// console.log(z.length); // throws an error because z isn't checked to be a string

if (typeof z === "number") {
    const result = z * 2;
    console.log(result);
} else {
    // const result = z.toString(); // throws an error because z isn't checked to be a string
}

let a: unknown = 1;
const result = (a as number) * 2; // type casting


function processFeedback(input: any): void {
    console.log(`Processing: ${input}`);
}

processFeedback("Hello"); // no error
processFeedback(123); // no error
processFeedback(new Blob()); // no error

function processFeedback2(input: unknown): void {
    if (typeof input === "string") {
        console.log(`Processing string: ${input}`);
    } else if (typeof input === "number") {
        console.log(`Processing number: ${input}`);
    } else if (input instanceof Blob) {
        console.log(`Processing Blob: ${input}`);
    } else {
        console.log("Unknown input type");
    }
}

processFeedback2("Hello");
processFeedback2(123);
processFeedback2(new Blob());

const arr = [{name: "John"}, {name: "Jane"}, {name: "Jim"}];
const el = arr.pop()?.name; 
// Optional chaining operator (?) - safely accesses properties that might be undefined
// If arr.pop() returns undefined, the entire expression returns undefined instead of throwing error

const arr2 = [[{name: "Tim"}]]
const el2 = arr2.pop()?.pop()?.name; 
// Multiple ? operators chain together
// Checks each step for undefined before continuing

const arr3 = [[{name: "Tim"}]]
const el3 = arr3.pop()!.pop()!.name; 
// Non-null assertion operator (!) - tells TypeScript that a value cannot be null/undefined
// Use with caution - will throw runtime error if assertion is wrong


// Functions
function add(a: number, b: number): number {
    return a + b;
}

const num_result = add(1, 2);

// optional parameters
function makeName(firstName: string, lastName: string, middleName?: string) {
    if (middleName) return firstName + " " + middleName + " " + lastName;
    return firstName + " " + lastName;
}

const name1 = makeName("John", "Doe");

// default parameters
function makeName2(firstName: string, lastName: string, middleName: string = "Michael") {
    return firstName + " " + middleName + " " + lastName;
}

const name3 = makeName2("John", "Doe");


function callFunc(
    func: (f: string, l: string, m?: string) => string,
    param1: string,
    param2: string
) {
    return func(param1, param2);
}

const res = callFunc(makeName, "John", "Doe");


function mul(a: number, b: number): number{
    return a * b;
}

function div(a: number, b: number): number{
    return a / b;
}

function applyFunc(
    funcs:((a: number, b: number) => number)[], 
    values: [number, number][]
): number[]{
    const results: number[] = [];
    for (let i = 0; i < funcs.length; i++) {
        const args = values[i];
        const result = funcs[i](args[0], args[1]);
        results.push(result);
    }
    return results;
}

const results = applyFunc([mul, div], [[1, 2], [4, 5]]);


function sum(...numbers: number[]): number {
    let total = 0;
    for (const num of numbers) {
        total += num;
    }
    return total;
}

const sumResult = sum(1,2,3,4);


// function getItemLength(value: string | string[], value2: string | string[]) {} 
// 4 ways to call this function which makes it difficult to maintain and complicates the logic

// function overloading
function getItemLength(name: string): number;
function getItemLength(names: string[]): number;
function getItemLength(nameOrNames: unknown): number {
    if (typeof nameOrNames === "string") {
        return nameOrNames.length;
    } else if (Array.isArray(nameOrNames)) {
        return nameOrNames.length;
    }
    return 0;
}

const length1 = getItemLength("John");
const length2 = getItemLength(["John", "Jane", "Jim"]);

interface Person {
    name: string;
    age: number;
    height?: number; // optional property
    hello: () => void; // function type
}

const person: Person = {
    name: "Manthan Gupta",
    age: 20,
    hello: function() {
        console.log(this.name + " says hello");
    }
}

person.hello();

interface Employee extends Person {
    employeeId: number;
}

interface Manager extends Employee, Person{
    employees: Person[]
}

const worker: Employee = {
    name: "John Doe",
    age: 30,
    height: 180,
    employeeId: 123,
    hello: function() {
        console.log(this.name + " says hello");
    }
}


function getPerson(p: Person): Person {
    return {
        name: p.name,
        age: p.age,
        hello: p.hello
    }
}

const person2 = getPerson(person); 


class PersonEntity {
    public name: string; // default is public: can be accessed outside the class
    private height?: number; // private property: can't be accessed outside the class
    protected age: number; // protected property: can be accessed within the class and subclasses
    constructor(name: string, age: number, height?: number) {
        this.name = name;
        this.age = age;
        this.height = height;
        this.greet();
    }

    private greet() {
         console.log(`Hello, my name is ${this.name}`);
    }

    getHeight() {
        return this.height;
    }
    setHeight(height: number) {
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
abstract class Animal {
    abstract makeSound(duration: number): void;
    move(duration: number){
        console.log("Moving...");
        this.makeSound(duration);
    }
}

// const animal = new Animal(); // can't create an instance of an abstract class

class Dog extends Animal {
    makeSound(duration: number): void {
        console.log("Woof!");
    }
}

const dog = new Dog();
dog.move(10);

class Cat extends Animal {
    makeSound(duration: number): void {
        console.log("Meow!");
    }
}

interface Animal1 {
    speak(): void;
}

class Dog1 implements Animal1 {
    private name: string;
    private color: string;
    constructor(name: string, color: string) {
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
dog1.speak()

class Cat1 implements Animal1 {
    speak() {
        console.log("Meow!");
    }
}

const cat1 = new Cat1();
const animals: Animal1[] = [dog1, cat1];

function makeSound(animal: Animal1) {
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
    static instanceCount: number = 0; // static property is shared by all instances of Dog2
    name: string;
    constructor(name: string) {
        this.name = name;
        Dog2.instanceCount++;
    }

    static decreaseCount() {
        this.instanceCount--;
    }
}

const dog3 = new Dog2("Buddy");
const dog4 = new Dog2("Buddy");
console.log(Dog2.instanceCount); // instanceCount is shared by all instances of Dog2 so value is 2

Dog2.decreaseCount();
console.log(Dog2.instanceCount); // instanceCount is shared by all instances of Dog2 so value is 1


class DataStore {
    private items: number[] = [];

    addItem(item: number) {
        this.items.push(item);
    }

    getItems(index: number) {
        return this.items[index];
    }

    removeItem(index: number) {
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

class DataStoreGeneric<T> {
    private items: T[] = [];

    addItem(item: T): void {
        this.items.push(item);
    }

    getItems(index: number): T {
        return this.items[index];
    }

    removeItem(index: number): void {
        this.items.splice(index, 1);
    }

    getAllItems(): T[] {
        return this.items;
    }
}

const dataStoreGeneric = new DataStoreGeneric<number>();
dataStoreGeneric.addItem(1);


interface User {
    name: string;
    id: string;
}

const userDataStore = new DataStoreGeneric<User>();
userDataStore.addItem({name: "John", id: "123"});


function getValue<K, V>(key: K, value1: V, value2: V): V {
    if (key){
        return value1;
    }
    return value2;
}

getValue("hello", 1, 2);
getValue<string, number>("hello", 1, 2);


type Coordinate = [number, number];

function compareCoords(p1: Coordinate, p2: Coordinate): Coordinate {
    return [p1[0], p2[1]];
}

const coords: Coordinate[] = [];

// Union types
type StringOrNumber = string | number | boolean;

function acceptVal(val: StringOrNumber) {}


// Intersection types
interface BusinessPartner {
    name: string;
}

interface ContactDetails {
    email: string;
    phone: string;
}

type BusinessContact = BusinessPartner & ContactDetails;


const contact: BusinessContact = {
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "1234567890"
}

interface Individual {
    name: string;
    birthday: Date;
}

interface Organization {
    companyName: string;
    workPhone: string;
}

type ContactType = Individual | Organization;

type CompContact = BusinessPartner & ContactDetails;

function addContact(contact: ContactType) {
    if ("birthday" in contact) {
        console.log(contact.name, contact.birthday);
    } else {
        console.log(contact.companyName, contact.workPhone);
    }
}

// type guards -> typeof, instanceof, in, is, etc

type StringOrNumber1 = string | number;

function add1(value: StringOrNumber1): StringOrNumber1 {
    if (typeof value === "string") {
        return value + "1"
    } else {
        return value + 1;
    }
}


class Dog3 {
   firstName: string;
   lastName: string;
   constructor(firstName: string, lastName: string) {
    this.firstName = firstName;
    this.lastName = lastName;
   } 
}

class Cat3 {
    firstName: string;
    constructor(firstName: string) {
        this.firstName = firstName;
    }
}

function getName(animal: Cat3 | Dog3) {
    if (animal instanceof Dog3) {
        return animal.firstName + " " + animal.lastName;
    } else if (animal instanceof Cat3) {
        return animal.firstName;
    }
}


function getName1(animal: Cat3 | Dog3) {
    if ("lastName" in animal) {
        return animal.firstName + " " + animal.lastName;
    } else {
        return animal.firstName;
    }
}


// pet is Dog3 is the type guard -> It tells that this function is returning a boolean and checking if the pet is a Dog3
function isDog(pet: Dog3 | Cat3): pet is Dog3 {
    return (pet as Dog3).firstName !== undefined;
}


// discriminated unions

interface Warning {
    type: "warning";
    msg: string;
}

interface Info {
    type: "info";
    text: string;
}

interface Success {
    type: "success";
    message: string;
}

type Log = Warning | Info | Success;

let log: Log;
function handleMsg(log: Log) {
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

// utility types

interface Todo {
    title: string;
    description: string;
}

// partial type -> allows you to pass in only some of the properties of the interface
const updateTodo = (todo: Partial<Todo>) => {}


// required type -> makes all properties required
const createTodo = (todo: Required<Todo>) => {}


// readonly type -> makes all properties readonly
const myTodo: Readonly<Todo> = {
    title: "Learn TypeScript",
    description: "Learn TypeScript in 30 days"
}
// myTodo.title = "Learn TypeScript in 30 days"; // This will throw an error because the property is readonly

// record type -> allows you to create a map of a key and a value
interface PageInfo {
    title: string;
}

const pages: Record<string, PageInfo> = {
    home: {
        title: "Home",
    },
    about: {
        title: "About",
    }
}

const pageNumbers: Record<number, PageInfo> = {
    1: {
        title: "Home",
    },
    2: {
        title: "About",
    }
}


// pick type -> allows you to pick a set of properties from an interface
interface Todo1 {
    title: string;
    description: string;
    completed: boolean;
}

type TodoPreview = Pick<Todo1, "title" | "completed">;

const todo: TodoPreview = {
    title: "Learn TypeScript",
    completed: false,
    // description: "Learn TypeScript in 30 days" // This will throw an error because the property is not in the Pick type
}

// omit type -> allows you to omit a set of properties from an interface
type TodoPreview2 = Omit<Todo1, "description">;

const todo2: TodoPreview2 = {
    title: "Learn TypeScript",
    completed: false,
    // description: "Learn TypeScript in 30 days" // This will throw an error because the property is omitted
}


