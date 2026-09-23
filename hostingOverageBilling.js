// Hosting instance counts stay exactly as the player sets them on the Hosting page (see virtualCuLimit.js) - this
// mod does not add or remove instances. Instead, whenever a product's requiredCu exceeds its provisioned
// availableCu, it removes the game's normal penalty (serverUsage > 100 degrades responseTime and eventually
// flips the product Unstable/Critical, which drives user loss) and replaces it with a cloud-provider-style
// overage bill: capacity is treated as if it always matched demand, and the CU shortfall is billed in cash
// instead. This mirrors real cloud billing, where bursting past your reserved capacity costs more per unit
// rather than degrading service.
//
// Mechanism: Helpers.GetProductStats is probed once with the product's real servers to read the true
// requiredCu/availableCu. If there's a deficit, Helpers.CalculateTotalCuByProduct is temporarily swapped (same
// swap-call-restore approach as ddosCuOverhead.js's Configuration.DDOS_ATTACK_MULTIPLIER swap) so the second,
// real call sees capacity >= demand, and the deficit (in CU-minutes) is accumulated onto
// progress.stats.performance.overageCu - a field piggybacked onto the same stats object that already round-trips
// between threads every tick (Game.BackgroundWorker.onmessage replaces settings.progress with the worker's
// output wholesale, and the next RunBackgroundWorker call sends that same settings.progress back in), so the
// running total survives across ticks without needing any new cross-thread channel.
//
// Billing itself only makes sense on the main thread (Game.Lifecycle, $rootScope.addTransaction - none of which
// exist in the worker), so Helpers.ResetEngine is wrapped separately to re-patch the freshly created
// Game.Lifecycle's _runExpenses each time a game is loaded/reset: once a day, it reads each product's
// accumulated overageCu, bills it at OVERAGE_PRICE_MULTIPLIER x the cheapest reserved-capacity CU rate
// (LargeVirtualServer), and resets the accumulator to 0.
//
// OVERAGE_PRICE_MULTIPLIER is a placeholder - the intended price point hasn't been decided yet, so tune it here.
//
// Helpers.GetProductStats runs in both the main thread (UI refresh) and the background worker (which sets the
// Stable/Unstable/Critical state that drives user loss), each with its own Helpers/Configuration/Servers. The
// game serializes onBackgroundWorkerStart with toString() and evals it in the worker, so patchGetProductStats
// must be a self-contained arrow function (constants inside it, nothing from this module's scope) that is also
// what the main thread runs. Only the worker's global `worker` object carries elapsed-minutes-per-tick
// (worker.settings.minutes), so overageCu only accumulates there; the main thread's own GetProductStats calls
// (instant UI refresh after manual hosting-page edits) would double-count elapsed time if they also accumulated.
const patchGetProductStats = () => {
	const gameGetProductStats = Helpers.GetProductStats;
	if (gameGetProductStats.overageBillingPatched) return;

	Helpers.GetProductStats = (product, progress, instances, availableCu) => {
		const trueStats = gameGetProductStats(product, progress, instances, availableCu);
		const previousOverageCu = (progress.stats && progress.stats.performance.overageCu) || 0;
		const deficitCu = trueStats.performance.requiredCu - trueStats.performance.availableCu;

		if (deficitCu <= 0) {
			trueStats.performance.overageCu = previousOverageCu;
			return trueStats;
		}

		// +1: requiredCu is Math.round()'d, but the game's own serverUsage math divides by the unrounded CU figure
		// (visible when DDoS's fractional multiplier - ddosCuOverhead.js - reintroduces a fraction after the
		// game's own initial rounding). Matching requiredCu exactly can therefore still land serverUsage a hair
		// over 100, and Math.pow(u, 1.5) makes even that tiny an overshoot spike response time ~10x.
		const realCalculateTotalCuByProduct = Helpers.CalculateTotalCuByProduct;
		Helpers.CalculateTotalCuByProduct = (...args) => Math.max(realCalculateTotalCuByProduct(...args), trueStats.performance.requiredCu + 1);
		let stats;
		try {
			stats = gameGetProductStats(product, progress, instances, availableCu);
		} finally {
			Helpers.CalculateTotalCuByProduct = realCalculateTotalCuByProduct;
		}

		stats.performance.overageCu = typeof worker != "undefined" ? previousOverageCu + deficitCu * worker.settings.minutes : previousOverageCu;
		return stats;
	};

	Helpers.GetProductStats.overageBillingPatched = true;
};
patchGetProductStats();

exports.onBackgroundWorkerStart = patchGetProductStats;

// Main-thread only: Game.Lifecycle, $rootScope and addTransaction don't exist in the worker.
const patchResetEngine = () => {
	const gameResetEngine = Helpers.ResetEngine;
	if (gameResetEngine.overageBillingPatched) return;

	const OVERAGE_PRICE_MULTIPLIER = 3;
	const reservedServer = Servers.find(s => s.name == ServerNames.LargeVirtualServer);
	const overagePricePerCuMinute = (reservedServer.pricePerDay / reservedServer.computeUnit / (24 * 60)) * OVERAGE_PRICE_MULTIPLIER;

	Helpers.ResetEngine = (...args) => {
		const result = gameResetEngine(...args);

		const lifecycle = Game.Lifecycle;
		const gameRunExpenses = lifecycle._runExpenses;
		lifecycle._runExpenses = () => {
			gameRunExpenses();

			const rootScope = lifecycle.$rootScope;
			rootScope.settings.products.forEach(product => {
				const progress = rootScope.settings.progress.products[product.id];
				const overageCu = (progress && progress.stats.performance.overageCu) || 0;
				if (overageCu <= 0) return;

				rootScope.addTransaction(`Cloud overage (${product.name})`, -(overageCu * overagePricePerCuMinute), true);
				progress.stats.performance.overageCu = 0;
			});
		};

		return result;
	};

	Helpers.ResetEngine.overageBillingPatched = true;
};
patchResetEngine();
