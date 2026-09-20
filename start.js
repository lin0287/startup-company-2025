const ceoRole = require("./ceoRole");
const subscriptionSatisfaction = require("./subscriptionSatisfaction");
const ddosProtectionSatisfaction = require("./ddosProtectionSatisfaction");
const virtualCuLimit = require("./virtualCuLimit");

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

exports.onBackgroundWorkerStart = virtualCuLimit.onBackgroundWorkerStart;

exports.onLoadGame = settings => {
	subscriptionSatisfaction.refreshExistingSubscriptions(settings);
	ddosProtectionSatisfaction.refreshExistingDdosProtection(settings);
	if (_observing) return;
	_observing = true;
	new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
};
