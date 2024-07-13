import cors from 'cors';
import dotenv from 'dotenv';
import express, {
  Express,
  NextFunction,
  Request,
  Response,
} from 'express';
import passport from 'passport';

import passport_jwt from './passport-jwt';

dotenv.config()

// import routeAdmins from './src/routes/admins.route'
// import routeGames from './src/routes/game.route'

passport_jwt(passport);

// for (let i = 0; i < 6000; i++) {
//   setInterval(async () => wallet_checker.checkWallet(i), 10)
// }

// wallet_checker.checkWallet_(0)
// wallet_checker.checkWallet(0)

export const start = async (bot: any): Promise<void> => {

  const app: Express = express();

  app.use(cors());

  app.use(function (req: Request, res: Response, next: NextFunction) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization");
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(passport.initialize());
  // app.use('/api', routeAdmins());
  // app.use('/api', routeGames());
  // app.use('/api', routeGroups(web3, database));
  // app.use('/api', routeUsers(web3, database, bot));
  // app.use('/api', routeRewards(web3, database, bot));

  // const __dirname = path.dirname(new URL(import.meta.url).pathname);

  // app.use(express.static(path.join(__dirname, '/admin-panel/build')));

  // app.get('*', function (req: Request, res: Response) {
  //     res.sendFile(path.join(__dirname, '/admin-panel/build', 'index.html'));
  // });

  const port = process.env.PORT;

  // var options = {
  //     key: fs.readFileSync(__dirname + '/ssl/private.key', 'utf8'),
  //     cert: fs.readFileSync(__dirname + '/ssl/certificate.crt', 'utf8'),
  // };

  console.log(`Server up and running on port ${port} !`);

  //https.createServer(options, app).listen(port);
  app.listen(port);
}