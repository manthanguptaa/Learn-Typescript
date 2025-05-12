// not recommended to use namespace
namespace Utils {
    export class MyClass{}

    export function myFunction(){}

    export const NAME = "John";

    export interface NewType{
        name: string;
    }
}

const re = Utils.myFunction();