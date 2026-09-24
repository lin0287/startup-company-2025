// Adds "HR Director" as a real hireable employee type who supervises multiple HR Managers,
// the same way an HR Manager supervises multiple Managers. Mods run require()'d directly into
// the same JS realm dest/game.min.js declared its globals in (see start.js), so the type is
// registered by mutating the game's own already-loaded Enums/EmployeeTypes/ResearchItems/
// Database data - the recruitment panel is entirely data-driven off those, so it needs no
// further changes. The workstation panel isn't data-driven though: workstationEmployee's tab
// routing and workstationHrManager's team-management panel both hardcode Enums.EmployeeTypeNames
// checks inside per-instance Angular directive controllers, so those two are monkeypatched via
// the Angular injector (the same "call/duplicate original, then branch on type" style ceoRole.js
// already uses for Helpers.CalculateMaxInCharge and Game.Lifecycle._loadEmployeeSpeeds).
const HR_DIRECTOR = "HrDirector";

// Run once at require() time: only touches plain data (Enums/EmployeeTypes/ResearchItems/
// Database), none of which needs a live game session or Angular to be bootstrapped yet.
function registerHrDirectorType() {
	if (Enums.EmployeeTypeNames.HrDirector) return;
	Enums.EmployeeTypeNames.HrDirector = HR_DIRECTOR;

	EmployeeTypes.push({
		name: HR_DIRECTOR,
		group: Enums.EmployeeTypeGroups.Management,
		description: "hrdirector_description",
		cssClass: "fa-briefcase"
	});

	// HumanResource research items are a flat list (no prerequisite/tree-position fields), so
	// there's no native way to make this depend on HrManager's own entry. grantHrDirectorResearch
	// below enforces that dependency itself once a save is loaded.
	ResearchItems.push({
		name: HR_DIRECTOR,
		category: ResearchCategories.HumanResource,
		points: 1600,
		faIcon: "fa-briefcase"
	});

	Database.items.executiveDesk.suitableEmployeeTypes.push(HR_DIRECTOR);

	const style = document.createElement("style");
	style.textContent = `icon.${HR_DIRECTOR}:before,component div.${HR_DIRECTOR}:before{content:"\\f0b1";color:#f0a35a;display:inline-block;font-family:FontAwesome}`;
	document.head.appendChild(style);
}
registerHrDirectorType();

// Helpers.GetSchedule (game.min.js:43708) is what everything else - Game.Lifecycle._loadEmployeeSchedules,
// productivity/exhaustion display, etc. - calls to resolve an employee's *effective* working hours. It
// hardcodes a fixed 2-hop walk (worker -> manager -> HrManager) that predates HR Director existing, so a
// Manager whose HR Manager now reports to an HR Director would silently inherit the HR Director's schedule
// with no way to see or change that. This patch makes that inheritance explicit and overridable: an HR
// Manager follows their HR Director's schedule by default, unless employee.hrDirectorScheduleOverride is
// set (via the toggle refreshScheduleOverrideToggle injects below), in which case they use their own.
// Unlike the two directive controllers above, GetSchedule is a plain property on the shared Helpers
// object, so it can be reassigned directly the same way ceoRole.js patches Helpers.CalculateMaxInCharge.
function isScheduleSuperior(employee) {
	if (null == employee) return false;
	if (employee.employeeTypeName == Enums.EmployeeTypeNames.ChiefExecutiveOfficer) return true;
	const effectiveType = employee.skill || employee.employeeTypeName;
	return effectiveType == Enums.EmployeeTypeNames.HrManager || effectiveType == Enums.EmployeeTypeNames.HrDirector;
}

function getManagerialSchedule(employee) {
	const effectiveType = employee.skill || employee.employeeTypeName;
	if (effectiveType == Enums.EmployeeTypeNames.HrManager && !employee.hrDirectorScheduleOverride) {
		const managerWs = GetManagerWorkstationByEmployeeId(employee.id);
		if (null != managerWs && isScheduleSuperior(managerWs.employee)) return managerWs.employee.schedule;
	}
	return employee.schedule;
}

function patchGetSchedule() {
	if (Helpers.GetSchedule.hrDirectorModPatched) return;
	Helpers.GetSchedule = employee => {
		const effectiveType = employee.skill || employee.employeeTypeName;
		if (effectiveType == Enums.EmployeeTypeNames.HrManager) return getManagerialSchedule(employee);
		if (effectiveType == Enums.EmployeeTypeNames.HrDirector) return employee.schedule;

		// worker or Manager: walk up the managerId chain (rather than the original's fixed 2 hops) until
		// a schedule-setting ancestor - or none - is found, so it keeps working regardless of how many
		// tiers (Manager tiers don't set their own schedule) sit between the employee and their HR Manager/
		// HR Director.
		let ws = GetManagerWorkstationByEmployeeId(employee.id);
		for (let hops = 0; null != ws && hops < 5; hops++) {
			if (isScheduleSuperior(ws.employee)) return getManagerialSchedule(ws.employee);
			ws = GetManagerWorkstationByEmployeeId(ws.employee.id);
		}
		return employee.schedule;
	};
	Helpers.GetSchedule.hrDirectorModPatched = true;
}
patchGetSchedule();

// Language is reassigned by the game's own language-loading routine at some point after mods are
// require()'d, so (unlike the data above) this has to run per-refresh rather than at require() time.
function refreshLanguageStrings() {
	if (typeof Language == "undefined" || Language.hrdirector) return;
	Language.hrdirector = "HR Director";
	Language.hrdirector_description = "Hire an HR Director to supervise multiple HR Managers, extending their working-hours control to every Manager underneath them.";
	if (typeof EnglishLanguage != "undefined") {
		EnglishLanguage.hrdirector = Language.hrdirector;
		EnglishLanguage.hrdirector_description = Language.hrdirector_description;
	}
}

// The recruitment panel only offers employee types present in settings.researchedItems, so this
// is what actually gates recruiting an HR Director behind having researched HR Manager first.
function grantHrDirectorResearch(rootScope) {
	const researched = rootScope.settings.researchedItems;
	if (researched.includes(Enums.EmployeeTypeNames.HrManager) && !researched.includes(HR_DIRECTOR)) {
		researched.push(HR_DIRECTOR);
		rootScope.$broadcast(Enums.GameEvents.ResearchChange);
	}
}

// workstationEmployee's controller hardcodes tab visibility per employeeTypeName and falls
// through to the generic "stats" tab for anything it doesn't recognize. Wrap it so an HR
// Director's workstation gets the same "hrmanager" tab a real HR Manager gets.
function patchWorkstationEmployeeDirective() {
	const injector = angular.element(document.body).injector();
	if (null == injector) return;
	const directive = injector.get("workstationEmployeeDirective")[0];
	if (directive.controller.hrDirectorModPatched) return;

	const [dep1, dep2, dep3, originalFn] = directive.controller;
	function wrappedFn(rootScope, scope, timeout) {
		originalFn.call(this, rootScope, scope, timeout);
		const ctrl = this;
		const originalLoadTabPermissions = ctrl.loadTabPermissions;

		ctrl.loadTabPermissions = function() {
			// Run the original first so every permission it computes from the real employeeTypeName
			// (retirement, stats, training, scope.isManager/isHrManager, etc.) stays correct regardless
			// of skill - only hrmanager/schedule get added on top, never a full replacement.
			originalLoadTabPermissions();
			const employee = rootScope.selectedWorkstation && rootScope.selectedWorkstation.employee;
			const effectiveType = employee && (employee.skill || employee.employeeTypeName);
			if (effectiveType != HR_DIRECTOR) return;

			ctrl.tabPermissions.hrmanager = true;
			ctrl.tabPermissions.schedule = true;
			// original() already resolved ctrl.tab using the pre-patch permissions (where hrmanager/
			// schedule were false), so it needs re-resolving now that those are open - otherwise a fresh
			// HR Director selection would default to the generic "stats" tab instead of the team panel.
			ctrl.tab = rootScope.workstationTab;
			if (1 != ctrl.tabPermissions[ctrl.tab]) {
				ctrl.tab = 1 == ctrl.tabPermissions[employee.lastTab] ? employee.lastTab : "hrmanager";
			}
			rootScope.workstationTab && (rootScope.workstationTab = null);
			scope.$broadcast(Enums.GameEvents.EmployeeChange);
		};
	}
	directive.controller = [dep1, dep2, dep3, wrappedFn];
	directive.controller.hrDirectorModPatched = true;
}

// workstationHrManager's controller hardcodes the pool it supervises to Enums.EmployeeTypeNames.
// Manager. There's no shared function to monkeypatch (it's a per-instance directive controller),
// so for the HrDirector case this duplicates that controller's logic with Manager swapped for
// HrManager; every other employee still gets the original, untouched.
function patchWorkstationHrManagerDirective() {
	const injector = angular.element(document.body).injector();
	if (null == injector) return;
	const directive = injector.get("workstationHrManagerDirective")[0];
	if (directive.controller.hrDirectorModPatched) return;

	const [dep1, dep2, originalFn] = directive.controller;
	function wrappedFn(rootScope, scope) {
		const employee = rootScope.selectedWorkstation.employee;
		const effectiveType = employee.skill || employee.employeeTypeName;
		if (effectiveType != HR_DIRECTOR) return originalFn.call(this, rootScope, scope);

		const ctrl = this;
		const recompute = () => {
			ctrl.maxInCharge = Helpers.CalculateMaxInCharge(rootScope.selectedWorkstation.employee);
			const all = Helpers.GetAllEmployees(false);
			ctrl.availableManagers = all.filter(e => (e.skill || e.employeeTypeName) == Enums.EmployeeTypeNames.HrManager && (null == e.managerId || e.managerId == rootScope.selectedWorkstation.employee.id));
			ctrl.controlledEmployees = ctrl.availableManagers.filter(e => e.managerId == rootScope.selectedWorkstation.employee.id);
			rootScope.selectedWorkstation.employee.numberOfControlledEmployees = ctrl.controlledEmployees.length;
			const controlledIds = ctrl.controlledEmployees.map(e => e.id);
			ctrl.affectedEmployees = [...all.filter(e => controlledIds.includes(e.managerId)), ...ctrl.controlledEmployees];
			ctrl.bonusPerEmployee = Math.ceil(scope.$parent.ctrl.employeeProductivity / rootScope.selectedWorkstation.employee.numberOfControlledEmployees);
		};
		scope.$watch("selectedWorkstation", () => recompute(), true);

		ctrl.setEmployeeToManager = (target => {
			if (target.managerId == rootScope.selectedWorkstation.employee.id) {
				if (null != target.task) target.task.autoRepeat = false;
				target.managerId = null;
			} else if (ctrl.controlledEmployees.length < ctrl.maxInCharge) {
				target.managerId = rootScope.selectedWorkstation.employee.id;
			}
			recompute();
			rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
			Game.Lifecycle._loadEmployeeSpeeds();
		});
		ctrl.sendHome = ((target, days) => {
			Helpers.SendHome(target, days);
			rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
		});
		ctrl.sendEveryoneHome = (days => {
			rootScope.confirm("", Helpers.GetLocalized("confirm_send_everyone_home", { days }), () => {
				for (const e of ctrl.affectedEmployees) if (0 == (e.sendHomeDaysLeft || 0)) Helpers.SendHome(e, days);
				rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
			});
		});
		ctrl.showEmployee = (target => {
			const ws = rootScope.settings.office.workstations.find(w => null != w.employee && w.employee.id == target.id);
			rootScope.setWorkstation(ws);
		});
	}
	directive.controller = [dep1, dep2, wrappedFn];
	directive.controller.hrDirectorModPatched = true;
}

// templates/workstation/schedule.html (rendered by workstation-hr-manager-schedule, shared unmodified
// by both HR Managers and HR Directors) is a shipped game asset we don't edit, so - same DOM-watch-and-
// inject approach as ceoRole.js's tiles - this injects an "Override HR Director's Schedule" toggle next
// to the panel's existing "Allow Salary Raise" toggle whenever a qualifying HR Manager's schedule tab is
// open (one whose direct manager is an HR Director, or a CEO acting as one), and grays out the panel's own
// hour/day controls while override is off, since editing them has no effect on anyone until it's flipped on.
function refreshScheduleOverrideToggle() {
	const rootScope = GetRootScope();
	const employee = null != rootScope && null != rootScope.selectedWorkstation ? rootScope.selectedWorkstation.employee : null;
	const raiseHeading = document.querySelector('[localize="allow_salary_raise"]');
	const raiseToggleRow = null != raiseHeading ? raiseHeading.closest(".flex-row.flex4") : null;
	const workingHoursHeading = document.querySelector('[localize="working_hours"]');
	const workingHoursBlock = null != workingHoursHeading ? workingHoursHeading.closest(".flex3.padding") : null;
	const daysOffHeading = document.querySelector('[localize="days_off"]');
	const daysOffBlock = null != daysOffHeading ? daysOffHeading.closest(".flex3") : null;

	const managerWs = null != employee ? GetManagerWorkstationByEmployeeId(employee.id) : null;
	const applicable = null != employee
		&& (employee.skill || employee.employeeTypeName) == Enums.EmployeeTypeNames.HrManager
		&& null != managerWs && isScheduleSuperior(managerWs.employee)
		&& null != raiseToggleRow;

	let toggleRow = document.querySelector("[data-hr-director-schedule-toggle]");
	if (!applicable) {
		if (toggleRow) toggleRow.remove();
		if (workingHoursBlock) workingHoursBlock.classList.remove("disable-container");
		if (daysOffBlock) daysOffBlock.classList.remove("disable-container");
		return;
	}

	const description = `When off, this HR Manager's working hours below are ignored - they follow ${managerWs.employee.name}'s schedule instead.`;
	if (null == toggleRow) {
		toggleRow = document.createElement("div");
		toggleRow.className = "flex2 padding";
		toggleRow.dataset.hrDirectorScheduleToggle = "true";
		toggleRow.innerHTML = `<h4>Override HR Director's Schedule</h4><p>${description}</p><div class="toggle-switch"><span></span></div>`;
		toggleRow.querySelector(".toggle-switch").addEventListener("mousedown", () => {
			employee.hrDirectorScheduleOverride = !employee.hrDirectorScheduleOverride;
			Game.Lifecycle._loadEmployeeSchedules();
			rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
			refreshScheduleOverrideToggle();
		});
		raiseToggleRow.appendChild(toggleRow);
	} else {
		toggleRow.querySelector("p").textContent = description;
	}

	const overriding = !!employee.hrDirectorScheduleOverride;
	toggleRow.querySelector(".toggle-switch").classList.toggle("active", overriding);
	if (workingHoursBlock) workingHoursBlock.classList.toggle("disable-container", !overriding);
	if (daysOffBlock) daysOffBlock.classList.toggle("disable-container", !overriding);
}

function refreshWorkstationPanels() {
	refreshLanguageStrings();
	patchWorkstationEmployeeDirective();
	patchWorkstationHrManagerDirective();
	refreshScheduleOverrideToggle();
}

exports.refreshWorkstationPanels = refreshWorkstationPanels;
exports.grantHrDirectorResearch = grantHrDirectorResearch;
