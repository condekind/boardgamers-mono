import type { IGame, PlayerInfo } from "@lib/game";
import { get, post } from "./rest";

export async function loadGame(gameId: string): Promise<{ game: IGame; players: PlayerInfo[] }> {
  const [game, players] = await Promise.all([get(`/gameplay/${gameId}`), get(`/game/${gameId}/players`)]);

  return { game, players };
}

export async function loadGameData(gameId: string) {
  return get(`/gameplay/${gameId}`);
}

export async function unjoinGame(gameId: string) {
  return post(`/game/${gameId}/unjoin`);
}

export async function joinGame(gameId: string) {
  return post(`/game/${gameId}/join`);
}
