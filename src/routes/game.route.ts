// import express, { Router, Request, Response } from "express";
// import * as GameLogic from "../game_logic";
// import dotenv from "dotenv";
// import { Game } from "../db";

// dotenv.config();

// const gameRouter = (): Router => {
//     const router = express.Router();

//     router.post("/game-data", async (req: Request, res: Response) => {
//         let result: any;
//         if (req.body.approved && !req.body.conclude){
//             result = await GameLogic.getLiveGames();
//             if( result.msg === GameLogic.ErrorMsg.SUCCESS )
//             {
//                 result.games.forEach((game:any, idx:number) => {
//                     result.games[idx].openTime = new Date(game.openTime);
//                     result.games[idx].closeTime = new Date(game.closeTime);
//                     result.games[idx].settleTime = new Date(game.settleTime);
//                     result.games[idx].timestamps = new Date(game.timestamps);
//                 });
//             }
//         }
//         else if (!req.body.approved && !req.body.conclude){
//             result = await GameLogic.getApprovalGames(
//                 req.body.pageNum,
//                 req.body.pageSize
//             );
//             if( result.msg === GameLogic.ErrorMsg.SUCCESS )
//             {
//                 result.games.games.forEach((game:any, idx:number) => {
//                     result.games.games[idx].openTime = new Date(game.openTime);
//                     result.games.games[idx].closeTime = new Date(game.closeTime);
//                     result.games.games[idx].settleTime = new Date(game.settleTime);
//                     result.games.games[idx].timestamps = new Date(game.timestamps);
//                 });
//             }
//         }
            
//         // console.log(result);
        
        
            
//         return res.status(200).send(result);
//     });

//     router.post("/game-add", async (req: Request, res: Response) => {
//         const result = await GameLogic.addGame(
//             '0',
//             req.body.title,
//             req.body.description,
//             new Date(req.body.openTime).getTime (),
//             new Date(req.body.closeTime).getTime (),
//             new Date(req.body.settleTime).getTime (),
//             "ADMIN",
//             0
//         );
//         return res.status(200).send(result);
//     });

//     router.post("/game-approve", async (req: Request, res: Response) => {
//         const result = await GameLogic.approveGame(req.body.id);
//         return res.status(200).send(result);
//     });

//     router.post("/game-reject", async (req: Request, res: Response) => {
//         const result = await GameLogic.removeGame(req.body.id);
//             return res.status(200).send(result);
//     });

//     router.post("/game-conclude", async (req: Request, res: Response) => {
//         const result = await GameLogic.concludeGame(
//             req.body.id,
//             req.body.winner
//         );
//             return res.status(200).send(result);
//     });

//     router.post("/game-update", async (req: Request, res: Response) => {
//         let game:any = req.body;
//         game.openTime = new Date(game.openTime).getTime();
//         game.closeTime = new Date(game.closeTime).getTime();
//         game.settleTime = new Date(game.settleTime).getTime();
//         const result = await GameLogic.updateGame (game)
//         return res.status(200).send(result);
//     });

//     router.post("/game-delete", async (req: Request, res: Response) => {
//         const result = await GameLogic.removeGame(req.body.id);
//             return res.status(200).json(result);
//     });

//     return router;
// };

// export default gameRouter;
