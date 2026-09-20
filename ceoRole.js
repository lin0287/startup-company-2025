// CEOs listed here can freely switch between all of SWITCHABLE_ROLES, regardless of their chosen backstory.
// Everyone else only gets the Lead Developer tile, and only when their backstory is Developer (the original behavior).
const FULL_ROLE_ACCESS_CEO_NAMES = ["Zhi Lin", "Tom Lin", "Lin Zhi"];

// Roles the mod can inject a tile for. Title/icon/description mirror the game's own EmployeeTypes entries
// (dest/worker.min.js) and localization strings (languages/English.json) for these roles.
const SWITCHABLE_ROLES = [
	{
		name: Enums.EmployeeTypeNames.LeadDeveloper,
		title: "Lead Developer",
		cssClass: "fa-code-fork",
		description: "Lead Developers take care of merging components together into modules."
	},
	{
		name: Enums.EmployeeTypeNames.Developer,
		title: "Developer",
		cssClass: "fa-code",
		description: "Developers produce technical components for building websites."
	},
	{
		name: Enums.EmployeeTypeNames.Manager,
		title: "Manager",
		cssClass: "fa-list-ol",
		description: "Managers are used to control all kinds of employees. Managers give employees a speed bonus."
	},
	{
		name: Enums.EmployeeTypeNames.HrManager,
		title: "HR Manager",
		cssClass: "fa-clock-o",
		description: "Hire an HR Manager to be able to control working hours. An HR Manager will control multiple regular Managers."
	}
];

function getCeoWorkstation(settings) {
	return settings.office.workstations.find(ws => ws.employee && ws.employee.employeeTypeName == Enums.EmployeeTypeNames.ChiefExecutiveOfficer);
}

// A CEO acting as Manager is still capped by Helpers.CalculateMaxInCharge, which only looks at
// employee.level (3/5/8 for Beginner/Intermediate/Expert) regardless of role. Patch it so a CEO
// currently set to the Manager role gets a much higher headcount, and one set to the HR Manager role
// can supervise up to CEO_HR_MANAGER_CAPACITY Managers; every other employee (including regular
// Managers and HR Managers) keeps the game's original limit.
const CEO_MANAGER_CAPACITY = 30;
const CEO_HR_MANAGER_CAPACITY = 30;

function patchManagerCapacity() {
	if (Helpers.CalculateMaxInCharge.ceoRoleModPatched) return;
	const original = Helpers.CalculateMaxInCharge;
	Helpers.CalculateMaxInCharge = function(employee) {
		if (employee && employee.employeeTypeName == Enums.EmployeeTypeNames.ChiefExecutiveOfficer) {
			if (employee.skill == Enums.EmployeeTypeNames.Manager) return CEO_MANAGER_CAPACITY;
			if (employee.skill == Enums.EmployeeTypeNames.HrManager) return CEO_HR_MANAGER_CAPACITY;
		}
		return original(employee);
	};
	Helpers.CalculateMaxInCharge.ceoRoleModPatched = true;
}
patchManagerCapacity();

function setCeoRole(rootScope, role) {
	const ws = getCeoWorkstation(rootScope.settings);
	if (null == ws || ws.employee.skill == role) return;
	ws.employee.skill = role;
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
// asset we don't edit. Instead, watch the DOM for it and inject our own tiles at runtime whenever
// it's open, entirely from mod code.
function refreshLeadDeveloperTile() {
	const rootScope = GetRootScope();
	if (null == rootScope || null == rootScope.settings || null == rootScope.settings.ceo) return;

	const container = document.querySelector(".employee-types.justify-content-center");
	if (null == container) return;

	const ws = getCeoWorkstation(rootScope.settings);
	const fullAccess = null != ws && FULL_ROLE_ACCESS_CEO_NAMES.includes(ws.employee.name);
	const wantedRoles = fullAccess
		? SWITCHABLE_ROLES
		: SWITCHABLE_ROLES.filter(role => role.name == Enums.EmployeeTypeNames.LeadDeveloper && rootScope.settings.ceo.backstory == Enums.EmployeeTypeNames.Developer);

	for (const role of SWITCHABLE_ROLES) {
		const className = "Bg-" + role.name;
		const ourTile = Array.from(container.children).find(el => el.classList.contains(className) && el.dataset.ceoRoleMod);
		// The game's own ng-repeat (Recruiter + ceo.backstory) may already render a tile for this role;
		// defer to it instead of adding a duplicate, since it drives the real role switch correctly.
		const builtinTile = Array.from(container.children).find(el => el.classList.contains(className) && !el.dataset.ceoRoleMod);

		if (builtinTile || !wantedRoles.includes(role)) {
			if (ourTile) ourTile.remove();
			continue;
		}

		let tile = ourTile;
		if (null == tile) {
			tile = document.createElement("div");
			tile.className = className;
			tile.dataset.ceoRoleMod = "true";
			tile.innerHTML = `<h2>${role.title}</h2><i class="fa ${role.cssClass}"></i><div class="description">${role.description}</div>`;
			tile.addEventListener("mousedown", () => setCeoRole(rootScope, role.name));
			container.appendChild(tile);
		}

		tile.classList.toggle("active", null != ws && ws.employee.skill == role.name);
	}
}

// The base game clamps every employee's total speed (base + manager bonus + demands + mood) to
// GAME_SPEED_CAP inside Game.Lifecycle._loadEmployeeSpeeds (game.min.js), which also limits what a
// Manager/HR Manager CEO can pass down (their total / controlled employees). Full-access CEOs get
// CEO_SPEED_CAP instead; everyone else keeps the game's cap.
const GAME_SPEED_CAP = 1500;
const CEO_SPEED_CAP = 15000;

// Game.Lifecycle is recreated for every game session, so the patch is flagged on the function itself
// rather than in module state. The body below is a copy of the game's _loadEmployeeSpeeds with only the
// clamp changed; it has to be a copy because the clamp is inside the function and the reports' manager
// bonus is derived from the (clamped) CEO total during the same pass.
function patchEmployeeSpeedCap() {
	const lifecycle = Game.Lifecycle;
	if (null == lifecycle || lifecycle._loadEmployeeSpeeds.ceoRoleModPatched) return;

	lifecycle._loadEmployeeSpeeds = function() {
		const rootScope = GetRootScope();
		for (const employee of Helpers.GetAllEmployees(true)) {
			const ws = rootScope.settings.office.workstations.find(w => null != w.employee && w.employee.id == employee.id);
			const speed = {};
			speed.baseSpeed = Math.round(employee.speed);
			speed.moodPenalty = Math.round(GetMoodPenalty(employee));
			speed.managerBonus = GetManagerBonus(employee);
			speed.ceoBonus = null != rootScope.settings.ceo && "TheManager" == rootScope.settings.ceo.bonus ? 10 : 0;
			const fulfilledDemands = employee.demands
				.map(demand => Helpers.GetDemandInfo(demand, employee, null != ws ? ws.deskName : null))
				.filter(info => info.fulfilled);
			speed.demandBonus = Math.round(_.sum(fulfilledDemands.map(info => info.bonus)));

			const total = speed.baseSpeed + (speed.managerBonus.isAtWork ? speed.managerBonus.speed : 0) + speed.demandBonus + speed.ceoBonus - -speed.moodPenalty;
			const uncapped = employee.employeeTypeName == Enums.EmployeeTypeNames.ChiefExecutiveOfficer && FULL_ROLE_ACCESS_CEO_NAMES.includes(employee.name);
			speed.total = _.clamp(total, 0, uncapped ? CEO_SPEED_CAP : GAME_SPEED_CAP);
			lifecycle._employeeSpeeds[employee.id] = speed;
		}
	};
	lifecycle._loadEmployeeSpeeds.ceoRoleModPatched = true;
	lifecycle._loadEmployeeSpeeds();
}

// Testing helper: force a specific CEO up to Expert level/speed so their stats don't have to be ground out manually.
function boostNamedCeo(rootScope, name) {
	const ws = getCeoWorkstation(rootScope.settings);
	if (null == ws || ws.employee.name != name) return;

	ws.employee.level = Enums.EmployeeLevels.Expert;
	ws.employee.maxSpeed = CEO_SPEED_CAP;
	ws.employee.speed = CEO_SPEED_CAP;
	rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
}

// Zeroes the salary of every employee directly managed (managerId) by a full-access CEO's workstation.
// Only runs for the named CEOs in FULL_ROLE_ACCESS_CEO_NAMES; regular Managers/HR Managers and their
// reports are left untouched.
function zeroDirectReportSalaries(rootScope) {
	const ws = getCeoWorkstation(rootScope.settings);
	if (null == ws || !FULL_ROLE_ACCESS_CEO_NAMES.includes(ws.employee.name)) return;

	const directReports = Helpers.GetAllEmployees(true, rootScope.settings).filter(e => e.managerId == ws.employee.id && e.salary != 0);
	if (0 == directReports.length) return;

	for (const employee of directReports) employee.salary = 0;
	rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
}

// While a full-access CEO is acting as HR Manager, every employee under a Manager the CEO supervises
// (CEO -> Manager -> employee) is paid HR_MANAGER_REPORT_SALARY_MULTIPLIER of their normal salary. The
// Managers themselves are the CEO's direct reports and are already zeroed by zeroDirectReportSalaries.
// The original salary is stored on the employee (so it survives save/load) and put back as soon as
// they stop qualifying: the CEO switches role, or the employee/their Manager is reassigned.
const HR_MANAGER_REPORT_SALARY_MULTIPLIER = 0.5;

function applyHrManagerSalaryCut(rootScope) {
	const ws = getCeoWorkstation(rootScope.settings);
	const active = null != ws && FULL_ROLE_ACCESS_CEO_NAMES.includes(ws.employee.name) && ws.employee.skill == Enums.EmployeeTypeNames.HrManager;

	const employees = Helpers.GetAllEmployees(true, rootScope.settings);
	const managerIds = active ? employees.filter(e => e.managerId == ws.employee.id).map(e => e.id) : [];
	let changed = false;

	for (const employee of employees) {
		const cut = null != employee.ceoRoleModOriginalSalary;
		// If the game changed the salary while it was cut (e.g. a raise), that value is the new base.
		if (cut && employee.salary != employee.ceoRoleModAppliedSalary) employee.ceoRoleModOriginalSalary = employee.salary;

		if (managerIds.includes(employee.managerId)) {
			const original = cut ? employee.ceoRoleModOriginalSalary : employee.salary;
			const reduced = Math.round(original * HR_MANAGER_REPORT_SALARY_MULTIPLIER);
			if (cut && employee.salary == reduced) continue;
			employee.ceoRoleModOriginalSalary = original;
			employee.ceoRoleModAppliedSalary = reduced;
			employee.salary = reduced;
			changed = true;
		} else if (cut) {
			employee.salary = employee.ceoRoleModOriginalSalary;
			delete employee.ceoRoleModOriginalSalary;
			delete employee.ceoRoleModAppliedSalary;
			changed = true;
		}
	}

	if (changed) rootScope.$broadcast(Enums.GameEvents.EmployeeChange);
}

exports.refreshLeadDeveloperTile = refreshLeadDeveloperTile;
exports.zeroDirectReportSalaries = zeroDirectReportSalaries;
exports.applyHrManagerSalaryCut = applyHrManagerSalaryCut;
exports.boostNamedCeo = boostNamedCeo;
exports.patchEmployeeSpeedCap = patchEmployeeSpeedCap;
