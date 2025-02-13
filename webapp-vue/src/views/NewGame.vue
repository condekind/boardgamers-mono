<template>
  <v-loading :loading="!info" class="container">
    <h1 class="mb-4" v-if="info">{{ info.label }}</h1>
    <form @submit.prevent="createGame" v-if="info">
      <div class="row">
        <div class="col-md-6">
          <h2>Description</h2>
          <div v-html="marked(info.description)" />
        </div>

        <div class="col-md-6">
          <h2>Rules</h2>
          <div v-html="marked(info.rules)" />
        </div>
      </div>

      <h2>Settings</h2>
      <div class="row">
        <div class="form-group col-md-4">
          <label for="players">Number of players</label>
          <select v-model="players" id="players" class="form-control">
            <option v-for="numPlayers in info.players" :value="numPlayers" :key="numPlayers">
              {{ numPlayers }} players
            </option>
          </select>
        </div>

        <div class="form-group col-md-4">
          <label for="gameId">Game Id</label>
          <input
            class="form-control"
            id="gameId"
            type="text"
            maxlength="25"
            name="gameId"
            :value="gameId"
            @input="setGameId($event)"
            placeholder="Game ID"
            aria-label="Game ID"
            required
          />
          <small class="form-text text-muted">Use only alphanumeric characters and hyphens.</small>
        </div>

        <div class="form-group col-md-4">
          <label for="seed">Custom Seed</label>
          <input
            class="form-control"
            id="seed"
            type="text"
            maxlength="25"
            name="gameId"
            v-model.trim="seed"
            placeholder="Random seed"
            aria-label="Random seed"
          />
          <small class="form-text text-muted">Games sharing the same seed will have configuration.</small>
        </div>
      </div>

      <b-row class="mb-3">
        <b-col sm="3" class="d-flex" style="align-items: center">
          <b-form-checkbox v-model="enableKarma"> Karma restriction </b-form-checkbox>
        </b-col>
        <b-col sm="9">
          <b-form-input
            type="number"
            :disabled="!enableKarma"
            placeholder="Minimum karma to join the game"
            v-model="minimumKarma"
            :max="user.account.karma - 5"
          />
        </b-col>
      </b-row>

      <div v-if="info.expansions.length > 0" class="mb-3">
        <h3>Expansions</h3>
        <b-checkbox
          @change="toggleExpansion(expansion.name)"
          :checked="expansions.includes(expansion.name)"
          v-for="expansion in info.expansions"
          :key="expansion.name"
        >
          {{ expansion.label }}
        </b-checkbox>
      </div>

      <h3>Timing</h3>

      <div class="row">
        <div class="form-group col-md-6">
          <label for="timePerGame">Time per player per game</label>
          <select v-model="timePerGame" id="timePerGame" class="form-control">
            <option
              v-for="x in [300, 600, 1800, 3600, 6 * 3600, 24 * 3600, 3 * 24 * 3600, 10 * 24 * 3600]"
              :value="x"
              :key="x"
            >
              {{ x | duration }}
            </option>
          </select>
        </div>

        <div class="form-group col-md-6">
          <label for="timePerMove">Additional time per move</label>
          <select v-model="timePerMove" id="timePerMove" class="form-control">
            <option v-for="x in [30, 60, 5 * 60, 15 * 60, 3600, 2 * 3600, 6 * 3600, 24 * 3600]" :value="x" :key="x">
              {{ x | duration }}
            </option>
          </select>
        </div>

        <div class="form-group col-md-6">
          <label for="scheduledDate">Scheduled start (day)</label>
          <b-form-datepicker v-model="scheduledDay" reset-button placeholder="Scheduled day" value-as-date />
          <small class="form-text text-muted">Game will start that day or be cancelled.</small>
        </div>

        <div class="form-group col-md-6">
          <label for="scheduledTime">Scheduled start (time)</label>
          <b-form-timepicker v-model="scheduledTime" :locale="locale" reset-button placeholder="Scheduled time" />
          <small class="form-text text-muted">Game will start at that time or be cancelled.</small>
        </div>

        <div class="form-group col-md-6">
          <label for="timerStart">Timer begins at</label>
          <b-form-timepicker v-model="timerStart" :locale="locale" reset-button placeholder="Timer start" />
          <small class="form-text text-muted">Timer will start / resume at this time of the day.</small>
        </div>

        <div class="form-group col-md-6">
          <label for="timerEnd">Timer stops at</label>
          <b-form-timepicker v-model="timerEnd" :locale="locale" reset-button placeholder="Timer pause" />
          <small class="form-text text-muted">Timer will pause at this time of the day.</small>
        </div>
      </div>

      <h3>Other options</h3>

      <b-form-checkbox-group
        v-model="options"
        html-field="html"
        value-field="name"
        :options="[
          { name: 'unlisted', html: 'Unlisted' },
          { name: 'join', html: 'Join this game' },
          { name: 'randomOrder', html: 'Random player order' },
          ...info.options
            .filter((opt) => opt.type === 'checkbox')
            .map(function (opt) {
              return { name: opt.name, html: oneLineMarked(opt.label) };
            }),
        ]"
      />

      <div v-for="select in info.options.filter((opt) => opt.type === 'select')" :key="select.name" class="mt-2">
        <b-form-group :label-for="select.name">
          <template #label><span v-html="oneLineMarked(select.label)"></span> </template>
          <b-form-select
            :id="select.name"
            :options="
              (select.items || []).map((x) => ({ value: x.name, text: marked(x.label).replace(/<[^>]+>/g, '') }))
            "
            v-model="selects[select.name]"
            required
          />
        </b-form-group>
      </div>

      <b-button class="mt-3 float-right" type="submit" variant="primary" :disabled="submitting">New game</b-button>
    </form>
  </v-loading>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { handleError, handleInfo, upperFirst, oneLineMarked } from "@/utils";
import marked from "marked";
import { fromPairs } from "lodash";

@Component
export default class NewGame extends Vue {
  @Prop()
  boardgameId!: string;

  gameId = randomId();
  seed = "";
  players = 2;

  options = ["join", "randomOrder"];
  selects: _.Dictionary<string> = {};
  expansions = [];

  timePerMove = 2 * 3600;
  timePerGame = 3 * 24 * 3600;
  submitting = false;
  timerEnd = "22:00";
  timerStart = "09:00";

  scheduledDay = null as Date | null;
  scheduledTime = "";

  enableKarma = false;
  minimumKarma = Math.min(75, this.$store.state.user.account.karma - 5);

  get user() {
    return this.$store.state.user;
  }

  get info() {
    return this.$gameInfo.info(this.boardgameId, "latest");
  }

  toggleExpansion(expansion: string) {
    if (this.expansions.includes(expansion)) {
      this.expansions = this.expansions.filter((exp) => exp !== expansion);
    } else {
      this.expansions.push(expansion);
    }
  }

  createGame() {
    this.submitting = true;
    const { gameId, players, timePerMove, timePerGame, options, seed, expansions, minimumKarma } = this;

    const dataObj = {
      game: {
        game: this.boardgameId,
        version: this.info._id.version,
      },
      gameId,
      players,
      timePerMove,
      timePerGame,
      options: { ...fromPairs(options.map((key) => [key, true])), ...this.selects },
      seed,
      expansions,
      timerStart: undefined as number,
      timerEnd: undefined as number,
      scheduledStart: undefined as number,
      minimumKarma: +minimumKarma,
    };

    if (this.scheduledDay !== null && this.scheduledTime !== "") {
      this.scheduledDay.setHours(+this.scheduledTime.slice(0, 2));
      this.scheduledDay.setMinutes(+this.scheduledTime.slice(3, 5));
      dataObj.scheduledStart = this.scheduledDay.getTime();
    } else {
      delete dataObj.scheduledStart;
    }

    if (!this.enableKarma || !dataObj.minimumKarma) {
      delete dataObj.minimumKarma;
    }

    let { timerStart, timerEnd } = this;
    if (timerStart === undefined || timerStart === timerEnd || timerEnd === undefined) {
      delete dataObj.timerStart;
      delete dataObj.timerEnd;
    } else {
      const toTime = (x: string) => {
        const hours = +x.slice(0, 2);
        const minutes = +x.slice(3, 5);

        return (hours * 3600 + minutes * 60 + new Date().getTimezoneOffset() * 60 + 24 * 3600) % (24 * 3600);
      };

      dataObj.timerStart = toTime(timerStart);
      dataObj.timerEnd = toTime(timerEnd);
    }

    this.$axios
      .post("/game/new-game", dataObj)
      .then(
        () => this.$router.push("/game/" + this.gameId),
        (err) => handleError(err)
      )
      .then(() => (this.submitting = false));
  }

  get locale() {
    return navigator.languages?.[0] ?? navigator.language;
  }

  setGameId(event: TextEvent) {
    this.gameId = (event.target as any).value.trim().replace(/ /g, "-");
  }

  @Watch("boardgameId", { immediate: true })
  async onBoardgameIdChanged() {
    try {
      await this.$gameInfo.loadGameInfo(this.boardgameId, "latest");

      // Load default values for multiple choice options
      const selects: _.Dictionary<string> = {};

      for (const select of this.info.options.filter((option) => option.type === "select")) {
        if (select.items) {
          selects[select.name] = select.items[0].name;
        }
      }

      this.selects = selects;
    } catch (err) {
      handleError(err);
    }
  }

  oneLineMarked = oneLineMarked;
  marked = marked;
}

const adjectives = [
  "abstract",
  "admirable",
  "advanced",
  "agile",
  "alien",
  "ancient",
  "angular",
  "artisanal",
  "bash",
  "bionic",
  "bitter",
  "bizarre",
  "blatant",
  "blue",
  "blunt",
  "bold",
  "bright",
  "brilliant",
  "brown",
  "candid",
  "canine",
  "chaotic",
  "cheap",
  "clean",
  "clueless",
  "complex",
  "correct",
  "corrosive",
  "cosmic",
  "costly",
  "crazy",
  "crude",
  "curious",
  "cute",
  "cynical",
  "dark",
  "deceitful",
  "decisive",
  "distant",
  "dubious",
  "dull",
  "dynamic",
  "elder",
  "epic",
  "equine",
  "eternal",
  "euclidean",
  "federal",
  "feline",
  "fiery",
  "final",
  "firm",
  "flashing",
  "floating",
  "fluffy",
  "flying",
  "forbidden",
  "foreign",
  "frozen",
  "full",
  "funny",
  "fuzzy",
  "galactic",
  "gallant",
  "gentle",
  "ghastly",
  "glowing",
  "gray",
  "green",
  "guilty",
  "hairy",
  "half",
  "halting",
  "heavy",
  "helpful",
  "holistic",
  "holy",
  "homemade",
  "huge",
  "hungry",
  "imaginary",
  "immortal",
  "imperial",
  "inquiring",
  "insane",
  "inspiring",
  "inverting",
  "joyful",
  "killing",
  "kind",
  "large",
  "last",
  "lasting",
  "long",
  "looping",
  "lucky",
  "lunar",
  "lustful",
  "mad",
  "magical",
  "marvelous",
  "menacing",
  "metallic",
  "mighty",
  "milky",
  "modern",
  "natural",
  "noisy",
  "obedient",
  "oblivious",
  "obsessive",
  "obsolete",
  "obvious",
  "old",
  "opaque",
  "paramount",
  "perennial",
  "piling",
  "pink",
  "playful",
  "pleasant",
  "polemic",
  "polite",
  "prime",
  "princely",
  "pungent",
  "quantum",
  "quick",
  "reactive",
  "real",
  "red",
  "redundant",
  "repeating",
  "rhyming",
  "rolling",
  "rough",
  "round",
  "rumbly",
  "scarlet",
  "secret",
  "serene",
  "sharp",
  "shocking",
  "silky",
  "slim",
  "slow",
  "smooth",
  "sneaky",
  "solid",
  "spherical",
  "spinning",
  "spotless",
  "squared",
  "static",
  "stellar",
  "strong",
  "stunning",
  "sturdy",
  "sweet",
  "swift",
  "tasty",
  "telling",
  "temporal",
  "tempting",
  "tenacious",
  "timid",
  "tiny",
  "tough",
  "tricky",
  "trusty",
  "unholy",
  "ursine",
  "vengeful",
  "vintage",
  "virtual",
  "vorpal",
  "warped",
  "watery",
  "wavely",
  "weak",
  "wet",
  "whirly",
  "wicked",
  "wide",
  "wizardly",
  "xenial",
  "xyloid",
  "yeeting",
  "yellow",
  "yielding",
  "young",
  "yummy",
  "zany",
  "zealous",
];

const nouns = [
  "action",
  "adventures",
  "algorithms",
  "alliance",
  "alpaca",
  "amount",
  "analysis",
  "angle",
  "ants",
  "armada",
  "artifact",
  "avocado",
  "baby",
  "barnacle",
  "barrel",
  "barricade",
  "bear",
  "beauty",
  "beetle",
  "behavior",
  "bottle",
  "cacophony",
  "cactus",
  "cage",
  "capybara",
  "cat",
  "catapult",
  "chameleon",
  "character",
  "clone",
  "closure",
  "cluster",
  "coalition",
  "comeback",
  "condition",
  "connection",
  "cube",
  "curiosity",
  "dance",
  "deal",
  "decision",
  "defense",
  "delusion",
  "demand",
  "desire",
  "devices",
  "diamond",
  "discovery",
  "dog",
  "doubt",
  "dreams",
  "drink",
  "duck",
  "dynamo",
  "egg",
  "elevator",
  "elf",
  "empire",
  "enigma",
  "entrance",
  "escape",
  "ether",
  "exchange",
  "experiment",
  "fairy",
  "farm",
  "fear",
  "federation",
  "festival",
  "flavor",
  "food",
  "forces",
  "front",
  "future",
  "game",
  "gem",
  "geniuses",
  "ghost",
  "glimpse",
  "ground",
  "guacamole",
  "guerrilla",
  "heap",
  "heart",
  "heroes",
  "hippies",
  "horse",
  "ignorance",
  "iguana",
  "impetus",
  "input",
  "intents",
  "island",
  "jaguar",
  "jeans",
  "jester",
  "judge",
  "juice",
  "justice",
  "knot",
  "knowledge",
  "koala",
  "leprechaun",
  "lie",
  "life",
  "lifestyle",
  "liquor",
  "list",
  "llama",
  "loop",
  "luck",
  "lust",
  "machine",
  "madness",
  "magic",
  "magician",
  "match",
  "mind",
  "mindset",
  "mischief",
  "morning",
  "movement",
  "mushroom",
  "mystery",
  "nature",
  "network",
  "noise",
  "officer",
  "opal",
  "opening",
  "operation",
  "orb",
  "orc",
  "paint",
  "paper",
  "paradox",
  "path",
  "peace",
  "people",
  "philosophy",
  "picture",
  "piece",
  "pixels",
  "planet",
  "plant",
  "pressure",
  "problem",
  "property",
  "pyramid",
  "quadrant",
  "quasar",
  "queue",
  "rage",
  "rainbow",
  "reaction",
  "redundancy",
  "release",
  "remorse",
  "rhythm",
  "riddle",
  "robot",
  "rule",
  "sandwich",
  "school",
  "sea",
  "secret",
  "secretary",
  "shape",
  "shield",
  "showdown",
  "sign",
  "signal",
  "skyscraper",
  "society",
  "song",
  "space",
  "spade",
  "sphere",
  "stack",
  "star",
  "station",
  "statuettes",
  "stay",
  "stick",
  "stock",
  "story",
  "strategy",
  "strength",
  "sunshine",
  "supply",
  "surface",
  "surprise",
  "sword",
  "symphony",
  "technology",
  "theorem",
  "theory",
  "thing",
  "thong",
  "thunder",
  "tools",
  "torpedo",
  "trade",
  "treasure",
  "trebuchet",
  "tree",
  "triangle",
  "turtle",
  "ufo",
  "union",
  "universe",
  "university",
  "uranium",
  "values",
  "vanguard",
  "villain",
  "visit",
  "visitors",
  "wall",
  "way",
  "wish",
  "witch",
  "wonder",
  "words",
  "x-mark",
  "xenos",
  "youngsters",
  "zombie",
];

function randomId() {
  return (
    upperFirst(adjectives[Math.floor(Math.random() * adjectives.length)]) +
    "-" +
    nouns[Math.floor(Math.random() * nouns.length)] +
    "-" +
    Math.ceil(Math.random() * 9999)
  );
}
</script>

<style lang="scss"></style>
