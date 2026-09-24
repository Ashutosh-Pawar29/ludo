import express, { type NextFunction, type Request, type Response } from "express";
import jwt, {type JwtPayload} from "jsonwebtoken";

const jwt_pass = process.env.JWT_SECRET as string
const jwt_pass_refreshtoken = process.env.REFRESHTOKEN_JWT_SECRET as string
export function authenticate(req: Request, res: Response, next: NextFunction) {
    const rawHeader = (req.headers.token || req.headers.authorization) as string | undefined;
    let token = rawHeader;
    if (token && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
    }

    if (!token) {
        return res.status(401).json({ error: "invalid_token", message: "Authentication token required" });
    }

    try {
        const isValid = jwt.verify(token, jwt_pass) as JwtPayload;
        if (isValid && isValid.id) {
            const id = isValid.id;
            req.body = { ...req.body, id };
            return next();
        }
        return res.status(401).json({ error: "invalid_token", message: "Invalid token payload" });
    } catch (err: any) {
        const message = err?.name === "TokenExpiredError" ? "Session expired. Please log in again." : "Invalid token";
        return res.status(401).json({ error: "invalid_token", message });
    }
}

export function refreshtokenAuthenticate(req: Request, res: Response, next: NextFunction) {
    const rawHeader = (req.headers.token || req.headers.authorization) as string | undefined;
    let token = rawHeader;
    if (token && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
    }

    if (!token) {
        return res.status(401).json({ error: "invalid_token", message: "Refresh token required" });
    }

    try {
        const isValid = jwt.verify(token, jwt_pass_refreshtoken) as JwtPayload;
        if (isValid && isValid.id) {
            const id = isValid.id;
            req.body = { ...req.body, id };
            return next();
        }
        return res.status(401).json({ error: "invalid_token", message: "Invalid refresh token payload" });
    } catch {
        return res.status(401).json({ error: "invalid_token", message: "Invalid refresh token" });
    }
}