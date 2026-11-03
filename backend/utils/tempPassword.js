const crypto = require('crypto');

// A temporary password staff read out or copy to someone. No look-alike characters
// (0/O, 1/l/I). 10 characters from a 54-letter alphabet is ~57 bits, drawn from the OS
// CSPRNG; the modulo bias on 256 % 54 is negligible at this strength.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

const generateTempPassword = (length = 10) =>
  Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');

module.exports = { generateTempPassword };
