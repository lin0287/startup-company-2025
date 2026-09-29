// FastClouds' virtual server catalogue tops out at "Ultra" (ServerNames.LargeVirtualServer, 15,000 CU/day -
// see the ServerNames/Servers data in dest/game.min.js). This adds a "Mega" tier above it with 10x Ultra's CU.
//
// Requirements get a genuine economy-of-scale discount, grounded in the game's own (deprecated) cluster
// tiers: compared to Ultra, MediumVirtualCluster (the closest tier to our 10x by CU, at 12x) needs only 10x
// NetworkComponent/VirtualHardware/OperatingSystem (a 5/6 ratio). We reuse that same 5/6 ratio here.
// Firewall is the odd one out: it scales exactly linearly with CU through Small (4x/4x) and Medium (12x/12x),
// only picking up its own discount at Large (48x CU / 36x Firewall). Since Mega's 10x sits below that 12x
// point where Firewall is still linear in the base data, it stays linear here too - not an inconsistency,
// just the point on the curve before Firewall's own discount kicks in. pricePerDay, meanwhile, is exactly
// linear with CU in every base-game tier (always 0.06/CU/day, no bulk discount) - so on top of that we apply
// a deliberate extra discount to make the Mega tier a genuinely better $/CU deal, which the base game never
// offers at any tier.
//
// Mods run require()'d directly into the same JS realm dest/game.min.js declared its globals in (see
// start.js), so the tier is registered by mutating the game's own already-loaded ServerNames/Servers data -
// the hosting page (productHosting controller) is entirely data-driven off Servers, so it needs no further
// changes. hostingOverageBilling.js's own `Servers.find` call confirms these are shared globals read by both
// the main thread and the background worker (each with its own copy), so - like that mod's data patches -
// this needs to run both at require() time and via onBackgroundWorkerStart.

// Helpers.RunBackgroundWorker's data round-trips through the worker and overwrites settings.progress (and its
// CU totals) wholesale, and the game serializes onBackgroundWorkerStart with toString() and evals just that
// function's text in the worker - losing any outer module scope (see ddosCuOverhead.js/hostingOverageBilling.js/
// virtualCuLimit.js for the same constraint). So this must be a self-contained function, constants inside it,
// nothing from this module's scope - otherwise the worker's own copy of Servers never gets the Mega entry, and
// every worker-computed CU total (including what "Reset Peak CU" pulls back into the UI) silently excludes it.
function registerMegaVirtualServer() {
	const SCALE = 10;
	const COMPONENT_ECONOMY_OF_SCALE = 5 / 6;
	const LINEAR_REQUIREMENTS = ["Firewall"];
	const PRICE_DISCOUNT = 0.15;
	const MEGA_VIRTUAL_SERVER = "MegaVirtualServer";

	if (ServerNames.MegaVirtualServer) return;
	ServerNames.MegaVirtualServer = MEGA_VIRTUAL_SERVER;

	const ultra = Servers.find(s => s.name == ServerNames.LargeVirtualServer);
	const requirements = {};
	Object.keys(ultra.requirements).forEach(component => {
		const discount = LINEAR_REQUIREMENTS.includes(component) ? 1 : COMPONENT_ECONOMY_OF_SCALE;
		requirements[component] = Math.round(ultra.requirements[component] * SCALE * discount);
	});

	Servers.push({
		name: MEGA_VIRTUAL_SERVER,
		employeeLevel: ultra.employeeLevel,
		requirements,
		computeUnit: ultra.computeUnit * SCALE,
		pricePerDay: Math.round(ultra.pricePerDay * SCALE * (1 - PRICE_DISCOUNT))
	});
}
registerMegaVirtualServer();

exports.onBackgroundWorkerStart = registerMegaVirtualServer;

// Language is reassigned by the game's own language-loading routine at some point after mods are require()'d
// (see hrDirectorRole.js), so this has to run per-refresh rather than at require() time. GetLocalized
// lowercases the server's name to look up its string, hence "megavirtualserver".
exports.refreshLanguageStrings = () => {
	if (typeof Language == "undefined" || Language.megavirtualserver) return;
	Language.megavirtualserver = "FastClouds Mega® Cloud Server";
	if (typeof EnglishLanguage != "undefined") {
		EnglishLanguage.megavirtualserver = Language.megavirtualserver;
	}
};
