import zod, { string } from "zod";

export let a = zod.object({
    username: zod.string().min(6),
    password: zod.string().min(6),
    email: zod.string().email()
})

export let signin = zod.object({
    email: zod.string().email(),
    password: zod.string()
})

export let joinroom = zod.object({
    roomid: zod.string(),
    userid: zod.string(),
})

export let createroom = zod.object({
    id:zod.string(),
    maxPlayers: zod.number().min(2).max(6)
})

// console.log(a.safeParse({email:"ashutoshpawar@gmail.com"}))