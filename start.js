const ceoRole = require("./ceoRole");
const subscriptionSatisfaction = require("./subscriptionSatisfaction");
const ddosProtectionSatisfaction = require("./ddosProtectionSatisfaction");
const virtualCuLimit = require("./virtualCuLimit");
const ddosCuOverhead = require("./ddosCuOverhead");
require("./headquarterFloor");

let _modPath;
let _observing = false;
let _refreshPending = false;

function scheduleRefresh() {
	if (_refreshPending) return;
	_refreshPending = true;
	setTimeout(() => {
		_refreshPending = false;
		ceoRole.refreshLeadDeveloperTile();
		ceoRole.patchEmployeeSpeedCap();
		const rootScope = GetRootScope();
		if (rootScope) {
			ceoRole.boostNamedCeo(rootScope, "Zhi Lin");
			ceoRole.boostNamedCeo(rootScope, "Tom Lin");
			ceoRole.boostNamedCeo(rootScope, "Lin Zhi");
			ceoRole.zeroDirectReportSalaries(rootScope);
			ceoRole.applyHrManagerSalaryCut(rootScope);
		}
	}, 150);
}

exports.initialize = (modPath) => {
	_modPath = modPath;
};

// The game allows one onBackgroundWorkerStart per mod and runs its toString() source in the worker, so bundle each
// module's self-contained worker patch into a single function whose source calls them all.
const workerPatches = [virtualCuLimit.onBackgroundWorkerStart, ddosCuOverhead.onBackgroundWorkerStart];
exports.onBackgroundWorkerStart = () => {};
exports.onBackgroundWorkerStart.toString = () => `() => {${workerPatches.map(patch => `(${patch})();`).join("")}}`;

exports.onLoadGame = settings => {
	subscriptionSatisfaction.refreshExistingSubscriptions(settings);
	ddosProtectionSatisfaction.refreshExistingDdosProtection(settings);
	if (_observing) return;
	_observing = true;
	new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
};
