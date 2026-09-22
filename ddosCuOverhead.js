// While a DDoS attack is active the game doubles a product's required CU (Configuration.DDOS_ATTACK_MULTIPLIER) inside
// Helpers.GetProductStats, regardless of whether DDoS Protection is installed or how efficient it is. Protection only
// removes the bot users from users.online (a separate, second application of the same multiplier), so a fully protected
// product still took a flat x2 CU spike.
//
// Real mitigation (e.g. Cloudflare's edge) drops nearly all attack traffic before it reaches the origin, leaving only a
// small always-on filtering cost. So the CU multiplier's extra load (multiplier - 1) is scaled by the share of attack
// traffic that protection does NOT stop, floored at RESIDUAL_CU_OVERHEAD:
//
//   efficiency | CU multiplier (game's x2)
//   none       | x2    (unchanged: with the x2 bot users an unprotected attack is still x4 in total)
//   50%        | x1.5
//   100%       | x1.05
//
// Only the CU line inside GetProductStats is affected; the bot-user inflation in the worker still reads the untouched
// constant, so the protection's user-count effect (and the harshness of an unprotected attack) is unchanged.
//
// Helpers.GetProductStats runs in both the main thread (UI refresh) and the background worker (which sets the
// Stable/Unstable/Critical state that drives user loss), each with its own Helpers/Configuration. The game serializes
// onBackgroundWorkerStart with toString() and evals it in the worker, so this must be a self-contained arrow function
// (constants inside it, nothing from this module's scope) that is also what the main thread runs.
const patchDdosCuOverhead = () => {
	// Share of the attack's extra CU that survives even 100% protection (the cost of inspecting and dropping traffic).
	const RESIDUAL_CU_OVERHEAD = 0.05;

	const gameGetProductStats = Helpers.GetProductStats;
	if (gameGetProductStats.ddosCuOverheadPatched) return;

	// (product, progress, featureInstances, availableCu): featureInstances are the product's activated features.
	// GetProductStats reads Configuration.DDOS_ATTACK_MULTIPLIER only at its CU line, and synchronously, so swapping the
	// constant for the effective multiplier around the call reuses all of the game's own state/response-time logic.
	Helpers.GetProductStats = (product, progress, instances, availableCu) => {
		const stats = progress.activeDdos ? getDdosProductStats(product, progress, instances, availableCu) : gameGetProductStats(product, progress, instances, availableCu);

		// The game rounds the CU before applying the multiplier and stores peakCu unrounded, so a fractional multiplier
		// leaves fractional peak CU (also cleans up any already saved). The max with the (whole) stored peak stays whole.
		stats.performance.peakCu = Math.round(stats.performance.peakCu);
		return stats;
	};

	const getDdosProductStats = (product, progress, instances, availableCu) => {
		const protection = instances.find(instance => instance.featureName == FeatureNames.DdosProtection);
		const unmitigated = null == protection ? 1 : Math.max(1 - protection.efficiency / 100, RESIDUAL_CU_OVERHEAD);
		const gameMultiplier = Configuration.DDOS_ATTACK_MULTIPLIER;

		Configuration.DDOS_ATTACK_MULTIPLIER = 1 + (gameMultiplier - 1) * unmitigated;
		try {
			return gameGetProductStats(product, progress, instances, availableCu);
		} finally {
			Configuration.DDOS_ATTACK_MULTIPLIER = gameMultiplier;
		}
	};
	Helpers.GetProductStats.ddosCuOverheadPatched = true;
};
patchDdosCuOverhead();

exports.onBackgroundWorkerStart = patchDdosCuOverhead;
