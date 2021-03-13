import { get } from "svelte/store";
import { loadAccountIfNeeded } from "./api";
import { createRouter, navigate, route, RouteConfig } from "./modules/router";
import Home from "./pages/Home.svelte";
import NotFound from "./pages/NotFound.svelte";
import User from "./pages/User.svelte";
import { user } from "./store";
import { handleError } from "./utils";

const routes: RouteConfig[] = [
  {
    path: "/",
    component: Home,
  },
  {
    path: "/user/:username",
    component: User,
  },
  {
    path: "/login",
    name: "login",
    component: NotFound,
    meta: {
      loggedOut: true,
    },
  },
  {
    path: "/account",
    name: "account",
    component: NotFound,
    meta: {
      loggedIn: true,
    },
  },
  {
    path: "*",
    component: NotFound,
  },
];

let routing = false;

createRouter({
  routes,
  globalGuard: async (to) => {
    routing = true;
    await loadAccountIfNeeded().catch(handleError);
    routing = false;

    const $user = get(user);
    if (to.meta.loggedOut && $user) {
      console.log("trying to access " + to.path + " while logged in");
      return to.query.redirect || "/account";
    } else if (to.meta.loggedIn && !$user) {
      return { name: "login", query: { redirect: to.fullPath } };
    }

    // continue to `to`
  },
});

user.subscribe((user) => {
  if (routing) {
    return;
  }

  const $route = get(route);

  if ($route?.meta.loggedIn && !user) {
    navigate({ name: "login", query: { redirect: $route.path } });
  } else if ($route?.meta.loggedOut && user) {
    navigate($route.query.redirect || "/account");
  }
});
