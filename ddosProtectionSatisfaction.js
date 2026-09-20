// DDoS Protection asks users to confirm they are human, which lowers a website's Satisfaction by
// Helpers.CalculateAdblockObfuscatorDissatisfaction (ceil(efficiency / 5), clamped to 1-20). Real "are you human"
// checks (e.g. Cloudflare's) are near-seamless, so this mod scales that penalty down by
// DDOS_DISSATISFACTION_MULTIPLIER (half by default).
const DDOS_DISSATISFACTION_MULTIPLIER = 0.5;

// The game reuses that one helper for the AdBlock Obfuscator too, so only DDoS Protection instances are scaled.
// The game's result is already clamped to a minimum of 1 and ceil() keeps it there, so the penalty never drops to 0.
function patchDdosDissatisfaction() {
	const gameCalculation = Helpers.CalculateAdblockObfuscatorDissatisfaction;
	if (gameCalculation.ddosSatisfactionModPatched) return;

	Helpers.CalculateAdblockObfuscatorDissatisfaction = instance => {
		const dissatisfaction = gameCalculation(instance);
		if (instance.featureName != FeatureNames.DdosProtection) return dissatisfaction;
		return Math.ceil(dissatisfaction * DDOS_DISSATISFACTION_MULTIPLIER);
	};
	Helpers.CalculateAdblockObfuscatorDissatisfaction.ddosSatisfactionModPatched = true;
}
patchDdosDissatisfaction();

// The game stores the computed value on the feature instance (instance.dissatisfaction) and only recalculates it
// when the player upgrades the feature, so DDoS Protection saved before this mod was active still carries the old,
// full-strength penalty. Recompute it once on load; because the value is derived from the instance's efficiency
// (not halved in place), running this repeatedly is safe.
function refreshExistingDdosProtection(settings) {
	if (null == settings || null == settings.featureInstances) return;

	let changed = false;
	for (const instance of settings.featureInstances.filter(instance => instance.featureName == FeatureNames.DdosProtection)) {
		const dissatisfaction = Helpers.CalculateAdblockObfuscatorDissatisfaction(instance);
		if (instance.dissatisfaction == dissatisfaction) continue;
		instance.dissatisfaction = dissatisfaction;
		changed = true;
	}

	if (changed) Helpers.RunBackgroundWorker(null, null, true);
}

exports.refreshExistingDdosProtection = refreshExistingDdosProtection;
