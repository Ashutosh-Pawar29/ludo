import zod from "zod";

export let a = zod.object({
    username:zod.string().min(6),
    password:zod.string().min(6),
    email:zod.email()
})

export let signin = zod.object({
    email: zod.string().email(),
    password:zod.string()
})

// console.log(a.safeParse({email:"ashutoshpawar@gmail.com"}))