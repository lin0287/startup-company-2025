// FastClouds' virtual server catalogue tops out at "Ultra" (ServerNames.LargeVirtualServer, 15,000 CU/day -
// see the ServerNames/Servers data in dest/game.min.js). This adds a "Mega" tier above it with 10x Ultra's CU.
//
// Requirements get a genuine economy-of-scale discount, grounded in the game's own (deprecated) cluster
// tiers: compared to Ultra, MediumVirtualCluster (the closest tier to our 10x by CU, at 12x) needs only 10x
// NetworkComponent/VirtualHardware/OperatingSystem (a 5/6 ratio) while its Firewall requirement stays exactly
// proportional to CU. We reuse that same 5/6 ratio here. pricePerDay, on the other hand, is exactly linear
// with CU in every base-game tier (always 0.06/CU/day, no bulk discount) - so on top of that we apply a
// deliberate extra discount to make the Mega tier a genuinely better $/CU deal, which the base game never
// offers at any tier.
//
// Mods run require()'d directly into the same JS realm dest/game.min.js declared its globals in (see
// start.js), so the tier is registered by mutating the game's own already-loaded ServerNames/Servers data -
// the hosting page (productHosting controller) is entirely data-driven off Servers, so it needs no further
// changes. hostingOverageBilling.js's own `Servers.find` call confirms these are shared globals read by both
// the main thread and the background worker (each with its own copy), so - like that mod's data patches -
// this needs to run both at require() time and via onBackgroundWorkerStart.
const MEGA_VIRTUAL_SERVER = "MegaVirtualServer";
const SCALE = 10;
const COMPONENT_ECONOMY_OF_SCALE = 5 / 6;
const LINEAR_REQUIREMENTS = ["Firewall"];
const PRICE_DISCOUNT = 0.15;

function registerMegaVirtualServer() {
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
