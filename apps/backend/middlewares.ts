import express, { type NextFunction, type Request, type Response } from "express";
import jwt, {type JwtPayload} from "jsonwebtoken";

const jwt_pass = process.env.JWT_SECRET as string
const jwt_pass_refreshtoken = process.env.REFRESHTOKEN_JWT_SECRET as string
export function authenticate(req:Request,res:Response,next:NextFunction){
    const token = req.headers.token as string
    
    try{
        const isValid = jwt.verify(token,jwt_pass) as JwtPayload;
        if(isValid){
            const id = isValid.id
            req.body={...req.body,id}
            next()
        }
    }
    catch{
        return res.send("invalid token")
    }
    
}


export function refreshtokenAuthenticate(req:Request,res:Response,next:NextFunction){
    const token = req.headers.token as string
    
    try{
        const isValid = jwt.verify(token,jwt_pass_refreshtoken) as JwtPayload;
        if(isValid){
            const id = isValid.id
            req.body={...req.body,id}
            next()
        }
    }
    catch{
        return res.send("invalid token")
    }
}