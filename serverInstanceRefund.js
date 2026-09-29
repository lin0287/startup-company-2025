// FastClouds' hosting page lets players add virtual server instances to a product (the productHosting
// directive's addInstance, game.min.js:~57407), charging the tier's `requirements` in full via
// Helpers.ApplyRequirementsToInventory. Removing an instance (removeInstance, same directive,
// game.min.js:~57411) only decrements product.servers[name] - the game never gives any of that cost
// back, on any tier (including MegaVirtualServer - see megaVirtualServer.js).
//
// removeInstance is a closure local to the directive's controller (not a patchable Helpers.*/Servers.*
// global), so this instead wraps Helpers.UpdateProductStats, which both addInstance and removeInstance
// call immediately after mutating product.servers[name] - and which also runs on its own every
// 200-700ms while the hosting page is open (via a UiUpdate poll), and in bulk (no product argument,
// over every product) from a couple of other event handlers. A per-product snapshot of servers counts,
// keyed by object reference so a deleted product's entry is garbage collected instead of leaking, lets
// this tell a genuine removal (count went down) apart from an addition (already paid for in full by
// addInstance) or a repeated identical poll (no change at all). The first time a product is seen there
// is nothing to diff against yet, so it's only recorded, never refunded.
//
// REFUND_PERCENTAGE mirrors the game's own hosting-equipment sell-back rate (sellDevice, game.min.js -
// 80% of price) so removing a virtual server instance follows the same convention.
const REFUND_PERCENTAGE = 0.8;

const previousServerCounts = new WeakMap();

function refundRemovedInstances(product) {
	if (null == product || null == product.servers) return;

	const previous = previousServerCounts.get(product);
	previousServerCounts.set(product, Object.assign({}, product.servers));
	if (null == previous) return;

	Object.keys(product.servers).forEach(tierName => {
		const removed = (previous[tierName] || 0) - (product.servers[tierName] || 0);
		if (removed <= 0) return;

		const tier = Servers.find(s => s.name == tierName);
		if (null == tier) return;

		const refund = {};
		Object.keys(tier.requirements).forEach(component => {
			refund[component] = Math.round(tier.requirements[component] * REFUND_PERCENTAGE * removed);
		});
		Helpers.ApplyRequirementsToInventory(refund, true);
	});
}

function patchUpdateProductStats() {
	const gameUpdateProductStats = Helpers.UpdateProductStats;
	if (gameUpdateProductStats.serverInstanceRefundPatched) return;

	Helpers.UpdateProductStats = product => {
		if (null != product) {
			refundRemovedInstances(product);
		} else {
			const rootScope = GetRootScope();
			if (null != rootScope) rootScope.settings.products.forEach(refundRemovedInstances);
		}
		return gameUpdateProductStats(product);
	};
	Helpers.UpdateProductStats.serverInstanceRefundPatched = true;
}
patchUpdateProductStats();
