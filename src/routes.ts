/**
 * An array of public routes that do not require authentication.
 * @type {string[]}
 */
export const publicRoutes = [ 
  "/",
  "/auth/new-verification"
];

/**
 * An array of routes that are used for authentication.
 * these routes do not require authentication.
 * @type {string[]}
 */
export const authRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/error",
];


/**
 * The prefix for the api routes.
 * Routes that start with this prefix are used for api authentication.
 * @type {string} 
 */
export const apiAuthPrefix = "/api/auth";

/**
 * the default route to redirect to after login.
 * @type {string}
 */
export const DEFAULT_LOGIN_REDIRECT: string = "/dashboard";