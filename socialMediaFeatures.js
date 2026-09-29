// The Social Media Website product type ships without the Profile Page and Video Functionality features, even
// though both are fully defined in the base game (FeatureNames.ProfilePage / FeatureNames.VideoFunctionality
// already have research tree entries and requirement definitions - Dating Platform and Gaming Platform already
// list both). This mod adds them to Social Media's feature list so they can be researched and built there too.
const SOCIAL_MEDIA_FEATURES_TO_ADD = [FeatureNames.ProfilePage, FeatureNames.VideoFunctionality];

// ProductTypes is a static config array read directly by the feature-selection UI, so mutating it once here is
// enough for new and existing saves alike (mirrors how headquarterFloor.js patches the shared Buildings array).
function addSocialMediaFeatures() {
	const socialMedia = ProductTypes.find(productType => productType.name == ProductTypeNames.SocialMedia);
	if (!socialMedia) return;

	for (const featureName of SOCIAL_MEDIA_FEATURES_TO_ADD) {
		if (!socialMedia.features.includes(featureName)) socialMedia.features.push(featureName);
	}
}
addSocialMediaFeatures();
