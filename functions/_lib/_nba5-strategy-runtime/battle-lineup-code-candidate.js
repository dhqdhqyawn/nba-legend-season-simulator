(function installH5BattleLineupCodeCandidate(globalScope) {
  "use strict";

  const SCHEMA_VERSION = "battle-lineup-code-candidate-1.0.0";
  const CODE_PREFIX = "NBA5-S1-";
  const CODE_FAMILY_PREFIX = "NBA5-";
  const FORMAT_VERSION = 1;
  const LINEUP_SIZE = 5;
  const TOKEN_BYTES = 4;
  const PAYLOAD_BYTES = 1 + LINEUP_SIZE * TOKEN_BYTES;
  const CHECKSUM_BYTES = 4;
  const ENCODED_BYTES = PAYLOAD_BYTES + CHECKSUM_BYTES;
  const MAX_INPUT_LENGTH = 4096;

  class BattleLineupCodeError extends Error {
    constructor(code, details = {}) {
      super(code);
      this.name = "BattleLineupCodeError";
      this.code = code;
      this.details = details;
    }
  }

  function fail(code, details) {
    throw new BattleLineupCodeError(code, details);
  }

  function defaultVersionKey(card) {
    return card?.v35?.sourceKey
      || card?.v34?.cardId
      || card?.eventProfile?.versionKey
      || card?.versionKey
      || (typeof card?.cardId === "string" ? card.cardId : "");
  }

  function defaultVersionKeys(card) {
    return [
      card?.v35?.sourceKey,
      card?.v34?.cardId,
      card?.eventProfile?.versionKey,
      card?.versionKey,
      typeof card?.cardId === "string" ? card.cardId : null
    ].filter((key, index, values) => (
      typeof key === "string" && key.trim() && values.indexOf(key) === index
    ));
  }

  function defaultPlayerKey(card) {
    return card?.playerIdentityKey
      || card?.playerKey
      || card?.eventProfile?.stablePlayerKey
      || card?.eventProfile?.playerKey
      || card?.v34?.playerKey
      || card?.name
      || "";
  }

  function defaultSlots(card) {
    return card?.slots;
  }

  function normalizeKey(value, errorCode) {
    if (typeof value !== "string" || !value.trim()) fail(errorCode);
    return value.trim();
  }

  function normalizePlayerKey(value) {
    return normalizeKey(value, "missing-stable-player-key")
      .normalize("NFKC")
      .toLocaleLowerCase("en-US");
  }

  function stableVersionToken(versionKey) {
    // FNV-1a over Unicode code points. The token is only accepted after the
    // complete catalog has been checked for collisions.
    let hash = 2166136261;
    for (const character of String(versionKey)) {
      let codePoint = character.codePointAt(0);
      do {
        hash ^= codePoint & 0xff;
        hash = Math.imul(hash, 16777619);
        codePoint >>>= 8;
      } while (codePoint > 0);
    }
    return hash >>> 0;
  }

  function checksum32(bytes, length = bytes.length) {
    let hash = 2166136261;
    for (let index = 0; index < length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function writeUint32(bytes, offset, value) {
    const number = Number(value) >>> 0;
    bytes[offset] = number >>> 24;
    bytes[offset + 1] = number >>> 16 & 0xff;
    bytes[offset + 2] = number >>> 8 & 0xff;
    bytes[offset + 3] = number & 0xff;
  }

  function readUint32(bytes, offset) {
    return (
      bytes[offset] * 0x1000000
      + (bytes[offset + 1] << 16)
      + (bytes[offset + 2] << 8)
      + bytes[offset + 3]
    ) >>> 0;
  }

  function encodeBase64Url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decodeBase64Url(encoded) {
    const input = String(encoded || "");
    if (!input || !/^[A-Za-z0-9_-]+$/.test(input)) fail("invalid-short-code-encoding");
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    let binary;
    try {
      binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    } catch {
      fail("invalid-short-code-encoding");
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (encodeBase64Url(bytes) !== input) fail("non-canonical-short-code");
    return bytes;
  }

  function prepareCatalog({
    catalog,
    getVersionKey,
    getVersionKeys,
    getPlayerKey,
    getSlots,
    tokenForKey
  }) {
    if (!Array.isArray(catalog)) fail("catalog-must-be-an-array");
    const byVersionKey = new Map();
    const byToken = new Map();
    const records = [];

    for (const card of catalog) {
      const versionKey = normalizeKey(getVersionKey(card), "missing-card-version-key");
      const versionKeys = [...new Set([
        versionKey,
        ...(getVersionKeys(card) || [])
      ].map(key => normalizeKey(key, "missing-card-version-key")))];
      const playerKey = normalizePlayerKey(getPlayerKey(card));
      const slots = getSlots(card);
      if (!Array.isArray(slots) || slots.some(slot => !Number.isInteger(slot) || slot < 1 || slot > 5)) {
        fail("invalid-card-position-slots", { versionKey });
      }
      const token = Number(tokenForKey(versionKey));
      if (!Number.isInteger(token) || token < 0 || token > 0xffffffff) {
        fail("invalid-version-token", { versionKey });
      }
      const unsignedToken = token >>> 0;
      const record = Object.freeze({
        card,
        versionKey,
        versionKeys: Object.freeze(versionKeys),
        playerKey,
        slots: Object.freeze([...slots]),
        token: unsignedToken
      });
      for (const alias of versionKeys) {
        const existingKey = byVersionKey.get(alias);
        if (existingKey && existingKey.card !== card) {
          fail("duplicate-catalog-version-key", { versionKey: alias });
        }
        const aliasToken = Number(tokenForKey(alias));
        if (!Number.isInteger(aliasToken) || aliasToken < 0 || aliasToken > 0xffffffff) {
          fail("invalid-version-token", { versionKey: alias });
        }
        const unsignedAliasToken = aliasToken >>> 0;
        const existingToken = byToken.get(unsignedAliasToken);
        if (existingToken && existingToken.card !== card) {
          fail("catalog-version-token-collision", {
            token: unsignedAliasToken,
            versionKeys: [existingToken.versionKey, alias]
          });
        }
        byVersionKey.set(alias, record);
        byToken.set(unsignedAliasToken, record);
      }
      records.push(record);
    }

    return {
      records: Object.freeze(records),
      byVersionKey,
      byToken
    };
  }

  function validateAndResolveLineup(lineup, catalogState, getVersionKey) {
    if (!Array.isArray(lineup) || lineup.length !== LINEUP_SIZE || lineup.some(card => !card)) {
      fail("lineup-must-have-five-cards");
    }
    const resolved = lineup.map((card, index) => {
      const versionKey = normalizeKey(getVersionKey(card), "missing-card-version-key");
      const record = catalogState.byVersionKey.get(versionKey);
      if (!record) fail("unknown-card-version", { versionKey });
      if (!record.slots.includes(index + 1)) {
        fail("ineligible-fixed-position", { versionKey, position: index + 1 });
      }
      return record;
    });
    if (new Set(resolved.map(record => record.versionKey)).size !== LINEUP_SIZE) {
      fail("duplicate-card-version");
    }
    if (new Set(resolved.map(record => record.playerKey)).size !== LINEUP_SIZE) {
      fail("duplicate-player-identity");
    }
    return resolved;
  }

  function createBattleLineupCodeCodec(options = {}) {
    const getVersionKey = options.getVersionKey || defaultVersionKey;
    const getVersionKeys = options.getVersionKeys || defaultVersionKeys;
    const getPlayerKey = options.getPlayerKey || defaultPlayerKey;
    const getSlots = options.getSlots || defaultSlots;
    const tokenForKey = options.tokenForKey || stableVersionToken;
    const legacyDecoder = options.legacyDecoder;
    const catalogState = prepareCatalog({
      catalog: options.catalog,
      getVersionKey,
      getVersionKeys,
      getPlayerKey,
      getSlots,
      tokenForKey
    });

    function validate(lineup) {
      return validateAndResolveLineup(lineup, catalogState, getVersionKey)
        .map(record => record.card);
    }

    function encode(lineup) {
      const records = validateAndResolveLineup(lineup, catalogState, getVersionKey);
      const bytes = new Uint8Array(ENCODED_BYTES);
      bytes[0] = FORMAT_VERSION;
      records.forEach((record, index) => {
        writeUint32(bytes, 1 + index * TOKEN_BYTES, record.token);
      });
      writeUint32(bytes, PAYLOAD_BYTES, checksum32(bytes, PAYLOAD_BYTES));
      return `${CODE_PREFIX}${encodeBase64Url(bytes)}`;
    }

    function decodeShort(input) {
      const encoded = input.slice(CODE_PREFIX.length);
      const bytes = decodeBase64Url(encoded);
      if (bytes.length !== ENCODED_BYTES) fail("invalid-short-code-length");
      if (bytes[0] !== FORMAT_VERSION) fail("unsupported-short-code-version");
      const expectedChecksum = readUint32(bytes, PAYLOAD_BYTES);
      if (checksum32(bytes, PAYLOAD_BYTES) !== expectedChecksum) fail("damaged-code");
      const records = [];
      for (let index = 0; index < LINEUP_SIZE; index += 1) {
        const token = readUint32(bytes, 1 + index * TOKEN_BYTES);
        const record = catalogState.byToken.get(token);
        if (!record) fail("unknown-card-version-token", { token, position: index + 1 });
        records.push(record);
      }
      return validateAndResolveLineup(
        records.map(record => record.card),
        catalogState,
        getVersionKey
      ).map(record => record.card);
    }

    function decode(code) {
      const input = String(code || "").trim();
      if (!input.startsWith(CODE_FAMILY_PREFIX) || input.length > MAX_INPUT_LENGTH) {
        fail("invalid-code-prefix-or-length");
      }
      if (input.startsWith(CODE_PREFIX)) return decodeShort(input);
      if (/^NBA5-S\d+-/.test(input)) fail("unsupported-short-code-version");
      if (typeof legacyDecoder !== "function") fail("legacy-code-decoder-required");
      let legacyLineup;
      try {
        legacyLineup = legacyDecoder(input, catalogState.records.map(record => record.card));
      } catch (error) {
        if (error instanceof BattleLineupCodeError) throw error;
        fail("legacy-code-decode-failed", { cause: String(error?.message || error) });
      }
      return validate(legacyLineup);
    }

    return Object.freeze({
      encode,
      decode,
      validate,
      catalogSize: catalogState.records.length,
      formatVersion: FORMAT_VERSION,
      prefix: CODE_PREFIX
    });
  }

  const api = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    prefix: CODE_PREFIX,
    formatVersion: FORMAT_VERSION,
    createBattleLineupCodeCodec,
    stableVersionToken,
    BattleLineupCodeError
  });

  globalScope.H5BattleLineupCodeCandidate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
