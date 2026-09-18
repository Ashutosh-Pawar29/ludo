import jwt, { type JwtPayload }  from "jsonwebtoken";

export function authenticate(token:string,pass:string){
    try{
        const isvalid = jwt.verify(token,pass) as JwtPayload
        if(isvalid){
            return isvalid.id
        }
        
    }
    catch(err){
        console.log(err)
        return null
    }
    
}