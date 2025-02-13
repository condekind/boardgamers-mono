import { ObjectID } from "bson";
import delay from "delay";
import jwt from "jsonwebtoken";
import _ from "lodash";
import cache from "node-cache";
import WebSocket, { Server } from "ws";
import "./config/db";
import env from "./config/env";
import { ChatMessage, Game, GameDocument, User } from "./models";

const wss = new Server({ port: env.listen.port.ws, host: env.listen.host });

type AugmentedWebSocket = WebSocket & {
  game?: string;
  room?: string;
  user?: ObjectID;
  gameUpdate?: Date;
  isAlive?: boolean;
};

function clients(): AugmentedWebSocket[] {
  return [...wss.clients].filter((ws) => ws.readyState === WebSocket.OPEN);
}

wss.on("listening", () => console.log("Listening for chat messages on port", env.listen.port.ws));
wss.on("error", (err) => console.error(err));

wss.on("connection", (ws: AugmentedWebSocket) => {
  console.log("new websocket connected");

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
    updateActivity(ws.user, false);
  });

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());

    if ("room" in data) {
      ws.room = data.room;

      // Show only last 100 messages
      const roomMessages = await ChatMessage.find({ room: data.room }).lean(true).sort("-_id").limit(100);

      for (const msg of roomMessages) {
        delete msg.room;
      }

      if (ws.readyState !== ws.OPEN) {
        return;
      }

      ws.send(
        JSON.stringify({
          room: data.room,
          command: "messageList",
          messages: roomMessages.reverse(),
        })
      );
    }
    if ("game" in data) {
      ws.game = data.game;
      ws.gameUpdate = null;
    }
    if ("fetchPlayerStatus" in data && ws.game && gameCache.get(ws.game)) {
      const game = gameCache.get<GameDocument>(ws.game);
      const users = await User.find(
        { _id: { $in: game.players.map((x) => x._id) } },
        "security.lastActive security.lastOnline",
        { lean: true }
      );

      if (ws.readyState !== ws.OPEN) {
        return;
      }

      // Send [{_id: player1, status: "online"}, {_id: player2, status: "offline"}, {_id: player3, status: "away"}]
      ws.send(
        JSON.stringify({
          command: "game:playerStatus",
          players: users.map((user) => ({
            _id: user._id,
            status:
              Date.now() - (user.security.lastOnline ?? new Date(0)).getTime() < 60 * 1000
                ? "online"
                : Date.now() - (user.security.lastActive ?? new Date(0)).getTime() < 60 * 1000
                ? "away"
                : "offline",
          })),
        })
      );
    }
    if ("jwt" in data) {
      try {
        const decoded = jwt.verify(data.jwt, env.jwt.keys.public) as { userId: string; scopes: string[] };

        if (decoded) {
          ws.user = new ObjectID(decoded.userId);
          updateActivity(ws.user, true);
          sendActiveGames(ws);
        } else {
          ws.user = null;
        }
      } catch (err) {
        ws.user = null;
      }
    }
    if (data.online && ws.user) {
      updateActivity(ws.user, true);
    }
  });

  ws.on("close", () => {
    console.log("websocket closed");
  });

  ws.on("error", () => {
    console.log("websocket error");
  });
});

// Check if sockets are alive, close them otherwise
setInterval(function ping() {
  for (const ws of clients()) {
    if (ws.isAlive === false) {
      ws.terminate();
    }

    ws.isAlive = false;
    ws.ping(() => {});

    sendActiveGames(ws);
  }
}, 20000);

function sendActiveGames(ws: AugmentedWebSocket) {
  if (ws.user) {
    Game.findWithPlayersTurn(ws.user)
      .select("_id")
      .lean(true)
      .then((games) => {
        ws.send(JSON.stringify({ command: "games:currentTurn", games: games.map((game) => game._id) }));
      })
      .catch(console.error);
  }
}

let lastChecked: ObjectID = ObjectID.createFromTime(Math.floor(Date.now() / 1000));

const gameCache = new cache({ stdTTL: 24 * 3600 });

/**
 * Check periodically for new messages in db and send them to clients
 */
async function run() {
  while (1) {
    // Find new messages
    const messages = await ChatMessage.find({ _id: { $gt: lastChecked } }).lean();
    const messagesPerRooms = _.groupBy(messages, (msg) => msg.room.toString());

    for (const msg of messages) {
      delete msg.room;
    }

    for (const ws of clients()) {
      if (ws.room in messagesPerRooms) {
        ws.send(
          JSON.stringify({
            room: ws.room,
            messages: messagesPerRooms[ws.room],
            command: "newMessages",
          })
        );
      }
    }

    if (messages.length > 0) {
      lastChecked = messages[messages.length - 1]._id;
    }

    const gameConditions = _.uniqBy(_.sortBy([...clients()], "gameUpdate"), "game").map((x) => ({
      _id: x.game,
      updatedAt: { $gt: x.gameUpdate ?? new Date(0) },
    }));

    if (gameConditions.length > 0) {
      const games = await Game.find({ $or: gameConditions }, "updatedAt players._id", { lean: true });

      for (const game of games) {
        gameCache.set(game._id, game);
      }

      if (games.length > 0) {
        const playerIds = (
          await Game.aggregate()
            .match({ _id: { $in: games.map((game) => game._id) } })
            .project("players._id")
            .unwind("players")
            .group({ _id: "$players._id" })
        ).map((x) => x._id);
        const users = await User.find({ _id: { $in: playerIds } }, "security.lastActive security.lastOnline", {
          lean: true,
        });
        const usersById = _.keyBy<typeof users[0]>(users, (user) => user._id.toString());

        for (const ws of clients()) {
          if (ws.readyState !== WebSocket.OPEN) {
            continue;
          }

          if (ws.game) {
            const game = gameCache.get<GameDocument>(ws.game);
            const localUpdate: Date = game?.updatedAt;
            if (localUpdate && (!ws.gameUpdate || ws.gameUpdate < localUpdate)) {
              ws.gameUpdate = localUpdate;

              ws.send(JSON.stringify({ command: "game:lastUpdate", lastUpdate: localUpdate, game: ws.game }));
              ws.send(
                JSON.stringify({
                  command: "game:playerStatus",
                  players: game.players
                    .filter((pl) => pl._id.toString() in usersById)
                    .map((pl) => usersById[pl._id.toString()])
                    .map((user) => ({
                      _id: user._id,
                      status:
                        Date.now() - (user.security.lastOnline ?? new Date(0)).getTime() < 60 * 1000
                          ? "online"
                          : Date.now() - (user.security.lastActive ?? new Date(0)).getTime() < 60 * 1000
                          ? "away"
                          : "offline",
                    })),
                })
              );
            }
          }
        }
      }
    }

    await delay(250);
  }
}

run();

async function updateActivity(user: ObjectID, online: boolean) {
  try {
    if (online) {
      await User.updateOne(
        { _id: user },
        { $set: { "security.lastActive": new Date(), "security.lastOnline": new Date() } }
      );
    } else {
      await User.updateOne({ _id: user }, { $set: { "security.lastActive": new Date() } });
    }
  } catch (err) {
    console.error(err);
  }
}
