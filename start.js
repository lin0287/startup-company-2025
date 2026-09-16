const ceoRole = require("./ceoRole");

let _modPath;
let _observing = false;
let _refreshPending = false;

function scheduleRefresh() {
	if (_refreshPending) return;
	_refreshPending = true;
	setTimeout(() => {
		_refreshPending = false;
		ceoRole.refreshLeadDeveloperTile();
	}, 150);
}

exports.initialize = (modPath) => {
	_modPath = modPath;
};

exports.onLoadGame = settings => {
	if (_observing) return;
	_observing = true;
	new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
};
