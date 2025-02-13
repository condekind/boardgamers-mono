<script lang="ts">
import { keyBy } from "lodash";
import { timerTime, oneLineMarked, handleError, confirm, duration, shortDuration } from "@/utils";
import type { PlayerInfo } from "@lib/game";
import Portal from "svelte-portal";
import { addActiveGame, playerStatus, removeActiveGame, user } from "@/store";
import { Button, Icon, Badge } from "@/modules/cdk";
import { post } from "@/api";
import { getContext, onDestroy } from "svelte";
import {GameLog, ReplayControls, GameNotes, GamePreferences, GameSettings} from './GameSidebar';
import type { GameContext } from "@/pages/Game.svelte";
import PlayerGameAvatar from "./components/PlayerGameAvatar.svelte";

const {game, players, gameInfo}: GameContext = getContext("game")

let secondsCounter = 0;

const interval = setInterval(() => {
  if (!document.hidden) {
    secondsCounter += 1;
  }
}, 1000);
onDestroy(() => clearInterval(interval))

let  requestedDrop: Record<string, boolean> = {};

$: userId = $user?._id
$: playerUser = $game?.players.find((pl) => pl._id === userId)
$: gameId = $game?._id

function status(playerId: string) {
  return $playerStatus?.find(pl => pl._id === playerId)?.status ?? 'offline'
}

function playerElo(playerId: string) {
  return $players.find((pl) => pl._id === playerId)?.elo ?? 0;
}

$: alwaysActive = $game?.options.timing.timer?.start === $game?.options.timing.timer?.end

$: currentPlayersById = keyBy($game?.currentPlayers ?? [], "_id");

function isCurrentPlayer(id: string) {
  return $game?.status !== "ended" && !!currentPlayersById[id];
}

const onGameChanged = () => {
  if (userId) {
    if (isCurrentPlayer(userId)) {
      addActiveGame(gameId)
    } else {
      removeActiveGame(gameId)
    }
  }
}

$: onGameChanged(), [userId, $game]

let remainingTimes: Record<string, number> = {}

function updateRemainingTimes() {
  const ret: Record<string, number> = {}
  for (const player of $game.players) {
    ret[player._id] = remainingTime(player)
  }

  remainingTimes = ret
}

$: updateRemainingTimes(), [secondsCounter]

function remainingTime(player: PlayerInfo) {
  const currentPlayer = currentPlayersById[player._id];
  if (currentPlayer) {
    // Trick to update every second
    return Math.floor((new Date(currentPlayer.deadline).getTime() - Date.now() + (secondsCounter % 1)) / 1000);
  }
  return Math.max(player.remainingTime, 0);
}

async function voteCancel() {
  if (await confirm("This vote cannot be taken back. If all active players vote to cancel, the game will be cancelled.")) {
    await post(`/game/${gameId}/cancel`).catch(handleError);
  }
}

async function quit() {
  await post(`/game/${gameId}/quit`).catch(handleError);
}

async function requestDrop(playerId: string) {
  await post(`/game/${gameId}/drop/${playerId}`)
    .then(() => (requestedDrop = {...requestedDrop, [playerId]: true}), handleError);
}

</script>

<Portal target="#sidebar">
  <h3 class="mt-75">Players</h3>
  {#each $game.players as player}
    <div class={"mb-1 d-flex align-items-center player-row"} class:active={isCurrentPlayer(player._id)}>
      <PlayerGameAvatar {player} status={status(player._id)} class="mr-2" />

      <div>
        <a href={`/user/${player.name}`} class="player-name" class:dropped={player.dropped}>
          {player.name}
        </a>
        <sup class="ml-1">
          {#if player.elo}
            {player.elo.initial} {player.elo.delta >= 0 ? "+" : "-"} {Math.abs(player.elo.delta)} elo
          {:else}
            {playerElo(player._id)} elo
          {/if}
        </sup>
        {#if $game.status === "active"}
          <span class="ml-1"> - {shortDuration(remainingTimes[player._id])}</span>
        {/if}
      </div>
    </div>
  {/each}
  <div class="mt-75">
    <Icon name="clock-history" class="mr-1" />
    {alwaysActive
      ? "24h"
      : `${timerTime($game.options.timing.timer.start)}-${timerTime($game.options.timing.timer.end)}`}
    / {duration($game.options.timing.timePerGame)} + {duration($game.options.timing.timePerMove)}
  </div>
  {#if $game.status === "ended"}
    <div class="mt-75">
      <b> Game ended! </b>
    </div>
  {/if}
  {#key $game.currentPlayers}
    {#if $user && isCurrentPlayer($user._id)}
      <div class="mt-75">
        <b class="your-turn">Your turn!</b>
      </div>
    {/if}
  {/key}
  {#if playerUser && $game.status !== "ended"}
    <div class="mt-75">
      <Button
        color="warning"
        size="sm"
        disabled={playerUser.dropped || playerUser.voteCancel || playerUser.quit}
        on:click={voteCancel}
      >
        Vote to cancel
      </Button>
      {#if $game.players.some((pl) => !!pl.dropped)}
        <Button size="sm" class="ml-2" disabled={playerUser.dropped || playerUser.quit} on:click={quit}>Quit</Button>
      {/if}
      {#each $game.players as player}
        {#if remainingTime(player) <= 0 && isCurrentPlayer(player._id) && !player.dropped && !player.quit}
          <Button
            size="sm"
            class="ml-2"
            color="danger"
            disabled={requestedDrop[player._id]}
            on:click={() => requestDrop(player._id)}
          >
            Drop {player.name}
          </Button>
        {/if}
      {/each}
    </div>
  {/if}

  <GameSettings />

  <GamePreferences />

  <GameNotes {gameId} />

  {#if $gameInfo.expansions?.length > 0}
    <div class="mt-75">
      <h3>Expansions</h3>
      {#each $game.game.expansions as expansion}
        <Badge color="info" class="mr-1">
          {$gameInfo.expansions.find((xp) => xp.name === expansion)?.label}
        </Badge>
      {/each}
    </div>
  {/if}

  <GameLog />

  <ReplayControls />

  {#if $gameInfo.options.some((x) => !!$game.game.options?.[x.name])}
    <div class="mt-75">
      <h3>Setup options</h3>
      {#each $gameInfo.options.filter((x) => !!$game.game.options[x.name]) as pref}
        <Badge color="secondary" class="mr-1">
          {#if pref.type === "checkbox"}
            {@html oneLineMarked(pref.label)}
          {:else if pref.type === "select" && pref.items && pref.items.some((x) => x.name === $game.game.options[pref.name])}
            {@html oneLineMarked(
              pref.label + ": " + pref.items.find((x) => x.name === $game.game.options[pref.name])?.label
            )}
          {/if}
        </Badge>
      {/each}
    </div>
  {/if}
  <div class="my-3" />
</Portal>

<style lang="postcss" global>
  .your-turn {
    color: #25ee25;
  }

  .vertical-textarea {
    resize: vertical;
  }

  #sidebar {
    .player-row.active .player-name {
      color: #25ee25 !important;
    }
    .player-name {
      &.dropped {
        text-decoration: line-through;
      }
    }
    .player-avatar {
      width: 1.8em;
      height: 1.8em;

      &.active {
        box-shadow: 0 0 3px #25ee25;
      }

      .vp {
        z-index: 100;
        width: 18px;
        border-radius: 5px;
        font-size: 0.6em;
      }
    }
  }
</style>
