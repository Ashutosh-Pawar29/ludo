import zod from "zod";
import {a, signin} from "./zod.ts"
export type signupBody = zod.infer<typeof a>
export type signinBody = zod.infer<typeof signin>
