import anything,{ add, sub, mul } from "./util";

console.log(add(1, 2));
console.log(sub(1, 2));
console.log(mul(1, 2));

console.log(anything());

import complex, {simple as simple2} from "./math/complex/util";
import simple from "./math/simple/util";

console.log(complex());
console.log(simple());
console.log(simple2());
