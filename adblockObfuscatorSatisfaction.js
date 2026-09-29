// AdBlock Obfuscator makes ad-serving code harder for blocker extensions to pattern-match, which lowers a website's
// Satisfaction by Helpers.CalculateAdblockObfuscatorDissatisfaction (ceil(efficiency / 5), clamped to 1-20). Unlike
// DDoS Protection's "are you human" check (see ddosProtectionSatisfaction.js), this is a passive technical trick with
// no interstitial or interaction at all - the only real-world downside is that adblock users still see some ads, which
// is milder than DDoS Protection's already-discounted friction. This mod scales that penalty down by
// ADBLOCK_DISSATISFACTION_MULTIPLIER (a quarter by default, matching the Subscriptions discount).
const ADBLOCK_DISSATISFACTION_MULTIPLIER = 0.25;

// The game reuses that one helper for DDoS Protection too, so only AdBlock Obfuscator instances are scaled here.
// The game's result is already clamped to a minimum of 1 and ceil() keeps it there, so the penalty never drops to 0.
function patchAdblockDissatisfaction() {
	const gameCalculation = Helpers.CalculateAdblockObfuscatorDissatisfaction;
	if (gameCalculation.adblockSatisfactionModPatched) return;

	Helpers.CalculateAdblockObfuscatorDissatisfaction = instance => {
		const dissatisfaction = gameCalculation(instance);
		if (instance.featureName != FeatureNames.AdBlockObfuscator) return dissatisfaction;
		return Math.ceil(dissatisfaction * ADBLOCK_DISSATISFACTION_MULTIPLIER);
	};
	Helpers.CalculateAdblockObfuscatorDissatisfaction.adblockSatisfactionModPatched = true;
}
patchAdblockDissatisfaction();

// The game stores the computed value on the feature instance (instance.dissatisfaction) and only recalculates it
// when the player upgrades the feature, so AdBlock Obfuscator saved before this mod was active still carries the old,
// full-strength penalty. Recompute it once on load; because the value is derived from the instance's efficiency
// (not scaled in place), running this repeatedly is safe.
function refreshExistingAdblockObfuscator(settings) {
	if (null == settings || null == settings.featureInstances) return;

	let changed = false;
	for (const instance of settings.featureInstances.filter(instance => instance.featureName == FeatureNames.AdBlockObfuscator)) {
		const dissatisfaction = Helpers.CalculateAdblockObfuscatorDissatisfaction(instance);
		if (instance.dissatisfaction == dissatisfaction) continue;
		instance.dissatisfaction = dissatisfaction;
		changed = true;
	}

	if (changed) Helpers.RunBackgroundWorker(null, null, true);
}

exports.refreshExistingAdblockObfuscator = refreshExistingAdblockObfuscator;
