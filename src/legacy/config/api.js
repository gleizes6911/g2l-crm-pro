/** Base API : même origine (Next) + rewrite vers API_UPSTREAM, ou URL absolue en NEXT_PUBLIC_API_URL */
const API_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "";
export default API_BASE;
