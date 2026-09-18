import zod from "zod";
import { a, joinroom, signin, createroom } from "./zod.ts"
export type signupBody = zod.infer<typeof a>
export type signinBody = zod.infer<typeof signin>
export type joinRoom = zod.infer<typeof joinroom>
export type createRoom = zod.infer<typeof createroom>

export * from "./game.ts";
