import locks from "mongo-locks";
import mongoose from "mongoose";
import env from "./env";
import { migrate } from "../models/migrations";
import cluster from "cluster";

mongoose.Promise = global.Promise; // native promises

let dbInit = false;

export default async function initDb(url = env.dbUrl, runMigrations = true) {
  if (dbInit) {
    console.log("DB already initialized");
    return;
  }

  dbInit = true;

  mongoose.connect(url, { dbName: "gaia-project", useNewUrlParser: true });
  locks.init(mongoose.connection);

  return new Promise((resolve, reject) => {
    mongoose.connection.on("error", (err) => {
      reject(err);
    });

    mongoose.connection.on("open", async () => {
      console.log("connected to database!");

      if (cluster.isMaster && runMigrations) {
        let free = () => {};
        try {
          free = await locks.lock("migration");
          await migrate();
        } catch (err) {
          console.error(err);
        } finally {
          free();
        }
      }

      resolve();
    });
  });
}
