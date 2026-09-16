let _modPath;
let _observing = false;
let _refreshPending = false;

function getCeoWorkstation(settings) {
	return settings.office.workstations.find(ws => ws.employee && ws.employee.employeeTypeName == Enums.EmployeeTypeNames.ChiefExecutiveOfficer);
}

function toggleCeoRole(rootScope) {
	const ws = getCeoWorkstation(rootScope.settings);
	if (null == ws) return;
	const isLeadDeveloper = ws.employee.skill == Enums.EmployeeTypeNames.LeadDeveloper;
	ws.employee.skill = isLeadDeveloper ? Enums.EmployeeTypeNames.Developer : Enums.EmployeeTypeNames.LeadDeveloper;
	ws.employee.task = null; // mirror the game's own role-switch reset so a stale task doesn't crash the Development panel
	ws.employee.queue = ws.employee.queue || []; // production-type employees need a task queue (normally set up in GenerateEmployee based on employeeTypeName, which the CEO never gets)
	ws.employee.activeQueueIndex = null;
	ws.employee.lastTab = null;
	rootScope.$broadcast(Enums.GameEvents.EmployeeChange);

	// The workstation panel's tab bar/default-tab only recomputes via a private loadTabPermissions()
	// we can't call directly, but it's wired to a $watch on $root.selectedWorkstation (game.min.js:54825).
	// Forcing that reference to change (null, then back) across two real digests re-triggers it, so
	// the panel switches itself onto the correct tab exactly as if the player closed and reopened it.
	rootScope.$applyAsync(() => {
		rootScope.selectedWorkstation = null;
	});
	setTimeout(() => {
		rootScope.$apply(() => {
			rootScope.selectedWorkstation = ws;
		});
	}, 50);
}

// The built-in "Change role" panel (templates/workstation/changeSkill.html) is a shipped game
// asset we don't edit. Instead, watch the DOM for it and inject our own tile at runtime whenever
// it's open, entirely from mod code.
function refreshLeadDeveloperTile() {
	const rootScope = GetRootScope();
	if (null == rootScope || null == rootScope.settings || null == rootScope.settings.ceo) return;

	const container = document.querySelector(".employee-types.justify-content-center");
	if (null == container) return;

	const existing = container.querySelector(".Bg-LeadDeveloper");

	if (rootScope.settings.ceo.backstory != Enums.EmployeeTypeNames.Developer) {
		if (existing) existing.remove();
		return;
	}

	let tile = existing;
	if (null == tile) {
		tile = document.createElement("div");
		tile.className = "Bg-LeadDeveloper";
		tile.innerHTML = '<h2>Lead Developer</h2><i class="fa fa-code"></i><div class="description">Toggle the CEO between Developer and Lead Developer.</div>';
		tile.addEventListener("mousedown", () => toggleCeoRole(rootScope));
		container.appendChild(tile);
	}

	const ws = getCeoWorkstation(rootScope.settings);
	tile.classList.toggle("active", null != ws && ws.employee.skill == Enums.EmployeeTypeNames.LeadDeveloper);
}

function scheduleRefresh() {
	if (_refreshPending) return;
	_refreshPending = true;
	setTimeout(() => {
		_refreshPending = false;
		refreshLeadDeveloperTile();
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
