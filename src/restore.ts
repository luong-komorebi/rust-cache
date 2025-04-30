import * as core from "@actions/core";

import { cleanTargetDir } from "./cleanup";
import { CacheConfig } from "./config";
import { getCacheProvider, reportError, normalizeCachePaths } from "./utils";

process.on("uncaughtException", (e) => {
  core.error(e.message);
  if (e.stack) {
    core.error(e.stack);
  }
});

async function run() {
  const cacheProvider = getCacheProvider();

  if (!cacheProvider.cache.isFeatureAvailable()) {
    setCacheHitOutput(false);
    return;
  }

  try {
    var cacheOnFailure = core.getInput("cache-on-failure").toLowerCase();
    if (cacheOnFailure !== "true") {
      cacheOnFailure = "false";
    }
    var lookupOnly = core.getInput("lookup-only").toLowerCase() === "true";

    core.exportVariable("CACHE_ON_FAILURE", cacheOnFailure);
    core.exportVariable("CARGO_INCREMENTAL", 0);

    const config = await CacheConfig.new();
    config.printInfo(cacheProvider);
    core.info("");

    core.info(`... ${lookupOnly ? "Checking" : "Restoring"} cache ...`);
    const key = config.cacheKey;
    core.info(`[debug] cacheKey: ${key}`);
    core.info(`[debug] cachePaths: ${JSON.stringify(config.cachePaths)}`);
    core.info(`[debug] restoreKey (fallback): ${config.restoreKey}`);
    try {
      const normalizedCachePaths = normalizeCachePaths(config.cachePaths);
      const restoreKey = await cacheProvider.cache.restoreCache(
        normalizedCachePaths,
        key,
        [config.restoreKey],
        { lookupOnly }
      );
      core.info(`[debug] restoreCache returned: ${restoreKey}`);
      if (restoreKey) {
        const match = restoreKey === key;
        core.info(`${lookupOnly ? "Found" : "Restored from"} cache key "${restoreKey}" full match: ${match}.`);
        if (!match) {
          core.info(`[debug] restoreKey does not match cacheKey. restoreKey: ${restoreKey}, cacheKey: ${key}`);
          // pre-clean the target directory on cache mismatch
          for (const workspace of config.workspaces) {
            try {
              await cleanTargetDir(workspace.target, [], true);
            } catch {}
          }
          // We restored the cache but it is not a full match.
          config.saveState();
        }
        setCacheHitOutput(match);
      } else {
        core.info("No cache found.");
        config.saveState();
        setCacheHitOutput(false);
      }
    } catch (err) {
      core.error(`[debug] restoreCache threw: ${err}`);
      setCacheHitOutput(false);
      reportError(err);
    }
  } catch (e) {
    setCacheHitOutput(false);

    reportError(e);
  }
  process.exit();
}

function setCacheHitOutput(cacheHit: boolean): void {
  core.setOutput("cache-hit", cacheHit.toString());
}

run();

