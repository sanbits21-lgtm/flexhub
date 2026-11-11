// Is this MongoDB connection string a database on another machine (Atlas, a hosted cluster), as opposed
// to one on this computer or in this project's own docker network?
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|mongo)(:\d+)?$/i;

const isRemoteMongoUri = (uri) => {
  const m = String(uri || '').match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  if (!m) return false; // not a URI we understand: say nothing rather than something wrong
  if (/^mongodb\+srv:/i.test(uri)) return true; // SRV records only exist for hosted clusters
  return m[1].split(',').some((host) => !LOCAL.test(host));
};

module.exports = { isRemoteMongoUri };
