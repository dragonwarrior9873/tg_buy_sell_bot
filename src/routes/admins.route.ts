import express, { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Admin, User } from "../db";
import * as validator from "./validator";

dotenv.config();

interface User {
    name: string;
    email: string;
    password: string;
}

export default (): Router => {
    var router: Router = express.Router();

    router.post("/login", (req: Request, res: Response) => {
        const { errors, isValid } = validator.validateLoginInput(req.body);
        if (!isValid) {
            console.log("fail", errors);

            return res.status(400).json(errors);
        }

        const email = req.body.email;
        const password = req.body.password;
        Admin.findOne({ email }).then((user: any) => {
            if (!user) {
                return res.status(404).json({ email: "ID not found" });
            }

            // bcrypt.compare(password, user.password).then(isMatch => {
            if (password === user.password) {
                // if (isMatch) {
                const payload = {
                    id: user.id,
                    name: user.name,
                    permission: user.permission,
                };

                const secretOrKey = process.env.PASSPORT_SECRET_KEY as jwt.Secret;
                jwt.sign(
                    payload,
                    secretOrKey,
                    {
                        expiresIn: 31556926, // 1 year in seconds
                    },
                    (err: any, token: any) => {
                        res.json({
                            success: true,
                            token: "Bearer " + token,
                        });
                    }
                );
                // }
            } else {
                return res.status(400).json({ password: "Password incorrect" });
            }
        });
    });

    return router;
};
