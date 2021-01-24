import { IAbstractUser } from "@lib/user";
import { IAbstractGame } from "@lib/game";
export { GameInfo } from "@lib/gameinfo";
export { GamePreferences } from "@lib/gamepreferences";
import { AxiosInstance } from "axios";
import WebsocketHandler from "./plugins/websocket";
import GameInfoService from "./services/gameinfo";
import GameSettingsService from "./services/gamesettings";

export interface User extends IAbstractUser {
  _id: string;
}

export interface Game extends IAbstractGame {
  _id: string;
}

declare module "vue/types/vue" {
  interface Vue {
    $axios: AxiosInstance;
    $ws: WebsocketHandler;
    $gameInfo: GameInfoService;
    $gameSettings: GameSettingsService;
  }
}
