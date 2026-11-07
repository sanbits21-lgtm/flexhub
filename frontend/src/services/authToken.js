// The staff website's short-lived access token lives only in memory: nothing a script on the page
// could read from storage is worth stealing. It is renewed by the refresh cookie (httpOnly, so
// scripts cannot read that either); see services/api.js and context/AuthContext.jsx.
let token = null;

export const getToken = () => token;
export const setToken = (t) => { token = t; };
